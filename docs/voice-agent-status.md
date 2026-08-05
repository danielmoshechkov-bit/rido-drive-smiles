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

### 6. NAJPIERW KONFIGURACJA PLATFORMY, POTEM KOD

`turn_timeout` 10 s → 4 s, jedno pole w panelu ElevenLabs:

| | przed | po |
|---|---|---|
| cisza przed inicjacją, średnia | 2,52 s | **0,79 s** |
| maksymalna | 6,40 s | **2,56 s** |
| tury ucięte w połowie zdania | — | **0** |

**−1,73 s na turze — więcej niż wszystkie zmiany w kodzie z tego tygodnia razem.**
Prompt caching, env-first, keep-warm i cache izolatu dały łącznie mniej.

Lekcja: zanim zaczniesz optymalizować kod, **przejrzyj konfigurację platformy**.
Przez tydzień mierzyliśmy własne warstwy, a największa pojedyncza pozycja siedziała
w polu, którego nikt nie ruszył.

### 7. Latencja — co jest, a co nie jest przyczyną
| Pozycja | Wartość | Status |
|---|---|---|
| zimny start dwóch funkcji | 1,96 s | ✅ zdjęte keep-warmem (dwa crony `* * * * *`, sprawdzone: `succeeded`) |
| `stage prepare` (baza przed modelem) | 377–1342 ms | do usunięcia w FAZIE 1C |
| model (Anthropic) | ~50–60% czasu | prompt caching — dziś `input_cache_read: 0`, 2653 tokeny pełną ceną co turę |
| tura BEZ narzędzi | mediana ~1,72 s | samo usunięcie narzędzi nie da 1,2 s |
| tura Z zapisem | 8316 ms / 15218 ms | znika z FAZĄ 2 |
| region / migracja | eu-central-1, PoP Praga | zysk 0, kierunek skreślony |

### 8. `conversation_id` — jest, ale nie tam, gdzie go szukaliśmy
ElevenLabs **nie przekazuje** go do Custom LLM w żadnym polu (sonda: 8 miejsc, wszystkie
puste w każdej rozmowie). **Udostępnia go jako zmienną dynamiczną** `system__conversation_id`,
podstawianą w prompcie — a prompt przychodzi jako wiadomość `system`, którą
`voice-agent-llm:182` dotąd wyrzucał bez czytania.

Dostępne zmienne systemowe (zrzut z rozmowy):
```
system__conversation_id  system__caller_id     system__called_number
system__call_sid         system__timezone      system__time
```

### 9. Inne
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

### 10. WRAŻENIE UŻYTKOWNIKA NIE ZASTĘPUJE LOGU

`end_call` był zgłaszany jako niedziałający **pięć razy**. Przy ostatniej zmianie
(rozdzielenie pytania domykającego od pożegnania) zaczął działać, ale zgłoszenie
przyszło ponownie — bo właściciel rozłączył się w tej samej sekundzie co agent:

```
92s agent: "Do widzenia!"
93s agent: TOOL -> end_call
94s agent: WYNIK <- {"result_type":"end_call_success","status":"success"}
termination_reason: "end_call tool was called."     (rozmowa trwała 95 s)
```

Zanim uznasz objaw za istniejący, sprawdź log. Dotyczy to obu stron: kilka razy
to właściciel poprawiał moją błędną diagnozę dowodem, a kilka razy odwrotnie.

---

## Transfer do człowieka — temat ZAMKNIĘTY, nie wracać

Rozeznane w dokumentacji ElevenLabs:

1. `transfer_to_number` ma trzy tryby: **Conference** (domyślny, usuwa agenta
   z rozmowy), **Blind** (tylko natywna integracja Twilio), **SIP REFER**
   (działa przy naszym trunku, wymaga zgody operatora).
2. **NIE MA POWROTU Z TRANSFERU.** Brak fallbacku, gdy nikt nie odbierze.
   Scenariusz „człowiek pierwszy, agent zapasowy" jest dziś **niewykonalny na tej
   platformie**. SignalWire ma na to `final=false`, ElevenLabs nie ma odpowiednika.
3. **Znany błąd, istotny dla nas:** przy transferze ORAZ przy `end_call` połączenie
   bywa ucinane, zanim agent skończy mówić. Zgłaszane od trzech miesięcy, występuje
   przy SIP trunk i przy Twilio. Obejście istnieje tylko dla numerów z natywnej
   integracji Twilio. **To może tłumaczyć „Do widzenia!..." z wielokropkiem
   w transkrypcie.**

Wniosek: transkrypcja rozmów prowadzonych przez człowieka wymagałaby centrali
PRZED ElevenLabs (logika po stronie SuperVoIP), nie naszego kodu. Odkładamy —
najpierw jeden agent działający niezawodnie.

---

## Backlog — do zrobienia PO osiągnięciu progu

### A. Pytania klienta w trakcie rozmowy
Dziś agent improwizuje. Dowód: klient zapytał o cenę, agent odpowiedział „to będzie
wiadomo po diagnozie", mimo że warsztat ma cennik w module Moje usługi.
Do FAZY 1B — snapshot ma zawierać **cennik, godziny otwarcia, adres i listę usług**.
Trzy przypadki w prompcie: odpowiedź jest w kontekście → podaj od razu; usługi nie ma
w cenniku → „wycenimy na miejscu"; klient nalega albo pyta o coś spoza kontekstu →
`callback_requests`. **Agent NIGDY nie zgaduje ceny ani terminu realizacji.**

### B. Uczenie się z rozmów — zasady, zanim to zbudujemy
`voice-call-analyze` dopisał sobie sześć reguł, z których **pięć przeczyło** temu,
co właśnie wprowadziliśmy. Obowiązujący podział:
- **WYCIĄGAMY automatycznie (DANE):** ceny padające w rozmowie, czasy realizacji,
  słownictwo klientów, aliasy marek, najczęstsze pytania. Zawsze `is_active = false`
  do akceptacji człowieka.
- **NIE WYCIĄGAMY (INSTRUKCJE):** sposób prowadzenia rozmowy, reguły zachowania,
  formuły grzecznościowe.

**Zasada: DANE można dopisywać automatycznie, INSTRUKCJI nie.**

### C. Widok „Połączenia" w panelu warsztatu
Zakładka obok Rezerwacji, licznik nieobsłużonych. Lista: data, numer, czas trwania,
wynik, link do zlecenia, transkrypt do rozwinięcia. Filtr domyślny: tylko
problematyczne. Przycisk „Utwórz zlecenie ręcznie". Plus `callback_requests`
w tej samej warstwie.
Uzasadnienie: **dziś awarie są niewidzialne** — warsztat nie ma jak się dowiedzieć,
że stracił klienta.

### D. Urlop / nieobecność
W panelu: okres od-do, powód, blokada slotów. Agent widzi to przez snapshot i podaje
pierwszy wolny termin po powrocie.

---

## 🔬 BENCHMARK MODELI z eu-central-1 (06.08) — FAZA D ODPADA

Pomiar TTFT **z naszego regionu**, przez `voice-model-benchmark`, 5 prób sekwencyjnie:

| model | prompt 4352 tok | prompt 2000 tok |
|---|---|---|
| **claude-haiku-4-5** | **624 ms** | **654 ms** |
| gemini-2.5-flash | 1132 ms | 974 ms |
| gemini-3-flash-preview | 2120 ms | 2092 ms |

**Dwa wnioski, oba zmieniające plan:**

1. **Haiku jest NAJSZYBSZY.** Gemini 3 Flash jest **3,3× wolniejszy** z Frankfurtu —
   benchmarki mówiące o 0,42 s nie mają pokrycia na naszej trasie sieciowej.
   FAZA D (zmiana modelu) **nie jest drogą do 1,1 s** — nie ma dokąd przejść.
2. **Rozmiar promptu prawie nie wpływa na TTFT.** Haiku: 624 vs 654 ms przy
   dwukrotnej różnicy w prefiksie — to szum. FAZA C nadal ma sens (koszt,
   sprzeczności, utrzymywalność), ale **nie jako dźwignia latencji**.

Trzeci wniosek, wynikowy: skoro surowy TTFT Haiku to ~625 ms, a nasz `first_text`
w produkcji ma medianę ~1,4 s, to **~775 ms dokłada nasza ścieżka** — i to tam,
nie w modelu, jest reszta budżetu.

## Rozbicie 775 ms narzutu naszej ścieżki (06.08)

Mediany z rozmowy `conv_0301kz9yx3kzeembvz7ajn6qr4zf`, dziesięć tur:

| warstwa | ms | usuwalne? |
|---|---|---|
| `auth` (llm) | **0–1** | ✅ zrobione — env-first |
| `config` (llm) | **~370** (144–543) | ✅ **FAZA A** — kontekst z webhooka inicjującego |
| hop llm→chat + rozruch chat | **~160** (119–474) | częściowo — FAZA B |
| `prepare` (chat) | **8** (7–13) | ✅ zrobione — RPC |
| budowa promptu + SSE + model | **~1000** (646–2727) | patrz niżej |
| — z tego surowy model (benchmark) | ~625 | ❌ nieusuwalne |
| — z tego nasza praca | **~370** | do rozstrzygnięcia |

**`config` to potwierdzenie Twojego przypuszczenia liczbą: ~370 ms, największa
usuwalna pozycja.** Znika w FAZIE A, bo kontekst przyjdzie z webhooka inicjującego.

**`chat_headers` 119–474 ms** to hop plus rozruch chat (parsowanie 4,9 KB, autoryzacja,
budowa promptu przed zwróceniem strumienia). Sam hop jest mniejszy — FAZA B zdejmie
tylko jego część, więc próg 0,2 s trzeba sprawdzić na rozdzielonym pomiarze.

✅ **ROZSTRZYGNIĘTE znacznikiem `prompt_ready` (rozmowa 06.08 00:26).**
Budowa promptu kosztuje **1–2 ms**, nie 370. `prompt_ready` wypada 9–18 ms od startu
chat, czyli praktycznie równo z `prepare`.

Czyli `first_text` − `prompt_ready` = **czysty TTFT modelu w produkcji: 615–1496 ms,
mediana ~818 ms** (benchmark dawał 625 ms przy prostszym żądaniu — różnicę robi
sześć definicji narzędzi i historia rozmowy, a nie nasz kod).

**Korekta mojego wcześniejszego oszacowania:** przypisałem naszej ścieżce ~370 ms,
których tam nie ma. Rzeczywisty narzut to:

| warstwa | ms |
|---|---|
| `config` (llm) | ~370 |
| hop + rozruch chat | ~160 |
| chat: `prepare` + budowa promptu | **~14** |
| **razem nasze** | **~545** |
| model | ~800 |

**Nasza ścieżka to ~545 ms, nie 775.** Z tego usuwalne: `config` w FAZIE A,
część hopu w FAZIE B. Chat sam w sobie jest już na dnie.

## Tura z zapisem: 12 sekund — najmocniejszy argument za FAZĄ 2

Rozmowa 06.08 00:26, tura siódma (`3b7644`), rozbicie co do milisekundy:

```
prepare + budowa promptu       13 ms
model_round #1              2 613 ms
create_booking              5 743 ms   ← 53% tury
model_round #2              2 383 ms
─────────────────────────────────────
razem                      10 752 ms
```

`create_booking` to ponad połowa tury. W środku robi: wstawienie rezerwacji,
wyszukanie stanowiska, wpis do grafiku i wywołanie `create_order` przez HTTP
do samego siebie. **Nie da się tego rozbić dalej — `voice-agent-tools` nie ma
instrumentacji.** To najpilniejsza luka pomiarowa.

Dla porównania tura bez narzędzi w tej samej rozmowie: **795 ms**.

**Zalecenie właściciela, przyjęte: nie optymalizujemy tur, tylko usuwamy z nich
operacje.**

## `end_call` czeka na zapis — mechanizm ustalony

Tura ostatnia (`923ab4`), rozmowa 107 s:

```
 99 s  start tury
102 s  agent zaczyna mówić            (first_text 2822 ms)
104 s  create_booking                 (385 ms)
105 s  model_round #3                 (1199 ms)
105 s  client_tool_requested: end_call
107 s  koniec
```

Agent powiedział pożegnanie, a `end_call` poszedł **trzy sekundy później**, bo
model w tej samej turze robił jeszcze rundę narzędzi. Potwierdza się druga
hipoteza właściciela: **narzędzie czeka na zakończenie zapisu**, nie na TTS.

To nie jest sufit platformy. Po FAZIE 2 tura to jedna runda modelu, która wypuszcza
tekst i `end_call` razem — cel 0,5 s od ostatniego słowa jest osiągalny.

## Zachowania, które MUSZĄ przetrwać FAZĘ C

- **Odmowa soboty:** „Pojutrze to sobota — niestety wtedy jesteśmy zamknięci.
  Pracujemy od poniedziałku do piątku." Nikt tego nie kazał; model wywnioskował
  z godzin pracy. **Godziny pracy MUSZĄ trafić do snapshotu FAZY A.**

## Lista kontrolna „brzmi jak robot" — do FAZY C, NIE poprawiać punktowo

1. „Dobrze rozumiem" ×2 — wypełniacz ElevenLabs przy turach > 4 s. **Nie nasz**,
   znika po FAZIE A wraz ze skróceniem tur.
2. „Świetnie. Teraz umawiam wizytę. Do widzenia." — trzy rzeczy w jednym zdaniu:
   pochwała, relacjonowanie, pożegnanie. Człowiek powiedziałby: „Dobrze,
   do zobaczenia w poniedziałek."
3. Relacjonowanie („teraz umawiam") — znika w FAZIE 2, bo nie będzie czego umawiać.

**Nie poprawiać punktowo — siódma sprzeczność jest ostatnią rzeczą, jakiej chcemy.**

## Kontrola sprzeczności w prompcie — mechaniczna

```bash
node scripts/check-prompt-rules.mjs
```

Pierwszy przebieg (06.08) dał liczby, które same są diagnozą:

```
prompt 18081 znaków, ~5166 tokenów
zdań nakazujących: 13   zakazujących: 36
fraz zakazanych dosłownie: 56
```

**Trzydzieści sześć zakazów i pięćdziesiąt sześć dosłownych cytatów.** To jest
odpowiedź na pytanie, dlaczego sześć razy z rzędu przeoczyliśmy sprzeczność:
prompt jest za duży, żeby go trzymać w głowie.

⚠️ **Narzędzie jest na razie zbyt hałaśliwe** — heurystyka wyciąga cytaty także
z przykładów POPRAWNYCH („Poprawnie: …"), więc wszystkie sześć „kolizji twardych"
z pierwszego przebiegu to fałszywe trafienia (słowa `dobrze`, `jutro`, `pani`
cytowane w obu rolach). Do dociągnięcia przy FAZIE C: rozróżnienie cytatu
zakazanego od wzorcowego wymaga oznaczenia ich w prompcie, a nie zgadywania.

## Kiedy przestajemy optymalizować

Agent jest gotowy **jako wzorzec**, gdy w **PIĘCIU ROZMOWACH Z RZĘDU**:

- rozmowa poniżej **1:10**
- tura poniżej **1,5 s** (mediana)
- zlecenie, wpis w grafiku, SMS i transkrypt powstają **za każdym razem**
- agent rozłącza się **sam, za pierwszym razem**
- **zero** halucynacji ASR

Po osiągnięciu tego progu **PRZESTAJEMY optymalizować** i przechodzimy do
multi-tenancy — nawet jeśli będzie kusiło zejść o kolejne 200 ms.

Powód: wzorzec to nie tylko prompt i architektura. To także `voice-agent-init`
obsługujący dowolnego tenanta i model danych działający dla fryzjera i hotelu —
a tego nie sprawdzimy, dopóki nie podepniemy drugiego klienta.

### Rutyna po każdej nieudanej rozmowie

Sprawdź, czy w transkrypcie nie ma przekręconej marki, i jeśli jest — **dopisz
alias** do `BRAND_ALIASES` w `_shared/voiceReconcile.ts`. Tablica działa wyłącznie
na tym, co do niej wpiszemy: odległość edycyjna nie zmapuje „Bamboo Exchange"
na „BMW", bo to podobieństwo fonetyczne, nie literowe. Dotąd zebrane:
`bambooexchange` i `bremboextensja` → BMW.

---

## 🔴 OTWARTE RYZYKO BEZPIECZEŃSTWA — trunk SIP bez ograniczeń

`GET /v1/convai/phone-numbers/phnum_4301ky85ype8e11aah6vjsezyvar`:

```
inbound_trunk.allowed_addresses: ["0.0.0.0/0"]
has_auth_credentials: false
username: null
media_encryption: "allowed"     (nie "required")
```

**Trunk przyjmuje połączenia z całego internetu, bez uwierzytelnienia.** Kto zna
adres SIP, może dzwonić na agenta i palić kredyty ElevenLabs — a to główny koszt
rozmowy (21 rozmów = 21,4 tys. kredytów przy koszcie LLM 0 $).

Do zamknięcia: zakres adresów IP SBC od SuperVoIP → wpisać w `allowed_addresses`
zamiast `0.0.0.0/0`. Zgłoszone do operatora 05.08.

Osobno, znalezione przy okazji: **siedem zadań cron ma token wpisany wprost
w treści** (`Bearer <wartość>` w `cron.job.command`). Zadania voice keep-warm
czytają go z Vault; pozostałe nie. Nie ruszane.

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
