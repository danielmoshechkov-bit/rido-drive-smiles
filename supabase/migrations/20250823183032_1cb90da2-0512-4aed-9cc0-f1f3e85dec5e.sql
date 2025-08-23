-- Fix function search path security issues
CREATE OR REPLACE FUNCTION public.initialize_driver_documents()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- Insert default document statuses for new driver
  INSERT INTO public.driver_document_statuses (driver_id, document_type, status)
  VALUES 
    (NEW.id, 'rodo', 'pending'),
    (NEW.id, 'lease_agreement', 'pending'),
    (NEW.id, 'service_contract', 'pending');
  
  RETURN NEW;
END;
$$;

-- Fix existing functions to have proper search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.vehicles_uppercase_plate_vin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plate IS NOT NULL THEN NEW.plate := UPPER(NEW.plate); END IF;
  IF NEW.vin IS NOT NULL THEN NEW.vin := UPPER(NEW.vin); END IF;
  RETURN NEW;
END;
$$;