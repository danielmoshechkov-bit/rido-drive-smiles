-- KROK 1: Usuń dane z tabel zależnych najpierw
DELETE FROM public.rides_raw;
DELETE FROM public.settlements;
DELETE FROM public.driver_platform_ids;
DELETE FROM public.settlement_periods;

-- KROK 2: Usuń wszystkich kierowców
DELETE FROM public.drivers;

-- KROK 3: Usuń kolumnę platform_ids z drivers (nie jest już używana)
ALTER TABLE public.drivers DROP COLUMN IF EXISTS platform_ids;