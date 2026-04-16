
-- Fix Pawel Muda: settlements on 44fe9b96 (Paweł Miłosz Muda), app user links to 5660e1e5 (Pawel Muda)
UPDATE driver_app_users 
SET driver_id = '44fe9b96-018b-4baf-aded-3c9470b111cd'
WHERE driver_id = '5660e1e5-5583-4c74-ae06-1e5df4561070';
