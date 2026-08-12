# AI Voice Agent — stan projektu (2026-08-06)

**Punkt powrotu po utracie kontekstu. Ten dokument ma wystarczyć bez historii czatu.**
Spec dalszych prac: `docs/voice-agent-faza1.md`, `docs/voice-agent-faza2.md`
(tam jest **dwadzieścia zasad** wyprowadzonych z konkretnych awarii — przeczytaj je
przed dotknięciem czegokolwiek).

---

## 📍 GDZIE JESTEŚMY — przeczytaj to najpierw

**Stan na 10.08 wieczór: produkcja = `main`, potwierdzone SHA-256.** Gałąź
`tools/voice-call-diagnostics` scalona do `main` (PR #33), sześć funkcji wdrożonych
z `main`, nie z gałęzi.

### ⚠️ DLACZEGO SCALENIE BYŁO KONIECZNE — piąte cofnięcie

10.08 o **22:03:53** zbiorczy deploy (nikt świadomie go nie robił — do wyjaśnienia)
cofnął **wszystkie** funkcje głosowe do wersji z `main`. Produkcja stała wtedy z:
`client_type: 'private'` (żywy bug), `create_booking` w narzędziach modelu,
15× `maybeSingle()`, `postprocess` bez wywołania `voice-call-commit`, brak `/warmup`.

Powstała **hybryda gorsza niż rollback**: `voice-call-commit` i `voice-call-reconcile`
przetrwały (nie istnieją na `main`, więc deploy ich nie nadpisał), ale `postprocess`
przestał je wywoływać. Zapis po rozłączeniu nie działał, a agent znów pisał do bazy
w trakcie rozmowy starym, zabugowanym `create_booking`.

**Reguła na stałe: Lovable deployuje z `main`. Kod, którego tam nie ma, nie istnieje.**
Weryfikacja wyłącznie przez `functions download` + SHA-256 — numer wersji niczego nie dowodzi.

### Wynik 13 rozmów z 06.08 (jedyny materiał po wdrożeniu)

**Co działało:**
- 6 rozmów z terminem → **6 kompletnych zapisów** (klient, pojazd, rezerwacja, grafik ze
  `station_id`, zlecenie, transkrypt, SMS)
- **SMS po rozłączeniu w KAŻDYM przypadku** (18–36 s)
- **zero duplikatów, zero podwójnych SMS-ów** — sprawdzone zapytaniem o `appointment_id`
  z więcej niż jednym SMS-em: zbiór pusty. Potwierdzone na sześciu rozmowach, nie na jednej.
- cron `voice-call-reconcile` uratował `wfck4m3h`, gdy webhook nie dojechał (zapis 10 min
  po rozłączeniu). Dokładnie po to powstał.
- transkrypt 11/11
- **cztery rozmowy naraz nie spowolniły tur**: mediana 3,00 s wobec 2,87 s przy rozmowach
  pojedynczych, p90 4,66 vs 4,77. Współbieżność nie jest wąskim gardłem przed multi-tenancy.

**Latencja (metryki ElevenLabs, pula tur, przed → po):**

| metryka | 600 tokenów | 150 tokenów |
|---|---|---|
| cisza słyszana przez klienta | mediana 3,41 · p90 5,73 s | **2,92** · p90 4,77 s |
| TTFB naszej warstwy | 1,98 s | **1,73 s** |
| ogon generowania tekstu | śr. 1,01 · p90 **3,70** s | śr. 0,33 · p90 **0,71** s |
| ogon generowania narzędzia | mediana 0,74 s | **1,88 s** (gorzej) |
| `output_truncated` | **0** / 116 | **3** / 126 |

### 🔴 NAJDROŻSZY BŁĄD SESJI — `max_tokens` 150

`150` dobrałem z **jednej** rozmowy: najdłuższa wypowiedź 183 znaki ≈ 57 tokenów, więc
150 wyglądało na dwukrotny zapas. Na trzynastu rozmowach najdłuższa miała **249 znaków
≈ 78 tokenów**, a gdy w tej samej turze model generował wywołanie narzędzia, budżet się
kończył. Trzy ucięcia, wszystkie z `had_tool_calls: true`. Jedno z nich:

```
qrgbn9cy — klientka mówi po rosyjsku
   19s AGENT  Dobrze rozumiem. Przepraszam, nie zdążyłem dokończyć. Czy mogę powtórzyć krócej?
   42s AGENT  Przepraszam, nie zdążyłem dokończyć. Czy mogę powtórzyć krócej?
   → klientka rozłączyła się, ZERO zapisu
```

**Lekcja, do czytania przed każdą kolejną optymalizacją: pomiar na jednym przypadku to
nie pomiar.** To zasada 20 zastosowana do siebie — sam ją zapisałem i sam ją złamałem
tydzień później. Miernikiem, czy nowa wartość wystarcza, jest log `output_truncated`:
ma być zero.

`max_tokens` = **400** (5× zapas na realną wypowiedź plus wywołanie narzędzia). Nie 600:
ograniczenie działa, tylko było za ciasne.

### Co zostało — z liczbami

| problem | liczba | znika przy |
|---|---|---|
| tura o termin | **5,2–7,3 s**; `check_availability` 935–3916 ms | FAZA A |
| martwa ścieżka „Oddzwonić" | 4 rozmowy bez żadnego widocznego śladu | naprawa przed FAZĄ A |
| `end_call` nie pada | 3 z 13 rozmów; raz przedwcześnie | FAZA A (schemat zamykania) |
| wielojęzyczność | `language_presets` PUSTE, 3 złe reguły w bazie wiedzy | FAZA A |
| `config` na każdej turze | 140–506 ms | FAZA A |
| `asr.keywords` | **12 słów wróciło do konfiguracji** mimo ustalenia „puste na stałe" | do decyzji |

### 🔁 LISTA KONTROLNA KONFIGURACJI ELEVENLABS — sprawdzać przy KAŻDYM przeglądzie

| pozycja | wymagane | dlaczego |
|---|---|---|
| **`asr.keywords`** | **PUSTE** | **Wracały już dwa razy.** Przy 12 słowach ASR halucynował w 2 z 9 tur — słyszał „przegląd" i „rozrząd" tam, gdzie klient ich nie powiedział. Wyczyszczone 06.08 przez Ciebie, znów pełne 10.08. |
| `language_presets` | `ru`, `uk`, `en` | dziś PUSTE — `language_detection` nie ma na co przełączyć |
| `turn_timeout` | 4 s | 10 s dawało 2,52 s ciszy; 4 s dało 0,79 s |
| `silence_end_call_timeout` | 20 s | wartość **globalna**, brak osobnego progu dla fazy zamykającej |
| `max_duration_seconds` | 600 s | najdłuższa rozmowa 315 s = połowa limitu |

### ⚠️ SPROSTOWANIE: reguły językowe NIE były przyczyną

Napisałem 10.08, że trzy reguły w `voice_agent_knowledge` kazały agentowi zapowiedzieć
przełączenie języka. **To było błędne.** Te wpisy są `is_active = false`, a kod bierze
wyłącznie aktywne (RPC `get_voice_context`, `LIMIT 10`) — nigdy nie trafiły do promptu.
Co więcej, **powstały 06.08**, czyli zostały wydestylowane z tych właśnie rozmów: to
skutek błędu zapisany jako zalecenie, nie jego przyczyna.

Prawdziwa przyczyna angielskiej zapowiedzi: **brak jakiejkolwiek reguły o języku** —
ani w prompcie persony, ani w aktywnej bazie wiedzy — przy włączonym narzędziu
`language_detection`, które ElevenLabs podaje z **pustym opisem**. Model dostał gołe
narzędzie bez instrukcji i zachował się domyślnie.

**Ale przegląd bazy wiedzy znalazł coś gorszego, z dowodem przyczynowym.** Trzy z dziesięciu
AKTYWNYCH wpisów zawierają przykłady z konkretnymi godzinami i danymi osobowymi:
```
wpis 7bdc7302:  "Zaproponuj 2-3 opcje: 'Mamy dostępne 9:00, 11:00 lub 14:00'"
agent bj6t2qmm 52 s: "Mamy wolne jutro o dziewiątej, jedenastej lub czternastej"
```
Klientka prosiła o **środę przyszłego tygodnia**, a `check_availability` padł dopiero
na 90 s — godziny zostały **zmyślone 38 sekund wcześniej**, wprost z przykładu.
Do tego w prompcie każdej rozmowy siedziały: tablica rejestracyjna, fragment numeru
telefonu i imię prawdziwych klientów.

SQL naprawczy: `scripts/sql/voice-knowledge-sanitize-20260810.sql` (+ rollback).
**Czeka na zatwierdzenie, nie wykonany.**

### Następne kroki — JEDNA WERSJA PLANU

**Teraz, przed rozmową kontrolną:**
1. ~~scalenie do `main` + wdrożenie + weryfikacja SHA~~ ✅ 10.08
2. `asr.keywords` do wyczyszczenia w panelu — **Twoja ręka**
3. SQL `voice-knowledge-sanitize-20260810.sql` — czeka na zatwierdzenie
4. **rozmowa kontrolna** — sprawdzasz `max_tokens` 400 i czy produkcja wróciła

**Po rozmowie kontrolnej:**
5. naprawa martwej ścieżki „Oddzwonić" (`missingForCommit` blokuje commit przed RPC,
   a RPC ma pełną obsługę `bez_terminu`)
6. **FAZA A** — `voice-agent-init`: snapshot z nazwanymi dniami, czasy trwania usług,
   schemat zamykania (5 reguł), wielojęzyczność. Szczegóły w `voice-agent-faza1.md`.
7. **próg pięciu udanych rozmów** — do tego momentu ZERO nowych funkcji

**Po progu, w tej kolejności:**
8. widok „Połączenia" w panelu — dane są w bazie, zostaje sam interfejs
9. cennik i czasy trwania w snapshocie (bez tego agent nadal mówi „to zależy")
10. kategorie usług Warsztat / Myjnia — **pierwszy test kryterium generyczności**
    („czy zadziała dla fryzjera bez zmiany kodu", patrz `faza1.md`)
11. multi-tenancy: kreator agenta w portalu, numer techniczny jednym kliknięciem,
    metering minut

**Nic z punktów 8–11 przed progiem.**

### 🔴 BŁĄD Z ROZMOWY 11.08, KTÓREGO NIKT NIE ZAUWAŻYŁ — zły dzień tygodnia

Znaleziony przypadkiem, przy pisaniu testów modułu snapshotu: moje oczekiwanie się
nie zgadzało, a rację miał kalendarz.

```
klientka:  „poproszę o przyszły tydzień… wtorek na przykład, godzina szesnasta"
agent 3×:  „wtorek dziewiętnaście sierpnia"
klientka:  „to dziewiętnasty sierpnia, tak?"        ← upewniała się!
agent:     „Tak, wtorek dziewiętnaście sierpnia."

19.08.2026 to ŚRODA. Wtorek przyszłego tygodnia to 18 sierpnia.
```

**Sprawdzone w bazie 12.08:** rezerwacja stoi na `2026-08-19 16:00`, a SMS do klientki
brzmiał *„Cart78Garage: wizyta 2026-08-19 16:00"*. **Nie poprawiam jej po cichu** —
klientka ma 19. w SMS-ie ORAZ we własnym potwierdzeniu na głos, więc przyjedzie
najpewniej w środę. Przesunięcie na 18. zamieniłoby jeden błąd na drugi. Decyzja
należy do warsztatu: zostawić 19. albo zadzwonić i ustalić.

Agent pomylił **dzień tygodnia z datą**, potwierdził to klientce, gdy dopytała,
i zapisał rezerwację. Rozmawialiśmy o odmianie („dziewiętnaście" zamiast
„dziewiętnastego") i przeoczyliśmy, że **liczba też była zła**.

To jest najmocniejszy argument za nazwanymi dniami w snapshocie: model dostał datę
do wyliczenia i pomylił się w obie strony naraz. Przy liście `{ "do_wypowiedzenia":
"wtorek, osiemnastego sierpnia", "data": "2026-08-18" }` nie ma czego pomylić — nie
liczy, tylko wybiera.

### 🎯 „JESTEM PANIĄ, NIE JESTEM PANEM" — najlepszy dowód w całym śledztwie

```
bj6t2qmm, 06.08
   5s KLIENT  Dzień dobry. Ee, coś stucze w samochodzie moim. Nie wiem, co to jest.
  13s AGENT   Rozumiem, stuka w samochodzie. Mogę zaproponować wizytę w naszym
              warsztacie — kiedy byłoby dla PANA najwygodniej?
  22s KLIENT  Jestem panią, nie jestem panem.
```

Prompt ma na to regułę, i to stanowczą: *„Kolejność zbierania danych sprawia, że imię
poznajesz DOPIERO W CZWARTEJ TURZE. Wszystko przed nią musi być BEZOSOBOWE"*, z dopiskiem
„REGUŁA ZŁAMANA W PIERWSZYM ZDANIU PRAWDZIWEJ ROZMOWY".

A agent i tak powiedział „dla Pana" w trzynastej sekundzie — bo **reguła w bazie wiedzy
podawała mu to zdanie jako wzorzec**:

> `e7daef7a` [closing] → „Rozumiem. Mogę zaproponować wizytę w naszym warsztacie.
> Kiedy byłby **dla Pana** najwygodniejszy termin — jutro, czy może w innym dniu?"

**Przez tydzień poprawialiśmy to w prompcie sześć razy. Przyczyna siedziała w bazie,
której prompt nie widzi.** Zdanie z bazy było w dodatku silniejsze niż zakaz: konkretny
wzorzec do naśladowania bije ogólną regułę.

To jest dowód na zasadę 15 (trzy kierunki kontroli) i na zasadę 22 (przykład staje się
zachowaniem) w jednym cytacie.

### ✅ BAZA WIEDZY WYZEROWANA — 11.08, to jest STAN DOCELOWY

Aktywnych reguł: **0 z 75**. **To nie jest awaria i nie należy ich włączać z powrotem.**

Powody, każdy sprawdzony:
- 5 z 10 aktywnych było **wadliwych** — zmyślane godziny, nieaktualne daty, dane osobowe
- 3 z pozostałych **przeczyły promptowi** (wykryte niezależnie przez `voice-audit.mjs`):
  cyfry „grupami" wobec „OSOBNO", „zapisuję Pana teraz" wobec zakazu relacjonowania,
  „dla Pana" wobec formy bezosobowej
- wszystkie powstały 14.06–04.08, **przed** zebranymi rozmowami — pochodzenia nie da się
  zweryfikować, a automatyczne włączanie wyłączono dopiero 04.08, więc **żadna nie przeszła
  przez świadomą akceptację**
- **nie straciliśmy nic**: każda sensowna reguła jest w prompcie z kodu w wersji nowszej
  i mocniejszej (sprawdzone regułą po regule)

Zysk: trzy sprzeczności mniej i prompt krótszy o **2 146 znaków (~613 tokenów, 11%)**.

**Wiedza branżowa wraca do bazy wyłącznie przez bramkę** (`voiceLearningGate`): z rozmów
udanych, po redakcji danych osobowych i konkretów, z `is_active = false` do świadomej
akceptacji człowieka. Rollback istnieje (`voice-knowledge-reset-20260811-rollback.sql`),
ale jego użycie przywróci trzy znane sprzeczności.

### 🧪 CZEGO NIGDY NIE PRZETESTOWALIŚMY — audyt dziesięciu scenariuszy

Wszystkie 21 zebranych rozmów to umówienie wizyty przez osobę, która wie, jak z agentem
rozmawiać. Przeszukałem transkrypty; dla scenariuszy, które nie wystąpiły, sprawdziłem
w prompcie i bazie wiedzy, co agent zrobiłby **dziś**.

| # | scenariusz | wystąpił | co się stanie dziś |
|---|---|---|---|
| 1 | pytanie zamiast wizyty | ❌ 0/21 | **częściowo**. Godziny otwarcia i usługi są w `KONTEKST FIRMY` (agent poprawnie powiedział „pracujemy do siedemnastej"). Cena → „to będzie wiadomo po diagnozie" i **pętla**, którą widzieliśmy przez 152 s w `bj6t2qmm`. Brakuje reguły „klient nie chce wizyty" — sekwencja z promptu prowadzi do terminu bezwarunkowo. |
| 2 | odwołanie / przełożenie wizyty | ❌ 0/21 | 🔴 **NAJGROŹNIEJSZA LUKA.** `voiceExtraction` wykrywa `wants_cancel` i `wants_reschedule`, ale **nikt tych pól nie czyta** — ani `voice-call-commit`, ani RPC. Efekt: klient odwołuje wizytę, a system **zakłada mu drugą**. Zero reguł w prompcie. |
| 3 | auto już w warsztacie („kiedy gotowe?") | ❌ 0/21 | **nieobsłużone**. Brak reguły i brak narzędzia do odczytu statusu zlecenia. Sekwencja poprowadzi do umówienia kolejnej wizyty. |
| 4 | niezrozumiała wypowiedź | ✅ `bj6t2qmm` („Słucham? Jeszcze raz.") | **obsłużone** — blok `HAŁAS I NIEWYRAŹNA MOWA`: pytaj o jedną brakującą informację, nie zaczynaj od nowa. Zadziałało. |
| 5 | klient zdenerwowany, reklamacja | ❌ 0/21 | **nieobsłużone**. Zero reguł. Agent poprowadzi do umówienia wizyty, co przy reklamacji zabrzmi głucho. |
| 6 | pomyłka, zły numer | ❌ 0/21 | **nieobsłużone**, ale skutek łagodny: rozmowa skończy się rozłączeniem klienta albo `silence_end_call_timeout` po 20 s. |
| 7 | prośba o człowieka | ❌ 0/21 | 🔴 patrz niżej |
| 8 | cisza po odebraniu | ✅ 2 rozmowy (3 s, zero wypowiedzi) | **obsłużone konfiguracją**, nie promptem: `silence_end_call_timeout` = 20 s. Oba przypadki to rozłączenia po 3 s, więc realna cisza nie została sprawdzona. |
| 9 | klient przerywa agentowi | ✅ **14 z 21**, do 5 razy w rozmowie | **obsłużone** przez turn-taking ElevenLabs. Skutek uboczny: urwane zdanie agenta zostaje urwane (`me0bhctj`: „Cenę będzie wiadomo po diagnozie na…"). |
| 10 | dwie osoby mówią naraz | ❌ 0/21 | **nieobsłużone wprost**; ASR zwróci plątaninę, zadziała ścieżka ze scenariusza 4. |

#### Scenariusz 7 — dlaczego nie wolno go „naprawić" regułą w prompcie

- transferu do człowieka **nie ma**: narzędzia agenta w ElevenLabs to wyłącznie `end_call`
  i `language_detection`
- obietnice przełączenia siedziały w bazie wiedzy i **zostały skasowane 10.08**
- w prompcie **nie ma żadnej reguły** o prośbie o człowieka — model zaimprowizuje

Kuszące jest dopisanie „przekażę prośbę, obsługa oddzwoni". **Dziś byłoby to kłamstwo:**
tabela `callback_requests` **nie istnieje**, jedyny mechanizm to SMS do warsztatu za
stałą `CALLBACK_SMS_ENABLED = false`, a ścieżka zlecenia „Oddzwonić" jest **martwa**
(`missingForCommit` zatrzymuje commit przed RPC).

**Kolejność jest więc wymuszona: najpierw ożywić „Oddzwonić", potem dopiero wolno
obiecać oddzwonienie.** Reguła w prompcie bez działającego mechanizmu to zasada 11.

#### ⚠️ Prompt persony w bazie jest NIEAKTUALNY i sprzeczny z kodem

`ai_agents_config.system_prompt` dla `voice_workshop_secretary` (1357 znaków) wciąż zawiera:
- „**Umów wizytę przez `create_booking`**" — narzędzia nie ma od 06.08
- „poproś o **imię i nazwisko oraz numer telefonu**" — sekwencja tego nie robi

Blok budowany w kodzie mówi później coś przeciwnego („Masz JEDNO narzędzie:
`check_availability`", „NIE TWORZYSZ rezerwacji ani zlecenia", „NIE PYTAJ O NAZWISKO"),
więc w praktyce wygrywa — ale to jest dokładnie ta klasa sprzeczności, którą opisuje
zasada 15, tylko odwrócona: tym razem **kod nie widzi bazy**. Do poprawienia jednym
`UPDATE` przy najbliższej okazji; pokażę SQL.

### ⚠️ SPROSTOWANIE 12.08 — ZŁY `provider_id` W MOICH POMIARACH

Raportowałem „0 usług, 0 zasobów, 0 godzin pracy, 0 pozycji w zleceniach".
**Wszystkie te liczby były policzone dla identyfikatora, który nie istnieje.**

Zobaczyłem kiedyś skrócony `provider=664ed87b…` i **dopisałem resztę UUID z głowy**
zamiast go odczytać. To ten sam błąd, który popełniłem wcześniej z `function_id`
w zapytaniu o logi — druga odsłona tego samego wzorca.

```
zmyślony:    664ed87b-b1e4-4b28-9db2-2a3b40e8a5b6   → wszędzie zero
prawdziwy:   664ed87b-a20f-457b-a9fa-97ca13dcae7c   → Cart78Garage
```

**Stan faktyczny warsztatu (Cart78Garage):**

| tabela | ile | wniosek |
|---|---|---|
| `provider_services` | **7** | cennik JEST, tylko 1 pozycja ma `duration_minutes` |
| `workshop_workstations` | **6** | stanowiska SĄ |
| `workshop_orders` | **121** | |
| `workshop_order_items` | **569** | **jest z czego zaimportować usługi** |
| `booking_resources` | 0 | tabela generyczna nieużywana — to było prawdą |
| `service_working_hours` | 0 | godziny siedzą w `service_providers.working_hours` |

Trzy moje wcześniejsze odpowiedzi były wobec tego błędne: „warsztat nie ma cennika",
„nie ma czego zaimportować" i „snapshot nie będzie miał skąd wziąć danych".

**Lekcja do zasady 21:** identyfikatora nigdy nie uzupełniaj z pamięci. Skrócony
identyfikator w raporcie jest dobry do czytania, nie do zapytania — do zapytania
pobiera się pełny. Zapytanie na zmyślonym identyfikatorze **nie zwraca błędu**,
tylko pustkę, która wygląda jak prawdziwe zero.

### 🔴 POZYCJE BEZPIECZEŃSTWA — do zamknięcia PRZED pierwszym prawdziwym klientem

| pozycja | stan |
|---|---|
| **dane osobowe w bazie wiedzy** | ✅ **zamknięte 10.08** — zero aktywnych wpisów z danymi; filtr `redactPersonalData` w destylatorze |
| dane osobowe w 14 NIEAKTYWNYCH wpisach | ⚠️ otwarte — bezczynne, ale ożyją, jeśli ktoś je włączy w panelu |
| trunk SIP otwarty na `0.0.0.0/0` | ⚠️ otwarte |
| `AI_SECRETS_ENC_KEY` nieustawiony | ⚠️ otwarte — Twilio i Deepgram leżą niezaszyfrowane w `ai_secret_store` |
| 7 crontabów z tokenem wprost w treści zadania | ⚠️ otwarte |

**Incydent 10.08 — dane osobowe w prompcie każdej rozmowy.** Trzy AKTYWNE wpisy bazy
wiedzy zawierały tablicę rejestracyjną, fragment numeru telefonu i imię prawdziwego
klienta. `voice_agent_knowledge` jest wstrzykiwana do promptu **każdej** rozmowy
u **każdego** klienta tego warsztatu, a panel jej nie pokazuje.

Zasięg — sprawdzony, nie założony:

| miejsce | wynik |
|---|---|
| `voice_agent_knowledge`, aktywne | ✅ zero po sanityzacji |
| `voice_agent_knowledge`, nieaktywne | ⚠️ **14 z 75** wpisów; bezczynne |
| `ai_agents_config.system_prompt` | ✅ zero |
| `voice_agent_personas` | ✅ zero |
| `voice_call_outcomes.winning_phrases` | ✅ zero |
| logi funkcji `chat`/`llm`/`tools`, 7 dni | ✅ zero — logujemy długości i skróty, nie treść |
| `voice_transcripts`, `voice_call_outcomes.customer_data`, `voice_calls.summary` | zawierają dane, ale **to rekord własnej rozmowy klienta** — legalne i zamierzone |

Rozróżnienie, które tu decyduje: dane w rekordzie **własnej** rozmowy są w porządku;
dane wstrzykiwane w prompt **cudzej** rozmowy to incydent.

**Naprawa systemowa** (`_shared/voiceLearningGate.ts`, 13 asercji):
1. `redactPersonalData` przed każdym zapisem do bazy wiedzy — telefon cyframi i słownie,
   tablica, VIN, e-mail, imię w wołaczu, a także godzina, data i kwota (zasada 22)
2. `shouldDistill` — **uczymy się tylko z rozmów udanych**: brak zapisu, rozmowa krótsza
   niż 30 s, `output_truncated` albo przeprosiny agenta → brak destylacji, rozmowa idzie
   do przeglądu (`status = needs_review`)
3. **aktywna reguła nie jest już przepisywana po cichu.** Gwarancja „nowa reguła czeka
   na akceptację człowieka" obejmowała tylko wstawianie — gałąź aktualizacji podmieniała
   treść AKTYWNEGO wpisu bez niczyjej zgody. To była droga, którą dane osobowe mogły
   wrócić do włączonej reguły.

⚠️ Bramka wymaga `duration_seconds` i `order_id` w żądaniu do `voice-call-analyze`.
`voice-call-postprocess` ich **nie przekazywał** — bez tego bramka widziałaby każdą
rozmowę jako zerowej długości bez zapisu i zablokowałaby uczenie ZAWSZE, po cichu.
Dopisane przy tej samej zmianie.

### 📎 DWIE LEKCJE Z 10.08 — obie o rzeczach, których nie szukałem

**1. Gwarancja obejmująca jedną operację nie obejmuje pozostałych.**
Cały mechanizm auto-reguł opierał się na zdaniu „nowa reguła czeka na akceptację
człowieka". Gwarancja była zaimplementowana wyłącznie w `INSERT` (`is_active: false`).
Gałąź `UPDATE` — wykonywana, gdy wpis o tej samej `situation` już istnieje — podmieniała
`recommended_response` **aktywnej** reguły bez niczyjej zgody. Reguła zatwierdzona raz
mogła po cichu zmienić treść.
**Jak stosować: przy każdej regule „wymaga akceptacji" sprawdź `INSERT`, `UPDATE`
i `UPSERT` osobno.** Zabezpieczenie jednej ścieżki zapisu nie zabezpiecza pozostałych.

**2. Zabezpieczenie potrafi zablokować wszystko po cichu.**
Bramka uczenia potrzebuje `duration_seconds` i `order_id`. `voice-call-postprocess`
nie przekazywał ani jednego, ani drugiego — bramka widziałaby każdą rozmowę jako zerowej
długości bez zapisu i odrzucała **zawsze**. Brak nowych reguł wygląda dokładnie tak samo
jak „rozmowy nie wniosły nic nowego", więc nikt by tego nie zauważył.
**Kontrola wdrożona** (`voice-call-reconcile`): jeśli w oknie 7 dni były rozmowy,
a destylator nie dopisał żadnej reguły **i** nie oznaczył żadnej rozmowy do przeglądu —
log `distiller_silent` na poziomie `error`. Liczby (`rozmow_7dni`, `nowych_regul_7dni`,
`do_przegladu_7dni`) idą w **każdym** wpisie crona, nie tylko przy alercie, żeby trend
był widoczny zanim zrobi się źle.

### Dług do sprzątnięcia (nie teraz)

- 13 wystąpień `create_booking`/`create_order` w `voice-agent-chat` jako komentarze
  i martwa obsługa wyników. Nie wpływa na zachowanie — model nie może wywołać czegoś,
  czego nie ma w `tools` — ale przy następnym czytaniu kodu ktoś pomyśli, że narzędzia działają.
- `voice-model-benchmark` — funkcja tymczasowa, FAZA D rozstrzygnięta, do usunięcia
- 72 nieaktywne wpisy w `voice_agent_knowledge`, których panel nie pokazuje

### Czego NIE DA SIĘ już zrobić

**Porównania ekstrakcji ze starą ścieżką.** Punkt 6 usunął drugie źródło danych, zanim
zdążyłem porównać wyniki. Lekcja: okno, w którym stara i nowa ścieżka działają
równolegle, planuje się PRZED przełączeniem, nie po.

**Przypisania logów do rozmowy przy rozmowach nakładających się.** Nasze logi nie
zawierają `conversation_id` (celowo — dane osobowe). **Metodologia obowiązująca:**
czasy tur z metryk `convai_*` ElevenLabs, logi wyłącznie do tego, czego ElevenLabs
nie widzi (narzędzia po naszej stronie, ucięcia).

---

## ⭐ ZASADA PRODUKTOWA: rozwiązanie, które działa tylko u nas, to obejście

**Budujemy produkt dla WSZYSTKICH warsztatów, nie narzędzie dla naszego.**
Każdy mechanizm ma działać dla warsztatu, który zakłada konto DZISIAJ i ma zero historii.

Skąd: 12.08 przygotowałem propozycję cennika wygenerowaną z 569 pozycji historii zleceń —
prawdziwe ceny z wykonanych napraw, mediany, widełki, daty ostatniego wykonania.
Robota była poprawna i **została odrzucona w całości**, bo zadziałałaby **raz, u nas**.
Nowy warsztat nie ma 569 pozycji. Ma zero.

**CENY POCHODZĄ WYŁĄCZNIE Z KARTY USŁUG (`provider_services`).** Jedno źródło.
Warsztat wpisuje swoje ceny sam, przez panel. Agent czyta tylko stamtąd — nie z historii
zleceń, nie z innych warsztatów, nie z bazy referencyjnej. Każdy warsztat ma swoje ceny
i tylko on decyduje, co agent mówi jego klientom.

Pusty cennik to **poprawny stan nowego warsztatu**, nie awaria: agent mówi wtedy
„wycenimy po obejrzeniu auta" i proponuje termin.

Test przy każdej decyzji, obok „czy zadziała dla fryzjera bez zmiany kodu":
**czy zadziała dla warsztatu, który założył konto dziś rano?**

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

1. ~~`max_tokens` 600 → 150~~ — ✅ wdrożone 06.08
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
