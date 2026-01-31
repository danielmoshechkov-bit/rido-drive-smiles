-- Dodaj brakujące statusy do constraint
ALTER TABLE vehicle_rentals DROP CONSTRAINT IF EXISTS vehicle_rentals_status_check;

ALTER TABLE vehicle_rentals ADD CONSTRAINT vehicle_rentals_status_check 
CHECK (status = ANY (ARRAY[
  'pending'::text, 
  'accepted'::text, 
  'active'::text, 
  'completed'::text, 
  'cancelled'::text, 
  'rejected'::text,
  'draft'::text,
  'pending_signature'::text,
  'signed'::text,
  'finalized'::text
]));