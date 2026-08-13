-- Globalna baza cen: pelniejszy opis auta.
--
-- Do tej pory wspolna baza pamietala tylko marke i model. To za malo, zeby
-- wycena byla trafna: rozrzad w 1.0 MPI i w 1.4 TDI to inne pieniadze, a auto
-- z 2008 roku wyceniamy inaczej niz z 2020. Dokladamy rocznik i rodzaj paliwa;
-- pojemnosc silnika kolumne juz miala, ale nigdy nie byla wypelniana (kod
-- wysylal pole o innej nazwie niz ma tabela pojazdow) — to naprawia aplikacja.
ALTER TABLE public.anonymous_service_prices
  ADD COLUMN IF NOT EXISTS vehicle_year integer,
  ADD COLUMN IF NOT EXISTS fuel_type text;

-- Dobor wycen zaczyna sie od nazwy uslugi i marki — indeks pod ten wzorzec.
CREATE INDEX IF NOT EXISTS idx_anon_prices_service_brand
  ON public.anonymous_service_prices (service_name_normalized, vehicle_brand);

COMMENT ON COLUMN public.anonymous_service_prices.vehicle_year IS
  'Rocznik pojazdu — pozwala dobrac wyceny z podobnego przedzialu wiekowego.';
COMMENT ON COLUMN public.anonymous_service_prices.fuel_type IS
  'Rodzaj paliwa (benzyna/diesel/hybryda) — rozroznia robocizne przy tym samym modelu.';
