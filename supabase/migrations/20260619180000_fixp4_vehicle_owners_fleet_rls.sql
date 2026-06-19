-- FIX-P4 — vehicle_owners: wyciek danych bankowych/PII (NIP, bank_account, email)
-- ---------------------------------------------------------------------------
-- Tabela trzyma dane właścicieli pojazdów per flota (fleet_id): name, nip, phone,
-- email, bank_account. Miała SELECT/INSERT/UPDATE/DELETE = USING(true) dla roli
-- public → KAŻDY czytał i modyfikował dane bankowe wszystkich flot. Dodatkowo
-- globalna polityka ALL na rolach fleet_settlement/fleet_rental nie skalowała do
-- floty (każdy z taką rolą widział WSZYSTKIE floty).
--
-- Model docelowy (multi-fleet): dostęp tylko do flot usera (przez user_roles) lub admin.
--   fleet_id IN (get_my_fleet_ids()) OR has_role(admin)
-- Edge/service-role omija RLS → client-verify-vehicle-ownership i inne działają dalej.

-- ── Helper: wszystkie floty usera (SETOF, multi-fleet). SECURITY DEFINER + search_path ──
CREATE OR REPLACE FUNCTION public.get_my_fleet_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT fleet_id FROM user_roles
  WHERE user_id = auth.uid()
    AND role IN ('fleet_settlement'::app_role, 'fleet_rental'::app_role)
    AND fleet_id IS NOT NULL
$$;

-- ── Usuń WSZYSTKIE stare polityki (4× true + globalna na rolach) ──
DROP POLICY IF EXISTS "Fleet members can view vehicle owners"   ON public.vehicle_owners;
DROP POLICY IF EXISTS "Fleet members can insert vehicle owners" ON public.vehicle_owners;
DROP POLICY IF EXISTS "Fleet members can update vehicle owners" ON public.vehicle_owners;
DROP POLICY IF EXISTS "Fleet members can delete vehicle owners" ON public.vehicle_owners;
DROP POLICY IF EXISTS "Admins fleet manage vehicle owners"      ON public.vehicle_owners;

-- ── Nowy, spójny zestaw: 4 polityki, fleet-scoped + admin (TO authenticated) ──
CREATE POLICY "vehicle_owners_select" ON public.vehicle_owners
  FOR SELECT TO authenticated
  USING ( fleet_id IN (SELECT get_my_fleet_ids()) OR has_role(auth.uid(), 'admin'::app_role) );

CREATE POLICY "vehicle_owners_insert" ON public.vehicle_owners
  FOR INSERT TO authenticated
  WITH CHECK ( fleet_id IN (SELECT get_my_fleet_ids()) OR has_role(auth.uid(), 'admin'::app_role) );

CREATE POLICY "vehicle_owners_update" ON public.vehicle_owners
  FOR UPDATE TO authenticated
  USING ( fleet_id IN (SELECT get_my_fleet_ids()) OR has_role(auth.uid(), 'admin'::app_role) )
  WITH CHECK ( fleet_id IN (SELECT get_my_fleet_ids()) OR has_role(auth.uid(), 'admin'::app_role) );

CREATE POLICY "vehicle_owners_delete" ON public.vehicle_owners
  FOR DELETE TO authenticated
  USING ( fleet_id IN (SELECT get_my_fleet_ids()) OR has_role(auth.uid(), 'admin'::app_role) );

-- =========================================================================
-- ROLLBACK (przywraca dokładnie stan sprzed FIX-P4):
-- =========================================================================
-- DROP POLICY IF EXISTS "vehicle_owners_select" ON public.vehicle_owners;
-- DROP POLICY IF EXISTS "vehicle_owners_insert" ON public.vehicle_owners;
-- DROP POLICY IF EXISTS "vehicle_owners_update" ON public.vehicle_owners;
-- DROP POLICY IF EXISTS "vehicle_owners_delete" ON public.vehicle_owners;
-- DROP FUNCTION IF EXISTS public.get_my_fleet_ids();
-- CREATE POLICY "Fleet members can view vehicle owners"   ON public.vehicle_owners FOR SELECT TO public USING (true);
-- CREATE POLICY "Fleet members can insert vehicle owners" ON public.vehicle_owners FOR INSERT TO public WITH CHECK (true);
-- CREATE POLICY "Fleet members can update vehicle owners" ON public.vehicle_owners FOR UPDATE TO public USING (true);
-- CREATE POLICY "Fleet members can delete vehicle owners" ON public.vehicle_owners FOR DELETE TO public USING (true);
-- CREATE POLICY "Admins fleet manage vehicle owners" ON public.vehicle_owners FOR ALL TO authenticated
--   USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fleet_settlement'::app_role) OR has_role(auth.uid(),'fleet_rental'::app_role))
--   WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fleet_settlement'::app_role) OR has_role(auth.uid(),'fleet_rental'::app_role));
