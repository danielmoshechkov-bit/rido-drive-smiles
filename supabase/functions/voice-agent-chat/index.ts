// ============================================================================
// voice-agent-chat — MÓZG agenta w trybie tekstowym (test rozmowy bez telefonu).
// Ten sam silnik, którego użyjemy w Etapie 1 jako custom-LLM dla rozmowy głosowej.
//
// Buduje pełny system prompt: persona (z ai_agents_config przez provider_agent_id)
// + kontekst firmy (business_context) + język + tryb testowy.
// Klucz Anthropic jest pobierany wyłącznie z secure store. Dostęp: zalogowany user.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhase1Secret } from "../_shared/voicePhase1SecretReader.ts";
import { resolvePhase1Agent } from "../_shared/voicePhase1AgentConfig.ts";
import { executePhase1Fallback, type Phase1VoiceRouting } from "../_shared/voicePhase1Runtime.ts";
import {
  buildPhase1AnthropicRequest,
  consumePhase1AnthropicSse,
  type Phase1ConversationMessage,
  type Phase1ToolCall,
  type Phase1ToolDefinition,
} from "../_shared/voicePhase1ModelAdapter.ts";
import { cachedContext } from "../_shared/voiceContextCache.ts";
import { resolveVoiceProductionCanary } from "../_shared/voiceProductionCanary.ts";
import { jezykRozmowy, snapshotWJezyku } from "../_shared/voiceJezykRozmowy.ts";
import { wzorceWJezyku, zdanieAwarii } from "../_shared/voiceWzorce.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const cleanKey = (k: string) => k.replace(/[^\x20-\x7E]/g, "");

const LANG_NAMES: Record<string, string> = { pl: "polskim", en: "angielskim", ua: "ukraińskim", ru: "rosyjskim" };
type InputMessage = { role?: unknown; content?: unknown };
type KnowledgeEntry = { category?: string; situation?: string; recommended_response?: string };
type LegacyContentBlock = {
  type?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  text?: string;
};
type ToolOutput = {
  ok?: boolean;
  error?: string;
  do_not_retry?: boolean;
  cancelled?: boolean;
  duplicate?: boolean;
  simulated?: boolean;
  order_id?: string;
  order_number?: string;
  booking_id?: string;
  [key: string]: unknown;
};
// Klasyfikacja odmowy modelu. Rozróżnienie ma konsekwencję operacyjną, nie tylko
// diagnostyczną: przy 400 (błędne żądanie) i 429 (limit konta) fallback na drugi
// model NIC NIE DA — oba kandydaty używają tego samego ANTHROPIC_API_KEY, tej samej
// organizacji i dostają identyczne żądanie. Druga próba tylko wydłużyłaby ciszę
// w słuchawce. Fallback ma sens wyłącznie przy 529 (przeciążenie konkretnego
// modelu) oraz przy timeoucie.
// SMS awaryjny do warsztatu jest CELOWO WYŁĄCZONY do czasu wprowadzenia
// conversation_id i idempotencji. Bez identyfikatora rozmowy nie ma jak
// rozpoznać, że dwie nieudane tury należą do tego samego telefonu — jedna
// rozmowa wysłałaby kilka SMS-ów i zużyła kilka kredytów.
// Włączenie = zmiana tej stałej na true, nic więcej.
const CALLBACK_SMS_ENABLED = false;

type ModelFailure = "bad_request" | "quota" | "overloaded" | "upstream" | "other";
const classifyModelFailure = (status: number): ModelFailure =>
  status === 400 ? "bad_request"
    : status === 429 ? "quota"
    : status === 529 ? "overloaded"
    : status >= 500 ? "upstream"
    : "other";
const MODEL_FAILURE_FALLBACK: Record<ModelFailure, boolean> = {
  bad_request: false,
  quota: false,
  overloaded: true,
  upstream: true,
  other: false,
};

// Komunikat awaryjny czytany na głos. Nie zdradzamy szczegółów technicznych i nie
// twierdzimy, że rezerwacja powstała.
//
// UWAGA na zakres wiedzy: `mutationCreated` dotyczy WYŁĄCZNIE bieżącego żądania
// HTTP, a każda tura rozmowy to osobne wywołanie tej funkcji. Rezerwacja utworzona
// w poprzedniej turze jest tu niewidoczna. Dlatego wariant "nic nie zapisano" NIE
// MOŻE tu wystąpić — w prawdziwej rozmowie skłamał: booking i zlecenie powstały
// w turze wcześniejszej, a agent powiedział, że nic nie zostało zapisane.
// Wiedzę o całej rozmowie da dopiero conversation_id (osobny etap).
// JEZYK ROZMOWY, NIE POLSKI NA SZTYWNO (16.08).
// Gdy skonczyly sie kredyty Anthropic, kazda rozmowa — takze rosyjska
// i angielska — konczyla sie polskim zdaniem o problemie technicznym.
// Rozmowca dostawal komunikat, ktorego nie rozumial, w jedynym momencie,
// w ktorym musi zrozumiec.
const buildFailureSentence = (failure: ModelFailure | null, mutationCreated: boolean, jezyk?: string | null): string => {
  if (mutationCreated) {
    // Nie przepraszamy za awarię, której klient nie odczuł: rezerwacja jest zapisana,
    // SMS pójdzie. Wcześniejsza wersja mówiła tu "straciłam wątek", co brzmiało jak
    // usterka mimo pełnego sukcesu.
    return zdanieAwarii("zapisane", jezyk);
  }
  if (failure === "quota") return zdanieAwarii("limit", jezyk);
  return zdanieAwarii("techniczne", jezyk);
};

const logTiming = (stage: string, startedAt: number, extra: Record<string, unknown> = {}) => {
  console.info("[voice-agent-chat]", JSON.stringify({
    event: "stage_timing", stage,
    duration_ms: Math.round(performance.now() - startedAt),
    ...extra,
  }));
};

// ALERT ROZLICZENIOWY.
//
// 16.08 skonczyly sie kredyty Anthropic. Kazda rozmowa konczyla sie zdaniem
// o problemie technicznym, a dowiedzielismy sie o tym PRZYPADKIEM, przy okazji
// symulacji. Bez niej pierwsza informacja przyszlaby od klienta warsztatu.
//
// System, ktory przestaje dzialac po cichu, jest gorszy niz system, ktory krzyczy.
//
// Alert idzie do `system_alerts` RAZ NA GODZINE, nie raz na ture — awaria
// rozliczeniowa dotyka kazdego polaczenia i bez tego progu zalalaby tabele.
const BLAD_ROZLICZENIOWY = /credit balance|insufficient.{0,20}(credit|quota|funds)|billing|payment required/i;

const zapiszAlertRozliczeniowy = async (
  admin: { from: (t: string) => any },
  tresc: string,
  providerId: string | null,
) => {
  try {
    const godzinaTemu = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // system_alerts ma ZAMKNIETE listy wartosci:
    //   category IN (import, matching, validation, system)
    //   status   IN (pending, resolved, ignored)
    // Pierwsza wersja uzywala category='voice_agent_billing' i status='open'
    // — baza odrzucala INSERT, a `catch` nizej zjadal blad. Alert NIGDY by nie
    // powstal i nikt by sie o tym nie dowiedzial. Zlapane wierszem testowym,
    // nie przez awarie. Rozpoznajemy wlasne alerty po metadata.zrodlo.
    const { data: istnieje } = await admin.from("system_alerts")
      .select("id").eq("category", "system").eq("status", "pending")
      .eq("metadata->>zrodlo", "voice_agent_billing")
      .gte("created_at", godzinaTemu).limit(1);
    if (istnieje?.length) return;
    await admin.from("system_alerts").insert({
      type: "error",
      category: "system",
      title: "Agent glosowy nie odpowiada — problem rozliczeniowy dostawcy modelu",
      description: "Kazde polaczenie konczy sie komunikatem o problemie technicznym. "
        + "Doladuj konto dostawcy modelu. Tresc bledu: " + tresc.slice(0, 300),
      status: "pending",
      metadata: { zrodlo: "voice_agent_billing", provider_id: providerId, wykryte: new Date().toISOString() },
    });
    console.error("[voice-agent-chat]", JSON.stringify({ event: "billing_alert_zapisany" }));
  } catch (e) {
    // Alert, ktorego nie da sie zapisac, nie moze przewrocic rozmowy.
    console.error("[voice-agent-chat]", JSON.stringify({ event: "billing_alert_nieudany", blad: (e as Error)?.message?.slice(0, 120) }));
  }
};


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let requestWasCanary = false;
  // Do zbudowania uczciwego komunikatu awaryjnego: nigdy nie twierdzimy, że nic
  // nie zapisano, jeśli rezerwacja lub zlecenie faktycznie powstały.
  let lastModelFailure: ModelFailure | null = null;
  let anyMutationCreated = false;
  try {
    const totalStarted = performance.now();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("Brak konfiguracji Supabase");

    // /warmup — patrz identyczna gałąź w voice-agent-llm. Jedno trywialne zapytanie,
    // za tokenem, poza ścieżką rozmowy: nie czyta konfiguracji, nie woła modelu,
    // nie zapisuje. Grzeje połączenie do bazy, którego zwykły keep-warm nie dotykał,
    // bo dostawał 401 wcześniej.
    if (new URL(req.url).pathname.endsWith("/warmup")) {
      const warmAdmin = createClient(supabaseUrl, serviceRoleKey);
      const expected = await getPhase1Secret(warmAdmin, "VOICE_LLM_TOKEN");
      const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim()
        || new URL(req.url).searchParams.get("token") || "";
      if (!expected || !provided || provided.length !== expected.length || provided !== expected) {
        return json({ success: false, error: "unauthorized" }, 401);
      }
      const warmStarted = performance.now();
      await warmAdmin.from("voice_agent_configs").select("provider_id").limit(1);
      logTiming("warmup", warmStarted);
      return json({ ok: true, warm: true });
    }

    const authHeader = req.headers.get("Authorization");
    const isServiceCall = authHeader === `Bearer ${serviceRoleKey}`; // proxy telefonii woła service-role
    let authenticatedUserId: string | null = null;
    if (!isServiceCall) {
      if (!authHeader) return json({ success: false, error: "Brak autoryzacji" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return json({ success: false, error: "Brak autoryzacji" }, 401);
      authenticatedUserId = user.id;
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    let apiKey = await getPhase1Secret(admin, "ANTHROPIC_API_KEY");
    if (!apiKey) return json({ success: false, error: "Brak klucza Anthropic (ANTHROPIC_API_KEY)" }, 400);
    apiKey = cleanKey(apiKey);

    const body = await req.json().catch(() => ({}));
    const personaKey = String(body?.persona_key || "");
    const messages: InputMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    const bc = body?.business_context || {};
    const displayName = String(body?.display_name || "").trim();
    const langs: string[] = Array.isArray(body?.languages) && body.languages.length ? body.languages : ["pl"];
    const calendarAccess = !!body?.calendar_access;
    const ordersAccess = !!body?.orders_access;
    const providerId = String(body?.provider_id || "");
    const testMode = body?.test_mode !== false; // domyślnie test (chat); telefonia ustawi false
    const voiceGender = String(body?.voice_gender || "").toLowerCase();
    const dryRunTools = !!body?.dry_run_tools; // symulacja treningowa — narzędzia nie piszą do bazy
    // Identyfikator rozmowy przychodzi wyłącznie z wewnętrznego, uwierzytelnionego
    // wywołania service-role z voice-agent-llm. Wywołanie użytkownika go nie ustawi.
    const conversationId = isServiceCall ? String(body?.conversation_id || "") : "";
    // Numer dzwoniącego z sygnalizacji SIP. Gdy jest — agent NIE pyta o telefon
    // (jedna tura mniej, ~2 s). Gdy go nie ma (numer zastrzeżony) — musi zapytać,
    // bo inaczej rozmowa zostaje bez żadnego kontaktu do klienta.
    const callerIdAvailable = isServiceCall && !!body?.caller_id_available;
    const callerId = isServiceCall ? String(body?.caller_id || "") : "";
    if (!isServiceCall && providerId && authenticatedUserId) {
      const [{ data: provider }, { data: adminRole }] = await Promise.all([
        admin.from("service_providers").select("id").eq("id", providerId).eq("user_id", authenticatedUserId).maybeSingle(),
        admin.from("user_roles").select("id").eq("user_id", authenticatedUserId).eq("role", "admin").maybeSingle(),
      ]);
      if (!provider && !adminRole) return json({ success: false, error: "Brak dostępu do firmy" }, 403);
    }

    // Agent ID jest przekazywany tylko przez uwierzytelnione wewnętrzne proxy,
    // które wcześniej odczytało go z istniejącego voice_agent_configs.
    const canaryAgentId = isServiceCall && body?.production_canary === true
      ? String(body?.elevenlabs_agent_id || "")
      : "";
    const canary = resolveVoiceProductionCanary(providerId, canaryAgentId);
    requestWasCanary = canary.enabled;
    const responseStream = canary.enabled && body?.response_stream === true;
    const responseAbort = new AbortController();
    const canaryAbortSignal = AbortSignal.any([req.signal, responseAbort.signal]);

    // Rozmowa przerwana błędem technicznym to utracony klient — warsztat musi się
    // o tym dowiedzieć od razu. Wysyłamy krótkiego SMS-a na numer firmowy z prośbą
    // o oddzwonienie. Best-effort: nie blokuje mowy (wołane po wysłaniu tekstu),
    // nie przerywa strumienia i nigdy nie loguje numerów.
    //
    // OGRANICZENIE: numeru dzwoniącego dziś NIE ZNAMY — ElevenLabs nie przekazuje go
    // do Custom LLM w żadnym polu, które czytamy (sonda w voice-agent-llm ma to
    // ustalić). Do tego czasu SMS mówi wprost, że numer trzeba odczytać z billingu.
    // Bez conversation_id nie ma też dedupu: dwie nieudane tury = dwa SMS-y.
    const notifyWorkshopCallback = async (callerNumber: string | null) => {
      try {
        if (!providerId) return;
        const { data: provider } = await admin
          .from("service_providers").select("company_phone").eq("id", providerId).maybeSingle();
        const target = (provider as { company_phone?: string } | null)?.company_phone;
        if (!target) {
          console.warn("[voice-agent-chat]", JSON.stringify({ event: "callback_sms_skipped", reason: "no_company_phone" }));
          return;
        }
        const message = callerNumber
          ? `GetRido AI: rozmowa przerwana bledem technicznym. Prosba o oddzwonienie: ${callerNumber}`
          : "GetRido AI: rozmowa przerwana bledem technicznym. Prosba o oddzwonienie do klienta - numer sprawdz w billingu.";
        const response = await fetch(`${supabaseUrl}/functions/v1/workshop-send-sms`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
          body: JSON.stringify({ provider_id: providerId, phone: target, message, sms_type: "ai_callback_request" }),
          signal: AbortSignal.timeout(8_000),
        });
        console.info("[voice-agent-chat]", JSON.stringify({ event: "callback_sms", ok: response.ok, status: response.status }));
      } catch (error) {
        console.warn("[voice-agent-chat]", JSON.stringify({ event: "callback_sms_failed", error: (error as Error)?.name || "error" }));
      }
    };

    // KONTEKST CZASU (Europa/Warszawa) — agent musi znać dziś/teraz, by liczyć "jutro"
    const now = new Date();
    const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(now);
    const humanDate = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
    const nowTime = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }).format(now);

    // Wiedza nie zależy od persony ani od agenta — startujemy zapytanie tutaj, żeby
    // biegło równolegle z odczytem persony i konfiguracji. Każda sekwencyjna podróż
    // do bazy przed pierwszym tokenem to bezpośrednie opóźnienie w słuchawce.
    let knowledgeQuery = admin.from("voice_agent_knowledge").select("category, situation, recommended_response")
      .eq("persona_key", personaKey).eq("is_active", true);
    knowledgeQuery = providerId
      ? knowledgeQuery.or(`provider_id.eq.${providerId},provider_id.is.null`)
      : knowledgeQuery.is("provider_id", null);
    // KONTEKST Z JEDNEGO ZAPYTANIA.
    //
    // voice-agent-llm woła get_voice_context i przekazuje wynik tutaj (połączenie
    // service-role). Dzięki temu ścieżka tury NIE DOTYKA BAZY. Gdy kontekstu nie ma
    // — panel testowy, starsza wersja llm, błąd RPC — czytamy jak dotąd, więc
    // rozmowa działa w obu wariantach.
    const ctx = (isServiceCall ? body?.voice_context : null) as {
      persona?: { provider_agent_id?: string | null };
      agent?: { model?: string | null; system_prompt?: string | null };
      knowledge?: KnowledgeEntry[];
    } | null;

    const knowledgePromise = ctx?.knowledge
      ? Promise.resolve({ data: ctx.knowledge })
      : knowledgeQuery.order("evidence_count", { ascending: false }).limit(10);

    // Persona -> provider_agent_id -> prompt+model z ai_agents_config
    const persona = ctx?.persona
      ? ctx.persona
      : (await admin.from("voice_agent_personas").select("provider_agent_id, name, direction")
          .eq("persona_key", personaKey).maybeSingle()).data;
    const agentId = persona?.provider_agent_id || "voice_workshop_secretary";
    const agent = ctx?.agent?.model
      ? { model: ctx.agent.model, systemPrompt: ctx.agent.system_prompt || undefined }
      : await resolvePhase1Agent(admin, agentId, "claude-sonnet-4-6");
    // Wybór modelu rozmowy.
    //
    // LEGACY bez zmian: odrzuca Haiku i wymusza Sonnet (dawne założenie "Haiku brzmi
    // sztucznie"). Kontrakt gałęzi legacy zostaje nietknięty.
    //
    // CANARY bierze model z konfiguracji agenta (ai_agents_config.model), żeby dało się
    // porównać szybkość i koszt BEZ zmiany kodu — przełącznik jest w bazie, nie w deployu.
    // UWAGA: to zmienia zachowanie w momencie wdrożenia, bo konfiguracja tej persony
    // wskazuje dziś Haiku. Jeśli baseline ma zostać na Sonnecie, najpierw ustaw
    // ai_agents_config.model = 'claude-sonnet-4-6' dla voice_workshop_secretary.
    const CONVO_DEFAULT = "claude-sonnet-4-6";
    const configuredModel = agent?.model && agent.model.startsWith("claude") ? agent.model : null;
    const model = canary.enabled
      ? (configuredModel || CONVO_DEFAULT)
      : (configuredModel && !configuredModel.includes("haiku") ? configuredModel : CONVO_DEFAULT);
    const legacyRouting: Phase1VoiceRouting = {
      primary: {
        providerKey: "claude_sonnet", providerName: "Anthropic (legacy)", model,
        timeoutMs: 30_000, adapterKey: "anthropic_messages", secretKey: "ANTHROPIC_API_KEY",
        endpoint: "https://api.anthropic.com/v1/messages",
      },
      fallback: null, allowFallback: false, maxToolRounds: 5, maxOutputTokens: 400,
    };
    const phase1CanaryRouting: Phase1VoiceRouting = {
      primary: { ...legacyRouting.primary, providerName: "Anthropic (Phase 1 primary)", timeoutMs: 8_000 },
      fallback: {
        providerKey: "claude_haiku", providerName: "Anthropic (Phase 1 fallback)",
        model: "claude-haiku-4-5-20251001", timeoutMs: 8_000,
        adapterKey: "anthropic_messages", secretKey: "ANTHROPIC_API_KEY",
        endpoint: "https://api.anthropic.com/v1/messages",
      },
      // 400 tokenów — wartość z POMIARU NA TRZYNASTU ROZMOWACH (06.08), nie z oka.
      //
      // Historia tej liczby jest ostrzeżeniem samym w sobie. 150 dobrałem
      // z JEDNEJ rozmowy: najdłuższa wypowiedź miała 183 znaki ≈ 57 tokenów,
      // więc 150 wyglądało na dwukrotny zapas. Na trzynastu rozmowach
      // najdłuższa miała 249 znaków ≈ 78 tokenów, a gdy w tej samej turze
      // model generował jeszcze wywołanie narzędzia, budżet się kończył:
      // 3 ucięcia na 126 żądań (przed zmianą: 0 na 116). Jedno z nich
      // rozwaliło rozmowę z klientką mówiącą po rosyjsku — usłyszała dwa razy
      // "Przepraszam, nie zdążyłem dokończyć" i rozłączyła się bez zapisu.
      //
      // 400 daje ~5× zapas na realną wypowiedź plus wywołanie narzędzia,
      // a nadal ucina generowanie patologiczne. Nie wracamy do 600: przy 600
      // ogon generowania tekstu miał p90 3,70 s, przy 150 spadł do 0,71 s —
      // ograniczenie działa, tylko było za ciasne.
      //
      // Ucięcie NIE jest ciche: stopReason "max_tokens" loguje
      // `output_truncated` i oddaje turę rozmówcy (niżej). Ten log jest
      // miernikiem, czy 400 wystarcza — ma być zero.
      allowFallback: true, maxToolRounds: 3, maxOutputTokens: 400,
    };
    const voiceRouting = canary.enabled ? phase1CanaryRouting : legacyRouting;
    logTiming("prepare", totalStarted, { production_canary: canary.enabled });
    const base = body?.custom_prompt_override?.trim() || agent?.systemPrompt ||
      "Jesteś profesjonalnym asystentem głosowym. Rozmawiaj naturalnie, prowadź wywiad i pomóż klientowi.";

    // Kontekst firmy
    const lines: string[] = [];
    if (bc.company_name) lines.push(`Firma: ${bc.company_name}`);
    if (displayName) lines.push(`Przedstawiasz się jako: ${displayName}`);
    if (bc.description) lines.push(`Czym się zajmuje: ${bc.description}`);
    if (bc.hours) lines.push(`Godziny pracy: ${bc.hours}`);
    if (bc.location) lines.push(`Lokalizacja: ${bc.location}`);
    if (bc.services) lines.push(`Usługi:\n${bc.services}`);
    if (bc.agent_intro) lines.push(`Powitanie/cel: ${bc.agent_intro}`);
    if (bc.purpose) lines.push(`Cel rozmów: ${bc.purpose}`);
    if (bc.extra_info) lines.push(`Dodatkowe informacje: ${bc.extra_info}`);
    if (bc.roadside) lines.push(`Pomoc drogowa / laweta / dojazd: ${bc.roadside}`);
    const langStr = langs.map((l) => LANG_NAMES[l] || l).join(", ");

    let system = base;
    if (lines.length) system += `\n\n=== KONTEKST FIRMY (wykorzystuj w rozmowie, nie zmyślaj poza tym) ===\n${lines.join("\n")}`;
    const caps: string[] = [];
    if (calendarAccess) caps.push("możesz sprawdzać wolne terminy i umawiać wizyty");
    if (ordersAccess) caps.push("możesz utworzyć zlecenie z danymi z rozmowy");
    if (caps.length) system += `\nUprawnienia: ${caps.join("; ")}.`;

    // WIEDZA Z POPRZEDNICH ROZMÓW (warstwa uczenia) — zapytanie wystartowało wyżej,
    // równolegle z odczytem persony; tutaj tylko odbieramy wynik.
    const { data: knowledge } = await knowledgePromise;
    if (knowledge?.length) {
      system += `\n\n=== WIEDZA Z POPRZEDNICH ROZMÓW (stosuj; nie powtarzaj wcześniejszych błędów) ===\n` +
        (knowledge as KnowledgeEntry[]).map((entry) => `- [${entry.category}] ${entry.situation}: ${entry.recommended_response}`).join("\n");
    }

    // Rodzaj gramatyczny dopasowany do płci głosu
    const genderClause = voiceGender === "male"
      ? `Twój głos jest MĘSKI — mów O SOBIE w rodzaju męskim (np. "mógłbym", "zrozumiałem", "zapytałem").`
      : voiceGender === "female"
      ? `Twój głos jest ŻEŃSKI — mów O SOBIE w rodzaju żeńskim (np. "mogłabym", "zrozumiałam", "zapytałam").`
      : `Dostosuj rodzaj gramatyczny wypowiedzi o sobie do swojego głosu.`;

    // Usługi — bez sztywnej odmowy (np. laweta zależy od danych firmy)
    const firmName = bc.company_name ? String(bc.company_name) : "warsztat";
    // W telefonii rozmówca słyszy powitanie z systemu (pierwsza wiadomość agenta
    // ElevenLabs), ale nie trafia ono do kontekstu modelu — poniższa pętla
    // budująca `convo` usuwa wiodące wiadomości asystenta, bo Anthropic wymaga,
    // by rozmowa zaczynała się od użytkownika. Model nie wie więc, że powitanie
    // już padło, i wita się drugi raz. W panelu testowym powitania z systemu nie
    // ma, więc tam agent wita się normalnie.
    // Pytanie o telefon zależy od tego, czy mamy numer z sygnalizacji.
    const phoneQuestionRule = callerIdAvailable
      ? 'Kolejność całej rozmowy: problem → termin → IMIĘ + marka i model auta → numer rejestracyjny → podsumowanie. To CAŁA lista. NIE PYTAJ O NUMER TELEFONU — mamy go z połączenia. W podsumowaniu powiedz: "Potwierdzenie wyślemy SMS-em na ten numer." Jeśli klient sam poprosi o inny numer albo go poda — przyjmij ten podany, potwierdź go cyframi pojedynczo i powiedz, że na niego wyślemy potwierdzenie.'
      : 'Kolejność całej rozmowy: problem → termin → IMIĘ + marka i model auta → NUMER TELEFONU → numer rejestracyjny → podsumowanie. Numer telefonu jest wymagany, bo połączenie przyszło z numeru zastrzeżonego. W podsumowaniu powiedz: "Potwierdzenie przyjdzie SMS-em w ciągu kilku minut."';

    const greetingRule = testMode
      ? `- ZAWSZE witaj po POLSKU, BARDZO krótko: "Dzień dobry, ${firmName}, w czym mogę pomóc?". NIE wymieniaj usług w powitaniu, nie zadawaj kilku pytań naraz.`
      : `- Rozmówca usłyszał już z systemu telefonicznego DOKŁADNIE TO: "Dzień dobry, ${firmName}, rozmowa rejestrowana — w czym mogę pomóc?". Tego zdania nie ma w Twoim kontekście, ale ono PADŁO. Nie witaj się drugi raz, nie mów "Dzień dobry", nie przedstawiaj firmy ponownie — nawet jeśli rozmówca zaczyna od "dzień dobry". Odpowiadasz od razu na treść, nie na powitanie.`;
    // PROMPT CACHING: część ZMIENNA musi być na końcu, inaczej prefiks nigdy się nie
    // powtórzy i cache nie zadziała. Kontekst czasu zmienia się co minutę, więc
    // wyprowadzamy go z bloku reguł i doklejamy jako osobny, niecachowany blok.
    // Fakty o czasie, bez reguł — te stoją w sekcjach 1 i 3 promptu.
    // Zostaje wyłącznie rozmowa nocna, bo to jest WYJĄTEK arytmetyczny,
    // którego nie da się wyrazić danymi: o 2 w nocy „jutro" znaczy dziś.
    const systemTimeContext = `\n\n=== KONTEKST CZASU ===\nDziś jest ${humanDate} (${todayISO}), godzina ${nowTime} (Europa/Warszawa). Daty względne wyliczasz sam i przekazujesz narzędziom w formacie RRRR-MM-DD. Nie pytasz klienta o dzisiejszą datę.\n- Między północą a piątą rano klient mówiący "jutro" ma na myśli DZISIEJSZY dzień roboczy. Dopytaj konkretem, podając obie możliwości z dniem tygodnia i datą.`;
    // SNAPSHOT — do CZĘŚCI ZMIENNEJ, nigdy do stałej.
    //
    // Blok stały ma `cache_control: ephemeral` i 100% trafień; terminy zmieniają się
    // częściej niż reguły, więc wrzucenie snapshotu do prefiksu unieważniłoby cache
    // PRZY KAŻDEJ ROZMOWIE. Dlatego ląduje w `systemTimeContext`, który idzie za
    // blokiem cachowanym.
    const snapshotSurowy = isServiceCall ? String(body?.snapshot || "") : "";
    // JĘZYK ROZMOWY I PRZEROBIENIE SNAPSHOTU — na KAŻDEJ turze, bo rozmówca
    // może przejść na inny język w dowolnym momencie, a snapshot powstał raz,
    // przy odebraniu połączenia, i niesie wyłącznie polskie formy.
    //
    // ZASADA NADRZĘDNA: agent nigdy nie miesza języków w jednej wypowiedzi.
    // Bez tego kroku rosyjskie zdanie dostawało polską datę („poniedziałek,
    // siedemnastego sierpnia") — a obce słowo w środku zdania odbiera zaufanie
    // do całej rozmowy.
    const jezyk = jezykRozmowy(messages as Array<{ role?: string; content?: unknown }>);
    const snapshotRaw = snapshotWJezyku(snapshotSurowy, jezyk);
    if (snapshotSurowy) {
      logTiming("jezyk_rozmowy", totalStarted, {
        // BEZ conversation_id NIE DA SIE ROZDZIELIC ROWNOLEGLYCH ROZMOW.
        // 17.08 trzy telefony szly jednoczesnie (14:12, 14:13, 14:14) i wpisy
        // przeplataly sie w logu. Diagnoza „przy ktorej turze detektor
        // przeskoczyl" byla niewykonalna.
        rozmowa: conversationId ? String(conversationId).slice(-8) : null,
        jezyk, przerobiony: snapshotRaw !== snapshotSurowy,
        znakow_przed: snapshotSurowy.length, znakow_po: snapshotRaw.length,
      });
    }
    // AGENT WYŁĄCZONY PRZEZ WARSZTAT. Snapshot niesie wtedy jedno pole i nic
    // więcej — nie ma terminów, cennika ani klientów, bo nie ma czego proponować.
    let wylaczony: { zdanie: string } | null = null;
    try {
      const s = snapshotRaw ? JSON.parse(snapshotRaw) : null;
      if (s && s.wylaczony === true) wylaczony = { zdanie: String(s.zdanie || "") };
    } catch { /* snapshot nie jest JSON-em — zachowujemy się jak dotąd */ }

    let snapshotBlok = "";
    if (wylaczony) {
      snapshotBlok = `\n\n=== WARSZTAT WYŁĄCZYŁ OBSŁUGĘ TELEFONICZNĄ ===\n`
        + `Powiedz DOKŁADNIE to zdanie, w języku rozmowy: „${wylaczony.zdanie}"\n`
        + `Potem grzecznie zakończ rozmowę. NIE proponujesz terminów, NIE pytasz o dane, `
        + `NIE zapisujesz zgłoszenia — nie masz do czego.\n`;
    } else if (snapshotRaw) {
      snapshotBlok = `\n\n=== CO WIESZ O DZIŚ (dane pobrane przy odebraniu połączenia) ===\n${snapshotRaw}\n`
        + `Zasady korzystania z tego bloku stoją w sekcji 3. Dane są już policzone i odmienione — czytasz je znak w znak.\n`
        + `Gdy czegoś w bloku nie ma — użyj check_availability albo powiedz, że nie wiesz. NIE ZGADUJ.\n`;
    }

    // Część ZMIENNA promptu: kontekst czasu + snapshot. Idzie za blokiem
    // cachowanym, więc nie unieważnia prefiksu.
    // WZORCE W JĘZYKU ROZMOWY — na samym końcu promptu, celowo.
    //
    // ZASADA 26: model sięga po wzorzec, bo wzorzec jest konkretniejszy niż
    // reguła. Rozmowa c0yn9bxn: detektor trzymał „ru" przez siedem tur z ośmiu,
    // snapshot był przerobiony na rosyjski, a agent i tak powiedział po polsku
    // „Poproszę imię oraz markę i model auta." — zdanie stojące w prompcie
    // dokładnie w tej formie. Reguła „mów po rosyjsku" była jedna, wzorców
    // polskich 34.
    //
    // Blok wraca jako null dla polskiego, więc polski prompt nie dostaje ANI
    // JEDNEGO znaku. Idzie w systemVolatile, nie w bloku cache'owanym: zmienia
    // się z językiem rozmowy, a statyczny blok ma zostać nietknięty dla cache.
    // Wzorce KAZDEGO jezyka, takze polskiego, ida tutaj — nigdy do bloku
    // statycznego. Polska lista w prompcie statycznym byla kopiowana do zdan
    // angielskich (16.08: „Potwierdzenie przyjdzie SMS-em" w srodku angielskiej
    // wypowiedzi). Jeden jezyk na raz, nigdy dwa naraz.
    const blokWzorcow = wzorceWJezyku(jezyk) || "";
    if (blokWzorcow) logTiming("wzorce_jezyka", totalStarted, { jezyk, znakow: blokWzorcow.length });
    // KOLEJNOSC: reguly -> WZORCE -> dane.
    //
    // Pierwsza wersja stawiala wzorce NA KONCU, za blokiem danych (~9 000
    // znakow). Polski spadl wtedy z 7/7 na 4/7 i wrocily trzy defekty
    // deterministyczne (forma_ty, data_powtorzona, relacjonowanie_pracy),
    // ktore FAZA C usunela. Wzorce oddzielone od regul dziewiecioma tysiacami
    // znakow danych przestaly dzialac jak ilustracja reguly.
    //
    // Teraz wzorce stoja TUZ ZA regulami, a dane na koncu.
    const systemVolatile = systemTimeContext + blokWzorcow + snapshotBlok;
    // SKLAD PROMPTU — placimy za czesc zmienna w KAZDEJ turze.
    //
    // Blok staly idzie z cache_control, wiec od drugiej tury kosztuje 1/10.
    // Blok zmienny (czas + wzorce + snapshot) jest naliczany pelna stawka
    // za kazdym razem. 16.08: 5 420 tokenow swiezych na wywolanie i nie
    // wiedzialem, ile z tego to snapshot — stad ten log.
    logTiming("sklad_promptu", totalStarted, {
      staly_znakow: system.length,
      zmienny_znakow: systemVolatile.length,
      w_tym_snapshot: snapshotBlok.length,
      w_tym_wzorce: blokWzorcow.length,
      w_tym_czas: systemTimeContext.length,
      historia_znakow: (messages as Array<{ content?: unknown }>).reduce((a, m) => a + String(m?.content || "").length, 0),
    });

    // ========================================================================
    // PROMPT — FAZA C, 16.08.2026. 115 reguł -> 29, 21 sekcji -> 8.
    //
    // Poprzednia wersja miała 31 489 znaków i pusty nagłówek, który leżał tam
    // tydzień, bo nikt nie czyta promptu w całości (zasada 29). Reguły
    // `trzy_godziny` i `relacjonowanie_pracy` łamały się 3/3 na trzech
    // przebiegach symulacji — mając własne, coraz mocniej sformułowane akapity.
    //
    // Uzasadnienia (opisy prawdziwych rozmów, ~1/3 dawnej długości) zostały
    // przeniesione do komentarzy kodu i do docs/voice-naturalnosc-dziennik.md.
    // Są materiałem dla nas, nie instrukcją dla modelu.
    //
    // Co da się wyrazić DANYMI, nie jest tu instrukcją: dwie godziny do
    // zaproponowania stoją w snapshocie jako pole `zaproponuj`, ostatni możliwy
    // start jako `ostatni_mozliwy_start`, usługa całodniowa jako
    // `tylko_od_otwarcia`.
    // ========================================================================
    system += `

=== 1. JAK MÓWISZ ===
- Najwyżej dwa krótkie zdania na turę. Jedna informacja ALBO jedno pytanie, nigdy oba. Każdy znak jest czytany na głos i klient czeka w ciszy dokładnie tyle, ile trwa Twoja wypowiedź.
- Mówisz WYNIK, nigdy PROCES. Nie mówisz, że sprawdzasz, zapisujesz, tworzysz ani umawiasz, i nie prosisz o zaczekanie. Jeśli musisz coś sprawdzić — sprawdzasz i podajesz wynik.
- Do poznania imienia mówisz BEZOSOBOWO: bez "Pan", bez "Pani", bez "Ty". Po poznaniu imienia: "Panie Danielu", "Pani Anno" — nigdy nazwiskiem. Imię nietypowe albo niejednoznaczne: zostajesz przy formie bezosobowej. Mówisz do JEDNEJ osoby — "Wam", "Wasze", "Państwa" to błąd.
- ${genderClause}
- Liczby, godziny, daty i ceny wypowiadasz SŁOWAMI, nigdy cyframi. Wyjątek: numer telefonu i rejestracja — tam każdą cyfrę czytasz OSOBNO ("pięć, jeden, dziewięć"), bez setek i dziesiątek.
- Zawsze podajesz dzień tygodnia I datę, dokładnie raz w wypowiedzi.

=== 2. KOLEJNOŚĆ ROZMOWY ===
- Najpierw problem, potem termin, na końcu dane. Nie pytasz o dane w środku opisu usterki.
- Dane bierzesz w DWÓCH turach: imię razem z marką i modelem, potem osobno numer rejestracyjny.
- Nie pytasz o nazwisko. Wystarczy imię. Imienia nie potwierdzasz i nie literujesz.
- Numeru rejestracyjnego ani telefonu nie powtarzasz na głos — nawet gdy klient o to prosi.
- O NUMER REJESTRACYJNY PYTASZ RAZ. Jeśli klient podał go razem z imieniem albo marką — a robi tak często — masz go już i NIE pytasz ponownie. Ciąg liter i cyfr w wypowiedzi klienta to tablica, nawet jeśli padł w środku zdania o czymś innym.
- POTWIERDZENIE I PROŚBA TO DWIE RÓŻNE TURY. „Dobrze, zapisuję." kończy temat. Nie doklejasz do niego kolejnej prośby o to samo — brzmi jak pytanie zadane drugi raz i klient powtarza to, co już powiedział.
- ${phoneQuestionRule}
- Zanim zadasz pytanie, przeczytaj całą dotychczasową rozmowę. Jeśli odpowiedź już padła — choćby innymi słowami — nie pytasz drugi raz.
- Gdy odpowiedź klienta nie wskazuje jednoznacznie jednej z podanych godzin, dopytujesz. Nie zgadujesz.

=== 3. BLOK DANYCH ===
- Wszystko w bloku jest już policzone i odmienione w języku rozmowy. Czytasz gotowe formy z pól kończących się na "do_wypowiedzenia" i "do_powiedzenia". Nie przeliczasz, nie tłumaczysz, nie zamieniasz cyfr na słowa.
- Godziny proponujesz z pola "zaproponuj_do_wypowiedzenia" PRZY DNIU, O KTÓRY PYTA KLIENT. Pole "wolne" jest ZAPASEM: służy do rozpoznania godziny, którą wskaże klient, i do wyboru, gdy klient poda porę dnia.
- Termin, który sam zaproponowałeś, jest z definicji wolny — nie sprawdzasz go ponownie.
- PROPONUJESZ, NIE PYTASZ. Gdy znasz dzień, podajesz od razu konkretną godzinę z pola "zaproponuj_do_wypowiedzenia" — nie pytasz, kiedy klientowi wygodnie. Pytanie zadajesz DOPIERO gdy propozycja została odrzucona, i pytasz wtedy o GODZINĘ, nie o porę dnia. Klient dzwoni, żeby się umówić, nie żeby odpowiadać na pytania.
- Dzień spoza bloku wymaga narzędzia check_availability PRZED podaniem godziny. Nie wyliczasz dat samodzielnie.
- „TEN TYDZIEŃ" I „NASTĘPNY TYDZIEŃ" ODCZYTUJESZ Z POLA "tydzien", nie liczysz. Każdy dzień ma je wypełnione: "ten", "nastepny" albo "za_N". Klient mówiący „w przyszłym tygodniu w środę" pyta o dzień, który ma "tydzien": "nastepny" — wybierasz go z bloku, nie z kalendarza w głowie.
- Gdy klient chce PÓŹNIEJ niż ostatnia możliwa godzina, patrzysz na pole "przyjmowanie_na_noc". Przy "do_uzgodnienia" mówisz, że auto można zostawić do jutra, ale ustala to mechanik przy przyjęciu. Przy "tak" mówisz wprost, że da się zostawić. Przy "nie" nie wspominasz o tym w ogóle.
- Usługa z "tylko_od_otwarcia" zajmuje ponad pół dnia — proponujesz przy niej wyłącznie pierwszą godzinę.
- Nazwy usług bierzesz z bloku. Nie wymyślasz pakietów ani nazw zbiorczych.
- USŁUGĘ ROZPOZNAJESZ PO POLU "dopasowanie" — to lista słów, którymi klient o niej mówi w języku rozmowy. NIGDY jej nie wypowiadasz, służy wyłącznie do znalezienia właściwej pozycji cennika. Gdy klient pyta o cenę, najpierw szukasz usługi po "dopasowanie", a dopiero gdy nic nie pasuje, mówisz, że wyceni mechanik.
- NIE TWORZYSZ rezerwacji ani zlecenia — robi to system po rozmowie. Ty zbierasz dane i potwierdzasz je klientowi.

=== 4. CENA ===
- Cenę czytasz z pola "do_powiedzenia", znak w znak.
- Przy widełkach mówisz "orientacyjnie" i dodajesz, że dokładną cenę poda mechanik przy przyjęciu.
- Gdy usługi nie ma w cenniku — mówisz, KIEDY klient pozna cenę, i wracasz do terminu. Nie zgadujesz i nie stawiasz diagnozy przez telefon.

=== 5. JĘZYK ===
${greetingRule}
- Gdy rozmówca odezwie się po rosyjsku, ukraińsku lub angielsku — od następnego zdania piszesz w tym języku i tak zostaje. Zmiana języka polega na tym, że po prostu zaczynasz pisać w tym języku: nie zapowiadasz jej i nie pytasz o zgodę.
- Imię i numer rejestracyjny są łacinką w każdym języku. To nie jest zmiana języka rozmowy.
- ⛔ Nie wołasz narzędzia language_detection dla języka innego niż polski. Platforma odrzuca każdą inną wartość i tura przepada.

=== 6. ODWOŁANIE I PRZEŁOŻENIE ===
- Masz na to odpowiedź: przyjmujesz zgłoszenie i mówisz, że warsztat oddzwoni. Nie anulujesz sam i nie mówisz, że nie możesz pomóc.
- Nie pytasz o numer rezerwacji ani o datę starej wizyty. System znajdzie wizytę po numerze telefonu.

=== 7. GDY NIE WIESZ ===
- ⛔ Nigdy nie odsyłasz do telefonu. Klient właśnie dzwoni.
- Mówisz jednym zdaniem, czego nie wiesz i kto odpowie, i wracasz do rozmowy. Nie obiecujesz oddzwonienia poza odwołaniem wizyty.
- Najwyżej dwie odmowy pod rząd. Przy trzecim pytaniu mówisz to, co WIESZ.
- Gdy nie dosłyszysz — prosisz o powtórzenie TEGO, O CO PYTAŁEŚ, jednym zdaniem. Nie tłumaczysz, co już wiesz, i nie zgadujesz, czym była niezrozumiała odpowiedź. Wszystko, co klient potwierdził wcześniej, zostaje aktualne.
- Gdy klient Cię POPRAWIA — przyjmujesz poprawkę, potwierdzasz ją krótko i idziesz dalej. Nie przepraszasz i nie tłumaczysz, skąd wzięła się pomyłka.

=== 8. ZAKOŃCZENIE ===
- Podsumowujesz jednym zdaniem: DZIEŃ Z DATĄ I GODZINA. Nic więcej. Nie powtarzasz usługi, marki ani modelu — jeśli transkrypcja je przekręciła, klient poprawia przez trzy tury, a przy przyjęciu auta mechanik i tak wszystko ustala. Nie mówisz o przyjeździe wcześniej ani o dokumentach — to idzie SMS-em.
- Potem zadajesz jedno pytanie domykające i MILKNIESZ. Nie dopowiadasz pożegnania w tej samej turze.
- Dopiero gdy klient odpowie przecząco albo się pożegna — mówisz krótkie pożegnanie i W TEJ SAMEJ turze wołasz end_call.`;

    const convo: Phase1ConversationMessage[] = messages
      .filter((message): message is { role: "user" | "assistant"; content: string } =>
        (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
      // Okno 12 wiadomości gubiło początek rozmowy: po ~10 turach opis usterki
      // wypadał z kontekstu i agent pytał o niego drugi raz. Rozmowa telefoniczna
      // rzadko przekracza 40 wiadomości, a wejście i tak jest krótkie, bo to
      // pojedyncze zdania mówione.
      .slice(canary.enabled ? -40 : 0)
      .map((message) => ({ role: message.role, content: message.content }));
    while (convo.length && convo[0].role !== "user") convo.shift();
    if (convo.length === 0) convo.push({ role: "user", content: "[Rozpocznij rozmowę — przywitaj się zgodnie ze swoją rolą]" });

    // Narzędzia (tylko gdy są uprawnienia i znamy providera)
    const tools: Phase1ToolDefinition[] = [];

    // NARZĘDZIA KLIENTA (ElevenLabs): end_call, language_detection. Przychodzą
    // w formacie OpenAI i muszą trafić do modelu razem z naszymi, w JEDNEJ liście —
    // inaczej model nie ma czym zakończyć rozmowy i klient rozłącza się sam.
    //
    // Różnica wykonania: naszych narzędzi używamy sami (wołamy voice-agent-tools),
    // narzędzia klienta ODDAJEMY z powrotem do ElevenLabs jako tool_calls w SSE —
    // to on je wykonuje. Dlatego trzymamy ich nazwy osobno.
    // POŻEGNANIE MA BYĆ WYPOWIEDZIANE, NIE WPISANE W PARAMETR.
    //
    // Schemat end_call od ElevenLabs zawiera pole `system__message_to_speak`.
    // Model traktował je jako miejsce na pożegnanie i zwracał turę z pustym
    // tekstem — rozmowa 05.08 02:05:
    //   -> end_call {"system__message_to_speak":"Do widzenia, Panie Danielu."}
    //   <- end_call {"result_type":"end_call_success","message":null}
    // ElevenLabs tego nie wypowiedział, więc klient usłyszał rzuconą słuchawkę.
    //
    // Usuwamy to pole ze schematu podawanego modelowi. Nie mając gdzie schować
    // pożegnania, musi je powiedzieć — a mowa leci do TTS zanim ElevenLabs
    // wykona narzędzie. Samo narzędzie działa bez zmian: pole jest opcjonalne,
    // a `reason` zostaje nietknięty.
    const SPOKEN_PARAM = "system__message_to_speak";
    // POLA, KTORYCH MODEL NIE MA WYPELNIAC.
    //
    // `reason` w schemacie end_call to PROZA, ktora model musi ulozyc PO tekscie
    // pozegnania. Zmierzone trzy razy: 1082, 1236 i 1236 ms ogona miedzy
    // first_text a koncem model_round. To nie byl sufit platformy — to bylo pisanie
    // uzasadnienia, ktorego nikt nie czyta: ElevenLabs konczy rozmowe niezaleznie
    // od tresci tego pola.
    //
    // `language` w language_detection ZOSTAJE — bez niego narzedzie nie wie,
    // na co przelaczyc.
    const ZBEDNE_POLA = new Set([SPOKEN_PARAM, "reason"]);
    const stripSpokenParam = (schema: Record<string, unknown>): Record<string, unknown> => {
      const props = schema?.properties as Record<string, unknown> | undefined;
      if (!props) return schema;
      const rest = Object.fromEntries(Object.entries(props).filter(([k]) => !ZBEDNE_POLA.has(k)));
      if (Object.keys(rest).length === Object.keys(props).length) return schema;
      const required = Array.isArray(schema?.required)
        ? (schema.required as string[]).filter((r) => !ZBEDNE_POLA.has(r))
        : schema?.required;
      return { ...schema, properties: rest, ...(required !== undefined ? { required } : {}) };
    };

    const clientToolNames = new Set<string>();
    if (isServiceCall && Array.isArray(body?.client_tools)) {
      for (const raw of body.client_tools as Array<Record<string, unknown>>) {
        const fn = (raw?.function ?? raw) as Record<string, unknown>;
        const name = String(fn?.name || "");
        if (!name || clientToolNames.has(name)) continue;
        const parameters = (fn?.parameters as Record<string, unknown>) || { type: "object", properties: {} };
        tools.push({
          name,
          description: String(fn?.description || `Narzędzie systemowe ${name}`),
          input_schema: stripSpokenParam(parameters),
        });
        clientToolNames.add(name);
      }
      // SCHEMATY NARZĘDZI KLIENTA — logujemy NAZWY PÓL, nigdy wartości.
      //
      // Powód: ogon generowania wywołania `end_call` mierzymy trzeci raz
      // (1082 ms, potem 1236 ms). Jeśli model musi wypełnić pole tekstowe
      // w schemacie, ten ogon to jego pisanie — a wtedy da się go usunąć.
      // Jeśli schemat jest pusty, to sufit platformy i przestajemy szukać.
      console.info("[voice-agent-chat]", JSON.stringify({
        event: "client_tools_schema",
        narzedzia: (body.client_tools as Array<Record<string, unknown>>).map((raw) => {
          const fn = (raw?.function ?? raw) as Record<string, unknown>;
          const props = ((fn?.parameters as Record<string, unknown>)?.properties ?? {}) as Record<string, unknown>;
          return { nazwa: fn?.name, pola: Object.keys(props) };
        }),
      }));
    }
    // NARZĘDZIA ZAPISUJĄCE ZNIKNĘŁY (zasada nadrzędna: agent rozmawia i notuje).
    //
    // create_booking i create_order były tu do 06.08. Pomiary, które o tym przesądziły:
    //   tura bez narzędzi        795 ms
    //   tura z check_availability  4 900 ms
    //   tura z zapisem            7 100 - 10 752 ms   (create_booking = 53% tury)
    // Do tego każdy zapis w turze był podatny na duplikat żądania od ElevenLabs
    // i przerywał turę przed end_call.
    //
    // Zapis robi teraz voice-call-commit po rozłączeniu, w JEDNEJ transakcji,
    // z idempotencją po conversation_id. Agent o tym nie wie i nie musi.
    //
    // check_availability ZOSTAJE — jako wyjątek dla terminów spoza snapshotu.
    // Po FAZIE 1B (snapshot przy odebraniu) będzie wołany rzadko.
    if (providerId && calendarAccess) {
      tools.push({
        name: "check_availability",
        description: "Sprawdź wolne terminy w danym dniu. Użyj zanim zaproponujesz godzinę.",
        input_schema: { type: "object", properties: { date: { type: "string", description: "Data RRRR-MM-DD" }, duration_minutes: { type: "integer" } }, required: ["date"] },
      });
    }

    if (!canary.enabled) {
      const legacyConvo: Array<{ role: string; content: unknown }> = convo.map((message) => ({ ...message }));
      const callLegacyTool = async (name: string, input: Record<string, unknown>): Promise<ToolOutput> => {
        if (dryRunTools) return { ok: true, simulated: true, order_id: "sim", order_number: "SIM", booking_id: "sim" };
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/voice-agent-tools`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
            body: JSON.stringify({ action: name, provider_id: providerId, persona_key: personaKey, is_test: testMode, ...input }),
          });
          return await response.json() as ToolOutput;
        } catch (error) {
          return { ok: false, error: (error as Error).message };
        }
      };

      let legacyReply = "";
      const legacyCreated: { order_id: string | null; order_number: string | null; booking_id: string | null } = {
        order_id: null, order_number: null, booking_id: null,
      };
      for (let round = 0; round < 5; round++) {
        const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify({ model, max_tokens: 400, temperature: 0, system: system + systemVolatile, messages: legacyConvo, ...(tools.length ? { tools } : {}) }),
        });
        if (!aiResponse.ok) {
          const responseText = await aiResponse.text().catch(() => "");
          return json({ success: false, error: `Anthropic błąd ${aiResponse.status}: ${responseText.slice(0, 200)}` }, 400);
        }
        const aiData = await aiResponse.json() as { content?: LegacyContentBlock[]; stop_reason?: string };
        const blocks = aiData.content || [];
        const toolUses = blocks.filter((block) => block.type === "tool_use");
        if (aiData.stop_reason === "tool_use" && toolUses.length && tools.length) {
          legacyConvo.push({ role: "assistant", content: blocks });
          const results = [];
          for (const toolUse of toolUses) {
            const output = await callLegacyTool(toolUse.name || "", toolUse.input || {});
            if (toolUse.name === "create_order" && output.order_id) {
              legacyCreated.order_id = output.order_id;
              legacyCreated.order_number = output.order_number || null;
            }
            if (toolUse.name === "create_booking" && output.booking_id) legacyCreated.booking_id = output.booking_id;
            results.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(output) });
          }
          legacyConvo.push({ role: "user", content: results });
          continue;
        }
        legacyReply = blocks.filter((block) => block.type === "text").map((block) => block.text || "").join("\n").trim();
        break;
      }
      return json({ success: true, reply: legacyReply, model, created: legacyCreated });
    }

    const completedToolActions = new Map<string, ToolOutput>();
    const failedToolActions = new Map<string, number>();
    const toolResultCache = new Map<string, ToolOutput>();
    const callTool = async (name: string, inputRaw: Record<string, unknown>): Promise<ToolOutput> => {
      let input = inputRaw;
      if (canaryAbortSignal.aborted) {
        return { ok: false, error: "Połączenie zostało przerwane.", do_not_retry: true, cancelled: true };
      }
      // NUMER DZWONIĄCEGO WSTRZYKUJEMY PO STRONIE SERWERA.
      //
      // Po usunięciu pytania o telefon model musiał czymś wypełnić wymagane pole
      // i wpisał "+48" (rozmowa 05.08 21:57). Skutki: dedup nie trafił, create_order
      // zwrócił błąd, SMS nie wyszedł, a agent powiedział "Nie udało się bezpiecznie
      // dokończyć operacji" — po tym, jak wcześniej powiedział "gotowe".
      //
      // Numer z sygnalizacji SIP jest FAKTEM i ma pierwszeństwo nad wszystkim, co
      // model wpisze — chyba że klient świadomie podał inny (wtedy ma co najmniej
      // dziewięć cyfr i to jego zostawiamy).
      if (callerId && (name === "create_booking" || name === "create_order")) {
        const modelPhone = String((input as Record<string, unknown>)?.customer_phone || "");
        const modelDigits = modelPhone.replace(/\D/g, "");
        if (modelDigits.length < 9) {
          if (modelPhone) {
            console.warn("[voice-agent-chat]", JSON.stringify({
              event: "phone_from_model_rejected", tool: name, digits: modelDigits.length,
            }));
          }
          input = { ...input, customer_phone: callerId };
        }
      }
      const cacheKey = `${name}:${JSON.stringify(input || {})}`;
      if (toolResultCache.has(cacheKey)) return { ...toolResultCache.get(cacheKey), duplicate: true };
      const idempotentCreate = name === "create_booking" || name === "create_order";
      if (idempotentCreate && completedToolActions.has(name)) return { ...completedToolActions.get(name), duplicate: true };
      if ((failedToolActions.get(name) || 0) >= 1) {
        return { ok: false, error: "Operacja nie powiodła się. Nie ponawiaj jej w tej turze.", do_not_retry: true };
      }
      if (dryRunTools) return { ok: true, simulated: true, order_id: "sim", order_number: "SIM", booking_id: "sim" };
      try {
        const toolStarted = performance.now();
        const response = await fetch(`${supabaseUrl}/functions/v1/voice-agent-tools`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
          // conversation_id dokładany TYLKO w gałęzi canary i tylko gdy realnie przyszedł.
          // To on daje narzędziom klucz idempotencji i wiąże rozmowę ze zleceniem.
          body: JSON.stringify({
            action: name, provider_id: providerId, persona_key: personaKey, is_test: testMode,
            ...(conversationId ? { conversation_id: conversationId } : {}),
            ...input,
          }),
          signal: AbortSignal.any([canaryAbortSignal, AbortSignal.timeout(12_000)]),
        });
        const output = await response.json().catch(() => ({ ok: false, error: "Niepoprawna odpowiedź narzędzia" })) as ToolOutput;
        logTiming("tool", toolStarted, { tool: name, ok: !!output.ok });
        if (output.ok) toolResultCache.set(cacheKey, output);
        if (idempotentCreate && output.ok) completedToolActions.set(name, output);
        if (!output.ok) {
          failedToolActions.set(name, (failedToolActions.get(name) || 0) + 1);
          return { ...output, do_not_retry: true };
        }
        return output;
      } catch (error) {
        failedToolActions.set(name, (failedToolActions.get(name) || 0) + 1);
        return {
          ok: false,
          error: (error as Error).name === "TimeoutError" ? "Narzędzie przekroczyło limit czasu" : "Narzędzie chwilowo niedostępne",
          do_not_retry: true,
        };
      }
    };

    const execute = async (onText: (delta: string) => void) => {
      let reply = "";
      let emittedText = false;
      let firstTextLogged = false;
      const emit = (delta: string) => {
        if (!delta) return;
        if (!firstTextLogged) {
          firstTextLogged = true;
          logTiming("first_text", totalStarted);
        }
        reply += delta;
        emittedText = true;
        onText(delta);
      };
      const created: { order_id: string | null; order_number: string | null; booking_id: string | null } = {
        order_id: null, order_number: null, booking_id: null,
      };
      let toolRounds = 0;
      let truncated = false;
      // Wywołania narzędzi ElevenLabs oddawane z powrotem do niego zamiast wykonywane u nas.
      let clientToolCalls: Phase1ToolCall[] = [];
      for (let round = 0; round <= voiceRouting.maxToolRounds; round++) {
        if (round > 0 && emittedText && !/\s$/.test(reply)) emit(" ");
        const modelStarted = performance.now();
        // ROZDZIELENIE NASZEJ PRACY OD PRACY MODELU.
        //
        // `first_text` obejmuje wszystko od startu chat do pierwszego tokenu, więc
        // nie da się z niego odczytać, ile zajęło budowanie promptu, a ile sam model.
        // Benchmark z eu-central-1 dał surowy TTFT Haiku 625 ms przy prostym żądaniu;
        // w produkcji `first_text` ma medianę ~1,4 s. Ten znacznik mówi, gdzie leży
        // różnica: przed wywołaniem modelu czy w nim.
        if (round === 0) logTiming("prompt_ready", totalStarted, { system_chars: system.length, tools: tools.length });
        const attempted = await executePhase1Fallback(voiceRouting, async (candidate) => {
          if (canaryAbortSignal.aborted) {
            const aborted = new DOMException("client disconnected", "AbortError") as DOMException & { allowFallback?: boolean };
            aborted.allowFallback = false;
            throw aborted;
          }
          let candidateEmittedText = false;
          const request = buildPhase1AnthropicRequest(candidate, apiKey, system, convo, tools, voiceRouting.maxOutputTokens, systemVolatile);
          const modelTimeoutSignal = request.init.signal as AbortSignal;
          let modelResponse: Response;
          try {
            modelResponse = await fetch(request.url, {
              ...request.init,
              signal: AbortSignal.any([canaryAbortSignal, modelTimeoutSignal]),
            });
          } catch (requestError) {
            if (canaryAbortSignal.aborted) {
              (requestError as Error & { allowFallback?: boolean }).allowFallback = false;
            }
            throw requestError;
          }
          if (!modelResponse.ok) {
            const failure = classifyModelFailure(modelResponse.status);
            // TRESC BLEDU, NIE TYLKO STATUS.
            //
            // 16.08 caly przebieg angielski padl na 400, a log mowil wylacznie
            // „status: 400, failure: bad_request". Diagnoza wymagala reprodukcji
            // i zgadywania. Status mowi, ze zapytanie bylo zle; dopiero tresc
            // mowi, CO w nim bylo zle. Obcinamy do 300 znakow, zeby nie wlac
            // do logu calego promptu.
            const trescBledu = await modelResponse.clone().text().catch(() => "");
            if (BLAD_ROZLICZENIOWY.test(trescBledu)) {
              await zapiszAlertRozliczeniowy(admin, trescBledu, providerId || null);
            }
            console.warn("[voice-agent-chat]", JSON.stringify({
              event: "model_failed",
              status: modelResponse.status,
              failure,
              provider: candidate.providerKey,
              tresc: trescBledu.slice(0, 300),
            }));
            const upstreamError = new Error(`MODEL_${failure.toUpperCase()}`) as Error & { allowFallback?: boolean };
            // Jedna kontrolowana próba: druga próba tylko tam, gdzie inny model
            // realnie może odpowiedzieć. Bez nieskończonych ponowień.
            if (!MODEL_FAILURE_FALLBACK[failure]) upstreamError.allowFallback = false;
            lastModelFailure = failure;
            throw upstreamError;
          }
          try {
            return await consumePhase1AnthropicSse(modelResponse, (delta) => {
              candidateEmittedText = true;
              emit(delta);
            });
          } catch (streamError) {
            if (candidateEmittedText) {
              (streamError as Error & { allowFallback?: boolean }).allowFallback = false;
            }
            throw streamError;
          }
        });
        const streamed = attempted.value;
        logTiming("model_round", modelStarted, {
          round: round + 1,
          provider: attempted.candidate.providerKey,
          model: attempted.candidate.model,
          fallback_used: attempted.attempts > 1,
          // Weryfikacja prompt cachingu. cache_read > 0 = trafienie; cache_write > 0
          // = ta tura zapisała prefiks (pierwsza rozmowa po zmianie promptu).
          // Oba zera przy niepustym input = cache NIE działa i trzeba szukać, co
          // rozbija prefiks (np. coś zmiennego wcięło się przed blok stały).
          cache_read: streamed.usage?.cacheRead ?? null,
          cache_write: streamed.usage?.cacheWrite ?? null,
          input_tokens: streamed.usage?.input ?? null,
          output_tokens: streamed.usage?.output ?? null,
        });
        // Ucięcie na limicie tokenów nie jest poprawnym zakończeniem tury. Nie
        // wykonujemy narzędzi z niepełnej odpowiedzi, bo wywołanie mogło zostać
        // przerwane w środku i miałoby niekompletne argumenty. Zamiast urwać się
        // w połowie zdania oddajemy turę rozmówcy, żeby rozmowa nie zgasła na ciszy.
        if (streamed.stopReason === "max_tokens") {
          console.warn("[voice-agent-chat]", JSON.stringify({
            event: "output_truncated",
            round: round + 1,
            had_tool_calls: streamed.toolCalls.length > 0,
          }));
          truncated = true;
          if (emittedText && !/\s$/.test(reply)) emit(" ");
          emit(emittedText
            ? "Przepraszam, muszę się streścić. Czy mam mówić dalej?"
            : "Przepraszam, nie zdążyłem dokończyć. Czy mogę powtórzyć krócej?");
          break;
        }
        // Model poprosił o narzędzie ElevenLabs (np. end_call). Nie wykonujemy go —
        // oddajemy je w strumieniu jako tool_calls i kończymy turę. To ElevenLabs
        // rozłącza rozmowę, my tylko przekazujemy decyzję modelu.
        const requestedClientTools = streamed.toolCalls.filter((call) => clientToolNames.has(call.name));
        if (requestedClientTools.length) {
          clientToolCalls = requestedClientTools;
          console.info("[voice-agent-chat]", JSON.stringify({
            event: "client_tool_requested",
            tools: requestedClientTools.map((call) => call.name),
          }));
          break;
        }
        if ((streamed.stopReason === "tool_use" || streamed.stopReason === "tool_calls") && streamed.toolCalls.length && tools.length) {
          if (toolRounds >= voiceRouting.maxToolRounds) {
            emit("Nie udało się dokończyć operacji w bezpiecznym limicie. Obsługa zweryfikuje zapis.");
            break;
          }
          toolRounds++;
          // NIE wstrzykujemy tu żadnego wypełniacza.
          //
          // Stało tu `emit("Już sprawdzam. ")`. Przez pięć rozmów szukaliśmy tej frazy
          // w prompcie, w bazie wiedzy i w konfiguracji ElevenLabs — a wstrzykiwał ją
          // NASZ WŁASNY KOD, i to dokładnie łamiąc regułę, którą sam prompt narzuca.
          // Ciszę na czas narzędzia pokrywa soft_timeout ElevenLabs (4 s, "Dobrze rozumiem").
          convo.push({ role: "assistant_tools", content: streamed.text, calls: streamed.toolCalls });
          const results = [];
          let stopAfterToolError = false;
          for (const toolUse of streamed.toolCalls) {
            if (canaryAbortSignal.aborted) break;
            const toolInput = { ...(toolUse.input || {}) };
            if (toolUse.name === "create_order" && !toolInput.booking_id && created.booking_id) toolInput.booking_id = created.booking_id;
            const output = await callTool(toolUse.name, toolInput);
            if (output.do_not_retry) stopAfterToolError = true;
            if (toolUse.name === "create_order" && output.order_id) {
              created.order_id = output.order_id;
              created.order_number = output.order_number || null;
            }
            if (toolUse.name === "create_booking" && output.booking_id) created.booking_id = output.booking_id;
            if (created.order_id || created.booking_id) anyMutationCreated = true;
            results.push({ toolCallId: toolUse.id, content: JSON.stringify(output) });
            if (stopAfterToolError) break;
          }
          convo.push({ role: "tool_results", results });
          if (stopAfterToolError) {
            emit("Nie udało się bezpiecznie dokończyć operacji. Proszę nie ponawiać danych — obsługa zweryfikuje zapis.");
            break;
          }
          continue;
        }
        break;
      }
      // PUSTA ODPOWIEDŹ TO NIE JEST AWARIA — i nie wolno jej ogłaszać klientowi.
      //
      // Rozmowa kontrolna 11.08: przy przejściu między węzłami workflow ElevenLabs
      // model poprosił o `notify_condition_1_met`, ElevenLabs wysłał ZARAZ POTEM
      // drugie żądanie dla nowego węzła, a model — który przed chwilą powiedział
      // wszystko, co miał — zwrócił pustkę. Nasz kod ogłosił wtedy na głos
      // „Przepraszam, nie udało mi się dokończyć tej operacji", klient zapytał
      // „co spróbować?", a agent tłumaczył się przez dwie tury.
      //
      // Warunek `!clientToolCalls.length` nie chronił, bo narzędzie padło
      // w POPRZEDNIM żądaniu, nie w tym.
      //
      // Cisza jest bezpieczna: ElevenLabs po prostu oddaje turę rozmówcy.
      // Komunikat wypowiadamy WYŁĄCZNIE wtedy, gdy naprawdę doszło do awarii
      // modelu — o tym wie `lastModelFailure`.
      if (!reply.trim() && !clientToolCalls.length) {
        if (lastModelFailure) {
          emit(buildFailureSentence(lastModelFailure, anyMutationCreated, jezyk));
        } else {
          console.info("[voice-agent-chat]", JSON.stringify({
            event: "empty_reply_silent",
            powod: "model nie miał nic do dodania (typowo: przejście między węzłami workflow)",
          }));
        }
      }
      logTiming("total", totalStarted, {
        tool_actions: completedToolActions.size, streamed: responseStream, truncated,
        client_tools: clientToolCalls.length,
      });
      return { reply: reply.trim(), created, truncated, clientToolCalls };
    };

    if (responseStream) {
      const encoder = new TextEncoder();
      const id = "chatcmpl-" + crypto.randomUUID();
      const createdAt = Math.floor(Date.now() / 1000);
      const stream = new ReadableStream({
        start(controller) {
          const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          send({ id, object: "chat.completion.chunk", created: createdAt, model, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] });
          execute((delta) => send({
            id, object: "chat.completion.chunk", created: createdAt, model,
            choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
          })).then((result) => {
            // Po anulowaniu przez rozmówcę nic nie mówimy, ale strumień domykamy,
            // żeby nie zostawić wiszącego połączenia.
            if (canaryAbortSignal.aborted) {
              try { controller.close(); } catch { /* już zamknięty przez cancel() */ }
              return;
            }
            // Model poprosił o narzędzie ElevenLabs — oddajemy je w formacie OpenAI
            // i kończymy turę z finish_reason "tool_calls". Wykonaniem (np. rozłączeniem)
            // zajmuje się ElevenLabs, my tylko przekazujemy decyzję modelu.
            const pending = result?.clientToolCalls || [];
            if (pending.length) {
              send({
                id, object: "chat.completion.chunk", created: createdAt, model,
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: pending.map((call, index) => ({
                      index,
                      id: call.id,
                      type: "function",
                      function: { name: call.name, arguments: JSON.stringify(call.input || {}) },
                    })),
                  },
                  finish_reason: null,
                }],
              });
              send({ id, object: "chat.completion.chunk", created: createdAt, model, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }
            send({ id, object: "chat.completion.chunk", created: createdAt, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }).catch(async (error) => {
            if (canaryAbortSignal.aborted) {
              try { controller.close(); } catch { /* już zamknięty przez cancel() */ }
              return;
            }
            // AGENT NIE MOŻE PRZEPRASZAĆ ZA AWARIĘ, KTÓREJ NIE BYŁO.
            //
            // `anyMutationCreated` dotyczy TEGO żądania, a ElevenLabs wysyła na jedną
            // turę kilka żądań. Rozmowa 05.08 18:43: żądanie b0ebb3c6 utworzyło
            // rezerwację i zlecenie, a równoległe 092f17a2 dostało TimeoutError
            // i wypowiedziało "wystąpił chwilowy problem techniczny" — klient usłyszał
            // przeprosiny, choć rezerwacja, zlecenie i SMS były gotowe.
            //
            // Prawda jest na poziomie ROZMOWY, nie żądania: pytamy bazę, czy ta rozmowa
            // czegokolwiek już nie zapisała. Zapytanie jest w ścieżce awaryjnej, więc
            // nie dotyka czasu normalnej tury.
            let conversationCommitted = anyMutationCreated;
            if (!conversationCommitted && conversationId && providerId) {
              try {
                const { data: call } = await admin.from("voice_calls")
                  .select("linked_entity_id")
                  .eq("provider_id", providerId)
                  .eq("elevenlabs_conversation_id", conversationId)
                  .limit(1);
                conversationCommitted = !!call?.[0]?.linked_entity_id;
              } catch (_) { /* brak potwierdzenia = zostajemy przy stanie żądania */ }
            }
            console.error("[voice-agent-chat]", JSON.stringify({
              event: "stream_failed",
              error: (error as Error)?.name || "error",
              failure: lastModelFailure,
              mutation_created: anyMutationCreated,
              conversation_committed: conversationCommitted,
            }));
            send({
              id, object: "chat.completion.chunk", created: createdAt, model,
              choices: [{ index: 0, delta: { content: buildFailureSentence(lastModelFailure, conversationCommitted, jezyk) }, finish_reason: null }],
            });
            send({ id, object: "chat.completion.chunk", created: createdAt, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            // SMS dopiero PO wysłaniu tekstu, żeby nie opóźniać mowy, ale PRZED
            // zamknięciem strumienia — inaczej żądanie mogłoby się zakończyć,
            // zanim powiadomienie wyjdzie.
            if (CALLBACK_SMS_ENABLED) await notifyWorkshopCallback(null);
            controller.close();
          });
        },
        cancel() {
          responseAbort.abort("downstream cancelled");
        },
      });
      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          Connection: "keep-alive",
        },
      });
    }

    const result = await execute(() => {});
    return json({ success: true, reply: result.reply, model, created: result.created, truncated: result.truncated });
  } catch (e) {
    console.error("[voice-agent-chat] request_failed", (e as Error)?.name || "error");
    const error = e as Error;
    return json({
      success: false,
      error: requestWasCanary
        ? (error.name === "TimeoutError" ? "Model przekroczył limit czasu" : "Nie udało się przygotować odpowiedzi")
        : error.message,
    }, 500);
  }
});
