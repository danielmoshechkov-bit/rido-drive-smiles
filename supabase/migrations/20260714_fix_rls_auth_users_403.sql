-- 20260714_fix_rls_auth_users_403.sql
-- =====================================================================
-- FIX trwałych 403: workshop_employee_invitations (GET) + booking_appointments (HEAD)
-- ---------------------------------------------------------------------
-- Przyczyna: polityki RLS czytają auth.users
--   (SELECT email FROM auth.users WHERE id = auth.uid())
-- a rola `authenticated` NIE ma SELECT na auth.users. Postgres sprawdza
-- uprawnienia na etapie planu zapytania, więc pada CAŁE zapytanie
-- ("permission denied for table users" -> PostgREST 403) — nawet gdy
-- dostęp dawałaby inna polityka (np. "Provider owners manage invitations").
--
-- Naprawa: auth.email() (czyta email z JWT, bez dotykania tabeli) — ten sam
-- wzorzec co 20260620_workspace_rls_auth_email_fix.sql. Semantyka predykatów
-- bez zmian. Idempotentne (DROP IF EXISTS + CREATE).
-- =====================================================================

-- ---- workshop_employee_invitations (polityki z 20260610122527) -------
DROP POLICY IF EXISTS "Invited user can view own invitations" ON public.workshop_employee_invitations;
CREATE POLICY "Invited user can view own invitations"
ON public.workshop_employee_invitations FOR SELECT TO authenticated
USING (invited_user_id = (SELECT auth.uid()) OR lower(invited_email) = lower(auth.email()));

DROP POLICY IF EXISTS "Invited user can accept/reject own invitation" ON public.workshop_employee_invitations;
CREATE POLICY "Invited user can accept/reject own invitation"
ON public.workshop_employee_invitations FOR UPDATE TO authenticated
USING (invited_user_id = (SELECT auth.uid()) OR lower(invited_email) = lower(auth.email()))
WITH CHECK (invited_user_id = (SELECT auth.uid()) OR lower(invited_email) = lower(auth.email()));

-- (Polityka "Provider owners manage invitations" nie dotyka auth.users — bez zmian.
--  invited_email bywa NULL od 20260614 — lower(NULL)=NULL, porównanie daje false, OK.)

-- ---- booking_appointments (polityka z 20260131121436) ----------------
DROP POLICY IF EXISTS "Users can view own appointments" ON public.booking_appointments;
CREATE POLICY "Users can view own appointments" ON public.booking_appointments
  FOR SELECT USING (user_id = (SELECT auth.uid()) OR customer_email = auth.email());

-- BRAKUJĄCA polityka providera: ServiceProviderDashboard liczy rezerwacje po
-- provider_id (HEAD + count, src/pages/ServiceProviderDashboard.tsx:346-354).
-- Bez niej po samym fixie emaila liczniki zwrócą 0 zamiast 403.
-- SELECT wystarcza — frontend tylko czyta (żadnych INSERT/UPDATE z panelu,
-- edge functions nie dotykają tej tabeli).
DROP POLICY IF EXISTS "Provider can view own appointments" ON public.booking_appointments;
CREATE POLICY "Provider can view own appointments" ON public.booking_appointments
  FOR SELECT USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = (SELECT auth.uid())));

-- =====================================================================
-- WERYFIKACJA po wykonaniu (oczekiwane: 0 wierszy):
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN ('workshop_employee_invitations','booking_appointments')
--     AND (qual ILIKE '%auth.users%' OR with_check ILIKE '%auth.users%');
-- SZYBKI TEST z konsoli produkcji (po zalogowaniu jako właściciel warsztatu):
--   GET  /rest/v1/workshop_employee_invitations?provider_id=eq.<id>  -> 200
--   HEAD /rest/v1/booking_appointments?provider_id=eq.<id>&status=eq.pending -> 200 + count
-- =====================================================================
-- ROLLBACK: przywrócić poprzednie definicje z 20260610122527 / 20260131121436
-- (wróci 403 — te definicje są przyczyną błędu).
-- =====================================================================
