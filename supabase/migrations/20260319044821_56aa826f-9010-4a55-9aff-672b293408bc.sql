CREATE OR REPLACE FUNCTION public.deduct_vehicle_lookup_credit(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE vehicle_lookup_credits
  SET remaining_credits = remaining_credits - 1,
      updated_at = now()
  WHERE user_id = p_user_id AND remaining_credits > 0;
END;
$$;