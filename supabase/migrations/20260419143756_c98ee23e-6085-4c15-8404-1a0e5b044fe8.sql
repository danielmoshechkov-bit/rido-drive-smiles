-- Naprawa FK service_bookings.service_id: powinna wskazywać na provider_services (gdzie usługodawcy zapisują usługi)
-- oraz na services (legacy). Najprostsze: usuwamy stary FK do `services`, NIE dodajemy nowego (bo są dwa źródła).
-- Walidacja istnienia jest w aplikacji + RLS.
ALTER TABLE public.service_bookings DROP CONSTRAINT IF EXISTS service_bookings_service_id_fkey;