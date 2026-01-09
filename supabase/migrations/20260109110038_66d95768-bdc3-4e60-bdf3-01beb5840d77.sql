-- Add invoice_email field to fleets table
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS invoice_email TEXT;

-- Add remaining_amount and settlement_id to driver_invoices
ALTER TABLE driver_invoices ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC DEFAULT 0;
ALTER TABLE driver_invoices ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES settlements(id);

-- Create storage bucket for driver invoices
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-invoices', 'driver-invoices', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for driver-invoices bucket
CREATE POLICY "Drivers can upload their invoices"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'driver-invoices' AND 
  EXISTS (
    SELECT 1 FROM driver_app_users dau 
    WHERE dau.user_id = auth.uid()
  )
);

CREATE POLICY "Drivers can view their invoices"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'driver-invoices' AND 
  EXISTS (
    SELECT 1 FROM driver_app_users dau 
    WHERE dau.user_id = auth.uid()
  )
);

CREATE POLICY "Fleet users can view driver invoices"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'driver-invoices' AND 
  EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('fleet_settlement', 'fleet_rental', 'admin')
  )
);