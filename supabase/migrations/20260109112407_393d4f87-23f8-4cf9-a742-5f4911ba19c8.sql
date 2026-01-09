-- Add new columns to drivers table for extended profile data
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS pesel TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS license_expiry_date DATE;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS license_is_unlimited BOOLEAN DEFAULT false;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS license_issue_date DATE;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS taxi_id_number TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS address_postal_code TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS address_country TEXT DEFAULT 'Polska';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS correspondence_street TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS correspondence_city TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS correspondence_postal_code TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS correspondence_country TEXT DEFAULT 'Polska';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS is_foreigner BOOLEAN DEFAULT false;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS rodo_consent_data_storage BOOLEAN DEFAULT false;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS rodo_consent_data_sharing BOOLEAN DEFAULT false;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS rodo_consent_date TIMESTAMP WITH TIME ZONE;

-- Insert new document types for driver onboarding
INSERT INTO public.document_types (id, name, description, required) VALUES
  (gen_random_uuid(), 'Prawo jazdy - przód', 'Zdjęcie przedniej strony prawa jazdy', true),
  (gen_random_uuid(), 'Prawo jazdy - tył', 'Zdjęcie tylnej strony prawa jazdy', true),
  (gen_random_uuid(), 'Badanie lekarskie', 'Zaświadczenie o badaniu lekarskim', true),
  (gen_random_uuid(), 'Badanie psychologiczne', 'Zaświadczenie o badaniu psychologicznym', true),
  (gen_random_uuid(), 'Zaświadczenie o niekaralności', 'Zaświadczenie o niekaralności (PL)', false),
  (gen_random_uuid(), 'Niekaralność z kraju pochodzenia', 'Dla obcokrajowców - niekaralność z kraju pochodzenia', false),
  (gen_random_uuid(), 'Tłumaczenie przysięgłe niekaralności', 'Tłumaczenie przysięgłe dokumentu niekaralności', false),
  (gen_random_uuid(), 'Identyfikator taxi - przód', 'Zdjęcie przedniej strony identyfikatora taxi', false),
  (gen_random_uuid(), 'Identyfikator taxi - tył', 'Zdjęcie tylnej strony identyfikatora taxi', false)
ON CONFLICT DO NOTHING;

-- Create storage bucket for driver documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('driver-documents', 'driver-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for driver-documents bucket
CREATE POLICY "Drivers can upload own documents" 
ON storage.objects 
FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'driver-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Drivers can view own documents" 
ON storage.objects 
FOR SELECT 
TO authenticated 
USING (bucket_id = 'driver-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Fleet users can view driver documents" 
ON storage.objects 
FOR SELECT 
TO authenticated 
USING (
  bucket_id = 'driver-documents' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('fleet_settlement', 'fleet_rental', 'admin')
  )
);