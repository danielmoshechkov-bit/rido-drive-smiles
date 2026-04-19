
-- 1. Galeria zdjęć usługodawcy (osobna od logo i cover)
ALTER TABLE public.service_providers 
  ADD COLUMN IF NOT EXISTS gallery_photos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Rozszerzenie rezerwacji o dane pojazdu i flagę potwierdzenia
ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS vehicle_brand text,
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS vehicle_year integer,
  ADD COLUMN IF NOT EXISTS vehicle_plate text,
  ADD COLUMN IF NOT EXISTS requires_provider_confirmation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS provider_confirmed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'portal';

-- 3. Indeks dla szybkiego pobierania rezerwacji warsztatu
CREATE INDEX IF NOT EXISTS idx_service_bookings_provider_date 
  ON public.service_bookings(provider_id, scheduled_date);
