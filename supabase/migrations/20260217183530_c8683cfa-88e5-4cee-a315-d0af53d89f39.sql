
-- Table to track document requests sent to drivers
CREATE TABLE IF NOT EXISTS public.driver_document_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  fleet_id UUID REFERENCES public.fleets(id) ON DELETE CASCADE,
  template_code TEXT NOT NULL,
  template_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  filled_data JSONB DEFAULT '{}',
  contract_number TEXT,
  signed_at TIMESTAMPTZ,
  signature_url TEXT,
  signature_ip TEXT,
  signature_user_agent TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_document_requests ENABLE ROW LEVEL SECURITY;

-- Use get_user_fleet_id function for fleet ownership check
CREATE POLICY "Fleet owners manage document requests"
ON public.driver_document_requests FOR ALL
TO authenticated
USING (
  fleet_id = public.get_user_fleet_id(auth.uid())
);

-- Drivers can view their own requests via driver_app_users
CREATE POLICY "Drivers view own document requests"
ON public.driver_document_requests FOR SELECT
TO authenticated
USING (
  driver_id IN (
    SELECT dau.user_id FROM public.driver_app_users dau
    WHERE dau.user_id = auth.uid()
  )
);

-- Drivers can update their own requests (fill data, sign)
CREATE POLICY "Drivers update own document requests"
ON public.driver_document_requests FOR UPDATE
TO authenticated
USING (
  driver_id IN (
    SELECT dau.user_id FROM public.driver_app_users dau
    WHERE dau.user_id = auth.uid()
  )
);

CREATE INDEX idx_driver_doc_requests_driver ON public.driver_document_requests(driver_id);
CREATE INDEX idx_driver_doc_requests_fleet ON public.driver_document_requests(fleet_id);
CREATE INDEX idx_driver_doc_requests_status ON public.driver_document_requests(status);
