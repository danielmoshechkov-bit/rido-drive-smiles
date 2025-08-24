-- Aktywuj najnowsze przypisanie pojazdu dla kierowcy
UPDATE driver_vehicle_assignments 
SET status = 'active', assigned_at = now()
WHERE id = 'd78796ef-9954-439f-83e8-e20e75e97ac3';