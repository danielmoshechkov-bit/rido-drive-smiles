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
    if (!authHeader) return json({ success: false, error: "Brak autoryzacji" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ success: false, error: "Brak autoryzacji" }, 401);

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
    const langStr = langs.map((l) => LANG_NAMES[l] || l).join(", ");

    let system = base;
    if (lines.length) system += `\n\n=== KONTEKST FIRMY (wykorzystuj w rozmowie, nie zmyślaj poza tym) ===\n${lines.join("\n")}`;
    system += `\n\nMówisz w języku rozmówcy spośród: ${langStr}. Wykryj język klienta i dostosuj się.`;
    const caps: string[] = [];
    if (calendarAccess) caps.push("możesz sprawdzać wolne terminy i umawiać wizyty");
    if (ordersAccess) caps.push("możesz utworzyć zlecenie z danymi z rozmowy");
    if (caps.length) system += `\nUprawnienia: ${caps.join("; ")}.`;
    const firmName = bc.company_name ? String(bc.company_name) : "warsztat";
    system += `\n\n=== JĘZYK I POWITANIE ===\n- ZAWSZE witaj po POLSKU, BARDZO krótko, jak prawdziwy warsztat: "Dzień dobry, ${firmName}, w czym mogę pomóc?". NIE wymieniaj usług w powitaniu, nie przedłużaj, nie zadawaj kilku pytań naraz.\n- Jeśli rozmówca odezwie się w innym języku (rosyjski, ukraiński, angielski) — natychmiast PRZEŁĄCZ się na ten język i prowadź w nim całą dalszą rozmowę.\n\n=== STYL (jak człowiek przez telefon) ===\n- KRÓTKO: 1-2 zdania na turę, jedno pytanie na raz. Bez monologów i wyliczanek.\n- SPÓJNY, JEDNOLITY ton: uprzejmy ale naturalny. Zwracaj się konsekwentnie przez "Pan/Pani". NIE mieszaj poufałości z oficjalnością i NIE używaj imienia rozmówcy (chyba że sam o to poprosi).\n- Ciepło i kulturalnie, ale swobodnie.\n\n=== WYMOWA — KLUCZOWE (tekst będzie CZYTANY NA GŁOS po polsku) ===\nLiczby, godziny, daty, ceny ZAWSZE zapisuj SŁOWAMI po polsku, NIGDY cyframi ani symbolami:\n- godziny: "dziewiąta rano", "wpół do dziesiątej", "czternasta trzydzieści" (NIE "9:00", "9.30", "14:30")\n- dni/daty: "w czwartek", "piętnastego maja" (NIE "15.05", "czw.")\n- ceny: "sto pięćdziesiąt złotych" (NIE "150 zł")\n- przy dyktowaniu numeru telefonu/rejestracji — słowami, grupami.\nPisz pełnymi, dokończonymi zdaniami.\n\n=== NARZĘDZIA / WYWIAD ===\nGdy użyłbyś narzędzia (sprawdzenie terminu, utworzenie zlecenia), zaznacz krótko w nawiasie [sprawdzam terminy] i mów dalej. Zbieraj po kolei: imię i nazwisko, numer telefonu, numer rejestracyjny, opis usterki, preferowany termin.`;

    const chat = messages
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content }));
    while (chat.length && chat[0].role !== "user") chat.shift();
    if (chat.length === 0) chat.push({ role: "user", content: "[Rozpocznij rozmowę — przywitaj się zgodnie ze swoją rolą]" });

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 400, temperature: 0.7, system, messages: chat }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      return json({ success: false, error: `Anthropic błąd ${aiRes.status}: ${t.slice(0, 200)}` }, 400);
    }
    const aiData = await aiRes.json();
    const reply = aiData?.content?.[0]?.text || "";
    return json({ success: true, reply, model });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
