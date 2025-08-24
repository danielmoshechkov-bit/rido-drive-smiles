-- Deactivate older duplicate assignment to fix rental fee display
UPDATE driver_vehicle_assignments 
SET status = 'inactive', 
    unassigned_at = now(),
    updated_at = now()
WHERE id = 'ad1cc7e7-1549-468d-bf89-e9b99e08fd0e' 
  AND status = 'active';