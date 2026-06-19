-- TURA finanse — PARTIA 2: vehicle_owner_charges (obciążenia właścicieli per flota)
-- ---------------------------------------------------------------------------
-- Miało SELECT/INSERT/UPDATE/DELETE = USING(true) (roles public) + globalną ALL na
-- rolach fleet_settlement/fleet_rental (bez skalowania do floty) → każdy czytał i
-- modyfikował obciążenia wszystkich flot. Wzorzec naprawy jak vehicle_owners.
--
-- Model: fleet-scoped przez istniejący helper get_my_fleet_ids() OR admin.
-- Usuwam też globalną ALL (OR-owana z fleet-scope = re-leak). Edge/service-role omija RLS.

DROP POLICY IF EXISTS "Fleet can view charges"   ON public.vehicle_owner_charges;
DROP POLICY IF EXISTS "Fleet can insert charges" ON public.vehicle_owner_charges;
DROP POLICY IF EXISTS "Fleet can update charges" ON public.vehicle_owner_charges;
DROP POLICY IF EXISTS "Fleet can delete charges" ON public.vehicle_owner_charges;
DROP POLICY IF EXISTS "Admins fleet manage vehicle owner charges" ON public.vehicle_owner_charges;

CREATE POLICY "vehicle_owner_charges_select" ON public.vehicle_owner_charges
  FOR SELECT TO authenticated
  USING ( fleet_id IN (SELECT get_my_fleet_ids()) OR has_role(auth.uid(), 'admin'::app_role) );

CREATE POLICY "vehicle_owner_charges_insert" ON public.vehicle_owner_charges
  FOR INSERT TO authenticated
  WITH CHECK ( fleet_id IN (SELECT get_my_fleet_ids()) OR has_role(auth.uid(), 'admin'::app_role) );

CREATE POLICY "vehicle_owner_charges_update" ON public.vehicle_owner_charges
  FOR UPDATE TO authenticated
  USING ( fleet_id IN (SELECT get_my_fleet_ids()) OR has_role(auth.uid(), 'admin'::app_role) )
  WITH CHECK ( fleet_id IN (SELECT get_my_fleet_ids()) OR has_role(auth.uid(), 'admin'::app_role) );

CREATE POLICY "vehicle_owner_charges_delete" ON public.vehicle_owner_charges
  FOR DELETE TO authenticated
  USING ( fleet_id IN (SELECT get_my_fleet_ids()) OR has_role(auth.uid(), 'admin'::app_role) );

-- =========================================================================
-- ROLLBACK (przywraca stan sprzed PARTII 2):
-- =========================================================================
-- DROP POLICY IF EXISTS "vehicle_owner_charges_select" ON public.vehicle_owner_charges;
-- DROP POLICY IF EXISTS "vehicle_owner_charges_insert" ON public.vehicle_owner_charges;
-- DROP POLICY IF EXISTS "vehicle_owner_charges_update" ON public.vehicle_owner_charges;
-- DROP POLICY IF EXISTS "vehicle_owner_charges_delete" ON public.vehicle_owner_charges;
-- CREATE POLICY "Fleet can view charges"   ON public.vehicle_owner_charges FOR SELECT TO public USING (true);
-- CREATE POLICY "Fleet can insert charges" ON public.vehicle_owner_charges FOR INSERT TO public WITH CHECK (true);
-- CREATE POLICY "Fleet can update charges" ON public.vehicle_owner_charges FOR UPDATE TO public USING (true);
-- CREATE POLICY "Fleet can delete charges" ON public.vehicle_owner_charges FOR DELETE TO public USING (true);
-- CREATE POLICY "Admins fleet manage vehicle owner charges" ON public.vehicle_owner_charges FOR ALL TO authenticated
--   USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fleet_settlement'::app_role) OR has_role(auth.uid(),'fleet_rental'::app_role))
--   WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fleet_settlement'::app_role) OR has_role(auth.uid(),'fleet_rental'::app_role));
