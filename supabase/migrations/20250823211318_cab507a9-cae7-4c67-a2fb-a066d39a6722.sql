-- Add weekly rental fee to vehicles table
ALTER TABLE public.vehicles 
ADD COLUMN weekly_rental_fee numeric DEFAULT 0;

-- Add rental fee to settlements table
ALTER TABLE public.settlements 
ADD COLUMN rental_fee numeric DEFAULT 0;

-- Add index for better performance on rental fee queries
CREATE INDEX idx_vehicles_weekly_rental_fee ON public.vehicles(weekly_rental_fee);
CREATE INDEX idx_settlements_rental_fee ON public.settlements(rental_fee);