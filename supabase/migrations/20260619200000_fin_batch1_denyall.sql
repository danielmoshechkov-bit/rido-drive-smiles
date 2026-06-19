-- TURA finanse — PARTIA 1: deny-all dla tabel bez żadnego czytelnika w kodzie
-- ---------------------------------------------------------------------------
-- fuel_cards (numery kart), rides_raw (kwoty przejazdów), driver_settlements
-- miały ALL USING(true) (nazwa "Admins can manage…" myląca — realnie otwarte dla
-- KAŻDEGO, read+write). Brak referencji w src/ ORAZ supabase/functions/ (0 kodu),
-- 0 wierszy. DROP polityk, bez CREATE = deny-all dla authenticated/anon.
-- Service-role omija RLS → gdyby kiedyś ruszył import, działa bez zmian.

DROP POLICY IF EXISTS "Admins can manage fuel cards"         ON public.fuel_cards;
DROP POLICY IF EXISTS "Admins can manage rides raw"          ON public.rides_raw;
DROP POLICY IF EXISTS "Admins can manage driver settlements" ON public.driver_settlements;

-- (świadomie brak CREATE → RLS on + 0 polityk = deny-all dla zwykłych userów)

-- =========================================================================
-- ROLLBACK (przywraca permisywne polityki sprzed PARTII 1):
-- =========================================================================
-- CREATE POLICY "Admins can manage fuel cards"         ON public.fuel_cards         FOR ALL TO public USING (true);
-- CREATE POLICY "Admins can manage rides raw"          ON public.rides_raw          FOR ALL TO public USING (true);
-- CREATE POLICY "Admins can manage driver settlements" ON public.driver_settlements FOR ALL TO public USING (true);
