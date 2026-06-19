-- FIX 2 — Wyciek prywatnych DM (BLOKER bezpieczeństwa) — wariant B (łagodny)
-- ---------------------------------------------------------------------------
-- workspace_messages SELECT było na poziomie PROJEKTU → każdy członek projektu
-- czytał wiadomości z każdego kanału, też prywatnego/DM.
--
-- Po zmianie (wariant B):
--   - kanały DM/prywatne (type IN ('dm','private')) → tylko UCZESTNIK kanału
--     (workspace_channel_participants) lub TWÓRCA kanału (created_by),
--   - kanały jawne i 'group' (type NOT IN ('dm','private')) → aktywny członek projektu (jak dotąd),
--   - wiadomości bez channel_id (legacy) → aktywny członek projektu (fallback),
--   - nadawca zawsze widzi własne (anti-lockout),
--   - NADZÓR WŁAŚCICIELA projektu zachowany (compliance) — owner widzi wszystko
--     w SWOICH projektach, w tym DM. Ograniczone do jego projektów → brak cross-tenant.
-- Zmiana dotyczy WYŁĄCZNIE SELECT. INSERT/UPDATE bez zmian.

DROP POLICY IF EXISTS "ws_messages_select" ON public.workspace_messages;
CREATE POLICY "ws_messages_select" ON public.workspace_messages
  FOR SELECT TO authenticated
  USING (
    -- nadawca zawsze widzi własne
    user_id = auth.uid()
    -- nadzór właściciela projektu (compliance) — osobny warunek dla owner
    OR project_id IN (SELECT get_workspace_owned_project_ids())
    -- wiadomości bez kanału (legacy/ogólny) → aktywny członek projektu
    OR (channel_id IS NULL AND project_id IN (SELECT get_workspace_member_project_ids()))
    -- wiadomości z kanałem:
    OR EXISTS (
      SELECT 1 FROM public.workspace_channels ch
      WHERE ch.id = workspace_messages.channel_id
        AND (
          -- kanał jawny lub 'group' (NIE dm/private) → każdy aktywny członek projektu
          (ch.type NOT IN ('dm','private') AND ch.project_id IN (SELECT get_workspace_member_project_ids()))
          -- DM/prywatny → tylko uczestnik kanału lub jego twórca
          OR (ch.type IN ('dm','private') AND (
                ch.created_by = auth.uid()
                OR EXISTS (SELECT 1 FROM public.workspace_channel_participants pp
                           WHERE pp.channel_id = ch.id AND pp.user_id = auth.uid())
             ))
        )
    )
  );

-- =========================================================================
-- ROLLBACK (odwrócenie — przywraca dokładnie stan sprzed FIX 2):
-- =========================================================================
-- DROP POLICY IF EXISTS "ws_messages_select" ON public.workspace_messages;
-- CREATE POLICY "ws_messages_select" ON public.workspace_messages
--   FOR SELECT TO authenticated
--   USING ( project_id IN (SELECT get_workspace_owned_project_ids())
--        OR project_id IN (SELECT get_workspace_member_project_ids()) );
