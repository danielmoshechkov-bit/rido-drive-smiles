-- Phase B: kanoniczny, serwerowy model płatności i wartości.
--
-- Założenia bezpieczeństwa:
--   * klient wskazuje wyłącznie price_id; cena, waluta i benefit są snapshotem
--     aktywnego katalogu zarządzanego przez backend,
--   * webhook jest weryfikowany kryptograficznie w Edge Function na surowym
--     body, a poniższy RPC atomowo sprawdza snapshot i nadaje wartość raz,
--   * stare tabele sald pozostają czytelne dla zgodności UI, ale anon i
--     authenticated nie mogą ich modyfikować,
--   * billing_value_ledger jest append-only; historyczne salda dostają wpis
--     bazowy bez usuwania ani przepisywania dawnych danych.
--
-- Celowo NIE obsługujemy tutaj promocji ani płatności saldem portfela.
-- Obie funkcje pozostają fail-closed do czasu transakcyjnego modelu rezerwacji,
-- zwrotów i wygaśnięć wartości.

-- ---------------------------------------------------------------------------
-- 1. Bezpieczne kolumny zgodności w historycznej tabeli payments
-- ---------------------------------------------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS billing_price_id text,
  ADD COLUMN IF NOT EXISTS billing_amount_minor bigint,
  ADD COLUMN IF NOT EXISTS billing_idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS billing_correlation_id uuid,
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS benefit_type text,
  ADD COLUMN IF NOT EXISTS benefit_amount bigint;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_billing_amount_minor_positive,
  ADD CONSTRAINT payments_billing_amount_minor_positive
    CHECK (billing_amount_minor IS NULL OR billing_amount_minor > 0) NOT VALID,
  DROP CONSTRAINT IF EXISTS payments_benefit_amount_positive,
  ADD CONSTRAINT payments_benefit_amount_positive
    CHECK (benefit_amount IS NULL OR benefit_amount > 0) NOT VALID;

-- Historyczny CHECK nie znał pakietów sprawdzeń pojazdu. Rozszerzenie jest
-- addytywne i pozwala utrzymać mirror dla wszystkich typów z nowego katalogu.
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_product_type_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_product_type_check CHECK (product_type IN (
    'marketplace_purchase', 'ai_photo_package', 'sms_credits',
    'ai_credits', 'listing_featured', 'subscription', 'inpost_label',
    'vehicle_lookup_credits'
  )) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS payments_billing_actor_idempotency_uidx
  ON public.payments (user_id, billing_idempotency_key)
  WHERE billing_idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Katalog, zamówienia, eventy, salda i niezmienny ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_id text NOT NULL UNIQUE
    CHECK (length(price_id) BETWEEN 3 AND 160),
  legacy_credit_package_id uuid UNIQUE
    REFERENCES public.credit_packages(id) ON DELETE RESTRICT,
  product_type text NOT NULL CHECK (product_type IN (
    'sms_credits', 'ai_credits', 'ai_photo_package',
    'listing_featured', 'vehicle_lookup_credits'
  )),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR length(description) <= 500),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 9999999999),
  currency text NOT NULL DEFAULT 'PLN'
    CHECK (currency ~ '^[A-Z]{3}$'),
  benefit_type text NOT NULL CHECK (benefit_type IN (
    'sms', 'ai', 'ai_photo', 'listing_featured', 'vehicle_lookup'
  )),
  benefit_amount bigint NOT NULL CHECK (benefit_amount BETWEEN 1 AND 1000000000),
  beneficiary_scope text NOT NULL CHECK (beneficiary_scope IN (
    'user', 'service_provider'
  )),
  requires_product_ref boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  valid_from timestamptz,
  valid_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

COMMENT ON TABLE public.billing_products IS
  'Serwerowy katalog cen. Klient nie ustala kwoty, waluty ani benefitu.';

CREATE TABLE IF NOT EXISTS public.billing_payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  tenant_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES public.service_providers(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.billing_products(id) ON DELETE RESTRICT,
  price_id text NOT NULL CHECK (length(price_id) BETWEEN 3 AND 160),
  product_type text NOT NULL CHECK (product_type IN (
    'sms_credits', 'ai_credits', 'ai_photo_package',
    'listing_featured', 'vehicle_lookup_credits'
  )),
  product_ref_id uuid,
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 9999999999),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  benefit_type text NOT NULL CHECK (benefit_type IN (
    'sms', 'ai', 'ai_photo', 'listing_featured', 'vehicle_lookup'
  )),
  benefit_amount bigint NOT NULL CHECK (benefit_amount BETWEEN 1 AND 1000000000),
  beneficiary_type text NOT NULL CHECK (beneficiary_type IN (
    'user', 'service_provider'
  )),
  beneficiary_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'paid', 'failed', 'cancelled', 'refunded'
  )),
  gateway text NOT NULL DEFAULT 'przelewy24'
    CHECK (length(gateway) BETWEEN 1 AND 80),
  gateway_session_id text,
  gateway_transaction_id text,
  idempotency_key uuid NOT NULL,
  correlation_id uuid NOT NULL,
  benefit_granted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_user_id, idempotency_key)
);

COMMENT ON TABLE public.billing_payment_orders IS
  'Niezmienny snapshot produktu i ceny używany do rejestracji oraz weryfikacji płatności.';

CREATE UNIQUE INDEX IF NOT EXISTS billing_payment_orders_gateway_session_uidx
  ON public.billing_payment_orders (gateway, gateway_session_id)
  WHERE gateway_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS billing_payment_orders_gateway_transaction_uidx
  ON public.billing_payment_orders (gateway, gateway_transaction_id)
  WHERE gateway_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS billing_payment_orders_actor_status_idx
  ON public.billing_payment_orders (actor_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_payment_orders_tenant_idx
  ON public.billing_payment_orders (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_payment_events (
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  external_event_id text NOT NULL CHECK (length(external_event_id) BETWEEN 1 AND 255),
  -- Surowy identyfikator sesji z podpisanego eventu jest zachowywany nawet,
  -- gdy wskazane zamówienie nie istnieje; order_id ustawiamy po walidacji.
  session_id uuid NOT NULL,
  order_id uuid REFERENCES public.billing_payment_orders(id) ON DELETE RESTRICT,
  gateway_order_id text CHECK (gateway_order_id IS NULL OR length(gateway_order_id) <= 255),
  amount_minor bigint CHECK (amount_minor IS NULL OR amount_minor > 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed')),
  result_code text CHECK (result_code IS NULL OR length(result_code) <= 120),
  correlation_id uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (provider, external_event_id)
);

COMMENT ON TABLE public.billing_payment_events IS
  'Rejestr replay/idempotency webhooków płatniczych; nie przechowuje pełnego payloadu.';

CREATE UNIQUE INDEX IF NOT EXISTS billing_payment_events_gateway_order_uidx
  ON public.billing_payment_events (provider, gateway_order_id)
  WHERE gateway_order_id IS NOT NULL AND status = 'succeeded';
CREATE INDEX IF NOT EXISTS billing_payment_events_order_idx
  ON public.billing_payment_events (order_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_value_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  beneficiary_type text NOT NULL CHECK (beneficiary_type IN (
    'user', 'service_provider'
  )),
  beneficiary_id uuid NOT NULL,
  benefit_type text NOT NULL CHECK (benefit_type IN (
    'sms', 'ai', 'ai_photo', 'listing_featured', 'vehicle_lookup',
    'rido_ai', 'wallet_points', 'wallet_coins', 'wallet_pln_minor'
  )),
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_granted bigint NOT NULL DEFAULT 0 CHECK (total_granted >= 0),
  total_consumed bigint NOT NULL DEFAULT 0 CHECK (total_consumed >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beneficiary_type, beneficiary_id, benefit_type)
);

CREATE TABLE IF NOT EXISTS public.billing_value_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  beneficiary_type text NOT NULL CHECK (beneficiary_type IN (
    'user', 'service_provider'
  )),
  beneficiary_id uuid NOT NULL,
  benefit_type text NOT NULL CHECK (benefit_type IN (
    'sms', 'ai', 'ai_photo', 'listing_featured', 'vehicle_lookup',
    'rido_ai', 'wallet_points', 'wallet_coins', 'wallet_pln_minor'
  )),
  delta bigint NOT NULL CHECK (delta <> 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  entry_type text NOT NULL CHECK (entry_type IN (
    'baseline', 'payment_grant', 'admin_grant', 'consume', 'refund', 'adjustment'
  )),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  source_type text NOT NULL CHECK (length(source_type) BETWEEN 1 AND 80),
  source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 255),
  external_event_id text CHECK (external_event_id IS NULL OR length(external_event_id) <= 255),
  idempotency_key uuid NOT NULL,
  actor_id uuid,
  payment_order_id uuid REFERENCES public.billing_payment_orders(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beneficiary_type, beneficiary_id, benefit_type, idempotency_key)
);

COMMENT ON TABLE public.billing_value_ledger IS
  'Append-only historia każdej zmiany wartości; UPDATE i DELETE są blokowane triggerem.';

CREATE INDEX IF NOT EXISTS billing_value_ledger_beneficiary_idx
  ON public.billing_value_ledger (
    beneficiary_type, beneficiary_id, benefit_type, occurred_at DESC
  );
CREATE INDEX IF NOT EXISTS billing_value_ledger_tenant_idx
  ON public.billing_value_ledger (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS billing_value_ledger_payment_idx
  ON public.billing_value_ledger (payment_order_id)
  WHERE payment_order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. RLS i minimalne uprawnienia nowych obiektów
-- ---------------------------------------------------------------------------

ALTER TABLE public.billing_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payment_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_value_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_value_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_value_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_value_ledger FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.billing_products FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.billing_payment_orders FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.billing_payment_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.billing_value_balances FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.billing_value_ledger FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_products TO service_role;
GRANT SELECT ON TABLE public.billing_payment_orders TO service_role;
GRANT SELECT ON TABLE public.billing_payment_events TO service_role;
GRANT SELECT ON TABLE public.billing_value_balances TO service_role;
GRANT SELECT ON TABLE public.billing_value_ledger TO service_role;

DROP POLICY IF EXISTS billing_balances_own_read ON public.billing_value_balances;
CREATE POLICY billing_balances_own_read
  ON public.billing_value_balances FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (beneficiary_type = 'user' AND beneficiary_id = auth.uid())
    OR (
      beneficiary_type = 'service_provider'
      AND (
        (tenant_id IS NOT NULL AND (
          public.is_company_member(tenant_id)
          OR public.is_company_owner(tenant_id)
        ))
        OR (
          tenant_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.service_providers AS sp
            WHERE sp.id = beneficiary_id
              AND sp.company_id IS NULL
              AND sp.user_id = auth.uid()
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS billing_ledger_own_read ON public.billing_value_ledger;
CREATE POLICY billing_ledger_own_read
  ON public.billing_value_ledger FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (beneficiary_type = 'user' AND beneficiary_id = auth.uid())
    OR (
      beneficiary_type = 'service_provider'
      AND (
        (tenant_id IS NOT NULL AND (
          public.is_company_member(tenant_id)
          OR public.is_company_owner(tenant_id)
        ))
        OR (
          tenant_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.service_providers AS sp
            WHERE sp.id = beneficiary_id
              AND sp.company_id IS NULL
              AND sp.user_id = auth.uid()
          )
        )
      )
    )
  );

GRANT SELECT ON TABLE public.billing_value_balances TO authenticated;
GRANT SELECT ON TABLE public.billing_value_ledger TO authenticated;

-- Widoki świadomie ujawniają jedynie bezpieczne pola. Bazowe tabele katalogu
-- i zamówień nie są czytelne bezpośrednio przez klienta.
CREATE OR REPLACE VIEW public.billing_public_products
WITH (security_barrier = true)
AS
SELECT
  bp.price_id,
  bp.product_type,
  bp.name,
  bp.description,
  bp.amount_minor,
  bp.currency,
  bp.benefit_type,
  bp.benefit_amount,
  bp.requires_product_ref
FROM public.billing_products AS bp
WHERE bp.is_active = true
  AND (bp.valid_from IS NULL OR bp.valid_from <= now())
  AND (bp.valid_until IS NULL OR bp.valid_until > now());

REVOKE ALL ON TABLE public.billing_public_products FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.billing_public_products TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.billing_my_payment_orders
WITH (security_barrier = true)
AS
SELECT
  o.id,
  o.price_id,
  o.product_type,
  o.product_ref_id,
  o.description,
  o.amount_minor,
  o.currency,
  o.benefit_type,
  o.benefit_amount,
  o.status,
  o.correlation_id,
  o.created_at,
  o.updated_at
FROM public.billing_payment_orders AS o
WHERE o.actor_user_id = auth.uid();

REVOKE ALL ON TABLE public.billing_my_payment_orders FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.billing_my_payment_orders TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Seed kanonicznego katalogu z historycznych credit_packages
-- ---------------------------------------------------------------------------

INSERT INTO public.billing_products (
  price_id,
  legacy_credit_package_id,
  product_type,
  name,
  amount_minor,
  currency,
  benefit_type,
  benefit_amount,
  beneficiary_scope,
  requires_product_ref,
  is_active,
  metadata
)
SELECT
  'credit-package:' || cp.id::text,
  cp.id,
  CASE lower(trim(cp.credit_type))
    WHEN 'sms' THEN 'sms_credits'
    WHEN 'ai' THEN 'ai_credits'
    WHEN 'ai_photo' THEN 'ai_photo_package'
    WHEN 'listing_featured' THEN 'listing_featured'
    WHEN 'vehicle_lookup' THEN 'vehicle_lookup_credits'
  END,
  cp.name,
  round(cp.price * 100)::bigint,
  'PLN',
  lower(trim(cp.credit_type)),
  cp.credits_amount::bigint,
  CASE lower(trim(cp.credit_type))
    WHEN 'sms' THEN 'service_provider'
    ELSE 'user'
  END,
  lower(trim(cp.credit_type)) = 'listing_featured',
  -- ai_photo i listing_featured pozostają nieaktywne: obecni konsumenci nie
  -- posiadają odrębnego, zgodnego salda. Ich aktywacja przed migracją
  -- konsumentów przyznałaby wartość niewidoczną dla działającej funkcji.
  cp.is_active IS TRUE
    AND lower(trim(cp.credit_type)) IN ('sms', 'ai', 'vehicle_lookup'),
  jsonb_build_object('source', 'legacy_credit_packages')
FROM public.credit_packages AS cp
WHERE lower(trim(cp.credit_type)) IN (
    'sms', 'ai', 'ai_photo', 'listing_featured', 'vehicle_lookup'
  )
  AND cp.credits_amount > 0
  AND cp.price > 0
ON CONFLICT (price_id) DO UPDATE
SET legacy_credit_package_id = EXCLUDED.legacy_credit_package_id,
    product_type = EXCLUDED.product_type,
    name = EXCLUDED.name,
    amount_minor = EXCLUDED.amount_minor,
    currency = EXCLUDED.currency,
    benefit_type = EXCLUDED.benefit_type,
    benefit_amount = EXCLUDED.benefit_amount,
    beneficiary_scope = EXCLUDED.beneficiary_scope,
    requires_product_ref = EXCLUDED.requires_product_ref,
    is_active = EXCLUDED.is_active,
    metadata = EXCLUDED.metadata,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- 5. Bazowy snapshot istniejących sald bez zmiany danych legacy
-- ---------------------------------------------------------------------------

INSERT INTO public.billing_value_balances (
  beneficiary_type, beneficiary_id, benefit_type,
  balance, total_granted, total_consumed
)
SELECT 'user', uc.user_id, 'ai',
       greatest(coalesce(uc.credits_balance, 0), 0)::bigint,
       greatest(coalesce(uc.credits_balance, 0), 0)::bigint,
       0
FROM public.user_credits AS uc
WHERE uc.user_id IS NOT NULL
ON CONFLICT (beneficiary_type, beneficiary_id, benefit_type) DO NOTHING;

INSERT INTO public.billing_value_balances (
  beneficiary_type, beneficiary_id, benefit_type,
  balance, total_granted, total_consumed
)
SELECT 'user', auc.user_id, 'rido_ai',
       greatest(coalesce(auc.credits_balance, 0), 0)::bigint,
       greatest(coalesce(auc.credits_balance, 0), 0)::bigint,
       0
FROM public.ai_user_credits AS auc
ON CONFLICT (beneficiary_type, beneficiary_id, benefit_type) DO NOTHING;

INSERT INTO public.billing_value_balances (
  beneficiary_type, beneficiary_id, benefit_type,
  balance, total_granted, total_consumed
)
SELECT 'user', vlc.user_id, 'vehicle_lookup',
       greatest(coalesce(vlc.remaining_credits, 0), 0)::bigint,
       greatest(coalesce(vlc.remaining_credits, 0), 0)::bigint,
       0
FROM public.vehicle_lookup_credits AS vlc
ON CONFLICT (beneficiary_type, beneficiary_id, benefit_type) DO NOTHING;

INSERT INTO public.billing_value_balances (
  tenant_id, beneficiary_type, beneficiary_id, benefit_type,
  balance, total_granted, total_consumed
)
SELECT sp.company_id, 'service_provider', sp.id, 'sms',
       greatest(coalesce(sp.sms_balance, 0), 0)::bigint,
       greatest(coalesce(sp.sms_balance, 0), 0)::bigint,
       0
FROM public.service_providers AS sp
ON CONFLICT (beneficiary_type, beneficiary_id, benefit_type) DO NOTHING;

INSERT INTO public.billing_value_balances (
  beneficiary_type, beneficiary_id, benefit_type,
  balance, total_granted, total_consumed
)
SELECT 'user', uw.user_id, source.benefit_type, source.balance_value,
       source.balance_value, 0
FROM public.user_wallets AS uw
CROSS JOIN LATERAL (
  VALUES
    ('wallet_points'::text, greatest(coalesce(uw.balance, 0), 0)::bigint),
    ('wallet_coins'::text, greatest(coalesce(uw.coins_balance, 0), 0)::bigint),
    ('wallet_pln_minor'::text,
      greatest(round(coalesce(uw.pln_balance, 0) * 100), 0)::bigint)
) AS source(benefit_type, balance_value)
ON CONFLICT (beneficiary_type, beneficiary_id, benefit_type) DO NOTHING;

-- Każde niezerowe saldo początkowe ma jeden deterministyczny wpis bazowy.
INSERT INTO public.billing_value_ledger (
  tenant_id, beneficiary_type, beneficiary_id, benefit_type,
  delta, balance_after, entry_type, reason, source_type, source_id,
  idempotency_key, correlation_id, metadata
)
SELECT
  b.tenant_id,
  b.beneficiary_type,
  b.beneficiary_id,
  b.benefit_type,
  b.balance,
  b.balance,
  'baseline',
  'Saldo zastane przed uruchomieniem kanonicznego ledgeru Phase B',
  'migration_baseline',
  '20260801130000:' || b.beneficiary_type || ':' || b.beneficiary_id::text || ':' || b.benefit_type,
  (
    substr(md5('billing-baseline:' || b.beneficiary_type || ':' || b.beneficiary_id::text || ':' || b.benefit_type), 1, 8)
    || '-' || substr(md5('billing-baseline:' || b.beneficiary_type || ':' || b.beneficiary_id::text || ':' || b.benefit_type), 9, 4)
    || '-' || substr(md5('billing-baseline:' || b.beneficiary_type || ':' || b.beneficiary_id::text || ':' || b.benefit_type), 13, 4)
    || '-' || substr(md5('billing-baseline:' || b.beneficiary_type || ':' || b.beneficiary_id::text || ':' || b.benefit_type), 17, 4)
    || '-' || substr(md5('billing-baseline:' || b.beneficiary_type || ':' || b.beneficiary_id::text || ':' || b.benefit_type), 21, 12)
  )::uuid,
  (
    substr(md5('billing-baseline-correlation:' || b.beneficiary_type || ':' || b.beneficiary_id::text || ':' || b.benefit_type), 1, 8)
    || '-' || substr(md5('billing-baseline-correlation:' || b.beneficiary_type || ':' || b.beneficiary_id::text || ':' || b.benefit_type), 9, 4)
    || '-' || substr(md5('billing-baseline-correlation:' || b.beneficiary_type || ':' || b.beneficiary_id::text || ':' || b.benefit_type), 13, 4)
    || '-' || substr(md5('billing-baseline-correlation:' || b.beneficiary_type || ':' || b.beneficiary_id::text || ':' || b.benefit_type), 17, 4)
    || '-' || substr(md5('billing-baseline-correlation:' || b.beneficiary_type || ':' || b.beneficiary_id::text || ':' || b.benefit_type), 21, 12)
  )::uuid,
  jsonb_build_object('migration', '20260801130000_phase_b_billing_integrity')
FROM public.billing_value_balances AS b
WHERE b.balance > 0
ON CONFLICT (beneficiary_type, beneficiary_id, benefit_type, idempotency_key)
DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Niezmienność ledgeru i ochrona kolumny sms_balance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_reject_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'billing_ledger_is_append_only' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.billing_reject_ledger_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS billing_value_ledger_immutable
  ON public.billing_value_ledger;
CREATE TRIGGER billing_value_ledger_immutable
  BEFORE UPDATE OR DELETE ON public.billing_value_ledger
  FOR EACH ROW EXECUTE FUNCTION public.billing_reject_ledger_mutation();

CREATE OR REPLACE FUNCTION public.billing_protect_sms_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_canonical_balance bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.sms_balance IS NOT DISTINCT FROM OLD.sms_balance THEN
    RETURN NEW;
  END IF;

  SELECT balance
    INTO v_canonical_balance
  FROM public.billing_value_balances
  WHERE beneficiary_type = 'service_provider'
    AND beneficiary_id = NEW.id
    AND benefit_type = 'sms';

  -- Marker sesji byłby ustawialny także przez każdy inny kod używający
  -- service_role. Jedynym źródłem prawdy jest zatem zablokowany przed DML,
  -- niezmienny ledger i jego kanoniczny rekord salda.
  IF coalesce(NEW.sms_balance, 0) IS DISTINCT FROM coalesce(v_canonical_balance, 0) THEN
    RAISE EXCEPTION 'sms_balance_must_match_canonical_ledger'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_protect_sms_balance()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS billing_protect_sms_balance
  ON public.service_providers;
CREATE TRIGGER billing_protect_sms_balance
  BEFORE INSERT OR UPDATE ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.billing_protect_sms_balance();

-- ---------------------------------------------------------------------------
-- 7. Wewnętrzna, idempotentna operacja wartości
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_post_value_entry_internal(
  p_tenant_id uuid,
  p_beneficiary_type text,
  p_beneficiary_id uuid,
  p_benefit_type text,
  p_delta bigint,
  p_entry_type text,
  p_reason text,
  p_source_type text,
  p_source_id text,
  p_external_event_id text,
  p_idempotency_key uuid,
  p_actor_id uuid,
  p_payment_order_id uuid,
  p_correlation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_id uuid;
  v_old_balance bigint;
  v_new_balance bigint;
  v_balance_tenant_id uuid;
  v_entry public.billing_value_ledger%ROWTYPE;
  v_balance_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_beneficiary_id IS NULL OR p_idempotency_key IS NULL OR p_correlation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_value_target' USING ERRCODE = '22023';
  END IF;
  IF p_beneficiary_type NOT IN ('user', 'service_provider')
     OR p_benefit_type NOT IN (
       'sms', 'ai', 'ai_photo', 'listing_featured', 'vehicle_lookup',
       'rido_ai', 'wallet_points', 'wallet_coins', 'wallet_pln_minor'
     )
     OR p_entry_type NOT IN (
       'payment_grant', 'admin_grant', 'consume', 'refund', 'adjustment'
     ) THEN
    RAISE EXCEPTION 'invalid_value_type' USING ERRCODE = '22023';
  END IF;
  IF p_delta IS NULL OR p_delta = 0
     OR p_delta < -1000000000 OR p_delta > 1000000000 THEN
    RAISE EXCEPTION 'invalid_value_delta' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) NOT BETWEEN 1 AND 500
     OR length(trim(coalesce(p_source_type, ''))) NOT BETWEEN 1 AND 80
     OR length(trim(coalesce(p_source_id, ''))) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'invalid_value_metadata' USING ERRCODE = '22023';
  END IF;

  IF p_beneficiary_type = 'user' THEN
    IF p_tenant_id IS NOT NULL THEN
      RAISE EXCEPTION 'user_value_must_not_trust_tenant' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users AS au WHERE au.id = p_beneficiary_id) THEN
      RAISE EXCEPTION 'beneficiary_not_found' USING ERRCODE = 'P0002';
    END IF;
    v_tenant_id := NULL;
  ELSE
    SELECT sp.company_id INTO v_tenant_id
    FROM public.service_providers AS sp
    WHERE sp.id = p_beneficiary_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'beneficiary_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF p_tenant_id IS NOT NULL AND p_tenant_id IS DISTINCT FROM v_tenant_id THEN
      RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'billing-value:' || p_beneficiary_type || ':' || p_beneficiary_id::text
      || ':' || p_benefit_type || ':' || p_idempotency_key::text,
    0
  ));

  SELECT ledger.* INTO v_entry
  FROM public.billing_value_ledger AS ledger
  WHERE ledger.beneficiary_type = p_beneficiary_type
    AND ledger.beneficiary_id = p_beneficiary_id
    AND ledger.benefit_type = p_benefit_type
    AND ledger.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_entry.delta IS DISTINCT FROM p_delta
       OR v_entry.source_type IS DISTINCT FROM trim(p_source_type)
       OR v_entry.source_id IS DISTINCT FROM trim(p_source_id)
       OR v_entry.payment_order_id IS DISTINCT FROM p_payment_order_id THEN
      RAISE EXCEPTION 'value_idempotency_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'entry_id', v_entry.id,
      'balance_after', v_entry.balance_after,
      'idempotent_replay', true
    );
  END IF;

  INSERT INTO public.billing_value_balances (
    tenant_id, beneficiary_type, beneficiary_id, benefit_type,
    balance, total_granted, total_consumed
  ) VALUES (
    v_tenant_id, p_beneficiary_type, p_beneficiary_id, p_benefit_type,
    0, 0, 0
  )
  ON CONFLICT (beneficiary_type, beneficiary_id, benefit_type) DO NOTHING;

  SELECT b.id, b.balance, b.tenant_id
    INTO v_balance_id, v_old_balance, v_balance_tenant_id
  FROM public.billing_value_balances AS b
  WHERE b.beneficiary_type = p_beneficiary_type
    AND b.beneficiary_id = p_beneficiary_id
    AND b.benefit_type = p_benefit_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'value_balance_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Saldo i historia usługodawcy są przypisane do tenanta z chwili utworzenia.
  -- Zmiana service_providers.company_id nie może przenieść wartości ani
  -- ujawnić wcześniejszego ledgeru nowej firmie. Rebinding wymaga osobnego,
  -- audytowanego procesu migracji wartości.
  IF p_beneficiary_type = 'service_provider'
     AND v_balance_tenant_id IS DISTINCT FROM v_tenant_id THEN
    RAISE EXCEPTION 'provider_tenant_changed' USING ERRCODE = '42501';
  END IF;

  v_new_balance := v_old_balance + p_delta;
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'insufficient_value_balance' USING ERRCODE = '22003';
  END IF;

  UPDATE public.billing_value_balances
  SET balance = v_new_balance,
      total_granted = total_granted + greatest(p_delta, 0),
      total_consumed = total_consumed + greatest(-p_delta, 0),
      updated_at = now()
  WHERE id = v_balance_id;

  INSERT INTO public.billing_value_ledger (
    tenant_id, beneficiary_type, beneficiary_id, benefit_type,
    delta, balance_after, entry_type, reason, source_type, source_id,
    external_event_id, idempotency_key, actor_id, payment_order_id,
    correlation_id
  ) VALUES (
    v_tenant_id, p_beneficiary_type, p_beneficiary_id, p_benefit_type,
    p_delta, v_new_balance, p_entry_type, trim(p_reason), trim(p_source_type),
    trim(p_source_id), nullif(left(trim(p_external_event_id), 255), ''),
    p_idempotency_key, p_actor_id, p_payment_order_id, p_correlation_id
  )
  RETURNING * INTO v_entry;

  -- Warstwa zgodności dla obecnych odczytów. Rzeczywisty user_credits ma
  -- credits_balance + UNIQUE(user_id); nie posiada balance/credit_type.
  IF p_beneficiary_type = 'user' AND p_benefit_type = 'ai' THEN
    INSERT INTO public.user_credits (user_id, credits_balance)
    VALUES (p_beneficiary_id, v_new_balance::integer)
    ON CONFLICT (user_id) DO UPDATE
      SET credits_balance = EXCLUDED.credits_balance,
          updated_at = now();
  ELSIF p_beneficiary_type = 'user' AND p_benefit_type = 'rido_ai' THEN
    INSERT INTO public.ai_user_credits (user_id, credits_balance)
    VALUES (p_beneficiary_id, v_new_balance::integer)
    ON CONFLICT (user_id) DO UPDATE
      SET credits_balance = EXCLUDED.credits_balance,
          updated_at = now();
  ELSIF p_beneficiary_type = 'user' AND p_benefit_type = 'vehicle_lookup' THEN
    INSERT INTO public.vehicle_lookup_credits (
      user_id, remaining_credits, total_credits_purchased
    ) VALUES (
      p_beneficiary_id,
      v_new_balance::integer,
      greatest(p_delta, 0)::integer
    )
    ON CONFLICT (user_id) DO UPDATE
      SET remaining_credits = EXCLUDED.remaining_credits,
          total_credits_purchased =
            coalesce(public.vehicle_lookup_credits.total_credits_purchased, 0)
            + greatest(p_delta, 0)::integer,
          updated_at = now();
  ELSIF p_beneficiary_type = 'service_provider' AND p_benefit_type = 'sms' THEN
    -- Trigger zaakceptuje wyłącznie wartość równą kanonicznemu saldu, które
    -- zostało właśnie zmienione razem z wpisem w niezmiennym ledgerze.
    UPDATE public.service_providers
    SET sms_balance = v_new_balance::integer,
        updated_at = now()
    WHERE id = p_beneficiary_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'beneficiary_not_found' USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_beneficiary_type = 'user' AND p_benefit_type = 'wallet_points' THEN
    INSERT INTO public.user_wallets (user_id, balance)
    VALUES (p_beneficiary_id, v_new_balance::integer)
    ON CONFLICT (user_id) DO UPDATE
      SET balance = EXCLUDED.balance,
          updated_at = now();
  ELSIF p_beneficiary_type = 'user' AND p_benefit_type = 'wallet_coins' THEN
    INSERT INTO public.user_wallets (user_id, coins_balance)
    VALUES (p_beneficiary_id, v_new_balance::integer)
    ON CONFLICT (user_id) DO UPDATE
      SET coins_balance = EXCLUDED.coins_balance,
          updated_at = now();
  ELSIF p_beneficiary_type = 'user' AND p_benefit_type = 'wallet_pln_minor' THEN
    INSERT INTO public.user_wallets (user_id, pln_balance)
    VALUES (p_beneficiary_id, (v_new_balance::numeric / 100)::numeric(10,2))
    ON CONFLICT (user_id) DO UPDATE
      SET pln_balance = EXCLUDED.pln_balance,
          updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'entry_id', v_entry.id,
    'balance_after', v_new_balance,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.billing_post_value_entry_internal(
  uuid, text, uuid, text, bigint, text, text, text, text, text,
  uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Publiczne kontrakty RPC dla zaufanych Edge Functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_create_payment_order(
  p_actor_id uuid,
  p_price_id text,
  p_product_ref_id uuid,
  p_idempotency_key uuid,
  p_correlation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_product public.billing_products%ROWTYPE;
  v_existing public.billing_payment_orders%ROWTYPE;
  v_order_id uuid := gen_random_uuid();
  v_correlation_id uuid := p_correlation_id;
  v_provider_id uuid;
  v_tenant_id uuid;
  v_provider_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR p_idempotency_key IS NULL OR p_correlation_id IS NULL
     OR length(trim(coalesce(p_price_id, ''))) NOT BETWEEN 3 AND 160 THEN
    RAISE EXCEPTION 'invalid_payment_request' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users AS au WHERE au.id = p_actor_id) THEN
    RAISE EXCEPTION 'actor_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Serializuje limit i dwa równoległe użycia tego samego klucza przez aktora.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'billing-order-actor:' || p_actor_id::text,
    0
  ));

  SELECT o.* INTO v_existing
  FROM public.billing_payment_orders AS o
  WHERE o.actor_user_id = p_actor_id
    AND o.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.price_id IS DISTINCT FROM trim(p_price_id)
       OR v_existing.product_ref_id IS DISTINCT FROM p_product_ref_id THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'order_id', v_existing.id,
      'payment_id', v_existing.id,
      'status', v_existing.status,
      'price_id', v_existing.price_id,
      'product_type', v_existing.product_type,
      'amount_minor', v_existing.amount_minor,
      'currency', v_existing.currency,
      'description', v_existing.description,
      'benefit_type', v_existing.benefit_type,
      'benefit_amount', v_existing.benefit_amount,
      'tenant_id', v_existing.tenant_id,
      'provider_id', v_existing.provider_id,
      'idempotent_replay', true,
      'correlation_id', v_existing.correlation_id
    );
  END IF;

  IF (
    SELECT count(*)
    FROM public.billing_payment_orders AS recent
    WHERE recent.actor_user_id = p_actor_id
      AND recent.status = 'pending'
      AND recent.created_at >= now() - interval '10 minutes'
  ) >= 5 THEN
    RAISE EXCEPTION 'payment_order_rate_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  SELECT bp.* INTO v_product
  FROM public.billing_products AS bp
  WHERE bp.price_id = trim(p_price_id)
    AND bp.is_active = true
    AND bp.amount_minor > 0
    AND bp.benefit_amount > 0
    AND (bp.valid_from IS NULL OR bp.valid_from <= now())
    AND (bp.valid_until IS NULL OR bp.valid_until > now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'price_not_available' USING ERRCODE = '22023';
  END IF;
  IF v_product.requires_product_ref AND p_product_ref_id IS NULL THEN
    RAISE EXCEPTION 'price_not_available' USING ERRCODE = '22023';
  END IF;
  IF NOT v_product.requires_product_ref AND p_product_ref_id IS NOT NULL THEN
    RAISE EXCEPTION 'price_not_available' USING ERRCODE = '22023';
  END IF;

  IF v_product.beneficiary_scope = 'service_provider' THEN
    SELECT count(*)
      INTO v_provider_count
    FROM public.service_providers AS sp
    WHERE sp.user_id = p_actor_id
      AND coalesce(sp.status, '') IN ('active', 'verified');
    IF v_provider_count <> 1 THEN
      RAISE EXCEPTION 'billing_provider_not_unambiguous' USING ERRCODE = '42501';
    END IF;
    SELECT sp.id, sp.company_id
      INTO v_provider_id, v_tenant_id
    FROM public.service_providers AS sp
    WHERE sp.user_id = p_actor_id
      AND coalesce(sp.status, '') IN ('active', 'verified');
    IF v_tenant_id IS NOT NULL AND NOT (
      EXISTS (
        SELECT 1
        FROM public.company_members AS cm
        WHERE cm.company_id = v_tenant_id
          AND cm.user_id = p_actor_id
          AND coalesce(cm.status, 'active') = 'active'
      )
      OR EXISTS (
        SELECT 1
        FROM public.companies AS company
        WHERE company.id = v_tenant_id
          AND company.owner_user_id = p_actor_id
      )
    ) THEN
      RAISE EXCEPTION 'provider_tenant_membership_required' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_provider_id := NULL;
    v_tenant_id := NULL;
  END IF;

  INSERT INTO public.billing_payment_orders (
    id, actor_user_id, tenant_id, provider_id, product_id, price_id,
    product_type, product_ref_id, description, amount_minor, currency,
    benefit_type, benefit_amount, beneficiary_type, beneficiary_id,
    status, gateway, idempotency_key, correlation_id
  ) VALUES (
    v_order_id, p_actor_id, v_tenant_id, v_provider_id, v_product.id,
    v_product.price_id, v_product.product_type, p_product_ref_id,
    v_product.name, v_product.amount_minor, v_product.currency,
    v_product.benefit_type, v_product.benefit_amount,
    v_product.beneficiary_scope,
    CASE
      WHEN v_product.beneficiary_scope = 'service_provider' THEN v_provider_id
      ELSE p_actor_id
    END,
    'pending', 'przelewy24', p_idempotency_key, v_correlation_id
  );

  -- Mirror zapewnia zgodność PaymentSuccess i istniejących raportów.
  INSERT INTO public.payments (
    id, user_id, product_type, product_ref_id, amount, currency, status,
    gateway, description, metadata, billing_price_id, billing_amount_minor,
    billing_idempotency_key, billing_correlation_id, tenant_id,
    benefit_type, benefit_amount
  ) VALUES (
    v_order_id, p_actor_id, v_product.product_type, p_product_ref_id,
    (v_product.amount_minor::numeric / 100)::numeric(10,2),
    v_product.currency, 'pending', 'przelewy24', v_product.name,
    jsonb_build_object(
      'billing_version', 2,
      'price_id', v_product.price_id,
      'benefit_type', v_product.benefit_type,
      'benefit_amount', v_product.benefit_amount
    ),
    v_product.price_id, v_product.amount_minor, p_idempotency_key,
    v_correlation_id, v_tenant_id, v_product.benefit_type,
    v_product.benefit_amount
  );

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    p_actor_id, v_tenant_id, 'billing.payment_order_created',
    'billing_payment_order', v_order_id::text, 'succeeded',
    v_correlation_id,
    jsonb_build_object(
      'price_id', v_product.price_id,
      'amount_minor', v_product.amount_minor,
      'currency', v_product.currency,
      'provider_id', v_provider_id
    )
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'payment_id', v_order_id,
    'status', 'pending',
    'price_id', v_product.price_id,
    'product_type', v_product.product_type,
    'amount_minor', v_product.amount_minor,
    'currency', v_product.currency,
    'description', v_product.name,
    'benefit_type', v_product.benefit_type,
    'benefit_amount', v_product.benefit_amount,
    'tenant_id', v_tenant_id,
    'provider_id', v_provider_id,
    'idempotent_replay', false,
    'correlation_id', v_correlation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.billing_create_payment_order(uuid, text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_create_payment_order(uuid, text, uuid, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.billing_attach_gateway_session(
  p_actor_id uuid,
  p_payment_id uuid,
  p_gateway_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.billing_payment_orders%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR p_payment_id IS NULL
     OR length(trim(coalesce(p_gateway_session_id, ''))) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'invalid_gateway_session' USING ERRCODE = '22023';
  END IF;

  SELECT o.* INTO v_order
  FROM public.billing_payment_orders AS o
  WHERE o.id = p_payment_id
    AND o.actor_user_id = p_actor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending' USING ERRCODE = '55000';
  END IF;
  IF v_order.gateway_session_id IS NOT NULL
     AND v_order.gateway_session_id IS DISTINCT FROM trim(p_gateway_session_id) THEN
    RAISE EXCEPTION 'gateway_session_already_bound' USING ERRCODE = '23505';
  END IF;

  UPDATE public.billing_payment_orders
  SET gateway_session_id = trim(p_gateway_session_id),
      updated_at = now()
  WHERE id = p_payment_id;

  UPDATE public.payments
  SET gateway_session_id = trim(p_gateway_session_id),
      updated_at = now()
  WHERE id = p_payment_id;

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    p_actor_id, v_order.tenant_id, 'billing.gateway_session_attached',
    'billing_payment_order', p_payment_id::text, 'succeeded',
    v_order.correlation_id,
    jsonb_build_object('gateway', v_order.gateway)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'payment_id', p_payment_id,
    'gateway', v_order.gateway,
    'status', v_order.status,
    'idempotent_replay', v_order.gateway_session_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.billing_attach_gateway_session(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Pozostaje zdefiniowana, lecz niewykonywalna do czasu wdrożenia i testu
-- oficjalnego adaptera rejestracji operatora płatności.

CREATE OR REPLACE FUNCTION public.billing_apply_verified_payment(
  p_provider text,
  p_external_event_id text,
  p_session_id uuid,
  p_gateway_order_id text,
  p_amount_minor bigint,
  p_currency text,
  p_payload_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_external_event_id text := trim(coalesce(p_external_event_id, ''));
  v_gateway_order_id text := trim(coalesce(p_gateway_order_id, ''));
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_payload_hash text := lower(trim(coalesce(p_payload_hash, '')));
  v_correlation_id uuid := gen_random_uuid();
  v_event public.billing_payment_events%ROWTYPE;
  v_order public.billing_payment_orders%ROWTYPE;
  v_grant jsonb;
  v_inserted integer;
  v_sqlstate text;
  v_failure_code text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF length(v_provider) NOT BETWEEN 1 AND 80
     OR length(v_external_event_id) NOT BETWEEN 1 AND 255
     OR length(v_gateway_order_id) NOT BETWEEN 1 AND 255
     OR p_session_id IS NULL
     OR p_amount_minor IS NULL OR p_amount_minor <= 0
     OR v_currency !~ '^[A-Z]{3}$'
     OR v_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_verified_payment_event' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.billing_payment_events (
    provider, external_event_id, session_id, gateway_order_id,
    amount_minor, currency, payload_sha256, status, correlation_id
  ) VALUES (
    v_provider, v_external_event_id, p_session_id, v_gateway_order_id,
    p_amount_minor, v_currency, v_payload_hash, 'processing', v_correlation_id
  )
  ON CONFLICT (provider, external_event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT event.* INTO v_event
    FROM public.billing_payment_events AS event
    WHERE event.provider = v_provider
      AND event.external_event_id = v_external_event_id
    FOR UPDATE;

    IF v_event.session_id IS DISTINCT FROM p_session_id
       OR v_event.gateway_order_id IS DISTINCT FROM v_gateway_order_id
       OR v_event.amount_minor IS DISTINCT FROM p_amount_minor
       OR v_event.currency IS DISTINCT FROM v_currency
       OR v_event.payload_sha256 IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'payment_event_replay_mismatch' USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'ok', v_event.status = 'succeeded',
      'payment_id', v_event.session_id,
      'status', v_event.status,
      'result_code', v_event.result_code,
      'idempotent_replay', true,
      'correlation_id', v_event.correlation_id
    );
  END IF;

  BEGIN
    SELECT o.* INTO STRICT v_order
    FROM public.billing_payment_orders AS o
    WHERE o.id = p_session_id
    FOR UPDATE;

    IF lower(v_order.gateway) IS DISTINCT FROM v_provider THEN
      RAISE EXCEPTION 'payment_provider_mismatch' USING ERRCODE = '22023';
    END IF;
    IF v_order.amount_minor IS DISTINCT FROM p_amount_minor
       OR v_order.currency IS DISTINCT FROM v_currency THEN
      RAISE EXCEPTION 'payment_amount_mismatch' USING ERRCODE = '22023';
    END IF;
    IF v_order.status IN ('failed', 'cancelled', 'refunded') THEN
      RAISE EXCEPTION 'payment_status_not_payable' USING ERRCODE = '55000';
    END IF;

    IF v_order.status = 'paid' AND v_order.benefit_granted_at IS NOT NULL THEN
      UPDATE public.billing_payment_events
      SET order_id = v_order.id,
          status = 'succeeded',
          result_code = 'order_already_paid',
          completed_at = now()
      WHERE provider = v_provider
        AND external_event_id = v_external_event_id;
      RETURN jsonb_build_object(
        'ok', true,
        'payment_id', v_order.id,
        'status', 'paid',
        'idempotent_replay', true,
        'correlation_id', v_correlation_id
      );
    END IF;

    v_grant := public.billing_post_value_entry_internal(
      v_order.tenant_id,
      v_order.beneficiary_type,
      v_order.beneficiary_id,
      v_order.benefit_type,
      v_order.benefit_amount,
      'payment_grant',
      'Benefit za zweryfikowaną płatność ' || v_order.id::text,
      'verified_payment',
      v_provider || ':' || v_gateway_order_id,
      v_external_event_id,
      v_order.id,
      v_order.actor_user_id,
      v_order.id,
      v_order.correlation_id
    );

    UPDATE public.billing_payment_orders
    SET status = 'paid',
        gateway_transaction_id = v_gateway_order_id,
        benefit_granted_at = coalesce(benefit_granted_at, now()),
        updated_at = now()
    WHERE id = v_order.id;

    UPDATE public.payments
    SET status = 'paid',
        gateway_transaction_id = v_gateway_order_id,
        updated_at = now()
    WHERE id = v_order.id;

    UPDATE public.billing_payment_events
    SET order_id = v_order.id,
        status = 'succeeded',
        result_code = 'benefit_granted',
        completed_at = now()
    WHERE provider = v_provider
      AND external_event_id = v_external_event_id;

    INSERT INTO public.security_audit_log (
      actor_id, tenant_id, action, resource_type, resource_id,
      result, correlation_id, metadata
    ) VALUES (
      v_order.actor_user_id, v_order.tenant_id, 'billing.payment_verified',
      'billing_payment_order', v_order.id::text, 'succeeded',
      v_order.correlation_id,
      jsonb_build_object(
        'provider', v_provider,
        'external_event_id', v_external_event_id,
        'amount_minor', p_amount_minor,
        'currency', v_currency,
        'benefit_type', v_order.benefit_type,
        'benefit_amount', v_order.benefit_amount,
        'ledger_entry_id', v_grant ->> 'entry_id'
      )
    );

    RETURN jsonb_build_object(
      'ok', true,
      'payment_id', v_order.id,
      'status', 'paid',
      'benefit_type', v_order.benefit_type,
      'benefit_amount', v_order.benefit_amount,
      'balance_after', v_grant -> 'balance_after',
      'idempotent_replay', coalesce((v_grant ->> 'idempotent_replay')::boolean, false),
      'correlation_id', v_order.correlation_id
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    v_failure_code := CASE
      WHEN SQLERRM IN (
        'payment_provider_mismatch', 'payment_amount_mismatch',
        'payment_status_not_payable', 'beneficiary_not_found',
        'tenant_mismatch', 'insufficient_value_balance'
      ) THEN left(SQLERRM, 120)
      WHEN v_sqlstate = 'P0002' THEN 'payment_not_found'
      WHEN v_sqlstate = '23505' THEN 'duplicate_payment_reference'
      ELSE 'payment_processing_failed'
    END;

    UPDATE public.billing_payment_events
    SET status = 'failed',
        result_code = v_failure_code,
        completed_at = now()
    WHERE provider = v_provider
      AND external_event_id = v_external_event_id;

    INSERT INTO public.security_audit_log (
      actor_id, tenant_id, action, resource_type, resource_id,
      result, correlation_id, metadata
    ) VALUES (
      v_order.actor_user_id,
      v_order.tenant_id,
      'billing.payment_verification_failed',
      'billing_payment_order',
      p_session_id::text,
      'failed',
      v_correlation_id,
      jsonb_build_object(
        'provider', v_provider,
        'external_event_id', v_external_event_id,
        'error_code', v_failure_code,
        'sqlstate', v_sqlstate
      )
    );

    RETURN jsonb_build_object(
      'ok', false,
      'payment_id', p_session_id,
      'status', 'failed',
      'result_code', v_failure_code,
      'idempotent_replay', false,
      'correlation_id', v_correlation_id
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_apply_verified_payment(
  text, text, uuid, text, bigint, text, text
) FROM PUBLIC, anon, authenticated, service_role;

-- Ręczne GRANT dla service_role wolno dodać dopiero razem z podpisanym
-- webhookiem, provider verification, merchant/session binding i testem replay.

CREATE OR REPLACE FUNCTION public.billing_admin_grant(
  p_actor_id uuid,
  p_beneficiary_user_id uuid,
  p_benefit_type text,
  p_benefit_amount bigint,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_provider_id uuid;
  v_tenant_id uuid;
  v_provider_count integer;
  v_result jsonb;
  v_correlation_id uuid := gen_random_uuid();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL
     OR NOT public.has_role(p_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_beneficiary_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM auth.users AS au WHERE au.id = p_beneficiary_user_id
     ) THEN
    RAISE EXCEPTION 'beneficiary_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_benefit_type NOT IN (
       'sms', 'ai', 'ai_photo', 'listing_featured', 'vehicle_lookup'
     )
     OR p_benefit_amount IS NULL
     OR p_benefit_amount <= 0
     OR p_benefit_amount > 1000000
     OR p_idempotency_key IS NULL
     OR length(trim(coalesce(p_reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'invalid_admin_grant' USING ERRCODE = '22023';
  END IF;

  IF p_benefit_type = 'sms' THEN
    SELECT count(*)
      INTO v_provider_count
    FROM public.service_providers AS sp
    WHERE sp.user_id = p_beneficiary_user_id
      AND coalesce(sp.status, '') IN ('active', 'verified');
    IF v_provider_count <> 1 THEN
      RAISE EXCEPTION 'billing_provider_not_unambiguous' USING ERRCODE = '42501';
    END IF;
    SELECT sp.id, sp.company_id
      INTO v_provider_id, v_tenant_id
    FROM public.service_providers AS sp
    WHERE sp.user_id = p_beneficiary_user_id
      AND coalesce(sp.status, '') IN ('active', 'verified');
    IF v_tenant_id IS NOT NULL AND NOT (
      EXISTS (
        SELECT 1
        FROM public.company_members AS cm
        WHERE cm.company_id = v_tenant_id
          AND cm.user_id = p_beneficiary_user_id
          AND coalesce(cm.status, 'active') = 'active'
      )
      OR EXISTS (
        SELECT 1
        FROM public.companies AS company
        WHERE company.id = v_tenant_id
          AND company.owner_user_id = p_beneficiary_user_id
      )
    ) THEN
      RAISE EXCEPTION 'provider_tenant_membership_required' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_provider_id := p_beneficiary_user_id;
    v_tenant_id := NULL;
  END IF;

  v_result := public.billing_post_value_entry_internal(
    v_tenant_id,
    CASE WHEN p_benefit_type = 'sms' THEN 'service_provider' ELSE 'user' END,
    v_provider_id,
    p_benefit_type,
    p_benefit_amount,
    'admin_grant',
    trim(p_reason),
    'admin_grant',
    p_actor_id::text || ':' || p_idempotency_key::text,
    NULL,
    p_idempotency_key,
    p_actor_id,
    NULL,
    v_correlation_id
  );

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    p_actor_id, v_tenant_id, 'billing.admin_grant',
    CASE WHEN p_benefit_type = 'sms' THEN 'service_provider' ELSE 'user' END,
    v_provider_id::text, 'succeeded', v_correlation_id,
    jsonb_build_object(
      'beneficiary_user_id', p_beneficiary_user_id,
      'benefit_type', p_benefit_type,
      'benefit_amount', p_benefit_amount,
      'ledger_entry_id', v_result ->> 'entry_id',
      'idempotent_replay', v_result -> 'idempotent_replay'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'beneficiary_user_id', p_beneficiary_user_id,
    'provider_id', CASE WHEN p_benefit_type = 'sms' THEN v_provider_id ELSE NULL END,
    'tenant_id', v_tenant_id,
    'benefit_type', p_benefit_type,
    'benefit_amount', p_benefit_amount,
    'balance_after', v_result -> 'balance_after',
    'ledger_entry_id', v_result -> 'entry_id',
    'idempotent_replay', v_result -> 'idempotent_replay',
    'correlation_id', v_correlation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.billing_admin_grant(
  uuid, uuid, text, bigint, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

-- Funkcja pozostaje wyłączona do czasu serwerowej reautoryzacji administratora.

-- ---------------------------------------------------------------------------
-- 9. Bezpieczniejsze kompatybilne RPC zużycia wartości
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.deduct_vehicle_lookup_credit(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_operation_id uuid := gen_random_uuid();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.billing_post_value_entry_internal(
    NULL, 'user', p_user_id, 'vehicle_lookup', -1,
    'consume', 'Sprawdzenie danych pojazdu', 'legacy_service_rpc',
    'deduct_vehicle_lookup_credit:' || v_operation_id::text,
    NULL, v_operation_id, p_user_id, NULL, v_operation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_vehicle_lookup_credit(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.deduct_sms_credit(p_provider_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_operation_id uuid := gen_random_uuid();
  v_tenant_id uuid;
  v_actor_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  SELECT sp.company_id, sp.user_id INTO v_tenant_id, v_actor_id
  FROM public.service_providers AS sp
  WHERE sp.id = p_provider_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'beneficiary_not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.billing_post_value_entry_internal(
    v_tenant_id, 'service_provider', p_provider_id, 'sms', -1,
    'consume', 'Wysłanie wiadomości SMS', 'legacy_service_rpc',
    'deduct_sms_credit:' || v_operation_id::text,
    NULL, v_operation_id, v_actor_id, NULL, v_operation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_sms_credit(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Historyczne sygnatury nie przyjmują idempotency key, dlatego pozostają
-- zablokowane. Nowe endpointy zużycia muszą używać kontraktu z event_id.

-- ---------------------------------------------------------------------------
-- 10. Odcięcie klientowego DML przy zachowaniu istniejących odczytów
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'payments',
        'user_credits',
        'ai_user_credits',
        'vehicle_lookup_credits',
        'vehicle_lookup_credit_transactions',
        'user_wallets',
        'wallet_transactions',
        'wallet_pln_transactions',
        'coin_transactions',
        'marketplace_orders',
        'listing_promotions',
        'promo_code_redemptions',
        'parking_sessions',
        'rental_payments'
      ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      v_policy.policyname, v_policy.schemaname, v_policy.tablename
    );
  END LOOP;
END;
$$;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_user_credits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_lookup_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_lookup_credits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_lookup_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_lookup_credit_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_wallets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_pln_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_pln_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.listing_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_promotions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_redemptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.parking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rental_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_payments_own_read
  ON public.payments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY billing_user_credits_own_read
  ON public.user_credits FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY billing_ai_user_credits_own_read
  ON public.ai_user_credits FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY billing_vehicle_credits_own_read
  ON public.vehicle_lookup_credits FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY billing_vehicle_credit_history_own_read
  ON public.vehicle_lookup_credit_transactions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY billing_wallet_own_read
  ON public.user_wallets FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY billing_wallet_transactions_own_read
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_wallets AS uw
      WHERE uw.id = wallet_transactions.wallet_id
        AND uw.user_id = auth.uid()
    )
  );
CREATE POLICY billing_wallet_pln_transactions_own_read
  ON public.wallet_pln_transactions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY billing_coin_transactions_own_read
  ON public.coin_transactions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY billing_marketplace_orders_party_read
  ON public.marketplace_orders FOR SELECT TO authenticated
  USING (
    buyer_id = auth.uid()
    OR seller_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY billing_listing_promotions_own_read
  ON public.listing_promotions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY billing_promo_redemptions_own_read
  ON public.promo_code_redemptions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY billing_parking_sessions_own_read
  ON public.parking_sessions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY billing_rental_payments_tenant_read
  ON public.rental_payments FOR SELECT TO authenticated
  USING (
    (
      public.is_company_member(company_id)
      AND public.can_use_module(company_id, 'rental')
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.payments,
           public.user_credits,
           public.ai_user_credits,
           public.vehicle_lookup_credits,
           public.vehicle_lookup_credit_transactions,
           public.user_wallets,
           public.wallet_transactions,
           public.wallet_pln_transactions,
           public.coin_transactions,
           public.marketplace_orders,
           public.listing_promotions,
           public.promo_code_redemptions,
           public.parking_sessions,
           public.rental_payments
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT
  ON TABLE public.payments,
           public.user_credits,
           public.ai_user_credits,
           public.vehicle_lookup_credits,
           public.vehicle_lookup_credit_transactions,
           public.user_wallets,
           public.wallet_transactions,
           public.wallet_pln_transactions,
           public.coin_transactions,
           public.marketplace_orders,
           public.listing_promotions,
           public.promo_code_redemptions,
           public.parking_sessions,
           public.rental_payments
  TO authenticated, service_role;

-- Brak bezpośredniego DML także dla service_role jest świadomy: zmiana wartości
-- ma przechodzić przez audytowany SECURITY DEFINER RPC. Stare workery zapisujące
-- bezpośrednio są fail-closed do czasu migracji na te kontrakty.

-- Historyczny katalog pozostaje źródłem UI, ale jest tylko do odczytu dla
-- klienta. Zarządzanie pakietami musi przejść przez autoryzowany endpoint.
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_read_packages ON public.credit_packages;
DROP POLICY IF EXISTS billing_credit_packages_public_read ON public.credit_packages;
CREATE POLICY billing_credit_packages_public_read
  ON public.credit_packages FOR SELECT TO anon, authenticated
  USING (is_active = true);
REVOKE ALL ON TABLE public.credit_packages FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.credit_packages TO anon, authenticated, service_role;

-- credit_packages jest od tej chwili wyłącznie zgodnościowym katalogiem
-- historycznym. Kanoniczne ceny publikuje billing_products; pozostawienie DML
-- w obu tabelach tworzyłoby rozbieżność ceny widzianej przez UI i pobieranej
-- przez serwer. Przyszła edycja katalogu wymaga audytowanego RPC na
-- billing_products, a nie bezpośredniego UPDATE którejkolwiek tabeli.

-- Constraints NOT VALID nie blokują migracji starych anomalii, ale nie pozwolą
-- zapisać nowego ujemnego salda.
ALTER TABLE public.user_credits
  DROP CONSTRAINT IF EXISTS user_credits_nonnegative_phase_b,
  ADD CONSTRAINT user_credits_nonnegative_phase_b
    CHECK (credits_balance IS NULL OR credits_balance >= 0) NOT VALID;
ALTER TABLE public.ai_user_credits
  DROP CONSTRAINT IF EXISTS ai_user_credits_nonnegative_phase_b,
  ADD CONSTRAINT ai_user_credits_nonnegative_phase_b
    CHECK (credits_balance IS NULL OR credits_balance >= 0) NOT VALID;
ALTER TABLE public.vehicle_lookup_credits
  DROP CONSTRAINT IF EXISTS vehicle_lookup_credits_nonnegative_phase_b,
  ADD CONSTRAINT vehicle_lookup_credits_nonnegative_phase_b
    CHECK (
      (remaining_credits IS NULL OR remaining_credits >= 0)
      AND (total_credits_purchased IS NULL OR total_credits_purchased >= 0)
    ) NOT VALID;
ALTER TABLE public.service_providers
  DROP CONSTRAINT IF EXISTS service_providers_sms_nonnegative_phase_b,
  ADD CONSTRAINT service_providers_sms_nonnegative_phase_b
    CHECK (sms_balance IS NULL OR sms_balance >= 0) NOT VALID;
ALTER TABLE public.user_wallets
  DROP CONSTRAINT IF EXISTS user_wallets_values_nonnegative_phase_b,
  ADD CONSTRAINT user_wallets_values_nonnegative_phase_b
    CHECK (
      (balance IS NULL OR balance >= 0)
      AND (coins_balance IS NULL OR coins_balance >= 0)
      AND pln_balance >= 0
    ) NOT VALID;

-- Historyczne granty bez idempotencji pozostają wyłączone z Fazy A.
-- Przyznawanie wartości administracyjnej odbywa się wyłącznie przez
-- billing_admin_grant z aktorem, powodem, UUID idempotencji i audytem.
REVOKE ALL ON FUNCTION public.credit_welcome_bonus(uuid, numeric)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_referral_on_first_purchase(uuid, numeric, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
