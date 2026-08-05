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
