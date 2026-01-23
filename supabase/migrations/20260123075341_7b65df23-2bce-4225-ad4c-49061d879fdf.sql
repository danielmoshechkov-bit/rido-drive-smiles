-- Add payment_preference column to driver_b2b_profiles
ALTER TABLE driver_b2b_profiles 
ADD COLUMN IF NOT EXISTS payment_preference TEXT DEFAULT 'transfer' 
CHECK (payment_preference IN ('transfer', 'cash'));