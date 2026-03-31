
-- Fleet document templates (custom templates per fleet)
CREATE TABLE IF NOT EXISTS public.fleet_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  fields JSONB DEFAULT '[]'::jsonb,
  version TEXT NOT NULL DEFAULT '1.0',
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet owners can manage their templates"
  ON public.fleet_document_templates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Document instances (filled & sent documents)
CREATE TABLE IF NOT EXISTS public.fleet_document_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.fleet_document_templates(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL DEFAULT '',
  fleet_id TEXT NOT NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  filled_data JSONB DEFAULT '{}'::jsonb,
  filled_content TEXT DEFAULT '',
  attachments JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'rejected')),
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signature_url TEXT,
  rental_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_document_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet owners can manage their document instances"
  ON public.fleet_document_instances
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Storage bucket for document attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('document-attachments', 'document-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload document attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'document-attachments');

CREATE POLICY "Anyone can read document attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'document-attachments');

CREATE POLICY "Anyone can delete document attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'document-attachments');
