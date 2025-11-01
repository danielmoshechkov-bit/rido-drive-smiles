-- Add fuel_card_pin column to drivers table
ALTER TABLE public.drivers 
ADD COLUMN fuel_card_pin text;

COMMENT ON COLUMN public.drivers.fuel_card_pin IS 'PIN do karty paliwowej kierowcy - tylko do odczytu dla kierowcy';