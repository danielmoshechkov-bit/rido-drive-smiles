-- Phase D follow-up: raport finansowy warsztatu nie może opierać izolacji na
-- provider_id przekazanym wyłącznie do zapytania frontendowego. RPC ponownie
-- autoryzuje kontekst po auth.uid() i nie zwraca faktur niepowiązanych z
-- konkretnym zleceniem warsztatowym.

CREATE OR REPLACE FUNCTION public.phase_d_workshop_sales_report(p_provider_id uuid)
RETURNS TABLE (
  invoice_number text,
  issue_date date,
  gross_total numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  -- Dane finansowe są dostępne wyłącznie właścicielowi, managerowi lub
  -- administratorowi systemowemu, a nie każdemu pracownikowi warsztatu.
  IF p_provider_id IS NULL
     OR NOT public.phase_c_can_manage_provider(p_provider_id) THEN
    RAISE EXCEPTION 'provider_access_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    invoice.invoice_number,
    invoice.issue_date,
    invoice.gross_total
  FROM public.user_invoices AS invoice
  JOIN public.workshop_orders AS workshop_order
    ON workshop_order.id = invoice.workshop_order_id
  WHERE workshop_order.provider_id = p_provider_id
    AND invoice.invoice_type IS DISTINCT FROM 'cost'
    AND invoice.deleted_at IS NULL
  ORDER BY invoice.issue_date DESC, invoice.invoice_number DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_d_workshop_sales_report(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_d_workshop_sales_report(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.phase_d_workshop_sales_report(uuid) IS
  'Tenant-scoped workshop invoice report; caller must manage the provider and invoices must be linked to its orders.';
