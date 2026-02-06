-- Add is_active column to entities table for business account deactivation
ALTER TABLE entities 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;