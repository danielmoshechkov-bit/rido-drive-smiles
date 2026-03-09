-- Allow fleet-level partnerships without a specific driver assigned
ALTER TABLE driver_fleet_partnerships ALTER COLUMN driver_id DROP NOT NULL;