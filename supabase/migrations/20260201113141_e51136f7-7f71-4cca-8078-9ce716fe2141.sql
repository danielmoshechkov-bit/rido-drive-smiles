-- Add stamp_url column to fleet_signatures for fleet stamp images
ALTER TABLE fleet_signatures ADD COLUMN IF NOT EXISTS stamp_url TEXT;