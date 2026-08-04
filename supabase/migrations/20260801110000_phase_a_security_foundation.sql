-- Phase A: centralny, niezmienny audit trail oraz blokada publicznego wykonania
-- potwierdzonych uprzywilejowanych RPC. Migracja jest addytywna i nie usuwa
-- historycznych definicji ani danych.

-- SECURITY DEFINER nie może rozwiązać niezaufanego obiektu utworzonego przez
-- klienta w schemacie public. Role aplikacyjne zachowują USAGE, ale nie DDL.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UUID jest trwałym snapshotem aktora. Celowo bez FK do auth.users, aby
  -- usunięcie konta nie niszczyło wartości dowodowej historii audytu.
  actor_id uuid,
  tenant_id uuid,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 120),
  resource_type text NOT NULL CHECK (length(resource_type) BETWEEN 1 AND 120),
  resource_id text,
  result text NOT NULL CHECK (result IN ('attempted', 'succeeded', 'denied', 'failed')),
  correlation_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_audit_log
  DROP CONSTRAINT IF EXISTS security_audit_log_actor_id_fkey;

COMMENT ON TABLE public.security_audit_log IS
  'Append-only audit trail dla operacji uprzywilejowanych; bez sekretów i pełnych payloadów.';

CREATE INDEX IF NOT EXISTS security_audit_log_occurred_at_idx
  ON public.security_audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_log_actor_idx
  ON public.security_audit_log (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_log_tenant_idx
  ON public.security_audit_log (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_log_correlation_idx
  ON public.security_audit_log (correlation_id);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_audit_admin_read ON public.security_audit_log;
CREATE POLICY security_audit_admin_read
  ON public.security_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE ALL ON TABLE public.security_audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.security_audit_log FROM service_role;
GRANT SELECT ON TABLE public.security_audit_log TO authenticated;
GRANT SELECT, INSERT ON TABLE public.security_audit_log TO service_role;

-- Helper autoryzacyjny jest używany przez SECURITY DEFINER powyżej i niżej.
-- Kwalifikacja pg_catalog ogranicza shadowing obiektów sesji.
ALTER FUNCTION public.has_role(uuid, public.app_role)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_company_owner(uuid)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_company_member(uuid)
  SET search_path = pg_catalog, public;

-- Atomowy rejestr odbioru webhooków. Klucz dostawca+event jest zajmowany
-- przed skutkiem ubocznym, dzięki czemu równoległe dostarczenia nie wykonają
-- tej samej operacji dwukrotnie.
CREATE TABLE IF NOT EXISTS public.security_webhook_events (
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  external_event_id text NOT NULL CHECK (length(external_event_id) BETWEEN 1 AND 255),
  tenant_id uuid,
  status text NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed')),
  correlation_id uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR length(last_error_code) <= 120),
  PRIMARY KEY (provider, external_event_id)
);

ALTER TABLE public.security_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_webhook_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_webhook_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.security_webhook_events FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.security_webhook_events TO service_role;

-- Role są modyfikowane wyłącznie przez autoryzowany endpoint administracyjny,
-- aby każda zmiana miała ponowną kontrolę roli i wpis audytowy.
REVOKE ALL ON TABLE public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO service_role;

-- Historyczna polityka pozwalała użytkownikowi UPDATE własnego wiersza wraz z
-- company_id/status/is_owner, co umożliwiało samodzielne wejście do obcego
-- tenanta. Membership jest odtąd zmieniany wyłącznie przez backend invite/admin.
DROP POLICY IF EXISTS "company_members_insert" ON public.company_members;
DROP POLICY IF EXISTS "company_members_update" ON public.company_members;
DROP POLICY IF EXISTS "company_members_delete" ON public.company_members;
REVOKE ALL ON TABLE public.company_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.company_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_members TO service_role;

-- Historyczny self-insert sprawdzał wyłącznie user_id i pozwalał wskazać
-- dowolny driver_id. Trigger po takim wpisie nadawał rolę kierowcy, więc RPC
-- z kontrolą e-maila można było całkowicie ominąć.
DROP POLICY IF EXISTS "Authenticated users can insert their driver_app_users record"
  ON public.driver_app_users;
REVOKE ALL ON TABLE public.driver_app_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.driver_app_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.driver_app_users TO service_role;
ALTER FUNCTION public.ensure_driver_role()
  SET search_path = pg_catalog, public;

-- Referral jest operacją wartościową. Otwarte polityki "System" w praktyce
-- obejmowały anon/authenticated i pozwalały sfałszować status oraz nagrodę.
DROP POLICY IF EXISTS "System can insert referral uses" ON public.referral_uses;
DROP POLICY IF EXISTS "System can update referral uses" ON public.referral_uses;
REVOKE ALL ON TABLE public.referral_uses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.referral_uses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.referral_uses TO service_role;

-- Kod polecający również musi pochodzić z generatora serwerowego; klient nie
-- może zająć arbitralnej wartości ani zmienić statystyk kodu.
DROP POLICY IF EXISTS "Users can create own referral code" ON public.referral_codes;
REVOKE ALL ON TABLE public.referral_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.referral_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.referral_codes TO service_role;

-- Atomowy claim eliminuje wyścig dwóch równoległych wywołań jednorazowego
-- bootstrapu. Tabela nie jest dostępna przez publiczne API.
CREATE TABLE IF NOT EXISTS public.security_bootstrap_claims (
  bootstrap_key text PRIMARY KEY,
  correlation_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.security_bootstrap_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_bootstrap_claims FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_bootstrap_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.security_bootstrap_claims TO service_role;

-- Stare rekordy plaintext pozostają fizycznie obecne do kontrolowanej rotacji,
-- ale constraint NOT VALID blokuje każdy nowy/zmieniany rekord bez szyfrowania.
-- Po ponownym zapisaniu wszystkich sekretów należy ręcznie wykonać VALIDATE.
ALTER TABLE public.ai_secret_store
  ALTER COLUMN is_encrypted SET DEFAULT true;
ALTER TABLE public.ai_secret_store
  DROP CONSTRAINT IF EXISTS ai_secret_store_encrypted_only;
ALTER TABLE public.ai_secret_store
  ADD CONSTRAINT ai_secret_store_encrypted_only CHECK (is_encrypted = true) NOT VALID;

-- Wyszukiwanie auth.users jest operacją administracyjną. Zachowujemy sygnaturę
-- dla istniejącego panelu, ale sama funkcja sprawdza rolę z DB.
CREATE OR REPLACE FUNCTION public.admin_find_user_by_email(p_email text)
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF length(trim(coalesce(p_email, ''))) < 3 THEN
    RAISE EXCEPTION 'invalid_search' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT au.id, au.email::text
    FROM auth.users AS au
    WHERE au.email ILIKE '%' || trim(p_email) || '%'
    ORDER BY au.email
    LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_find_user_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_find_user_by_email(text) TO authenticated;

-- Powiązanie konta z kierowcą może wykonać użytkownik dla własnego rekordu
-- (zgodny e-mail) albo administrator. Manager floty musi użyć procesu invite,
-- aby nie przypisać roli osobie, która nie zaakceptowała zaproszenia.
CREATE OR REPLACE FUNCTION public.link_auth_user_to_driver(
  p_user_id uuid,
  p_driver_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_target_email text;
  v_target_email_confirmed_at timestamptz;
  v_driver_email text;
  v_city_id uuid;
  v_fleet_id uuid;
  v_company_id uuid;
  v_is_admin boolean := false;
  v_existing_user_id uuid;
  v_existing_driver_id uuid;
  v_correlation_id uuid := gen_random_uuid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  -- Stała kolejność blokad serializuje równoległe próby dla obu stron relacji.
  PERFORM pg_advisory_xact_lock(hashtextextended('user:' || p_user_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('driver:' || p_driver_id::text, 0));

  SELECT d.city_id, d.fleet_id, lower(nullif(trim(d.email), ''))
    INTO v_city_id, v_fleet_id, v_driver_email
  FROM public.drivers AS d
  WHERE d.id = p_driver_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT f.company_id INTO v_company_id
  FROM public.fleets AS f
  WHERE f.id = v_fleet_id;

  v_is_admin := public.has_role(v_actor_id, 'admin'::public.app_role);
  SELECT lower(nullif(trim(au.email::text), '')), au.email_confirmed_at
    INTO v_target_email, v_target_email_confirmed_at
  FROM auth.users AS au
  WHERE au.id = p_user_id;

  IF v_target_email IS NULL OR v_driver_email IS NULL OR v_target_email <> v_driver_email THEN
    RAISE EXCEPTION 'driver_identity_mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_target_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'confirmed_email_required' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = v_actor_id THEN
    IF v_actor_email IS NULL OR v_actor_email <> v_driver_email THEN
      RAISE EXCEPTION 'driver_identity_mismatch' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT v_is_admin THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT dau.driver_id
    INTO v_existing_driver_id
  FROM public.driver_app_users AS dau
  WHERE dau.user_id = p_user_id;

  IF v_existing_driver_id IS NOT NULL AND v_existing_driver_id <> p_driver_id THEN
    RAISE EXCEPTION 'user_already_linked_to_driver' USING ERRCODE = '23505';
  END IF;

  SELECT dau.user_id
    INTO v_existing_user_id
  FROM public.driver_app_users AS dau
  WHERE dau.driver_id = p_driver_id
    AND dau.user_id <> p_user_id
  LIMIT 1;

  IF v_existing_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'driver_already_linked' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.driver_app_users (user_id, driver_id, city_id)
  VALUES (p_user_id, p_driver_id, v_city_id)
  ON CONFLICT (user_id) DO UPDATE
    SET driver_id = EXCLUDED.driver_id,
        city_id = EXCLUDED.city_id
  WHERE public.driver_app_users.driver_id IS NULL
     OR public.driver_app_users.driver_id = EXCLUDED.driver_id;

  INSERT INTO public.user_roles (user_id, role, fleet_id)
  VALUES (p_user_id, 'driver'::public.app_role, v_fleet_id)
  ON CONFLICT (user_id, role) DO UPDATE
    SET fleet_id = EXCLUDED.fleet_id;

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    v_actor_id, v_company_id, 'driver.account_linked', 'driver', p_driver_id::text,
    'succeeded', v_correlation_id,
    jsonb_build_object('target_user_id', p_user_id, 'fleet_id', v_fleet_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_auth_user_to_driver(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_auth_user_to_driver(uuid, uuid) TO authenticated;

-- Zmiana długu jest niskopoziomową operacją finansową. Przeglądarka nie może
-- podać kwoty końcowej; RPC działa wyłącznie dla service_role po tym, jak
-- autoryzowany endpoint wyliczy wartość z kanonicznego rozliczenia.
CREATE OR REPLACE FUNCTION public.increment_driver_debt(
  p_driver_id uuid,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fleet_id uuid;
  v_company_id uuid;
  v_correlation_id uuid := gen_random_uuid();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  SELECT d.fleet_id INTO v_fleet_id
  FROM public.drivers AS d
  WHERE d.id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT f.company_id INTO v_company_id
  FROM public.fleets AS f
  WHERE f.id = v_fleet_id;

  INSERT INTO public.driver_debts (driver_id, current_balance)
  VALUES (p_driver_id, p_amount)
  ON CONFLICT (driver_id) DO UPDATE
    SET current_balance = public.driver_debts.current_balance + EXCLUDED.current_balance,
        updated_at = now();

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    NULL, v_company_id, 'driver.debt_incremented', 'driver', p_driver_id::text,
    'succeeded', v_correlation_id,
    jsonb_build_object('amount', p_amount, 'fleet_id', v_fleet_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.increment_driver_debt(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_driver_debt(uuid, numeric) TO service_role;

-- Te procedury nie mają bezpiecznego przypadku bezpośredniego wywołania z
-- przeglądarki. Mogą być użyte wyłącznie przez zweryfikowany endpoint serwerowy.
REVOKE ALL ON FUNCTION public.merge_duplicate_drivers(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_drivers(uuid, uuid) TO service_role;
ALTER FUNCTION public.merge_duplicate_drivers(uuid, uuid) SET search_path = pg_catalog, public;

-- Granty wartości pozostają całkowicie wyłączone do Fazy B: ich historyczne
-- implementacje nie mają niezmiennego ledgeru ani klucza idempotencji.
REVOKE ALL ON FUNCTION public.credit_welcome_bonus(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_welcome_bonus(uuid, numeric) FROM service_role;
ALTER FUNCTION public.credit_welcome_bonus(uuid, numeric) SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.complete_referral_on_first_purchase(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_referral_on_first_purchase(uuid, numeric, uuid) FROM service_role;
ALTER FUNCTION public.complete_referral_on_first_purchase(uuid, numeric, uuid) SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.admin_list_service_providers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_service_providers() TO authenticated;
ALTER FUNCTION public.admin_list_service_providers() SET search_path = pg_catalog, public;

-- Kolejka domenowa i liczniki wartości nie mogą być wywoływane bezpośrednio
-- z przeglądarki. Nadal działają z autoryzowanych Edge Functions/service_role.
-- Limit jest normalizowany także dla NULL, aby worker nie przejął całej kolejki.
CREATE OR REPLACE FUNCTION public.claim_domain_events(p_limit integer DEFAULT 20)
RETURNS SETOF public.domain_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.domain_events AS event
     SET status = 'processing',
         locked_at = pg_catalog.now(),
         attempts = event.attempts + 1
   WHERE event.id IN (
     SELECT pending.id
     FROM public.domain_events AS pending
     WHERE pending.status = 'pending'
     ORDER BY pending.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
   )
  RETURNING event.*;
$$;
REVOKE ALL ON FUNCTION public.claim_domain_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_domain_events(integer) TO service_role;
ALTER FUNCTION public.claim_domain_events(integer) SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.deduct_vehicle_lookup_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_vehicle_lookup_credit(uuid) TO service_role;
ALTER FUNCTION public.deduct_vehicle_lookup_credit(uuid) SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.deduct_sms_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_sms_credit(uuid) TO service_role;
ALTER FUNCTION public.deduct_sms_credit(uuid) SET search_path = pg_catalog, public;

-- Licznika numeracji nie można modyfikować bezpośrednio z przeglądarki.
DROP POLICY IF EXISTS "Providers manage own sequences" ON public.workshop_order_sequences;
REVOKE ALL ON TABLE public.workshop_order_sequences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.workshop_order_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workshop_order_sequences TO service_role;

-- Jednorazowo synchronizuje liczniki z poprawnie sformatowanymi numerami
-- historycznymi. Nie dotyka numerów zleceń i ignoruje złośliwe/za długie sufiksy.
INSERT INTO public.workshop_order_sequences (provider_id, year, month, kind, last_number)
SELECT
  parsed.provider_id,
  parsed.parts[3]::integer,
  parsed.parts[2]::integer,
  parsed.parts[1],
  max(parsed.parts[4]::integer)
FROM (
  SELECT wo.provider_id,
         regexp_match(wo.order_number, '^(ZL|ZLP)-([0-9]{2})/([0-9]{4})-([0-9]{1,6})$') AS parts
  FROM public.workshop_orders AS wo
) AS parsed
WHERE parsed.parts IS NOT NULL
  AND parsed.parts[2]::integer BETWEEN 1 AND 12
  AND parsed.parts[3]::integer BETWEEN 2000 AND 2200
GROUP BY parsed.provider_id, parsed.parts[1], parsed.parts[2], parsed.parts[3]
ON CONFLICT (provider_id, year, month, kind) DO UPDATE
  SET last_number = greatest(
    public.workshop_order_sequences.last_number,
    EXCLUDED.last_number
  );

-- Numeracja warsztatu pozostaje dostępna wewnętrznie dla triggera. Użytkownik
-- nie może rezerwować numerów samym RPC ani podstawić obcego provider_id.
CREATE OR REPLACE FUNCTION public.next_workshop_order_number(
  p_provider_id uuid,
  p_kind text DEFAULT 'ZL'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_month integer := EXTRACT(MONTH FROM now())::integer;
  v_prefix text;
  v_next integer;
  v_allowed boolean := false;
BEGIN
  IF p_provider_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('ZL', 'ZLP') THEN
    RAISE EXCEPTION 'invalid_order_sequence' USING ERRCODE = '22023';
  END IF;

  v_allowed := coalesce(auth.role() = 'service_role', false)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.service_providers AS sp
      WHERE sp.id = p_provider_id
        AND (
          sp.user_id = auth.uid()
          OR (sp.company_id IS NOT NULL AND public.is_company_member(sp.company_id))
        )
    );
  IF coalesce(v_allowed, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  v_prefix := p_kind || '-' || lpad(v_month::text, 2, '0') || '/' || v_year::text || '-';
  INSERT INTO public.workshop_order_sequences (provider_id, year, month, kind, last_number)
  VALUES (p_provider_id, v_year, v_month, p_kind, 1)
  ON CONFLICT (provider_id, year, month, kind) DO UPDATE
    SET last_number = greatest(public.workshop_order_sequences.last_number, 0) + 1
  RETURNING last_number INTO v_next;

  IF v_next > 999999 THEN
    RAISE EXCEPTION 'order_sequence_exhausted' USING ERRCODE = '22003';
  END IF;

  RETURN v_prefix || lpad(v_next::text, 3, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_workshop_order_number(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_workshop_order_number(uuid, text) TO service_role;

-- Każdy nowy rekord otrzymuje numer serwerowy; wartość przesłana przez klienta
-- jest ignorowana. SECURITY DEFINER pozwala triggerowi wywołać wewnętrzny RPC
-- bez przywracania bezpośredniego EXECUTE dla authenticated.
CREATE OR REPLACE FUNCTION public.generate_workshop_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kind text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.order_number IS DISTINCT FROM OLD.order_number THEN
      RAISE EXCEPTION 'workshop_order_number_is_immutable' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  v_kind := CASE WHEN NEW.booking_id IS NOT NULL THEN 'ZLP' ELSE 'ZL' END;
  NEW.order_number := public.next_workshop_order_number(NEW.provider_id, v_kind);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_workshop_order_number() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_workshop_order_number ON public.workshop_orders;
CREATE TRIGGER trg_workshop_order_number
  BEFORE INSERT OR UPDATE ON public.workshop_orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_workshop_order_number();

-- Numery faktur mogą być odczytane/rezerwowane tylko dla własnego konta.
CREATE OR REPLACE FUNCTION public.peek_next_invoice_number(
  p_user_id uuid,
  p_year integer,
  p_month integer
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF p_user_id IS NULL
    OR p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2200
    OR p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'invalid_invoice_period' USING ERRCODE = '22023';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND auth.uid() IS DISTINCT FROM p_user_id
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(max(
    CASE
      WHEN split_part(ui.invoice_number, '/', 4) ~ '^[0-9]{1,9}$'
      THEN split_part(ui.invoice_number, '/', 4)::integer
      ELSE NULL
    END
  ), 0) + 1
    INTO v_next
  FROM public.user_invoices AS ui
  WHERE ui.user_id = p_user_id
    AND ui.invoice_number LIKE ('FV/' || p_year || '/' || lpad(p_month::text, 2, '0') || '/%');
  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_invoice_number(
  p_user_id uuid,
  p_year integer,
  p_month integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF p_user_id IS NULL
    OR p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2200
    OR p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'invalid_invoice_period' USING ERRCODE = '22023';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND auth.uid() IS DISTINCT FROM p_user_id
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_year || ':' || p_month, 0));
  SELECT coalesce(max(
    CASE
      WHEN split_part(ui.invoice_number, '/', 4) ~ '^[0-9]{1,9}$'
      THEN split_part(ui.invoice_number, '/', 4)::integer
      ELSE NULL
    END
  ), 0) + 1
    INTO v_next
  FROM public.user_invoices AS ui
  WHERE ui.user_id = p_user_id
    AND ui.invoice_number LIKE ('FV/' || p_year || '/' || lpad(p_month::text, 2, '0') || '/%');
  RETURN v_next;
END;
$$;
REVOKE ALL ON FUNCTION public.peek_next_invoice_number(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_next_invoice_number(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.peek_next_invoice_number(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_next_invoice_number(uuid, integer, integer) TO authenticated, service_role;

-- Historyczny trigger robił check-then-insert bez blokady. Advisory lock na
-- użytkownika+numer serializuje równoległe inserty, zachowując stare duplikaty.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.invoice_number IS NOT DISTINCT FROM OLD.invoice_number
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'invoice-number:' || NEW.user_id::text || ':' || NEW.invoice_number,
    0
  ));
  IF EXISTS (
    SELECT 1
    FROM public.user_invoices AS existing
    WHERE existing.user_id = NEW.user_id
      AND existing.invoice_number = NEW.invoice_number
      AND existing.deleted_at IS NULL
      AND existing.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Aktywna faktura o tym numerze już istnieje'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_duplicate_invoice_number() FROM PUBLIC, anon, authenticated;

-- Referral RPC wiążą aktora z auth.uid(). Anonimowy signup musi przejść przez
-- serwerowy, rate-limitowany endpoint; nie może podać dowolnego UUID.
CREATE OR REPLACE FUNCTION public.ensure_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempts integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user' USING ERRCODE = '22023';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND auth.uid() IS DISTINCT FROM p_user_id
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT rc.code INTO v_code FROM public.referral_codes AS rc WHERE rc.user_id = p_user_id LIMIT 1;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;
  LOOP
    v_code := '';
    FOR i IN 1..8 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes AS rc WHERE rc.code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'referral_code_generation_failed';
    END IF;
  END LOOP;
  INSERT INTO public.referral_codes (user_id, code, is_active)
  VALUES (p_user_id, v_code, true)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT rc.code INTO v_code FROM public.referral_codes AS rc WHERE rc.user_id = p_user_id;
  RETURN v_code;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_referral_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_referral_code(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.link_referral_on_signup(
  p_referred_user_id uuid,
  p_code text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_code_row record;
  v_settings record;
  v_is_service boolean := coalesce(auth.role() = 'service_role', false);
BEGIN
  IF p_referred_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user' USING ERRCODE = '22023';
  END IF;
  IF NOT v_is_service AND auth.uid() IS DISTINCT FROM p_referred_user_id THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'no_code');
  END IF;
  -- Serializuje dwa równoległe linkowania tego samego użytkownika. Istniejące
  -- duplikaty muszą zostać najpierw zbadane przed dodaniem UNIQUE w Fazie B.
  PERFORM pg_advisory_xact_lock(hashtextextended('referral:' || p_referred_user_id::text, 0));
  SELECT * INTO v_settings FROM public.referral_settings LIMIT 1;
  IF v_settings.is_enabled IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'disabled');
  END IF;
  SELECT * INTO v_code_row FROM public.referral_codes
  WHERE code = upper(trim(p_code)) AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('linked', false, 'reason', 'invalid_code'); END IF;
  IF v_code_row.user_id = p_referred_user_id THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'self_referral');
  END IF;
  IF EXISTS (SELECT 1 FROM public.referral_uses WHERE referred_user_id = p_referred_user_id) THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'already_referred');
  END IF;
  INSERT INTO public.referral_uses (
    referral_code_id, referred_user_id, referrer_user_id,
    ip_address, user_agent, status, coins_awarded
  ) VALUES (
    v_code_row.id, p_referred_user_id, v_code_row.user_id,
    CASE WHEN v_is_service THEN left(p_ip, 100) ELSE NULL END,
    CASE WHEN v_is_service THEN left(p_user_agent, 500) ELSE NULL END,
    'pending_first_purchase', 0
  );
  RETURN jsonb_build_object('linked', true, 'referrer_user_id', v_code_row.user_id, 'code', v_code_row.code);
END;
$$;
REVOKE ALL ON FUNCTION public.link_referral_on_signup(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_referral_on_signup(uuid, text, text, text) TO authenticated, service_role;
