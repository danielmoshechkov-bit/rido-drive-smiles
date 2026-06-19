-- TURA finanse — PARTIA 3: settlements_weekly + driver_additional_fees (per kierowca→flota)
-- ---------------------------------------------------------------------------
-- Obie miały ALL USING(true) (nazwa "Admins can manage…" myląca — realnie otwarte).
-- Izolacja po driver_id. Kierowca→flota: drivers.fleet_id (pokrywa 237/241) ORAZ
-- driver_fleet_relations (M:N, tylko 2/241) → helper musi być UNION obu źródeł,
-- inaczej operatorzy floty straciliby dostęp do prawie wszystkich kierowców.

-- ── Helper: id kierowców w flotach bieżącego usera (UNION; SECURITY DEFINER) ──
CREATE OR REPLACE FUNCTION public.get_my_driver_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM drivers
  WHERE fleet_id IN (SELECT get_my_fleet_ids())
  UNION
  SELECT driver_id FROM driver_fleet_relations
  WHERE fleet_id IN (SELECT get_my_fleet_ids())
$$;

-- ── settlements_weekly ──
DROP POLICY IF EXISTS "Admins can manage settlements weekly" ON public.settlements_weekly;

CREATE POLICY "settlements_weekly_select" ON public.settlements_weekly
  FOR SELECT TO authenticated
  USING ( driver_id IN (SELECT get_my_driver_ids()) OR has_role(auth.uid(), 'admin'::app_role) );
CREATE POLICY "settlements_weekly_insert" ON public.settlements_weekly
  FOR INSERT TO authenticated
  WITH CHECK ( driver_id IN (SELECT get_my_driver_ids()) OR has_role(auth.uid(), 'admin'::app_role) );
CREATE POLICY "settlements_weekly_update" ON public.settlements_weekly
  FOR UPDATE TO authenticated
  USING ( driver_id IN (SELECT get_my_driver_ids()) OR has_role(auth.uid(), 'admin'::app_role) )
  WITH CHECK ( driver_id IN (SELECT get_my_driver_ids()) OR has_role(auth.uid(), 'admin'::app_role) );
CREATE POLICY "settlements_weekly_delete" ON public.settlements_weekly
  FOR DELETE TO authenticated
  USING ( driver_id IN (SELECT get_my_driver_ids()) OR has_role(auth.uid(), 'admin'::app_role) );

-- ── driver_additional_fees (dodatkowo: autor wpisu = created_by) ──
DROP POLICY IF EXISTS "Admins can manage additional fees" ON public.driver_additional_fees;

CREATE POLICY "driver_additional_fees_select" ON public.driver_additional_fees
  FOR SELECT TO authenticated
  USING ( driver_id IN (SELECT get_my_driver_ids()) OR created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) );
CREATE POLICY "driver_additional_fees_insert" ON public.driver_additional_fees
  FOR INSERT TO authenticated
  WITH CHECK ( driver_id IN (SELECT get_my_driver_ids()) OR created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) );
CREATE POLICY "driver_additional_fees_update" ON public.driver_additional_fees
  FOR UPDATE TO authenticated
  USING ( driver_id IN (SELECT get_my_driver_ids()) OR created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) )
  WITH CHECK ( driver_id IN (SELECT get_my_driver_ids()) OR created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) );
CREATE POLICY "driver_additional_fees_delete" ON public.driver_additional_fees
  FOR DELETE TO authenticated
  USING ( driver_id IN (SELECT get_my_driver_ids()) OR created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) );

-- =========================================================================
-- ROLLBACK (przywraca stan sprzed PARTII 3):
-- =========================================================================
-- DROP POLICY IF EXISTS "settlements_weekly_select" ON public.settlements_weekly;
-- DROP POLICY IF EXISTS "settlements_weekly_insert" ON public.settlements_weekly;
-- DROP POLICY IF EXISTS "settlements_weekly_update" ON public.settlements_weekly;
-- DROP POLICY IF EXISTS "settlements_weekly_delete" ON public.settlements_weekly;
-- DROP POLICY IF EXISTS "driver_additional_fees_select" ON public.driver_additional_fees;
-- DROP POLICY IF EXISTS "driver_additional_fees_insert" ON public.driver_additional_fees;
-- DROP POLICY IF EXISTS "driver_additional_fees_update" ON public.driver_additional_fees;
-- DROP POLICY IF EXISTS "driver_additional_fees_delete" ON public.driver_additional_fees;
-- DROP FUNCTION IF EXISTS public.get_my_driver_ids();
-- CREATE POLICY "Admins can manage settlements weekly" ON public.settlements_weekly FOR ALL TO public USING (true);
-- CREATE POLICY "Admins can manage additional fees"   ON public.driver_additional_fees FOR ALL TO public USING (true);
