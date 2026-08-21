-- ============================================================================
-- ZNANE ROZJAZDY KONFIGURACJI — lista wyjątków z powodem i datą
--
-- Kontrola dzienna porównuje konfigurację w ElevenLabs z oczekiwaną. Bez listy
-- wyjątków świeciłaby codziennie na tym samym wpisie i po tygodniu nauczyłaby
-- nas ją zamykać bez czytania — czyli przestałaby być kontrolą (zasada 28).
--
-- To NIE JEST rejestr długu. To rejestr FAKTÓW: pierwszy warsztat powstał przed
-- automatem aktywacji i ma konfigurację z tamtej epoki. Ona działa. Wyrównanie
-- jest okazją, nie naprawą.
--
-- NOWY rozjazd na czymkolwiek spoza tej listy = alarm.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.voice_znane_rozjazdy (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  czego       text NOT NULL,          -- 'custom_llm_url', 'agent_id', 'post_call_webhook'
  numer       text,                   -- numer, którego dotyczy; NULL = dotyczy agenta
  powod       text NOT NULL,
  odnotowano  date NOT NULL DEFAULT current_date,
  wygasa      date,                   -- do kiedy wyjątek jest ważny; NULL = bezterminowo
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voice_znane_rozjazdy_powod CHECK (length(btrim(powod)) >= 10)
);

CREATE UNIQUE INDEX IF NOT EXISTS voice_znane_rozjazdy_klucz
  ON public.voice_znane_rozjazdy (czego, COALESCE(numer, ''));

ALTER TABLE public.voice_znane_rozjazdy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voice_znane_rozjazdy_admin ON public.voice_znane_rozjazdy;
CREATE POLICY voice_znane_rozjazdy_admin ON public.voice_znane_rozjazdy
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- PIERWSZY WPIS — powód opisuje FAKT, nie usterkę.
INSERT INTO public.voice_znane_rozjazdy (czego, numer, powod)
VALUES ('custom_llm_url', '48221015896',
        'Konfiguracja sprzed automatu aktywacji: adres Custom-LLM niesie provider_id '
        'pierwszego warsztatu. Dla TEGO numeru jest poprawna i dziala. '
        'Wyrownac przy najblizszej okazji, razem z przejsciem na provider_id '
        'z rozpoznania po called_number.')
ON CONFLICT (czego, COALESCE(numer, '')) DO NOTHING;

-- ============================================================================
-- CZY ROZJAZD JEST ZNANY. Wyjątek z datą wygaśnięcia przestaje działać sam —
-- inaczej lista wyjątków rośnie i nigdy nie maleje.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.voice_rozjazd_znany(p_czego text, p_numer text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.voice_znane_rozjazdy
     WHERE czego = p_czego
       AND COALESCE(numer, '') = COALESCE(p_numer, '')
       AND (wygasa IS NULL OR wygasa >= current_date)
  );
$$;

GRANT EXECUTE ON FUNCTION public.voice_rozjazd_znany(text, text) TO service_role;
