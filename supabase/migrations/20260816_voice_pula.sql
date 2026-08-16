-- ============================================================================
-- PULA NUMERÓW — ustawienia i stan zadania czekającego na zgodę.
--
-- Próg jest KOLUMNĄ, nie stałą w kodzie: przy pierwszym kliencie 2 wystarczy,
-- przy piątym warsztacie podniesiemy bez wdrożenia.
--
-- `max_zakupow_na_dobe` to bezpiecznik, nie limit biznesowy. Gdyby licznik
-- wolnych numerów zwariował albo próg został źle zapisany, straty ograniczają
-- się do trzech numerów (3,69 zł) zamiast do wyczerpania salda prepaid.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.voice_pula_ustawienia (
  id                    boolean PRIMARY KEY DEFAULT true CHECK (id),  -- jeden wiersz, wymuszony typem
  prog_wolnych          integer NOT NULL DEFAULT 2  CHECK (prog_wolnych BETWEEN 0 AND 50),
  max_zakupow_na_dobe   integer NOT NULL DEFAULT 3  CHECK (max_zakupow_na_dobe BETWEEN 0 AND 20),
  pierwszy_zakup_zrobiony boolean NOT NULL DEFAULT false,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.voice_pula_ustawienia (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.voice_pula_ustawienia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voice_pula_ustawienia admin" ON public.voice_pula_ustawienia;
CREATE POLICY "voice_pula_ustawienia admin" ON public.voice_pula_ustawienia
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- PIERWSZY ZAKUP CZEKA NA CZŁOWIEKA.
-- To jedyny moment, w którym automat po raz pierwszy wydaje prawdziwe
-- pieniądze — ma zostać zobaczony, zanim się wydarzy. Po pierwszym udanym
-- zakupie flaga `pierwszy_zakup_zrobiony` zdejmuje ten wymóg na stałe.
ALTER TABLE public.voice_number_jobs DROP CONSTRAINT IF EXISTS voice_number_jobs_status_check;
ALTER TABLE public.voice_number_jobs
  ADD CONSTRAINT voice_number_jobs_status_check
  CHECK (status IN ('oczekuje','w_toku','zrobione','wymaga_uwagi','czeka_na_zgode'));

COMMENT ON TABLE public.voice_pula_ustawienia IS
  'Jeden wiersz. Próg puli i bezpiecznik zakupów — świadomie w bazie, nie w kodzie.';
