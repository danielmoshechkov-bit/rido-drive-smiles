-- Add new fields to fleets table to replace address with detailed information
ALTER TABLE public.fleets 
ADD COLUMN city text,
ADD COLUMN postal_code text,
ADD COLUMN street text,
ADD COLUMN house_number text,
ADD COLUMN owner_name text,
ADD COLUMN owner_phone text,
ADD COLUMN contact_phone_for_drivers text;

-- Fix the contact_name vs contact_person issue by ensuring contact_name exists
-- (contact_name already exists, so this is just for consistency)