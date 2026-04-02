-- Add INSERT and UPDATE policies for sms_settings
CREATE POLICY "SMS settings insert for authenticated"
ON public.sms_settings
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "SMS settings update for authenticated"
ON public.sms_settings
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "SMS settings delete for authenticated"
ON public.sms_settings
FOR DELETE
TO authenticated
USING (true);