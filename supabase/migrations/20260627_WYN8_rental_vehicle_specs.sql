-- =====================================================================
-- WYN8 — Dane techniczne + stawki domyślne pojazdu wynajmu
-- Paczka 3.1. Migracja ADDYTYWNA (tylko ADD COLUMN na NOWEJ tabeli).
-- Dokument: docs/wynajem-mvp-projekt.md (pkt 2.1 / 3)
--
-- Rozszerza rental_vehicles o specyfikację (pojemność/moc/paliwo/kolor)
-- i stawki domyślne (dzienna/tygodniowa/miesięczna + kaucja).
-- Stawki domyślne na pojeździe; per-najem nadpisywane na bookings (Cennik = później).
-- NIE rusza tabel legacy (vehicles itd.).
-- =====================================================================

ALTER TABLE public.rental_vehicles
  ADD COLUMN IF NOT EXISTS color               text,
  ADD COLUMN IF NOT EXISTS fuel                text,     -- 'benzyna'|'diesel'|'lpg'|'hybryda'|'elektryczny'|'inne'
  ADD COLUMN IF NOT EXISTS engine_capacity_cm3 integer,  -- pojemność [cm3]
  ADD COLUMN IF NOT EXISTS power_hp            integer,  -- moc [KM]
  ADD COLUMN IF NOT EXISTS rate_daily          numeric,
  ADD COLUMN IF NOT EXISTS rate_weekly         numeric,
  ADD COLUMN IF NOT EXISTS rate_monthly        numeric,
  ADD COLUMN IF NOT EXISTS deposit             numeric;

-- =====================================================================
-- WERYFIKACJA:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='rental_vehicles'
--     AND column_name IN ('color','fuel','engine_capacity_cm3','power_hp',
--       'rate_daily','rate_weekly','rate_monthly','deposit');
-- =====================================================================
