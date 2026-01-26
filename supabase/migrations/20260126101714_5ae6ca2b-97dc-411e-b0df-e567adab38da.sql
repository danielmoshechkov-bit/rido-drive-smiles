-- Function to safely increment driver debt when reverting settlements
CREATE OR REPLACE FUNCTION public.increment_driver_debt(
  p_driver_id uuid,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE driver_debts 
  SET current_balance = current_balance + p_amount,
      updated_at = now()
  WHERE driver_id = p_driver_id;
  
  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO driver_debts (driver_id, current_balance)
    VALUES (p_driver_id, p_amount);
  END IF;
END;
$$;