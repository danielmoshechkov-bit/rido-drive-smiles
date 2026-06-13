-- ============================================================================
-- ASYSTENT GŁOSOWY AI RIDO — CORE (ETAP 0: FUNDAMENT)
-- ----------------------------------------------------------------------------
-- Uniwersalny silnik agentów telefonicznych AI (inbound + outbound),
-- multi-tenant, rejestr person (analogicznie do core tłumaczeń:
-- translatable_entities + translate-content + translation_cache_global).
--
-- Runtime docelowy (Etap 1+): ElevenLabs Conversational AI (Agents) + Twilio,
-- mózg = Claude przez custom-LLM proxy. Ta migracja to TYLKO warstwa danych —
-- zero telefonii, zero sekretów. Bezpieczna do uruchomienia teraz.
--
-- Zasady:
--   * Multi-tenant: izolacja przez provider_id -> service_providers (RLS Pattern A).
--   * Nowa persona = WIERSZ w voice_agent_personas (+ opcjonalny adapter
--     kalendarza), zero przepisywania silnika.
--   * Model/prompt persony przełączalny w /admin/portal -> Agenci AI
--     (przez ai_agents_config + resolveAgent, jak content_translation).
--   * WARSTWA UCZENIA (nasz moat) ma bogaty schemat OD POCZĄTKU — działać
--     zacznie w Etapie 3-4, ale tabele są gotowe na obiekcje / winning phrases
--     / success_rate / evidence_count już teraz.
--
-- Idempotentne: CREATE ... IF NOT EXISTS + DROP POLICY IF EXISTS przed CREATE.
-- Migracje stosujemy przez Dashboard SQL (NIE db push) — historia migracji
-- zarządzana przez Lovable.
-- ============================================================================


-- ============================================================================
-- CZĘŚĆ A — REJESTR PERSON (globalny, jak translatable_entities)
-- ============================================================================
-- Definicja "co potrafi dany typ agenta": kierunek, narzędzia, docelowy
-- kalendarz, źródła leadów, oraz provider_agent_id wskazujący wiersz w
-- ai_agents_config (tam żyją model + system_prompt, przełączalne w panelu).
-- NIE duplikuje promptu — single source of truth = ai_agents_config.
CREATE TABLE IF NOT EXISTS public.voice_agent_personas (
  persona_key        text PRIMARY KEY,
  name               text NOT NULL,
  description        text,
  direction          text NOT NULL DEFAULT 'both',   -- inbound | outbound | both
  allowed_tools      text[] NOT NULL DEFAULT '{}',    -- check_availability, create_booking, save_call_result, lookup_contact_history, ...
  calendar_target    text NOT NULL DEFAULT 'none',    -- workshop | service | realestate | none
  lead_sources       text[] NOT NULL DEFAULT '{}',    -- meta | google | portal | manual (dla outbound)
  provider_agent_id  text NOT NULL,                   -- -> ai_agents_config.agent_id (model + prompt)
  default_model      text NOT NULL DEFAULT 'claude-haiku-4-5-20251001', -- fallback gdy brak wiersza agenta
  default_voice_id   text,                            -- domyślny głos ElevenLabs
  supported_langs    text[] NOT NULL DEFAULT ARRAY['pl','en','ua','ru'],
  icon               text DEFAULT 'phone',
  priority           int  NOT NULL DEFAULT 5,
  enabled            boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_agent_personas ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.voice_agent_personas TO authenticated, anon;
GRANT ALL ON public.voice_agent_personas TO service_role;

DROP POLICY IF EXISTS "vap_public_read" ON public.voice_agent_personas;
CREATE POLICY "vap_public_read" ON public.voice_agent_personas
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "vap_admin_write" ON public.voice_agent_personas;
CREATE POLICY "vap_admin_write" ON public.voice_agent_personas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_vap_updated ON public.voice_agent_personas;
CREATE TRIGGER trg_vap_updated BEFORE UPDATE ON public.voice_agent_personas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- CZĘŚĆ B — KONFIGURACJA AGENTA PER TENANT (multi-tenant, Pattern A)
-- ============================================================================
-- Aktywacja + ustawienia agenta dla konkretnego usługodawcy. Kreator
-- self-service (Etap 2) zapisuje tutaj. Jeden wiersz na (provider, persona).
CREATE TABLE IF NOT EXISTS public.voice_agent_configs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  persona_key           text NOT NULL REFERENCES public.voice_agent_personas(persona_key),
  is_active             boolean NOT NULL DEFAULT false,
  display_name          text,                          -- np. "Asystentka Kasia"
  voice_id              text,                          -- wybrany głos ElevenLabs
  languages             text[] NOT NULL DEFAULT ARRAY['pl'],
  -- inbound
  inbound_mode          text NOT NULL DEFAULT 'off',   -- immediate | after_rings | off
  inbound_rings         int  NOT NULL DEFAULT 4,
  -- outbound
  outbound_enabled      boolean NOT NULL DEFAULT false,
  -- telefonia
  twilio_number         text,
  twilio_subaccount_sid text,
  byo_caller_id         text,                          -- własny numer firmowy (verified caller ID)
  elevenlabs_agent_id   text,                          -- id agenta po stronie ElevenLabs
  -- zachowanie
  custom_prompt_override text,                         -- nadpisanie promptu persony dla tego tenanta
  calling_hours         jsonb NOT NULL DEFAULT '{}'::jsonb, -- {mon:{from,to},...}
  timezone              text NOT NULL DEFAULT 'Europe/Warsaw',
  monthly_minute_cap    int,                           -- limit minut/mc (NULL = bez limitu)
  business_context      jsonb NOT NULL DEFAULT '{}'::jsonb, -- zcache'owane dane firmy do promptu
  -- WARSTWA UCZENIA: czy prywatne rozmowy tego tenanta zasilają globalną pulę wiedzy persony
  contribute_to_global  boolean NOT NULL DEFAULT false,
  -- PRYWATNOŚĆ: twardy gate — agent nie wykona rozmowy póki to nie jest potwierdzone
  privacy_confirmed     boolean NOT NULL DEFAULT false, -- ZRM ElevenLabs + ZDR Anthropic potwierdzone
  privacy_confirmed_at  timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, persona_key)
);
CREATE INDEX IF NOT EXISTS idx_vac_provider ON public.voice_agent_configs(provider_id);

ALTER TABLE public.voice_agent_configs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_agent_configs TO authenticated;
GRANT ALL ON public.voice_agent_configs TO service_role;

DROP POLICY IF EXISTS "vac_provider_all" ON public.voice_agent_configs;
CREATE POLICY "vac_provider_all" ON public.voice_agent_configs
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "vac_employee_read" ON public.voice_agent_configs;
CREATE POLICY "vac_employee_read" ON public.voice_agent_configs
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT provider_id FROM workshop_employees WHERE user_id = auth.uid() AND status = 'active'));

DROP TRIGGER IF EXISTS trg_vac_updated ON public.voice_agent_configs;
CREATE TRIGGER trg_vac_updated BEFORE UPDATE ON public.voice_agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- CZĘŚĆ C — NUMERY TELEFONÓW (Pattern A)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.voice_phone_numbers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  number                text NOT NULL,
  twilio_sid            text,
  twilio_subaccount_sid text,
  kind                  text NOT NULL DEFAULT 'provisioned', -- provisioned | forwarded | ported
  is_verified_caller_id boolean NOT NULL DEFAULT false,
  status                text NOT NULL DEFAULT 'active',       -- active | pending | released
  assigned_persona_key  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (number)
);
CREATE INDEX IF NOT EXISTS idx_vpn_provider ON public.voice_phone_numbers(provider_id);

ALTER TABLE public.voice_phone_numbers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_phone_numbers TO authenticated;
GRANT ALL ON public.voice_phone_numbers TO service_role;

DROP POLICY IF EXISTS "vpn_provider_all" ON public.voice_phone_numbers;
CREATE POLICY "vpn_provider_all" ON public.voice_phone_numbers
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_vpn_updated ON public.voice_phone_numbers;
CREATE TRIGGER trg_vpn_updated BEFORE UPDATE ON public.voice_phone_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- CZĘŚĆ D — KOLEJKA OUTBOUND (Pattern A)
-- ============================================================================
-- Leady do obdzwonienia. Zasilane z webhooków (Meta/Google/portal) w Etapie 3.
CREATE TABLE IF NOT EXISTS public.voice_call_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  persona_key   text NOT NULL,
  lead_table    text,                       -- np. marketing_leads | ai_sales_leads | service_leads
  lead_id       uuid,
  phone         text NOT NULL,
  contact_name  text,
  language      text DEFAULT 'pl',
  status        text NOT NULL DEFAULT 'queued', -- queued | calling | done | failed | skipped
  priority      int  NOT NULL DEFAULT 5,
  scheduled_for timestamptz,
  attempts      int  NOT NULL DEFAULT 0,
  max_attempts  int  NOT NULL DEFAULT 3,
  last_error    text,
  context       jsonb NOT NULL DEFAULT '{}'::jsonb, -- dodatkowy kontekst do rozmowy
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vcq_provider ON public.voice_call_queue(provider_id);
CREATE INDEX IF NOT EXISTS idx_vcq_dispatch ON public.voice_call_queue(status, scheduled_for);

ALTER TABLE public.voice_call_queue ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_call_queue TO authenticated;
GRANT ALL ON public.voice_call_queue TO service_role;

DROP POLICY IF EXISTS "vcq_provider_all" ON public.voice_call_queue;
CREATE POLICY "vcq_provider_all" ON public.voice_call_queue
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_vcq_updated ON public.voice_call_queue;
CREATE TRIGGER trg_vcq_updated BEFORE UPDATE ON public.voice_call_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- CZĘŚĆ E — LOG ROZMÓW (Pattern A)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.voice_calls (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id              uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  config_id                uuid REFERENCES public.voice_agent_configs(id) ON DELETE SET NULL,
  persona_key              text NOT NULL,
  direction                text NOT NULL,            -- inbound | outbound
  twilio_call_sid          text,
  elevenlabs_conversation_id text,
  from_number              text,
  to_number                text,
  contact_name             text,
  lead_table               text,
  lead_id                  uuid,
  language_detected        text,
  status                   text NOT NULL DEFAULT 'initiated', -- initiated | ringing | in_progress | completed | failed | no_answer | voicemail
  started_at               timestamptz,
  answered_at              timestamptz,
  ended_at                 timestamptz,
  duration_seconds         int NOT NULL DEFAULT 0,
  recording_disabled       boolean NOT NULL DEFAULT true, -- prywatność: domyślnie BEZ nagrań po stronie dostawcy
  summary                  text,                     -- AI skrót (co ustalono / dane / następny krok)
  outcome                  text,
  linked_entity_type       text,                     -- workshop_order | service_booking | viewing_request | lead
  linked_entity_id         uuid,
  cost_estimate_usd        numeric(10,4) NOT NULL DEFAULT 0,
  llm_tokens_used          int NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vcalls_provider ON public.voice_calls(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vcalls_lead ON public.voice_calls(lead_table, lead_id);
CREATE INDEX IF NOT EXISTS idx_vcalls_sid ON public.voice_calls(twilio_call_sid);

ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.voice_calls TO authenticated;
GRANT ALL ON public.voice_calls TO service_role;

DROP POLICY IF EXISTS "vcalls_provider_read" ON public.voice_calls;
CREATE POLICY "vcalls_provider_read" ON public.voice_calls
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR provider_id IN (SELECT provider_id FROM workshop_employees WHERE user_id = auth.uid() AND status = 'active')
         OR public.has_role(auth.uid(), 'admin'::app_role));

-- INSERT/UPDATE log rozmów robi edge (service_role); brak policy write dla authenticated.


-- ============================================================================
-- CZĘŚĆ F — TRANSKRYPCJE (Pattern A; wpięte w core tłumaczeń przez summary)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.voice_transcripts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id      uuid NOT NULL REFERENCES public.voice_calls(id) ON DELETE CASCADE,
  provider_id  uuid NOT NULL,                  -- denormalizacja dla RLS
  turns        jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{role, text, ts, lang}]
  full_text    text,
  summary      text,
  summary_lang text NOT NULL DEFAULT 'pl',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vtrans_call ON public.voice_transcripts(call_id);

ALTER TABLE public.voice_transcripts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.voice_transcripts TO authenticated;
GRANT ALL ON public.voice_transcripts TO service_role;

DROP POLICY IF EXISTS "vtrans_provider_read" ON public.voice_transcripts;
CREATE POLICY "vtrans_provider_read" ON public.voice_transcripts
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR provider_id IN (SELECT provider_id FROM workshop_employees WHERE user_id = auth.uid() AND status = 'active')
         OR public.has_role(auth.uid(), 'admin'::app_role));


-- ============================================================================
-- CZĘŚĆ G — METERING ZUŻYCIA (Pattern A; pod przyszłe rozliczanie)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.voice_usage_monthly (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id            uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  year_month             text NOT NULL,         -- 'YYYY-MM'
  inbound_calls          int NOT NULL DEFAULT 0,
  outbound_calls         int NOT NULL DEFAULT 0,
  inbound_minutes        numeric(12,2) NOT NULL DEFAULT 0,
  outbound_minutes       numeric(12,2) NOT NULL DEFAULT 0,
  total_cost_estimate_usd numeric(12,4) NOT NULL DEFAULT 0,
  llm_tokens             bigint NOT NULL DEFAULT 0,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, year_month)
);

ALTER TABLE public.voice_usage_monthly ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.voice_usage_monthly TO authenticated;
GRANT ALL ON public.voice_usage_monthly TO service_role;

DROP POLICY IF EXISTS "vum_provider_read" ON public.voice_usage_monthly;
CREATE POLICY "vum_provider_read" ON public.voice_usage_monthly
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role));


-- ============================================================================
-- CZĘŚĆ H — WARSTWA UCZENIA (NASZ MOAT) — bogaty schemat od początku
-- ============================================================================

-- H1. Strukturalny WYNIK każdej rozmowy (ekstrakcja przez naszego Claude).
CREATE TABLE IF NOT EXISTS public.voice_call_outcomes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id            uuid NOT NULL REFERENCES public.voice_calls(id) ON DELETE CASCADE,
  provider_id        uuid NOT NULL,
  persona_key        text NOT NULL,
  outcome            text,        -- booked | sold | refused | callback | no_interest | voicemail | wrong_number | info_only
  outcome_confidence numeric(4,3) NOT NULL DEFAULT 0,
  objections         jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{type, customer_quote, agent_response, resolved}]
  winning_phrases    jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{phrase, context, impact}]
  losing_signals     jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{signal, context}]
  key_topics         text[] NOT NULL DEFAULT '{}',
  sentiment_start    text,
  sentiment_end      text,
  sentiment_arc      text,
  next_step          text,
  customer_data      jsonb NOT NULL DEFAULT '{}'::jsonb, -- wyciągnięte dane (imię/pojazd/usługa/budżet/terminy)
  analysis_model     text,
  analyzed_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vco_provider ON public.voice_call_outcomes(provider_id, persona_key, outcome);
CREATE INDEX IF NOT EXISTS idx_vco_call ON public.voice_call_outcomes(call_id);

ALTER TABLE public.voice_call_outcomes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.voice_call_outcomes TO authenticated;
GRANT ALL ON public.voice_call_outcomes TO service_role;

DROP POLICY IF EXISTS "vco_provider_read" ON public.voice_call_outcomes;
CREATE POLICY "vco_provider_read" ON public.voice_call_outcomes
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role));


-- H2. BAZA WIEDZY SPRZEDAŻOWEJ (rośnie z każdą rozmową). Scope dwupoziomowy:
--     provider_id IS NULL  -> wiedza GLOBALNA danej persony (wspólna)
--     provider_id ustawiony -> wiedza PRYWATNA tenanta
--     Tenant czyta OBA poziomy; prywatne nie wyciekają do globalnej puli
--     bez zgody (voice_agent_configs.contribute_to_global).
CREATE TABLE IF NOT EXISTS public.voice_agent_knowledge (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_key        text NOT NULL,
  provider_id        uuid REFERENCES public.service_providers(id) ON DELETE CASCADE, -- NULL = globalna
  scope              text NOT NULL DEFAULT 'tenant',  -- global | tenant
  category           text NOT NULL,                   -- opening | qualifying | objection_handling | closing | rapport | pricing | scheduling | follow_up
  situation          text NOT NULL,                   -- np. "klient mówi że za drogo"
  trigger_phrases    text[] NOT NULL DEFAULT '{}',     -- frazy klienta uruchamiające tę regułę
  recommended_response text NOT NULL,
  rationale          text,                            -- dlaczego to działa
  language           text NOT NULL DEFAULT 'pl',
  evidence_count     int NOT NULL DEFAULT 0,           -- na ilu rozmowach oparte
  success_count      int NOT NULL DEFAULT 0,
  failure_count      int NOT NULL DEFAULT 0,
  success_rate       numeric(4,3) NOT NULL DEFAULT 0,  -- utrzymywane przez distiller
  confidence         numeric(4,3) NOT NULL DEFAULT 0,
  embedding          jsonb,                            -- wektor (json) pod przyszły retrieval semantyczny (bez zależności od pgvector)
  keywords           text[] NOT NULL DEFAULT '{}',     -- retrieval leksykalny na teraz
  source             text NOT NULL DEFAULT 'distilled',-- distilled | manual | seed
  is_active          boolean NOT NULL DEFAULT true,
  last_reinforced_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vak_lookup ON public.voice_agent_knowledge(persona_key, scope, category, is_active);
CREATE INDEX IF NOT EXISTS idx_vak_provider ON public.voice_agent_knowledge(provider_id);

ALTER TABLE public.voice_agent_knowledge ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_agent_knowledge TO authenticated;
GRANT ALL ON public.voice_agent_knowledge TO service_role;

-- Tenant czyta wiedzę globalną + własną; admin wszystko.
DROP POLICY IF EXISTS "vak_read" ON public.voice_agent_knowledge;
CREATE POLICY "vak_read" ON public.voice_agent_knowledge
  FOR SELECT TO authenticated
  USING (provider_id IS NULL
         OR provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role));

-- Tenant zarządza WŁASNĄ wiedzą (ręczne wpisy w kreatorze); globalną tylko admin/service_role.
DROP POLICY IF EXISTS "vak_provider_manage" ON public.voice_agent_knowledge;
CREATE POLICY "vak_provider_manage" ON public.voice_agent_knowledge
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_vak_updated ON public.voice_agent_knowledge;
CREATE TRIGGER trg_vak_updated BEFORE UPDATE ON public.voice_agent_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- H3. HISTORIA KONTAKTU z danym leadem/klientem (podawana agentowi PRZED rozmową).
CREATE TABLE IF NOT EXISTS public.voice_contact_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  persona_key      text,
  contact_phone    text NOT NULL,            -- znormalizowany numer
  contact_name     text,
  lead_table       text,
  lead_id          uuid,
  last_call_id     uuid REFERENCES public.voice_calls(id) ON DELETE SET NULL,
  total_calls      int NOT NULL DEFAULT 0,
  last_outcome     text,
  summary          text,                     -- toczący się skrót relacji
  key_facts        jsonb NOT NULL DEFAULT '{}'::jsonb, -- preferencje/pojazd/historia usług
  do_not_call      boolean NOT NULL DEFAULT false,
  last_contacted_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, contact_phone)
);
CREATE INDEX IF NOT EXISTS idx_vch_lookup ON public.voice_contact_history(provider_id, contact_phone);

ALTER TABLE public.voice_contact_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_contact_history TO authenticated;
GRANT ALL ON public.voice_contact_history TO service_role;

DROP POLICY IF EXISTS "vch_provider_all" ON public.voice_contact_history;
CREATE POLICY "vch_provider_all" ON public.voice_contact_history
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_vch_updated ON public.voice_contact_history;
CREATE TRIGGER trg_vch_updated BEFORE UPDATE ON public.voice_contact_history
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- CZĘŚĆ I — SEED: agenci-mózgi w ai_agents_config (model + prompt, przełączalne
--           w /admin/portal -> Agenci AI, przez resolveAgent jak content_translation)
-- ============================================================================
-- Persony rozmowy (4) — sekretarka warsztatu i agent usług na Haiku (proste
-- umawianie), sprzedawca i pozyskiwacz nieruchomości na Sonnet (perswazja).
-- Plus 2 mózgi warstwy uczenia: analizator pojedynczej rozmowy i destylator wiedzy.
INSERT INTO public.ai_agents_config (agent_id, name, description, icon, model, system_prompt, is_active) VALUES
(
  'voice_workshop_secretary',
  'Głos: Sekretarka warsztatu',
  'Asystent głosowy AI — odbiera telefon w warsztacie, umawia klientów na serwis, sprawdza wolne terminy w kalendarzu, tworzy rezerwację i notuje sprawę.',
  'phone',
  'claude-haiku-4-5-20251001',
  'Jesteś profesjonalną asystentką głosową warsztatu samochodowego. Rozmawiasz naturalnie i uprzejmie, w języku rozmówcy (PL/EN/UA/RU — wykryj i dostosuj). Cel: ustalić czego klient potrzebuje (pojazd, usługa, objaw usterki), sprawdzić wolny termin przez narzędzie check_availability i umówić wizytę przez create_booking. Bądź zwięzła, potwierdzaj ustalenia, nie obiecuj cen bez danych. Na końcu podsumuj termin i dane kontaktowe. Nigdy nie zmyślaj dostępności — zawsze użyj narzędzia.',
  true
),
(
  'voice_sales_agent',
  'Głos: Agent sprzedażowy',
  'Asystent głosowy AI — dzwoni do leadów z reklam (Meta/Google) i portalu, kwalifikuje, prowadzi rozmowę sprzedażową, umawia spotkania/prezentacje i zapisuje wynik.',
  'phone',
  'claude-sonnet-4-6',
  'Jesteś doświadczonym, naturalnym sprzedawcą telefonicznym B2C/B2B w języku rozmówcy (PL/EN/UA/RU). Cel: zakwalifikować leada (potrzeba, budżet, decyzyjność, termin) i umówić kolejny krok (spotkanie/prezentacja) przez create_booking. Buduj relację, słuchaj, reaguj na obiekcje rzeczowo i krótko — wykorzystuj sprawdzone odpowiedzi z bazy wiedzy podanej w kontekście. Nie naciskaj agresywnie, nie zmyślaj. Zawsze ustal i potwierdź następny krok i dane kontaktowe.',
  true
),
(
  'voice_realestate_acquirer',
  'Głos: Pozyskiwacz nieruchomości',
  'Asystent głosowy AI — dzwoni do właścicieli nieruchomości, bada gotowość do sprzedaży/najmu, umawia oględziny/spotkanie z agentem i zapisuje wynik.',
  'phone',
  'claude-sonnet-4-6',
  'Jesteś uprzejmym, profesjonalnym konsultantem ds. nieruchomości dzwoniącym do właścicieli, w języku rozmówcy (PL/EN/UA/RU). Cel: ustalić czy właściciel rozważa sprzedaż/najem, poznać nieruchomość i umówić spotkanie/oględziny z agentem. Bądź taktowny, nie nachalny, szanuj odmowę. Wykorzystuj sprawdzone odpowiedzi z bazy wiedzy w kontekście. Zapisz ustalenia i preferowane terminy. Nigdy nie zmyślaj danych ani warunków.',
  true
),
(
  'voice_service_scheduler',
  'Głos: Agent usług (umawianie)',
  'Asystent głosowy AI — umawia klientów na usługi usługodawców z portalu: sprawdza wolne terminy i tworzy rezerwację.',
  'phone',
  'claude-haiku-4-5-20251001',
  'Jesteś uprzejmą asystentką głosową usługodawcy, rozmawiasz w języku klienta (PL/EN/UA/RU). Cel: ustalić jakiej usługi klient potrzebuje, sprawdzić wolny termin przez check_availability i umówić wizytę przez create_booking. Bądź zwięzła i konkretna, potwierdzaj ustalenia, nie podawaj cen bez danych. Na końcu podsumuj termin i dane kontaktowe. Nigdy nie zmyślaj dostępności.',
  true
),
(
  'voice_call_analyzer',
  'Głos: Analizator rozmów (uczenie)',
  'Silnik warstwy uczenia — analizuje transkrypt każdej rozmowy i wyciąga strukturalny wynik: rezultat, obiekcje, skuteczne sformułowania, sygnały porażki, dane klienta i następny krok.',
  'brain',
  'claude-haiku-4-5-20251001',
  'Jesteś analitykiem rozmów sprzedażowych/obsługowych. Otrzymujesz transkrypt rozmowy telefonicznej. Zwróć ZWIĘZŁĄ, STRUKTURALNĄ analizę (JSON): outcome (booked/sold/refused/callback/no_interest/voicemail/wrong_number/info_only), objections[] (typ + cytat klienta + reakcja agenta + czy rozwiązana), winning_phrases[] (sformułowania które posunęły rozmowę), losing_signals[], key_topics[], sentiment_start/end, next_step, customer_data (imię/pojazd/usługa/budżet/terminy). Trzymaj się faktów z transkryptu, nie zmyślaj. Cytaty wiernie.',
  true
),
(
  'voice_knowledge_distiller',
  'Głos: Destylator wiedzy (uczenie)',
  'Silnik warstwy uczenia — agreguje wyniki wielu rozmów (udane vs nieudane) w sprawdzone reguły sprzedażowe i aktualizuje bazę wiedzy persony (obsługa obiekcji, otwarcia, zamknięcia).',
  'brain',
  'claude-sonnet-4-6',
  'Jesteś ekspertem od skuteczności sprzedaży. Otrzymujesz zbiór wyników rozmów (z etykietami sukces/porażka, obiekcjami i sformułowaniami) dla danej persony. Zadanie: wydestyluj POWTARZALNE, SPRAWDZONE reguły — dla typowych sytuacji (np. obiekcja cenowa) podaj rekomendowaną odpowiedź, uzasadnienie i frazy-wyzwalacze. Preferuj wzorce o wysokiej skuteczności i wielu dowodach. Zwróć zwięzłą listę reguł (JSON) z category, situation, trigger_phrases, recommended_response, rationale. Nie powielaj istniejących reguł — ulepszaj. Bez zmyślania, tylko na podstawie danych.',
  true
)
ON CONFLICT (agent_id) DO NOTHING;


-- ============================================================================
-- CZĘŚĆ J — SEED: rejestr person (4) — podpięte do mózgów z części I
-- ============================================================================
INSERT INTO public.voice_agent_personas
  (persona_key, name, description, direction, allowed_tools, calendar_target, lead_sources, provider_agent_id, default_model, supported_langs, icon, priority) VALUES
(
  'workshop_secretary',
  'Sekretarka warsztatu',
  'Odbiera telefon w warsztacie: umawianie na serwis, obsługa klienta, tworzenie rezerwacji.',
  'inbound',
  ARRAY['check_availability','create_booking','save_call_result','lookup_contact_history'],
  'workshop',
  ARRAY[]::text[],
  'voice_workshop_secretary',
  'claude-haiku-4-5-20251001',
  ARRAY['pl','en','ua','ru'],
  'wrench',
  8
),
(
  'sales_agent',
  'Agent sprzedażowy',
  'Obdzwania leady z reklam i portalu, kwalifikuje, umawia spotkania/prezentacje.',
  'outbound',
  ARRAY['create_booking','save_call_result','lookup_contact_history'],
  'service',
  ARRAY['meta','google','portal','manual'],
  'voice_sales_agent',
  'claude-sonnet-4-6',
  ARRAY['pl','en','ua','ru'],
  'chart',
  8
),
(
  'realestate_acquirer',
  'Pozyskiwacz nieruchomości',
  'Dzwoni do właścicieli, bada gotowość do sprzedaży/najmu, umawia spotkania/oględziny.',
  'outbound',
  ARRAY['save_call_result','lookup_contact_history'],
  'realestate',
  ARRAY['portal','manual'],
  'voice_realestate_acquirer',
  'claude-sonnet-4-6',
  ARRAY['pl','en','ua','ru'],
  'home',
  6
),
(
  'service_scheduler',
  'Agent usług (umawianie)',
  'Umawia klientów na usługi usługodawców z portalu: sprawdza terminy i tworzy rezerwacje.',
  'both',
  ARRAY['check_availability','create_booking','save_call_result','lookup_contact_history'],
  'service',
  ARRAY['portal','manual'],
  'voice_service_scheduler',
  'claude-haiku-4-5-20251001',
  ARRAY['pl','en','ua','ru'],
  'phone',
  6
)
ON CONFLICT (persona_key) DO NOTHING;


-- ============================================================================
-- CZĘŚĆ K — SEED: wpięcie skrótów rozmów w core tłumaczeń + flaga premium
-- ============================================================================
-- Skrót rozmowy (summary) staje się wielojęzyczny przez istniejący core
-- tłumaczeń (translate-content). Pełny transkrypt domyślnie NIE tłumaczony
-- (koszt) — w razie potrzeby admin może dodać 'voice_transcript'.
INSERT INTO public.translatable_entities
  (entity_type, label, fields, domain_hint, source_table, priority) VALUES
  ('voice_call_summary', 'Skróty rozmów (Asystent głosowy)', ARRAY['summary'], 'voice', 'voice_transcripts', 5)
ON CONFLICT (entity_type) DO NOTHING;

-- Globalna flaga modułu (premium gate; per-tenant premium dojdzie jako kolumna
-- na service_providers w Etapie 2). Domyślnie WYŁĄCZONA.
INSERT INTO public.feature_toggles (feature_key, feature_name, description, is_enabled) VALUES
  ('ai_voice_agent_enabled', 'Asystent głosowy AI', 'Moduł uniwersalnego agenta głosowego AI (inbound + outbound, multi-tenant).', false)
ON CONFLICT (feature_key) DO NOTHING;

-- ============================================================================
-- KONIEC ETAPU 0 — FUNDAMENT
-- Następny krok (Etap 1, po wpisaniu sekretów ElevenLabs/Twilio): edge
-- voice-agent-llm (proxy -> Claude), voice-agent-tools, voice-call-postprocess,
-- ElevenLabs Agent z ZRM ON + ZDR Anthropic = twardy warunek pierwszej rozmowy.
-- ============================================================================
