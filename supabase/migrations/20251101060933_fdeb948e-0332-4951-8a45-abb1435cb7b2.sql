-- Add getrido_id to drivers table for easy driver search
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS getrido_id TEXT;

CREATE INDEX IF NOT EXISTS idx_drivers_getrido_id 
ON public.drivers(getrido_id);

-- Add fleet_id to system_alerts for fleet-specific alerts
ALTER TABLE public.system_alerts
ADD COLUMN IF NOT EXISTS fleet_id UUID REFERENCES public.fleets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_system_alerts_fleet_id 
ON public.system_alerts(fleet_id);

-- Add new alert types for fleet users
COMMENT ON COLUMN public.system_alerts.type IS 
'Alert types: error, warning, info, new_driver, vehicle_expiry, driver_debt, driver_left, admin_message, fleet_change';