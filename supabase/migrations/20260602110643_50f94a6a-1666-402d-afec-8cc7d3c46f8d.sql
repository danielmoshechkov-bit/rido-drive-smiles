-- Sequential, gap-filling workshop order numbering per provider/month/kind
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
  v_prefix text := p_kind || '-' || LPAD(v_month::text, 2, '0') || '/' || v_year::text || '-';
  v_max int;
  v_next int;
BEGIN
  -- Lock the sequence row to serialize concurrent inserts
  INSERT INTO public.workshop_order_sequences (provider_id, year, month, kind, last_number)
  VALUES (p_provider_id, v_year, v_month, p_kind, 0)
  ON CONFLICT (provider_id, year, month, kind) DO UPDATE SET last_number = workshop_order_sequences.last_number;

  -- Largest currently used number for this provider/month/kind
  SELECT COALESCE(MAX(NULLIF(regexp_replace(SPLIT_PART(order_number, '-', 3), '\D', '', 'g'), '')::int), 0)
    INTO v_max
  FROM public.workshop_orders
  WHERE provider_id = p_provider_id
    AND order_number LIKE v_prefix || '%';

  -- Find smallest unused number from 1..v_max+1
  SELECT MIN(s) INTO v_next
  FROM generate_series(1, v_max + 1) s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.workshop_orders
    WHERE provider_id = p_provider_id
      AND order_number = v_prefix || LPAD(s::text, 3, '0')
  );

  UPDATE public.workshop_order_sequences
     SET last_number = GREATEST(last_number, v_next)
   WHERE provider_id = p_provider_id AND year = v_year AND month = v_month AND kind = p_kind;

  RETURN v_prefix || LPAD(v_next::text, 3, '0');
END;
$$;

-- After delete, recompute sequence so freed numbers can be reused
CREATE OR REPLACE FUNCTION public.workshop_order_sync_sequence_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_month int;
  v_year int;
  v_max int;
BEGIN
  IF OLD.order_number IS NULL OR position('-' in OLD.order_number) = 0 THEN
    RETURN OLD;
  END IF;
  v_kind := SPLIT_PART(OLD.order_number, '-', 1);
  v_month := NULLIF(SPLIT_PART(SPLIT_PART(OLD.order_number, '-', 2), '/', 1), '')::int;
  v_year := NULLIF(SPLIT_PART(SPLIT_PART(OLD.order_number, '-', 2), '/', 2), '')::int;
  IF v_month IS NULL OR v_year IS NULL THEN RETURN OLD; END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(SPLIT_PART(order_number, '-', 3), '\D', '', 'g'), '')::int), 0)
    INTO v_max
  FROM public.workshop_orders
  WHERE provider_id = OLD.provider_id
    AND order_number LIKE v_kind || '-' || LPAD(v_month::text, 2, '0') || '/' || v_year::text || '-%';

  UPDATE public.workshop_order_sequences
     SET last_number = v_max
   WHERE provider_id = OLD.provider_id
     AND year = v_year AND month = v_month AND kind = v_kind;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_workshop_order_delete_sync ON public.workshop_orders;
CREATE TRIGGER trg_workshop_order_delete_sync
AFTER DELETE ON public.workshop_orders
FOR EACH ROW EXECUTE FUNCTION public.workshop_order_sync_sequence_on_delete();