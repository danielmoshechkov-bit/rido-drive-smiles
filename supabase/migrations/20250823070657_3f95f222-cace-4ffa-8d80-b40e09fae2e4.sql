-- Create vehicles table
CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plate TEXT NOT NULL UNIQUE,
  vin TEXT,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  color TEXT,
  odometer INTEGER DEFAULT 0,
  status TEXT DEFAULT 'aktywne' CHECK (status IN ('aktywne', 'serwis', 'sprzedane')),
  owner_name TEXT,
  city_id UUID REFERENCES public.cities(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vehicle_policies table
CREATE TABLE public.vehicle_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'OC',
  policy_no TEXT,
  provider TEXT,
  valid_from DATE,
  valid_to DATE,
  premium DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vehicle_inspections table
CREATE TABLE public.vehicle_inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  valid_to DATE,
  result TEXT DEFAULT 'pozytywny' CHECK (result IN ('pozytywny', 'negatywny', 'warunkowo_pozytywny')),
  odometer INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
  file_url TEXT,
  file_name TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vehicle_services table
CREATE TABLE public.vehicle_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  odometer INTEGER,
  type TEXT NOT NULL,
  description TEXT,
  cost DECIMAL(10,2),
  provider TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vehicle_damages table
CREATE TABLE public.vehicle_damages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  cost DECIMAL(10,2),
  status TEXT DEFAULT 'zgłoszona' CHECK (status IN ('zgłoszona', 'w_naprawie', 'naprawiona', 'anulowana')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_damages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for all tables (admin access)
CREATE POLICY "Admins can manage vehicles" ON public.vehicles FOR ALL USING (true);
CREATE POLICY "Admins can manage vehicle policies" ON public.vehicle_policies FOR ALL USING (true);
CREATE POLICY "Admins can manage vehicle inspections" ON public.vehicle_inspections FOR ALL USING (true);
CREATE POLICY "Admins can manage documents" ON public.documents FOR ALL USING (true);
CREATE POLICY "Admins can manage vehicle services" ON public.vehicle_services FOR ALL USING (true);
CREATE POLICY "Admins can manage vehicle damages" ON public.vehicle_damages FOR ALL USING (true);

-- Create updated_at triggers
CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vehicle_policies_updated_at
  BEFORE UPDATE ON public.vehicle_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vehicle_inspections_updated_at
  BEFORE UPDATE ON public.vehicle_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vehicle_services_updated_at
  BEFORE UPDATE ON public.vehicle_services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vehicle_damages_updated_at
  BEFORE UPDATE ON public.vehicle_damages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true);

-- Create storage policies
CREATE POLICY "Anyone can view documents" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'documents');

CREATE POLICY "Admins can upload documents" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Admins can update documents" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'documents');

CREATE POLICY "Admins can delete documents" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'documents');