-- Add UPDATE policy for fleet settlement users
CREATE POLICY "Fleet settlement can update settlements for their drivers"
ON public.settlements
FOR UPDATE
USING (
  has_role(auth.uid(), 'fleet_settlement'::app_role)
  AND EXISTS (
    SELECT 1 FROM drivers d
    WHERE d.id = settlements.driver_id
    AND d.fleet_id = get_user_fleet_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'fleet_settlement'::app_role)
  AND EXISTS (
    SELECT 1 FROM drivers d
    WHERE d.id = settlements.driver_id
    AND d.fleet_id = get_user_fleet_id(auth.uid())
  )
);

-- Add UPDATE policy for fleet rental users
CREATE POLICY "Fleet rental can update settlements for their drivers"
ON public.settlements
FOR UPDATE
USING (
  has_role(auth.uid(), 'fleet_rental'::app_role)
  AND EXISTS (
    SELECT 1 FROM drivers d
    WHERE d.id = settlements.driver_id
    AND d.fleet_id = get_user_fleet_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'fleet_rental'::app_role)
  AND EXISTS (
    SELECT 1 FROM drivers d
    WHERE d.id = settlements.driver_id
    AND d.fleet_id = get_user_fleet_id(auth.uid())
  )
);