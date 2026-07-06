// ============================================================================
// voice-agent-chat — MÓZG agenta w trybie tekstowym (test rozmowy bez telefonu).
// Ten sam silnik, którego użyjemy w Etapie 1 jako custom-LLM dla rozmowy głosowej.
//
// Buduje pełny system prompt: persona (z ai_agents_config przez provider_agent_id)
// + kontekst firmy (business_context) + język + tryb testowy. Mózg = nasz Claude.
// Klucz ANTHROPIC z secure store (getSecret + cleanKey). Dostęp: zalogowany user.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/aiSecrets.ts";
import { resolveAgent } from "../_shared/translationProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const cleanKey = (k: string) => k.replace(/[^\x20-\x7E]/g, "");

const LANG_NAMES: Record<string, string> = { pl: "polskim", en: "angielskim", ua: "ukraińskim", ru: "rosyjskim" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("Brak konfiguracji Supabase");

    const authHeader = req.headers.get("Authorization");
    const isServiceCall = authHeader === `Bearer ${serviceRoleKey}`; // proxy telefonii woła service-role
    if (!isServiceCall) {
      if (!authHeader) return json({ success: false, error: "Brak autoryzacji" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return json({ success: false, error: "Brak autoryzacji" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    let apiKey = await getSecret(admin, "ANTHROPIC_API_KEY");
    if (!apiKey) return json({ success: false, error: "Brak klucza Anthropic (ANTHROPIC_API_KEY)" }, 400);
    apiKey = cleanKey(apiKey);

    const body = await req.json().catch(() => ({}));
    const personaKey = String(body?.persona_key || "");
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const bc = body?.business_context || {};
    const displayName = String(body?.display_name || "").trim();
    const langs: string[] = Array.isArray(body?.languages) && body.languages.length ? body.languages : ["pl"];
    const calendarAccess = !!body?.calendar_access;
    const ordersAccess = !!body?.orders_access;
    const providerId = String(body?.provider_id || "");
    const testMode = body?.test_mode !== false; // domyślnie test (chat); telefonia ustawi false
    const voiceGender = String(body?.voice_gender || "").toLowerCase();
    const dryRunTools = !!body?.dry_run_tools; // symulacja treningowa — narzędzia nie piszą do bazy

    // KONTEKST CZASU (Europa/Warszawa) — agent musi znać dziś/teraz, by liczyć "jutro"
    const now = new Date();
    const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(now);
    const humanDate = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
    const nowTime = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }).format(now);

    // Persona -> provider_agent_id -> prompt+model z ai_agents_config
    const { data: persona } = await admin
      .from("voice_agent_personas").select("provider_agent_id, name, direction").eq("persona_key", personaKey).maybeSingle();
    const agentId = persona?.provider_agent_id || "voice_workshop_secretary";
    const agent = await resolveAgent(admin, agentId, "claude-sonnet-4-6");
    // Rozmowa = jakość naturalności > koszt. Haiku brzmi sztucznie -> Sonnet.
    const CONVO_DEFAULT = "claude-sonnet-4-6";
    const model = (agent?.model && agent.model.startsWith("claude") && !agent.model.includes("haiku")) ? agent.model : CONVO_DEFAULT;
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
        knowledge.map((k: any) => `- [${k.category}] ${k.situation}: ${k.recommended_response}`).join("\n");
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
    system += `\n\n=== KONTEKST CZASU ===\nDziś jest ${humanDate} (${todayISO}), godzina ${nowTime} (Europa/Warszawa). Sam wyliczaj daty względne ("jutro", "pojutrze", "w piątek") i przekazuj je do narzędzi w formacie RRRR-MM-DD. NIGDY nie pytaj klienta o dzisiejszą datę.\n\n=== JĘZYK I POWITANIE ===\n- ZAWSZE witaj po POLSKU, BARDZO krótko: "Dzień dobry, ${firmName}, w czym mogę pomóc?". NIE wymieniaj usług w powitaniu, nie zadawaj kilku pytań naraz.\n- Jeśli rozmówca odezwie się w innym języku (rosyjski, ukraiński, angielski) — natychmiast PRZEŁĄCZ się na ten język i prowadź w nim całą rozmowę.\n\n=== STYL (jak człowiek przez telefon) ===\n- KRÓTKO: 1-2 zdania na turę, jedno pytanie na raz. Bez monologów i wyliczanek.\n- FORMA GRZECZNOŚCIOWA: ZAWSZE per "Pan/Pani", uprzejmie i profesjonalnie. NIGDY per "ty" i NIGDY potocznie. PRZYKŁADY: zamiast "jak się nazywasz?" → "Jak się Pan nazywa?"; zamiast "dobra" → "Dobrze" / "Oczywiście"; zamiast "pasuje ci jutro?" → "Czy pasuje Panu jutro o dziewiątej?". Dopóki nie znasz płci rozmówcy — używaj uprzejmej formy bezosobowej ("Czy ten termin będzie odpowiedni?"); gdy już wiesz (imię, wypowiedzi) — konsekwentnie Pan albo Pani.\n- Ton ciepły, naturalny, konkretny — jak miły recepcjonista, który mówi wprost.\n\n=== PYTANIA KLIENTA W TRAKCIE UMAWIANIA ===\n- Jeśli klient zada pytanie — NAJPIERW odpowiedz na pytanie, dopiero potem wróć do rezerwacji.\n- NIGDY nie powtarzaj tej samej propozycji terminu dwa razy pod rząd. Jeśli klient nie odpowiedział wprost na propozycję — ma wątpliwość: zaadresuj ją lub zaproponuj inny termin.\n- Jeśli nie znasz odpowiedzi (np. czas naprawy przed diagnozą, dokładna cena) — powiedz to WPROST ("to będzie wiadomo po diagnozie na miejscu"), nie ignoruj pytania i nie zmyślaj.\n\n=== WYMOWA — KLUCZOWE (tekst CZYTANY NA GŁOS po polsku) ===\nLiczby, godziny, daty, ceny zapisuj SŁOWAMI po polsku, NIGDY cyframi/symbolami: "dziewiąta rano", "wpół do dziesiątej" (nie "9:00"); "w czwartek", "piętnastego maja" (nie "15.05"); "sto pięćdziesiąt złotych" (nie "150 zł"). Pełne, dokończone zdania.\n\n=== WYWIAD I NARZĘDZIA ===\nKOLEJNOŚĆ ROZMOWY (trzymaj się jej): (1) NAJPIERW dopytaj o problem/potrzebę — opis usterki, co sprawdzić; (2) POTEM ustal preferowany termin i zaproponuj wolny; (3) DOPIERO gdy termin zaakceptowany — poproś o dane: imię i nazwisko, numer telefonu, numer rejestracyjny (jeśli nie zna — marka, model, rok). NIE proś o dane osobowe w środku opisu usterki. Gdy masz komplet:\n- użyj narzędzia check_availability, by sprawdzić wolny termin (jeśli masz uprawnienia),\n- użyj create_booking, by umówić wizytę,\n- następnie create_order, by utworzyć zlecenie z usterką i danymi pojazdu.\nW create_order pole "complaint" przekaż jako LISTĘ PUNKTÓW — każda usterka/zadanie w nowej linii zaczynając od myślnika, np.:\n- stuki w zawieszeniu z przodu\n- sprawdzić zawieszenie i łożyska\nUtwórz zlecenie i rezerwację TYLKO RAZ w całej rozmowie (nie powtarzaj wywołań). Krótko informuj co robisz (np. "już sprawdzam wolne terminy"). Po umówieniu potwierdź termin i dane słownie. Nigdy nie zmyślaj dostępności — zawsze użyj narzędzia.`;

    const convo: any[] = messages
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content }));
    while (convo.length && convo[0].role !== "user") convo.shift();
    if (convo.length === 0) convo.push({ role: "user", content: "[Rozpocznij rozmowę — przywitaj się zgodnie ze swoją rolą]" });

    // Narzędzia (tylko gdy są uprawnienia i znamy providera)
    const tools: any[] = [];
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

    const callTool = async (name: string, input: any) => {
      if (dryRunTools) return { ok: true, simulated: true, order_id: "sim", order_number: "SIM", booking_id: "sim" };
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/voice-agent-tools`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
          body: JSON.stringify({ action: name, provider_id: providerId, persona_key: personaKey, is_test: testMode, ...input }),
        });
        return await r.json();
      } catch (e) { return { ok: false, error: (e as Error).message }; }
    };

    let reply = "";
    const created: { order_id: string | null; order_number: string | null; booking_id: string | null } = { order_id: null, order_number: null, booking_id: null };
    for (let round = 0; round < 5; round++) {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 600, temperature: 0.7, system, messages: convo, ...(tools.length ? { tools } : {}) }),
      });
      if (!aiRes.ok) {
        const t = await aiRes.text().catch(() => "");
        return json({ success: false, error: `Anthropic błąd ${aiRes.status}: ${t.slice(0, 200)}` }, 400);
      }
      const aiData = await aiRes.json();
      const blocks = aiData?.content || [];
      const toolUses = blocks.filter((b: any) => b.type === "tool_use");
      if (aiData?.stop_reason === "tool_use" && toolUses.length && tools.length) {
        convo.push({ role: "assistant", content: blocks });
        const results = [];
        for (const tu of toolUses) {
          const out = await callTool(tu.name, tu.input || {});
          if (tu.name === "create_order" && out?.order_id) { created.order_id = out.order_id; created.order_number = out.order_number || null; }
          if (tu.name === "create_booking" && out?.booking_id) { created.booking_id = out.booking_id; }
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
        }
        convo.push({ role: "user", content: results });
        continue;
      }
      reply = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      break;
    }
    return json({ success: true, reply, model, created });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
