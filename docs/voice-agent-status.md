# AI Voice Agent — stan projektu (2026-08-06)

**Punkt powrotu po utracie kontekstu. Ten dokument ma wystarczyć bez historii czatu.**
Spec dalszych prac: `docs/voice-agent-faza1.md`, `docs/voice-agent-faza2.md`
(tam jest **dwadzieścia zasad** wyprowadzonych z konkretnych awarii — przeczytaj je
przed dotknięciem czegokolwiek).

---

## 📍 GDZIE JESTEŚMY — przeczytaj to najpierw

**Architektura po przełączeniu (06.08):** agent w trakcie rozmowy **nic nie zapisuje**.
Zbiera dane, a cały zapis robi `voice-call-commit` po rozłączeniu, w jednej transakcji.

### Ostatnia rozmowa: `conv_0501kza5m07xfm59hg6vxkrwbway`, 06.08 00:54, **1:16**

```
tury:  2,4 / 1,6 / 5,1 / 1,7 / 1,5 / 1,4 / 3,2 s     (najkrótsza rozmowa dotąd)
tura z podsumowaniem:  7,1 s  →  1,4 s
```

Commit dowiózł komplet — **16 sekund PO rozłączeniu**:
```
1 rezerwacja · 1 wpis w grafiku (ze station_id) · 1 zlecenie ZLP-08/2026-001
1 transkrypt · 1 SMS (23:56:28 wobec końca rozmowy 23:56:12)
voice_calls: status=completed, linked_entity_type=workshop_order, outcome=booked
complaint = słowa klienta: „Stuka na nierównościach i ogólnie chciałbym przejechać samochód"
nazwisko: z BAZY („Moshechkov"), nie z ASR
```

### Co zostało — z liczbami

| problem | liczba | znika przy |
|---|---|---|
| tura o termin | **5,1 s** — `check_availability` 1321 ms, z czego **626 ms (47%) to preambuła funkcji**, nie liczenie terminów | FAZA A |
| `end_call` | **1082 ms** na generowanie wywołania PO wypowiedzeniu tekstu (`first_text` 1340 vs `model_round` 2422) | `max_tokens` 150 |
| zacinanie / nakładanie audio | dwa równoległe żądania na turach **41 s i 58 s** (tura „Jedenasta w piątek siódmego — świetnie…") | FAZA A |
| `config` na każdej turze | **140–506 ms** | FAZA A (kontekst z webhooka) |

### ⚠️ Czego NIE DA SIĘ już zrobić — lekcja o kolejności prac

**Porównania ekstrakcji ze starą ścieżką.** Punkt 6 (wyłączenie `create_booking`
i `create_order`) usunął drugie źródło danych, zanim zdążyłem porównać wyniki.

**Lekcja: porównanie starej i nowej ścieżki trzeba zrobić ZANIM stara zniknie,
a nie po.** Przy każdym przełączeniu architektury zaplanuj okno, w którym obie
działają równolegle i da się je zestawić.

### Następne kroki, w kolejności

1. **`max_tokens` 600 → 150** — w trakcie. Zdejmuje ogon generacji po tekście.
2. **FAZA A** — webhook inicjujący ze snapshotem (terminy, godziny pracy, cennik,
   `caller_id_available`). Usuwa turę 5,1 s i `config` z każdej tury.
3. **Próg pięciu udanych rozmów** — patrz „Kiedy przestajemy optymalizować".
4. **Multi-tenancy** — przedtem koniecznie przeczytaj sekcję o ścieżkach stanu
   początkowego: drugi warsztat trafi we wszystkie naraz, pierwszego dnia.

---

---

## ⭐ ZASADA NADRZĘDNA

# AGENT ROZMAWIA I NOTUJE. NIC NIE ROBI W SYSTEMIE.

Wszystko, czego potrzebuje, dostaje **ZANIM klient zacznie mówić** — snapshot przy
odebraniu połączenia, w trakcie odtwarzania powitania (za darmo, bo powitanie i tak
trwa ~3 s): wolne terminy, godziny pracy i dni wolne, cennik usług, dane firmy,
`caller_id`, historia klienta.

**W trakcie rozmowy: ZERO wywołań.** Agent czyta z kontekstu i mówi.

**Po rozłączeniu: portal robi wszystko** — rezerwacja, zlecenie, grafik, SMS,
transkrypt. Jedna transakcja, bez presji czasu.

### Jedyne wyjątki

**Pytanie o cenę lub usługę:**
1. jest w katalogu → agent podaje z katalogu
2. nie ma w katalogu → „wycenimy na miejscu, przed naprawą"
3. klient nalega → „przekażę, pracownik oddzwoni" → `callback_requests` + SMS do warsztatu

**Agent NIGDY nie zgaduje ceny.**

**Termin spoza snapshotu** → `check_availability` z jawną zapowiedzią
„chwileczkę, sprawdzę dalsze terminy".

### Dowód liczbowy

```
tura bez operacji          795 ms  … 2 400 ms
tura z check_availability  4 900 ms
tura z zapisem            7 100 ms … 10 752 ms
```

**Każda przyszła zmiana ma być z tym zgodna. Jeśli któraś funkcja wymaga wywołania
w trakcie rozmowy — to znak, że projekt jest zły, nie że potrzebny jest wyjątek.**

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

**Korekta uzasadnienia:** `voice_transcripts.call_id` ma FK do `voice_calls(id)`,
więc transkrypt **zawsze** wisiał na rozmowie, nie na zleceniu. Dane już są —
`OrderCallPanel` szuka ich wyłącznie od strony zlecenia, więc bez zlecenia są
nieosiągalne z panelu, ale nie zaginęły.
**Widok ODSŁANIA dane, nie ratuje — jest więc tańszy, niż zakładaliśmy.**
Zakładka obok Rezerwacji, licznik nieobsłużonych. Lista: data, numer, czas trwania,
wynik, link do zlecenia, transkrypt do rozwinięcia. Filtr domyślny: tylko
problematyczne. Przycisk „Utwórz zlecenie ręcznie". Plus `callback_requests`
w tej samej warstwie.
Uzasadnienie: **dziś awarie są niewidzialne** — warsztat nie ma jak się dowiedzieć,
że stracił klienta.

### E. Rozmowa o ISTNIEJĄCEJ rezerwacji — projektować przy FAZIE A

Snapshot dostaje pole **aktywne rezerwacje tego numeru** (data, godzina, usługa,
pojazd). To załatwia rozpoznanie intencji: jeśli klient ma wizytę, agent zaczyna
od niej — „Dzień dobry, widzę wizytę jutro o jedenastej — w tej sprawie?" —
co skraca rozmowę powracającego klienta do dwóch tur.

**1. „Na kiedy mam wizytę?"** — tylko odczyt, agent odpowiada z kontekstu, zero wywołań.

**2. „Chcę przełożyć"** — odczyt + zapis po rozmowie. Commit: anuluj starą, utwórz
nową, **jeden** SMS z nowym terminem.

**3. „Chcę odwołać" — TU JEST PUŁAPKA.** Odwołanie MUSI się wykonać. Jeśli agent
powie „odwołane", a commit padnie, warsztat czeka na klienta, który nie przyjedzie.
Dlatego **agent NIE mówi „odwołane"**, tylko: „Przekażę do odwołania, potwierdzenie
przyjdzie SMS-em." **SMS jest dowodem, nie obietnicą.**
Gdy commit się nie uda → rozmowa do kolejki ze statusem `cancel_failed`
**plus alert**, bo slot zostaje zajęty przez kogoś, kto nie przyjdzie.

Do wdrożenia **po** progu pięciu udanych rozmów.

### F. 🔴 Numeracja zleceń zwraca numery do obiegu — PRIORYTET WYSOKI

`next_workshop_order_number` szuka **najmniejszego nieużywanego numeru od 1 do max+1**,
więc skasowanie zlecenia **oddaje jego numer następnemu**. Potwierdzone 06.08:
po usunięciu sierpniowych zleceń testowych kolejne dostało `ZLP-08/2026-001` —
numer, który już był u klienta na SMS-ie.

Właściwe zachowanie: **numer raz nadany nigdy nie wraca, licznik idzie tylko w górę.**

Zmiana dotknie też zleceń zakładanych ręcznie w panelu, więc trzeba to **zaplanować,
nie załatać**. Do zrobienia PO dry_run i po wdrożeniu commitu.

### G. Dwie tabele stanowisk — dług do rozstrzygnięcia

```
workshop_stations       2 wiersze   ← workshop_orders.station_id
workshop_workstations  12 wierszy   ← workshop_orders.workstation_id, grafik, check_availability
```
Pytanie do wyjaśnienia: **czy obie są używane, czy jedna to pozostałość.**
Dziś kod agenta używa wyłącznie `workshop_workstations`.

### 🔴 LEKCJA OGÓLNA: ŚCIEŻKI STANU POCZĄTKOWEGO SĄ TESTOWANE NAJRZADZIEJ

Do przeczytania **przed podpięciem drugiego tenanta.**

Każda ścieżka, która wykonuje się **raz na klienta i nigdy więcej**, jest testowana
najrzadziej — a psuje się u **każdego nowego użytkownika**:

- pierwszy klient (INSERT do `workshop_clients`) — **złapane**: `client_type: "private"`
  łamał CHECK i wywalał każdą pierwszą wizytę nowej osoby
- pierwszy provider bez statusów zleceń
- pierwszy miesiąc bez wpisu w liczniku numeracji
- pierwsza rozmowa bez wiersza w `voice_calls`
- pierwszy pojazd, pierwsza kategoria usług, pierwszy wpis w grafiku

Tester po pierwszym teście **istnieje w bazie**, więc te ścieżki przestają się
wykonywać i nikt ich już nie dotyka.

**To jest wprost ryzyko przy multi-tenancy: drugi warsztat trafi we WSZYSTKIE
te ścieżki naraz, pierwszego dnia.**

**Do stosowania:** każdy scenariusz tworzący cokolwiek po raz pierwszy testuj
osobno, z danymi, których w bazie nie ma — najlepiej w `BEGIN … ROLLBACK`.

### 🔴 LEKCJA: ścieżka NOWEGO klienta jest systematycznie nietestowana

`client_type: "private"` łamał `workshop_clients_client_type_check`
(dopuszcza tylko `individual` i `company`), więc **`create_order` wywalał się
przy KAŻDYM nowym kliencie** — czyli przy pierwszej wizycie każdej nowej osoby.
Na produkcji objawiało się jako `tool ok=false` bez podania przyczyny.

To druga połowa zagadki zer w zleceniach: `recentOrder` blokował klientów
**istniejących**, `client_type` **nowych**. Razem zamykają wszystkie przypadki.

**Nie znalazłbym tego bez `BEGIN … ROLLBACK`, bo tester jest już w bazie** —
INSERT się nie wykonywał, więc ścieżka nigdy nie była dotykana.

**Wniosek do stosowania:** tester po pierwszym teście zawsze istnieje w bazie,
więc ścieżka nowego klienta jest nietestowana z definicji. **Każdy scenariusz
dotykający tworzenia klienta, pojazdu albo zlecenia testuj OSOBNO z danymi,
których w bazie nie ma.**

### H. Wiszące `linked_entity_id` — brak klucza obcego

`voice_calls.linked_entity_id` **nie ma FK**, więc każde skasowane zlecenie
zostawia wskaźnik donikąd. Stan 06.08: **14 wierszy wskazuje na `workshop_order`,
z czego ZERO zleceń nadal istnieje.** Panel pokaże „brak rozmowy" albo błąd.
Uniemożliwiło to też porównanie ekstrakcji z danymi historycznymi w dry_run.

### I. Alert dla zleceń „Oddzwonić" starszych niż 4 godziny

SMS-a przy braku terminu **nie wysyłamy** — „oddzwonimy" to obietnica bez terminu
wykonania, a nie dowód, i obraca się przeciwko warsztatowi. Poza tym nie ma czego
załączyć: bez rezerwacji nie ma tokenu ani linku `/r/`.
Zamiast tego: **powiadomienie do warsztatu** przy zleceniach „Oddzwonić" starszych
niż 4 godziny. Pilnowanie reakcji zamiast jej zapowiadania. Razem z widokiem
„Połączenia".

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

## 🔴 voice-agent-tools NIE JEST W KEEP-WARM — zimny start ~2,9 s

Pomiar 06.08 00:41, nowa instrumentacja:

```
pierwsze check_availability   3 999 ms
drugie check_availability     1 092 ms
różnica                       2 907 ms   ← zimny start
```

Crony `voice-keep-warm-llm` i `voice-keep-warm-chat` istnieją; **`voice-agent-tools`
nie ma ani `/warmup`, ani wpisu w cronie**. Pierwsze wywołanie narzędzia w KAŻDEJ
rozmowie płaci zimny start.

To najtańsza niewykorzystana poprawka, jaką mamy — ale FAZA A i tak usuwa narzędzia
z rozmowy, więc zysk byłby tymczasowy. Do decyzji właściciela.

## Rozbicie create_booking (nowa instrumentacja, 06.08 00:41)

```
TOTAL                2 881 ms
  rezerwacja_insert    253 ms
  stanowiska_select    125 ms
  grafik_insert        262 ms
  zlecenie_http        938 ms   ← wywołanie samego siebie po HTTP
  ──────────────────────────
  zmierzone          1 578 ms
  NIEZMIERZONE       1 303 ms   ← 45% !
```

⚠️ **Zinstrumentowałem cztery operacje z jedenastu.** Poza pomiarem zostały:
odczyt `voice_agent_configs`, find-or-create `voice_calls`, dedup `service_bookings`,
select grafiku, sprawdzenie SMS, odczyt `service_providers`, `linkConversation`.
Te 1303 ms rozkłada się na siedem zapytań, których nie widać.
`check_availability` nie jest zinstrumentowany w ogóle.

## ✅ PIERWSZA ROZMOWA NA NOWEJ ARCHITEKTURZE (06.08 00:54)

Rozmowa **1:16**, siedem tur, komplet zapisu **po rozłączeniu**:

```
tury:  2,4 / 1,6 / 5,1 / 1,7 / 1,5 / 1,4 / 3,2 s
zapis: 1 rezerwacja · 1 grafik · 1 zlecenie ZLP-08/2026-001 · 1 transkrypt
SMS:   23:56:28, rozmowa skończyła się 23:56:12  →  16 s PO rozłączeniu
voice_calls: status=completed, linked_entity_type=workshop_order, outcome=booked
```

`complaint` to słowa klienta: „Stuka na nierównościach i ogólnie chciałbym
przejechać samochód". Tura z podsumowaniem **7,1 s → 1,4 s**.

⚠️ **Porównania ekstrakcji ze starą ścieżką NIE DA SIĘ już zrobić** — wyłączenie
narzędzi zapisujących (punkt 6) usunęło ścieżkę, z którą miałem porównywać.
Kolejność prac to przesądziła; nie ma drugiego źródła danych z tej samej rozmowy.

### Gdzie naprawdę siedzi opóźnienie przy rozłączeniu

`end_call` **nie jest opóźniony**:
```
69s  klient: "Nie, to wszystko"
74s  agent:  "Do widzenia."        ← 5 s PRZED pożegnaniem, nie po
74s  end_call
75s  end_call_success
76s  koniec
```
Od pożegnania do ciszy: **2 s**. Pięć sekund, które słychać, jest **przed**
pożegnaniem: 0,8 s wykrywania ciszy + 1,34 s nasz TTFT + TTS i orkiestracja.

Jedna rzecz do wyciśnięcia: `model_round` 2422 ms wobec `first_text` 1340 ms —
model spędził **1,1 s po wypowiedzeniu tekstu na wygenerowaniu wywołania
`end_call`**, a ElevenLabs czeka na całą generację. To argument za
`max_tokens 600 → 150`: mniej do zaplanowania, krótszy ogon.

### `check_availability` rozbity co do zapytania

```
TOTAL 1321 ms
  konfig_select      232      ) preambuła KAŻDEGO wywołania narzędzia
  rozmowa_select     165      ) 626 ms, czyli 47% —
  rozmowa_insert     229      ) NIE liczy dostępności
  godziny_pracy      357      \
  stanowiska_count   151       > właściwa praca: 693 ms
  zajetosc_select    185      /
```
Suma kroków = total, więc **nic się nie ukrywa** i to nie jest zimny start
(keep-warm działa). **Prawie połowa czasu narzędzia to preambuła funkcji**, nie
liczenie terminów — znika razem z narzędziem w FAZIE A.

## Punkt odniesienia: 795 ms — szybkość JUŻ jest, tylko niewidoczna

Tura bez narzędzi w rozmowie 06.08 00:26: **795 ms**. To jest cel, który sobie
postawiliśmy, i on **już został osiągnięty** — tylko przesłaniają go tury
z narzędziami (4,9 s, 5,3 s, 12,0 s).

**Nie budujemy szybkości, tylko ją odsłaniamy.**

Budżet po FAZIE 2 + FAZIE A:
```
config     0 ms   (z webhooka inicjującego)
hop     ~160 ms   (FAZA B, po rozdzielonym pomiarze)
chat     ~14 ms
model   ~800 ms
─────────────────
        ~975 ms
```
Cel 0,9–1,1 s jest realny **bez zmiany modelu i bez FAZY C**.

## ⚠️ ZASADA PRACY: własne szacunki weryfikuj pomiarem, zanim staną się założeniem

Dwie korekty własnych oszacowań w jednej sesji, obie moje:

1. **„2,3 s w potoku ElevenLabs"** — okazało się zimnym startem naszych funkcji.
2. **„775 ms narzutu naszej ścieżki"** — okazało się ~545 ms; przypisałem sobie
   230 ms, których tam nie ma (budowa promptu to 1–2 ms, nie 370).

W obu przypadkach oszacowanie zdążyło wejść do planu, zanim ktokolwiek je zmierzył.
Liczba bez pomiaru jest hipotezą i ma być tak nazwana.

## Otwarte: nakładające się głosy

Rozmowa 06.08 00:26 miała **zero równoległych żądań** (osiem tur, osiem
`execution_id`), a właściciel i tak słyszał nakładające się dźwięki.
**Jeśli po FAZIE A objaw nadal wystąpi — zgłaszamy do ElevenLabs z `conversation_id`**,
bo wtedy na pewno nie pochodzi od nas.

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

### Architektura zapisu — przełączona 06.08
| Element | Stan |
|---|---|
| `voice-call-commit` — cała ścieżka po rozłączeniu | ✅ |
| `voice_commit_call` — jedna transakcja SQL, idempotencja po `conversation_id` | ✅ |
| `voiceExtraction` (parser czysty) + `voiceReconcile` (dopasowanie) | ✅ 31 asercji |
| `create_booking` / `create_order` **usunięte** z narzędzi modelu | ✅ |
| `check_availability` — jedyne pozostałe narzędzie | ✅ |
| `voice-call-postprocess`: commit → analyze, błąd analyze nie wywraca webhooka | ✅ |
| `voice-call-analyze` bez heurystyki po telefonie (piąte miejsce zasady 16) | ✅ |
| `voice-call-reconcile` — cron `*/15`, okno 3 h, siatka pod webhookiem | ✅ |
| SMS jako **ostatni** krok, tylko przy zleceniu z terminem | ✅ |
| statusy „Wymaga uwagi" i „Oddzwonić" dla 7 providerów | ✅ |
| zlecenie bez terminu → `ZL`, bez grafiku, status „Oddzwonić" | ✅ |

### Wydajność
| Element | Efekt |
|---|---|
| `get_voice_context` — 4 zapytania → 1 RPC | `prepare` 250–1070 ms → **8 ms** |
| env-first w `getPhase1Secret` | `auth` 140–820 ms → **0–1 ms** |
| prompt caching (`cache_control: ephemeral`) | 100% trafień, `model_round` 1211–6322 → 777–1878 ms |
| keep-warm: `llm`, `chat`, **`tools`** (co minutę, token z Vault) | zimny start narzędzia −2,9 s |
| `turn_timeout` 10 s → 4 s (panel) | cisza 2,52 → **0,79 s** — największy pojedynczy zysk |
| `asr.keywords` wyczyszczone **na stałe** | halucynacje ASR: 2/9 tur → **0** |
| instrumentacja `voice-agent-tools` 14/14 + `prompt_ready` w chat | — |

### Zachowanie agenta
| Element | Stan |
|---|---|
| sekwencja pięciotorowa, bez pytania o nazwisko i telefon | ✅ |
| `caller_id` ze znacznika RIDO (`used_source: system_marker`) | ✅ |
| `caller_id_available` — przy zastrzeżonym numerze agent pyta | ✅ |
| `end_call` w tej samej turze co pożegnanie | ✅ |
| sześć sprzeczności w prompcie usuniętych | ✅ |
| kontrola sprzeczności `scripts/check-prompt-rules.mjs` | ⚠️ zbyt hałaśliwa, do FAZY C |

## Kolejka

1. **`max_tokens` 600 → 150** — w trakcie
2. **FAZA A** — `voice-agent-init`: snapshot terminów, godziny pracy, cennik,
   `caller_id_available`, historia klienta. Usuwa `check_availability` z rozmowy
   i `config` z każdej tury.
3. **Próg pięciu udanych rozmów** (patrz „Kiedy przestajemy optymalizować")
4. **Multi-tenancy** — drugi tenant
5. FAZA B (scalenie llm+chat) — **tylko jeśli** pomiar hopu pokaże powyżej 0,2 s
6. FAZA C (przepisanie promptu) — jako dług techniczny, **nie** jako optymalizacja
   latencji: benchmark pokazał, że rozmiar promptu prawie nie wpływa na TTFT

**FAZA D (zmiana modelu) ODPADŁA** — Haiku jest najszybszy z dostępnych
(624 ms wobec 1132 ms Gemini 2.5 i 2120 ms Gemini 3 Flash, mierzone z eu-central-1).

### Odłożone
- alert dla zleceń „Oddzwonić" starszych niż 4 h (backlog I)
- widok „Połączenia" w panelu (backlog C) — ODSŁANIA dane, nie ratuje
- numeracja zleceń zwraca numery do obiegu po skasowaniu (backlog F, **priorytet wysoki**)
- dwie tabele stanowisk — czy obie używane (backlog G)
- wiszące `linked_entity_id` bez FK (backlog H)
- kategorie usług (Warsztat / Myjnia) — projektować przy FAZIE A
- rozmowa o istniejącej rezerwacji: odczyt / przełożenie / odwołanie (backlog E)
- Twilio/Deepgram niezaszyfrowane w `ai_secret_store`, `AI_SECRETS_ENC_KEY` nieustawiony
- siedem crontabów z tokenem wprost w treści zadania
- `CALLBACK_SMS_ENABLED = false`
- cięcie promptu do bazy wiedzy

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
