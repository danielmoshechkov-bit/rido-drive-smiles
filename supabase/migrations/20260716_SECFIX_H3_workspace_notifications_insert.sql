-- 20260716_SECFIX_H3_workspace_notifications_insert.sql
-- =====================================================================
-- SECFIX H3 — workspace_notifications: koniec INSERT WITH CHECK(true)
-- (każdy zalogowany mógł wstawić powiadomienie z dowolnym sender_user_id =
-- podszywanie się / phishing wewnętrzny).
-- ---------------------------------------------------------------------
-- Nowa polityka: nadawca MUSI być sobą (sender_user_id = auth.uid()), a
-- project_id albo NULL (powiadomienia bez projektu — front tak wstawia) albo
-- projekt, którego jest członkiem. Front wstawia sender_user_id=self, więc
-- legalne powiadomienia działają dalej. Bezpieczna do wykonania OD RAZU
-- (nie wymaga zmian frontu). Idempotentne.
-- =====================================================================

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.workspace_notifications;
CREATE POLICY "Insert notifications as self" ON public.workspace_notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND (project_id IS NULL
         OR project_id IN (SELECT project_id FROM workspace_project_members WHERE user_id = auth.uid()))
  );

-- =====================================================================
-- WERYFIKACJA:
--   SELECT policyname, with_check FROM pg_policies WHERE schemaname='public'
--     AND tablename='workspace_notifications' AND cmd='INSERT';
--   -- oczekiwane: with_check zawiera sender_user_id = auth.uid()
-- =====================================================================
-- ROLLBACK: CREATE POLICY "Authenticated users can insert notifications"
--   ON public.workspace_notifications FOR INSERT TO authenticated WITH CHECK (true);
-- =====================================================================
