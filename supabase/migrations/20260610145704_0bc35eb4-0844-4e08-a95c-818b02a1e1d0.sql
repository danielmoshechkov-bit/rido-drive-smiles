
-- Add toggle for employer to allow employees to claim unassigned orders
ALTER TABLE public.workshop_settings ADD COLUMN IF NOT EXISTS employees_can_claim_orders boolean NOT NULL DEFAULT false;

-- Allow employees to read workshop_orders for their provider, when:
-- (a) the order is assigned to them, OR
-- (b) the provider's workshop_settings has employees_can_claim_orders = true (so they can browse pool)
CREATE POLICY "Employees can view assigned orders"
ON public.workshop_orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workshop_order_assignments a
    WHERE a.order_id = workshop_orders.id
      AND a.employee_user_id = auth.uid()
  )
);

CREATE POLICY "Employees can view provider order pool when enabled"
ON public.workshop_orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workshop_employees e
    JOIN public.service_providers sp ON sp.id = e.provider_id
    LEFT JOIN public.workshop_settings ws ON ws.user_id = sp.user_id
    WHERE e.user_id = auth.uid()
      AND e.is_active = true
      AND e.status = 'active'
      AND e.provider_id = workshop_orders.provider_id
      AND COALESCE(ws.employees_can_claim_orders, false) = true
  )
);

-- Allow employees to self-claim (INSERT) an assignment for themselves when pool browsing is enabled
CREATE POLICY "Employees can self-claim assignments when allowed"
ON public.workshop_order_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  employee_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.workshop_employees e
    JOIN public.service_providers sp ON sp.id = e.provider_id
    LEFT JOIN public.workshop_settings ws ON ws.user_id = sp.user_id
    WHERE e.user_id = auth.uid()
      AND e.is_active = true
      AND e.status = 'active'
      AND e.provider_id = workshop_order_assignments.provider_id
      AND COALESCE(ws.employees_can_claim_orders, false) = true
  )
);

-- Allow employees to release (DELETE) their own assignment
CREATE POLICY "Employees can release own assignments"
ON public.workshop_order_assignments
FOR DELETE
TO authenticated
USING (employee_user_id = auth.uid());

-- History table for claim/release/assign actions
CREATE TABLE IF NOT EXISTS public.workshop_order_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  employee_user_id uuid,
  action text NOT NULL, -- 'assigned' | 'unassigned' | 'claimed' | 'released'
  performed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.workshop_order_assignment_history TO authenticated;
GRANT ALL ON public.workshop_order_assignment_history TO service_role;

ALTER TABLE public.workshop_order_assignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider owners see their assignment history"
ON public.workshop_order_assignment_history
FOR SELECT TO authenticated
USING (
  provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
);

CREATE POLICY "Employees see own history rows"
ON public.workshop_order_assignment_history
FOR SELECT TO authenticated
USING (employee_user_id = auth.uid());

CREATE POLICY "Authenticated can insert history rows"
ON public.workshop_order_assignment_history
FOR INSERT TO authenticated
WITH CHECK (
  performed_by = auth.uid()
  AND (
    employee_user_id = auth.uid()
    OR provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
  )
);

CREATE INDEX IF NOT EXISTS idx_assignment_history_order ON public.workshop_order_assignment_history(order_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_employee ON public.workshop_order_assignment_history(employee_user_id);
