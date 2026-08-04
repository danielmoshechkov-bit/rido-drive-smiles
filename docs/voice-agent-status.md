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

### ⛔ `speculative_turn` — wyłączony celowo, NIE włączać

Daje 200–400 ms na czasie odpowiedzi, ale przy Custom LLM **każda spekulacja to
osobne wykonanie naszej funkcji z pełnymi uprawnieniami zapisu**. Dowód z logów
rozmowy 05.08 01:41 — trzy równoległe `execution_id` na jedną turę:

```
23:41:30.059  create_booking   694 ms  (cba5a35b)
23:41:36.079  create_booking  7696 ms  (cb262c23)  ← kolizja na tym samym slocie
23:41:51.193  create_booking   384 ms  (ea0906e6)
23:41:36.578  ERROR: connection closed before message completed
```

Skutki: duplikaty rezerwacji, 7,7 s na zapisie, oraz **zagłodzony `end_call`** —
narzędzie zadziałało poprawnie (`client_tool_requested` w logu), ale tura trwała
7,8 s i klient rozłączył się wcześniej.

Żądanie spekulacyjne jest **nieodróżnialne** od prawdziwego — ElevenLabs nie
oznacza go w payloadzie. Jedyną ochroną jest blokada idempotencyjna po
`conversation_id`, która jest już napisana w `voice-agent-tools`, ale nieaktywna,
bo identyfikator nie dociera do narzędzi.

**Można włączyć z powrotem dopiero po FAZIE 1**, gdy `conversation_id` zacznie
docierać i blokada zadziała.

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

## Kolejka

1. **Równoległe wykonania** (`speculative_turn`) — psuje wszystko inne
2. Poprawka promptu: wyciek mechaniki, regres formy, „sprawdzam terminy"
3. Narzędzie diagnostyczne per `conversation_id`
4. Prompt caching + `stage prepare`
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
