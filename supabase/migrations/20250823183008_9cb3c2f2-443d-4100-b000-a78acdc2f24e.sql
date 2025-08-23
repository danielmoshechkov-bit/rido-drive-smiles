-- Add registration_date and billing_method to drivers table
ALTER TABLE public.drivers 
ADD COLUMN registration_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN billing_method TEXT DEFAULT '39+8%';

-- Create driver document statuses table
CREATE TABLE public.driver_document_statuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- 'rodo', 'lease_agreement', 'service_contract'
  status TEXT DEFAULT 'pending', -- 'pending', 'uploaded', 'approved'
  date_uploaded TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(driver_id, document_type)
);

-- Enable RLS
ALTER TABLE public.driver_document_statuses ENABLE ROW LEVEL SECURITY;

-- Create policy for document statuses
CREATE POLICY "Admins can manage document statuses" 
ON public.driver_document_statuses 
FOR ALL 
USING (true);

-- Create driver vehicle assignments table
CREATE TABLE public.driver_vehicle_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active', -- 'active', 'inactive'
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  unassigned_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;

-- Create policy for assignments
CREATE POLICY "Admins can manage assignments" 
ON public.driver_vehicle_assignments 
FOR ALL 
USING (true);

-- Create triggers for updated_at
CREATE TRIGGER update_driver_document_statuses_updated_at
BEFORE UPDATE ON public.driver_document_statuses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_driver_vehicle_assignments_updated_at
BEFORE UPDATE ON public.driver_vehicle_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to initialize driver documents
CREATE OR REPLACE FUNCTION public.initialize_driver_documents()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert default document statuses for new driver
  INSERT INTO public.driver_document_statuses (driver_id, document_type, status)
  VALUES 
    (NEW.id, 'rodo', 'pending'),
    (NEW.id, 'lease_agreement', 'pending'),
    (NEW.id, 'service_contract', 'pending');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to initialize documents for new drivers
CREATE TRIGGER initialize_documents_on_driver_creation
AFTER INSERT ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION public.initialize_driver_documents();