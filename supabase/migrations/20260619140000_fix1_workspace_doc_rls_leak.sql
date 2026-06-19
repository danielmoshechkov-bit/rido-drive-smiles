-- FIX 1 — Wyciek dokumentów (BLOKER bezpieczeństwa)
-- ---------------------------------------------------------------------------
-- workspace_document_comments i workspace_document_versions miały SELECT USING (true)
-- → każde zalogowane konto czytało komentarze i pełną treść wersji WSZYSTKICH
-- dokumentów (cross-tenant leak).
--
-- Po zmianie: komentarz/wersja widoczne TYLKO gdy user ma dostęp do dokumentu-rodzica:
--   - właściciel projektu (get_workspace_owned_project_ids → owner_user_id = auth.uid())  [nadzór właściciela]
--   - aktywny członek projektu (get_workspace_member_project_ids)
--   - anti-lockout: autor komentarza / autor wersji zawsze widzi swoje.
-- Zakres = projekty usera → brak nowej dziury cross-tenant (tenant_id jest NULL/nieużywany).
-- Zmiana dotyczy WYŁĄCZNIE SELECT. INSERT/UPDATE/DELETE bez zmian.

DROP POLICY IF EXISTS "Doc comments visible" ON public.workspace_document_comments;
CREATE POLICY "Doc comments visible" ON public.workspace_document_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_documents d
      WHERE d.id = workspace_document_comments.document_id
        AND (
          d.project_id IN (SELECT get_workspace_owned_project_ids())
          OR d.project_id IN (SELECT get_workspace_member_project_ids())
        )
    )
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Versions visible" ON public.workspace_document_versions;
CREATE POLICY "Versions visible" ON public.workspace_document_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_documents d
      WHERE d.id = workspace_document_versions.document_id
        AND (
          d.project_id IN (SELECT get_workspace_owned_project_ids())
          OR d.project_id IN (SELECT get_workspace_member_project_ids())
        )
    )
    OR edited_by = auth.uid()
  );

-- =========================================================================
-- ROLLBACK (odwrócenie — przywraca dokładnie stan sprzed FIX 1):
-- =========================================================================
-- DROP POLICY IF EXISTS "Doc comments visible" ON public.workspace_document_comments;
-- CREATE POLICY "Doc comments visible" ON public.workspace_document_comments
--   FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS "Versions visible" ON public.workspace_document_versions;
-- CREATE POLICY "Versions visible" ON public.workspace_document_versions
--   FOR SELECT TO authenticated USING (true);
