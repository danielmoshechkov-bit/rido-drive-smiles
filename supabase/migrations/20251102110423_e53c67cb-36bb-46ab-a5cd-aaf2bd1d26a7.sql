-- Create secure function for drivers to access their own fuel transactions
CREATE OR REPLACE FUNCTION public.my_fuel_transactions(p_from date, p_to date)
RETURNS SETOF public.fuel_transactions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ft.*
  FROM public.fuel_transactions ft
  JOIN public.drivers d
    ON LTRIM(ft.card_number, '0') = LTRIM(d.fuel_card_number, '0')
  JOIN public.driver_app_users dau
    ON dau.driver_id = d.id
  WHERE dau.user_id = auth.uid()
    AND ft.transaction_date >= p_from
    AND ft.transaction_date <= p_to
  ORDER BY ft.transaction_date DESC, ft.transaction_time DESC
$$;

-- Add RLS policy for drivers to read their own fuel transactions
CREATE POLICY "Drivers can view their own fuel transactions"
ON public.fuel_transactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.drivers d
    JOIN public.driver_app_users dau ON dau.driver_id = d.id
    WHERE dau.user_id = auth.uid()
      AND LTRIM(fuel_transactions.card_number, '0') = LTRIM(d.fuel_card_number, '0')
  )
);