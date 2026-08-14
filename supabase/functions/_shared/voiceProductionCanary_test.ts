import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveVoiceProductionCanary,
  VOICE_PRODUCTION_CANARY_AGENT_ID,
  VOICE_PRODUCTION_CANARY_ENABLED,
  VOICE_PRODUCTION_CANARY_PROVIDER_ID,
} from "./voiceProductionCanary.ts";
import { executePhase1Fallback, type Phase1VoiceRouting } from "./voicePhase1Runtime.ts";
import { buildPhase1AnthropicRequest, consumePhase1AnthropicSse } from "./voicePhase1ModelAdapter.ts";
import { resolveVoiceLlmRoute } from "./voicePhase1Route.ts";

const environment = (overrides: Record<string, string | undefined> = {}) => {
  const values: Record<string, string | undefined> = {
    [VOICE_PRODUCTION_CANARY_ENABLED]: "true",
    [VOICE_PRODUCTION_CANARY_PROVIDER_ID]: "provider-canary",
    [VOICE_PRODUCTION_CANARY_AGENT_ID]: "agent-canary",
    ...overrides,
  };
  return (name: string) => values[name];
};

test("canary requires the explicit kill switch and both matching identifiers", () => {
  assert.deepEqual(
    resolveVoiceProductionCanary("provider-canary", "agent-canary", environment()),
    { enabled: true, reason: "enabled" },
  );
  assert.equal(resolveVoiceProductionCanary("provider-canary", "agent-canary", environment({
    [VOICE_PRODUCTION_CANARY_ENABLED]: "false",
  })).reason, "kill_switch_off");
  assert.equal(resolveVoiceProductionCanary("provider-canary", "agent-canary", environment({
    [VOICE_PRODUCTION_CANARY_AGENT_ID]: undefined,
  })).reason, "target_incomplete");
});

test("provider and ElevenLabs agent are independent tenant boundaries", () => {
  assert.equal(resolveVoiceProductionCanary("provider-other", "agent-canary", environment()).reason, "provider_mismatch");
  assert.equal(resolveVoiceProductionCanary("provider-canary", "agent-other", environment()).reason, "agent_mismatch");
  assert.equal(resolveVoiceProductionCanary("provider-other", "agent-other", environment()).enabled, false);
});

test("Custom LLM route resolves both ElevenLabs path and legacy query parameters", () => {
  assert.deepEqual(resolveVoiceLlmRoute(new URL(
    "https://example.test/functions/v1/voice-agent-llm/provider-path/workshop_secretary/llm/chat/completions",
  )), { providerId: "provider-path", personaKey: "workshop_secretary" });
  assert.deepEqual(resolveVoiceLlmRoute(new URL(
    "https://example.test/functions/v1/voice-agent-llm?provider_id=provider-query&persona_key=custom",
  )), { providerId: "provider-query", personaKey: "custom" });
});

test("runtime entrypoints use the shared pair gate and do not embed canary identifiers", () => {
  // Zakres tej gałęzi to wyłącznie dwie funkcje Phase 1. Odpowiedniki asercji dla
  // voice-agent-tools, voice-call-postprocess i voice-agent-sync należą do szerszej
  // pracy i wracają razem z tamtymi funkcjami.
  const files = [
    "../voice-agent-llm/index.ts",
    "../voice-agent-chat/index.ts",
  ];
  for (const relativePath of files) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /resolveVoiceProductionCanary/);
    assert.doesNotMatch(source, /provider-canary|agent-canary/);
  }
});

test("Phase 1 runtime is migration-free and limited to LLM plus chat", () => {
  const sources = [
    "../voice-agent-llm/index.ts",
    "../voice-agent-chat/index.ts",
    "./voiceProductionCanary.ts",
    "./voicePhase1Runtime.ts",
    "./voicePhase1ModelAdapter.ts",
    "./voicePhase1SecretReader.ts",
    "./voicePhase1AgentConfig.ts",
    "./voicePhase1Route.ts",
    "./anthropicSse.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
  const [llm, chat] = sources;
  const runtime = sources.join("\n");

  for (const table of ["ai_function_mapping", "ai_providers", "voice_call_transcripts", "voice_call_outcomes"]) {
    assert.doesNotMatch(runtime, new RegExp(`\\.from\\(["']${table}["']\\)`));
  }
  for (const newColumn of ["model_timeout_ms", "max_tool_rounds", "max_output_tokens", "backup_model_override", "voice_conversation_id"]) {
    assert.doesNotMatch(runtime, new RegExp(`select\\([^)]*${newColumn}`));
  }
  // conversation_id JEST już przekazywany, ale wyłącznie w gałęzi canary — legacy
  // zachowuje poprzedni kontrakt. Kontrakt zmieniony świadomie: bez identyfikatora
  // rozmowy nie ma idempotencji ani powiązania rozmowy ze zleceniem.
  assert.match(llm, /canary\.enabled && conversationId \? \{ conversation_id: conversationId \}/);
  assert.doesNotMatch(chat.slice(chat.indexOf("if (!canary.enabled) {"), chat.indexOf("reply: legacyReply")), /conversation_id/);
  assert.match(chat, /admin\s*\.from\("voice_agent_personas"\)/);
  assert.match(chat, /admin\.from\("voice_agent_knowledge"\)/);
  assert.match(llm, /admin\.from\("voice_agent_configs"\)/);
  assert.doesNotMatch(runtime, /from ["']\.\/voiceAiRouting\.ts["']/);
  assert.doesNotMatch(runtime, /from ["']\.\/aiSecrets\.ts["']/);
  assert.doesNotMatch(runtime, /from ["']\.\/translationProvider\.ts["']/);
});

test("Phase 1 preserves legacy execution and enables streaming only behind the pair gate", () => {
  const llm = readFileSync(new URL("../voice-agent-llm/index.ts", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  assert.match(chat, /if \(!canary\.enabled\) \{/);
  assert.match(chat, /max_tokens: 400/);
  // Temperatura 0: duplikaty zadan od ElevenLabs maja dawac ten sam tekst.
  assert.match(chat, /temperature: 0,/);
  assert.match(chat, /for \(let round = 0; round < 5; round\+\+\)/);
  assert.match(chat, /body: JSON\.stringify\(\{ action: name, provider_id: providerId, persona_key: personaKey, is_test: testMode, \.\.\.input \}\)/);
  assert.match(chat, /claude-haiku-4-5-20251001/);
  assert.match(chat, /timeoutMs: 8_000/);
  assert.match(llm, /response_stream: canary\.enabled && stream/);
  assert.match(llm, /\.\.\.\(canary\.enabled \? \{ elevenlabs_agent_id:/);
});

test("truncated output is never treated as a finished turn", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // 400 z pomiaru na 13 rozmowach: najdłuższa wypowiedź 249 znaków ~78 tokenów.
  // Przy 150 były 3 ucięcia na 126 żądań, w tym jedno kończące rozmowę.
  assert.match(chat, /maxToolRounds: 3, maxOutputTokens: 400/);
  // Ucięcie jest obsłużone i zalogowane...
  assert.match(chat, /streamed\.stopReason === "max_tokens"/);
  assert.match(chat, /event: "output_truncated"/);
  assert.match(chat, /truncated = true/);
  // ...oraz rozstrzygnięte PRZED gałęzią narzędzi, żeby nie wykonać wywołania
  // z niekompletnymi argumentami.
  assert.ok(
    chat.indexOf('streamed.stopReason === "max_tokens"') <
      chat.indexOf('streamed.stopReason === "tool_use"'),
    "obsługa max_tokens musi poprzedzać gałąź tool_use",
  );
  // Tura oddaje głos rozmówcy zamiast urwać się ciszą.
  assert.match(chat, /Czy mam mówić dalej\?|Czy mogę powtórzyć krócej\?/);
  // Legacy pozostaje nietknięte.
  assert.doesNotMatch(chat, /legacyReply[\s\S]{0,200}max_tokens/);
});

test("model refusals are classified and only a retryable class may fall back", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // Trzy klasy odmowy rozróżnione wprost.
  assert.match(chat, /status === 400 \? "bad_request"/);
  assert.match(chat, /status === 429 \? "quota"/);
  assert.match(chat, /status === 529 \? "overloaded"/);
  // Status trafia do logu, żeby dało się odróżnić limit od błędu żądania.
  assert.match(chat, /event: "model_failed",[\s\S]{0,120}status: modelResponse\.status/);

  // Fallback tylko tam, gdzie drugi model realnie może odpowiedzieć. 400 i 429
  // dostają ten sam klucz i to samo żądanie, więc druga próba jest bezcelowa.
  const map = chat.slice(chat.indexOf("MODEL_FAILURE_FALLBACK"), chat.indexOf("const logTiming"));
  assert.match(map, /bad_request: false/);
  assert.match(map, /quota: false/);
  assert.match(map, /overloaded: true/);
  assert.match(chat, /if \(!MODEL_FAILURE_FALLBACK\[failure\]\) upstreamError\.allowFallback = false/);
});

test("model failure classification is reachable and precedes the throw", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // Stary, bezwarunkowy rzut nie może wrócić — czynił klasyfikację martwym kodem.
  assert.doesNotMatch(chat, /MODEL_UPSTREAM_ERROR/);

  const start = chat.indexOf("if (!modelResponse.ok) {");
  assert.ok(start > 0, "blok !modelResponse.ok musi istnieć");
  const throwAt = chat.indexOf("throw upstreamError;", start);
  assert.ok(throwAt > start, "blok musi kończyć się rzutem sklasyfikowanego błędu");
  const beforeThrow = chat.slice(start, throwAt);

  // Nic nie może rzucić wcześniej — inaczej klasyfikacja byłaby nieosiągalna.
  assert.equal(
    (beforeThrow.match(/\bthrow\b/g) || []).length,
    0,
    "przed klasyfikacją nie może wystąpić żaden throw",
  );

  // Wymagana kolejność kroków wewnątrz bloku.
  const steps = [
    "classifyModelFailure(modelResponse.status)", // 1-2. odczyt statusu i klasyfikacja
    'event: "model_failed"',                      // 3. log
    "status: modelResponse.status",               // 3. log zawiera status
    "MODEL_FAILURE_FALLBACK[failure]",            // 4. decyzja o fallbacku
  ];
  let previous = -1;
  for (const step of steps) {
    const at = beforeThrow.indexOf(step);
    assert.ok(at > previous, `krok "${step}" musi wystąpić przed rzutem i po poprzednim kroku`);
    previous = at;
  }
});

test("failure sentence never misreports whether anything was saved", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");
  const builder = chat.slice(chat.indexOf("const buildFailureSentence"), chat.indexOf("const logTiming"));

  // Gdy w tym żądaniu powstała rezerwacja — komunikat to odzwierciedla.
  assert.match(builder, /if \(mutationCreated\)/);
  // Treść zmieniona po rozmowie 05.08 18:43: "straciłam wątek / zapis jest w systemie"
  // brzmiało jak usterka mimo pełnego sukcesu. Teraz komunikat po prostu potwierdza.
  assert.match(builder, /Rezerwacja jest zapisana/);
  // Nigdzie nie wolno twierdzić, że nic nie zapisano: mutationCreated dotyczy tylko
  // bieżącego żądania, a rezerwacja mogła powstać w poprzedniej turze rozmowy.
  // W prawdziwym telefonie ten wariant skłamał — booking istniał w bazie.
  assert.doesNotMatch(builder, /Nic nie zostało/i);
  assert.doesNotMatch(builder, /nie zapisano|niczego nie/i);
  // Komunikat nie sugeruje też, że rezerwacja się udała, gdy nic o niej nie wiemy.
  assert.doesNotMatch(builder, /wizyta jest potwierdzona/i);
  // Limit konta ma własny, spokojniejszy komunikat.
  assert.match(builder, /failure === "quota"/);
  // Rozmówca nie dostaje szczegółów technicznych.
  assert.doesNotMatch(builder, /429|529|Anthropic|API/);
});

test("conversation id probe collects evidence without leaking the value", () => {
  const llm = readFileSync(new URL("../voice-agent-llm/index.ts", import.meta.url), "utf8");

  const probe = llm.slice(llm.indexOf("conversationIdCandidates"), llm.indexOf("// Wyciągnij rozmowę"));
  assert.ok(probe.length > 0, "sonda musi istnieć przed budową rozmowy");
  assert.match(probe, /event: "conversation_id_probe"/);

  // Sonda raportuje wyłącznie nazwę źródła i długość — nigdy samą wartość.
  assert.match(probe, /source, length: String\(value\)\.length/);
  assert.doesNotMatch(probe, /value \}\)\)/);
  // Nagłówki wrażliwe nie trafiają do logu.
  assert.match(probe, /\^authorization\$\|\^cookie\$\|apikey/);

  // Sonda zbiera dowód, ale identyfikator idzie dalej WYŁĄCZNIE w gałęzi canary.
  assert.match(llm, /canary\.enabled && conversationId \? \{ conversation_id: conversationId \}/);
});

test("technical failure notifies the workshop and never guesses the caller gender", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // Powiadomienie warsztatu idzie na numer firmowy, po wysłaniu tekstu, ale przed
  // zamknięciem strumienia — inaczej żądanie mogłoby zakończyć się przed SMS-em.
  assert.match(chat, /const notifyWorkshopCallback = async/);
  assert.match(chat, /select\("company_phone"\)/);
  assert.match(chat, /sms_type: "ai_callback_request"/);
  // Wysyłka jest wyłączona do czasu conversation_id — bez niego jedna rozmowa
  // mogłaby wysłać kilka SMS-ów, bo każda tura to osobne żądanie.
  assert.match(chat, /const CALLBACK_SMS_ENABLED = false;/);
  assert.match(chat, /if \(CALLBACK_SMS_ENABLED\) await notifyWorkshopCallback/);
  // Prawda o zapisie jest na poziomie ROZMOWY, nie żądania: równoległe żądanie mogło
  // utworzyć rezerwację, a to dostać timeout. Bez tego agent przeprosił za awarię,
  // której nie było (rozmowa 05.08 18:43).
  assert.match(chat, /conversationCommitted/);
  assert.match(chat, /eq\("elevenlabs_conversation_id", conversationId\)/);
  assert.match(chat, /buildFailureSentence\(lastModelFailure, conversationCommitted\)/);
  const catchBlock = chat.slice(chat.indexOf('event: "stream_failed"'), chat.indexOf("cancel() {"));
  assert.ok(
    catchBlock.indexOf("data: [DONE]") < catchBlock.indexOf("await notifyWorkshopCallback"),
    "SMS nie może opóźniać mowy — musi iść po wysłaniu tekstu",
  );
  assert.ok(
    catchBlock.indexOf("await notifyWorkshopCallback") < catchBlock.indexOf("controller.close()"),
    "SMS musi wyjść przed zamknięciem strumienia",
  );
  // Numery nigdy nie trafiają do logu.
  assert.doesNotMatch(chat, /callback_sms[\s\S]{0,120}(target|company_phone|callerNumber)\s*[,}]/);

  // Anulowanie przez rozmówcę domyka strumień zamiast zostawiać go wiszącym.
  assert.match(chat, /if \(canaryAbortSignal\.aborted\) \{[\s\S]{0,140}controller\.close\(\)/);

  // Płeć: bez zgadywania po głosie, formy bezosobowe do czasu poznania imienia.
  assert.match(chat, /NIGDY nie zgaduj płci po głosie/);
  assert.match(chat, /bez "Pan", bez "Pani" i bez "Ty"/);
  assert.match(chat, /Imienia używaj oszczędnie/);
});

test("official form is enforced for the whole call", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // W transkrypcie z 04.08 agent mówił "dla Ciebie", "pasuje Ci", "Wyślę Ci SMS",
  // a potem "Panie Danielu" — dwie formy w jednej rozmowie.
  assert.match(chat, /FORMA OFICJALNA — BEZWZGLĘDNIE/);
  assert.match(chat, /NIGDY nie mów "Ty", "Ci", "Tobie", "masz"/);
  assert.match(chat, /Cała rozmowa, od pierwszego do ostatniego zdania, jest oficjalna/);

  // Po imieniu: Panie/Pani + IMIĘ, nigdy nazwiskiem; przy niejednoznacznym imieniu bezosobowo.
  assert.match(chat, /PANIE\/PANI \+ IMIĘ, nigdy nazwiskiem/);
  assert.match(chat, /nietypowe, obce lub niejednoznaczne — ZOSTAŃ przy formach bezosobowych/);
});

test("phone is stored silently and the year is never asked", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // Telefonu nie czytamy wstecz słowami.
  assert.match(chat, /NIE powtarzaj numeru słowami/);
  assert.match(chat, /Dziękuję, numer zapisany/);
  // Rok produkcji nie jest potrzebny do rezerwacji.
  // Sekwencja jest teraz zależna od caller_id: gdy numer przyszedł z sygnalizacji,
  // agent NIE pyta o telefon (jedna tura mniej); przy numerze zastrzeżonym pyta.
  assert.match(chat, /NIE PYTAJ O NUMER TELEFONU — mamy go z połączenia/);
  assert.match(chat, /Numer telefonu jest wymagany, bo połączenie przyszło z numeru zastrzeżonego/);
  assert.match(chat, /const callerIdAvailable = isServiceCall && !!body\?\.caller_id_available/);
  // Normalizacja liter zostaje na wypadek, gdy klient poda rejestrację sam.
  assert.match(chat, /"igrek" = Y/);
  assert.match(chat, /"iks" = X/);
  // Ale pętla potwierdzania znika — o rejestrację już nie pytamy.
  assert.doesNotMatch(chat, /Powtórz numer do potwierdzenia MAKSYMALNIE RAZ/);
});

test("digits are read one by one and slots are never invented", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // Trzeci raz ten sam błąd: "cztery pięćset osiemdziesiąt trzy".
  assert.match(chat, /REGUŁA ŁAMANA JUŻ TRZY RAZY/);
  assert.match(chat, /każdą cyfrę czytasz OSOBNO/);
  assert.match(chat, /BŁĄD: "pięćset dziewiętnaście/);
  assert.match(chat, /BŁĄD: "cztery pięćset osiemdziesiąt trzy"/);
  // Lista dozwolonych słów zamiast samego zakazu — model łamał sam zakaz.
  assert.match(chat, /Wolno Ci wypowiedzieć TYLKO te słowa/);
  assert.match(chat, /Zabronione w numerach/);

  // Bez zapowiedzi "sprawdzam", od razu konkretne godziny z narzędzia.
  assert.match(chat, /nie zapowiadaj sprawdzania dostępności/);
  assert.match(chat, /wyłącznie godziny, które narzędzie faktycznie zwróciło/);

  // Zdanie o przyjeździe wcześniej znika z rozmowy.
  assert.match(chat, /nigdy nie mów o przyjeździe wcześniej/);
  // Fraza nie może wrócić do stałych reguł w kodzie — źródłem była baza wiedzy.
  assert.doesNotMatch(chat, /Prosimy przyjechać|10 minut wcześniej|dziesięć minut wcześniej/);
});

test("registration number is asked once and never confirmed back", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // Warsztat potrzebuje rejestracji, więc pytanie wraca — ale bez pętli
  // potwierdzania, która 04.08 kosztowała sześć prób i cztery minuty.
  // Wzorzec CELOWO luźny w środku. Reguła bywa wzmacniana (13.08 doszło
  // „ZAKAZ CZYTANIA NA GŁOS, BEZ WYJĄTKÓW"), a test ma pilnować ZASADY,
  // nie interpunkcji — dopasowanie co do znaku wywracało CI przy każdym
  // doprecyzowaniu promptu, choć zachowanie agenta było poprawne.
  assert.match(chat, /NUMER REJESTRACYJNY[^\n]{0,140}zapytaj RAZ/);
  assert.match(chat, /NIE powtarzaj go wstecz, NIE proś o potwierdzenie, NIE literuj/);
  assert.match(chat, /nie wracaj do tematu/);
  // Rejestracja domyka listę zbieranych danych.
  // Sekwencja skrócona: nazwisko wypadło z pytań. ASR dał pięć różnych wersji tego
  // samego nazwiska w pięciu rozmowach, a identyfikacja idzie po telefonie i rejestracji.
  // Pięć tur zamiast siedmiu: imię łączone z autem, rejestracja osobno.
  assert.match(chat, /IMIĘ \+ marka i model auta → numer rejestracyjny → podsumowanie/);
  assert.match(chat, /NIE PYTAJ O NAZWISKO/);
  assert.match(chat, /Rejestracja ZAWSZE osobno/);
  assert.match(chat, /TON: prosisz, nie odpytujesz/);
});

test("agent never narrates its own system actions", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // Cytat z prawdziwej rozmowy: "Już sprawdzam. Teraz tworzę rezerwację: Do widzenia!"
  assert.match(chat, /ZAKAZ RELACJONOWANIA WŁASNYCH DZIAŁAŃ/);
  assert.match(chat, /Klient słyszy WYNIK, nigdy PROCES/);
  // Zakaz jest OPISOWY, nie listą cytatów. Lista działała lepiej niż ogólnik, ale mimo
  // niej fraza wracała — a cytowanie jej dosłownie mogło ją modelowi podpowiadać.
  // Prompt nie zawiera już ani jednego cytatu zakazanego zwrotu.
  assert.doesNotMatch(chat, /"już sprawdzam"/i);
  for (const verb of ["sprawdzasz", "tworzysz", "zapisujesz", "umawiasz"]) {
    assert.ok(chat.includes(verb), `opisowy zakaz musi obejmować czynność "${verb}"`);
  }
  assert.match(chat, /jeśli zdanie opisuje, co dzieje się PO TWOJEJ STRONIE/);
  assert.match(chat, /Cisza w trakcie jest lepsza niż relacja z pracy systemu/);

  // Powitanie w rejestrze oficjalnym.
  assert.match(chat, /POWITANIE TEŻ JEST OFICJALNE/);
  assert.match(chat, /ZAKAZANE: "Cześć", "Hej", "Siema"/);
});

test("goodbye and end_call happen in the same turn", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // We wszystkich dotychczasowych rozmowach agent mówił "do widzenia" i stał,
  // czekając aż klient się rozłączy.
  assert.match(chat, /=== ZAKOŃCZENIE ROZMOWY ===/);
  assert.match(chat, /W TEJ SAMEJ TURZE wywołaj narzędzie end_call/);
  assert.match(chat, /Nie czekaj na kolejną turę, nie milcz po pożegnaniu/);
  assert.match(chat, /najpierw wypowiadasz "Do widzenia", potem wywołujesz end_call/);

  // Data i godzina w podsumowaniu dokładnie raz.
  assert.match(chat, /Datę i godzinę podajesz w podsumowaniu DOKŁADNIE RAZ/);
  assert.match(chat, /ŹLE: "Umawiam na czwartek szóstego o jedenastej, do zobaczenia/);
});

test("booking deterministically creates the order and a calendar slot", () => {
  const tools = readFileSync(new URL("../voice-agent-tools/index.ts", import.meta.url), "utf8");

  // Zlecenie nie zależy już od tego, czy model pamięta o drugim narzędziu.
  assert.match(tools, /ZLECENIE DETERMINISTYCZNIE, nie na łasce modelu/);
  assert.match(tools, /action: "create_order", provider_id: providerId/);
  assert.match(tools, /order_id: createdOrderId, order_failed: orderFailed/);

  // complaint to słowa klienta, nie parafraza.
  assert.match(tools, /complaint = SŁOWA KLIENTA, zwięźle/);

  // Grafik: rezerwacja pojawia się na siatce tylko ze station_id.
  assert.match(tools, /freeStationId \? \{ station_id: freeStationId \} : \{\}/);
  assert.match(tools, /from\("workshop_workstations"\)/);
  assert.match(tools, /const taken = new Set/);

  // Wybór stanowiska nie może blokować rezerwacji.
  assert.match(tools, /brak stanowisk nie moze blokowac rezerwacji/);
});

test("post-call webhook resolves the tenant by agent_id and never fails silently", () => {
  const pp = readFileSync(new URL("../voice-call-postprocess/index.ts", import.meta.url), "utf8");

  // Tenant rozpoznawany po agent_id z payloadu; parametry URL to tylko fallback.
  assert.match(pp, /eq\("elevenlabs_agent_id", agentId\)/);
  assert.match(pp, /const urlProviderId = url\.searchParams\.get\("provider_id"\)/);
  const lookupAt = pp.indexOf('eq("elevenlabs_agent_id", agentId)');
  const fallbackAt = pp.indexOf("providerId = urlProviderId");
  assert.ok(lookupAt < fallbackAt, "agent_id musi być sprawdzany przed parametrem z URL");

  // Brak tenanta = 400, nie ciche 200. To był powód, dla którego transkrypty ginęły.
  assert.match(pp, /event: "tenant_unresolved"/);
  assert.match(pp, /conversation_id: conversationId,\s*\n\s*\}, 400\)/);

  // Błąd analizy jest propagowany, nie połykany.
  assert.match(pp, /event: "analyze_failed"/);
  assert.doesNotMatch(pp, /ok: true, analyzed: out\?\.ok/);

  // Każde niepowodzenie zostawia ślad z conversation_id.
  for (const evt of ["tenant_unresolved", "analyze_failed", "transcript_too_short", "request_failed"]) {
    assert.match(pp, new RegExp(`event: "${evt}"`));
  }
});

test("ElevenLabs system tools reach the model and come back as tool_calls", () => {
  const llm = readFileSync(new URL("../voice-agent-llm/index.ts", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // llm czyta pole tools z żądania ElevenLabs i przekazuje je dalej (tylko canary).
  assert.match(llm, /const clientTools: unknown\[\] = Array\.isArray\(reqBody\?\.tools\)/);
  assert.match(llm, /canary\.enabled && clientTools\.length \? \{ client_tools: clientTools \}/);

  // chat konwertuje OpenAI -> Anthropic i dokłada do TEJ SAMEJ listy co nasze narzędzia.
  assert.match(chat, /const fn = \(raw\?\.function \?\? raw\)/);
  // Pole system__message_to_speak jest USUWANE ze schematu: model chował w nim
  // pożegnanie zamiast je wypowiedzieć, a ElevenLabs go nie odtwarzał.
  assert.match(chat, /input_schema: stripSpokenParam\(parameters\)/);
  assert.match(chat, /const SPOKEN_PARAM = "system__message_to_speak"/);
  assert.match(chat, /clientToolNames\.add\(name\)/);

  // Narzędzia klienta NIE są wykonywane u nas — rozpoznanie musi poprzedzać
  // gałąź, która woła voice-agent-tools.
  const detectAt = chat.indexOf("const requestedClientTools");
  const executeAt = chat.indexOf('streamed.stopReason === "tool_use"');
  assert.ok(detectAt > 0 && detectAt < executeAt, "narzędzia klienta muszą być rozpoznane przed wykonaniem naszych");

  // Odpowiedź wraca w formacie OpenAI z finish_reason tool_calls.
  assert.match(chat, /type: "function",\s*\n\s*function: \{ name: call\.name, arguments: JSON\.stringify/);
  assert.match(chat, /finish_reason: "tool_calls"/);

  // Przy end_call pusta odpowiedź jest poprawna — agent nie może mówić po pożegnaniu.
  assert.match(chat, /if \(!reply\.trim\(\) && !clientToolCalls\.length\)/);
});

test("learned rules never activate themselves", () => {
  const analyze = readFileSync(new URL("../voice-call-analyze/index.ts", import.meta.url), "utf8");

  // Agent nadal wyciąga wnioski i je zapisuje, ale żaden nie trafia do promptu
  // bez decyzji człowieka. Sześć auto-reguł z 04.08 przeczyło regułom, które
  // właściciel dopiero co kazał wprowadzić.
  assert.match(analyze, /source: "distilled", evidence_count: 1, is_active: false/);
  assert.doesNotMatch(analyze, /evidence_count: 1, is_active: true/);

  // Wzmacnianie istniejącej reguły nie może jej reaktywować.
  const updateBlock = analyze.slice(analyze.indexOf("if (ex)"), analyze.indexOf("} else {"));
  assert.doesNotMatch(updateBlock, /is_active/);
});

test("night calls, surname and politeness", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // Rozmowa 05.08 o 00:40: "może być jutro" -> agent policzył 6.08 zamiast 5.08.
  assert.match(chat, /ROZMOWY NOCNE/);
  assert.match(chat, /między północą a piątą rano/);
  assert.match(chat, /Czyli dzisiaj, w środę piątego, czy jutro w czwartek szóstego\?/);
  assert.match(chat, /ZAWSZE podawaj dzień tygodnia I datę, nigdy samo "jutro"/);

  // Nazwisko zapisujemy tak, jak usłyszane — warsztat poprawi przy przyjęciu.
  assert.match(chat, /IMIENIA NIE POTWIERDZAJ, NIE LITERUJ i NIE POWTARZAJ/);
  assert.match(chat, /Żadnego "czy dobrze zapisałem", żadnego literowania/);

  // Grzeczności: bez preambuł przy zbieraniu danych.
  assert.match(chat, /BEZ PREAMBUŁ/);
  assert.match(chat, /DOBRZE: "Jaka marka i model\?"/);
  assert.match(chat, /NAJWYŻEJ RAZ NA KILKA TUR/);
});

test("address form: no surname, no plural", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  assert.match(chat, /NAZWISKA NIE UŻYWAJ NIGDY/);
  assert.match(chat, /"Panie Danielu" — TAK\. "Panie Moszeczkow" — NIE/);
  // Bug z transkryptu: "Chętnie Wam pomogę" do jednej osoby.
  assert.match(chat, /LICZBA MNOGA JEST BŁĘDEM/);
  assert.match(chat, /NIGDY "Wam", "Wasze", "Chętnie Wam pomogę"/);
});

test("agent NIE tworzy rezerwacji ani zlecenia — robi to commit po rozmowie", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // Zasada nadrzędna: agent rozmawia i notuje. Narzędzia zapisujące zniknęły 06.08,
  // bo tura z zapisem trwała 7,1-10,8 s wobec 795 ms bez narzędzi, a każdy zapis
  // był podatny na duplikat żądania od ElevenLabs i przerywał turę przed end_call.
  assert.doesNotMatch(chat, /name: "create_booking"/);
  assert.doesNotMatch(chat, /name: "create_order"/);
  assert.match(chat, /name: "check_availability"/, "check_availability zostaje jako wyjątek");
  assert.match(chat, /NIE TWORZYSZ rezerwacji ani zlecenia/);
  assert.match(chat, /Masz JEDNO narzędzie: check_availability/);

  // W prompcie nie może zostać ani jedno odwołanie do narzędzi, których już nie ma —
  // reguła o narzędziu, którego model nie dostał, jest niewykonalna (zasada 11).
  const prompt = [...chat.matchAll(/system \+= `((?:[^`\\]|\\.)*)`/g)].map((m) => m[1]).join("\n");
  for (const znikle of ["create_booking", "create_order", "KOLEJNOŚĆ NARZĘDZI"]) {
    assert.equal(prompt.includes(znikle), false, `prompt nie może wspominać o ${znikle}`);
  }
});

test("conversation model comes from configuration, legacy still forced to Sonnet", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // Canary bierze model z ai_agents_config; legacy nadal odrzuca Haiku.
  assert.match(chat, /const configuredModel = agent\?\.model && agent\.model\.startsWith\("claude"\) \? agent\.model : null/);
  assert.match(chat, /canary\.enabled[\s\S]{0,40}\? \(configuredModel \|\| CONVO_DEFAULT\)/);
  assert.match(chat, /configuredModel && !configuredModel\.includes\("haiku"\) \? configuredModel : CONVO_DEFAULT/);
  // Domyślka pozostaje obecnym modelem produkcyjnym.
  assert.match(chat, /const CONVO_DEFAULT = "claude-sonnet-4-6"/);
  // Haiku jest osiągalne jako model rozmowy, nie tylko jako fallback.
  assert.match(chat, /claude-haiku-4-5-20251001/);
});

test("conversation_id flows from llm through chat to the tools", () => {
  const llm = readFileSync(new URL("../voice-agent-llm/index.ts", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");
  const tools = readFileSync(new URL("../voice-agent-tools/index.ts", import.meta.url), "utf8");

  // llm: wybiera pierwsze źródło, które cokolwiek przysłało, i loguje które.
  assert.match(llm, /const conversationId = \(conversationIdCandidates/);
  assert.match(llm, /used_source: conversationIdSource/);

  // chat: przyjmuje tylko z wywołania service-role i dokłada do wywołań narzędzi.
  assert.match(chat, /const conversationId = isServiceCall \? String\(body\?\.conversation_id \|\| ""\) : ""/);
  assert.match(chat, /\.\.\.\(conversationId \? \{ conversation_id: conversationId \} : \{\}\)/);

  // tools: find-or-create wiersza voice_calls po identyfikatorze rozmowy.
  assert.match(tools, /eq\("elevenlabs_conversation_id", conversationId\)/);
  assert.match(tools, /elevenlabs_conversation_id: conversationId, status: "in_progress"/);
});

test("one conversation cannot create two bookings, orders or SMS", () => {
  const tools = readFileSync(new URL("../voice-agent-tools/index.ts", import.meta.url), "utf8");

  const bookingBlock = tools.slice(tools.indexOf('if (action === "create_booking")'), tools.indexOf('if (action === "create_order")'));
  const orderBlock = tools.slice(tools.indexOf('if (action === "create_order")'));

  // Strażnik idempotencji stoi PRZED jakimkolwiek zapisem i przed SMS-em.
  assert.match(bookingBlock, /conversationCall\?\.linked_entity_id[\s\S]{0,200}duplicate: true/);
  assert.ok(
    bookingBlock.indexOf("conversationCall?.linked_entity_id") < bookingBlock.indexOf("workshop-send-sms"),
    "strażnik idempotencji musi poprzedzać wysyłkę SMS",
  );
  assert.match(orderBlock, /conversationCall\?\.linked_entity_type === "workshop_order"[\s\S]{0,220}duplicate: true/);

  // Powiązanie zapisywane po utworzeniu — to je czyta panel warsztatu.
  // `sb.id` zastąpione przez `bookingId`: przy trafieniu dedupu rezerwacja nie jest
  // wstawiana, więc identyfikator pochodzi albo z insertu, albo z istniejącego wiersza.
  assert.match(tools, /linkConversation\("service_booking", bookingId\)/);
  assert.match(tools, /linkConversation\("workshop_order", order\.id\)/);
  assert.match(tools, /linked_entity_type: entityType, linked_entity_id: entityId/);

  // Bez conversation_id wszystko działa jak dotąd — blok jest dodatkiem.
  assert.match(tools, /const conversationId = isServiceCall \? String\(body\?\.conversation_id \|\| ""\) : ""/);
});

test("conversation window keeps the whole call, not just the last few turns", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // Okno 12 wiadomości gubiło opis usterki po ~10 turach i agent pytał o niego
  // drugi raz. Potwierdzone transkryptem: powtórka padła dokładnie wtedy, gdy
  // pierwsza wiadomość klienta wypadła z okna.
  assert.doesNotMatch(chat, /slice\(canary\.enabled \? -12 : 0\)/);
  const slice = chat.match(/slice\(canary\.enabled \? -(\d+) : 0\)/);
  assert.ok(slice, "okno kontekstu musi być jawnie ograniczone");
  assert.ok(Number(slice[1]) >= 40, `okno kontekstu ${slice[1]} jest za małe na rozmowę telefoniczną`);

  // Reguła pamięci musi być w prompcie, nie tylko w oknie kontekstu.
  assert.match(chat, /=== PAMIĘĆ ROZMOWY \(najważniejsze\) ===/);
  assert.match(chat, /NIE PYTAJ o nią drugi raz/);
  assert.match(chat, /Nigdy nie mów "przepraszam za powtórzenie"/);

  // Hałas i błędny ASR nie mogą kasować kontekstu ani wywoływać wywiadu od nowa.
  assert.match(chat, /=== HAŁAS I NIEWYRAŹNA MOWA ===/);
  assert.match(chat, /NIE ZGADUJ i NIE ZACZYNAJ ROZMOWY OD NOWA/);
  assert.match(chat, /POZOSTAJE aktualne/);
  assert.match(chat, /WYŁĄCZNIE tej jednej brakującej informacji/);
});

test("knowledge lookup does not add a sequential hop before the first token", () => {
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  // Zapytanie o wiedzę startuje przed odczytem persony i jest odbierane później,
  // więc nie dokłada kolejnej podróży do bazy przed pierwszym tokenem.
  const promiseAt = chat.indexOf("const knowledgePromise");
  const personaAt = chat.indexOf('from("voice_agent_personas")');
  const awaitAt = chat.indexOf("await knowledgePromise");
  assert.ok(promiseAt > 0 && personaAt > 0 && awaitAt > 0, "wszystkie trzy punkty muszą istnieć");
  assert.ok(promiseAt < personaAt, "zapytanie o wiedzę musi wystartować przed odczytem persony");
  assert.ok(awaitAt > personaAt, "wynik wiedzy odbieramy dopiero po personie");
});

test("Phase 1 is unbuffered and propagates client cancellation without fallback or tools", () => {
  const llm = readFileSync(new URL("../voice-agent-llm/index.ts", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  for (const source of [llm, chat]) {
    assert.match(source, /"Cache-Control": "no-cache, no-transform"/);
    assert.match(source, /"X-Accel-Buffering": "no"/);
  }
  assert.match(chat, /AbortSignal\.any\(\[req\.signal, responseAbort\.signal\]\)/);
  assert.match(chat, /if \(canaryAbortSignal\.aborted\)[\s\S]{0,180}do_not_retry: true/);
  assert.match(chat, /requestError as Error & \{ allowFallback\?: boolean \}\)\.allowFallback = false/);
  assert.match(chat, /cancel\(\) \{[\s\S]{0,100}responseAbort\.abort/);
  assert.match(llm, /AbortSignal\.any\(\[req\.signal, AbortSignal\.timeout/);
});

const phase1Routing = (): Phase1VoiceRouting => ({
  primary: {
    providerKey: "claude_sonnet",
    providerName: "primary",
    model: "claude-sonnet-4-6",
    timeoutMs: 8_000,
    adapterKey: "anthropic_messages",
    secretKey: "ANTHROPIC_API_KEY",
    endpoint: "https://api.anthropic.com/v1/messages",
  },
  fallback: {
    providerKey: "claude_haiku",
    providerName: "fallback",
    model: "claude-haiku-4-5-20251001",
    timeoutMs: 8_000,
    adapterKey: "anthropic_messages",
    secretKey: "ANTHROPIC_API_KEY",
    endpoint: "https://api.anthropic.com/v1/messages",
  },
  allowFallback: true,
  maxToolRounds: 3,
  maxOutputTokens: 400,
});

test("Phase 1 falls back once before output", async () => {
  const attempts: string[] = [];
  const result = await executePhase1Fallback(phase1Routing(), async (candidate) => {
    attempts.push(candidate.providerKey);
    if (candidate.providerKey === "claude_sonnet") throw new DOMException("timeout", "TimeoutError");
    return "ok";
  });
  assert.equal(result.value, "ok");
  assert.equal(result.attempts, 2);
  assert.deepEqual(attempts, ["claude_sonnet", "claude_haiku"]);
});

test("Phase 1 never falls back after first output or client cancellation", async () => {
  const attempts: string[] = [];
  await assert.rejects(() => executePhase1Fallback(phase1Routing(), async (candidate) => {
    attempts.push(candidate.providerKey);
    const error = new DOMException("client disconnected", "AbortError") as DOMException & { allowFallback?: boolean };
    error.allowFallback = false;
    throw error;
  }), /client disconnected/);
  assert.deepEqual(attempts, ["claude_sonnet"]);
});

test("Phase 1 adapter requests real Anthropic SSE with tools and emits text incrementally", async () => {
  const routing = phase1Routing();
  const request = buildPhase1AnthropicRequest(
    routing.primary,
    "synthetic-key",
    "system",
    [{ role: "user", content: "test" }],
    [{ name: "check_availability", description: "test", input_schema: { type: "object" } }],
    routing.maxOutputTokens,
  );
  const body = JSON.parse(String(request.init.body));
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, 400);
  assert.equal(body.tools[0].name, "check_availability");
  assert.doesNotMatch(String(request.init.body), /synthetic-key/);

  const events = [
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "Szyb" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ko" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  const deltas: string[] = [];
  const result = await consumePhase1AnthropicSse(new Response(events, {
    headers: { "Content-Type": "text/event-stream" },
  }), (delta) => deltas.push(delta));
  assert.deepEqual(deltas, ["Szyb", "ko"]);
  assert.equal(result.text, "Szybko");
});

test("production preflight is read-only and rollback preserves archived content", () => {
  const preflight = readFileSync(new URL("../../tests/voice_production_canary_preflight.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../../tests/voice_production_canary_schema_rollback.sql", import.meta.url), "utf8");
  const runbook = readFileSync(new URL("../../../docs/voice-agent-production-canary.md", import.meta.url), "utf8");
  const executablePreflight = preflight.replace(/^\s*--.*$/gm, "");

  assert.match(preflight, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(preflight, /ROLLBACK;/);
  assert.doesNotMatch(executablePreflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i);
  assert.match(rollback, /ROLLBACK_VOICE_CANARY_SCHEMA/);
  assert.match(rollback, /NIE wykonywać:[\s\S]*DROP COLUMN/);
  assert.match(rollback, /voice_deduplication_archive/);
  assert.match(runbook, /VOICE_PRODUCTION_CANARY_ENABLED=false/);
  assert.match(runbook, /\*\*NOT READY\*\*/);
});

test("prompt caching: część stała jest cachowana, zmienna idzie za nią poza cache", () => {
  const routing = phase1Routing();
  const request = buildPhase1AnthropicRequest(
    routing.primary,
    "synthetic-key",
    "STALE REGULY",
    [{ role: "user", content: "test" }],
    [],
    routing.maxOutputTokens,
    "ZMIENNY CZAS",
  );
  const body = JSON.parse(String(request.init.body));

  // Prefiks musi być bajtowo identyczny między turami, więc blok stały jest PIERWSZY,
  // a zmienny czas doklejony ZA nim. Odwrotna kolejność unieważnia cache w każdej turze.
  assert.equal(Array.isArray(body.system), true);
  assert.equal(body.system.length, 2);
  assert.equal(body.system[0].text, "STALE REGULY");
  assert.deepEqual(body.system[0].cache_control, { type: "ephemeral" });
  assert.equal(body.system[1].text, "ZMIENNY CZAS");
  assert.equal(body.system[1].cache_control, undefined);

  // Bez części zmiennej zostaje jeden blok — zachowanie jak przed zmianą.
  const single = buildPhase1AnthropicRequest(
    routing.primary, "synthetic-key", "STALE REGULY", [{ role: "user", content: "t" }], [], routing.maxOutputTokens,
  );
  assert.equal(JSON.parse(String(single.init.body)).system.length, 1);
});
