# AI Voice Agent — stan projektu (2026-08-05)

Dokument roboczy. Punkt powrotu po utracie kontekstu.

---

## Architektura (stan faktyczny)

```
SuperVoIP (SIP) → ElevenLabs (ASR/TTS/turn) → voice-agent-llm → voice-agent-chat
                                                                      ↓
                                                              voice-agent-tools
                                                              (kalendarz, rezerwacja,
                                                               zlecenie, SMS)
po rozmowie:  ElevenLabs webhook → voice-call-postprocess → voice-call-analyze
                                                    (voice_calls, transkrypt, reguły)
```

- **Agent ElevenLabs**: `agent_8301ky7ve28ee6jsb3h30h11354g`, nazwa „GetRido", `llm: custom-llm`
- **Projekt Supabase**: `wclrrytmrscqvsyxyvnn`, region **eu-central-1** (Frankfurt)
- **Canary**: włączony, para = provider `664ed87b…` + persona `workshop_secretary`
- **Model rozmowy**: `claude-haiku-4-5-20251001`, czytany z `ai_agents_config.model`
  (canary bierze z bazy, legacy nadal wymusza Sonnet)

---

## Kluczowe ustalenia — nie odkrywać ich ponownie

### Latencja
| Pozycja | Wartość | Status |
|---|---|---|
| **Zimny start dwóch funkcji** | **1,96 s** | ✅ rozwiązane keep-warmem |
| Hop `llm` → `chat` | 0,33 s | poniżej progu, scalanie odpada |
| `chat` → pierwszy token | 1,13 s (warm) | — |
| `stage prepare` (baza przed modelem) | 397–1351 ms | do optymalizacji |
| `first_text` realny | 1186–2349 ms, mediana ~1,7 s | — |
| Region / migracja | eu-central-1, PoP Praga | zysk 0, kierunek skreślony |

**„2,3 s w potoku ElevenLabs" było błędną hipotezą** — to był zimny start.
Keep-warm: dwa crony `* * * * *` (`voice-keep-warm-llm`, `voice-keep-warm-chat`),
ping bez wywołania modelu. Działa.

### Dane i baza
- **`station_id` w `workshop_client_bookings` jest warunkiem widoczności w grafiku.**
  `WorkshopScheduler:277` mapuje je na `scheduled_station_id`; bez niego siatka pusta.
  `create_booking` przypisuje pierwsze wolne stanowisko (6 aktywnych).
- **Kalendarz czyta rezerwacje, nie zlecenia** (`workshop_client_bookings` + `service_bookings`).
- **`conversation_id` NIE dociera do narzędzi w trakcie rozmowy.** ElevenLabs nie przekazuje go
  do Custom LLM — sonda sprawdza 8 miejsc, żadne nie działa. Dociera tylko webhookiem po rozmowie.
  Skutek: idempotencja w `tools` nieaktywna, powiązanie transkryptu opiera się na
  **heurystyce po numerze telefonu** (`voice-call-analyze`), a ASR przekręcił numer w ~60% rozmów.
  **Rozwiąże to dopiero FAZA 1 (webhook inicjujący).**
- `getSecret` czyta **najpierw `ai_secret_store`, potem env**. Stary `ELEVENLABS_API_KEY`
  z tabeli psuł 5 funkcji — usunięty. `DEEPGRAM_API_KEY` i 3 klucze Twilio nadal tam,
  niezaszyfrowane → **dług techniczny**.
- Literówka `agent_id` (`kv7` zamiast `ky7`) była **w bazie i w sekrecie canary jednocześnie** —
  dlatego porównanie „działało". Poprawione w obu miejscach.

### Zachowanie agenta
- **`complaint` = słowa klienta**, zwięźle. Nie parafraza, nie diagnoza, nie kategoria.
- **Pan/Pani + IMIĘ, nigdy nazwisko.** Przy nieznanej płci — formy bezosobowe.
  Nigdy „Ty/Ci/masz", nigdy liczba mnoga.
- **Cyfry pojedynczo** — lista dozwolonych słów (zero…dziewięć) zamiast zakazu.
  Otwarte zakazy model łamał czterokrotnie.
- **Rejestracja: pytana raz, bez potwierdzania wstecz.** Pętla potwierdzania kosztowała
  6 prób i 4 minuty.
- **Sekwencja**: problem → termin → imię i nazwisko → telefon → marka i model → rejestracja.
  Telefon zostaje do czasu FAZY 1 (`create_booking` go wymaga, `tools:176`).
- **Auto-reguły nie aktywują się same** (`voice-call-analyze`, `is_active: false`).
  W jeden dzień powstało 6 reguł, 5 przeczyło świeżo wprowadzonym zasadom.
  Stan `voice_agent_knowledge`: 10 aktywnych, 16 wyłączonych.

### ElevenLabs — konfiguracja
```
tts.model_id            eleven_flash_v2_5      (najszybszy)
asr                     scribe_realtime, high
turn_timeout            10 s                   (zostaje)
silence_end_call_timeout 20 s                  (awaryjne)
speculative_turn        FALSE                  ← WYŁĄCZONY CELOWO, patrz niżej
soft_timeout_config     4 s → "Dobrze rozumiem"
built_in.end_call       WŁĄCZONE
overrides: first_message ✅ language ✅ prompt ✅ voice_id ✅ ; llm ✗
enable_conversation_initiation_client_data_from_webhook  FALSE  ← FAZA 1
```

### ⛔ Podwójne żądania z ElevenLabs — NIE są skutkiem `speculative_turn`

`speculative_turn` jest wyłączony (potwierdzone `GET /v1/convai/agents/…` →
`"speculative_turn": false`) i **mimo to ElevenLabs nadal wysyła po dwa żądania
na turę**. Rozmowa 05.08 02:05, `conv_8501kz7ks42ze1hva18zp5d13srn`:
4 z 8 tur podwójne, licząc na wejściu do `voice-agent-llm` (12 żądań na 8 tur).

Najgroźniejszy przypadek — żądanie **porzucone przez ElevenLabs, ale zdążyło
zapisać do bazy**:

```
t=80s  1ba7921b  prepare 1342  model 2678  create_booking 468  URWANE   ← porzucone
t=81s  51212fc3  prepare  402  model 5166  create_booking + create_order  total 8316
```

Korelacja czasowa: pary występują dokładnie przy odpowiedziach wieloczłonowych
(imię i nazwisko, dziewięć cyfr telefonu, rejestracja). Zgodne z
`turn_eagerness: "eager"` — ElevenLabs odpala model gdy uzna turę za skończoną,
klient mówi dalej, ASR poprawia transkrypt i odpalane jest drugie żądanie.
**To jest hipoteza wiodąca, nie dowód** — dowodem byłby log ostatniej wiadomości
użytkownika per żądanie (jedna linia w `voice-agent-llm`, do dopisania).

Kandydaci do sprawdzenia, w tej kolejności:
1. `turn_eagerness: "eager"` → `"normal"` (panel, jedno pole)
2. log rozróżniający żądania (nasz kod, jedna linia)
3. blokada idempotencyjna po `conversation_id` — **właściwe rozwiązanie**,
   ale wymaga FAZY 1, bo identyfikator nie dociera do narzędzi

Do czasu naprawy każda kopia ma pełne uprawnienia zapisu. Dlatego dedup
w `create_booking` (telefon + data + godzina) **musi zostać** — dziś to jedyna
realna ochrona przed duplikatem rezerwacji.

### ⚠️ Ścieżka dedup w `create_booking` ucina SMS, grafik i zlecenie

`create_booking` przy trafieniu dedupu robi `return` **przed**:
wstawieniem do `workshop_client_bookings` (grafik), wysyłką SMS
i deterministycznym `create_order`. Rozmowa 02:05 trafiła w rezerwację z 01:41
(ten sam telefon, 06.08 09:00) → zero SMS-a, zero wpisu w grafiku, a zlecenie
powstało tylko dlatego, że model osobno zawołał `create_order`.

Dodatkowo `const { data: wcb }` **nie odbiera `error`** — nieudany zapis grafiku
jest niewidoczny, a `if (wcb?.confirmation_token)` po cichu pomija SMS.

### ⚠️ `end_call` — pożegnanie ląduje w parametrze narzędzia, nie w mowie

Model **generuje** pożegnanie, ale wkłada je w parametr, nie w tekst tury:

```
-> end_call  {"reason":"…","system__message_to_speak":"Do widzenia, Panie Danielu."}
<- end_call  {"result_type":"end_call_success","message":null}       ← nie wypowiedziane
```

Tura agenta ma `message: null`. Klient słyszy nagłe rozłączenie.
Konfiguracja agenta: `force_pre_tool_speech: false`, `pre_tool_speech: "auto"`.
Dwie dźwignie: pole w ElevenLabs (wymaga PATCH) albo usunięcie
`system__message_to_speak` ze schematu `end_call` przekazywanego modelowi
w `voice-agent-chat` — wtedy model nie ma gdzie schować pożegnania poza mową.

### `execution_id` to IZOLAT, nie żądanie

Ciepła instancja obsługuje wiele żądań pod tym samym `execution_id`. Grupowanie
logów po nim skleja różne tury (objaw: `narzędzia 8785 ms` obok `total 2851 ms`).
Żądanie wyodrębnia się po znaczniku otwierającym: `stage: "prepare"` w `chat`,
`stage: "auth"` w `llm`. `scripts/diagnose-call.sh` robi to poprawnie.

---

## Zrobione i wdrożone

| Obszar | Stan |
|---|---|
| Okno kontekstu 12 → 40 | ✅ (przyczyna 9 powtórzonych pytań) |
| `max_tokens` 400 → 600, `stop_reason=max_tokens` | ✅ |
| Klasyfikacja odmów Anthropic 400/429/529 | ✅ fallback tylko dla 529/5xx |
| Jedno powitanie w telefonii (`test_mode`) | ✅ |
| Blok PAMIĘĆ ROZMOWY + HAŁAS | ✅ |
| Neutralne formy, zakaz nazwiska i liczby mnogiej | ✅ |
| `conversation_id` llm→chat→tools (kod) | ✅ kod gotowy, dane nie dochodzą |
| Rozpoznanie tenanta po `agent_id` w webhooku | ✅ |
| Koniec cichych 200 w `postprocess` | ✅ 400 + logi z `conversation_id` |
| Auto-reguły `is_active=false` | ✅ |
| **Keep-warm** | ✅ −1,96 s |
| **`end_call` — przekazanie `tools`** | ✅ kod działa (log `client_tool_requested`) |
| **Deterministyczne `create_order`** | ✅ |
| **`station_id` → grafik** | ✅ |
| Idempotencja webhooka po `conversation_id` | ✅ |

**Pierwszy komplet: 05.08 01:42** — ZLP-08/2026-001, rezerwacja + zlecenie + grafik
+ SMS + transkrypt przypięty. Powiązanie zrobiła **stara heurystyka po telefonie**,
nie `conversation_id`.

---

## Narzędzie diagnostyczne

```bash
./scripts/diagnose-call.sh conv_8501kz7ks42ze1hva18zp5d13srn
```

Sześć sekcji w jednym wydruku: równoległe wykonania per tura, oś czasu żądań,
rozkład czasu po warstwach, porównanie z metrykami ElevenLabs, stan bazy
(rezerwacja / grafik / zlecenie / SMS / transkrypt) i automatyczne czerwone flagi.
Tylko odczyt. Wymaga `ELEVENLABS_API_KEY` i `SUPABASE_ACCESS_TOKEN` w `.env.local`.

Test akceptacyjny przeszedł: na rozmowie 01:41 sam wykrył 6 podwójnych tur
i porzucone żądanie z zapisem `create_booking` trwającym 8785 ms.

---

## FAZA 1 — ustalenia projektowe (przed kodowaniem snapshotu)

**1. Snapshot to LISTA N NAJBLIŻSZYCH WOLNYCH TERMINÓW, nie siatka dni.**
Grafik zapchany na miesiąc dałby siedem dni pustki i agent nie miałby co
powiedzieć. Lista N terminów zajmuje tyle samo miejsca niezależnie od obłożenia.
Dodatkowo: `first_available` oraz `next_free_by_day` (~5 terminów na 3 dni robocze).

**2. Generyczny model zasobu, nie zaszyty pod warsztat.**
- Warsztat: 4 stanowiska zamienne, klient nie wybiera.
- Fryzjer: klient wybiera KONKRETNĄ osobę; każda ma swój grafik, godziny pracy
  i zakres usług (jedna farbuje, druga nie).
- Hotel: nie sloty, tylko zakresy dat i typy pokoi.

Snapshot buduje się z modelu danych tenanta, nie z założeń o warsztacie.

**3. `check_availability` ZOSTAJE — jako wyjątek.**
Typowa rozmowa: zero narzędzi, terminy z kontekstu, bez zapowiedzi.
Wyjątek: klient pyta o termin spoza snapshotu („a coś w połowie września?") →
wtedy agent MOŻE powiedzieć „Chwileczkę, sprawdzę dalsze terminy" i wywołać
narzędzie. **To jedyny dozwolony przypadek zapowiedzi** — bo wtedy naprawdę
sprawdza. Wyjątek trzeba wpisać do bloku ZAKAZ RELACJONOWANIA, inaczej prompt
sam sobie przeczy.

---

## Kolejka

1. **`end_call` bez pożegnania** — klient słyszy rzuconą słuchawkę
2. **Dedup ucinający SMS/grafik/zlecenie** + nieodbierany `error` przy zapisie grafiku
3. **Podwójne żądania z ElevenLabs** — `turn_eagerness`, potem log rozróżniający
4. Prompt caching + `stage prepare` (20,6% czasu, 5,7 s na rozmowę)
5. Audyt wiarygodności grafiku
6. **FAZA 1** — `voice-agent-init`, snapshot, `caller_id`, `conversation_id`

### Odłożone
- SMS awaryjny do warsztatu (`CALLBACK_SMS_ENABLED = false`) — czeka na idempotencję
- Kolumna `priority` w `voice_agent_knowledge` (`scripts/sql/voice-knowledge-priority.sql`)
- Cięcie promptu do bazy wiedzy (stałe reguły ~2900 tokenów)
- Twilio/Deepgram niezaszyfrowane w `ai_secret_store`
- Panel: widok reguł oczekujących, ujednolicenie panelu z telefonem (panel = legacy/Sonnet/bez SSE)

---

## Rollback

- `VOICE_PRODUCTION_CANARY_ENABLED=false` — cofa całe zachowanie canary bez ruszania kodu
- `backups/voice-stabilization-20260803/` + `SHA256SUMS-base.txt`
- `scripts/sql/*-rollback.sql` — reguły wiedzy, keep-warm, priority
- Model: `UPDATE ai_agents_config SET model='claude-sonnet-4-6' WHERE agent_id='voice_workshop_secretary'`

## Zasady pracy

- Weryfikacja wdrożenia: `functions download` + SHA-256, **nigdy po numerze wersji**
  (Lovable nadpisuje funkcje stanem z `main`)
- Migracje w `supabase/migrations/` Lovable stosuje sam — świadome skrypty trzymamy w `scripts/sql/`
- Logi: Edge Functions → wybrana funkcja → Logs. **Unified Logs pokazuje tylko HTTP.**
