-- Add platform column to fleet_city_settings for Bolt/Uber specific settings
ALTER TABLE public.fleet_city_settings 
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'bolt';

-- Add uber_calculation_mode: 'netto' (add 25% to get brutto) or 'brutto' (use gross directly)
ALTER TABLE public.fleet_city_settings 
  ADD COLUMN IF NOT EXISTS uber_calculation_mode text DEFAULT 'netto';

-- Drop old unique constraint if exists and add new one with platform
ALTER TABLE public.fleet_city_settings 
  DROP CONSTRAINT IF EXISTS fleet_city_settings_fleet_id_city_name_key;

ALTER TABLE public.fleet_city_settings 
  ADD CONSTRAINT fleet_city_settings_fleet_id_city_name_platform_key 
  UNIQUE (fleet_id, city_name, platform);

-- Update existing rows comment to clarify they're bolt settings
COMMENT ON COLUMN public.fleet_city_settings.platform IS 'Platform: bolt or uber';
COMMENT ON COLUMN public.fleet_city_settings.uber_calculation_mode IS 'For Uber: netto (add 25% for brutto) or brutto (use gross directly)';