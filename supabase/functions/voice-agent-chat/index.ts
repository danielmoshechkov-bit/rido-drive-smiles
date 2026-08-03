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
  type Phase1ToolDefinition,
} from "../_shared/voicePhase1ModelAdapter.ts";
import { resolveVoiceProductionCanary } from "../_shared/voiceProductionCanary.ts";

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

// Komunikat awaryjny czytany na głos. Dwie zasady: nie zdradzamy szczegółów
// technicznych rozmówcy i NIGDY nie sugerujemy, że rezerwacja powstała, ani że
// nic nie powstało, jeśli faktycznie coś zapisaliśmy.
const buildFailureSentence = (failure: ModelFailure | null, mutationCreated: boolean): string => {
  if (mutationCreated) {
    return "Przepraszam, straciłam wątek na końcu, ale zapis jest już w systemie. Obsługa potwierdzi szczegóły.";
  }
  if (failure === "quota") {
    return "Przepraszam, mam w tej chwili chwilowe ograniczenie techniczne. Nic nie zostało jeszcze zapisane — proszę zadzwonić za kilka minut.";
  }
  return "Przepraszam, wystąpił chwilowy problem techniczny. Nic nie zostało jeszcze zapisane — proszę spróbować ponownie.";
};

const logTiming = (stage: string, startedAt: number, extra: Record<string, unknown> = {}) => {
  console.info("[voice-agent-chat]", JSON.stringify({
    event: "stage_timing", stage,
    duration_ms: Math.round(performance.now() - startedAt),
    ...extra,
  }));
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

    // KONTEKST CZASU (Europa/Warszawa) — agent musi znać dziś/teraz, by liczyć "jutro"
    const now = new Date();
    const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(now);
    const humanDate = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
    const nowTime = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }).format(now);

    // Persona -> provider_agent_id -> prompt+model z ai_agents_config
    const { data: persona } = await admin
      .from("voice_agent_personas").select("provider_agent_id, name, direction").eq("persona_key", personaKey).maybeSingle();
    const agentId = persona?.provider_agent_id || "voice_workshop_secretary";
    const agent = await resolvePhase1Agent(admin, agentId, "claude-sonnet-4-6");
    // Rozmowa = jakość naturalności > koszt. Haiku brzmi sztucznie -> Sonnet.
    const CONVO_DEFAULT = "claude-sonnet-4-6";
    const model = (agent?.model && agent.model.startsWith("claude") && !agent.model.includes("haiku")) ? agent.model : CONVO_DEFAULT;
    const legacyRouting: Phase1VoiceRouting = {
      primary: {
        providerKey: "claude_sonnet", providerName: "Anthropic (legacy)", model,
        timeoutMs: 30_000, adapterKey: "anthropic_messages", secretKey: "ANTHROPIC_API_KEY",
        endpoint: "https://api.anthropic.com/v1/messages",
      },
      fallback: null, allowFallback: false, maxToolRounds: 5, maxOutputTokens: 600,
    };
    const phase1CanaryRouting: Phase1VoiceRouting = {
      primary: { ...legacyRouting.primary, providerName: "Anthropic (Phase 1 primary)", timeoutMs: 8_000 },
      fallback: {
        providerKey: "claude_haiku", providerName: "Anthropic (Phase 1 fallback)",
        model: "claude-haiku-4-5-20251001", timeoutMs: 8_000,
        adapterKey: "anthropic_messages", secretKey: "ANTHROPIC_API_KEY",
        endpoint: "https://api.anthropic.com/v1/messages",
      },
      // 600 tokenów jak w legacy. Przy 400 pojedyncza tura z zapowiedzią, wynikiem
      // narzędzia i propozycją terminu urywała się w połowie zdania.
      allowFallback: true, maxToolRounds: 3, maxOutputTokens: 600,
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
    system += `\n\nMówisz w języku rozmówcy spośród: ${langStr}. Wykryj język klienta i dostosuj się.`;
    const caps: string[] = [];
    if (calendarAccess) caps.push("możesz sprawdzać wolne terminy i umawiać wizyty");
    if (ordersAccess) caps.push("możesz utworzyć zlecenie z danymi z rozmowy");
    if (caps.length) system += `\nUprawnienia: ${caps.join("; ")}.`;

    // WIEDZA Z POPRZEDNICH ROZMÓW (warstwa uczenia) — globalna persony + tego providera
    let kq = admin.from("voice_agent_knowledge").select("category, situation, recommended_response")
      .eq("persona_key", personaKey).eq("is_active", true);
    kq = providerId ? kq.or(`provider_id.eq.${providerId},provider_id.is.null`) : kq.is("provider_id", null);
    const { data: knowledge } = await kq.order("evidence_count", { ascending: false }).limit(10);
    if (knowledge?.length) {
      system += `\n\n=== WIEDZA Z POPRZEDNICH ROZMÓW (stosuj; nie powtarzaj wcześniejszych błędów) ===\n` +
        (knowledge as KnowledgeEntry[]).map((entry) => `- [${entry.category}] ${entry.situation}: ${entry.recommended_response}`).join("\n");
    }

    // Rodzaj gramatyczny dopasowany do płci głosu
    const genderClause = voiceGender === "male"
      ? `Twój głos jest MĘSKI — mów O SOBIE w rodzaju męskim (np. "mógłbym", "zapisałem", "już sprawdzam").`
      : voiceGender === "female"
      ? `Twój głos jest ŻEŃSKI — mów O SOBIE w rodzaju żeńskim (np. "mogłabym", "zapisałam", "już sprawdzam").`
      : `Dostosuj rodzaj gramatyczny wypowiedzi o sobie do swojego głosu.`;
    system += `\n\n=== RODZAJ GRAMATYCZNY ===\n${genderClause}`;

    // Usługi — bez sztywnej odmowy (np. laweta zależy od danych firmy)
    system += `\n\n=== USŁUGI ===\nOpieraj się na danych firmy. NIE odmawiaj usług na sztywno (np. lawety / pomocy drogowej / dojazdu) — jeśli firma to oferuje (jest w danych), zaproponuj. Jeśli czegoś nie ma w danych, nie zmyślaj, ale też nie zaprzeczaj kategorycznie — powiedz, że dopytasz lub sprawdzisz u obsługi.`;
    const firmName = bc.company_name ? String(bc.company_name) : "warsztat";
    // W telefonii rozmówca słyszy powitanie z systemu (pierwsza wiadomość agenta
    // ElevenLabs), ale nie trafia ono do kontekstu modelu — poniższa pętla
    // budująca `convo` usuwa wiodące wiadomości asystenta, bo Anthropic wymaga,
    // by rozmowa zaczynała się od użytkownika. Model nie wie więc, że powitanie
    // już padło, i wita się drugi raz. W panelu testowym powitania z systemu nie
    // ma, więc tam agent wita się normalnie.
    const greetingRule = testMode
      ? `- ZAWSZE witaj po POLSKU, BARDZO krótko: "Dzień dobry, ${firmName}, w czym mogę pomóc?". NIE wymieniaj usług w powitaniu, nie zadawaj kilku pytań naraz.`
      : `- Rozmówca usłyszał już powitanie z systemu telefonicznego. NIE witaj się drugi raz i NIE przedstawiaj firmy ponownie — od razu odpowiedz na to, co powiedział.`;
    system += `\n\n=== KONTEKST CZASU ===\nDziś jest ${humanDate} (${todayISO}), godzina ${nowTime} (Europa/Warszawa). Sam wyliczaj daty względne ("jutro", "pojutrze", "w piątek") i przekazuj je do narzędzi w formacie RRRR-MM-DD. NIGDY nie pytaj klienta o dzisiejszą datę.\n\n=== JĘZYK I POWITANIE ===\n${greetingRule}\n- Jeśli rozmówca odezwie się w innym języku (rosyjski, ukraiński, angielski) — natychmiast PRZEŁĄCZ się na ten język i prowadź w nim całą rozmowę.\n\n=== STYL (jak człowiek przez telefon) ===\n- KRÓTKO: 1-2 zdania na turę, jedno pytanie na raz. Bez monologów i wyliczanek.\n- FORMA GRZECZNOŚCIOWA: ZAWSZE per "Pan/Pani", uprzejmie i profesjonalnie. NIGDY per "ty" i NIGDY potocznie. PRZYKŁADY: zamiast "jak się nazywasz?" → "Jak się Pan nazywa?"; zamiast "dobra" → "Dobrze" / "Oczywiście"; zamiast "pasuje ci jutro?" → "Czy pasuje Panu jutro o dziewiątej?". Dopóki nie znasz płci rozmówcy — używaj uprzejmej formy bezosobowej ("Czy ten termin będzie odpowiedni?"); gdy już wiesz (imię, wypowiedzi) — konsekwentnie Pan albo Pani. Dotyczy też PODSUMOWANIA: NIGDY samym imieniem ("Daniel, podsumowuję") — albo "Panie Danielu, podsumowuję...", albo bezosobowo "Podsumowuję: ...". Jedna forma od pierwszego do ostatniego zdania rozmowy.\n- Ton ciepły, naturalny, konkretny — jak miły recepcjonista, który mówi wprost.\n\n=== PYTANIA KLIENTA W TRAKCIE UMAWIANIA ===\n- Jeśli klient zada pytanie — NAJPIERW odpowiedz na pytanie, dopiero potem wróć do rezerwacji.\n- NIGDY nie powtarzaj tej samej propozycji terminu dwa razy pod rząd. Jeśli klient nie odpowiedział wprost na propozycję — ma wątpliwość: zaadresuj ją lub zaproponuj inny termin.\n- Jeśli nie znasz odpowiedzi (np. czas naprawy przed diagnozą, dokładna cena) — powiedz to WPROST ("to będzie wiadomo po diagnozie na miejscu"), nie ignoruj pytania i nie zmyślaj.\n- Gdy termin jest już potwierdzony — NIE pytaj ponownie o zgodę ("Czy mogę sfinalizować rezerwację?") i nie powtarzaj potwierdzeń już ustalonych faktów. Po odpowiedzi na pytania klienta domknij naturalnie: "W takim razie do zobaczenia jutro o dziewiątej" albo "Czy mogę jeszcze w czymś pomóc?".\n\n=== WYMOWA — KLUCZOWE (tekst CZYTANY NA GŁOS po polsku) ===\nLiczby, godziny, daty, ceny zapisuj SŁOWAMI po polsku, NIGDY cyframi/symbolami: "dziewiąta rano", "wpół do dziesiątej" (nie "9:00"); "w czwartek", "piętnastego maja" (nie "15.05"); "sto pięćdziesiąt złotych" (nie "150 zł"). Pełne, dokończone zdania.\n\n=== WYWIAD I NARZĘDZIA ===\nKOLEJNOŚĆ ROZMOWY (trzymaj się jej): (1) NAJPIERW dopytaj o problem/potrzebę — opis usterki, co sprawdzić; (2) POTEM ustal preferowany termin i zaproponuj wolny; (3) DOPIERO gdy termin zaakceptowany — poproś o dane: imię i nazwisko, numer telefonu, numer rejestracyjny (jeśli nie zna — marka, model, rok). NIE proś o dane osobowe w środku opisu usterki. Gdy masz komplet:\n- użyj narzędzia check_availability, by sprawdzić wolny termin (jeśli masz uprawnienia),\n- użyj create_booking, by umówić wizytę,\n- następnie create_order, by utworzyć zlecenie z usterką i danymi pojazdu.\nW create_order pole "complaint" przekaż jako LISTĘ PUNKTÓW — każda usterka/zadanie w nowej linii zaczynając od myślnika, np.:\n- stuki w zawieszeniu z przodu\n- sprawdzić zawieszenie i łożyska\nUtwórz zlecenie i rezerwację TYLKO RAZ w całej rozmowie (nie powtarzaj wywołań). Krótko informuj co robisz (np. "już sprawdzam wolne terminy"). Po umówieniu potwierdź termin i dane słownie. Nigdy nie zmyślaj dostępności — zawsze użyj narzędzia. NIGDY nie mów, ile jest wolnych terminów, ani że "mamy dużo wolnych miejsc" (to sugeruje klientowi pusty kalendarz) — po sprawdzeniu od razu zaproponuj konkretną godzinę, a ogólnie mów co najwyżej "Tak, znajdziemy termin".`;

    const convo: Phase1ConversationMessage[] = messages
      .filter((message): message is { role: "user" | "assistant"; content: string } =>
        (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
      .slice(canary.enabled ? -12 : 0)
      .map((message) => ({ role: message.role, content: message.content }));
    while (convo.length && convo[0].role !== "user") convo.shift();
    if (convo.length === 0) convo.push({ role: "user", content: "[Rozpocznij rozmowę — przywitaj się zgodnie ze swoją rolą]" });

    // Narzędzia (tylko gdy są uprawnienia i znamy providera)
    const tools: Phase1ToolDefinition[] = [];
    if (providerId && calendarAccess) {
      tools.push({
        name: "check_availability",
        description: "Sprawdź wolne terminy w danym dniu. Użyj zanim zaproponujesz godzinę.",
        input_schema: { type: "object", properties: { date: { type: "string", description: "Data RRRR-MM-DD" }, duration_minutes: { type: "integer" } }, required: ["date"] },
      });
      tools.push({
        name: "create_booking",
        description: "Umów wizytę (rezerwacja w kalendarzu). Wywołaj gdy masz: imię i nazwisko, telefon, datę i godzinę.",
        input_schema: { type: "object", properties: {
          customer_name: { type: "string" }, customer_phone: { type: "string" },
          scheduled_date: { type: "string", description: "RRRR-MM-DD" }, scheduled_time: { type: "string", description: "GG:MM" },
          duration_minutes: { type: "integer" }, service_name: { type: "string" }, notes: { type: "string", description: "Krótki opis usterki / czego dotyczy wizyta (trafia do rezerwacji, widoczny w panelu)" },
          vehicle: { type: "object", properties: { brand: { type: "string" }, model: { type: "string" }, year: { type: "integer" }, plate: { type: "string" } } },
        }, required: ["customer_name", "customer_phone", "scheduled_date", "scheduled_time"] },
      });
    }
    if (providerId && ordersAccess) {
      tools.push({
        name: "create_order",
        description: "Utwórz zlecenie warsztatowe z danymi z rozmowy. Wywołaj po umówieniu wizyty (jeśli masz booking_id z create_booking — podaj go).",
        input_schema: { type: "object", properties: {
          customer_name: { type: "string" }, customer_phone: { type: "string" }, complaint: { type: "string", description: "Lista usterek/zadań do wykonania — KAŻDA w nowej linii od myślnika '- ' (np. '- stuki w zawieszeniu z przodu\\n- sprawdzić łożyska')" },
          scheduled_date: { type: "string" }, scheduled_time: { type: "string" }, duration_minutes: { type: "integer" },
          vehicle: { type: "object", properties: { brand: { type: "string" }, model: { type: "string" }, year: { type: "integer" }, plate: { type: "string" } } },
          booking_id: { type: "string" },
        }, required: ["customer_name", "customer_phone", "complaint"] },
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
          body: JSON.stringify({ model, max_tokens: 600, temperature: 0.7, system, messages: legacyConvo, ...(tools.length ? { tools } : {}) }),
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
    const callTool = async (name: string, input: Record<string, unknown>): Promise<ToolOutput> => {
      if (canaryAbortSignal.aborted) {
        return { ok: false, error: "Połączenie zostało przerwane.", do_not_retry: true, cancelled: true };
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
          body: JSON.stringify({ action: name, provider_id: providerId, persona_key: personaKey, is_test: testMode, ...input }),
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
      for (let round = 0; round <= voiceRouting.maxToolRounds; round++) {
        if (round > 0 && emittedText && !/\s$/.test(reply)) emit(" ");
        const modelStarted = performance.now();
        const attempted = await executePhase1Fallback(voiceRouting, async (candidate) => {
          if (canaryAbortSignal.aborted) {
            const aborted = new DOMException("client disconnected", "AbortError") as DOMException & { allowFallback?: boolean };
            aborted.allowFallback = false;
            throw aborted;
          }
          let candidateEmittedText = false;
          const request = buildPhase1AnthropicRequest(candidate, apiKey, system, convo, tools, voiceRouting.maxOutputTokens);
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
            console.warn("[voice-agent-chat]", JSON.stringify({
              event: "model_failed",
              status: modelResponse.status,
              failure,
              provider: candidate.providerKey,
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
        if ((streamed.stopReason === "tool_use" || streamed.stopReason === "tool_calls") && streamed.toolCalls.length && tools.length) {
          if (toolRounds >= voiceRouting.maxToolRounds) {
            emit("Nie udało się dokończyć operacji w bezpiecznym limicie. Obsługa zweryfikuje zapis.");
            break;
          }
          toolRounds++;
          if (!emittedText) emit("Już sprawdzam. ");
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
      if (!reply.trim()) emit("Przepraszam, nie udało mi się dokończyć tej operacji. Proszę spróbować ponownie za chwilę.");
      logTiming("total", totalStarted, { tool_actions: completedToolActions.size, streamed: responseStream, truncated });
      return { reply: reply.trim(), created, truncated };
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
          })).then(() => {
            if (canaryAbortSignal.aborted) return;
            send({ id, object: "chat.completion.chunk", created: createdAt, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }).catch((error) => {
            if (canaryAbortSignal.aborted) return;
            console.error("[voice-agent-chat]", JSON.stringify({
              event: "stream_failed",
              error: (error as Error)?.name || "error",
              failure: lastModelFailure,
              mutation_created: anyMutationCreated,
            }));
            send({
              id, object: "chat.completion.chunk", created: createdAt, model,
              choices: [{ index: 0, delta: { content: buildFailureSentence(lastModelFailure, anyMutationCreated) }, finish_reason: null }],
            });
            send({ id, object: "chat.completion.chunk", created: createdAt, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
