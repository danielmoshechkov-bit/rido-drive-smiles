CREATE OR REPLACE FUNCTION public.deduct_sms_credit(p_provider_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE service_providers
  SET sms_balance = GREATEST(COALESCE(sms_balance, 0) - 1, 0),
      updated_at = now()
  WHERE id = p_provider_id;
END;
$$;