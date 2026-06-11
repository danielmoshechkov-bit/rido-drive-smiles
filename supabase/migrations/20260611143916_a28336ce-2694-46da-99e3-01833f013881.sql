-- 1) Numbering helpers based on actually-issued invoices (FV/YYYY/MM/NNN)
CREATE OR REPLACE FUNCTION public.peek_next_invoice_number(p_user_id uuid, p_year integer, p_month integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(split_part(invoice_number, '/', 4), '\D', '', 'g'), '')::int
  ), 0) + 1
  FROM public.user_invoices
  WHERE user_id = p_user_id
    AND invoice_number LIKE ('FV/' || p_year || '/' || lpad(p_month::text, 2, '0') || '/%');
$$;

CREATE OR REPLACE FUNCTION public.get_next_invoice_number(p_user_id uuid, p_year integer, p_month integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_num integer;
BEGIN
  -- Serialize concurrent issuance per (user, year, month)
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_year || ':' || p_month, 0)
  );
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(split_part(invoice_number, '/', 4), '\D', '', 'g'), '')::int
  ), 0) + 1
  INTO next_num
  FROM public.user_invoices
  WHERE user_id = p_user_id
    AND invoice_number LIKE ('FV/' || p_year || '/' || lpad(p_month::text, 2, '0') || '/%');
  RETURN next_num;
END;
$$;

GRANT EXECUTE ON FUNCTION public.peek_next_invoice_number(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_next_invoice_number(uuid, integer, integer) TO authenticated, service_role;

-- 2) Revert order status when last assignment is removed
CREATE OR REPLACE FUNCTION public.workshop_revert_status_on_unassign()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  remaining int;
  has_reception boolean;
  cur_status text;
BEGIN
  SELECT count(*) INTO remaining
  FROM public.workshop_order_assignments
  WHERE order_id = OLD.order_id;

  IF remaining = 0 THEN
    SELECT status_name INTO cur_status FROM public.workshop_orders WHERE id = OLD.order_id;
    IF cur_status = 'Przydzielone' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.workshop_order_signatures
        WHERE order_id = OLD.order_id AND signature_type = 'reception_protocol'
      ) INTO has_reception;
      UPDATE public.workshop_orders
      SET status_name = CASE WHEN has_reception THEN 'Przyjęcie do serwisu' ELSE 'Nowe' END
      WHERE id = OLD.order_id;
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_workshop_revert_status_on_unassign ON public.workshop_order_assignments;
CREATE TRIGGER trg_workshop_revert_status_on_unassign
AFTER DELETE ON public.workshop_order_assignments
FOR EACH ROW EXECUTE FUNCTION public.workshop_revert_status_on_unassign();