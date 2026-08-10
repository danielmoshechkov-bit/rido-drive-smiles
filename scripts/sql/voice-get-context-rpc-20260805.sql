-- =============================================================================
-- get_voice_context — JEDNO zapytanie zamiast czterech na turę
--
-- STAN PRZED (pomiar z rozmowy 05.08 20:40, 13 tur):
--   voice-agent-llm : voice_agent_configs        132-377 ms
--   voice-agent-chat: voice_agent_knowledge      ) razem w stage `prepare`
--                     voice_agent_personas       ) 250-1070 ms
--                     ai_agents_config           )
--   Cache w pamięci izolatu dał 0 trafień na 42 odczyty — każda tura ląduje
--   na świeżym izolacie, więc cache procesowy jest tu bezużyteczny.
--
-- STAN PO: voice-agent-llm woła TĘ funkcję raz i przekazuje wynik do
--   voice-agent-chat w ciele żądania (połączenie service-role, tak samo jak
--   conversation_id i client_tools). Chat nie dotyka bazy w ścieżce tury.
--   Cztery round-tripy schodzą do jednego.
--
-- BEZPIECZEŃSTWO:
--   SECURITY DEFINER, bo funkcja czyta tabele objęte RLS w imieniu telefonii,
--   która nie ma sesji użytkownika. search_path przypięty (bez tego DEFINER
--   jest podatny na podmianę obiektów). Uprawnienie do wykonania WYŁĄCZNIE dla
--   service_role — anon i authenticated tracą je jawnie.
--   Funkcja jest CZYSTO ODCZYTOWA i przyjmuje wyłącznie dwa parametry, więc
--   nie da się nią sięgnąć poza wskazanego tenanta.
--
-- ODWRACALNE: rollback obok. Kod działa bez tej funkcji — gdy RPC zawiedzie,
--   voice-agent-chat wraca do czterech osobnych odczytów.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_voice_context(
  p_provider_id uuid,
  p_persona_key text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'config', (
      SELECT to_jsonb(c) FROM (
        SELECT business_context, display_name, languages,
               calendar_access, orders_access, voice_id, elevenlabs_agent_id,
               learning_mode, contribute_to_global
          FROM voice_agent_configs
         WHERE provider_id = p_provider_id AND persona_key = p_persona_key
         LIMIT 1
      ) c
    ),
    'persona', (
      SELECT to_jsonb(p) FROM (
        SELECT persona_key, name, direction, provider_agent_id,
               default_model, default_voice_id
          FROM voice_agent_personas
         WHERE persona_key = p_persona_key
         LIMIT 1
      ) p
    ),
    'agent', (
      SELECT to_jsonb(a) FROM (
        SELECT model, system_prompt
          FROM ai_agents_config
         WHERE agent_id = COALESCE(
                 (SELECT provider_agent_id FROM voice_agent_personas
                   WHERE persona_key = p_persona_key LIMIT 1),
                 'voice_workshop_secretary')
         LIMIT 1
      ) a
    ),
    -- Te same warunki co zapytanie, które to zastępuje: aktywne reguły persony,
    -- własne tenanta plus globalne, dziesięć najlepiej udokumentowanych.
    'knowledge', COALESCE((
      SELECT jsonb_agg(k ORDER BY k.evidence_count DESC NULLS LAST) FROM (
        SELECT category, situation, recommended_response, evidence_count
          FROM voice_agent_knowledge
         WHERE persona_key = p_persona_key
           AND is_active = true
           AND (provider_id = p_provider_id OR provider_id IS NULL)
         ORDER BY evidence_count DESC NULLS LAST
         LIMIT 10
      ) k
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_voice_context(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_voice_context(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_voice_context(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_voice_context(uuid, text) TO service_role;

COMMENT ON FUNCTION public.get_voice_context(uuid, text) IS
  'Kontekst rozmowy agenta glosowego w jednym zapytaniu: konfiguracja, persona, '
  'agent (model + prompt) i aktywne reguly wiedzy. Zastepuje cztery round-tripy '
  'na kazda ture. Tylko odczyt, tylko service_role.';

-- ---------------------------------------------------------------------------
-- KONTROLA — uruchomić po utworzeniu. Ma zwrócić komplet czterech sekcji.
-- ---------------------------------------------------------------------------
-- SELECT jsonb_pretty(public.get_voice_context(
--   '664ed87b-a20f-457b-a9fa-97ca13dcae7c', 'workshop_secretary'));
--
-- Sprawdzenie, że anon NIE ma dostępu (ma zwrócić błąd uprawnień):
-- SET ROLE anon;
-- SELECT public.get_voice_context('664ed87b-a20f-457b-a9fa-97ca13dcae7c','workshop_secretary');
-- RESET ROLE;
