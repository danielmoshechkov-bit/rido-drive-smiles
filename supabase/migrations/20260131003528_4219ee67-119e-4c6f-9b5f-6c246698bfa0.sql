-- Add missing invitation_email column to vehicle_rentals table
ALTER TABLE public.vehicle_rentals 
ADD COLUMN IF NOT EXISTS invitation_email TEXT;