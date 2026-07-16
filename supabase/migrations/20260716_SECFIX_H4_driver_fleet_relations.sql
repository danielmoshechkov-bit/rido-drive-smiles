-- 20260716_SECFIX_H4_driver_fleet_relations.sql
-- =====================================================================
-- SECFIX H4 — driver_fleet_relations: koniec USING(true) (każda flota
-- widziała/modyfikowała relacje kierowca↔flota cudzych firm).
-- WYKONANE RĘCZNIE NA PRODUKCJI 16.07 — plik odtworzony 1:1 dla repo (Lovable).
-- Idempotentne.
-- =====================================================================
DROP POLICY IF EXISTS "Users can view fleet relations" ON public.driver_fleet_relations;
DROP POLICY IF EXISTS "Users can manage fleet relations" ON public.driver_fleet_relations;
CREATE POLICY "Fleet manages own driver relations" ON public.driver_fleet_relations
  FOR ALL TO authenticated
  USING (fleet_id = public.get_user_fleet_id(auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (fleet_id = public.get_user_fleet_id(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Driver views own fleet relations" ON public.driver_fleet_relations
  FOR SELECT TO authenticated
  USING (driver_id IN (SELECT driver_id FROM public.driver_app_users WHERE user_id = auth.uid()));
