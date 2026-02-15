-- Fix: vehicle_owner_charges.vehicle_id must be nullable for settlement records
ALTER TABLE public.vehicle_owner_charges ALTER COLUMN vehicle_id DROP NOT NULL;