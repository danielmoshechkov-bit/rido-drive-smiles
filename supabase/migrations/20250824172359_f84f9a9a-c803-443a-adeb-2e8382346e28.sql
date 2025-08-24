-- Update existing vehicles that have city_id as null by getting the city_id from the assigned driver
UPDATE vehicles 
SET city_id = (
  SELECT COALESCE(d.city_id, dau.city_id) 
  FROM driver_vehicle_assignments dva
  LEFT JOIN drivers d ON d.id = dva.driver_id
  LEFT JOIN driver_app_users dau ON dau.driver_id = dva.driver_id
  WHERE dva.vehicle_id = vehicles.id 
    AND dva.status = 'active'
  LIMIT 1
)
WHERE city_id IS NULL;