-- Link all drivers without fleet to Car4Ride sp. z o.o.
UPDATE drivers 
SET fleet_id = 'b780dbf2-586b-4034-9176-be5431604f3e' 
WHERE fleet_id IS NULL;