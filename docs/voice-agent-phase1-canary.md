# Phase 1 production canary — bez migracji

Status dokumentu: lokalny handoff po fail-closed rollbacku z 2026-08-03.
Produkcja pozostaje na dokładnych źródłach legacy; canary jest wyłączony.
Dokument nie zawiera wartości identyfikatorów, numerów ani sekretów.

## Zakres wdrożenia

Jedynymi Edge Functions Phase 1 są, w tej kolejności:

1. `voice-agent-chat` — gałąź canary: strumieniowy Anthropic, krótki kontekst,
   timeout, jeden bezpieczny fallback przed pierwszym tekstem, maksymalnie trzy
   rundy narzędzi oraz blokada ponowienia błędnej operacji;
2. `voice-agent-llm` — ingress ElevenLabs: bezpośrednie przekazanie SSE z
   nagłówkami antybuforującymi i propagacja przerwania żądania.

W bundle tych dwóch funkcji wchodzą tylko małe moduły `_shared`:

- `voiceProductionCanary.ts` — fail-closed gate trzech warunków;
- `voicePhase1Runtime.ts` — typy i jednokrotny fallback;
- `voicePhase1ModelAdapter.ts` oraz `anthropicSse.ts` — wyłącznie streaming
  Anthropic i tool calling;
- `voicePhase1SecretReader.ts` — read-only semantyka obecnego produkcyjnego
  odczytu sekretów, bez nowego cache i rotacji;
- `voicePhase1AgentConfig.ts` — wyłącznie istniejący odczyt `ai_agents_config`.
- `voicePhase1Route.ts` — zgodność z istniejącym URL-em ElevenLabs w formacie
  ścieżki oraz z legacy query stringiem.

Nie wdrażać w Phase 1: `voice-agent-tools`, `voice-call-postprocess`,
`voice-call-analyze`, `voice-agent-sync`, `admin-voice-ai-routing`,
`admin-ai-secrets`, `voice-agent-simulate`, żadnego frontendu ani żadnej
migracji. Nie zmieniać konfiguracji ElevenLabs, SuperVoIP ani URL Custom LLM.

## Izolacja i zgodność wsteczna

Nowa ścieżka uruchamia się tylko, gdy jednocześnie:

- `VOICE_PRODUCTION_CANARY_ENABLED` ma dokładną wartość logiczną `true`;
- `provider_id` jest zgodny z `VOICE_PRODUCTION_CANARY_PROVIDER_ID`;
- odczytany z istniejącego `voice_agent_configs` Agent ID jest zgodny z
  `VOICE_PRODUCTION_CANARY_ELEVENLABS_AGENT_ID`.

`voice-agent-llm` odczytuje Agent ID po poprawnej autoryzacji i przekazuje go do
`voice-agent-chat` tylko w wewnętrznym żądaniu service-role. Wywołanie
użytkownika nie może aktywować canary wartością body. Brak flagi, jednego
identyfikatora albo zgodności oznacza gałąź legacy.

Gałąź legacy zachowuje poprzedni kontrakt: buforowane JSON Anthropic, model
Sonnet z `ai_agents_config`, 600 tokenów, maksymalnie pięć rund, bez nowego
timeoutu/fallbacku oraz stare body do obecnie wdrożonego `voice-agent-tools`.
Nie przekazuje `conversation_id` ani żadnego nowego pola trwałego. Phase 1
również wywołuje obecną produkcyjną wersję `voice-agent-tools`, dlatego sposób
tworzenia rezerwacji i zlecenia oraz używane tabele pozostają niezmienione.

Po rozpoczęciu tekstu fallback jest zabroniony, aby nie powtórzyć wypowiedzi.
Po anulowaniu strumienia sygnał przerwania dociera do modelu; przed każdym
narzędziem jest ponownie sprawdzany, więc przerwane połączenie nie rozpoczyna
nowej mutacji. Pierwszy błąd narzędzia kończy rundę bez ponowienia.

## Dowód braku zależności od nowych migracji

| Odczyt/wywołanie | Istniejący kontrakt | Pochodzenie schematu |
| --- | --- | --- |
| `voice_agent_configs` w LLM | kontekst, języki, uprawnienia, Agent ID | `20260613150000_voice_agent_core.sql`; uprawnienia również utrwalone w `20260614120000_voice_access_toggles.sql` |
| `voice_agent_personas`, `voice_agent_knowledge` | persona i istniejąca wiedza | `20260613150000_voice_agent_core.sql` |
| `ai_agents_config` | istniejący model/prompt Sonnet | `20260328074355_edcbfb13-e32f-4a72-83c0-304f9b7cc5de.sql` |
| `ai_secret_store` lub env | `VOICE_LLM_TOKEN`, `ANTHROPIC_API_KEY` | `20260613160000_ai_secret_store.sql` |
| `service_providers`, `user_roles` | dotychczasowa kontrola dostępu do tekstowego chat | migracje z 2025/2026, przed modułem voice |
| `voice-agent-tools` | istniejące tworzenie rezerwacji/zlecenia | funkcja pozostaje w obecnej wersji produkcyjnej |

Graf importów Phase 1 nie zawiera `voiceAiRouting.ts`, `aiSecrets.ts` ani
`translationProvider.ts`, aby nie wciągnąć nieobjętego zakresem routingu,
rotacji sekretów lub klientów innych modeli. Kod Phase 1 nie odwołuje się do
`ai_function_mapping`, `ai_providers`, tabel transkrypcji/wyników ani nowych pól
`voice_conversation_id`, `model_timeout_ms`, `max_tool_rounds`,
`max_output_tokens`, `backup_model_override`. Kontrola statyczna tego warunku
jest częścią `voiceProductionCanary_test.ts`.

Sonnet i Haiku użyte przez canary są już zarejestrowane w historycznych
migracjach dostawców z marca 2026. Phase 1 nie tworzy ani nie wymaga rekordu
globalnego routingu. Oba modele używają tego samego istniejącego
`ANTHROPIC_API_KEY`.

## Dokładny punkt rollbacku

Repozytoryjna znana dobra podstawa to commit:

`186d88e1ac314e2eaec2472da5f40c8fcc4af107`

| Funkcja | Git blob poprzedniej wersji | SHA-256 treści |
| --- | --- | --- |
| `voice-agent-chat` | `bd57d7ddc5b0820d2d3ed80cb12fe9b91c2a8f8d` | `5ff7c619ab0615455754513cd32514d8a0735ab44d5d67f501aaa8a2c0bd0055` |
| `voice-agent-llm` | `f5076bddc64d271916c9ec6ae2208af3c2b8d65c` | `58d661ddfc73c530e75a8cabb253032019b473e901c45f4d9489d891bee48955` |

Przed zatwierdzonym oknem operator powinien odtworzyć te dwa pliki z podanego
commita w osobnym, czystym worktree, sprawdzić SHA-256 i przygotować dwa osobne
artefakty rollbacku. Musi też porównać tę podstawę z identyfikatorem aktualnie
wdrożonego wydania; repo nie przechowuje wiarygodnego fingerprintu aktywnego
deploymentu. Jeżeli wersje się różnią, rollbackiem ma być zweryfikowany eksport
aktywnego wydania, nie automatycznie `HEAD`. Nie należy przywracać całego repo
ani używać `reset` na brudnym worktree.

Rollback operacyjny:

1. wyłączyć `VOICE_PRODUCTION_CANARY_ENABLED`;
2. potwierdzić w logach brak nowych wpisów `production_canary=true`;
3. wdrożyć poprzedni `voice-agent-llm` z podanego bloba;
4. wdrożyć poprzedni `voice-agent-chat` z podanego bloba;
5. wykonać health check i jeden niemutujący test legacy; nie cofać bazy, bo
   Phase 1 niczego w schemacie nie zmienia.

## Kolejność przyszłego wdrożenia

1. W managerze sekretów ustawić nazwy dwóch identyfikatorów docelowych, a kill
   switch pozostawić wyłączony. Wartości wkleić z chronionego źródła operatora;
   nie podawać ich jako argumentów powłoki, nie drukować i nie sprawdzać przez
   endpoint zwracający wartości.
2. Przygotować i zweryfikować artefakty rollbacku opisane wyżej.
3. Wdrożyć `voice-agent-chat`; nie wykonywać telefonu.
4. Przy wyłączonym switchu wykonać autoryzowany test legacy bez narzędzi i
   potwierdzić brak `production_canary=true`.
5. Wdrożyć `voice-agent-llm`; sprawdzić GET health oraz niecanary.
6. Włączyć kill switch jako ostatnią operację. Nie synchronizować ElevenLabs —
   istniejący agent nadal używa tego samego URL.
7. Wykonać test kontrolny bez telefonu, a dopiero po jego przejściu jedną
   rozmowę canary.

Sekrety wymagane nazwami: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY` lub `SUPABASE_PUBLISHABLE_KEY`, `VOICE_LLM_TOKEN`,
`ANTHROPIC_API_KEY`, opcjonalnie istniejący `AI_SECRETS_ENC_KEY` dla rekordów
zaszyfrowanych oraz trzy zmienne `VOICE_PRODUCTION_CANARY_*`. Phase 1 nie
ustawia ani nie rotuje żadnego z nich.

## Test kontrolny przed telefonem

Test wykonać dopiero w zatwierdzonym oknie, bez danych klienta:

1. GET `voice-agent-llm` ma zwrócić health bez dostępu do danych.
2. Przy kill switch off wysłać autoryzowane, syntetyczne żądanie bez uprawnień
   kalendarza/zleceń; odpowiedź ma użyć legacy, a log nie może zawierać
   `production_canary=true`.
3. Włączyć switch i wysłać z chronionego runnera syntetyczne żądanie do
   dokładnej pary, nadal bez uprawnień narzędzi. Klient musi czytać strumień
   przyrostowo (`curl --no-buffer` lub równoważnie): nagłówki muszą zawierać
   `text/event-stream`, `no-cache, no-transform`, `X-Accel-Buffering: no`, a
   pierwszy fragment tekstu musi nadejść przed `[DONE]` i przed końcem modelu.
4. Przerwać klienta po pierwszym fragmencie. Log nie może pokazać fallbacku ani
   narzędzia po anulowaniu.
5. Wysłać analogiczne żądanie z innym providerem oraz z innym Agent ID. Oba
   muszą pozostać legacy. Nie logować samych identyfikatorów.
6. Sprawdzić metryki bez PII: `auth`, `config`, `prepare`, `first_text`,
   `model_round`, `tool`, `total`. Dopiero wtedy dopuścić jeden telefon.

Timeout i błąd upstreamu są w tym kroku pokryte lokalnym mockiem; nie dodajemy
produkcyjnego przełącznika do sztucznego psucia modelu. W realnym canary
fallback można zaakceptować wyłącznie, gdy nastąpił przed pierwszym tekstem.

## Kryteria natychmiastowego rollbacku

- canary aktywuje się dla jakiejkolwiek innej pary;
- brak przyrostowego SSE, buforowanie albo brak pierwszego tekstu w 2,5 s;
- wypowiedź trwa po barge-in/rozłączeniu albo pojawia się powtórzona odpowiedź;
- fallback uruchamia się po wysłaniu pierwszego tekstu;
- narzędzie zostaje wywołane ponownie po błędzie lub po anulowaniu;
- powstaje więcej niż jedna rezerwacja albo jedno zlecenie;
- zmienia się dotychczasowe powiązanie rezerwacja → zlecenie;
- seria 5xx/timeoutów, brak jednoznacznego komunikatu końcowego lub wzrost
  opóźnienia zwykłych agentów;
- log ujawnia identyfikator docelowy, token, treść rozmowy albo dane klienta.

Phase 1 nie testuje transkrypcji, webhooka końcowego, panelu routingu, ciszy ani
synchronizacji ElevenLabs. Te obszary pozostają poza tym wdrożeniem.

## Handoff lokalny 2026-08-03

- Project ref został potwierdzony; backupy obu funkcji przechodzą SHA-256.
- Wykonano próbę deployu wyłącznie `voice-agent-chat` z `verify_jwt=false`.
- Wymagany autoryzowany syntetyczny request legacy nie mógł zostać wykonany bez
  bezpiecznego poświadczenia testowego. Nie eksportowano tokenów i nie użyto
  danych klienta.
- Kill switch został ponownie ustawiony na `false`, a `voice-agent-chat`
  przywrócono z dokładnego backupu. `voice-agent-llm` nie był wdrażany.
- Po rollbacku: `voice-agent-chat` OPTIONS HTTP 200, `voice-agent-llm` health
  `ok=true`, oba endpointy zachowują `verify_jwt=false`, a pobrane źródło chat
  jest bajtowo identyczne z backupem.
- Dodany parser `voicePhase1Route.ts` rozpoznaje istniejący URL
  `.../voice-agent-llm/<provider>/<persona>/llm/chat/completions` oraz dawny
  format query. Testy obejmują oba warianty.

### Instrukcja dla Claude

1. Nie wdrażaj migracji, tools, postprocess, analyze, sync, panelu ani frontendu.
2. Najpierw zdobądź zatwierdzone, krótkotrwałe poświadczenie do syntetycznego
   requestu legacy; przekaż je wyłącznie przez chroniony runner i nie loguj.
3. Uruchom `npm run test:voice`, `npm run typecheck`, `npm run build`, celowany
   ESLint oraz `git diff --check`.
4. Potwierdź `verify_jwt=false` i SHA-256 backupu. Wdróż tylko chat, wykonaj
   syntetyczny request bez narzędzi przy kill switchu off i sprawdź gałąź legacy.
5. Dopiero po pozytywnym wyniku wdróż tylko llm, sprawdź health i legacy oraz
   negatywną parę providera.
6. Ustaw wyłącznie `VOICE_PRODUCTION_CANARY_ENABLED=true`; identyfikatorów nie
   zmieniaj. Wykonaj jeden syntetyczny request właściwej pary bez narzędzi,
   potwierdź przyrostowy SSE, pierwszy tekst przed `[DONE]` i pomiar `first_text`.
7. Przy dowolnym błędzie ustaw flagę `false` i przywróć backup w kolejności
   `voice-agent-llm`, następnie `voice-agent-chat`; wykonaj health-check.
8. Telefon testowy może nastąpić dopiero po pozytywnym smoke teście. Nie ujawniaj
   identyfikatorów, tokenów, treści rozmowy ani danych klienta.
