-- Fix RLS policies for drivers table to allow registration
-- Drop the problematic ALL policy that conflicts with INSERT
DROP POLICY IF EXISTS "Admin can manage drivers" ON drivers;

-- Ensure proper INSERT policy exists for authenticated users
DROP POLICY IF EXISTS "Authenticated users can create driver records during registration" ON drivers;
CREATE POLICY "Authenticated users can insert drivers" ON drivers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add admin SELECT policy
CREATE POLICY "Admin can view all drivers" ON drivers
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add admin UPDATE policy  
CREATE POLICY "Admin can update drivers" ON drivers
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add admin DELETE policy
CREATE POLICY "Admin can delete drivers" ON drivers
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));