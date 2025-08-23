-- Add fleet_id column to drivers table to allow driver fleet assignment
ALTER TABLE public.drivers ADD COLUMN fleet_id uuid REFERENCES public.fleets(id);