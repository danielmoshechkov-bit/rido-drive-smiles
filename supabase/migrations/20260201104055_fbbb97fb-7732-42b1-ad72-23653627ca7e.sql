-- Allow fleet users to upload to driver-documents bucket (for signatures)
CREATE POLICY "Fleet users can upload driver documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'driver-documents'
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('fleet_settlement', 'fleet_rental', 'admin')
  )
);

-- Allow fleet users to update driver documents
CREATE POLICY "Fleet users can update driver documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'driver-documents'
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('fleet_settlement', 'fleet_rental', 'admin')
  )
);