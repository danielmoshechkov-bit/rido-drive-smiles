-- =====================================================================
-- WYN5 — Flaga przełączania silnika: companies.uses_new_rental_engine
-- Paczka 2. Migracja ADDYTYWNA (tylko ADD COLUMN).
-- Dokument: docs/wynajem-mvp-projekt.md (pkt 12)
--
-- Stare konta flotowe: uses_new_rental_engine = false (DEFAULT) -> stara
-- ścieżka (vehicle_rentals/FleetRentalsTab) NIETKNIĘTA.
-- Nowe rejestracje: ustawiane na true -> nowy silnik (rental_subjects/bookings).
-- Rollback: ustawienie flagi z powrotem na false (dane nowe pozostają,
-- nie są źródłem prawdy dla starej ścieżki).
-- =====================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS uses_new_rental_engine boolean NOT NULL DEFAULT false;

-- =====================================================================
-- WERYFIKACJA:
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='companies'
--     AND column_name='uses_new_rental_engine';
-- =====================================================================
