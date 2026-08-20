-- ============================================================================
-- NUMER TECHNICZNY — 30 DNI PIERWSZEŃSTWA PO ZAPRZESTANIU PŁATNOŚCI
--
-- Numer kosztuje nas 1,23 zł miesięcznie, więc nie trzymamy go bez końca dla
-- kogoś, kto przestał płacić. Ale zwolnienie go NATYCHMIAST jest gorsze niż
-- koszt: warsztat, który zapomni zapłacić w piątek, wróciłby w poniedziałek
-- do numeru należącego już do kogoś innego — a jego klienci dzwoniliby przez
-- kolejne miesiące pod numer obcej firmy.
--
-- Stąd: numer zostaje przypisany przez 30 dni po utracie prawa do niego.
-- Dopiero potem wraca do puli. Powracający warsztat dostaje SWÓJ numer, jeśli
-- jeszcze nie został wydany komuś innemu — pierwszeństwo działa także PO
-- zwolnieniu, dopóki numer leży wolny.
-- ============================================================================

ALTER TABLE public.voice_pula_ustawienia
  ADD COLUMN IF NOT EXISTS dni_do_zwolnienia integer NOT NULL DEFAULT 30;

-- KTO MIAŁ TEN NUMER OSTATNIO. Bez tego po zwolnieniu nie ma jak rozpoznać,
-- że wracający warsztat prosi o SWÓJ stary numer — `provider_id` jest wtedy
-- już wyzerowany, bo numer leży w puli jako wolny.
ALTER TABLE public.voice_numbers
  ADD COLUMN IF NOT EXISTS poprzedni_provider_id uuid REFERENCES public.service_providers(id);

COMMENT ON COLUMN public.voice_numbers.poprzedni_provider_id IS
  'Ostatni warsztat, ktory mial ten numer. Sluzy pierwszenstwu przy powrocie: '
  'wolny numer wraca do swojego dawnego wlasciciela, zamiast isc na poczatek kolejki.';

-- Szukanie „czy mój stary numer jest jeszcze wolny" ma być jednym trafieniem
-- w indeks, a nie przeglądaniem puli.
CREATE INDEX IF NOT EXISTS voice_numbers_poprzedni_wolny
  ON public.voice_numbers (poprzedni_provider_id)
  WHERE status = 'wolny';

-- ============================================================================
-- ZWOLNIENIE — kandydaci, nie akcja.
--
-- Funkcja tylko WSKAZUJE numery do zwolnienia. Samo zwolnienie robi worker,
-- bo trzeba przy okazji odpiąć numer w ElevenLabs, a to jest wywołanie sieciowe
-- i musi mieć ponawianie. Zwolnienie w SQL zostawiłoby numer wolny u nas
-- i nadal przypięty u nich — czyli dzwoniący trafialby do agenta warsztatu,
-- który już go nie ma.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.voice_numery_do_zwolnienia()
RETURNS TABLE (number_id uuid, phone_number text, provider_id uuid, dni_bez_prawa integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.phone_number, n.provider_id,
         EXTRACT(DAY FROM now() - GREATEST(n.przypisany_at, COALESCE(s.current_period_end, n.przypisany_at)))::integer
    FROM public.voice_numbers n
    LEFT JOIN LATERAL (
      SELECT max(bs.current_period_end) AS current_period_end
        FROM public.billing_subscriptions bs
       WHERE bs.subscriber_type = 'service_provider'
         AND bs.subscriber_id = n.provider_id
         AND bs.product_line = 'agent'
         AND bs.status IN ('active', 'trialing')
    ) s ON true
   CROSS JOIN public.voice_pula_ustawienia u
   WHERE n.status = 'aktywny'
     AND n.provider_id IS NOT NULL
     AND u.id = true
     -- BRAK SUBSKRYPCJI TO NIE JEST TO SAMO CO SUBSKRYPCJA WYGASŁA.
     -- Warsztat, ktory nigdy nie mial subskrypcji (dzis: oba nasze), nie jest
     -- tu kandydatem — inaczej reguła 30 dni zwolniłaby numery kont testowych
     -- i wszystkich, ktorym nadalismy dostep recznie.
     AND s.current_period_end IS NOT NULL
     AND s.current_period_end < now() - make_interval(days => u.dni_do_zwolnienia);
$$;

GRANT EXECUTE ON FUNCTION public.voice_numery_do_zwolnienia() TO service_role;
