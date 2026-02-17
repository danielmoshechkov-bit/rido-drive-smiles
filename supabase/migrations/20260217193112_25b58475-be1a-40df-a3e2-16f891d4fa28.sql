-- Fix RLS policies for driver_document_requests
-- The bug: policies select dau.user_id instead of dau.driver_id

DROP POLICY IF EXISTS "Drivers view own document requests" ON public.driver_document_requests;
DROP POLICY IF EXISTS "Drivers update own document requests" ON public.driver_document_requests;

CREATE POLICY "Drivers view own document requests"
ON public.driver_document_requests
FOR SELECT
TO authenticated
USING (
  driver_id IN (
    SELECT dau.driver_id FROM driver_app_users dau WHERE dau.user_id = auth.uid()
  )
);

CREATE POLICY "Drivers update own document requests"
ON public.driver_document_requests
FOR UPDATE
TO authenticated
USING (
  driver_id IN (
    SELECT dau.driver_id FROM driver_app_users dau WHERE dau.user_id = auth.uid()
  )
);