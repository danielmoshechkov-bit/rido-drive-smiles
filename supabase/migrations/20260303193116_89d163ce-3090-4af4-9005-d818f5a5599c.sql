-- Add category field to workshop_workstations for grouping (e.g., "Warsztat", "Myjnia")
ALTER TABLE public.workshop_workstations 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'Warsztat';
