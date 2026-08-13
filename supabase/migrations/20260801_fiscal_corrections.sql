-- =====================================================================
-- EWIDENCJA OCZYWISTYCH POMYŁEK — odrębna od ewidencji zwrotów
--
-- Rozporządzenie MF z 25.06.2025 rozdziela dwie ewidencje i NIE WOLNO ich łączyć:
--   • zwroty i uznane reklamacje  → public.fiscal_returns
--   • oczywiste pomyłki kasjera   → public.fiscal_corrections  (ta tabela)
--
-- Procedura przy pomyłce: wpis w tej ewidencji (z oryginałem błędnego paragonu)
-- → ponowne zaewidencjonowanie sprzedaży w prawidłowej wysokości na kasie.
-- Dlatego skorygowany paragon PRZESTAJE blokować ponowną fiskalizację dokumentu,
-- ale zostaje w logu ze statusem 'printed' — obrót fiskalny został zarejestrowany
-- i nie da się go cofnąć.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_corrections (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id        uuid        NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  -- błędny paragon (RESTRICT — ewidencja musi przetrwać)
  receipt_id         uuid        NOT NULL REFERENCES public.fiscal_receipts(id) ON DELETE RESTRICT,

  correction_number  text        NOT NULL,                     -- osobna seria: KOR/2026/001
  corrected_at       date        NOT NULL DEFAULT current_date,
  -- data pierwotnej sprzedaży i numer błędnego paragonu, przepisane do ewidencji
  sale_date          date,
  receipt_number     integer,

  -- wartość BŁĘDNIE zaewidencjonowanej sprzedaży
  wrong_amount_grosze bigint     NOT NULL CHECK (wrong_amount_grosze > 0),
  wrong_vat_grosze    bigint     NOT NULL DEFAULT 0 CHECK (wrong_vat_grosze >= 0),
  vat_breakdown       jsonb      NOT NULL DEFAULT '{}'::jsonb,
  items               jsonb      NOT NULL DEFAULT '[]'::jsonb, -- snapshot błędnych pozycji

  -- krótki opis przyczyny i okoliczności pomyłki (wymóg rozporządzenia)
  reason_note        text        NOT NULL CHECK (char_length(btrim(reason_note)) >= 5),
  -- oryginał błędnego paragonu dołączany do ewidencji
  original_receipt_attached boolean NOT NULL DEFAULT false,
  document_url       text,

  -- dowód wewnętrzny: którego raportu dotyczy korekta obrotu
  report_date        date,

  created_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_corrections_number
  ON public.fiscal_corrections (provider_id, correction_number);
CREATE INDEX IF NOT EXISTS idx_fiscal_corrections_receipt
  ON public.fiscal_corrections (receipt_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_corrections_provider_date
  ON public.fiscal_corrections (provider_id, corrected_at DESC);

DROP TRIGGER IF EXISTS trg_fiscal_corrections_updated_at ON public.fiscal_corrections;
CREATE TRIGGER trg_fiscal_corrections_updated_at
  BEFORE UPDATE ON public.fiscal_corrections
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

ALTER TABLE public.fiscal_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_corrections_select ON public.fiscal_corrections;
DROP POLICY IF EXISTS fiscal_corrections_insert ON public.fiscal_corrections;

CREATE POLICY fiscal_corrections_select ON public.fiscal_corrections FOR SELECT
  USING (public.is_fiscal_provider_member(provider_id));
CREATE POLICY fiscal_corrections_insert ON public.fiscal_corrections FOR INSERT
  WITH CHECK (public.is_fiscal_provider_member(provider_id));
-- Brak UPDATE/DELETE z klienta — ewidencja jest dokumentem księgowym.

-- ── Odblokowanie ponownej fiskalizacji po korekcie pomyłki ────────────
-- Paragon skorygowany przestaje blokować dokument, bo procedura wymaga
-- zaewidencjonowania sprzedaży NA NOWO w prawidłowej wysokości.
ALTER TABLE public.fiscal_receipts
  ADD COLUMN IF NOT EXISTS superseded_by_correction_id uuid
    REFERENCES public.fiscal_corrections(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.fiscal_receipts.superseded_by_correction_id IS
  'Wskazuje wpis w ewidencji pomyłek. Paragon zostaje ''printed'' (obrót zarejestrowany), ale nie blokuje już ponownej, prawidłowej fiskalizacji dokumentu.';

DROP INDEX IF EXISTS public.idx_fiscal_receipts_one_per_document;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_receipts_one_per_document
  ON public.fiscal_receipts (document_type, document_id)
  WHERE status IN ('printing', 'printed')
    AND document_id IS NOT NULL
    AND superseded_by_correction_id IS NULL;

COMMENT ON TABLE public.fiscal_corrections IS
  'Ewidencja oczywistych pomyłek (rozporządzenie MF 25.06.2025). ODRĘBNA od fiscal_returns — prawo zabrania łączenia obu ewidencji.';
