DROP POLICY IF EXISTS "Employees can self-claim assignments when allowed" ON public.workshop_order_assignments;

CREATE POLICY "Employees can self-claim assignments"
ON public.workshop_order_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  employee_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.workshop_employees e
    WHERE e.user_id = auth.uid()
      AND e.is_active = true
      AND e.status = 'active'
      AND e.provider_id = workshop_order_assignments.provider_id
  )
);