-- Pomoc RIDO AI: watek rozmowy przy zleceniu + wpis w Centrum AI.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO TO JEST
-- ═══════════════════════════════════════════════════════════════════════════
-- Doradca naprawczy przy KONKRETNYM aucie. Mechanik opisuje objaw, moze dolozyc
-- zdjecie albo PDF; model przeszukuje internet (fora, wideo, schematy) i wraca
-- z przyczyna, punktami do sprawdzenia i LINKAMI, ktore naprawde otworzyl.
--
-- Rozmowa jest przypisana do ZLECENIA, nie do uzytkownika: mechanik zamyka okno,
-- wraca po godzinie i ma caly watek. Dane auta bierzemy ze zlecenia, wiec model
-- nie musi ich dopytywac.
--
-- Osobna tabela zamiast `ai_conversations`: tamta nie ma zaczepienia o zlecenie,
-- a dopisanie go tam mieszaloby dwie rozne rzeczy — ogolny czat portalu i watek
-- przy naprawie konkretnego auta.

BEGIN;

CREATE TABLE IF NOT EXISTS public.warsztat_pomoc_ai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.workshop_orders(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  -- [{ rola: 'czlowiek'|'rido', tresc: text, zrodla?: [{tytul,url}], zalaczniki?: int, czas: timestamptz }]
  wiadomosci jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warsztat_pomoc_ai_provider_idx
  ON public.warsztat_pomoc_ai (provider_id);

ALTER TABLE public.warsztat_pomoc_ai ENABLE ROW LEVEL SECURITY;

-- Watek widzi i prowadzi WYLACZNIE warsztat, do ktorego nalezy zlecenie.
-- `get_user_provider_ids` jest juz uzywane w tym samym celu przy historii cen.
DROP POLICY IF EXISTS "pomoc_ai_wlasny_warsztat" ON public.warsztat_pomoc_ai;
CREATE POLICY "pomoc_ai_wlasny_warsztat"
  ON public.warsztat_pomoc_ai
  FOR ALL
  TO authenticated
  USING (provider_id IN (SELECT public.get_user_provider_ids(auth.uid())))
  WITH CHECK (provider_id IN (SELECT public.get_user_provider_ids(auth.uid())));

-- ---------------------------------------------------------------------------
-- Centrum AI: obie funkcje warsztatowe do wyboru dostawcy przez administratora
-- ---------------------------------------------------------------------------
INSERT INTO public.ai_function_mapping
  (function_key, function_name, function_description, category, provider_key,
   backup_provider_key, allow_fallback, is_enabled, sort_order)
VALUES
  ('rido_help', 'Pomoc RIDO AI (naprawa)',
   'Doradca naprawczy przy konkretnym aucie — szuka w internecie, czyta zdjecia, podaje zrodla',
   'Warsztat', 'claude_haiku', 'gemini', true, true, 5)
ON CONFLICT (function_key) DO UPDATE
  SET function_name = EXCLUDED.function_name,
      function_description = EXCLUDED.function_description,
      category = EXCLUDED.category,
      is_enabled = true;

-- Rido Wycena siedziala w kategorii „text" pod surowym kluczem — administrator
-- nie mial jak jej znalezc obok pozostalych funkcji warsztatu.
UPDATE public.ai_function_mapping
   SET function_name = 'Rido Wycena (kosztorys)',
       function_description = 'Podpowiedz kwot robocizny w kosztorysie — zakres, stawka i ocena ceny',
       category = 'Warsztat',
       sort_order = 6
 WHERE function_key = 'rido_price';

DO $$
DECLARE v_ile int;
BEGIN
  SELECT count(*) INTO v_ile FROM public.ai_function_mapping
   WHERE function_key IN ('rido_help', 'rido_price') AND category = 'Warsztat';
  IF v_ile <> 2 THEN
    RAISE EXCEPTION 'Oczekiwano dwoch funkcji warsztatowych w Centrum AI, jest %', v_ile;
  END IF;
  RAISE NOTICE 'Centrum AI: Pomoc RIDO AI i Rido Wycena widoczne w kategorii Warsztat.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
