-- Zapamietane odpowiedzi asystenta w Rido Wycenie.
--
-- Kazde otwarcie wyceny pytalo model od nowa — nawet o dokladnie to samo
-- (ta sama usluga, to samo auto). To sekundy czekania i koszt zapytania za
-- kazdym razem. Tutaj trzymamy gotowa odpowiedz: drugie otwarcie jest
-- natychmiastowe i nic nie kosztuje.
--
-- Klucz celowo NIE jest dokladny co do centymetra: silnik zaokraglamy do 100 cm3,
-- a rocznik do 3 lat, bo Insignia 1598 cm3 z 2016 i 1600 cm3 z 2017 to dla wyceny
-- to samo auto. Dzieki temu trafien jest duzo wiecej.

CREATE TABLE IF NOT EXISTS public.ai_price_cache (
  cache_key text PRIMARY KEY,
  service_name text NOT NULL,
  vehicle_brand text,
  vehicle_model text,
  engine_bucket integer,
  year_bucket integer,
  price_mode text NOT NULL CHECK (price_mode IN ('net', 'gross')),
  min_price numeric,
  max_price numeric,
  note text,
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_price_cache_swiezosc ON public.ai_price_cache (created_at DESC);

ALTER TABLE public.ai_price_cache ENABLE ROW LEVEL SECURITY;

-- To dane rynkowe (usluga + auto + widelki), bez klienta i bez warsztatu —
-- tak samo jak wspolna baza cen: czytaja i dopisuja zalogowani.
DROP POLICY IF EXISTS "ai_price_cache_read" ON public.ai_price_cache;
CREATE POLICY "ai_price_cache_read" ON public.ai_price_cache
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ai_price_cache_write" ON public.ai_price_cache;
CREATE POLICY "ai_price_cache_write" ON public.ai_price_cache
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ai_price_cache_update" ON public.ai_price_cache;
CREATE POLICY "ai_price_cache_update" ON public.ai_price_cache
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ai_price_cache IS
  'Zapamietane wyceny asystenta (usluga + auto + tryb cen). Wpisy starsze niz 90 dni sa pomijane przy odczycie.';
