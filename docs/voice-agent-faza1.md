# FAZA 1+2 — pliki i kontrakty

Cel w jednym zdaniu: **agent rozmawia szybko i naturalnie, a po rozłączeniu system
NIEZAWODNIE tworzy zlecenie, wpis w grafiku i SMS.** Wszystko poza tym jest drugorzędne.

Kryteria odbioru:
- `stage prepare` ≈ 0 ms, tura poniżej **1,2 s**
- rozmowa z kompletem danych → zlecenie + grafik + SMS + transkrypt, **zawsze**
- zero zapisów w trakcie rozmowy poza miękką blokadą slotu

---

## 0. Odkrycie, które zmienia zakres

`conversation_id` i numer dzwoniącego **już są dostępne** — jako systemowe zmienne
dynamiczne ElevenLabs. Zrzut z rozmowy `conv_8501kz7ks42ze1hva18zp5d13srn`:

```
system__conversation_id = conv_8501kz7ks42ze1hva18zp5d13srn
system__caller_id       = +48519474583
system__called_number   = +48221015896
system__call_sid        = SCL_Ubw8FhnqDXiv
system__timezone        = Europe/Warsaw
system__time            = Wednesday, 02:06 05 August 2026
```

Nadpisywanie promptu jest dozwolone (`overrides.agent.prompt.prompt: true`), a zmienne
systemowe podstawiają się w prompcie. Prompt trafia do Custom LLM jako wiadomość
`system` — którą **dziś wyrzucamy** (`voice-agent-llm:182`).

**Wniosek: korelacja rozmowy nie wymaga webhooka inicjującego.** Wystarczy znacznik
w prompcie i parser. Webhook inicjujący zostaje potrzebny wyłącznie do **snapshotu
terminów i historii klienta** — czyli robi mniej i jest mniej ryzykowny, niż zakładaliśmy.

> Do potwierdzenia jednym telefonem: czy ElevenLabs podstawia zmienne systemowe
> w prompcie przekazywanym do Custom LLM. Jeśli nie — fallback w FAZIE 1B
> (webhook inicjujący wstawia wartości sam, bo dostaje `caller_id` i `call_sid`).
> Znacznik ma wtedy identyczny format, więc parser się nie zmienia.

---

## FAZA 1A — korelacja rozmowy (mała, natychmiastowa)

Odblokowuje idempotencję, powiązanie transkryptu bez heurystyki po telefonie
i miękką blokadę slotu. Czyni podwójne żądania z ElevenLabs nieszkodliwymi.

### Pliki

| Plik | Zmiana |
|---|---|
| panel ElevenLabs (Twoja ręka) | dopisanie znacznika na końcu promptu |
| `supabase/functions/voice-agent-llm/index.ts` | parser znacznika z wiadomości `system` |
| `supabase/functions/voice-agent-chat/index.ts` | bez zmian — już przekazuje `conversation_id` dalej |
| `supabase/functions/voice-agent-tools/index.ts` | bez zmian — idempotencja napisana, tylko się uaktywni |

### Kontrakt znacznika

Ostatnia linia promptu, dokładnie w tej postaci:

```
<<RIDO conv={{system__conversation_id}} caller={{system__caller_id}} called={{system__called_number}}>>
```

Parser w `voice-agent-llm`, **przed** filtrem `user|assistant`:

```ts
const systemText = inMessages.find((m) => m?.role === "system")?.content;
const marker = typeof systemText === "string"
  ? systemText.match(/<<RIDO conv=(\S+) caller=(\S*) called=(\S*)>>/)
  : null;
const conversationId = marker?.[1] || <dotychczasowa sonda>;
const callerId       = marker?.[2] || null;
```

Zasady:
- niepodstawiona zmienna (`{{system__…}}` dosłownie) → traktujemy jak brak, nie jak wartość
- do logu idzie **wyłącznie** źródło i długość, nigdy numer — jak dotąd
- znacznik jest usuwany z tekstu, zanim cokolwiek trafi do modelu

### Kryterium odbioru
`conversation_id_probe` pokazuje `used_source: "system_marker"`, a w `voice_calls`
pojawia się `elevenlabs_conversation_id` **w trakcie** rozmowy, nie po niej.

---

## FAZA 1B — webhook inicjujący (snapshot + kontekst)

### Nowy plik: `supabase/functions/voice-agent-init/index.ts`

**Wejście** (POST od ElevenLabs, kontrakt potwierdzony w dokumentacji):

```json
{ "caller_id": "+48519474583", "agent_id": "agent_8301ky7…",
  "called_number": "+48221015896", "call_sid": "SCL_Ubw8FhnqDXiv" }
```

**Autoryzacja:** nagłówek z sekretem współdzielonym, ustawiony w ElevenLabs
(sekcja secrets). Porównanie `timingSafeEqual` — funkcja już to ma.
`verify_jwt = false` jak reszta, więc autoryzacja **musi** być w kodzie.

**Rozpoznanie tenanta:** po `agent_id` w `voice_agent_configs` — dokładnie tą samą
drogą co `voice-call-postprocess`. Brak dopasowania → **400**, nie ciche 200.

**Wyjście:**

```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    "rido_conv": "<conversation_id jeśli dostępne>",
    "rido_caller": "+48519474583",
    "rido_first_available": "czwartek 6 sierpnia, 9:00",
    "rido_slots": "czw 6.08: 9:00, 11:00, 14:00 | pt 7.08: 8:00, 12:00 | pon 10.08: 9:00",
    "rido_company": "Warsztat Testowy",
    "rido_known_client": "Daniel — BMW X5, WY996EU, ostatnia wizyta 12.07"
  },
  "conversation_config_override": {
    "agent": { "first_message": "...", "language": "pl" }
  }
}
```

**Twarda reguła:** `dynamic_variables` musi zawierać **wszystkie** zmienne użyte
w prompcie. Brak jednej = ElevenLabs odrzuca inicjację i rozmowa startuje na
konfiguracji domyślnej. Dlatego każda zmienna ma wartość zastępczą, nigdy `null`.

**Budżet czasu: 300 ms.** Webhook inicjujący opóźnia odebranie połączenia.
Wszystkie zapytania równolegle (`Promise.all`), twardy `AbortSignal.timeout(300)`,
a przy przekroczeniu — odpowiedź z pustym snapshotem zamiast błędu. Rozmowa bez
snapshotu jest gorsza; rozmowa, która się nie zaczęła, jest stracona.

### Kontrakt snapshotu — generyczny, nie warsztatowy

```ts
type Snapshot = {
  first_available: { date: string; time: string; label: string } | null;
  next_free_by_day: Array<{ date: string; label: string; times: string[] }>; // 3 dni robocze
  slots_flat: string[];        // N=8 najbliższych, "RRRR-MM-DD HH:MM"
  resource_choice: boolean;    // czy klient wybiera zasób (fryzjer: true, warsztat: false)
  unit: "slot" | "date_range"; // hotel: date_range
};
```

**Lista N terminów, nie siatka dni** — grafik zapchany na miesiąc dałby siedem dni
pustki i agent nie miałby co powiedzieć. Lista zajmuje tyle samo miejsca niezależnie
od obłożenia.

### Parametry prefetchu i rozmiar kontekstu

```
horyzont          14 dni kalendarzowych  (~10 dni roboczych)
sloty na dzień    maks. 3
cache             60 s, klucz per tenant
```

Sprawdzenie rozmiaru — to jedyny powód, dla którego limit 3 slotów w ogóle istnieje:

```
"czw 6.08: 9:00, 11:00, 14:00"      ≈ 28 znaków ≈ 10 tokenów / dzień
10 dni roboczych                    ≈ 100 tokenów
+ first_available i nagłówki        ≈ 150 tokenów łącznie
```

Przy cachowanym prefiksie 9427 tokenów to **poniżej dwóch procent** kontekstu.
Mieści się bez zastrzeżeń — a gdyby limit podnieść do 5 slotów, nadal byłoby ~250
tokenów. Limit 3 jest więc podyktowany **czytelnością wypowiedzi agenta**, nie
rozmiarem: agent ma zaproponować dwie–trzy godziny, nie odczytać listę.

**Snapshot idzie do części ZMIENNEJ promptu**, za blokiem cachowanym — inaczej
każda rozmowa unieważniałaby cache (terminy zmieniają się częściej niż reguły).

`check_availability` zostaje **wyłącznie jako walidacja przy zapisie**: między
prefetchem a potwierdzeniem terminu mija cała rozmowa i ktoś mógł zająć slot.
To wyścig, nie optymalizacja — dlatego sprawdzenie musi być przy zapisie, a nie
przy proponowaniu.

**Źródło danych — stan faktyczny sprawdzony w bazie:**

| Tabela | Wierszy w całej platformie |
|---|---|
| `booking_resources` | **0** |
| `booking_availability_rules` | **0** |
| `booking_availability_config` | **0** |
| `booking_services` | **0** |
| `service_working_hours` | **0** |
| `workshop_workstations` | 12 (nasz warsztat: 6) |

Generyczny model **istnieje w schemacie i jest pusty**. Kolumny pasują do trzech
scenariuszy wprost: `booking_resources.type` + `user_id`/`phone`/`avatar_url`
(fryzjer = osoba), `booking_resource_services` (jedna farbuje, druga nie),
`booking_availability_rules` (grafik per zasób), `booking_availability_config`
(długość slotu, wyprzedzenie, bufory, strefa czasowa).

Dlatego: **interfejs generyczny teraz, jedyna implementacja warsztatowa.**

```ts
// supabase/functions/_shared/availabilitySnapshot.ts
interface AvailabilitySource {
  resources(providerId: string): Promise<Resource[]>;
  rules(providerId: string): Promise<AvailabilityRule[]>;
  taken(providerId: string, from: string, to: string): Promise<Busy[]>;
}
// bookingModelSource  — czyta booking_*    (docelowy, dziś zwraca pustkę)
// workshopSource      — czyta workshop_workstations + godziny 9-17 + istniejące rezerwacje
// wybór: jeśli booking_resources ma wiersze dla providera -> bookingModelSource, inaczej workshopSource
```

Bez tego przełączenie na model generyczny będzie przepisywaniem snapshotu od zera.

### Snapshot zawiera także CENNIK

Cennik to dane statyczne, więc idzie do snapshotu razem z terminami.
**Agent nigdy nie sprawdza cen w trakcie rozmowy** — ma je w kontekście od pierwszej
sekundy. Źródło: moduł „Moje usługi" warsztatu.

```ts
type PriceItem = {
  name: string;            // "Napełnienie czynnikiem R134YF"
  price_from: number;      // 150
  price_to: number | null; // 250 przy widełkach, null przy cenie stałej
  unit: "PLN";
};
```

Scenariusze — do wpisania w prompt:

| Sytuacja | Zachowanie agenta |
|---|---|
| usługa **jest** w cenniku, cena stała | podaje od razu, bez zapowiedzi: „Napełnienie klimatyzacji to sto pięćdziesiąt złotych" |
| usługa **jest**, cena widełkowa | „od stu pięćdziesięciu do dwustu pięćdziesięciu złotych, dokładnie wycenimy na miejscu" |
| usługi **nie ma** w cenniku | „Wycenimy usługę na miejscu, przed rozpoczęciem naprawy" |
| klient **nalega** na konkretną kwotę | „Przekażę zapytanie do warsztatu, oddzwonimy z wyceną" → zapis do `callback_requests` z tematem `wycena: <usługa>` + SMS do warsztatu |

Ostatni przypadek to **jedyny** zapis w trakcie rozmowy poza miękką blokadą slotu —
i tak samo jak ona: `EdgeRuntime.waitUntil`, bez `await`, idempotentny po
`conversation_id`. Alternatywa: przenieść go do `voice-call-commit` razem z resztą,
bo oddzwonienie i tak nie jest pilne w tej samej minucie. **Rekomendacja: do commitu**,
zgodnie z zasadą „nic, co da się zrobić po rozmowie, nie dzieje się w trakcie".

Kwoty w prompcie **słowami**, nie cyframi — obowiązuje blok WYMOWA.

**Cała arytmetyka dat w `Europe/Warsaw`**, nie w UTC. Runtime Edge Functions chodzi
w UTC, a między północą a 2:00 czasu lokalnego data UTC jest o dzień wcześniejsza —
snapshot policzony w UTC podałby wtedy „jutro" o dzień za wcześnie.
`voice-agent-chat:207` robi to już poprawnie; snapshot ma robić tak samo.

### Konfiguracja po stronie ElevenLabs (Twoja ręka, po wdrożeniu funkcji)
```
platform_settings.workspace_overrides.conversation_initiation_client_data_webhook = <URL>
platform_settings.overrides.enable_conversation_initiation_client_data_from_webhook = true
```
Oba są dziś `null` / `false`.

---

## 🎯 FAZA A — CO WCHODZI I KIEDY UZNAJEMY JĄ ZA ZROBIONĄ

**Nic jej nie wyprzedza.** `check_availability` w rozmowie to jedyna operacja, jaka
została w trakcie połączenia, i jedyna tura powyżej 2 s: zmierzone **5,2–7,3 s**.
Klient czeka, bo agent w trakcie rozmowy sprawdza kalendarz.

Webhook inicjujący pobiera wszystko **przy odebraniu połączenia** — w czasie, gdy agent
mówi powitanie. Powitanie i tak trwa ~3 s, więc snapshot jest za darmo.

### Zawartość snapshotu
- wolne terminy: **14 dni, maks. 3 sloty na dzień**, plus `first_available`
- **NAZWANE DNI ze statusem otwarcia** — dzisiaj/jutro/pojutrze + dzień tygodnia + data
  + otwarte/zamknięte. Model nie liczy dat, tylko wybiera z listy (patrz rozdział wyżej)
- godziny pracy i dni wolne
- **czasy trwania usług z cennika** — bez tego agent mówi „to zależy" i rozmowa rośnie
  do 315 s, jak `bj6t2qmm`
- cennik
- konfiguracja, persona, reguły — czyli **`config` znika z każdej tury** (140–506 ms)
- `caller_id` + flaga `caller_id_available`
- **aktywne rezerwacje tego numeru** — potrzebne też do ścieżki odwołania

### Ograniczenia twarde
- **budżet 300 ms**; przy przekroczeniu **pusty snapshot, nie błąd** — rozmowa ma się
  zacząć nawet bez terminów, agent wtedy po prostu użyje `check_availability`
- snapshot ląduje w **ZMIENNEJ** części promptu, nigdy w stałej. Blok stały ma
  `cache_control: { type: "ephemeral" }` i 100% trafień; terminy zmieniają się częściej
  niż reguły, więc wrzucenie ich do prefiksu unieważniłoby cache **przy każdej rozmowie**
- `check_availability` **zostaje**, ale WYŁĄCZNIE jako wyjątek dla terminów spoza
  snapshotu, z jawną zapowiedzią: „chwileczkę, sprawdzę dalsze terminy"

### Próg odbioru FAZY A
| miernik | cel |
|---|---|
| tury powyżej 2,5 s | **zero** |
| mediana tury | **poniżej 1,7 s** |
| `config` na turę | **0 ms** (znika ze ścieżki) |

Punkt wyjścia do porównania (06.08, metryki ElevenLabs): mediana ciszy **2,92 s**,
p90 **4,77 s**, tura z `check_availability` **5,2–7,3 s**.

---

## ⭐ KRYTERIUM GENERYCZNOŚCI — sprawdzaj przy KAŻDEJ decyzji

> **Czy to zadziała dla fryzjera bez zmiany kodu?**

Agent głosowy nie jest funkcją warsztatu. To silnik obsługi połączeń dla każdej branży
w portalu: warsztat, myjnia, fryzjer, kosmetyczka, wynajem, hotel. Multi-tenancy nie jest
zadaniem na teraz — ale od FAZY A **nic nowego nie może być przypięte do warsztatu na sztywno**.

| pojęcie | warsztat | fryzjer | hotel | wynajem |
|---|---|---|---|---|
| **zasób** | stanowisko | osoba | pokój | pojazd |
| **usługa** | przegląd | strzyżenie | doba | wynajem dobowy |
| **obiekt klienta** | pojazd | brak | liczba osób | brak |

Zasady:
- zasób jest generyczny — nigdy „stanowisko" w kontrakcie, zawsze „zasób"
- usługa ma **czas trwania, cenę i kategorię** — nie „naprawę"
- obiekt klienta jest **opcjonalny**
- pola branżowe (rejestracja, marka, model) idą do struktury branżowej, **nie do korzenia**
- prompt = część wspólna + część branżowa **z bazy wiedzy**; nic branżowego w kodzie

**Pierwszy test tego modelu: kategorie Warsztat / Myjnia z backlogu.** Projektujemy je jako
„kategoria → zasoby → terminy", nie jako „warsztat albo myjnia". Jeśli wyjdzie konstrukcja,
w której trzeba dopisać `if (branża === 'myjnia')`, model jest zły i wracamy do projektu.

---

## Snapshot Z NAZWANYMI DNIAMI — osobny punkt, nie „snapshot terminów"

**Problem, który to rozwiązuje, to cała RODZINA błędów, nie jeden.** Z transkryptów
06.08:

| co się stało | rozmowa |
|---|---|
| klient prosi o środę przyszłego tygodnia, agent proponuje „jutro o 9, 11, 14" | `bj6t2qmm` 52 s |
| agent proponuje 17:00, choć warsztat pracuje do 17:00 | `bj6t2qmm` 61–72 s |
| klient gubi się: „czy pan jest pewien, że środa to szesnasty?" | `bj6t2qmm` 114 s |
| pełna data powtórzona cztery razy w jednej rozmowie | `bj6t2qmm` 90/103/120/163 s |
| ekstrakcja wpisuje rok 2024/2025 | naprawione 06.08 |

**Wspólna przyczyna:** model dostaje czas jako tekst i za każdym razem liczy od nowa,
który dzień to „jutro", czy „piątek" to ten tydzień czy następny, czy 17:00 mieści się
w godzinach pracy. Każde liczenie to okazja do pomyłki.

**Rozwiązanie: model nie liczy dat, tylko WYBIERA Z LISTY.** Snapshot podaje dni
z nazwami i statusem otwarcia:

```json
{
  "dni": [
    { "klucz": "dzisiaj",      "nazwa": "czwartek 10 sierpnia",  "otwarte": true,
      "godziny": "8:00-17:00", "wolne": ["15:00", "16:00"] },
    { "klucz": "jutro",        "nazwa": "piątek 11 sierpnia",    "otwarte": true,
      "godziny": "8:00-17:00", "wolne": ["9:00", "11:00", "14:00"] },
    { "klucz": "pojutrze",     "nazwa": "sobota 12 sierpnia",    "otwarte": false,
      "powod": "zamknięte" },
    { "klucz": "poniedzialek", "nazwa": "poniedziałek 13 sierpnia", "otwarte": true,
      "godziny": "8:00-17:00", "wolne": ["9:00", "10:00", "16:00"] }
  ]
}
```

**Reguła twarda:** agent NIGDY nie podaje terminu, którego nie ma na liście `wolne`.
Prośba spoza listy → `check_availability` albo „nie mamy". Nie ma trzeciej możliwości
i nie ma miejsca na wyliczanie.

Ostatnia godzina w `wolne` musi uwzględniać czas trwania usługi — jeśli warsztat
pracuje do 17:00, a usługa trwa godzinę, ostatni slot to 16:00. Dziś agent tego nie
wie i proponował 17:00.

---

## Wielojęzyczność — DIAGNOZA PRZED ZMIANĄ (zasada 11)

**Co się stało** (`qrgbn9cy`, 06.08): klientka mówiła po rosyjsku, agent odpowiedział
po angielsku „I notice you've **written** in Russian. Let me switch to Russian…" —
zły język i „written" zamiast „spoken", czyli model myślał, że to czat.

**Co ustaliłem, zanim cokolwiek dopiszę do promptu:**

1. **`language_detection` to narzędzie systemowe ElevenLabs, nie nasze.** W kodzie
   nie ma po nim śladu poza obsługą narzędzi klienta. Jest włączone w konfiguracji
   agenta obok `end_call`.
2. **`language_presets` w konfiguracji agenta: PUSTE.** Narzędzie ma więc *co* wykryć,
   ale nie ma *na co* przełączyć — brak głosu, powitania i promptu per język.
3. **ASR był przypięty do polskiego.** Dowód z transkryptu: rosyjska mowa zapisana
   alfabetem łacińskim fonetycznie („Pozdravite, ja bykhotyala zapisatsa…"), a cyrylica
   („Вы говорите по-русски?") pojawia się dopiero PO zadziałaniu `language_detection`.
4. **Prompt nie ma żadnej reguły o języku** — sprawdzone wyrażeniem regularnym po
   całym prompcie persony.
5. **Ale baza wiedzy ma trzy reguły, które każą agentowi robić dokładnie to, co zrobił:**
   - „Gdy klient prosi o zmianę języka → **Potwierdzić zmianę języka**…"
   - „Klient prosi o obsługę w innym języku → **Przepraszam, nie mówię po ukraińsku.**
     …mogę połączyć Pana/Panią z kolegą, który mówi po ukraińsku"
   - „Gdy klient mówi w innym języku → Potwierdzić możliwość komunikacji, ale
     **wyjaśnić poziom biegłości**. Jeśli agent nie mówi płynnie — zaproponować tłumacza"

**Wniosek: to nie jest brak reguły, to jest ZŁA reguła.** Agent zapowiedział przełączenie,
bo baza wiedzy mu tak kazała. Trzecia z tych reguł obiecuje dodatkowo przełączenie do
człowieka — temat zamknięty jako niedostępny. Dopisanie „nie zapowiadaj zmiany języka"
do promptu **nie zadziała**, dopóki te trzy wpisy tam siedzą; będzie szóstą sprzecznością.

**Kolejność naprawy:**
1. usunąć/przepisać te trzy wpisy w `voice_agent_knowledge` (do zatwierdzenia — pokażę SQL)
2. skonfigurować `language_presets` dla `ru`, `uk`, `en` po stronie ElevenLabs (**Twoja
   ręka**) — głos, powitanie, ewentualnie prompt per język
3. sprawdzić głos po rosyjsku i ukraińsku; jeśli brzmi źle, osobny `voice_id` w presecie
4. **dopiero na końcu** reguła w prompcie: „Odpowiadaj w języku, w którym mówi klient.
   Nigdy nie zapowiadaj zmiany języka." — ma sens dopiero, gdy jest na co przełączyć

Zakres: polski domyślny, powitanie zawsze po polsku, przełącza dopiero odpowiedź klienta,
przy mieszaniu języków agent trzyma się większości, przy niepewności zostaje przy polskim.

**Powód biznesowy:** w Warszawie znaczna część klientów warsztatów mówi po ukraińsku
lub rosyjsku. Agent, który ich nie obsłuży, traci klientów, których człowiek by obsłużył.

---

## Zamykanie rozmowy — schemat twardy

**Stan dzisiejszy:** w 3 z 13 rozmów `end_call` w ogóle nie padł, a w jednej agent
rozłączył się w środku pytania klientki o cenę.

**Diagnoza `me0bhctj` (161 s z 229 s) — co go wywołało:**
```
155s KLIENT  Nie, dziękuję na razie. Ile to będzie kosztowało?
160s AGENT   Cenę będzie wiadomo po diagnozie na...
161s AGENT   <end_call>
163s KLIENT  Ale plus minus.          ← rozmowa trwała dalej jeszcze 68 s
```
Wypowiedź klientki zawierała **jednocześnie sygnał domknięcia („Nie, dziękuję")
i nowe pytanie**. Agent złapał się pierwszego i zignorował drugie. To nie jest problem
latencji ani limitu tokenów — to brak reguły, że pytanie bez odpowiedzi blokuje
zakończenie.

**Schemat docelowy:**
1. po podsumowaniu agent pyta: „Czy mogę jeszcze w czymś pomóc?"
2. odpowiedź przecząca → **jedno** krótkie pożegnanie i `end_call` **w tej samej turze**
3. cisza 2 s po pytaniu domykającym → pożegnanie i `end_call`
4. nowe pytanie → agent odpowiada i wraca do punktu 1

**Reguły twarde:**
- pożegnanie i `end_call` **zawsze w tej samej turze**, nigdy osobno (rozdzielenie było
  przyczyną 16-sekundowego czekania)
- po pożegnaniu agent nie odzywa się więcej, cokolwiek klient powie
- maksymalnie **dwa** pytania „czy jeszcze w czymś pomóc" na rozmowę; po drugim agent
  kończy niezależnie od odpowiedzi

**Reguła 4 — LUSTRZANE ODBICIE: gdy to KLIENT się żegna.**
Schemat wyżej obejmował tylko przypadek, w którym kończy agent. `bj6t2qmm` pokazała
drugi: klientka powiedziała „O! Super. Okej, do widzenia" i to ona się rozłączyła —
agent nie wywołał `end_call` ani razu w całej 315-sekundowej rozmowie.
**Gdy klient się żegna, agent odpowiada jednym zdaniem i wywołuje `end_call` w tej samej
turze. Nie czeka, aż klient rozłączy się sam.**

**Reguła 5 — PYTANIE BLOKUJE ZAKOŃCZENIE, nawet razem z sygnałem domknięcia.**
`me0bhctj`: „**Nie, dziękuję na razie. Ile to będzie kosztowało?**" — jedna wypowiedź,
dwie treści. Agent złapał pierwszą i wywołał `end_call`, ignorując pytanie.
- sygnał domknięcia **bez** pytania → kończymy
- sygnał domknięcia **z** pytaniem → najpierw pełna odpowiedź, potem punkt 1 schematu

To nie jest przypadek brzegowy: klient, który dziękuje i od razu pyta, jest normą,
nie wyjątkiem.

**Konfiguracja — sprawdzone:** `silence_end_call_timeout` = **20 s i jest globalne**
(jedna wartość w `conversation_config.turn`, brak osobnego progu dla fazy zamykającej).
Zostaje 20 s jako wyłącznik awaryjny, a punkt 3 realizujemy promptem. `max_duration_seconds`
= 600 s.

**Miernik po zmianie:** sekundy od ostatniego słowa agenta do rozłączenia. Cel < 1 s.

---

## Domykanie rozmowy — dlaczego 315 s

`bj6t2qmm` trwała 315 s przy limicie 600 s. **Komplet danych agent miał na 163 s.**
Pozostałe 152 s (48% rozmowy) to pytania klientki, na które agent nie potrafił
odpowiedzieć konkretnie:

```
176s  ile to będzie kosztowało?        → "będzie wiadomo po diagnozie"
210s  ile czasu to sprawdzanie?        → "zależy od problemu"
231s  ile czasu muszę zaplanować?      → "może pół godziny, może dłużej"
245s  to będzie tylko przegląd?        → "to będzie diagnoza"
275s  to ile czasu ten przegląd?       → "kilka minut do pół godziny"
```

**To nie klientka marudziła — pytała cztery razy o to samo, bo nie dostała odpowiedzi.**
Agent zadał „czy mogę jeszcze w czymś pomóc" dwa razy (183 s, 203 s), a potem przestał
i tylko odpowiadał, otwierając kolejne wątki. Rozmowę zakończyła klientka słowami
„do widzenia" — `end_call` nie padł.

Dwie naprawy, obie do FAZY A:

**(a) CZAS TRWANIA USŁUGI W SNAPSHOCIE.** Agent musi umieć odpowiedzieć „około godziny",
a nie „to zależy". Obok ceny w snapshocie musi stać czas trwania — to ta sama struktura,
`{ usługa, czas_trwania_min, cena, kategoria }`, i ta sama, której potrzebuje wyliczenie
ostatniego wolnego slotu w dniu.

⚠️ Uwaga na źródło: nie wolno wziąć tych liczb z bazy wiedzy. Wpis „Przegląd ogólny trwa
około 30–45 minut i jest bezpłatny" istnieje, jest nieaktywny i **nikt nie potwierdził,
że to prawda** — destylator wymyślił to z rozmowy. Czas i cena mają pochodzić z cennika
usługodawcy, nie z destylatu.

**(b) REGUŁA DOMYKANIA.** Po zebraniu kompletu agent przechodzi do podsumowania.
Nie otwiera nowych wątków i nie pyta o rzeczy, których nie potrzebuje do rezerwacji.
Plus limit dwóch pytań domykających ze schematu wyżej.

---

## FAZA 1C — zero odczytów per tura

Dziś `stage prepare` to 377–1342 ms **na każdą turę**: konfiguracja agenta, baza
wiedzy, kontekst firmy. Te dane nie zmieniają się w trakcie rozmowy.

Zmiana: webhook inicjujący wkłada je w `dynamic_variables`, ElevenLabs podstawia
w prompcie, a `voice-agent-chat` **nie czyta już bazy w ścieżce tury**.

Plus **prompt caching**. Dziś płacimy pełną cenę za 2653 tokeny wejścia w każdej
turze (`input_cache_read: 0` w raporcie ElevenLabs). Blok stały promptu dostaje
`cache_control: { type: "ephemeral" }`, część zmienna zostaje poza cache.

Kryterium odbioru: `prepare` ≈ 0, `total` poniżej 1,2 s na turze bez narzędzi.
Dziś mediana takiej tury to 1,72 s.

---

## Miękka blokada slotu — jedyny dozwolony zapis w trakcie

Wywoływana, gdy agent poda klientowi konkretną godzinę.

```ts
EdgeRuntime.waitUntil(
  lockSlot({ providerId, conversationId, date, time, ttlMinutes: 15 })
);   // BEZ await — nie może opóźnić pierwszego tokenu
```

Cztery przyjęte zastrzeżenia:
1. **Idempotencja po `conversation_id`** — klucz `(provider_id, conversation_id)`, upsert.
   Zależy od FAZY 1A.
2. **Błędy są niewidoczne** przy fire-and-forget → obowiązkowy `console.error`
   z `conversation_id`, plus czerwona flaga w `diagnose-call.sh`.
3. **TTL 15 min** — wygasanie leniwe przy odczycie (`expires_at < now()` = wolny),
   bez crona sprzątającego.
4. **Zapis po rozmowie NIE zakłada, że blokada istnieje.** Blokada jest optymalizacją,
   nie gwarancją — sprawdzenie zajętości robi się od nowa.

Nowa tabela `voice_slot_locks(provider_id, conversation_id, date, time, expires_at)`,
unikalny indeks na `(provider_id, conversation_id)`. Migracja w `scripts/sql/`.

---

## FAZA 2 — zapis po rozłączeniu

### Pliki
| Plik | Rola |
|---|---|
| `voice-call-postprocess/index.ts` | wejście z webhooka, rozpoznanie tenanta, idempotencja |
| `_shared/voiceExtraction.ts` | **nowy** — ekstrakcja danych z transkryptu (Sonnet) |
| `_shared/voiceReconcile.ts` | **nowy** — dopasowanie klienta i pojazdu |
| `voice-agent-tools/index.ts` | akcja `commit_call` — jedna transakcja |

### Kontrakt ekstrakcji

```ts
type Extracted = {
  complaint: string | null;      // SŁOWA KLIENTA, zwięźle — nie parafraza, nie diagnoza
  date: string | null; time: string | null;
  first_name: string | null; last_name: string | null;
  phone: string | null; brand: string | null; model: string | null; plate: string | null;
  confidence: Record<string, "high" | "low">;
};
```

### Kontrakt dopasowania — **poprawia dane, nigdy nie wstrzymuje zapisu**

```
a) telefon (system__caller_id ma pierwszeństwo nad ASR) → workshop_clients
   trafienie  -> imię, nazwisko, historia Z BAZY zamiast z ASR
b) rejestracja → workshop_vehicles
   trafienie  -> marka, model, właściciel, historia Z BAZY
c) rejestracja wskazuje pojazd znanego klienta, telefon się NIE zgadza
   -> dane pojazdu wygrywają, wiersz oznaczony `needs_review = true`, ale ZAPISANY
d) nic nie pasuje
   -> nowy klient z danymi z ASR
e) commit: booking + zlecenie + grafik + SMS + transkrypt w JEDNEJ transakcji,
   rollback przy błędzie, idempotencja po conversation_id
```

To rozwiązuje problem, którego kolejka weryfikacji rozwiązać nie może: dziś ASR
przekręcił nazwisko w **pięciu rozmowach na pięć** (Macioskowski, Mosleczko,
Noszeczkow, Moszeczkow, Mosaczkowski) i telefon w dwóch na pięć. Dopasowanie po
numerze dzwoniącego zastępuje zgadywanie ASR danymi z bazy.

### Kolejka weryfikacji — tylko dla przypadków, gdzie zapisu NIE DA SIĘ wykonać
- brak terminu w transkrypcie
- rozmowa urwana przed kompletem
- klient się rozmyślił

**Nie dla „nazwisko brzmi dziwnie".** Zapis następuje zawsze, gdy komplet jest zebrany.

### Transakcja
Cztery niezależne wywołania trzeba zastąpić jedną funkcją SQL (`SECURITY DEFINER`),
bo klient Supabase w Deno nie ma transakcji wielozapytaniowych. Migracja
w `scripts/sql/`, wywołanie przez `admin.rpc('voice_commit_call', {...})`.

---

## Siatka bezpieczeństwa — przed przełączeniem, nie po

### Cron rekoncyliacyjny — `voice-call-reconcile` (nowy)
Co 15 min: `GET /v1/convai/conversations?agent_id=…` z ostatniej godziny, porównanie
z `voice_calls.elevenlabs_conversation_id`, doprocesowanie brakujących.
API potwierdzone — `diagnose-call.sh` już z niego korzysta.

Dowód, że to konieczne: z siedmiu dzisiejszych rozmów **trzy mają
`elevenlabs_conversation_id = NULL`**. Dziś to kosztowało analizę. Po przełączeniu
kosztowałoby klienta.

### Retry
Do sprawdzenia, **nie do założenia**: czy ElevenLabs ponawia webhook przy 4xx/5xx.
Do czasu rozstrzygnięcia cron rekoncyliacyjny jest jedyną gwarancją.

### Alert
Rozmowa `outcome = booked` bez zlecenia po 10 minutach → SMS/mail do warsztatu.

---

## Kolejność wdrożenia (zaakceptowana)

| # | Krok | Kryterium odbioru |
|---|---|---|
| 1 | FAZA 1A — korelacja | `used_source: "system_marker"`, `voice_calls` w trakcie rozmowy |
| 2 | FAZA 1B — webhook inicjujący + snapshot | inicjacja < 300 ms, agent podaje terminy bez narzędzia |
| 3 | FAZA 1C — zero odczytów + prompt caching | `prepare` ≈ 0, tura < 1,2 s, `input_cache_read` > 0 |
| 4 | Cron rekoncyliacyjny + alert | świadomie zgubiony webhook zostaje odzyskany w 15 min |
| 5 | Kolejka weryfikacji w panelu | rozmowa bez terminu ląduje w kolejce z transkryptem |
| 6 | FAZA 2 — commit po rozmowie | zlecenie + grafik + SMS z transkryptu, transakcyjnie |
| 7 | **Dopiero teraz** wyłączenie narzędzi zapisujących w rozmowie | zero zapisów poza blokadą slotu |

Kroki 4 i 5 są przed 6 i 7 celowo. To te, które się pomija i potem żałuje.

---

## Konsekwencje dla promptu

- **`check_availability` zostaje wyjątkiem** i musi być **jawnie dopisany do bloku
  ZAKAZ RELACJONOWANIA** — inaczej prompt zaprzecza sam sobie: zakazuje „sprawdzam",
  a tu każe powiedzieć „Chwileczkę, sprawdzę dalsze terminy". Wolno wyłącznie przy
  terminie spoza snapshotu.
- **SMS**: „Potwierdzenie przyjdzie SMS-em w ciągu kilku minut" — nie „wyślemy teraz".
- **Numer telefonu**: `system__caller_id` jest znany od pierwszej sekundy. Do decyzji,
  czy agent nadal ma o niego pytać (klient może chcieć podać inny), czy tylko
  potwierdzać. Skrócenie rozmowy o jedno pytanie jest realne — ale to zmiana
  scenariusza, nie techniczna, więc zostawiam do rozstrzygnięcia.

## Czego świadomie NIE robimy

- nie włączamy `speculative_turn` — dopiero gdy idempotencja po `conversation_id` działa
- nie migrujemy danych do `booking_*` w tej fazie — tylko interfejs
- nie ruszamy KSeF, płatności, faktur, fiskalizacji ani innych agentów
- nie zakładamy, że ElevenLabs ponawia webhooki
