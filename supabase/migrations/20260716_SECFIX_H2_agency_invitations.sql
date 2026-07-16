-- 20260716_SECFIX_H2_agency_invitations.sql
-- =====================================================================
-- SECFIX H2 — agency_invitations: koniec USING(true) (email+token dla
-- każdego zalogowanego). DESTRUKCYJNA — wykonać PO deployu frontu, który
-- zapisuje invited_by (MarketingTeamTab.sendInvite), inaczej właściciel
-- przestanie widzieć swoje zaproszenia.
-- ---------------------------------------------------------------------
-- Odczyt zawężony: własne wysłane (invited_by), zaproszenie na własny email,
-- albo admin. Idempotentne.
-- =====================================================================

DROP POLICY IF EXISTS "Auth users can read agency_invitations" ON public.agency_invitations;
CREATE POLICY "Read own agency invitations" ON public.agency_invitations
  FOR SELECT TO authenticated
  USING (
    invited_by = auth.uid()
    OR lower(email) = lower(auth.email())
    OR public.has_role(auth.uid(),'admin')
  );

-- =====================================================================
-- WERYFIKACJA: brak USING(true) (oczekiwane: predykat z invited_by/auth.email):
--   SELECT policyname, qual FROM pg_policies WHERE schemaname='public'
--     AND tablename='agency_invitations' AND cmd='SELECT';
-- =====================================================================
-- ROLLBACK: CREATE POLICY "Auth users can read agency_invitations"
--   ON public.agency_invitations FOR SELECT TO authenticated USING (true);
-- =====================================================================
