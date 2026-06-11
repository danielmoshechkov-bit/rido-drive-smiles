CREATE OR REPLACE FUNCTION public.peek_next_invoice_number(p_user_id uuid, p_year integer, p_month integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT last_number + 1 FROM public.invoice_sequences
     WHERE user_id = p_user_id AND year = p_year AND month = p_month),
    1
  );
$$;
GRANT EXECUTE ON FUNCTION public.peek_next_invoice_number(uuid, integer, integer) TO authenticated, service_role;