-- Per-provider, per-month, per-kind (ZL=manual, ZLP=portal) sequence
CREATE TABLE IF NOT EXISTS public.workshop_order_sequences (
  provider_id uuid NOT NULL,
  year int NOT NULL,
  month int NOT NULL,
  kind text NOT NULL DEFAULT 'ZL',
  last_number int NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_id, year, month, kind)
);

ALTER TABLE public.workshop_order_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers manage own sequences"
ON public.workshop_order_sequences
FOR ALL
TO authenticated
USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()))
WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

-- Function returns next number (atomic upsert)
CREATE OR REPLACE FUNCTION public.next_workshop_order_number(
  p_provider_id uuid,
  p_kind text DEFAULT 'ZL'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_month int := EXTRACT(MONTH FROM now())::int;
  v_next int;
BEGIN
  INSERT INTO public.workshop_order_sequences (provider_id, year, month, kind, last_number)
  VALUES (p_provider_id, v_year, v_month, p_kind, 1)
  ON CONFLICT (provider_id, year, month, kind)
  DO UPDATE SET last_number = workshop_order_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN p_kind || '-' || LPAD(v_month::text, 2, '0') || '/' || v_year::text || '-' || LPAD(v_next::text, 3, '0');
END;
$$;

-- Replace trigger function: pick ZLP if booking_id present, else ZL
CREATE OR REPLACE FUNCTION public.generate_workshop_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_kind text;
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    v_kind := CASE WHEN NEW.booking_id IS NOT NULL THEN 'ZLP' ELSE 'ZL' END;
    NEW.order_number := public.next_workshop_order_number(NEW.provider_id, v_kind);
  END IF;
  RETURN NEW;
END;
$$;