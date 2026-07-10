-- =====================================================================
-- PERF A3: przepisanie polityk RLS modułu warsztatowego
-- ---------------------------------------------------------------------
-- 1) auth.uid() / has_role(...) opakowane w (SELECT ...) — Postgres liczy
--    je wtedy RAZ jako InitPlan zamiast dla każdego wiersza.
-- 2) Podwójnie zagnieżdżone IN (SELECT ... IN (SELECT ...)) na
--    workshop_order_items / workshop_order_status_history spłaszczone do
--    pojedynczego podzapytania z JOIN.
-- Nazwy i semantyka polityk pozostają identyczne (DROP + CREATE).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Polityki providera (pierwotnie 20260215194451)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Provider can manage own clients" ON public.workshop_clients;
CREATE POLICY "Provider can manage own clients"
  ON public.workshop_clients FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Provider can manage own vehicles" ON public.workshop_vehicles;
CREATE POLICY "Provider can manage own vehicles"
  ON public.workshop_vehicles FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Provider can manage own statuses" ON public.workshop_order_statuses;
CREATE POLICY "Provider can manage own statuses"
  ON public.workshop_order_statuses FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Provider can manage own orders" ON public.workshop_orders;
CREATE POLICY "Provider can manage own orders"
  ON public.workshop_orders FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = (SELECT auth.uid())));

-- Spłaszczone: było order_id IN (SELECT ... WHERE provider_id IN (SELECT ...))
DROP POLICY IF EXISTS "Provider can manage order items via order" ON public.workshop_order_items;
CREATE POLICY "Provider can manage order items via order"
  ON public.workshop_order_items FOR ALL
  USING (order_id IN (
    SELECT o.id
    FROM workshop_orders o
    JOIN service_providers sp ON sp.id = o.provider_id
    WHERE sp.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Provider can view status history" ON public.workshop_order_status_history;
CREATE POLICY "Provider can view status history"
  ON public.workshop_order_status_history FOR ALL
  USING (order_id IN (
    SELECT o.id
    FROM workshop_orders o
    JOIN service_providers sp ON sp.id = o.provider_id
    WHERE sp.user_id = (SELECT auth.uid())
  ));

-- ---------------------------------------------------------------------
-- Polityki admina (pierwotnie 20260215194451) — has_role raz, nie per-row
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access workshop_orders" ON public.workshop_orders;
CREATE POLICY "Admin full access workshop_orders"
  ON public.workshop_orders FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'admin')));

DROP POLICY IF EXISTS "Admin full access workshop_clients" ON public.workshop_clients;
CREATE POLICY "Admin full access workshop_clients"
  ON public.workshop_clients FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'admin')));

DROP POLICY IF EXISTS "Admin full access workshop_vehicles" ON public.workshop_vehicles;
CREATE POLICY "Admin full access workshop_vehicles"
  ON public.workshop_vehicles FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'admin')));

DROP POLICY IF EXISTS "Admin full access workshop_order_statuses" ON public.workshop_order_statuses;
CREATE POLICY "Admin full access workshop_order_statuses"
  ON public.workshop_order_statuses FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'admin')));

DROP POLICY IF EXISTS "Admin full access workshop_order_items" ON public.workshop_order_items;
CREATE POLICY "Admin full access workshop_order_items"
  ON public.workshop_order_items FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'admin')));

DROP POLICY IF EXISTS "Admin full access workshop_order_status_history" ON public.workshop_order_status_history;
CREATE POLICY "Admin full access workshop_order_status_history"
  ON public.workshop_order_status_history FOR ALL
  USING ((SELECT public.has_role(auth.uid(), 'admin')));

-- ---------------------------------------------------------------------
-- workshop_order_events (pierwotnie 20260611074541) — INSERT eventu leci
-- przy każdej zmianie statusu, więc te polityki są na gorącej ścieżce.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Provider reads own order events" ON public.workshop_order_events;
CREATE POLICY "Provider reads own order events" ON public.workshop_order_events
  FOR SELECT USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Provider inserts own order events" ON public.workshop_order_events;
CREATE POLICY "Provider inserts own order events" ON public.workshop_order_events
  FOR INSERT WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Employee reads events of provider" ON public.workshop_order_events;
CREATE POLICY "Employee reads events of provider" ON public.workshop_order_events
  FOR SELECT USING (provider_id IN (SELECT provider_id FROM workshop_employees WHERE user_id = (SELECT auth.uid()) AND status = 'active'));

DROP POLICY IF EXISTS "Employee inserts events for assigned/pool orders" ON public.workshop_order_events;
CREATE POLICY "Employee inserts events for assigned/pool orders" ON public.workshop_order_events
  FOR INSERT WITH CHECK (
    actor_user_id = (SELECT auth.uid()) AND
    provider_id IN (SELECT provider_id FROM workshop_employees WHERE user_id = (SELECT auth.uid()) AND status = 'active')
  );

-- ---------------------------------------------------------------------
-- Polityki pracownicze na workshop_orders (pierwotnie 20260610145704) —
-- OR-owane z polityką providera przy KAŻDYM odczycie listy zleceń.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Employees can view assigned orders" ON public.workshop_orders;
CREATE POLICY "Employees can view assigned orders"
ON public.workshop_orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workshop_order_assignments a
    WHERE a.order_id = workshop_orders.id
      AND a.employee_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Employees can view provider order pool when enabled" ON public.workshop_orders;
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
    WHERE e.user_id = (SELECT auth.uid())
      AND e.is_active = true
      AND e.status = 'active'
      AND e.provider_id = workshop_orders.provider_id
      AND COALESCE(ws.employees_can_claim_orders, false) = true
  )
);
