
-- Allow workshop employees to read vehicles and clients of their assigned orders
CREATE POLICY "Employees can view vehicles of assigned orders"
ON public.workshop_vehicles FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workshop_orders o
  JOIN public.workshop_order_assignments a ON a.order_id = o.id
  WHERE o.vehicle_id = workshop_vehicles.id
    AND a.employee_user_id = auth.uid()
));

CREATE POLICY "Employees can view clients of assigned orders"
ON public.workshop_clients FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workshop_orders o
  JOIN public.workshop_order_assignments a ON a.order_id = o.id
  WHERE o.client_id = workshop_clients.id
    AND a.employee_user_id = auth.uid()
));

-- Also let employees view vehicles/clients of pool-visible orders
CREATE POLICY "Employees can view vehicles of pool orders"
ON public.workshop_vehicles FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workshop_orders o
  JOIN public.workshop_employees e ON e.provider_id = o.provider_id
  LEFT JOIN public.workshop_settings ws ON ws.user_id = (
    SELECT user_id FROM public.service_providers WHERE id = o.provider_id
  )
  WHERE o.vehicle_id = workshop_vehicles.id
    AND e.user_id = auth.uid() AND e.is_active = true AND e.status = 'active'
    AND COALESCE(ws.employees_can_claim_orders, false) = true
));

CREATE POLICY "Employees can view clients of pool orders"
ON public.workshop_clients FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workshop_orders o
  JOIN public.workshop_employees e ON e.provider_id = o.provider_id
  LEFT JOIN public.workshop_settings ws ON ws.user_id = (
    SELECT user_id FROM public.service_providers WHERE id = o.provider_id
  )
  WHERE o.client_id = workshop_clients.id
    AND e.user_id = auth.uid() AND e.is_active = true AND e.status = 'active'
    AND COALESCE(ws.employees_can_claim_orders, false) = true
));

-- Allow assigned employees to insert/update/delete items on their orders
CREATE POLICY "Employees can insert items on assigned orders"
ON public.workshop_order_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.workshop_order_assignments a
  WHERE a.order_id = workshop_order_items.order_id
    AND a.employee_user_id = auth.uid()
));

CREATE POLICY "Employees can update items on assigned orders"
ON public.workshop_order_items FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workshop_order_assignments a
  WHERE a.order_id = workshop_order_items.order_id
    AND a.employee_user_id = auth.uid()
));

CREATE POLICY "Employees can delete own items on assigned orders"
ON public.workshop_order_items FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workshop_order_assignments a
  WHERE a.order_id = workshop_order_items.order_id
    AND a.employee_user_id = auth.uid()
));
