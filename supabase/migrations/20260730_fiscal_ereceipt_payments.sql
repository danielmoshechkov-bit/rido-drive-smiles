-- =====================================================================
-- FISKALIZACJA — e-paragon (FAZA 2) i płatności terminalem (FAZA 3)
--
-- Te tabele są PRZYGOTOWANIEM architektury: struktura + RLS gotowe,
-- integracje (HUB e-paragonu, terminal płatniczy) dokładamy po wyborze dostawcy.
-- Migracja idempotentna. Wymaga wcześniejszego 20260730_fiscal_core.sql.
-- =====================================================================

-- ── 3. E-paragony (FAZA 2) ────────────────────────────────────────────
-- Protokół ElzabESC nie obsługuje e-paragonu — idzie on przez repozytorium/HUB
-- (MojaKasa.Online ELZAB albo integrator zewnętrzny). Tabela trzyma stan wysyłki
-- niezależnie od dostawcy (kolumna provider).
CREATE TABLE IF NOT EXISTS public.fiscal_ereceipts (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id    uuid        NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  receipt_id     uuid        REFERENCES public.fiscal_receipts(id) ON DELETE SET NULL,
  -- dostawca e-paragonu: 'hub_elzab' (MojaKasa.Online), 'external_hub' (np. Paragony.pl), 'custom'
  provider       text        NOT NULL DEFAULT 'external_hub'
                             CHECK (provider IN ('hub_elzab', 'external_hub', 'custom')),
  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'skipped')),
  -- odbiorca + zgoda (bez zgody nie wysyłamy)
  recipient_email text,
  recipient_phone text,
  consent_given   boolean    NOT NULL DEFAULT false,
  consent_at      timestamptz,
  -- identyfikatory po stronie HUB-a
  external_id     text,
  external_url    text,                                     -- link do e-paragonu (PDF/JSON)
  payload         jsonb,                                    -- to, co poszło do HUB-a
  response        jsonb,
  error_message   text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_ereceipts_provider ON public.fiscal_ereceipts(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_ereceipts_receipt  ON public.fiscal_ereceipts(receipt_id);

DROP TRIGGER IF EXISTS trg_fiscal_ereceipts_updated_at ON public.fiscal_ereceipts;
CREATE TRIGGER trg_fiscal_ereceipts_updated_at
  BEFORE UPDATE ON public.fiscal_ereceipts
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

ALTER TABLE public.fiscal_ereceipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_ereceipts_select ON public.fiscal_ereceipts;
DROP POLICY IF EXISTS fiscal_ereceipts_insert ON public.fiscal_ereceipts;

CREATE POLICY fiscal_ereceipts_select ON public.fiscal_ereceipts FOR SELECT
  USING (public.is_fiscal_provider_member(provider_id));
CREATE POLICY fiscal_ereceipts_insert ON public.fiscal_ereceipts FOR INSERT
  WITH CHECK (public.is_fiscal_provider_member(provider_id));
-- UPDATE/DELETE: tylko edge function (service_role).

-- ── 4. Płatności terminalem (FAZA 3) ──────────────────────────────────
-- Docelowy przepływ: intencja płatności → terminal/SoftPOS → callback 'paid'
-- → dopiero wtedy fiskalizacja. Dostawca (PolCard/PeP/eService) jeszcze niewybrany.
CREATE TABLE IF NOT EXISTS public.fiscal_payment_intents (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id    uuid        NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  -- luźny typ dokumentu źródłowego, jak w fiscal_receipts (bez FK, bez listy branż)
  document_type  text        NOT NULL DEFAULT 'external'
                             CHECK (char_length(document_type) BETWEEN 1 AND 64),
  document_id    uuid,
  amount_grosze  bigint      NOT NULL CHECK (amount_grosze > 0),
  method         text        NOT NULL DEFAULT 'card' CHECK (method IN ('card', 'blik', 'cash', 'transfer')),
  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'authorized', 'paid', 'declined', 'cancelled', 'expired')),
  -- integracja z terminalem
  terminal_provider text     CHECK (terminal_provider IN ('polcard', 'pep', 'eservice', 'softpos', 'manual')),
  terminal_id       text,
  external_id       text,
  authorization_code text,
  response          jsonb,
  error_message     text,
  -- powiązanie z wynikiem fiskalizacji
  receipt_id     uuid        REFERENCES public.fiscal_receipts(id) ON DELETE SET NULL,
  paid_at        timestamptz,
  created_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_intents_provider ON public.fiscal_payment_intents(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_intents_document ON public.fiscal_payment_intents(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_intents_open     ON public.fiscal_payment_intents(provider_id, status)
  WHERE status IN ('pending', 'authorized');

DROP TRIGGER IF EXISTS trg_fiscal_intents_updated_at ON public.fiscal_payment_intents;
CREATE TRIGGER trg_fiscal_intents_updated_at
  BEFORE UPDATE ON public.fiscal_payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

ALTER TABLE public.fiscal_payment_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_intents_select ON public.fiscal_payment_intents;
DROP POLICY IF EXISTS fiscal_intents_insert ON public.fiscal_payment_intents;

CREATE POLICY fiscal_intents_select ON public.fiscal_payment_intents FOR SELECT
  USING (public.is_fiscal_provider_member(provider_id));
CREATE POLICY fiscal_intents_insert ON public.fiscal_payment_intents FOR INSERT
  WITH CHECK (public.is_fiscal_provider_member(provider_id));
-- UPDATE (zmiana statusu po callbacku z terminala) wykonuje edge function service_role.

COMMENT ON TABLE public.fiscal_ereceipts IS
  'FAZA 2 — stan wysyłki e-paragonu przez HUB. Dostawca konfigurowalny; ElzabESC nie obsługuje e-paragonu.';
COMMENT ON TABLE public.fiscal_payment_intents IS
  'FAZA 3 — intencje płatności terminalem. Fiskalizacja startuje dopiero po statusie paid.';
