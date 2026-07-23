// ============================================================================
// voiceAgentContext — WSPÓLNE budowanie kontekstu agenta głosowego (system+tools+model).
// Jedno źródło prawdy dla voice-agent-chat (mózg) i voice-agent-llm (streaming do EL).
// Usuwa hop mode:"prepare" — voice-agent-llm buduje kontekst w procesie (mniej latencji = mniej
// płaconych sekund EL). Model przełączalny z panelu przez ai_agents_config (domyślnie Haiku).
// ============================================================================
import { resolveAgent } from "./translationProvider.ts";

const LANG_NAMES: Record<string, string> = { pl: "polskim", en: "angielskim", ru: "rosyjskim", ua: "ukraińskim", kz: "kazachskim", de: "niemieckim", vi: "wietnamskim" };

export interface VoiceContextParams {
  personaKey: string;
  businessContext?: any;
  displayName?: string;
  languages?: string[];
  calendarAccess?: boolean;
  ordersAccess?: boolean;
  providerId?: string;
  voiceGender?: string;
  customPromptOverride?: string;
}

export interface VoiceContext { system: string; tools: any[]; model: string; }

/** Domyślny model rozmowy — TANI/SZYBKI (Haiku). Analiza/uczenie używa mocnego modelu osobno. */
export const VOICE_MODEL_DEFAULT = "claude-haiku-4-5";

export async function buildVoiceContext(admin: any, p: VoiceContextParams): Promise<VoiceContext> {
  const bc = p.businessContext || {};
  const displayName = String(p.displayName || "").trim();
  const langs = Array.isArray(p.languages) && p.languages.length ? p.languages : ["pl"];
  const calendarAccess = !!p.calendarAccess;
  const ordersAccess = !!p.ordersAccess;
  const providerId = String(p.providerId || "");
  const voiceGender = String(p.voiceGender || "").toLowerCase();

  // Czas (Europa/Warszawa) — agent liczy "jutro" sam.
  const now = new Date();
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(now);
  const humanDate = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const nowTime = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }).format(now);

  // Persona -> model+prompt z ai_agents_config. Model: cokolwiek ustawi panel (w tym Sonnet); default Haiku.
  const { data: persona } = await admin
    .from("voice_agent_personas").select("provider_agent_id, name, direction").eq("persona_key", p.personaKey).maybeSingle();
  const agentId = persona?.provider_agent_id || "voice_workshop_secretary";
  const agent = await resolveAgent(admin, agentId, VOICE_MODEL_DEFAULT);
  const model = (agent?.model && String(agent.model).startsWith("claude")) ? agent.model : VOICE_MODEL_DEFAULT;
  const base = p.customPromptOverride?.trim() || agent?.systemPrompt ||
    "Jesteś profesjonalnym asystentem głosowym warsztatu. Rozmawiaj naturalnie, krótko, umów wizytę i utwórz zlecenie.";

  const firmName = bc.company_name ? String(bc.company_name) : "warsztat";
  const lines: string[] = [];
  if (bc.company_name) lines.push(`Firma: ${bc.company_name}`);
  if (displayName) lines.push(`Przedstawiasz się jako: ${displayName}`);
  if (bc.description) lines.push(`Czym się zajmuje: ${bc.description}`);
  if (bc.hours) lines.push(`Godziny pracy: ${bc.hours}`);
  if (bc.location) lines.push(`Lokalizacja: ${bc.location}`);
  if (bc.services) lines.push(`Usługi:\n${bc.services}`);
  if (bc.purpose) lines.push(`Cel rozmów: ${bc.purpose}`);
  if (bc.extra_info) lines.push(`Dodatkowe informacje: ${bc.extra_info}`);
  if (bc.roadside) lines.push(`Pomoc drogowa / laweta: ${bc.roadside}`);
  const langStr = langs.map((l) => LANG_NAMES[l] || l).join(", ");

  const genderClause = voiceGender === "male"
    ? `Twój głos jest MĘSKI — mów o sobie w rodzaju męskim ("zapisałem", "sprawdzam").`
    : voiceGender === "female"
    ? `Twój głos jest ŻEŃSKI — mów o sobie w rodzaju żeńskim ("zapisałam", "sprawdzam").`
    : `Dopasuj rodzaj gramatyczny o sobie do swojego głosu.`;

  let system = base;
  if (lines.length) system += `\n\n=== DANE FIRMY (używaj, nie zmyślaj poza tym) ===\n${lines.join("\n")}`;
  system += `\n\nJęzyk: mów w języku rozmówcy spośród: ${langStr}. Wykryj i dostosuj się.`;
  const caps: string[] = [];
  if (calendarAccess) caps.push("umawianie wizyt (check_availability, create_booking)");
  if (ordersAccess) caps.push("tworzenie zlecenia (create_order)");
  if (caps.length) system += `\nMożesz: ${caps.join("; ")}.`;

  // Wiedza z poprzednich rozmów (warstwa uczenia).
  let kq = admin.from("voice_agent_knowledge").select("category, situation, recommended_response")
    .eq("persona_key", p.personaKey).eq("is_active", true);
  kq = providerId ? kq.or(`provider_id.eq.${providerId},provider_id.is.null`) : kq.is("provider_id", null);
  const { data: knowledge } = await kq.order("evidence_count", { ascending: false }).limit(8);
  if (knowledge?.length) {
    system += `\n\n=== NAUKA Z POPRZEDNICH ROZMÓW (stosuj) ===\n` +
      knowledge.map((k: any) => `- [${k.category}] ${k.situation}: ${k.recommended_response}`).join("\n");
  }

  system += `

=== CZAS ===
Dziś ${humanDate} (${todayISO}), godzina ${nowTime} (Europa/Warszawa). Daty względne ("jutro","w sobotę") licz sam i podawaj do narzędzi jako RRRR-MM-DD. NIGDY nie pytaj o dzisiejszą datę.

=== RODZAJ GRAMATYCZNY ===
${genderClause}

=== POWITANIE (raz, krótko — wymóg prawny: AI + nagrywanie) ===
"${firmName}, asystent AI, rozmowa nagrywana. W czym mogę pomóc?" — nic więcej, nie wymieniaj usług.
Jeśli rozmówca mówi w innym języku — od razu przełącz się na jego język.

=== STYL (człowiek przez telefon, ZWIĘŹLE — każda sekunda kosztuje) ===
- 1 zdanie na turę, JEDNO pytanie naraz. Bez monologów i wyliczanek.
- Forma "Pan/Pani", ciepło, konkretnie. Gdy nie znasz płci — bezosobowo ("Czy ten termin pasuje?").
- NIE powtarzaj i NIE literuj nazwiska ("Czyli Daniel Moszeczko, dobrze?" — ZAKAZ). Po podaniu danych: "Dobrze, zapisałem." Potwierdzaj KRÓTKO i TYLKO numer telefonu oraz rejestrację (raz).

=== ZBIERANIE DANYCH — MAKS. 2-3 TURY, GRUPUJ PYTANIA ===
Kolejność: (1) problem/usterka; (2) termin; (3) JEDNO pytanie o pojazd: "Proszę markę, model i numer rejestracyjny"; (4) JEDNO pytanie o osobę: "Poproszę imię, nazwisko i telefon". NIE pytaj o markę/model/rok osobno.

=== WYMOWA ===
Liczby/godziny/ceny SŁOWAMI ("dziewiąta rano","sto pięćdziesiąt złotych"). ALE numer REJESTRACYJNY i numer telefonu czytaj POJEDYNCZYMI znakami ("Y-dziewięć-dziewięć-sześć-E-U"), NIGDY liczebnikiem ("dziewięćset dziewięćdziesiąt sześć").

=== NARZĘDZIA ===
Gdy masz komplet: check_availability -> create_booking -> create_order. W create_order "complaint" to lista punktów (każdy w nowej linii od "- "). Utwórz rezerwację i zlecenie TYLKO RAZ. Zanim zaproponujesz godzinę — sprawdź check_availability; podaj jedną konkretną godzinę, nie mów ile jest wolnych miejsc.

=== PODSUMOWANIE (po ludzku, nie formularz) ===
"Dobrze Panie Danielu, zapisałem Pana na sobotę na dziewiątą. Wyślę SMS z potwierdzeniem. Czy mogę jeszcze w czymś pomóc?"

=== KOŃCZENIE ROZMOWY (koszt!) ===
- Gdy sprawa załatwiona i klient dziękuje / mówi "to wszystko" / "nie, dziękuję" — pożegnaj JEDNYM zdaniem ("Dziękuję, do usłyszenia.") i użyj narzędzia end_call. Nie przedłużaj.
- Gdy klient prosi o człowieka/pracownika — powiedz "Już łączę z pracownikiem." i użyj transfer_to_number (jeśli dostępne).
- Gdy masz błąd techniczny — NIE powtarzaj się i NIE zwlekaj: powiedz raz "Przepraszam, mam chwilowy problem — oddzwonimy do Pana." i zakończ (end_call) albo przekieruj. NIGDY nie powtarzaj "problem techniczny" kilka razy.`;

  const tools: any[] = [];
  if (providerId && calendarAccess) {
    tools.push({
      name: "check_availability",
      description: "Sprawdź wolne terminy w danym dniu. Użyj zanim zaproponujesz godzinę.",
      input_schema: { type: "object", properties: { date: { type: "string", description: "Data RRRR-MM-DD" }, duration_minutes: { type: "integer" } }, required: ["date"] },
    });
    tools.push({
      name: "create_booking",
      description: "Umów wizytę (rezerwacja). Wywołaj gdy masz: imię i nazwisko, telefon, datę i godzinę.",
      input_schema: { type: "object", properties: {
        customer_name: { type: "string" }, customer_phone: { type: "string" },
        scheduled_date: { type: "string", description: "RRRR-MM-DD" }, scheduled_time: { type: "string", description: "GG:MM" },
        duration_minutes: { type: "integer" }, service_name: { type: "string" }, notes: { type: "string", description: "Krótki opis usterki" },
        vehicle: { type: "object", properties: { brand: { type: "string" }, model: { type: "string" }, year: { type: "integer" }, plate: { type: "string" } } },
      }, required: ["customer_name", "customer_phone", "scheduled_date", "scheduled_time"] },
    });
  }
  if (providerId && ordersAccess) {
    tools.push({
      name: "create_order",
      description: "Utwórz zlecenie warsztatowe. Wywołaj po umówieniu wizyty (podaj booking_id z create_booking).",
      input_schema: { type: "object", properties: {
        customer_name: { type: "string" }, customer_phone: { type: "string" }, complaint: { type: "string", description: "Lista usterek — KAŻDA w nowej linii od '- '" },
        scheduled_date: { type: "string" }, scheduled_time: { type: "string" }, duration_minutes: { type: "integer" },
        vehicle: { type: "object", properties: { brand: { type: "string" }, model: { type: "string" }, year: { type: "integer" }, plate: { type: "string" } } },
        booking_id: { type: "string" },
      }, required: ["customer_name", "customer_phone", "complaint"] },
    });
  }

  return { system, tools, model };
}
