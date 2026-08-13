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

## 🔧 ZNANY DŁUG: model wyjazdowy potrzebuje innego ALGORYTMU, nie innego kontraktu

**Nie szukaj brakującego pola — go nie ma i nie będzie.**

Kryterium generyczności brzmi od 12.08: **„czy zadziała dla HYDRAULIKA bez zmiany
kodu?"** — trudniejszy test niż fryzjer, bo hydraulik nie ma stanowiska, jedzie
do klienta, a adres klienta jest kluczowy, nie opcjonalny.

Przegląd kontraktu snapshotu pod tym kątem:

| element | dla hydraulika |
|---|---|
| `zasoby: { nazwa, typ }` | ✅ działa — „Marek" tak samo jak „Stanowisko 3" |
| `klient.adres` | ✅ **dodanie pola**, kształt bez zmian |
| czas dojazdu | ✅ **`branza: { wyjazdowa: true, czas_dojazdu_min: 30 }`** |
| **`dni[].wolne`** | ❌ **NIE DZIAŁA** |

**Dlaczego `wolne` nie zadziała:** godziny liczymy z pojemności = liczby zasobów,
zakładając, że zasób jest NA MIEJSCU. U hydraulika między wizytami jest dojazd,
którego długość zależy od dwóch adresów — a adresu następnego klienta nie znamy
w chwili budowy snapshotu. **Dostępność przestaje być własnością usługodawcy,
a staje się funkcją trasy.**

Rozwiązaniem będzie zwracanie **okien zamiast godzin** („jutro przed południem,
okolica Mokotowa") i osobny algorytm układania trasy. **To nie jest brakujące pole
w kontrakcie — to inny sposób liczenia.** Dołożenie pól niczego nie rozwiąże.

**Świadomie NIE budujemy tego teraz.** Dodalibyśmy pola, których nikt nie wypełnia,
a mamy już trzy takie przypadki: `wants_cancel` (wykrywany i nieczytany),
`duration_seconds` i `ended_at` (0 z 61 wierszy). Kontrakt tego nie blokuje
i to wystarczy. Wracamy, gdy pojawi się pierwszy usługodawca wyjazdowy.

---

## 📋 BACKLOG PYTAŃ OTWARTYCH (rozstrzygnąć przed multi-tenancy)

- **Zasoby: fallback na stałe czy migracja?** Snapshot czyta `booking_resources`,
  a gdy pusto — `workshop_workstations`. Jeśli fallback zostaje na zawsze, **każda
  nowa funkcja będzie musiała obsłużyć dwie ścieżki**. Do rozstrzygnięcia: czy warsztat
  docelowo migruje na `booking_resources` (jedno źródło, jedna ścieżka), czy godzimy się
  na dwie na stałe.
- **Historia zleceń to OSOBNY PRODUKT, bez związku z agentem.** `workshop_order_items`
  (569 pozycji) docelowo posłuży jako baza referencyjna do wyceny w panelu, z wyszukiwaniem
  po marce, modelu i roczniku, ze wszystkich warsztatów portalu. Osobny moduł, osobna decyzja,
  **nie teraz**.
  **Import z historii do cennika ODRZUCONY 12.08** — zadziałałby raz, u nas; nowy warsztat
  ma zero historii (patrz „zasada produktowa" w `status.md`).
  **Agent czyta ceny WYŁĄCZNIE z `provider_services`** i nigdy nie sięga do historii —
  to byłoby zapytanie w trakcie rozmowy, czyli dokładnie to, co usuwaliśmy przez dwa dni.
- **Numeracja zleceń** — licznik tylko w górę, numer raz nadany nigdy nie wraca
  (dziś `MAX` z używanych, więc skasowanie zwraca numer do obiegu; `ZLP-08/2026-001`
  wystąpił dwa razy, a mógł już pójść klientowi SMS-em).
- **Soft-delete zleceń** — wysoki priorytet. Dziś kasowanie nie zostawia śladu,
  bo historia statusów leci kaskadą. Przy prawdziwych klientach nie do przyjęcia.

---

## 🧩 KONTRAKT SNAPSHOTU — kształt, w który wchodzą ustawienia bez przebudowy

Ustawienia agenta dostają **własną gałąź `ustawienia`**, a nie pola rozrzucone po
korzeniu. Dzięki temu dodanie piątego czy dziesiątego ustawienia nie zmienia kształtu
kontraktu — dochodzi klucz, nic się nie przesuwa.

```json
{
  "wersja": 1,
  "firma":   { "nazwa": "…", "adres": "…", "telefon": "…" },
  "ustawienia": {
    "najpozniejsze_przyjecie": "16:00",
    "domyslny_czas_wizyty_min": 60,
    "polityka_wyceny": "kosztorys_przed_naprawa",
    "polityka_wyceny_tekst": "Kosztorys przedstawiamy przed rozpoczęciem naprawy.",
    "oplata_za_diagnoze_bez_usterki": "zalezy"
  },
  "dni":     [ { "klucz": "jutro", "data": "2026-08-18",
                 "do_wypowiedzenia": "wtorek, osiemnastego sierpnia",
                 "otwarte": true, "godziny": "09:00-17:00",
                 "wolne": ["09:00", "09:30", "10:00"] } ],
  "uslugi":  [ { "nazwa": "Serwis olejowy", "cena": { "od": 163, "do": 163, "typ": "stala" },
                 "czas_blokady_min": 60, "czas_znany": true,
                 "czas_do_powiedzenia": "około godziny", "ostatni_start": "16:00" } ],
  "zasoby":  [ { "id": "…", "nazwa": "Stanowisko 1", "typ": "stanowisko" } ],
  "klient":  { "caller_id_znany": true, "imie": "Daniel",
               "aktywne_rezerwacje": [ { "data": "2026-08-18", "godzina": "14:00" } ] },
  "branza":  { "rodzaj": "warsztat" }
}
```

**Dlaczego `polityka_wyceny` ma dwa pola:** klucz (`kosztorys_przed_naprawa`) jest do
logiki i nie zmienia się przy poprawce językowej; tekst jest gotowy do wypowiedzenia,
składany przez kod z wybranej opcji i kwoty. Warsztat wybiera z listy — **nigdy
nie wpisuje własnego zdania**, bo w wolnym tekście ktoś obieca coś, czego nie dotrzyma,
a agent powtórzy to setce klientów (zasada 22).

**Wartości domyślne, gdy warsztat niczego nie ustawił** — agent ma działać od pierwszej
minuty: `najpozniejsze_przyjecie` = godzina zamknięcia, `domyslny_czas_wizyty_min` = 60,
`polityka_wyceny` = `kosztorys_przed_naprawa`, `oplata_za_diagnoze_bez_usterki` = `zalezy`.
Żadna z nich nie jest wypowiadana jako pewnik poza polityką wyceny, która ma neutralne
i zawsze prawdziwe brzmienie.

---

## ⏱️ CZAS TRWANIA — OPCJONALNY, I DWA RÓŻNE POLA W KONTRAKCIE

**Wpisanie czasu NIE MOŻE być warunkiem działania.** Warsztat zakładający konto ma wpisać
nazwę i cenę w minutę; wymuszanie czasu to bariera na wejściu. Ale slot trzeba czymś
wypełnić — więc czas potrzebny do MATEMATYKI istnieje zawsze, a czas do POWIEDZENIA
tylko wtedy, gdy ktoś go naprawdę podał.

**To są dwa osobne pola i tu leży cała rzecz.** Jedno pole zmusiłoby agenta do wyboru
między kłamstwem („około godziny", bo tyle wyszło z domyślnej wartości) a milczeniem
o czymś, co wie. Rozdzielenie usuwa ten wybór.

```json
{ "id": "…", "nazwa": "Serwis olejowy",
  "cena": { "od": 163, "do": 163, "typ": "stala" },

  "czas_blokady_min": 60,                    // ZAWSZE — wyłącznie do wyliczania slotów
  "czas_znany": true,                        // czy pochodzi z duration_minutes USŁUGI
  "czas_do_powiedzenia": "około godziny",     // null gdy czas_znany = false

  "ostatni_start": "16:00" }                 // wyliczony per usługa, patrz niżej
```

### Skąd bierze się `czas_blokady_min` — trzy szczeble

| sytuacja | `czas_blokady_min` | `czas_znany` | co mówi agent |
|---|---|---|---|
| usługa ma `duration_minutes` | z usługi | `true` | „to zajmie około godziny" |
| usługa nie ma, warsztat ma **domyślny czas wizyty** | z ustawień | **`false`** | **nic o czasie** — umawia termin i tyle |
| nie ma ani jednego | **60** | `false` | **nic o czasie** |

**Reguła twarda: agent mówi o czasie trwania WYŁĄCZNIE gdy `czas_znany = true`.**
Domyślna wartość służy do rezerwowania miejsca w grafiku, nie do informowania klienta.
„Nie wiem, ile potrwa" jest lepsze od zmyślonej godziny — klient planuje wokół tego dzień.

**Nowe pole w ustawieniach warsztatu: „domyślny czas wizyty"** (minuty, domyślnie 60),
obok trzech już zaplanowanych. Opis w panelu: *„używany tylko do rezerwowania miejsca
w grafiku; agent nie podaje go klientowi"*.

---

## 📅 USŁUGI DŁUGIE — mniej slotów, ZERO obietnic o odbiorze

Dotyczy każdego warsztatu z detailingiem: **Ceramika 4-letnia ≈ 8 h**, **Folie BBF ≈ 2 dni**.

### Co robimy: ostatni start liczony PER USŁUGA

```
ostatni_start = min( najpóźniejsza_godzina_przyjęcia,  zamknięcie − czas_blokady_min )
```

Mycie (60 min) przy pracy do 17:00 → 16:00. **Ceramika (480 min) → 9:00 i tylko 9:00.**
Snapshot podaje już przefiltrowane godziny, więc agent niczego nie przelicza — przy
długiej usłudze po prostu widzi mniej slotów w ciągu dnia. **I to wystarczy.**

⚠️ „Najpóźniejsza godzina przyjęcia" jest przez to **górnym ograniczeniem**, a nie jedyną
regułą: usługa ośmiogodzinna musi zacząć rano niezależnie od tego, co warsztat tam wpisał.

### Czego NIE robimy — i dlaczego (decyzja 12.08)

**Agent umawia klienta na TERMIN PRZYJĘCIA. Kropka.** Nie mówi, kiedy auto będzie gotowe,
nie proponuje „zostawia Pan na dwa dni", nie blokuje zasobu na kolejne dni.

Odrzucone: `tryb_terminu: "dzien"`, `dni_robocze`, blokada wielodniowa, informowanie
o dacie odbioru. Zaprojektowałem to i **zostało odrzucone słusznie**: ile potrwa robota,
ocenia mechanik przy przyjęciu, po obejrzeniu auta. Agent nie ma skąd tego wiedzieć,
bo zależy to od stanu pojazdu, nie od nazwy usługi. Agent, który obieca „odbierze Pan
w środę", może się pomylić — i wtedy problem ma warsztat, nie agent.

To ta sama zasada co przy cenie: **agent nie zgaduje tego, co rozstrzyga się na miejscu.**

Do backlogu jako pytanie otwarte, wracamy **po progu pięciu rozmów**.

---

## ⚙️ USTAWIENIA WARSZTATU — trzy pola do dodania w panelu (wchodzą do snapshotu)

Powód, dosłownie z rozmowy 11.08:

```
142s KLIENTKA  a jeśli z samochodem wszystko w porządku, to ja muszę płacić za diagnozę?
151s AGENT     To pytanie do obsługi warsztatu — zadzwoń bezpośrednio na numer firmy.
```

Odesłanie do telefonu osoby, która **właśnie dzwoni**, w dodatku per „ty",
jako **trzecia odmowa pod rząd**. Sentyment klientki spadł do −0,30.

### 0. OPIS POLA `duration_minutes` W PANELU — obowiązkowy

Pole musi mieć w panelu podpis: **„czas blokady stanowiska, nie czas pracy"**.
Wymiana oleju to 30 minut pracy, ale auto stoi godzinę — wpisuje się **60**.
Bez tego podpisu warsztat wpisze czas pracy, a agent umówi dwa auta na jedno
stanowisko w tym samym czasie.

### 1. NAJPÓŹNIEJSZA GODZINA PRZYJĘCIA
Osobne pole, **niezależne od godzin pracy**. Od 12.08 jest **górnym ograniczeniem**,
a nie jedyną regułą — patrz „usługi dłuższe niż dzień pracy": usługa ośmiogodzinna
musi zacząć się rano niezależnie od tej wartości. Warsztat pracuje do 17:00, ale ostatnie
auto przyjmuje o 16:00, bo diagnostyka trwa godzinę.

11.08 agent sam wyliczył 16:30 i **trafił dobrze — ale zgadywał**:
> „Siedemnasta to koniec naszych godzin pracy — ostatni termin to szesnasta trzydzieści."

To ma być ustawienie, nie wnioskowanie. W snapshocie: **sloty kończą się na tej godzinie**.

### 2. POLITYKA WYCENY — pole WYBORU, nie tekst
Warsztat wybiera jedną pozycję, agent mówi dokładnie ją:

| | treść |
|---|---|
| a | „Kosztorys przedstawiamy przed rozpoczęciem naprawy" |
| b | „Diagnoza jest bezpłatna przy zleceniu naprawy" |
| c | „Diagnoza kosztuje [kwota], odliczana od naprawy" |
| d | „Diagnoza kosztuje [kwota] niezależnie od decyzji" |

**Wybór z listy, nigdy wolny tekst.** W wolnym tekście ktoś wpisze obietnicę, której
nie dotrzyma, a agent powtórzy ją setce klientów. To ta sama pułapka co przykłady
w bazie wiedzy (zasada 22), tylko wpisywana ręcznie.

### 3. OPŁATA ZA DIAGNOZĘ, GDY NIC NIE ZNALEZIONO
`Tak / Nie / Zależy od przypadku`. To było konkretne pytanie klientki i wróci.

---

## 💬 ZASADA ODPOWIADANIA O CENIE — trzy przypadki

1. **Usługa JEST w cenniku** → cena wprost: „Wymiana oleju to sto osiemdziesiąt złotych."
2. **Usługi nie ma, bo to naprawa po diagnozie** → **polityka wyceny z ustawień**,
   nigdy odesłanie: „Kosztorys przedstawimy przed rozpoczęciem naprawy."
3. **Pytanie spoza obu** → docelowo „Przekażę pytanie, oddzwonimy" +
   `callback_requests` + SMS do warsztatu. **Mechanizmu NIE MA** (tabela nie istnieje,
   `CALLBACK_SMS_ENABLED = false`), więc do czasu jego zbudowania agent mówi prawdę,
   która nie odsyła: **„Nie mam tej informacji — mechanik odpowie na miejscu przy
   przyjęciu auta."**

### ⛔ REGUŁA TWARDA: agent NIGDY nie odsyła do telefonu
„Proszę zadzwonić do warsztatu", „proszę skontaktować się z obsługą", „numer ma Pan
na stronie" — **klient już dzwoni**. To jedyna odpowiedź zawsze zła, niezależnie
od pytania. Wdrożone 11.08 w prompcie z kodu i w prompcie persony.

Do tego **limit dwóch odmów pod rząd**: przy trzecim pytaniu agent mówi to, co WIE
(termin, co się wydarzy przy przyjęciu), zamiast po raz trzeci powtarzać, czego nie wie.

---

## 🔤 DATY GOTOWE DO WYPOWIEDZENIA — do snapshotu

Agent odmienia dzień miesiąca niekonsekwentnie. Rozmowa 11.08:
```
 34s  „w środę dwunastego"           ✅ poprawnie
 68s  „w wtorek dziewiętnaście sierpnia"   ❌
 78s  „wtorek dziewiętnaście sierpnia"     ❌
116s  „wtorek dziewiętnaście sierpnia"     ❌
```
Raz dobrze, trzy razy źle — w jednej rozmowie. Reguła w prompcie **jest** („piętnastego
maja, nie 15.05") i została 11.08 wzmocniona o liczebnik porządkowy i „we wtorek",
ale to leczenie objawu.

**Rozwiązanie docelowe: snapshot podaje datę JUŻ ODMIENIONĄ, gotową do przeczytania:**
```json
{ "klucz": "wtorek_19", "do_wypowiedzenia": "wtorek, dziewiętnastego sierpnia",
  "data": "2026-08-19", "otwarte": true, "wolne": ["9:00", "16:00"] }
```
Model nie odmienia — czyta. Ta sama zasada co przy nazwanych dniach: **nie liczy,
tylko wybiera z listy**. Odmiana po polsku jest zadaniem dla kodu, nie dla modelu.

---

## 🎯 FAZA A — CO WCHODZI I KIEDY UZNAJEMY JĄ ZA ZROBIONĄ

**Nic jej nie wyprzedza.** `check_availability` w rozmowie to jedyna operacja, jaka
została w trakcie połączenia, i jedyna tura powyżej 2 s: zmierzone **5,2–7,3 s**.

**Argument dodatkowy, zmierzony 11.08:** w jednej turze (klientka pytała o przyszły
wtorek) ElevenLabs wystrzelił **trzy równoległe żądania**, które razem wywołały
`check_availability` **siedem razy** — 2353, 973, 945, 1167, 1328, 946 i 717 ms —
a jedno żądanie zostało porzucone po **9,5 s** („connection closed before message
completed"). Tura trwała **17 sekund**. Snapshot usuwa to całkowicie: nie ma narzędzia
w turze, nie ma czego zwielokrotnić.
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

## 🧭 ILE DZIELI NAS OD FRYZJERA — audyt kodu, 11.08

**Odpowiedź: mniej, niż zakładaliśmy. Model generyczny JUŻ ISTNIEJE w bazie
i jest używany przez moduł Usług. Zaszyta pod warsztat jest wyłącznie ścieżka głosowa.**

### Co już jest generyczne — i nikt tego nie musi budować

| tabela | co daje | dla fryzjera |
|---|---|---|
| `provider_services` | `name`, `price_from/to`, **`duration_minutes`**, `category_id` | cennik i czasy trwania, których szuka FAZA A |
| `booking_resources` | `type`, **`name`**, `email`, `phone`, `avatar_url`, `user_id`, `color` | **zasób = KONKRETNA OSOBA**, nie zamienne stanowisko |
| `booking_resource_services` | **`custom_duration_minutes`**, **`custom_price_net`** | **czas i cena RÓŻNE per osoba** — dokładnie to, o co pytałeś |
| `service_working_hours` | `employee_id`, `day_of_week`, `start_time`, `end_time` | godziny pracy per osoba |
| `service_calendar_blocks` | — | dni wolne i urlopy |
| `service_bookings` | `service_id`, `employee_id`, `resource_id`, `duration_minutes`, `source` | rezerwacja bez pojazdu; pola `vehicle_*` są **opcjonalne, z boku** |
| `voice_agent_personas` | `calendar_target`, `allowed_tools` per persona | już są persony `service_scheduler`, `realestate_acquirer` |

Trzy z czterech rzeczy, które wypisałeś jako „czego fryzjer potrzebuje, a warsztat nie ma",
**są w schemacie od dawna**: zasób jako osoba, czas trwania per osoba, brak obiektu klienta.

⚠️ **Ale u naszego warsztatu te tabele są PUSTE**: 0 usług, 0 zasobów, 0 godzin pracy.
Model istnieje, dane nie. To zmienia sens FAZY A: snapshot ma czytać z tabel
generycznych, a warsztat musi je wypełnić — tyle samo pracy co wypełnienie tabel
warsztatowych, tylko raz dla wszystkich branż.

### 1. Co w PROMPCIE jest pod warsztat

Prompt budowany w kodzie — **11 wystąpień**: `model` ×4, `auta` ×2, `marka` ×2,
`rejestracyjn` ×2, `warsztat` ×1. Wszystkie w dwóch blokach: sekwencji zbierania danych
i normalizacji liter w tablicy.

Prompt persony w bazie — **cały jest warsztatowy** („asystentka głosowa warsztatu
samochodowego", „mechanik zdiagnozuje na miejscu", „marka i model", „numer rejestracyjny").
**Ale to nie jest problem**: persona siedzi w `ai_agents_config` per `agent_id`, więc
fryzjer dostaje własną. To jedyne miejsce, gdzie treść branżowa NALEŻY.

### 2. Co w KODZIE jest pod warsztat

| miejsce | zaszycie |
|---|---|
| `check_availability` | liczy pojemność z **`workshop_workstations`** |
| `voice_commit_call` (RPC) | pisze do `workshop_orders`, `workshop_vehicles`, `workshop_clients`, `workshop_client_bookings`, `workshop_order_statuses` |
| `voiceExtraction` | pola `brand`, `model`, `plate` w kontrakcie ekstrakcji |
| `voiceReconcile` | `KNOWN_BRANDS` (30 marek aut), normalizacja i wiarygodność tablicy |
| `voice-agent-tools` | 6× `workshop_order`, 5× `workshop_vehicles`, 4× `workshop_clients` |

### 3. Czego fryzjer potrzebuje, a czego naprawdę brakuje

| potrzeba | stan |
|---|---|
| zasób = konkretna osoba | ✅ `booking_resources.name` + `type` |
| czas trwania per osoba | ✅ `booking_resource_services.custom_duration_minutes` |
| cena per osoba | ✅ `custom_price_net` |
| brak obiektu klienta | ✅ pola pojazdu opcjonalne |
| **preferencja osoby w rozmowie** („chcę do Ani") | ❌ **jedyna realna luka** — `check_availability` traktuje zasoby jako zamienne |
| **`workshop_*` w commicie** | ❌ zapis trafia do tabel warsztatowych |

### 4. Minimalny zakres, żeby fryzjer zadziałał

**Przy FAZIE A, prawie bez dodatkowego kosztu** (i tak przebudowuję snapshot):
1. snapshot czyta **`provider_services`** (nazwa, cena, `duration_minutes`) zamiast
   wymyślać źródło warsztatowe
2. snapshot czyta **`service_working_hours`** i `service_calendar_blocks`
3. pojemność z **`booking_resources`** zamiast `workshop_workstations` (z zapasową
   ścieżką na `workshop_workstations`, dopóki warsztat nie wypełni nowej tabeli)
4. snapshot podaje **listę zasobów z nazwami**, nie samą liczbę — fryzjer dostaje „Ania,
   Kasia", warsztat „Stanowisko 1–6", ten sam kontrakt
5. sekcja branżowa promptu z persony, nie z kodu — przenieść te 11 wystąpień

**Wymaga osobnej pracy, PO progu:**
6. wybór osoby w rozmowie („do Ani") — nowe pole w ekstrakcji + dopasowanie po imieniu
   zasobu + `employee_id` w rezerwacji
7. zapis do `service_bookings` zamiast `workshop_orders` dla branż bez zleceń
   (fryzjer nie ma „zlecenia", ma wizytę) — **to jest największy kawałek**
8. ekstrakcja warunkowa: pola pojazdu tylko dla branż, które mają obiekt

### 5. Czy projektować generycznie OD RAZU — **TAK**

Punkty 1–5 to **ta sama praca**, którą i tak wykonuję w FAZIE A, tylko wykonana wobec
tabel generycznych zamiast warsztatowych. Różnica w koszcie: bliska zeru. Różnica
w koszcie przeróbki za miesiąc: przepisanie kontraktu snapshotu, migracja danych
i ponowne przejście całego progu pięciu rozmów.

**Decyzja: snapshot projektuję generycznie od pierwszej linii.** Kontrakt mówi
`zasoby`, `usługi`, `godziny`, nigdy `stanowiska`, `naprawy`, `pojazdy`.
Pola branżowe idą do `branża: { … }`, nie do korzenia.

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
