-- Add payout_requested_at column to driver_app_users
-- This column tracks when a driver requested an immediate payout
ALTER TABLE driver_app_users 
ADD COLUMN IF NOT EXISTS payout_requested_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;