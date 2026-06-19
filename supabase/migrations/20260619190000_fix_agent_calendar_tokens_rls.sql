-- FIX — agent_calendar_tokens: wyciek tokenów Google OAuth (access/refresh)
-- ---------------------------------------------------------------------------
-- Polityka ALL "Agent manages own calendar" miała USING(true) (authenticated)
-- → KAŻDY zalogowany czytał i nadpisywał google_access_token/refresh_token cudzych
-- agentów (read+write w pełni otwarte).
--
-- Mapowanie: agent_id = real_estate_agents.id (NIE auth.uid()). Profil agenta
-- mapuje się do usera przez real_estate_agents.user_id = auth.uid()
-- (RealEstateAgentDashboard ładuje agenta po .eq('user_id', user.id), przekazuje agent.id).
--
-- Model: agent zarządza WYŁĄCZNIE swoimi tokenami (SELECT+INSERT+UPDATE+DELETE).
-- Bez klauzuli admin — to osobiste sekrety OAuth, brak potrzeby nadzoru.
-- Helper SECURITY DEFINER (search_path=public) przerywa rekurencję i daje jedno miejsce zmiany.

-- ── Helper: id profili agenta należących do bieżącego usera ──
CREATE OR REPLACE FUNCTION public.get_my_agent_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM real_estate_agents WHERE user_id = auth.uid()
$$;

-- ── Zastąp otwartą politykę warunkiem na własnym profilu agenta ──
DROP POLICY IF EXISTS "Agent manages own calendar" ON public.agent_calendar_tokens;
CREATE POLICY "Agent manages own calendar" ON public.agent_calendar_tokens
  FOR ALL TO authenticated
  USING ( agent_id IN (SELECT get_my_agent_ids()) )
  WITH CHECK ( agent_id IN (SELECT get_my_agent_ids()) );

-- =========================================================================
-- ROLLBACK (przywraca dokładnie stan sprzed fixa):
-- =========================================================================
-- DROP POLICY IF EXISTS "Agent manages own calendar" ON public.agent_calendar_tokens;
-- CREATE POLICY "Agent manages own calendar" ON public.agent_calendar_tokens
--   FOR ALL TO authenticated USING (true);
-- DROP FUNCTION IF EXISTS public.get_my_agent_ids();
