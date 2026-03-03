-- Change order number format from "ZL X/MM/YYYY" to "SRV-YYYYMM-X"
CREATE OR REPLACE FUNCTION public.generate_workshop_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'SRV-' || 
      EXTRACT(YEAR FROM now())::text || 
      LPAD(EXTRACT(MONTH FROM now())::text, 2, '0') || '-' ||
      nextval('workshop_order_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;