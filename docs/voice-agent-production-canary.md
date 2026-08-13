# Production canary agenta głosowego — runbook bez wykonania

> Ten dokument opisuje odroczony, pełny rollout z migracjami i finalizacją.
> Nie jest runbookiem bieżącego Phase 1. Minimalny canary bez migracji jest
> opisany w `docs/voice-agent-phase1-canary.md`; jego zakres to wyłącznie
> `voice-agent-chat` i `voice-agent-llm`. Fragmenty poniżej o globalnym routingu,
> transkrypcji i synchronizacji nie są przeznaczone do wdrożenia w Phase 1.

Ten dokument przygotowuje kontrolowany canary na istniejącym torze
`SuperVoIP → SIP trunk → ElevenLabs → GetRido`. Nie zawiera wartości
`provider_id`, `elevenlabs_agent_id`, numeru telefonu ani sekretów. W ramach
przygotowania nie wykonano wdrożenia, migracji, zmiany sekretów, synchronizacji
ElevenLabs ani połączenia.

## Granica canary i zgodność wsteczna

Nowa ścieżka wymaga jednocześnie:

1. `VOICE_PRODUCTION_CANARY_ENABLED=true`,
2. zgodności `provider_id` z `VOICE_PRODUCTION_CANARY_PROVIDER_ID`,
3. zgodności Agent ID z `VOICE_PRODUCTION_CANARY_ELEVENLABS_AGENT_ID`.

Brak dowolnej wartości, literówka albo niezgodność jednego identyfikatora
wyłącza canary. Identyfikatory nie są logowane. Agent ID pochodzi z
`voice_agent_configs` albo ze zweryfikowanego podpisem payloadu ElevenLabs, a
nie z flagi przeglądarki.

- `voice-agent-llm`: tylko canary przekazuje `conversation_id` i korzysta z
  niebuforowanego SSE; pozostali zachowują buforowany kontrakt.
- `voice-agent-chat`: tylko canary czyta globalny routing i może użyć fallbacku;
  pozostali zachowują Anthropic/Sonnet bez fallbacku i pełny kontekst legacy.
- `voice-agent-tools`: tylko canary używa korelacji oraz idempotencji po
  `conversation_id`; parametr podany poza właściwą parą jest ignorowany.
- `voice-call-postprocess`: tylko podpisany webhook właściwej pary używa nowego
  trwałego UPSERT-u i relacji ze zleceniem; pozostałe payloady idą istniejącą
  ścieżką analizy.
- `voice-agent-sync`: odczyt i PATCH timeoutów ElevenLabs jest odrzucany dla
  każdej pary poza aktywnym canary, również dla administratora.
- Migracja routingu nie nadpisuje istniejącego `voice_agent`. Globalny rekord
  może zostać ustawiony przez admina, ale runtime odczyta go tylko dla canary.

Kill switch jest pierwszym mechanizmem rollbacku. Nie może być zastąpiony
parametrem URL ani stanem UI.

## Preflight migracji — warunek wejścia

1. Utrwalić identyfikator poprzedniego, znanego dobrego wydania każdej Edge
   Function oraz eksport DDL dwóch planowanych migracji. Nie kopiować sekretów
   do plików roboczych.
2. Wykonać backup/snapshot bazy zgodny z procedurą produkcyjną i potwierdzić
   możliwość odtworzenia. Samo istnienie automatycznego backupu nie wystarcza.
3. Na osobnej, jednorazowej bazie PostgreSQL z tym samym schematem wykonać
   fixture duplikatów, migrację finalizacji i walidator z
   `voice_conversation_finalization_duplicates_README.md`.
4. Na produkcji uruchomić tylko odczytowy
   `voice_production_canary_preflight.sql` przez `psql -X -v ON_ERROR_STOP=1`,
   przekazując oba identyfikatory z bezpiecznego kontekstu operatora. Skrypt nie
   wypisuje ich, używa transakcji `READ ONLY` i kończy `ROLLBACK`.
5. Zatrzymać rollout, jeżeli para nie jest dokładnie jedna, Agent ID występuje
   przy innej firmie, konfiguracja nie jest aktywna/prywatnościowa, istnieją
   orphan records, migracja wygląda na częściowo wykonaną albo są transakcje
   starsze niż 60 sekund. Liczby historycznych duplikatów są informacyjne:
   migracja archiwizuje je, ale operator musi oszacować czas blokady z rozmiaru
   tabel i ich liczby.
6. Zaplanować okno bez długich transakcji. Migracja bierze
   `SHARE ROW EXCLUSIVE` na trzech tabelach; nie uruchamiać jej przy wzmożonym
   ruchu telefonicznym lub zapisie zleceń.

Migracja `20260801090000_voice_conversation_finalization.sql` pozostaje
niezweryfikowana wykonawczo w tym worktree: brak działającego lokalnego
PostgreSQL. Kontrole statyczne i fixture nie zastępują wykonania na serwerze.

## Kolejność ewentualnego rolloutu

Poniższa kolejność jest instrukcją dla osobnego, zatwierdzonego okna; nie była
wykonywana:

1. Ustawić trzy zmienne canary z kill switchem wyłączonym.
2. Uruchomić preflight i próbę migracji na jednorazowej bazie, następnie backup.
3. Zastosować kolejno migrację finalizacji i migrację globalnego routingu.
4. Sprawdzić indeksy, ograniczenia, pełną liczbę wpisów archiwum oraz brak grup
   duplikatów. Nie usuwać `voice_deduplication_archive`.
5. Wdrożyć najpierw funkcje wewnętrzne i shared code, potem ingress
   `voice-agent-llm` i na końcu `voice-call-postprocess`; kill switch nadal off.
6. Smoke test bez mutacji: health endpoint, odczyt konfiguracji oraz potwierdzenie
   w logach, że zwykły ruch ma `production_canary=false`. Logi nie mogą zawierać
   numerów, treści, tokenów ani identyfikatorów pary.
7. W panelu admina jawnie ustawić główny/zapasowy LLM, timeout i limity. Zmiana
   rekordu jest globalna administracyjnie, ale wykonawczo odczyta ją tylko canary.
8. Włączyć kill switch. Nie zmieniać URL-i pozostałych agentów i nie uruchamiać
   masowej synchronizacji ElevenLabs.
9. Wykonać dokładnie jedną kontrolowaną rozmowę z numeru operatora na istniejący
   numer testowy, z syntetycznymi danymi i kontrolowanym numerem kontaktowym.

## Checklista jednej rozmowy

Przed rozmową:

- [ ] backup, preflight, obie migracje i postflight zakończone bez ostrzeżeń;
- [ ] zapisane poprzednie wersje funkcji i wartości ustawień wyłącznie testowego agenta;
- [ ] kill switch aktywuje dokładnie jedną parę, a Agent ID nie jest współdzielony;
- [ ] `calendar_access`, `orders_access`, `privacy_confirmed` i agent są aktywne;
- [ ] wybrany termin testu nie koliduje z realnym kalendarzem; dane klienta,
      telefon kontaktowy i pojazd są kontrolowane przez testera;
- [ ] odbiorca ewentualnego SMS-a jest testerem; nie używać danych klienta;
- [ ] obserwowane są wyłącznie metryki bez PII: `auth`, `config`, `prepare`,
      `first_text`, `model_round`, `tool`, `persist`, `total`.

W rozmowie:

- [ ] zmierzyć czas od końca wypowiedzi testera do pierwszego zrozumiałego audio;
- [ ] podać syntetyczną usterkę i zapytać o jeden dostępny termin;
- [ ] zaakceptować termin i podać komplet syntetycznych danych tylko raz;
- [ ] usłyszeć jedno potwierdzenie rezerwacji i zlecenia, bez zapętlenia;
- [ ] po finalizacji zadać krótkie pytanie kontrolne — agent nie może ponowić narzędzi;
- [ ] następnie milczeć: sprawdzić komunikat po krótkiej ciszy i automatyczne
      zakończenie po skonfigurowanej długiej ciszy.

Po rozmowie:

- [ ] dokładnie jedna rezerwacja i jedno zlecenie dla rozmowy;
- [ ] zlecenie zachowało `booking_id` i `voice_conversation_id`;
- [ ] dokładnie jeden `voice_calls` dla pary firma/rozmowa, maksymalnie jeden
      transkrypt i jeden wynik analizy;
- [ ] `voice_calls.linked_entity_*` wskazuje właściwe zlecenie tej samej firmy;
- [ ] zakładka „Rozmowa telefoniczna” pokazuje pełny zapis oraz podsumowanie;
- [ ] webhook bez podsumowania nadal pozostawia transkrypt;
- [ ] retry webhooka nie zmienia liczby rekordów ani relacji;
- [ ] logi nie zawierają danych klienta i nie pokazują aktywacji canary dla innej firmy;
- [ ] `first_text` jest poniżej 2,5 s; timeout/fallback nie powiela tekstu ani narzędzi.

Natychmiast przerwać canary przy błędnym tenancie, drugim zleceniu/rezerwacji,
braku transkryptu, zapętleniu narzędzi, PII w logach, błędzie migracji lub serii
5xx. Pojedyncze przekroczenie 2,5 s wymaga analizy przed kolejną rozmową.

## Dokładny rollback

Rollback operacyjny, wykonywany w tej kolejności:

1. Ustawić `VOICE_PRODUCTION_CANARY_ENABLED=false`. To natychmiast kieruje także
   testową parę na kontrakt legacy; pozostałe pary nigdy nie były w canary.
2. Nie ponawiać rozmowy. Zanotować wyłącznie `conversation_id` w chronionym
   incydencie, bez treści i danych klienta.
3. Przywrócić poprzednie wersje ingressów w kolejności
   `voice-call-postprocess`, `voice-agent-llm`, potem funkcji wewnętrznych
   `voice-agent-chat`, `voice-agent-tools`, `voice-call-analyze`. Nie mieszać
   wersji shared modules z nowymi entrypointami.
4. Przywrócić zapisany przed canary rekord `ai_function_mapping.voice_agent` i
   ustawienia ciszy testowego agenta tylko wtedy, gdy zostały zmienione.
5. Nie wycofywać migracji w czasie incydentu: jest addytywna, a stare funkcje
   ignorują nowe kolumny. Zachować archiwum duplikatów i wszystkie nowe dane.
6. Jeżeli po stabilizacji konieczne jest cofnięcie egzekwowania unikalności,
   uruchomić ręcznie `voice_production_canary_schema_rollback.sql` po jawnym
   potwierdzeniu. Skrypt usuwa indeksy/ograniczenia i przywraca politykę starego
   panelu, ale celowo nie usuwa kolumn, archiwum ani treści.
7. Odtworzenie historycznych duplikatów do tabel operacyjnych nie jest częścią
   awaryjnego rollbacku. Pełne wiersze pozostają w `row_data`; ewentualny replay
   wymaga osobnego skryptu po sprawdzeniu konfliktów z danymi powstałymi po
   migracji. Automatyczny replay podczas incydentu mógłby nadpisać nowsze dane.
8. Po rollbacku potwierdzić: brak aktywnego canary w logach, normalne odpowiedzi
   istniejącego testowego agenta, brak nowych duplikatów i niezmienione relacje
   wcześniej utworzonych zleceń. Nie wykonywać kolejnego telefonu przed analizą.

## Stan gotowości

Kod ma lokalną, fail-closed izolację oraz testy czystej decyzji. Rollout pozostaje
zablokowany do wykonania migracji na prawdziwym PostgreSQL, produkcyjnego
preflightu read-only, potwierdzenia backupu i zachowania poprzednich wersji Edge
Functions. Do tego czasu decyzja brzmi **NOT READY**.
