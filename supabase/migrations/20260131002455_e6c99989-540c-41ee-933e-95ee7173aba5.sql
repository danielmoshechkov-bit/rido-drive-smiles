-- Add created_by column to vehicle_rentals table
ALTER TABLE public.vehicle_rentals 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_vehicle_rentals_created_by ON public.vehicle_rentals(created_by);