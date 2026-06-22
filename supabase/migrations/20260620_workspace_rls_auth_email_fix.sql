-- =====================================================================
-- FIX: "permission denied for table users" przy zaproszeniach Workspace
-- ---------------------------------------------------------------------
-- Polityki RLS odwoływały się WPROST do auth.users:
--   (SELECT users.email FROM auth.users WHERE users.id = auth.uid())
-- Rola `authenticated` NIE ma SELECT na auth.users → każda operacja
-- ewaluująca taką politykę (np. zwrot reprezentacji po INSERT, odczyt
-- zaproszeń przez zapraszanego, claim/akceptacja) kończy się błędem
-- "permission denied for table users".
--
-- Naprawa: użyć auth.email() (czyta z JWT, bez dostępu do tabeli) zamiast
-- podzapytania do auth.users. Predykaty merytorycznie bez zmian.
--
-- BEZPIECZEŃSTWO: zakres dostępu identyczny (ten sam email z JWT). Front
-- dodatkowo nie żąda już reprezentacji przy insertach (patrz addMember /
-- generateInviteLink), ale to TEN fix odblokowuje stronę zapraszanego.
-- =====================================================================

-- ---- workspace_project_members --------------------------------------
DROP POLICY IF EXISTS "ws_members_select" ON public.workspace_project_members;
CREATE POLICY "ws_members_select" ON public.workspace_project_members
  FOR SELECT TO public
  USING (
    is_workspace_project_owner(project_id)
    OR (user_id = auth.uid())
    OR (status = 'invited'::text AND email = auth.email())
  );

DROP POLICY IF EXISTS "ws_members_update" ON public.workspace_project_members;
CREATE POLICY "ws_members_update" ON public.workspace_project_members
  FOR UPDATE TO public
  USING (
    is_workspace_project_owner(project_id)
    OR (status = 'invited'::text AND email = auth.email())
  )
  WITH CHECK (
    is_workspace_project_owner(project_id)
    OR (status = 'invited'::text AND email = auth.email())
    OR (user_id = auth.uid())   -- pozwala zapraszanemu zlinkować/zaakceptować własny wiersz
  );

DROP POLICY IF EXISTS "ws_members_delete" ON public.workspace_project_members;
CREATE POLICY "ws_members_delete" ON public.workspace_project_members
  FOR DELETE TO public
  USING (
    is_workspace_project_owner(project_id)
    OR (status = 'invited'::text AND email = auth.email())
  );

-- (INSERT: ws_members_insert WITH CHECK is_workspace_project_owner — bez zmian,
--  nie dotyka auth.users.)

-- ---- workspace_project_invitations (link-join, na przyszłość) --------
DROP POLICY IF EXISTS "Users can see invitations sent to them" ON public.workspace_project_invitations;
CREATE POLICY "Users can see invitations sent to them" ON public.workspace_project_invitations
  FOR SELECT TO authenticated
  USING (email = auth.email());

-- (Polityka ALL "Users can manage invitations for their projects" nie odwołuje
--  się do auth.users → bez zmian.)

-- =====================================================================
-- WERYFIKACJA po wykonaniu (nie może zostać żadne odwołanie do auth.users):
--   SELECT tablename, policyname, qual, with_check
--   FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN ('workspace_project_members','workspace_project_invitations')
--     AND (qual ILIKE '%auth.users%' OR with_check ILIKE '%auth.users%');
--   -- oczekiwane: 0 wierszy
-- =====================================================================

-- =====================================================================
-- ROLLBACK (przywraca odwołania do auth.users — wróci błąd):
--   -- ws_members_select/update/delete oraz "Users can see invitations sent to them"
--   -- z predykatem (SELECT users.email FROM auth.users WHERE users.id=auth.uid())
-- =====================================================================
