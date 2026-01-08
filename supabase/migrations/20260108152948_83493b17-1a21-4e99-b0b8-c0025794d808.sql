-- Create driver_invoices table for B2B invoice tracking
CREATE TABLE public.driver_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  
  -- Invoice amounts
  invoice_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  
  -- Status and files
  status TEXT NOT NULL DEFAULT 'pending',
  file_url TEXT,
  file_name TEXT,
  uploaded_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(driver_id, period_year, period_month)
);

-- Enable RLS
ALTER TABLE public.driver_invoices ENABLE ROW LEVEL SECURITY;

-- Policies for driver_invoices
CREATE POLICY "Drivers can view their own invoices"
ON public.driver_invoices
FOR SELECT
TO authenticated
USING (driver_id IN (
  SELECT driver_id FROM public.driver_app_users WHERE user_id = auth.uid()
));

CREATE POLICY "Drivers can update their own invoices"
ON public.driver_invoices
FOR UPDATE
TO authenticated
USING (driver_id IN (
  SELECT driver_id FROM public.driver_app_users WHERE user_id = auth.uid()
));

CREATE POLICY "Fleet users can view invoices for their drivers"
ON public.driver_invoices
FOR SELECT
TO authenticated
USING (driver_id IN (
  SELECT id FROM public.drivers WHERE fleet_id = get_user_fleet_id(auth.uid())
));

CREATE POLICY "Fleet users can manage invoices for their drivers"
ON public.driver_invoices
FOR ALL
TO authenticated
USING (driver_id IN (
  SELECT id FROM public.drivers WHERE fleet_id = get_user_fleet_id(auth.uid())
));

-- Create trigger for updated_at
CREATE TRIGGER update_driver_invoices_updated_at
BEFORE UPDATE ON public.driver_invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();