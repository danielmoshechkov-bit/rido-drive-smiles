-- Create document types table
CREATE TABLE IF NOT EXISTS public.document_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  required BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create driver documents table
CREATE TABLE IF NOT EXISTS public.driver_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  document_type_id UUID NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  file_url TEXT,
  file_name TEXT,
  expires_at DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(driver_id, document_type_id)
);

-- Enable RLS
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins can manage document types" 
ON public.document_types 
FOR ALL 
USING (true);

CREATE POLICY "Admins can manage driver documents" 
ON public.driver_documents 
FOR ALL 
USING (true);

-- Create indexes
CREATE INDEX idx_driver_documents_driver_id ON public.driver_documents(driver_id);
CREATE INDEX idx_driver_documents_status ON public.driver_documents(status);
CREATE INDEX idx_driver_documents_expires_at ON public.driver_documents(expires_at);

-- Create update trigger for driver_documents
CREATE TRIGGER update_driver_documents_updated_at
BEFORE UPDATE ON public.driver_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default document types
INSERT INTO public.document_types (name, description, required) VALUES
('Driving License', 'Valid driving license', true),
('Vehicle Registration', 'Vehicle registration documents', true),
('Insurance Policy', 'Vehicle insurance policy', true),
('Medical Certificate', 'Medical fitness certificate', false),
('Background Check', 'Criminal background check', true),
('Tax Number', 'Tax identification number', false)
ON CONFLICT (name) DO NOTHING;