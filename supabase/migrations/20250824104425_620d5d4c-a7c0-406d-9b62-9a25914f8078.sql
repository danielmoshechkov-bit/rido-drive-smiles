-- Add email field to fleets table
ALTER TABLE public.fleets 
ADD COLUMN email text;