# FAZA 2 — przepisanie: zapis po rozłączeniu

Spec. **Nie ma tu kodu i nie ma go pisać przed akceptacją.**

Zasada: **w trakcie rozmowy agent tylko ZBIERA. Cały zapis startuje po rozłączeniu.**

---

## Dlaczego, na własnych pomiarach

Atomowe przejęcie rozmowy (wdrożone 05.08) usuwa duplikaty w bazie, ale **nie usuwa
duplikatów żądań** — a te szkodzą także wtedy, gdy nic nie zapisują:

| Objaw | Dowód |
|---|---|
| duplikat narzuca czas gorszej kopii | tura 24 s: `first_text` 1554 ms i 4954 ms, ElevenLabs zmierzył `ttfb` **5,81 s** — czekał na wolniejszą |
| duplikat przerywa turę przed `end_call` | tura 112 s: `interrupted: true`, ElevenLabs zarejestrował **zero** wywołań narzędzi, mimo `client_tool_requested: end_call` w obu żądaniach |
| duplikat prawdopodobnie skleja audio | w transkrypcie zlepki „Dobrze rozumiem. Rozumiem — chodzi o…", dokładnie na turach z duplikatem |
| tura z zapisem jest długa | 8316 ms (05.08 02:05), 15218 ms (05.08 17:56) wobec ~1700 ms tury bez narzędzi |

**Tura tylko-do-odczytu jest na to odporna z definicji.** Duplikat czegoś, co nic nie
zmienia, jest nieszkodliwy. Nie walczymy z ElevenLabs — przestajemy być podatni.

### Duplikaty są ZAMIERZONE — potwierdzone oficjalnie

Blog ElevenLabs o silniku orkiestracji: orkiestrator zmniejsza odczuwalną latencję,
przewidując koniec wypowiedzi użytkownika, i w niektórych przypadkach skutkuje to
wieloma żądaniami generacji LLM z tym samym kontekstem w jednej turze.

To projekt platformy, nie usterka. **Nigdy tego nie wyłączymy.** Trzy próby znalezienia
wyłącznika (`speculative_turn`, `turn_eagerness`, hipoteza retry) szukały czegoś, co
nie istnieje. FAZA 2 przestaje być optymalizacją i staje się jedyną drogą.

### Dodatkowy zysk: definicje narzędzi to gruby kawałek promptu

Pomiar prompt cachingu z 05.08 19:42 pokazał cachowany prefiks **9427 tokenów** —
ponad trzy razy więcej niż sam prompt systemowy (~2650). Różnicę stanowią definicje
narzędzi przekazywane modelowi w każdym żądaniu.

Usunięcie `create_booking` i `create_order` z listy narzędzi modelu daje więc większy
zysk, niż zakładaliśmy: to nie tylko krótsza tura bez zapisów, ale i wyraźnie mniejszy
kontekst wejściowy. Zostaje `check_availability` i `end_call`.

---

## Dwadzieścia zasad wyprowadzonych z błędów

Każda ma za sobą konkretną awarię. Wpisane tu, żeby nie powtórzyć ich w nowym kodzie.

1. **ElevenLabs PODMIENIA ostatnią wypowiedź i odpala turę od nowa.** Dowód: 14 żądań
   na 9 tur, identyczna liczba wiadomości (5/5, 9/9, 17/17, 19/19) przy różnych skrótach
   treści w 3 z 4 przypadków. `speculative_turn: false` i `turn_eagerness: "normal"`
   tego nie zatrzymały. **Architektura ma być odporna, nie walcząca.**
2. **`maybeSingle()` tam, gdzie duplikaty są możliwe, to błąd.** Przy więcej niż jednym
   wierszu PostgREST zwraca BŁĄD, nie wiersz — bez odebrania `error` wygląda to jak brak
   dopasowania i kod wstawia kolejny duplikat, przez co następne sprawdzenie pasuje do
   jeszcze większej liczby wierszy. Tak powstały 3 rezerwacje i 6 SMS-ów.
   **Zawsze `limit(1)` + tablica.**
3. **Model schowa tekst w każdym polu, które dostanie.** Pożegnanie trafiło do
   `system__message_to_speak` zamiast do mowy, bo takie pole istniało w schemacie.
   **Nie dawać modelowi pól, w których może schować to, co ma powiedzieć.**
4. **Model relacjonuje to, co robi.** Cztery kolejne wersje zakazu nie usunęły
   „Teraz tworzę rezerwację", bo model faktycznie ją tworzył — zakaz był sprzeczny
   z rzeczywistością. **Jedyny sposób na „nie mów, że tworzysz rezerwację" to jej
   nie tworzyć.** Ten objaw znika sam wraz z FAZĄ 2.
5. **Klucz idempotencji: `conversation_id`. Jedno miejsce. Nigdy telefon + data.**
   Klucz telefon+data+godzina powodował, że każdy kolejny test zderzał się z poprzednim:
   dedup zwracał wczorajszą rezerwację, `create_order` widział wczorajsze zlecenie
   i nie powstawało nic.
6. **Daty w `Europe/Warsaw`.** Runtime chodzi w UTC; między północą a 2:00 lokalnego
   data UTC jest o dzień wcześniejsza — czyli dokładnie w porze testów.
7. **`dynamic_variables` — zawsze wartość zastępcza, nigdy `null`.** Brak jednej zmiennej
   użytej w prompcie = ElevenLabs odrzuca inicjację i rozmowa startuje na konfiguracji
   domyślnej.
8. **Webhook staje się nośny → cron rekoncyliacyjny PRZED przełączeniem.** Dziś 3 z 7
   rozmów miało `elevenlabs_conversation_id = NULL`. Teraz to koszt analizy; po
   przełączeniu byłby to koszt klienta.
9. **Dopasowanie POPRAWIA dane, nigdy nie WSTRZYMUJE zapisu.** Zapis następuje zawsze,
   gdy komplet jest zebrany.
10. **Budżet 300 ms na inicjację; przy przekroczeniu pusty snapshot, nie błąd.**
    Rozmowa bez snapshotu jest gorsza. Rozmowa, która się nie zaczęła, jest stracona.
11. **Zakaz musi być WYKONALNY i nie może cytować tego, czego zakazuje.**
    Dwie odmiany tego samego błędu, obie potwierdzone:
    *niewykonalny* — „nie witaj się drugi raz" nie mogło zadziałać, bo model nie widzi
    pierwszej wiadomości (jest usuwana z kontekstu, Anthropic wymaga startu od użytkownika);
    *podpowiadający* — lista zakazanych zwrotów cytowała „już sprawdzam" dosłownie.
    Przed dodaniem reguły sprawdź: czy model widzi to, czego reguła dotyczy, i czy da się
    ją opisać bez cytowania zakazanej frazy.
12. **Połknięty `error` z zapytania to niewidoczna awaria.**
    `const { data } = await …` bez `error` daje `null` nie do odróżnienia od braku
    dopasowania. Trzy incydenty: `maybeSingle()` przy wielu wierszach (3 rezerwacje,
    6 SMS-ów), nieistniejące kolumny `address`/`city` w `service_providers` (SMS bez
    nazwy firmy przy poprawnych danych), nieodebrany błąd zapisu do grafiku.
    **Zawsze odbieraj `error` i loguj go.** W `voice-call-commit` błąd zapytania musi
    przerwać transakcję, a nie po cichu zmienić wynik.

13. **NIE POPRAWIAJ ASR NA WEJŚCIU, POPRAW DANE NA WYJŚCIU.**
    Wszystko, co próbuje pomóc rozpoznawaniu w locie — `asr.keywords`, keyword
    biasing, ponowna transkrypcja — ryzykuje halucynacją. Dopasowanie po rozmowie
    jest darmowe, bezpieczne i bez presji czasu.
    Dowód: `asr.keywords` przez tydzień produkowało zmyślone wypowiedzi (agent
    odpowiedział na nieistniejące pytanie o cenę, `end_call` unieważniony
    dziewięć razy); po wyczyszczeniu listy halucynacje zniknęły w pierwszej
    rozmowie. Ten sam problem rozwiązuje `matchBrand` po rozmowie, bez ryzyka.
    **Ryzyko jest asymetryczne:** przekręcenie kosztuje jedną turę dopytania
    i daje poprawne dane; halucynacja psuje całą rozmowę. Przekręcenie jest
    naprawialne, halucynacja nie.
    `asr.keywords` zostaje **puste na stałe**.

14. **ODPOWIEDŹ NARZĘDZIA MUSI ODRÓŻNIAĆ SUKCES OD BEZCZYNNOŚCI.**
    `ok: true` przy dedupie znaczyło „nic nie zrobiłem, bo już było" — a model
    przeczytał to jako „zrobione" i powiedział klientowi „gotowe". Klient usłyszał
    potwierdzenie wizyty, której nie umówiliśmy (rozmowy 05.08 18:23 i 21:37).
    Każde narzędzie ma zwracać, **CO SIĘ STAŁO**, nie tylko czy się nie wywróciło:
    `slot_already_booked`, `duplicate`, `order_failed` — a nie samo `ok`.
    Kontrola: przeczytaj odpowiedź narzędzia oczami modelu i zapytaj, czy da się
    z niej zbudować zdanie, które będzie **nieprawdziwe**.

15. **REGUŁA WARUNKOWA MUSI ZNIEŚĆ REGUŁĘ BEZWARUNKOWĄ, KTÓRĄ ŁAMIE.**
    Gałąź `caller_id` kazała powiedzieć „Potwierdzenie **wyślemy** SMS-em na numer,
    z którego Pan dzwoni", a blok ZAKOŃCZENIE zakazywał zwrotu „wyślemy SMS"
    i narzucał inne zdanie. Model wykonał zakaz, więc reguła warunkowa nie zadziałała
    ani razu — a wyglądała na wdrożoną.
    Szósta sprzeczność tej samej klasy i pierwsza, w której **nowa reguła nie była
    błędna sama w sobie** — kolidowała ze starą.
    **Przed dodaniem reguły warunkowej przeszukaj prompt pod kątem zdań, które
    zakazują tego, co ona nakazuje.**

16. **TOŻSAMOŚĆ ZAWSZE PO ROZMOWIE, NIGDY PO KLIENCIE I CZASIE.**
    Każda heurystyka „ten sam klient w oknie N minut" jest błędna, bo klient MOŻE
    zadzwonić dwa razy i za każdym razem umówić co innego. Jedyny poprawny klucz
    to `conversation_id`.
    **PIĘĆ niezależnych miejsc miało ten sam błąd:**
    1. dedup rezerwacji po telefon + data + godzina
    2. reuse wpisu w grafiku po telefon + data + godzina
    3. `create_booking` sprawdzający klienta zamiast wolnego stanowiska
    4. `create_order` po `client_id` + 15 minut
    5. `voice-call-analyze` — powiązanie transkryptu po telefonie + **60 minut**
       (okno czterokrotnie szersze niż w punkcie 4; to jest ta „heurystyka po
       numerze telefonu", która myliła się w ~60% rozmów)
    Przy każdym nowym zapisie sprawdź, czy nie powtarzasz.

17. **PRZED PRZEPISANIEM SPRAWDŹ, DLACZEGO STARE NIE DZIAŁA.**
    Inaczej nowe odziedziczy przyczynę i będzie wyglądać jak nowy błąd.
    Przypadek: gdyby `voice-call-commit` wołał `create_order`, przeniósłby dedup
    po `client_id` + 15 min do nowej architektury — a wyglądałoby to jak świeża
    usterka transakcji. Diagnoza zajęła piętnaście minut; szukanie tego samego
    w nowym kodzie zajęłoby dni.

18. **PRZY EKSTRAKCJI ODRZUCAMY WARTOŚCI NIEPEWNE, NIE POPRAWIAMY ICH.**
    `"07.08.2026"` i `"25:00"` dają `null`, a nie zgadywaną datę i godzinę.
    **Kolejka weryfikacji jest tania, zła data kosztuje wizytę** — klient przyjeżdża
    w złym terminie albo wcale, a warsztat trzyma zajęty slot.
    Dotyczy też odwrotności: nie „naprawiamy" nazwiska ani marki na siłę —
    dopasowanie z bazy owszem, zgadywanie nie.

19. **PRZED ZBUDOWANIEM SPRAWDŹ, CZY TEGO NIE MA.**
    Zasada 17 mówi: zanim przepiszesz, sprawdź **czemu stare nie działa**.
    Ta mówi: zanim napiszesz nowe, sprawdź **czy stare nie istnieje**.
    Dowód: `next_workshop_order_number` istniała od kwietnia, z triggerem
    i blokadą wiersza. Duplikat nie tylko był zbędny — przeciążenie uczyniło
    wywołania jednoargumentowe niejednoznacznymi i mogło zepsuć RPC z panelu,
    czyli coś **spoza agenta**.
    **Kontrola:** przy każdej nowej funkcji SQL i każdym nowym module najpierw
    przeszukaj schemat i kod pod kątem nazwy oraz nazw zbliżonych.

**Test w `BEGIN … ROLLBACK` przy KAŻDEJ migracji jest standardem.** To on złapał
wpisywanie identyfikatora do złej kolumny stanowiska, zanim trafiło na produkcję.

20. **TESTY JEDNOSTKOWE SPRAWDZAJĄ KOD, NIE KONTEKST.**
    `parseExtraction` miał 8/8 i był poprawny — brakowało mu **daty rozmowy**,
    a klient nie wypowiada roku. Model wpisywał 2024/2025, czyli wizyty
    w przeszłości, prawie w każdej rozmowie. Test na prawdziwym zbiorze
    złapał to w minutę.
    **Przy każdym module dotykającym danych z rozmowy: przepuść go przez
    WSZYSTKIE zapisane transkrypty, zanim uznasz za gotowy.**

**Kontrola przed każdym commitem do tego modułu:** przejdź listę i wskaż, którą zasadę
zmiana realizuje albo mogłaby złamać. Pięć klas sprzeczności w prompcie v1 powstało
dlatego, że nikt tego nie robił.

---

## Co ZNIKA

| Element | Gdzie dziś | Dlaczego znika |
|---|---|---|
| **dedup po telefon+data+godzina** | `voice-agent-tools`, `create_booking` | zły klucz (zasada 5). Zastąpiony idempotencją po `conversation_id` w jednym miejscu |
| **deterministyczne `create_order` wewnątrz `create_booking`** | `create_booking`, wywołanie HTTP do samego siebie | zlecenie powstaje w `voice-call-commit`, w jednej transakcji z resztą. Znika też wywołanie funkcji przez samą siebie i jego `AbortSignal.timeout(10_000)` |
| **heurystyka powiązania po numerze telefonu** | `voice-call-analyze` (okno 60 min, `norm9`, dopasowanie klienta) | zastąpiona `conversation_id`. Heurystyka myliła się w ~60% rozmów |
| **rozsiana idempotencja** | `conversationCall?.linked_entity_id` w `create_booking`, dedup po `booking_id` w `create_order`, sprawdzenie SMS po `appointment_id`, sprawdzenie wpisu w grafiku, atomowe przejęcie rozmowy | **pięć różnych mechanizmów w trzech miejscach.** Jedna blokada w `voice-call-commit` po `conversation_id` |
| **`voice_booking_claim`** | wartownik w `linked_entity_type` | łata na wyścig, który przestaje istnieć |
| **zapis w trakcie tury** | `create_booking`, `create_order` jako narzędzia modelu | cały powód FAZY 2 |

Do czasu przełączenia **wszystko powyżej zostaje na produkcji i działa** — usuwamy
dopiero w kroku 7 kolejności z `voice-agent-faza1.md`.

## Co zostaje NIETKNIĘTE

- **`voice-agent-llm`** — proxy, autoryzacja, parser znacznika RIDO, sonda, przekazywanie
  `client_tools`, pomiary. Kontrakt z ElevenLabs się nie zmienia.
- **`workshop-send-sms`** i cały tor SMS — zmienia się tylko **kiedy** jest wołany
- **logika grafiku** — `station_id` z pierwszego wolnego stanowiska,
  `WorkshopScheduler` mapujący `station_id → scheduled_station_id`. Przenosi się bez zmian
- **keep-warm** — dwa crony co minutę, potrzebne tym bardziej
- **`scripts/diagnose-call.sh`** — sekcja 5 (stan bazy) zyskuje na znaczeniu
- **post-call webhook ElevenLabs** — ten sam endpoint, HMAC, `agent_id` → tenant
- **`voice-call-analyze`** — uczenie i destylacja reguł zostają; traci tylko
  fallback po telefonie
- **canary, `verify_jwt=false` + autoryzacja w kodzie, `getSecret`** — bez zmian
- **KSeF, płatności, faktury, fiskalizacja, pozostali agenci** — nie dotykamy

---

## ROZMOWA JAKO BYT PIERWOTNY

Zależność była odwrócona: `voice_calls.linked_entity_id` wskazuje **na zlecenie**,
więc rozmowa była doczepką do zlecenia. Przy nieudanym `create_order` zostawała
z `linked_entity_type: service_booking` i nigdy nie awansowała — dokładnie to
stało się 06.08 00:41 (trzy wywołania `create_order`, zero zleceń).

**Rozmowa ma istnieć zawsze. Zlecenie powstaje Z rozmowy.**

### Przy odebraniu połączenia (webhook inicjujący)
```sql
INSERT INTO voice_calls (elevenlabs_conversation_id, provider_id, from_number,
                         started_at, status)
VALUES (…, 'in_progress');
```
Jeden INSERT, przed powitaniem, nikt na niego nie czeka. Idempotentny dzięki
`voice_calls_conversation_uniq`.

### Po rozłączeniu (`voice-call-commit`), w tej kolejności
1. `UPDATE voice_calls` — transkrypt, `ended_at`, `status`
2. ekstrakcja danych z transkryptu
3. dopasowanie klienta po telefonie, pojazdu po rejestracji (`voiceReconcile`)
4. gdy komplet → **transakcja**: rezerwacja + zlecenie + grafik
5. `UPDATE voice_calls` — `linked_entity_id` = zlecenie
6. **SMS dopiero teraz**, gdy wszystko istnieje

Gdy krok 4 się nie uda — **rozmowa i transkrypt ZOSTAJĄ**, bez powiązania,
ze statusem wymagającym uwagi.

### ⚠️ Sprostowanie do uzasadnienia

„Transkrypt nie ma gdzie usiąść" jest nieścisłe: `voice_transcripts.call_id` ma
FK do `voice_calls(id) ON DELETE CASCADE`, więc **transkrypt już dziś wisi
na rozmowie, nie na zleceniu**. Problem jest w DOSTĘPIE: `OrderCallPanel` szuka go
wyłącznie od strony zlecenia (`linked_entity_type` + `linked_entity_id`), więc bez
zlecenia transkrypt istnieje, ale jest nieosiągalny z panelu.

Wniosek projektowy się nie zmienia — zmienia się to, co naprawia widok „Połączenia":
nie ratuje danych, tylko je **odsłania**.

### MIGRACJA NIE JEST POTRZEBNA — sprawdzone

```
voice_calls.status   text  NOT NULL  DEFAULT 'initiated'
CHECK constraints:   BRAK
wartości w użyciu:   'completed' (49 wierszy)
```

Nowe wartości (`in_progress`, `needs_review`, `abandoned`) można wprowadzić
bez DDL. Powód uboczny: **brak CHECK oznacza, że literówka w statusie nie zostanie
złapana** — lista dozwolonych wartości musi być stałą w kodzie, a CHECK warto
dołożyć dopiero, gdy zestaw się ustabilizuje.

`outcome` (text, nullable) nadaje się na powód wymagający uwagi.

### 🔴 DIAGNOZA: czemu trzy wywołania `create_order` dały ZERO zleceń

Rozstrzygnięte co do sekundy — **dedup `recentOrder`, okno 15 minut na `client_id`**:

```
22:28:19  ZLP-08/2026-005  utworzone dla client_id 9a4d2908  (POPRZEDNIA rozmowa)
22:42:44  rezerwacja z rozmowy 22:41, telefon +48519474583
          -> norm9 = 519474583 -> TEN SAM client_id 9a4d2908
22:42:46  create_order
odstep:   14,44 minuty            okno dedupu: 15 minut
```

Kod (`voice-agent-tools`, „dedup #2"):
```ts
.eq("client_id", clientId)
.gte("created_at", new Date(Date.now() - 15 * 60000).toISOString())
if (recentOrder) return { ok: true, order_id: recentOrder.id, duplicate: true }
```

Wszystkie trzy wywołania trafiły w zlecenie z **poprzedniej rozmowy** i zwróciły
jego identyfikator. `linkConversation` jest **za** tym `return`, więc rozmowa
została z `linked_entity_type: service_booking` i nigdy nie awansowała.

**To ta sama klasa błędu co dedup rezerwacji: tożsamość liczona po kliencie
i czasie zamiast po ROZMOWIE.** Trzeci raz ten sam wzorzec.

⚠️ **KONSEKWENCJA: `voice-call-commit` NIE MOŻE wołać `create_order`.**
Odziedziczyłby dokładnie ten dedup. Commit tworzy zlecenie własną transakcją,
z idempotencją wyłącznie po `conversation_id` — jedno miejsce, jeden klucz (zasada 5).

### Sprzątanie pustych rozmów — CRON, nie commit

**USUWAMY** (to nie były rozmowy):
- brak transkryptu w ogóle
- rozmowa krócej niż 10 s
- transkrypt zawiera wyłącznie powitanie agenta, zero wypowiedzi klienta
- klient powiedział tylko „halo", „pomyłka", „przepraszam"

**ZOSTAWIAMY, oznaczone jako wymagające uwagi:**
- klient mówił, ale ekstrakcja nie dała kompletu
- klient rozłączył się w trakcie zbierania danych
- agent nie zrozumiał problemu
- klient pytał o coś, na co agent nie umiał odpowiedzieć

Kasowanie robi **cron raz na dobę, NIE commit** — commit tylko oznacza status.
Dzięki temu kryteria da się zmienić bez ruszania ścieżki zapisu.
Cron loguje ile i dlaczego. **Jeśli kasuje połowę, kryterium jest złe.**

Uwaga techniczna: `voice_transcripts` ma `ON DELETE CASCADE`, więc usunięcie
rozmowy usuwa też transkrypt — to jest zamierzone, ale znaczy, że kasowanie
jest nieodwracalne i kryteria muszą być ostrożne.

## ⚠️ Numeracja zleceń — projekt JUŻ to miał, ja zbudowałem duplikat

Zaproponowałem tabelę licznika i funkcję `next_workshop_order_number(uuid)`.
**Obie były niepotrzebne**, a druga wyrządziła szkodę:

```
public.next_workshop_order_number(p_provider_id uuid, p_kind text DEFAULT 'ZL')
  -> istnieje od 20260420, blokuje wiersz w workshop_order_sequences
  -> trigger trg_workshop_order_number na workshop_orders woła ją automatycznie
  -> wybiera ZLP gdy booking_id jest ustawione, inaczej ZL
```

Moje przeciążenie `(uuid)` uczyniło wywołania **jednoargumentowe niejednoznacznymi**
(`function is not unique`), bo istniejąca ma domyślny `p_kind`. Cofnięte:
przeciążenie i tabela usunięte, `voice_commit_call` **nie nadaje numeru sam** —
wstawia wiersz bez `order_number` i bierze go z `RETURNING`, po tym jak trigger go nada.

**Pozostaje otwarte i NIE jest moje do naprawy:** istniejąca funkcja liczy
„najmniejszy nieużywany numer od 1 do max+1", więc **po usunięciu zlecenia numer
wraca do obiegu**. Potwierdzone: po skasowaniu sierpniowych zleceń testowych
kolejne dostało `ZLP-08/2026-001`, czyli numer, który już był u klienta na SMS-ie.
To dokładnie ryzyko, o którym mówił właściciel — ale dotyczy **całego modułu
warsztatu**, nie tylko agenta, więc zmiana wymaga osobnej decyzji.

## ⚠️ Dwie tabele stanowisk — pułapka złapana testem

```
workshop_orders.station_id      -> FK do workshop_stations      (2 wiersze)
workshop_orders.workstation_id  -> FK do workshop_workstations  (12 wierszy)
```

Grafik i `check_availability` operują na `workshop_workstations`. Pierwsza wersja
`voice_commit_call` wpisywała ten identyfikator do `station_id` i transakcja padała
na kluczu obcym. Złapane testem w `BEGIN … ROLLBACK`, zanim cokolwiek trafiło
na produkcję — i to jest argument za tym, żeby każdą migrację tak testować.

## Kontrakt `voice-call-commit`

Nowa akcja. Jedno wejście, jedno wyjście, jedna transakcja.

### Wejście
```jsonc
{
  "action": "commit_call",
  "conversation_id": "conv_…",     // KLUCZ IDEMPOTENCJI, wymagany
  "provider_id": "…",
  "persona_key": "workshop_secretary",
  "caller_id": "+48519474583",     // z system__caller_id — fakt, nie ASR
  "transcript": [ { "role": "user|agent", "message": "…" } ],
  "extracted": {                    // z _shared/voiceExtraction.ts
    "complaint": "…",               // SŁOWA KLIENTA, zwięźle
    "date": "2026-08-06", "time": "09:00",
    "first_name": "…", "last_name": "…", "phone": "…",
    "brand": "…", "model": "…", "plate": "…",
    "confidence": { "plate": "low" }
  }
}
```

### Wyjście
```jsonc
{
  "ok": true,
  "status": "committed | duplicate | queued",
  "conversation_id": "conv_…",
  "order_id": "…", "order_number": "ZLP-08/2026-00X",
  "booking_id": "…", "calendar_row_id": "…", "station_id": "…",
  "sms": { "sent": true, "type": "booking_confirmation_ai" },
  "matched": { "client": "by_phone", "vehicle": "by_plate", "needs_review": false },
  "queued_reason": null            // wypełnione tylko przy status: "queued"
}
```

### Zachowanie

- **Idempotencja po `conversation_id`** — jedno miejsce, gwarantowane unikalnym indeksem
  `voice_calls_conversation_uniq` (założony 05.08). Powtórka zwraca `duplicate`
  z tymi samymi identyfikatorami. Bez sprawdzania „czy istnieje, potem wstaw".
- **Transakcja.** Klient Supabase w Deno nie ma transakcji wielozapytaniowych, więc
  całość jako funkcja SQL `SECURITY DEFINER`, wołana przez `admin.rpc('voice_commit_call', …)`.
  Rollback obejmuje: rezerwację, wpis w grafiku, klienta, pojazd, zlecenie, powiązanie
  transkryptu. **SMS jest POZA transakcją** — wysyłany po jej sukcesie, bo nie da się
  go wycofać.
- **Kolejność w transakcji:** klient → pojazd → rezerwacja → wpis w grafiku (`station_id`)
  → zlecenie (`booking_id`) → powiązanie `voice_calls.linked_entity_*`.
- **`status: "queued"`** wyłącznie gdy zapisu NIE DA SIĘ wykonać: brak terminu,
  rozmowa urwana przed kompletem, klient się rozmyślił. **Nigdy z powodu „nazwisko
  brzmi dziwnie"** (zasada 9).

### Dopasowanie (`_shared/voiceReconcile.ts`)

```
a) telefon — system__caller_id ma PIERWSZEŃSTWO nad ASR → workshop_clients
   trafienie -> imię, nazwisko, historia Z BAZY zamiast z ASR
b) rejestracja → workshop_vehicles
   trafienie -> marka, model, właściciel, historia Z BAZY
c) rejestracja wskazuje pojazd znanego klienta, telefon się NIE zgadza
   -> dane pojazdu wygrywają, needs_review = true, ale ZAPISUJEMY
d) nic nie pasuje -> nowy klient z danymi z ASR
```

Uzasadnienie z danych: w pięciu rozmowach testowych ASR podał **pięć różnych nazwisk**
(Macioskowski, Mosleczko, Noszeczkow, Moszeczkow, Mosaczkowski) i **dwa błędne telefony
z pięciu**. `system__caller_id` jest faktem z sygnalizacji SIP, nie zgadywanką.

---

## Co zostaje z `voice-agent-tools`

Po przełączeniu funkcja **tylko czyta**. Traci klucz service-role do zapisu w ścieżce
rozmowy — to także zysk bezpieczeństwa przy `verify_jwt = false`.

| Akcja | Los |
|---|---|
| `check_availability` | **zostaje** — jedyny wyjątek, dla terminów spoza snapshotu, z jawną zapowiedzią „Chwileczkę, sprawdzę dalsze terminy". Musi być **jawnie dopisany do bloku ZAKAZ RELACJONOWANIA**, inaczej prompt zaprzecza sam sobie |
| `create_booking` | znika z narzędzi modelu; logika wnętrza (stanowisko, wpis w grafiku, token) przenosi się do `voice_commit_call` |
| `create_order` | jw. |
| `lock_slot` | **nowa, jedyny zapis w trakcie** — `EdgeRuntime.waitUntil`, bez `await`, idempotentna po `conversation_id`, TTL 15 min, wygasanie leniwe. Zapis po rozmowie **nie zakłada, że blokada istnieje** |

Rozważane i **odrzucone**: tworzenie zlecenia od razu przy odebraniu połączenia
(„niewidoczne, potem edytuj"). Powód mocniejszy niż śmiecenie w bazie:
**numeracja `ZLP-08/2026-NNN` jest widoczna dla klienta i dla księgowości**, więc
każda pomyłka i rozłączenie po dwóch sekundach zjadałyby numer z sekwencji.
Rekord ROZMOWY daje ten sam efekt bez tego kosztu.

Rozważane i **odrzucone**: przeniesienie `check_availability` do osobnej funkcji.
Zysk żaden, a `diagnose-call.sh` i pomiary trzeba by przepisać.

---

## Kolejność (bez zmian wobec zaakceptowanej)

1. FAZA 1A — korelacja ✅ wdrożone 05.08, czeka na potwierdzenie telefonem
2. FAZA 1B — webhook inicjujący + snapshot
3. FAZA 1C — zero odczytów per tura + prompt caching
4. **cron rekoncyliacyjny + alert** ← przed 6 i 7
5. **kolejka weryfikacji w panelu** ← przed 6 i 7
6. FAZA 2 — `voice-call-commit`
7. wyłączenie narzędzi zapisujących

Kroki 4 i 5 są przed 6 i 7 celowo (zasada 8).

## Kryteria odbioru FAZY 2

- rozmowa z kompletem danych → zlecenie + wpis w grafiku + SMS + transkrypt, **zawsze**
- powtórzony webhook → `duplicate`, zero nowych wierszy
- świadomie zgubiony webhook → odzyskany przez cron w ≤ 15 min
- `diagnose-call.sh` sekcja 6: zero czerwonych flag na czystej rozmowie
- tura poniżej 1,2 s, zero narzędzi zapisujących w osi czasu

### ZASADA DWUDZIESTA PIERWSZA: pomiar na jednym przypadku to nie pomiar

Skąd: `max_tokens` 150. Dobrałem tę wartość z JEDNEJ rozmowy — najdłuższa wypowiedź
183 znaki ≈ 57 tokenów, więc 150 wyglądało na dwukrotny zapas. Na trzynastu rozmowach
najdłuższa miała 249 znaków ≈ 78 tokenów, a z wywołaniem narzędzia w tej samej turze
budżet się kończył: 3 ucięcia na 126 żądań, w tym jedno kończące rozmowę z klientką
bez żadnego zapisu.

To zasada 20 („własne szacunki weryfikuj pomiarem") zastosowana do samego pomiaru.
Jeden przypadek daje wartość, nie rozkład — a próg ustawia się na ogonie rozkładu,
nie na medianie.

**Jak stosować:** zanim ustawisz próg, limit albo wartość odcięcia, zbierz rozkład
z co najmniej kilkunastu przypadków i patrz na maksimum, nie na typową wartość.
Do każdego progu dołóż licznik jego przekroczeń (tu: `output_truncated`), żeby
pomyłka była widoczna od razu, a nie po analizie transkryptów tydzień później.

