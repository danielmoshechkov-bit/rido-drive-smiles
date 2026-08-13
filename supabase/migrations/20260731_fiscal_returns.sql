-- =====================================================================
-- FISKALIZACJA — ewidencja zwrotów i reklamacji
--
-- Paragonu fiskalnego nie da się cofnąć: obrót jest już zarejestrowany w pamięci
-- fiskalnej. Zwrot obsługuje się przez ODRĘBNĄ EWIDENCJĘ prowadzoną poza kasą,
-- zgodnie z rozporządzeniem o kasach rejestrujących. Ten moduł nigdy nie wysyła
-- niczego do drukarki — oryginalny paragon zostaje nietknięty.
--
-- Branżowo neutralne: jedyny klucz obcy prowadzi do fiscal_receipts (wewnątrz modułu).
-- Migracja idempotentna. Wymaga 20260730_fiscal_core.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_returns (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id       uuid        NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  -- oryginalny paragon; RESTRICT, bo ewidencja musi przetrwać dłużej niż wpis w logu
  receipt_id        uuid        NOT NULL REFERENCES public.fiscal_receipts(id) ON DELETE RESTRICT,

  -- pola wymagane rozporządzeniem
  return_number     text        NOT NULL,                    -- osobna seria: ZW/2026/001
  returned_at       date        NOT NULL DEFAULT current_date,
  reason            text        NOT NULL CHECK (reason IN ('zwrot_towaru', 'reklamacja', 'pomylka_kasjera')),
  reason_note       text,
  items             jsonb       NOT NULL,                    -- pozycje zwracane (snapshot z paragonu)
  amount_grosze     bigint      NOT NULL CHECK (amount_grosze > 0),
  vat_breakdown     jsonb       NOT NULL DEFAULT '{}'::jsonb, -- kwoty netto/VAT wg stawek

  -- protokół podpisany przez klienta
  customer_name     text,
  customer_document text,
  signed_at         timestamptz,
  document_url      text,

  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- numeracja unikalna w obrębie tenanta
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_returns_number
  ON public.fiscal_returns (provider_id, return_number);
CREATE INDEX IF NOT EXISTS idx_fiscal_returns_receipt
  ON public.fiscal_returns (receipt_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_returns_provider_date
  ON public.fiscal_returns (provider_id, returned_at DESC);

DROP TRIGGER IF EXISTS trg_fiscal_returns_updated_at ON public.fiscal_returns;
CREATE TRIGGER trg_fiscal_returns_updated_at
  BEFORE UPDATE ON public.fiscal_returns
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

-- ── Kontrola sumy zwrotów ─────────────────────────────────────────────
-- Suma zwrotów do jednego paragonu nie może przekroczyć jego kwoty — inaczej
-- ewidencja rozjedzie się z zarejestrowanym obrotem.
CREATE OR REPLACE FUNCTION public.fiscal_returns_check_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_receipt_total bigint;
  v_already       bigint;
BEGIN
  SELECT total_grosze INTO v_receipt_total
    FROM public.fiscal_receipts WHERE id = NEW.receipt_id;

  IF v_receipt_total IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono paragonu dla zwrotu.';
  END IF;

  SELECT COALESCE(SUM(amount_grosze), 0) INTO v_already
    FROM public.fiscal_returns
   WHERE receipt_id = NEW.receipt_id
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_already + NEW.amount_grosze > v_receipt_total THEN
    -- plpgsql nie zna specyfikatorów typu %.2f — kwoty zaokrąglamy w SQL.
    RAISE EXCEPTION 'Suma zwrotow (% zl) przekracza kwote paragonu (% zl).',
      round((v_already + NEW.amount_grosze) / 100.0, 2), round(v_receipt_total / 100.0, 2);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fiscal_returns_check_amount ON public.fiscal_returns;
CREATE TRIGGER trg_fiscal_returns_check_amount
  BEFORE INSERT OR UPDATE ON public.fiscal_returns
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_returns_check_amount();

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.fiscal_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_returns_select ON public.fiscal_returns;
DROP POLICY IF EXISTS fiscal_returns_insert ON public.fiscal_returns;

CREATE POLICY fiscal_returns_select ON public.fiscal_returns FOR SELECT
  USING (public.is_fiscal_provider_member(provider_id));
CREATE POLICY fiscal_returns_insert ON public.fiscal_returns FOR INSERT
  WITH CHECK (public.is_fiscal_provider_member(provider_id));
-- CELOWO brak UPDATE/DELETE: ewidencja zwrotów jest dokumentem księgowym.
-- Korekty wyłącznie przez edge function (service_role), ze śladem w polu reason_note.

COMMENT ON TABLE public.fiscal_returns IS
  'Ewidencja zwrotów i reklamacji do paragonów fiskalnych (rozporządzenie o kasach). Poza pamięcią fiskalną — nie dotyka drukarki.';
COMMENT ON COLUMN public.fiscal_returns.return_number IS
  'Numer w osobnej serii ZW/RRRR/NNN, niezależnej od numeracji faktur i zleceń.';
