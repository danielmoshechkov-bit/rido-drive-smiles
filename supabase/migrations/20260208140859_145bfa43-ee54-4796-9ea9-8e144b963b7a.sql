-- ZMIANA FK NA CASCADE dla tabel które blokują usuwanie kierowców

-- 1. fuel_cards
ALTER TABLE public.fuel_cards DROP CONSTRAINT IF EXISTS fuel_cards_driver_id_fkey;
ALTER TABLE public.fuel_cards ADD CONSTRAINT fuel_cards_driver_id_fkey 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

-- 2. driver_app_users
ALTER TABLE public.driver_app_users DROP CONSTRAINT IF EXISTS driver_app_users_driver_id_fkey;
ALTER TABLE public.driver_app_users ADD CONSTRAINT driver_app_users_driver_id_fkey 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

-- 3. messages
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_driver_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_driver_id_fkey 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

-- 4. marketplace_listings
ALTER TABLE public.marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_driver_id_fkey;
ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_driver_id_fkey 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

-- 5. autofactoring_agreements
ALTER TABLE public.autofactoring_agreements DROP CONSTRAINT IF EXISTS autofactoring_agreements_driver_id_fkey;
ALTER TABLE public.autofactoring_agreements ADD CONSTRAINT autofactoring_agreements_driver_id_fkey 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

-- 6. Bonus: rides_raw, settlements_weekly, fleet_invitations, unmapped_settlement_drivers, settlement_import_diagnostics mają SET NULL (a) - zmień na CASCADE
ALTER TABLE public.rides_raw DROP CONSTRAINT IF EXISTS rides_raw_driver_id_fkey;
ALTER TABLE public.rides_raw ADD CONSTRAINT rides_raw_driver_id_fkey 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

ALTER TABLE public.settlements_weekly DROP CONSTRAINT IF EXISTS settlements_weekly_driver_id_fkey;
ALTER TABLE public.settlements_weekly ADD CONSTRAINT settlements_weekly_driver_id_fkey 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

ALTER TABLE public.fleet_invitations DROP CONSTRAINT IF EXISTS fleet_invitations_driver_id_fkey;
ALTER TABLE public.fleet_invitations ADD CONSTRAINT fleet_invitations_driver_id_fkey 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

ALTER TABLE public.unmapped_settlement_drivers DROP CONSTRAINT IF EXISTS unmapped_settlement_drivers_driver_id_fkey;
ALTER TABLE public.unmapped_settlement_drivers ADD CONSTRAINT unmapped_settlement_drivers_driver_id_fkey 
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

ALTER TABLE public.unmapped_settlement_drivers DROP CONSTRAINT IF EXISTS unmapped_settlement_drivers_linked_driver_id_fkey;
ALTER TABLE public.unmapped_settlement_drivers ADD CONSTRAINT unmapped_settlement_drivers_linked_driver_id_fkey 
  FOREIGN KEY (linked_driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

ALTER TABLE public.settlement_import_diagnostics DROP CONSTRAINT IF EXISTS settlement_import_diagnostics_matched_driver_id_fkey;
ALTER TABLE public.settlement_import_diagnostics ADD CONSTRAINT settlement_import_diagnostics_matched_driver_id_fkey 
  FOREIGN KEY (matched_driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

ALTER TABLE public.settlement_import_diagnostics DROP CONSTRAINT IF EXISTS settlement_import_diagnostics_created_driver_id_fkey;
ALTER TABLE public.settlement_import_diagnostics ADD CONSTRAINT settlement_import_diagnostics_created_driver_id_fkey 
  FOREIGN KEY (created_driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;