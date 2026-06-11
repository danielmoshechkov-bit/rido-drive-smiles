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
    SELECT
      status_name,
      COALESCE(client_acceptance_confirmed, false)
      OR EXISTS (
        SELECT 1
        FROM public.workshop_order_signatures s
        WHERE s.order_id = OLD.order_id
          AND s.document_type = 'reception_protocol'
      )
    INTO cur_status, has_reception
    FROM public.workshop_orders
    WHERE id = OLD.order_id;

    IF cur_status = 'Przydzielone' THEN
      UPDATE public.workshop_orders
      SET status_name = CASE WHEN has_reception THEN 'Przyjęcie do serwisu' ELSE 'Nowe zlecenie' END,
          updated_at = now()
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