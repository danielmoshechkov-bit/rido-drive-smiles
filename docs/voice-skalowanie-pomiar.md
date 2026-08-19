# Skalowanie do 100 warsztatów — pomiar, ryzyka, plan testu

Zasada z polecenia: **naprawiamy to, co pomiar pokaże jako problem, nie to,
co teoretycznie mogłoby nim być.** Poniżej najpierw to, co już zmierzone
(odczyty z produkcji), potem plan testu obciążeniowego — do akceptacji,
bo nie da się go uruchomić bezpiecznie bez decyzji.

---

## A. Rozróżnienie, które ucina połowę listy

Prawie wszystkie zapytania agenta i panelu są **zawężone do jednego warsztatu**
(`provider_id`). Ich koszt rośnie z liczbą danych JEDNEGO warsztatu, a nie
z liczbą warsztatów w systemie. Sto warsztatów po 200 klientów to dla takiego
zapytania nadal 200 klientów, o ile jest indeks.

Rośnie z liczbą warsztatów tylko to, co jest **globalne**: crony chodzące po
całej tabeli, zapytania bez `provider_id` i rzeczy współdzielone
(kolejka numerów, `system_alerts`).

To rozróżnienie decyduje, co jest na liście poniżej, a co nie.

---

## B. Zapytania w `voice-agent-init` — zmierzone

Snapshot przy odebraniu połączenia ładuje równolegle:

```
service_providers        1 wiersz po kluczu głównym
provider_services        limit 40    .eq(provider_id).eq(is_active)
zasoby/stanowiska        limit 30
pracownicy               limit 30
workshop_client_bookings limit 400   .eq(provider_id) + zakres dat
workshop_clients         limit 500   .eq(provider_id)
```

**Wszystko ma limit, wszystko jest zawężone do warsztatu.** Nie ma zapytań
w pętli, nie ma N+1 — to jeden `Promise.all`.

### Indeksy — stan faktyczny

| Tabela | Indeks pod to zapytanie | Wierszy dziś | Ocena |
|---|---|---|---|
| `workshop_clients` | ✅ `idx_workshop_clients_provider` | 168 | dobrze |
| `voice_numbers` | ✅ `voice_numbers_lookup (phone_number) WHERE status IN (...)` | 2 | dobrze |
| `voice_active_calls` | ✅ `(provider_id, started_at DESC)` | 0 | dobrze |
| `voice_calls` | ✅ `(provider_id, created_at DESC)` | 67 | dobrze |
| **`workshop_client_bookings`** | ❌ **brak `(provider_id, appointment_date)`** | 112 | **realne ryzyko** |
| **`provider_services`** | ❌ **brak `provider_id`** (jest tylko `category`) | 19 | niskie |

**`workshop_client_bookings` to jedyny wpis, który przy 100 warsztatach robi
się problemem.** Istniejący indeks unikalny `(provider_id, phone,
appointment_date, appointment_time)` ma `phone` na drugiej pozycji, więc zakres
dat nie da się z niego odczytać — zostaje skan. Dziś 112 wierszy; przy stu
warsztatach po 50 rezerwacji miesięcznie przez rok to ~60 000 wierszy
skanowanych **przy każdym odebranym telefonie**, w środku budżetu 800 ms.

Naprawa to jeden indeks. **Ale zgodnie z zasadą — dodajemy go dopiero, gdy test
obciążeniowy pokaże, że to widać w czasie odpowiedzi.** Ryzyko jest tanie do
usunięcia i tanie do sprawdzenia.

`provider_services` bez indeksu: 19 wierszy dziś, ~3000 przy stu warsztatach.
Skan 3000 wierszy to ułamek milisekundy. **Zostawiamy.**

---

## C. Panel — stan lepszy, niż się spodziewałem

Ktoś zrobił tu już pracę (komentarze „PERF C2"):

```
zlecenia aktywne      limit 500, filtr statusu po stronie serwera
zlecenia zakończone   limit z filtrów + zakres dat
zlecenia „wszystkie"  bezpiecznik zamiast całego archiwum
połączenia            limit 50
klienci               limit 5000
```

**Bez limitu znalazłem trzy zapytania**, wszystkie zawężone do warsztatu:

```
WorkshopPortalBookings.tsx:88   workshop_clients
WorkshopScheduler.tsx:161,210   workshop_client_bookings
```

Terminarz bez limitu jest wart obserwacji przy warsztacie z dużym archiwum
rezerwacji, ale znowu: to rośnie z jednym warsztatem, nie ze setką.

**Paginacji (`.range()`) nie ma nigdzie w panelu warsztatu.** To jest dług,
ale dług o kształcie „jeden duży warsztat", nie „sto warsztatów".

---

## D. Crony — 18 zadań, cztery co minutę

```
* * * * *     translation-queue-worker        edge
* * * * *     voice-keep-warm                 sql
* * * * *     voice-numbers-worker            edge
* * * * *     workshop-scheduled-sms-dispatch edge
*/5           auto-queue-hot-leads-5min
*/15          booking-reminders-cron, sync-external-leads, voice-call-reconcile
0 */3         translate-new-listings
+ 9 zadań dobowych (nocne sprzątanie, rozliczenia, rekoncyliacje)
```

**Rozmiar bazy dziś: 334 MB** (nie 481 MB — spadło). Największe tabele:

```
ic_parts_catalog   88 MB     katalog części, nie crony
ai_messages        34 MB     historia rozmów AI
vehicle_listings  6,9 MB
```

Czyli **dzisiejsza objętość nie pochodzi z cronów.** Nadmuchanie, o którym
mówisz, zostało posprzątane i wróciło do rozsądnych rozmiarów.

**Co rośnie z liczbą warsztatów:** `voice-numbers-worker` bierze jedno zadanie
na przebieg (świadomie — operator limituje zapis do 1/10 s). Przy stu
warsztatach aktywujących się w jednym tygodniu to nadal jedno zadanie na
minutę, czyli 1440 aktywacji dziennie. **Wystarczy.**

`workshop-scheduled-sms-dispatch` i `booking-reminders-cron` chodzą po
wszystkich warsztatach — to są dwa zadania warte pomiaru czasu wykonania przy
większej liczbie danych. Dziś nie wiemy, ile trwają.

---

## E. Test obciążeniowy — projekt, NIE URUCHOMIONY

### Problem, przez który nie mogę tego po prostu odpalić

`voice-agent-init` **nie jest funkcją tylko do odczytu.** Przy każdym wywołaniu:

1. wstawia wiersz do `voice_active_calls` (limit rozmów równoczesnych),
2. wiersz wygasa dopiero po **30 minutach**, jeśli nie przyjdzie webhook końca.

Sto wywołań na numerze pierwszego warsztatu **zablokowałoby mu telefon na pół
godziny**. To łamie warunek nadrzędny.

### Jak to zrobić bezpiecznie — trzy warianty

**Wariant 1 — tryb sondy w funkcji (rekomendowany).**
Nagłówek `x-rido-sonda: 1` przy autoryzacji tokenem serwisowym: funkcja wykonuje
**wszystkie zapytania** i mierzy czas, ale **nie wstawia** do `voice_active_calls`
i **nie loguje** rozmowy. Mierzy dokładnie to, co nas interesuje — pracę bazy
i budżet 800 ms — bez skutków ubocznych.
Koszt: ~30 linii w `voice-agent-init`, jedna gałąź przed zapisem.
Ryzyko: gałąź w funkcji obsługującej prawdziwe telefony. Wymaga testu, że
sonda **nie da się włączyć** bez tokenu serwisowego.

**Wariant 2 — osobny warsztat testowy z limitem 100.**
Ustawiamy CART `max_rozmow_rownoczesnie = 100`, strzelamy w jego numer, po
teście kasujemy wiersze z `voice_active_calls` i przywracamy limit.
Zero zmian w kodzie. Mierzy prawdziwą ścieżkę, ale **na danych CART** (pusta
oferta, pusty kalendarz) — czyli snapshot mniejszy niż u prawdziwego warsztatu,
więc wynik będzie optymistyczny.

**Wariant 3 — pomiar samych zapytań, bez funkcji.**
Odtwarzamy sześć zapytań snapshotu jako SQL i mierzymy `EXPLAIN ANALYZE` przy
podstawionej liczbie wierszy. Nie mierzy funkcji brzegowej ani sieci, ale
odpowiada na najważniejsze pytanie — **czy brak indeksu na
`workshop_client_bookings` boli** — i jest całkowicie bezpieczny.

### Co mierzymy w każdym wariancie

```
50 i 100 równoczesnych wywołań
→ czas odpowiedzi: mediana, 95. centyl, najgorszy
→ ile przekroczyło 800 ms
→ błędy: 5xx, przekroczenia czasu, wyczerpanie połączeń do bazy
→ czas najdłuższego pojedynczego zapytania (z logów stage_timing)
```

### WARIANT 3 — WYKONANY 19.08, oto wynik

`EXPLAIN (ANALYZE, BUFFERS)` na prawdziwych zapytaniach snapshotu, na produkcji,
bez zapisu czegokolwiek:

```
REZERWACJE (provider_id + zakres dat, limit 400)
  Seq Scan on workshop_client_bookings
  Rows Removed by Filter: 100      ← przeczytane i odrzucone
  Buffers: shared hit=5
  Execution Time: 0.142 ms

KLIENCI (provider_id, limit 500)
  Seq Scan on workshop_clients      ← indeks JEST, planista go nie użył
  Rows Removed by Filter: 26
  Execution Time: 0.136 ms
```

**Dwie rzeczy warte odnotowania.**

Po pierwsze: **planista wybiera skan sekwencyjny nawet tam, gdzie indeks
istnieje** — bo przy 168 wierszach skan całej tabeli jest tańszy niż zejście
po indeksie. To znaczy, że **dzisiejszy pomiar nie mówi nic o tym, czy indeks
działa**. Powie to dopiero pomiar przy większej tabeli.

Po drugie: koszt skanu rośnie **liniowo z liczbą wierszy**, a te tabele są
globalne — rezerwacje wszystkich warsztatów leżą w jednej tabeli. Ekstrapolacja
z pomiaru (to jest rachunek, nie pomiar):

```
                       dziś              przy 100 warsztatach
workshop_client_bookings   112 wierszy       ~60 000 (50/mc × 100 × 12 mc)
  czas skanu               0,14 ms           ~75 ms
workshop_clients           168 wierszy       ~20 000
  czas skanu               0,14 ms           ~17 ms
```

92 ms z 800 ms budżetu na dwa zapytania, które dziś kosztują 0,3 ms. Same
w sobie zmieszczą się. **Problemem jest suma przy równoczesności:** sto rozmów
naraz to sto takich skanów, czyli ~9 sekund pracy procesora bazy na jeden
„dzwonek" — i to jest miejsce, w którym budżet 800 ms przestaje się trzymać
nie z powodu jednego zapytania, tylko z powodu kolejki do procesora.

**Wniosek: indeks na `(provider_id, appointment_date)` jest uzasadniony** — ale
uzasadnia go rachunek, nie pomiar, więc chcę go dodać razem z pomiarem PO
dodaniu, a nie zamiast pomiaru.

### Rekomendacja

**Wariant 3 najpierw** — dziś, za darmo, bez ryzyka. Jeśli pokaże, że zapytania
mieszczą się z zapasem przy 60 000 rezerwacji, **wariant 1 i 2 są niepotrzebne**
i nie budujemy sondy „na wszelki wypadek".

Jeśli pokaże problem — dodajemy indeks i mierzymy ponownie. Dopiero gdyby i to
nie wystarczyło, wchodzimy w wariant 1.

### Czego ten test NIE zmierzy

Strony ElevenLabs: ile równoczesnych rozmów uniesie jeden agent i czy webhook
inicjujący jest wołany równolegle, czy szeregowany. To pytanie poszło do nich —
`docs/zgloszenie-elevenlabs-7-rownoczesnosc.md`.
