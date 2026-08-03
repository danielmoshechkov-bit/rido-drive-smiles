# Audyt systemu agenta głosowego GetRido

> Dokument roboczy doprowadzony do stanu zgodnego z kodem na gałęzi
> `fix/voice-agent-latency-finalization`. Nie zawiera sekretów ani danych klientów.

## Zakres i ograniczenia

- Przeanalizowano ścieżkę `ElevenLabs → Custom LLM → AI Core → narzędzia → rezerwacja/zlecenie → webhook końcowy → baza → zakładka zlecenia`.
- W repozytorium nie ma pliku `AGENTS.md`; nie znaleziono dodatkowych instrukcji repozytorium.
- Nie wykonano push, deploy, zdalnej migracji, połączenia telefonicznego, SMS-u ani operacji na produkcyjnej bazie.
- Nie pobierano sekretów. Nie loguje się numerów telefonów, treści rozmów, tokenów ani danych klientów.

## Mapa rzeczywistego przepływu po poprawkach

1. ElevenLabs wywołuje `voice-agent-llm` w formacie OpenAI Chat Completions. `conversation_id` jest odczytywane z parametru/extra body lub z markera systemowego `GETRIDO_CONVERSATION_ID={{system__conversation_id}}`.
2. `voice-agent-llm` weryfikuje `VOICE_LLM_TOKEN`, pobiera konfigurację firmy i przekazuje żądanie do `voice-agent-chat`. Strumień SSE nie jest już buforowany: fragmenty tekstu Anthropic przechodzą od razu do ElevenLabs.
3. `voice-agent-chat` buduje prompt i równolegle pobiera sekret, personę i wiedzę. Wywołuje Anthropic strumieniowo, wykonuje narzędzia i przekazuje `conversation_id` do `voice-agent-tools`.
4. `voice-agent-tools` tworzy lub odnajduje `voice_calls` dla rozmowy. `create_booking` i `create_order` zapisują `voice_conversation_id`; unikalne indeksy i odczyt istniejącego rekordu chronią przed podwójną finalizacją. `booking_id` wyniku rezerwacji jest dopinane do zlecenia także wtedy, gdy model zwróci oba narzędzia w jednej turze.
5. ElevenLabs po zakończeniu wysyła zdarzenie `post_call_transcription` do `voice-call-postprocess`. Endpoint weryfikuje HMAC na surowym body, typ zdarzenia, `conversation_id` i zgodność `agent_id` z firmą.
6. Webhook parsuje transkrypcję, `analysis.transcript_summary`, wynik, metadane czasu i telefonu oraz identyfikatory z dynamic variables/data collection. Surowe dane zapisuje synchronicznie przez UPSERT do istniejących `voice_calls` i `voice_transcripts`.
7. Zlecenie jest szukane w kolejności: `voice_conversation_id` → jawny `order_id` w obrębie firmy → `booking_id` w obrębie firmy → telefon jako ograniczony czasowo fallback w obrębie firmy. Relacja jest zapisana jako `voice_calls.linked_entity_type='workshop_order'` i `linked_entity_id=<workshop_orders.id>`.
8. Opcjonalna analiza/uczenie (`voice-call-analyze`) działa po trwałym zapisie surowej rozmowy, poza krytyczną odpowiedzią webhooka. Aktualizuje ten sam rekord i nie usuwa gotowego podsumowania, gdy model zwróci niepełne dane.
9. `OrderCallPanel` czyta istniejącą relację `linked_entity_*`, potem `voice_transcripts.call_id` i `voice_call_outcomes.call_id`. Po otwarciu wykonuje ograniczone ponowienia odczytu, aby obsłużyć webhook przychodzący po utworzeniu/otwarciu zlecenia.

## Inwentarz elementów i odpowiedzialności

| Element | Odpowiedzialność i stan końcowy |
| --- | --- |
| `supabase/functions/voice-agent-llm/index.ts` | Autoryzowany adapter Custom LLM, ekstrakcja `conversation_id`, proxy prawdziwego SSE, timeout całej finalizacji i logi etapów. |
| `supabase/functions/voice-agent-chat/index.ts` | Prompt, wiedza, strumień Anthropic, wykonanie narzędzi, krótkie potwierdzenie pracy, zatrzymanie po błędzie bez zapętlenia. |
| `supabase/functions/_shared/anthropicSse.ts` | Testowalny parser przyrostowego SSE Anthropic i argumentów tool use. |
| `supabase/functions/voice-agent-tools/index.ts` | Dostępność, rezerwacja, zlecenie, idempotencja po rozmowie/rezerwacji, zachowanie `booking_id`, powiązanie rozmowy. SMS jest best-effort poza czasem odpowiedzi. |
| `supabase/functions/voice-call-postprocess/index.ts` | Końcowy webhook ElevenLabs: HMAC, parser oficjalnego payloadu, synchroniczny UPSERT surowej rozmowy i późniejsze powiązanie zlecenia. |
| `supabase/functions/_shared/voiceConversation.ts` | Wspólny parser i koordynator korelacji; używany przez kod produkcyjny i testy in-memory. |
| `supabase/functions/voice-call-analyze/index.ts` | Opcjonalne wzbogacenie istniejącej rozmowy i UPSERT wyniku; weryfikacja firmy dla użytkownika, rozmowy i zlecenia. |
| `supabase/functions/voice-agent-simulate/index.ts` | Istniejący trening self-play; domknięta weryfikacja dostępu do jawnego `provider_id`. |
| `supabase/functions/voice-agent-sync/index.ts` | Jawnie uruchamiana, autoryzowana synchronizacja timeoutów z ElevenLabs. Nie była uruchamiana w tym zadaniu. |
| `src/components/ai-sales/VoiceAgentPanel.tsx` | Istniejąca konfiguracja rozszerzona o Agent ID, timeout tury/ciszy i przycisk jawnej synchronizacji. |
| `src/components/workshop/OrderCallPanel.tsx` | Istniejąca zakładka; bez przebudowy, z obsługą błędów i race condition przez ograniczony polling. |
| `supabase/migrations/20260801090000_voice_conversation_finalization.sql` | Bezstratna konsolidacja historycznych duplikatów, kolumny korelacyjne, unikalność rozmowy/transkryptu/wyniku, indeks relacji i pola timeoutów. Migracji nie uruchamiano. |
| `voice_deduplication_archive` | Jedna chroniona RLS tabela techniczna przechowująca pełny JSON historycznych wierszy usuwanych lub modyfikowanych przez konsolidację. |
| `supabase/tests/voice_conversation_finalization_duplicates_*` | Syntetyczny fixture, walidator i instrukcja dwufazowego testu migracji na pustej bazie lokalnej/stagingowej. |
| `src/integrations/supabase/types.ts` | Typy odpowiadające nowym kolumnom i relacjom 1:1. |

## Globalna konfiguracja AI rozmów telefonicznych — stan zastany

| Element | Potwierdzona odpowiedzialność / problem |
| --- | --- |
| `AdminAIBrain` | Montuje trzy istniejące ekrany: „Dostawcy & API” (`AIHubPanel`), „Funkcje → AI” (`AIFunctionMappingPanel`) i „AI Voice Agent” (`AIVoiceAgentSettings`). Dostęp do strony jest ograniczony rolą admina. |
| `ai_providers` | Globalny rejestr dostawców: aktywność, `default_model`, timeout i legacy `api_key_encrypted`. Rekordy Claude Haiku/Sonnet/Opus istnieją. ElevenLabs istnieje tu jako STT/TTS i nie powinien sterować odpowiedzią LLM. |
| `ai_function_mapping` | Istniejący routing per funkcja: główny dostawca, `model_override`, zapasowy dostawca i `allow_fallback`. Rekord `voice_agent` już istnieje w kategorii `voice`, ale seed wskazuje ElevenLabs, a backend rozmowy go nie czyta. To jest właściwy rekord do ponownego użycia przez oba ekrany. |
| `ai_agents_config` | Model i prompt agentów systemowych. `voice_call_analyzer` jest właściwym, osobnym rekordem ciężkiej analizy po rozmowie. Rekordy person głosowych zawierają prompty, ale runtime rozmowy narzucał Sonnet niezależnie od globalnego routingu. |
| `AIFunctionMappingPanel` | Pokazuje `voice_agent`, lecz pozwala wpisać dowolny model tekstem i miesza ElevenLabs z dostawcami LLM. Zapisuje bezpośrednio przez PostgREST. |
| `AIVoiceAgentSettings` | Bezpieczny panel statusu/zapisu sekretów ElevenLabs/Twilio/Deepgram przez `admin-ai-secrets`; nie ma sekcji modelu rozmowy. |
| `AIVoiceAgentGlobalSettings` / `useAIVoiceGlobalSettings` | Nieużywana równoległa implementacja. Nie jest montowana w `AdminAIBrain`, a tabela `ai_voice_global_settings` nie występuje w migracjach. Nie należy jej rozwijać ani traktować jako źródła routingu. |
| `voice-agent-chat` | Prawdziwy streaming Anthropic i narzędzia już istnieją, lecz model jest wybierany z persony/`ai_agents_config`, następnie wymuszany na Sonnet; brak kontrolowanego fallbacku z `ai_function_mapping`. |
| `voice-call-analyze` | Oddzielna, wykonywana po trwałym zapisie rozmowy analiza przez `voice_call_analyzer`; nie należy łączyć jej z modelem bieżącej rozmowy. |
| `ai_secret_store` + `admin-ai-secrets` | Docelowy magazyn sekretów: deny-all dla frontu, status bez wartości, UPSERT nadpisujący poprzedni klucz, AES-GCM gdy ustawiono `AI_SECRETS_ENC_KEY`. |
| `AIHubPanel` | Krytyczny stan zastany: `select('*')` z `ai_providers` obejmuje `api_key_encrypted`, a UI zapisuje klucze bezpośrednio do tej tabeli. Mimo RLS admina wartość może wrócić przez PostgREST. Panel wymaga przełączenia na status/zapis przez `admin-ai-secrets` i jawny wybór bez kolumny sekretu. |

Minimalna decyzja: jeden rekord `ai_function_mapping.voice_agent` jest źródłem głównego/zapasowego dostawcy i modelu oraz egzekwowanych limitów rozmowy. Oba ekrany używają tego samego komponentu i admin-only Edge Function. Dostawca jest dopuszczany wyłącznie przez jawny rejestr kompletnego adaptera rozmowy; ElevenLabs pozostaje warstwą głosu. Model analizy pozostaje osobnym `ai_agents_config.voice_call_analyzer`.

## Globalna konfiguracja AI rozmów — implementacja

| Element | Stan po poprawce |
| --- | --- |
| `ai_function_mapping.voice_agent` | Jedyne źródło routingu bieżącej rozmowy. Przechowuje głównego i zapasowego dostawcę/model, auto-fallback, timeout modelu, maksymalną liczbę rund narzędzi i limit tokenów. |
| `admin-voice-ai-routing` | Admin-only odczyt i zapis tego rekordu. Waliduje rolę, aktywność dostawcy, obecność i możliwość odszyfrowania sekretu, zgodność modelu z aktywnym modelem dostawcy oraz zakresy limitów. Nie zwraca sekretów. |
| `VoiceConversationModelSettings` | Jeden współdzielony komponent zamontowany w „Funkcje → AI” i „AI Voice Agent”. Oba miejsca używają tego samego query key, endpointu i rekordu, więc zapis unieważnia wspólny cache. |
| `voice-agent-chat` | Czyta routing przed rozmową. Domyślnie wybiera aktywny Sonnet, następnie Haiku/Opus/OpenAI, jeżeli rekord historyczny jest nieobsługiwany. Pobiera wyłącznie sekret przypisany do wybranego adaptera i przekazuje kanoniczną historię narzędzi do adaptera Anthropic lub OpenAI. |
| `_shared/voiceAiRouting.ts` | Jawny rejestr capabilities. Rekord dostawcy kwalifikuje się dopiero, gdy adapter deklaruje i implementuje streaming, tool calling, timeout i bezpieczny fallback, a model przechodzi ścisły filtr tekstowej rozmowy. |
| `_shared/voiceModelAdapters.ts` | Wspólny adapter protokołów Anthropic Messages SSE i OpenAI Chat Completions SSE. Konwertuje jedną kanoniczną historię rozmowy/narzędzi, dzięki czemu fallback między dostawcami nie powtarza wykonanych narzędzi. |
| fallback | Następuje tylko przed wysłaniem pierwszego fragmentu tekstu. Po rozpoczęciu strumienia model nie jest zmieniany, aby nie dublować wypowiedzi ani wywołań narzędzi. Dokładne wyniki narzędzi są cache’owane w obrębie tury, a operacje tworzące mają dodatkową idempotencję rozmowy/bazy. |
| SSE i pomiary | Anthropic jest parsowany przyrostowo; `voice-agent-chat` i proxy `voice-agent-llm` zwracają `no-cache, no-transform` oraz `X-Accel-Buffering: no`. Logi zapisują `prepare`, `first_text`, rundę modelu, fallback, narzędzie i total bez treści rozmowy/telefonu/sekretu. |
| kontekst | Do modelu trafia najwyżej 12 ostatnich wiadomości bieżącej rozmowy; ciężka analiza pozostaje po webhooku w `voice-call-analyze`. |
| migracja `20260802090000_voice_ai_global_routing.sql` | Dodaje pola i ograniczenia do istniejącej tabeli oraz blokuje bezpośredni zapis `voice_agent` z przeglądarki. Dla bezpieczeństwa production canary `ON CONFLICT DO NOTHING`: istniejący rekord, dostawca i model nie są automatycznie przepisywane. Legacy `ai_providers.api_key_encrypted` zostaje w bazie dla zgodności serwerowej, ale traci uprawnienie SELECT dla `authenticated`. |

Lista modeli jest ograniczona do aktywnych rekordów `claude_haiku`, `claude_sonnet`, `claude_opus`, `openai`, `openai_gpt4o` i `openai_mini`, których `default_model` pasuje do odpowiedniego adaptera. Anthropic używa Messages SSE, a OpenAI Chat Completions SSE; oba mają streaming, narzędzia, timeout i blokadę fallbacku po pierwszym fragmencie tekstu. Gemini/Kimi nie są pokazywane, ponieważ znalezione implementacje rozdzielają streaming i tool calling i nie stanowią kompletnego adaptera rozmowy. ElevenLabs/STT/TTS oraz Imagen/modele graficzne są jawnie wykluczone.

## Bezpieczny podgląd developerski routingu

- Podgląd jest dostępny pod rzeczywistymi adresami zakładek z parametrem `voicePreview=1`: `/admin/ai?tab=mapping&voicePreview=1` oraz `/admin/ai?tab=voice-agent&voicePreview=1`. Legacy `/dev/voice-ai-routing-preview` pozostaje skrótem. Wszystkie warianty są rozpoznawane wyłącznie w warunku `import.meta.env.DEV`; komponent jest ładowany dynamicznie i nie trafia do produkcyjnego builda.
- Podgląd renderuje kartę „Funkcje → AI · Głos” oraz pełną sekcję „AI Voice Agent → Model sterujący rozmową” z tego samego obiektu `voiceAiRoutingPreviewData`.
- Dane są syntetyczne i nie zawierają sekretów. Pokazują skonfigurowane Anthropic/OpenAI oraz przykład kompatybilnego, ale nieskonfigurowanego rekordu.
- Query routingu otrzymuje `enabled=false`, mutacja odrzuca wywołanie, a przycisk zapisu jest zablokowany. Strona podglądu nie importuje ani nie wywołuje klienta Supabase. Normalne ekrany nie używają fixture i nadal pokazują błąd backendu fail-closed.

Ustawienia ciszy pozostają per firma w `voice_agent_configs` (`soft_timeout_seconds`, `turn_timeout_seconds`, `silence_end_call_timeout_seconds`) i są egzekwowane po jawnej synchronizacji `voice-agent-sync`. Repozytorium nie ma obecnie trwałego pola „ostatnia synchronizacja” ani niezależnego health-checku webhooka. Nie dodano atrap globalnego statusu; jest to jawny brak operacyjny do ewentualnej osobnej implementacji.

## Izolacja production canary

- Wspólny helper `_shared/voiceProductionCanary.ts` wymaga kill switcha oraz dokładnej zgodności `provider_id` i `elevenlabs_agent_id`. Brak dowolnej zmiennej jest stanem wyłączonym; decyzja ani logi nie zwracają identyfikatorów.
- `voice-agent-llm` i `voice-agent-chat` pobierają Agent ID z `voice_agent_configs`. Tylko zgodna para dostaje prawdziwe SSE, `conversation_id`, globalny routing oraz fallback. Pozostali agenci zachowują fixed Anthropic/Sonnet bez fallbacku i nie odczytują rekordu routingu.
- `voice-agent-tools` ignoruje `conversation_id` poza zgodną parą, więc nowe kolumny korelacyjne, tworzenie `voice_calls` i idempotencja rozmowy nie są aktywowane przez pozostałych agentów.
- `voice-call-postprocess` ustala parę z podpisanego payloadu ElevenLabs, a następnie ponownie porównuje Agent ID z konfiguracją firmy. Pozostałe webhooki zachowują dotychczasowy kontrakt przekazania transkryptu do analizatora.
- `voice-agent-sync` odrzuca odczyt/PATCH ElevenLabs dla każdej pary poza aktywnym canary; samo uprawnienie administratora nie omija bramki.
- Migracja routingu nie zmienia istniejącego rekordu `voice_agent`; administrator wybiera model jawnie. Zmiana jest globalna w panelu, ale wykonawczo czyta ją wyłącznie canary.
- Read-only preflight, niedestrukcyjny rollback schematu i checklista jednej rozmowy są opisane w `docs/voice-agent-production-canary.md`. Skrypty nie zawierają rzeczywistych identyfikatorów.

## Sekrety, szyfrowanie i rotacja

- Docelowy magazyn to istniejące `ai_secret_store`: RLS bez polityk dla klienta, `REVOKE` dla `PUBLIC`, `anon` i `authenticated`, dostęp wyłącznie przez `service_role` po weryfikacji admina w `admin-ai-secrets`.
- `AIHubPanel` nie wykonuje już `select('*')` na `ai_providers` ani nie pobiera `api_key_encrypted`. Przeglądarka otrzymuje wyłącznie status `is_set`, źródło, stan szyfrowania, możliwość odszyfrowania i datę aktualizacji.
- Zapis używa UPSERT po `secret_key`; nowa wartość nadpisuje poprzednią bez jej odczytu lub ujawnienia. Cache serwera jest odświeżany nową wartością i wygasa po 30 sekundach.
- Bez `AI_SECRETS_ENC_KEY` nowe wartości są zapisane jawnie w chronionej tabeli (`is_encrypted=false`), dlatego ostrzeżenie panelu jest zasadne. Sam RLS nie zastępuje szyfrowania kopii zapasowej/dysku.
- Odczyt szyfrogramu próbuje najpierw `AI_SECRETS_ENC_KEY`, potem `AI_SECRETS_ENC_KEY_PREVIOUS`. Status odróżnia sekret zapisany, ale niemożliwy do odszyfrowania; taki sekret nie kwalifikuje modelu do routingu.
- Admin-only akcja `rotate` wymaga `confirm=ROTATE_AI_SECRETS`, odszyfrowuje wszystkie wiersze przed pierwszym zapisem, a następnie szyfruje je bieżącym kluczem. Nie zwraca ani nie loguje wartości. Rotacja jest wznawialna: w trakcie mieszanego stanu oba klucze pozostają czytelne.

Bezpieczna procedura stagingowa włączenia/rotacji:

1. Wygenerować losowy, dedykowany wyłącznie stagingowi `AI_SECRETS_ENC_KEY` poza repozytorium i ustawić go w managerze sekretów Edge. Nie wpisywać wartości do panelu, logów ani dokumentu.
2. Przy pierwszym włączeniu wywołać admin-only `rotate` z jawnym potwierdzeniem; zaszyfruje to także historyczne wiersze plaintext. Sprawdzić statusy (`is_encrypted=true`, `is_readable=true`) i odczyty funkcji na syntetycznym koncie.
3. Przy zmianie klucza ustawić stary jako `AI_SECRETS_ENC_KEY_PREVIOUS`, nowy jako `AI_SECRETS_ENC_KEY`, uruchomić rotację i potwierdzić liczbę/status wszystkich wierszy. Dopiero po testach usunąć poprzedni klucz.
4. Zachować poprzedni klucz do czasu zakończenia walidacji i kopii bezpieczeństwa; przerwaną rotację można powtórzyć. Nigdy nie wykonywać rotacji bez potwierdzonej możliwości odszyfrowania wszystkich rekordów.

## Identyfikatory i miejsce zapisu

| Identyfikator | Źródło | Zapis/użycie |
| --- | --- | --- |
| `provider_id` | URL/config GetRido | Obowiązkowa granica tenanta we wszystkich zapytaniach i aktualizacjach. |
| `conversation_id` | ElevenLabs `data.conversation_id` / `system__conversation_id` | `voice_calls.elevenlabs_conversation_id`, `service_bookings.voice_conversation_id`, `workshop_orders.voice_conversation_id`. |
| `call_id` | `voice_calls.id` | FK logiczny dla `voice_transcripts.call_id` i `voice_call_outcomes.call_id`. |
| `booking_id` | `service_bookings.id` | `workshop_orders.booking_id`; fallback korelacji webhooka. |
| `order_id` | `workshop_orders.id` | `voice_calls.linked_entity_id`, gdy `linked_entity_type='workshop_order'`. |
| telefon klienta | `metadata.phone_call.external_number` | Wyłącznie fallback korelacyjny, normalizowany i filtrowany po `provider_id`; nigdy nie jest logowany. |
| `agent_id` | payload ElevenLabs | Porównanie z `voice_agent_configs.elevenlabs_agent_id` przed zapisem. |

## Potwierdzone przyczyny pierwotne

1. Kod ignorował `conversation_id`, choć kolumna `voice_calls.elevenlabs_conversation_id` już istniała. Narzędzia i webhook nie miały wspólnego, deterministycznego klucza.
2. Webhook przekazywał jedynie transkrypt do `voice-call-analyze`; nie zapisywał go przed zewnętrzną analizą. Timeout/brak klucza/błąd JSON/wyłączone uczenie oznaczały brak rozmowy w bazie.
3. Analizator zawsze tworzył nowe `voice_calls`; retry webhooka tworzył duplikaty. Brakowało unikalności i UPSERT po rozmowie/call ID.
4. `order_id` i fallbacki nie były konsekwentnie weryfikowane po `provider_id`, co groziło błędnym powiązaniem między firmami.
5. Race condition działał tylko w jedną stronę: utworzone zlecenie nie potrafiło dopiąć webhooka zapisanego wcześniej, a późniejszy webhook nie znał rozmowy z narzędzi.
6. Adapter deklarował SSE, ale czekał na pełną odpowiedź wewnętrznej funkcji. Do tego odczyty konfiguracji były sekwencyjne, a SMS blokował odpowiedź `create_booking`.
7. Wynik `create_booking` nie był automatycznie przekazywany do `create_order`; model mógł tworzyć niepowiązane rekordy lub ponawiać narzędzia. Szeroki dedup „dowolne zlecenie klienta w 15 minut” potrafił zwrócić fałszywy duplikat.
8. Nie było zarządzanego `silence_end_call_timeout`, więc brak odpowiedzi klienta mógł nie kończyć rozmowy.

## Decyzje implementacyjne

- Ponownie wykorzystano `voice_calls`, `voice_transcripts`, `voice_call_outcomes`, `linked_entity_*` i istniejący widok. Nie utworzono drugiej tabeli rozmów ani drugiej zakładki.
- Surowy webhook jest źródłem trwałego zapisu; analiza Anthropic jest opcjonalnym wzbogaceniem, nie warunkiem dostępności transkrypcji.
- Idempotencja jest dwuwarstwowa: unikalność w bazie i odczyt/UPSERT w kodzie. Race na INSERT obsługuje błąd `23505` i odczytuje zwycięski rekord.
- Historyczne duplikaty są konsolidowane deterministycznie przed indeksami: rozmowa powiązana ze zleceniem/completed/najnowsza zachowuje `conversation_id`, a pozostałe rekordy rozmów pozostają wraz ze swoimi relacjami, lecz po zarchiwizowaniu pełnego wiersza mają czyszczony tylko kolidujący identyfikator. Dla transkryptu wygrywa najnowszy `created_at/id`, a dla analizy najnowszy `analyzed_at/created_at/id`; pełny JSON każdej starszej wersji trafia do jednej chronionej RLS tabeli `voice_deduplication_archive` przed usunięciem nadmiarowego wiersza.
- Każda aktualizacja/usunięcie duplikatu jest warunkowane joinem do zgodnego wpisu archiwalnego (`source_id`, `canonical_id`, `row_data.id`). Końcowy blok SQL wymaga braku wszystkich grup duplikatów przed `CREATE UNIQUE INDEX`; brak lub niezgodność archiwum pozostawia duplikat, więc kontrola przerywa i wycofuje transakcję. Właściciel wpisu archiwalnego jest zawsze wyprowadzany z `voice_calls.provider_id`, a nie z denormalizowanego pola transkryptu/analizy; FK i RLS nie pozwalają przypisać archiwum innej firmie.
- Migracja ma 239 linii. Powtarzalne bloki dla rozmów, transkryptów i analiz pozostawiono jawnie, ponieważ mają różne zasady wyboru rekordu kanonicznego i różne bezpieczne operacje końcowe. Wspólna abstrakcja dynamicznego SQL skróciłaby plik kosztem czytelności oraz kontroli typów i nie została wprowadzona.
- Test wykonawczy migracji musi działać jako pojedyncza transakcja (`psql -1 -v ON_ERROR_STOP=1`), ponieważ blokada tabel i tymczasowe mapy duplikatów obejmują cały plik. Fixture i walidator używają wyłącznie stałych danych syntetycznych.
- Dokładne `conversation_id` ma pierwszeństwo. Telefon pozostaje fallbackiem dla zgodności wstecznej, zawsze ograniczonym firmą i czasem.
- Po pierwszym błędzie narzędzie nie jest ponawiane w tej turze. Odpowiedź dla klienta jest jednoznaczna, a log nie zawiera treści błędu zewnętrznego ani danych klienta.
- Timeouty etapów: model 15 s, narzędzie 12 s, cała strumieniowa finalizacja 45 s; rzeczywisty `first_text` i czasy etapów są logowane bez PII.
- Domyślne ustawienia ElevenLabs: timeout tury 7 s, komunikat oczekiwania po 3 s, zakończenie po 60 s ciszy. Zewnętrzny PATCH wymaga jawnej akcji uprawnionego użytkownika.
- Cache sekretów żyje wyłącznie w pamięci izolatu przez 30 s; wartości nie są zwracane ani logowane.
- Zapytanie o konfigurację tenanta w `voice-agent-llm` jest wykonywane dopiero po poprawnej autoryzacji; nieautoryzowane żądanie nie uruchamia zapytań po danych firmy.
- Konflikt `23505` między rekordem rozmowy utworzonym przez narzędzie a końcowym webhookiem kończy się ponownym, ograniczonym firmą `UPDATE`, więc rekord otrzymuje końcowy status i metadane bez utworzenia duplikatu.

## Minimalny Phase 1 production canary bez migracji

Po ponownym prześledzeniu grafu importów zakres został zawężony do dwóch
entrypointów: `voice-agent-chat` i `voice-agent-llm`. Pełny mechanizm routingu,
panel, transkrypcja/finalizacja, synchronizacja ElevenLabs i zmienione narzędzia
nie należą do Phase 1.

- Wspólny fail-closed gate wymaga kill switcha oraz zgodności `provider_id` i
  Agent ID odczytanego z istniejącego `voice_agent_configs`.
- Chat nie czyta nowych rekordów routingu. Canary używa obecnego Sonnetu z
  `ai_agents_config` i stałego, już zarejestrowanego Haiku jako fallbacku; oba
  korzystają z obecnego `ANTHROPIC_API_KEY`.
- Niecanary wykonuje osobną gałąź legacy: JSON bez SSE/fallbacku/nowego timeoutu,
  pięć rund, 600 tokenów i dotychczasowe body do produkcyjnego
  `voice-agent-tools`.
- Importy wdrożeniowe wyizolowano w małych modułach `voicePhase1*`. Dzięki temu
  bundle nie zawiera nowego schematu globalnego routingu, zmienionej rotacji
  sekretów ani klientów tłumaczeń.
- Przerwanie klienta anuluje upstream i zabrania fallbacku; przed wywołaniem
  każdego narzędzia sygnał jest ponownie sprawdzany. Po pierwszym wysłanym
  tekście fallback również jest zabroniony, co zapobiega podwójnej odpowiedzi.
- Dokładny zakres, dowód istniejącego schematu, bloby rollbacku, kolejność oraz
  kryteria stop są w `docs/voice-agent-phase1-canary.md`.

## Testy lokalne i wynik

Uruchomiono:

```text
npm run test:voice
```

Wynik końcowy po wydzieleniu Phase 1: **38/38 testów przeszło**. Testy obejmują:

- przyrostowe SSE oraz składanie argumentów narzędzia,
- odczyt i walidację `conversation_id`,
- brak degradacji relacji zlecenia przy ponowieniu rezerwacji,
- webhook przed utworzeniem zlecenia,
- webhook po utworzeniu zlecenia,
- ponowne dostarczenie tego samego webhooka bez duplikatu,
- transkrypcję bez podsumowania,
- odmowę powiązania rozmowy i zlecenia różnych firm.
- kontrolę kolejności migracji: archiwizacja i końcowa kontrola integralności muszą poprzedzać indeksy unikalne, a historyczne `voice_calls` nie mogą być usuwane,
- kontrolę fixture PostgreSQL: trzy rodzaje duplikatów, zachowanie pełnego transkryptu/podsumowania/wyniku oraz uruchomienie całego pliku w jednej transakcji.
- wybór aktywnego dostawcy/modelu i domyślny Sonnet,
- odrzucenie nieaktywnego, nieobsługiwanego lub nieskonfigurowanego modelu,
- fallback po błędzie/timeoucie oraz zakaz zmiany modelu po rozpoczęciu strumienia,
- admin-only routing, jeden komponent/rekord dla obu ekranów i brak sekretów w odpowiedzi/UI,
- nadpisanie sekretu przez UPSERT bez zwracania wartości,
- nagłówki antybuforujące na obu warstwach SSE i log `first_text`.
- jawne capabilities, wybór Anthropic/OpenAI oraz automatyczne pojawienie się testowego dostawcy dopiero po rejestracji kompletnego adaptera,
- odrzucenie ElevenLabs, STT/TTS, Gemini bez adaptera oraz modeli graficznych,
- parser OpenAI SSE, składanie fragmentów tool call, kanoniczną historię narzędzi i brak ponownego tekstu po rozpoczęciu strumienia,
- lokalny podgląd bez query/mutacji i wspólny syntetyczny rekord obu ekranów.
- potrójny fail-closed gate canary, brak nowych tabel/kolumn w jego grafie
  importów, prawdziwy Anthropic SSE, pojedynczy fallback przed tekstem oraz brak
  fallbacku/narzędzia po przerwaniu klienta.
- zgodność URL-a Custom LLM ElevenLabs w formacie ścieżki oraz legacy query stringu.

`git diff --check`, `npm run typecheck`, produkcyjny `npm run build` oraz celowany ESLint nowych plików routingu przechodzą bez błędów. Kontrola produkcyjnego `dist` potwierdziła brak ścieżki, etykiety i chunku podglądu. Pliki TypeScript używane w testach są parsowane i wykonywane przez Node 23 (z ostrzeżeniem o eksperymentalnym type stripping).

Migracja zawiera wykonywaną na docelowej bazie kontrolę SQL dla realnych duplikatów: tymczasowe mapy zapamiętują każdy historyczny i kanoniczny ID, pełny wiersz jest archiwizowany jako JSONB, mutacja wymaga zgodnego archiwum, a końcowy blok `DO` przerywa transakcję przed indeksami, jeśli kardynalność jest niezgodna. Lokalnego wykonania obu nowych migracji w PostgreSQL nie przeprowadzono; w Phase 1 świadomie nie uruchamiano Dockera, Supabase, migracji ani zewnętrznej bazy. Migracje pozostają **niezweryfikowane wykonawczo**; przeszły kontrole strukturalne SQL i fixture, nie realny parser/serwer PostgreSQL.

Zależności zainstalowano wcześniej wyłącznie przez `npm ci`; lockfile nie został zmieniony. Deno i `psql` nie są zainstalowane. W Phase 1 Edge Functions ani migracje nie zostały uruchomione wykonawczo. Zastępujące testy czystej logiki używają syntetycznych `Response`/fixture i nie wykonują operacji zewnętrznych.

## Pozostałe ryzyka

- Migracja nie została zastosowana do kopii danych. Zawiera obsługę duplikatów `conversation_id`, `voice_transcripts.call_id` i `voice_call_outcomes.call_id`, ale jej zachowanie należy jeszcze potwierdzić na anonimowej kopii schematu stagingowego przed rolloutem.
- Fallback po telefonie może być niejednoznaczny, gdy ten sam klient ma kilka zleceń w tej samej firmie w ciągu dwóch godzin. Marker `system__conversation_id` usuwa tę niejednoznaczność i powinien być obowiązkowy na stagingu.
- Nie zweryfikowano rzeczywistego czasu pierwszego audio ani zachowania `EdgeRuntime.waitUntil`; wymagają one kontrolowanego środowiska Edge i testowego agenta ElevenLabs.
- Asynchroniczny SMS jest best-effort. Jego błąd nie blokuje rezerwacji, ale powinien być monitorowany osobnym logiem/metryką.
- Ograniczone ponowienia zakładki kończą się po dwóch minutach; po dłuższej awarii webhooka potrzebne jest odświeżenie widoku lub mechanizm operacyjnego replay.
- Anthropic i OpenAI mają kompletne adaptery rozmowy. Gemini/Kimi oraz każdy kolejny dostawca wymagają implementacji i rejestracji równoważnego adaptera z testami, zanim pojawią się w selektorze.
- `ai_providers.api_key_encrypted` pozostaje jako legacy dla istniejących Edge Functions uruchamianych z `service_role`; przeglądarka nie ma już do tej kolumny uprawnień. Pełne wycofanie legacy wymaga osobnego audytu wszystkich konsumentów serwerowych.
- Nie ma trwałej daty ostatniej synchronizacji ElevenLabs ani automatycznego health-checku webhooka. Panel nie udaje, że taki status istnieje.

## Plan bezpiecznego testu stagingowego

1. Utworzyć anonimowy tenant i testowego agenta/numery; użyć wyłącznie danych syntetycznych. Włączyć osobne stagingowe sekrety, nigdy produkcyjne.
2. Na kopii schematu wykonać preflight duplikatów, zastosować migrację i sprawdzić indeksy/ograniczenia. Nie kopiować treści rozmów klientów.
3. Skonfigurować Custom LLM i post-call webhook na staging oraz marker `GETRIDO_CONVERSATION_ID={{system__conversation_id}}`. Ustawić stagingowy Agent ID w panelu.
4. Jawnie zsynchronizować timeouty (7/3/60 s), następnie odczytać konfigurację ElevenLabs i potwierdzić wartości bez wykonywania połączenia produkcyjnego.
5. Wysłać podpisane, syntetyczne payloady webhooka dla pięciu scenariuszy testowych. Sprawdzić liczbę rekordów, identyczne `call_id`, relację firmy i zawartość istniejącej zakładki.
6. Zasymulować kolejności: webhook → order oraz order → webhook, równoległy retry i timeout analizatora. Surowa transkrypcja musi być widoczna także przy niedostępnym Anthropic.
7. Dopiero potem wykonać jedno kontrolowane połączenie stagingowe między testowymi numerami. Zmierzyć `auth`, `config`, `prepare`, `first_text`, rundy modelu, narzędzia, zapis webhooka i całkowity czas; sprawdzić automatyczne rozłączenie po 60 s ciszy.
8. Potwierdzić, że retry nie tworzy drugiej rezerwacji/zlecenia/rozmowy, SMS trafia wyłącznie do testowego sinka, a tenant B nie może odczytać ani powiązać danych tenanta A.
9. Zastosować migrację routingu na lokalnej/stagingowej bazie i sprawdzić: dokładnie jeden `voice_agent`, ograniczenia zakresów, brak SELECT do `api_key_encrypted` dla `authenticated` oraz możliwość edycji innych mapowań przez admina.
10. Ustawić wyłącznie stagingowe klucze Anthropic/OpenAI, aktywować Sonnet, Haiku i GPT-4o, a następnie z obu ekranów na zmianę zapisać routing. Potwierdzić ten sam `id/updated_at`, odrzucenie Gemini/wyłączonego modelu i działanie timeout→fallback na kontrolowanym mocku upstreamu.
11. Włączyć/obrócić szyfrowanie według procedury powyżej, potwierdzić brak wartości sekretów w odpowiedziach sieciowych oraz to, że zwykły użytkownik otrzymuje 403 przy zapisie routingu i sekretów.

## Referencje kontraktu ElevenLabs

- Post-call webhook: `type=post_call_transcription`, `data.conversation_id`, transkrypt, metadane i `analysis.transcript_summary`.
- Dynamiczna zmienna systemowa: `system__conversation_id`.
- Ustawienia turn: `turn_timeout`, `soft_timeout_config`, `silence_end_call_timeout`.
