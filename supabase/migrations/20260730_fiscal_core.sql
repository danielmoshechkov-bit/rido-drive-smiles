-- =====================================================================
-- FISKALIZACJA — rdzeń modułu (FAZA 1)
-- Uniwersalny moduł paragonów fiskalnych: konfiguracja drukarki per tenant
-- + niemodyfikowalny log paragonów.
--
-- Tenant = public.service_providers (ten sam model co workshop_*).
-- Dokument fiskalizowany jest podpięty polimorficznie (document_type/document_id),
-- żeby moduł dało się użyć poza warsztatem (faktury, rezerwacje, gastro itd.).
--
-- Migracja jest idempotentna (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =====================================================================

-- ── wspólny trigger updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fiscal_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── helper RLS: właściciel lub aktywny pracownik warsztatu ────────────
CREATE OR REPLACE FUNCTION public.is_fiscal_provider_member(p_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_providers sp
     WHERE sp.id = p_provider_id AND sp.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.workshop_employees we
     WHERE we.provider_id = p_provider_id
       AND we.user_id = auth.uid()
       AND COALESCE(we.is_active, true)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_fiscal_provider_owner(p_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_providers sp
     WHERE sp.id = p_provider_id AND sp.user_id = auth.uid()
  );
$$;

-- ── 1. Konfiguracja drukarek ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fiscal_printers (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id         uuid        NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  name                text        NOT NULL DEFAULT 'Drukarka fiskalna',
  -- protokół: dziś tylko ElzabESC; pole zostaje pod kolejne rodziny drukarek (Posnet, Novitus)
  protocol            text        NOT NULL DEFAULT 'elzab_esc' CHECK (protocol IN ('elzab_esc')),
  model               text,                                  -- np. 'ELZAB Zeta Online'
  -- adres osiągalny z edge function (chmura!) — LAN 192.168.x.x zadziała tylko przez tunel/port forwarding
  host                text        NOT NULL,
  port                integer     NOT NULL DEFAULT 9100 CHECK (port BETWEEN 1 AND 65535),
  connection_mode     text        NOT NULL DEFAULT 'direct' CHECK (connection_mode IN ('direct', 'tunnel')),
  -- tryb pracy urządzenia: szkoleniowy (niefiskalny) / fiskalny
  mode                text        NOT NULL DEFAULT 'training' CHECK (mode IN ('training', 'fiscal')),
  -- mapowanie stawek VAT na litery zaprogramowane w drukarce (konfigurowalne per tenant!)
  vat_map             jsonb       NOT NULL DEFAULT '{"23":"A","8":"B","5":"C","0":"D","zw":"E"}'::jsonb,
  item_name_length    smallint    NOT NULL DEFAULT 28 CHECK (item_name_length IN (28, 40)),
  default_unit        text        NOT NULL DEFAULT 'szt',
  command_timeout_ms  integer     NOT NULL DEFAULT 10000 CHECK (command_timeout_ms BETWEEN 1000 AND 60000),
  is_active           boolean     NOT NULL DEFAULT true,
  is_default          boolean     NOT NULL DEFAULT true,
  -- monitoring
  last_status         text        CHECK (last_status IN ('online', 'offline', 'error')),
  last_status_message text,
  last_seen_at        timestamptz,
  last_clock          text,                                  -- zegar odczytany z drukarki (diagnostyka)
  last_day_report_at  timestamptz,                           -- drukarka blokuje sprzedaż po 48 h bez raportu
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- jedna domyślna drukarka na tenanta
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_printers_one_default
  ON public.fiscal_printers(provider_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_fiscal_printers_provider
  ON public.fiscal_printers(provider_id) WHERE is_active;

DROP TRIGGER IF EXISTS trg_fiscal_printers_updated_at ON public.fiscal_printers;
CREATE TRIGGER trg_fiscal_printers_updated_at
  BEFORE UPDATE ON public.fiscal_printers
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

ALTER TABLE public.fiscal_printers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_printers_select ON public.fiscal_printers;
DROP POLICY IF EXISTS fiscal_printers_insert ON public.fiscal_printers;
DROP POLICY IF EXISTS fiscal_printers_update ON public.fiscal_printers;
DROP POLICY IF EXISTS fiscal_printers_delete ON public.fiscal_printers;

-- odczyt: właściciel i pracownicy (UI musi wiedzieć, czy drukarka jest online)
CREATE POLICY fiscal_printers_select ON public.fiscal_printers FOR SELECT
  USING (public.is_fiscal_provider_member(provider_id));
-- zapis konfiguracji (host/port = powierzchnia ataku): tylko właściciel
CREATE POLICY fiscal_printers_insert ON public.fiscal_printers FOR INSERT
  WITH CHECK (public.is_fiscal_provider_owner(provider_id));
CREATE POLICY fiscal_printers_update ON public.fiscal_printers FOR UPDATE
  USING (public.is_fiscal_provider_owner(provider_id))
  WITH CHECK (public.is_fiscal_provider_owner(provider_id));
CREATE POLICY fiscal_printers_delete ON public.fiscal_printers FOR DELETE
  USING (public.is_fiscal_provider_owner(provider_id));

-- ── 2. Log paragonów ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fiscal_receipts (
  id                     uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id            uuid        NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  printer_id             uuid        REFERENCES public.fiscal_printers(id) ON DELETE SET NULL,
  -- dokument źródłowy (polimorficznie — moduł ma być uniwersalny)
  document_type          text        NOT NULL DEFAULT 'workshop_order'
                                     CHECK (document_type IN ('workshop_order', 'invoice', 'booking', 'manual')),
  document_id            uuid,
  -- płatność, po której fiskalizujemy (Faza 1: gotówka, Faza 3: terminal)
  payment_id             uuid        REFERENCES public.workshop_payments(id) ON DELETE SET NULL,
  status                 text        NOT NULL DEFAULT 'pending'
                                     CHECK (status IN ('pending', 'printing', 'printed', 'failed', 'cancelled')),
  -- snapshot danych z chwili fiskalizacji (dokument może się później zmienić)
  items                  jsonb       NOT NULL,
  payments               jsonb       NOT NULL DEFAULT '[]'::jsonb,
  vat_map                jsonb       NOT NULL,
  total_grosze           bigint      NOT NULL CHECK (total_grosze >= 0),
  buyer_nip              text,
  -- wynik z drukarki
  printer_mode           text        CHECK (printer_mode IN ('training', 'fiscal')),
  printer_receipt_number integer,
  printed_at             timestamptz,
  error_code             text,
  error_message          text,
  trace                  jsonb,                              -- log komend do diagnostyki
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_receipts_provider_created
  ON public.fiscal_receipts(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_receipts_document
  ON public.fiscal_receipts(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_receipts_status
  ON public.fiscal_receipts(provider_id, status) WHERE status <> 'printed';

DROP TRIGGER IF EXISTS trg_fiscal_receipts_updated_at ON public.fiscal_receipts;
CREATE TRIGGER trg_fiscal_receipts_updated_at
  BEFORE UPDATE ON public.fiscal_receipts
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

ALTER TABLE public.fiscal_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_receipts_select ON public.fiscal_receipts;
DROP POLICY IF EXISTS fiscal_receipts_insert ON public.fiscal_receipts;

-- odczyt: właściciel i pracownicy tenanta
CREATE POLICY fiscal_receipts_select ON public.fiscal_receipts FOR SELECT
  USING (public.is_fiscal_provider_member(provider_id));
-- wpisy tworzy edge function (service_role, omija RLS); polityka INSERT jest zapasowa
CREATE POLICY fiscal_receipts_insert ON public.fiscal_receipts FOR INSERT
  WITH CHECK (public.is_fiscal_provider_member(provider_id));
-- CELOWO brak polityk UPDATE/DELETE: log paragonów jest niemodyfikowalny z poziomu klienta.
-- Zmiany statusu wykonuje wyłącznie edge function kluczem service_role.

COMMENT ON TABLE public.fiscal_printers IS
  'Konfiguracja drukarek fiskalnych per tenant (service_provider). host/port musi być osiągalny z chmury Supabase — LAN wymaga tunelu.';
COMMENT ON TABLE public.fiscal_receipts IS
  'Niemodyfikowalny log paragonów fiskalnych ze snapshotem pozycji i wynikiem z drukarki.';
COMMENT ON COLUMN public.fiscal_printers.vat_map IS
  'Mapa stawka→litera drukarki, np. {"23":"A","8":"B","5":"C","0":"D","zw":"E"}. Ustawiana per tenant — różne drukarki mają różne przypisania.';
