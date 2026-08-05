# AI Voice Agent — stan projektu (2026-08-05, wieczór)

Punkt powrotu po utracie kontekstu. Ma wystarczyć bez historii czatu.
Spec dalszych prac: `docs/voice-agent-faza1.md`, `docs/voice-agent-faza2.md`.

---

## Architektura (stan faktyczny)

```
SuperVoIP (SIP) → ElevenLabs (ASR/TTS/turn) → voice-agent-llm → voice-agent-chat
                                                                      ↓
                                                              voice-agent-tools
                                                              (kalendarz, rezerwacja,
                                                               zlecenie, SMS)
po rozmowie:  ElevenLabs webhook → voice-call-postprocess → voice-call-analyze
```

- **Agent ElevenLabs**: `agent_8301ky7ve28ee6jsb3h30h11354g`, `llm: custom-llm`
- **Supabase**: `wclrrytmrscqvsyxyvnn`, eu-central-1 (Frankfurt)
- **Canary**: włączony — provider `664ed87b…` + persona `workshop_secretary`
- **Model**: `claude-haiku-4-5-20251001` z `ai_agents_config.model` (canary; legacy wymusza Sonnet)
- **`main` = `da2e11b1`** (PR #32 scalony 05.08)

### Narzędzie diagnostyczne — używać PRZED grzebaniem ręcznie
```bash
./scripts/diagnose-call.sh conv_XXXX
```
Sześć sekcji: równoległe wykonania per tura, oś czasu żądań, rozkład czasu po
warstwach, porównanie z metrykami ElevenLabs, stan bazy, czerwone flagi.
Tylko odczyt. Wymaga `ELEVENLABS_API_KEY` i `SUPABASE_ACCESS_TOKEN` w `.env.local`.

---

## ⛔ Rzeczy, które kosztowały dzień — nie odkrywać ponownie

### 1. ElevenLabs PODMIENIA ostatnią wypowiedź i odpala turę od nowa

Nie da się tego wyłączyć. Sprawdzone i **obalone** jako przyczyny:
`speculative_turn: false` ✗, `turn_eagerness: "normal"` ✗.

Dowód — rozmowa `conv_0401kz9a45vbfddtb1w0qy2gngkh` (05.08 17:56), **14 żądań na 9 tur**:

| czas | wiadomości | skróty ostatniej wypowiedzi | wniosek |
|---|---|---|---|
| 15:54:49 / :50 | 5 / 5 | `1liwzqb` / `1yasz22` | różne → poprawka ASR |
| 15:55:18 / :19 | 9 / 9 | `i47ihm` / `i47ihm` | identyczne → retry |
| 15:55:51 / :51 | 17 / 17 | `64g8ay` / `5yc5vu` | różne → poprawka ASR |
| 15:56:15 / :15 | 19 / 19 | `krl85z` / `9we7pc` | różne → poprawka ASR |

**Identyczna liczba wiadomości przy różnej treści** = ostatnia wypowiedź została
PODMIENIONA, nie dopisana. To finalizacja ASR.

Skutki, także gdy żądanie nic nie zapisuje:
- duplikat **narzuca czas gorszej kopii**: `first_text` 1554 ms i 4954 ms → ElevenLabs zmierzył `ttfb` 5,81 s
- duplikat **przerywa turę przed `end_call`**: `interrupted: true`, zero wywołań narzędzi u ElevenLabs mimo `client_tool_requested` w obu żądaniach
- prawdopodobnie **skleja audio** (hipoteza właściciela, zgodna z dowodami): w transkrypcie zlepki „Dobrze rozumiem. Rozumiem — chodzi o…" dokładnie na turach z duplikatem. Weryfikacja: jeśli po usunięciu duplikatów bełkot zniknie, hipoteza potwierdzona.

**Blokada po skrócie treści złapałaby 1 z 4** — odrzucona. Rozwiązanie docelowe:
tura tylko-do-odczytu (FAZA 2). Rozwiązanie doraźne: atomowe przejęcie rozmowy + indeksy.

### 2. `maybeSingle()` przy możliwych duplikatach = błąd

PostgREST przy **więcej niż jednym** pasującym wierszu zwraca **BŁĄD, nie wiersz**.
Z `const { data } = …` (bez `error`) wygląda to identycznie jak brak dopasowania →
kod wstawia kolejny duplikat → następne sprawdzenie pasuje do jeszcze większej liczby.

Tak powstały **3 rezerwacje i 6 SMS-ów** z jednej rozmowy 05.08 17:56.
**Zawsze `limit(1)` + tablica.**

### 3. Model schowa tekst w każdym polu, które dostanie
Pożegnanie trafiało do `end_call.system__message_to_speak` zamiast do mowy
(`"message": null` w wyniku — ElevenLabs tego nie wypowiadał, klient słyszał rzuconą
słuchawkę). Naprawione przez usunięcie tego pola ze schematu podawanego modelowi.

### 4. Model relacjonuje to, co robi
Cztery wersje zakazu nie usunęły „Teraz tworzę rezerwację", bo model **faktycznie ją
tworzył**. Zakaz sprzeczny z rzeczywistością nie działa. Zniknie dopiero z FAZĄ 2.

### 5. Klucz idempotencji: `conversation_id`, nigdy telefon + data
Klucz telefon+data+godzina sprawiał, że każdy test zderzał się z poprzednim: dedup
zwracał wczorajszą rezerwację, `create_order` widział wczorajsze zlecenie, nie powstawało nic.

### 6. Latencja — co jest, a co nie jest przyczyną
| Pozycja | Wartość | Status |
|---|---|---|
| zimny start dwóch funkcji | 1,96 s | ✅ zdjęte keep-warmem (dwa crony `* * * * *`, sprawdzone: `succeeded`) |
| `stage prepare` (baza przed modelem) | 377–1342 ms | do usunięcia w FAZIE 1C |
| model (Anthropic) | ~50–60% czasu | prompt caching — dziś `input_cache_read: 0`, 2653 tokeny pełną ceną co turę |
| tura BEZ narzędzi | mediana ~1,72 s | samo usunięcie narzędzi nie da 1,2 s |
| tura Z zapisem | 8316 ms / 15218 ms | znika z FAZĄ 2 |
| region / migracja | eu-central-1, PoP Praga | zysk 0, kierunek skreślony |

### 7. `conversation_id` — jest, ale nie tam, gdzie go szukaliśmy
ElevenLabs **nie przekazuje** go do Custom LLM w żadnym polu (sonda: 8 miejsc, wszystkie
puste w każdej rozmowie). **Udostępnia go jako zmienną dynamiczną** `system__conversation_id`,
podstawianą w prompcie — a prompt przychodzi jako wiadomość `system`, którą
`voice-agent-llm:182` dotąd wyrzucał bez czytania.

Dostępne zmienne systemowe (zrzut z rozmowy):
```
system__conversation_id  system__caller_id     system__called_number
system__call_sid         system__timezone      system__time
```

### 8. Inne
- **`station_id` w `workshop_client_bookings` = warunek widoczności w grafiku**
  (`WorkshopScheduler:277` mapuje na `scheduled_station_id`)
- **Daty w `Europe/Warsaw`** — runtime chodzi w UTC, a między północą a 2:00 lokalnego
  data UTC jest o dzień wcześniejsza, czyli dokładnie w porze testów.
  `voice-agent-chat:207` robi to poprawnie
- **transkrypt dopisuje webhook ~30 s PO zleceniu** — jednorazowy fetch w panelu trafiał
  w dziurę; `OrderCallPanel` dopytuje teraz co 8 s
- **`getSecret` czyta najpierw `ai_secret_store`, potem env**. `DEEPGRAM_API_KEY`
  i 3 klucze Twilio leżą tam niezaszyfrowane → dług techniczny
- **auto-reguły nie aktywują się same** (`is_active: false`); stan `voice_agent_knowledge`:
  10 aktywnych, 16 wyłączonych
- **`complaint` = słowa klienta**, zwięźle. Nie parafraza, nie diagnoza, nie kategoria
- **Pan/Pani + IMIĘ, nigdy nazwisko**; przy nieznanej płci formy bezosobowe
- **cyfry pojedynczo** — lista dozwolonych słów zamiast zakazu (otwarte zakazy model łamał)
- **ASR myli nazwiska**: w pięciu rozmowach pięć różnych wersji tego samego nazwiska,
  dwa błędne telefony na pięć. Dlatego `system__caller_id` > ASR

---

## Konfiguracja ElevenLabs

```
tts.model_id            eleven_flash_v2_5
asr                     scribe_realtime / Scribe v2 Realtime, high
turn_timeout            10 s
silence_end_call_timeout 20 s
speculative_turn        FALSE      (nie pomogło — patrz punkt 1)
turn_eagerness          normal     (nie pomogło — patrz punkt 1)
soft_timeout_config     4 s → "Dobrze rozumiem"
built_in.end_call       WŁĄCZONE   ; force_pre_tool_speech: false, pre_tool_speech: "auto"
overrides: first_message ✅ language ✅ prompt ✅ voice_id ✅ ; llm ✗ ; custom_llm_extra_body ✗
conversation_initiation_client_data_webhook            null   ← FAZA 1B
enable_conversation_initiation_client_data_from_webhook false  ← FAZA 1B
post_call_webhook_id    a9f9457cf459465297f20b3c3c6c6648  (events: transcript, json)
```

**Prompt kończy się znacznikiem** (dopisany 05.08):
```
<<RIDO conv={{system__conversation_id}} caller={{system__caller_id}} called={{system__called_number}}>>
```

---

## Wdrożone (weryfikowane SHA-256 wobec `main`)

| Obszar | Stan |
|---|---|
| Okno kontekstu 12 → 40 | ✅ (przyczyna 9 powtórzonych pytań) |
| `max_tokens` 400 → 600, `stop_reason=max_tokens` | ✅ |
| Klasyfikacja odmów Anthropic 400/429/529 | ✅ fallback tylko 529/5xx |
| Jedno powitanie w telefonii, formy oficjalne | ✅ |
| Zakaz relacjonowania działań (lista czasowników) | ✅ — usunął „już sprawdzam" |
| Keep-warm | ✅ −1,96 s |
| `end_call` — przekazanie `tools` + usunięcie `system__message_to_speak` | ✅ pożegnanie wypowiedziane |
| Deterministyczne `create_order`, `station_id` → grafik | ✅ |
| Rozpoznanie tenanta po `agent_id`, koniec cichych 200 | ✅ |
| **FAZA 1A — parser znacznika RIDO** | ✅ wdrożone, czeka na potwierdzenie telefonem |
| **Atomowe przejęcie rozmowy w `create_booking`** | ✅ |
| **`limit(1)` zamiast `maybeSingle()`** | ✅ |
| **`scripts/diagnose-call.sh`** | ✅ |

### Baza — wykonane 05.08 wieczorem
- 6 duplikatów w grafiku **anulowanych** (nie skasowanych — `public_token` poszedł SMS-em,
  skasowany dałby 404 na `/r/:token`)
- slot testowy 06.08 09:00 zwolniony, `d3786b82` anulowana,
  `ZLP-08/2026-001` odpięta od rezerwacji (brak statusu „Anulowane" w `workshop_order_statuses`)
- **indeksy** `workshop_client_bookings_slot_uniq` i `voice_calls_conversation_uniq` założone
- skrypt: `scripts/sql/voice-calendar-dedup-20260805.sql` (+ rollback)

---

## Kolejka

1. **Potwierdzenie FAZY 1A telefonem** — `used_source: "system_marker"`, jedna rezerwacja,
   jedno zlecenie, `end_call`, czy bełkot zniknął
2. **FAZA 1B** — webhook inicjujący `voice-agent-init` + snapshot (lista N terminów,
   interfejs generyczny)
3. **FAZA 1C** — zero odczytów per tura + prompt caching → tura < 1,2 s
4. **Cron rekoncyliacyjny + alert** ← przed 6 i 7
5. **Kolejka weryfikacji w panelu** ← przed 6 i 7
6. **FAZA 2** — `voice-call-commit`, zapis po rozłączeniu w jednej transakcji
7. Wyłączenie narzędzi zapisujących w rozmowie

### Odłożone
- SMS awaryjny do warsztatu (`CALLBACK_SMS_ENABLED = false`)
- kolumna `priority` w `voice_agent_knowledge`
- cięcie promptu do bazy wiedzy (stałe reguły ~2900 tokenów)
- Twilio/Deepgram niezaszyfrowane w `ai_secret_store`
- panel: widok reguł oczekujących, ujednolicenie panelu z telefonem
  (panel = legacy/Sonnet/bez SSE)
- brak statusu „Anulowane" w `workshop_order_statuses`

---

## Rollback

- `VOICE_PRODUCTION_CANARY_ENABLED=false` — cofa całe zachowanie canary bez ruszania kodu
- `backups/voice-stabilization-20260803/` + `SHA256SUMS-base.txt`
- `scripts/sql/*-rollback.sql`
- Model: `UPDATE ai_agents_config SET model='claude-sonnet-4-6' WHERE agent_id='voice_workshop_secretary'`
- Znacznik RIDO: usunięcie linii z promptu cofa FAZĘ 1A bez zmian w kodzie
  (parser traktuje brak znacznika jak dotychczas)

## Zasady pracy

- Weryfikacja wdrożenia: `functions download` + SHA-256, **nigdy po numerze wersji**
  (Lovable nadpisuje funkcje stanem z `main` — dlatego zmiany idą przez PR do `main`
  PRZED deployem)
- **`deno` nie jest zainstalowane** w tym środowisku — testów Deno nie da się uruchomić.
  Zamiennik: `esbuild` na składnię, `tsc --noEmit`, `npm run build`
- Migracje w `supabase/migrations/` Lovable stosuje sam — świadome skrypty w `scripts/sql/`
- Logi: Management API (`analytics/endpoints/logs.all`) — `diagnose-call.sh` już to robi.
  **W panelu Unified Logs pokazuje tylko HTTP**
- **`execution_id` to IZOLAT, nie żądanie** — ciepła instancja obsługuje wiele żądań pod
  tym samym identyfikatorem. Żądanie wyodrębnia się po `stage "prepare"` (chat) /
  `stage "auth"` (llm)
- Bez pushy i merge'y do `main` bez zgody właściciela
