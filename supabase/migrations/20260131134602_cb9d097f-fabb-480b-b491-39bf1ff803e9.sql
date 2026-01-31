-- Allow public to insert signature logs (for legal audit trail)
ALTER TABLE public.contract_signature_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert contract signature logs"
ON public.contract_signature_logs
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Fleet managers can read signature logs"
ON public.contract_signature_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM vehicle_rentals vr 
    JOIN fleet_delegated_roles fdr ON vr.fleet_id = fdr.fleet_id
    WHERE vr.id = contract_signature_logs.rental_id
    AND fdr.assigned_to_user_id = auth.uid()
  )
);