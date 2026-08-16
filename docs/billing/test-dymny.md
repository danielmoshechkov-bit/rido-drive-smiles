# KROK 8 — test dymny gatingu, krok po kroku

Na **osobnym koncie testowym**, nie na głównym. Powód nie jest kosmetyczny:
scenariusz kasuje wiersze subskrypcji i wygasza okres próbny, a na koncie
z rolą `admin` część blokad w ogóle się nie pokaże.

Wszystkie zapytania zakładają, że najpierw ustalisz dwa identyfikatory:

```sql
SELECT sp.id AS provider_id, sp.user_id, sp.company_name, sp.status
FROM service_providers sp
JOIN auth.users u ON u.id = sp.user_id
WHERE u.email = 'test-gating@…';
```

Dalej `<PID>` = `provider_id`, `<UID>` = `user_id`.

---

## 1. Rejestracja z cennika, plan Standard

**Klikasz:** `/cennik` → karta **Standard** (linia „Warsztat") → „Wybierz plan"
→ formularz rejestracji → potwierdzasz adres.

**Spodziewasz się:** lądujesz w `/uslugi/panel`, a na Pulpicie jest baner
„Wybrałeś plan Standard — masz 30 dni pełnego dostępu za darmo" z przyciskiem
zakupu i informacją o cenie startowej.

**Weryfikacja:**
```sql
-- trial założony
SELECT status, expires_at, metadata FROM paid_service_subscriptions WHERE user_id = '<UID>';
-- wybór planu zapamiętany przy koncie, nie w adresie
SELECT raw_user_meta_data ->> 'plan'   AS plan,
       raw_user_meta_data ->> 'module' AS modul
FROM auth.users WHERE id = '<UID>';
-- warsztat powstał PRZED rolą (problem A)
SELECT (SELECT count(*) FROM service_providers WHERE user_id = '<UID>') AS warsztatow,
       (SELECT count(*) FROM user_roles WHERE user_id = '<UID>' AND role = 'service_provider') AS rol;
```
Oba mają dać `1`. `plan` = `warsztat_standard`, `modul` = `warsztat`.

**Czerwona flaga:** rola bez warsztatu (`1` i `0`) znaczy, że poprawka
kolejności nie weszła.

---

## 2. Zakup kartą testową

**Klikasz:** baner „Kup plan Standard" → nowa karta ze Stripe Checkout →
`4242 4242 4242 4242`, dowolna data w przyszłości, dowolny CVC i kod pocztowy.

**Spodziewasz się:** powrót na `/uslugi/panel?platnosc=ok`, po chwili toast
„Płatność potwierdzona — subskrypcja aktywna". Panel odpytuje bazę przez 30 s,
więc potwierdzenie może przyjść z opóźnieniem — to zamierzone.

**Weryfikacja:**
```sql
SELECT status, product_line, provider, provider_subscription_id,
       current_period_end, price_guarantee_until,
       price_snapshot ->> 'price_net' AS cena_zamrozona,
       price_snapshot ->> 'zrodlo'    AS zrodlo
FROM billing_subscriptions WHERE subscriber_id = '<PID>';

-- webhook przetworzył zdarzenia, żadne nie jest 'failed'
SELECT event_type, status, last_error, created_at
FROM billing_events ORDER BY created_at DESC LIMIT 10;
```
Oczekiwane: `status = active`, `zrodlo = checkout`, `price_guarantee_until`
mniej więcej za rok, wszystkie zdarzenia `processed` lub `ignored`.

---

## 3. Dostęp działa

**Klikasz:** zakładka **Warsztat & Auto** → kafelki bez nakładki → wejdź
w Zlecenia → „Nowe zlecenie" → zapisz.

**Spodziewasz się:** zlecenie się zapisuje. Konto → „Twój plan" pokazuje
nazwę, cenę z `price_snapshot`, datę odnowienia i datę gwarancji ceny,
plus działający przycisk „Zarządzaj płatnościami".

**Weryfikacja:**
```sql
SELECT public.moze_pracowac('<PID>', 'warsztat') AS moze;   -- true
SELECT count(*) FROM workshop_orders WHERE provider_id = '<PID>';
```

---

## 4. Wymuszenie blokady — trzy warianty osobno

Bramka rozróżnia **powód** blokady, bo klient po trialu i klient z odrzuconą
kartą potrzebują różnych komunikatów. Sprawdź wszystkie trzy.

### 4a. Okres próbny się skończył (najczęstszy przypadek u pierwszych klientów)

Musi **nie być** wiersza w `billing_subscriptions` — inaczej to on decyduje.
```sql
DELETE FROM billing_subscriptions WHERE subscriber_id = '<PID>';
UPDATE paid_service_subscriptions SET expires_at = now() - interval '1 day'
WHERE user_id = '<UID>';
SELECT public.moze_pracowac('<PID>', 'warsztat');   -- false
```
**Spodziewasz się:** „**Okres próbny dobiegł końca.** Wybierz plan, aby wrócić
do pracy" + przycisk zakupu + link „Porównaj wszystkie plany".

### 4b. Subskrypcja wygasła po zakupie

```sql
UPDATE billing_subscriptions SET status = 'expired' WHERE subscriber_id = '<PID>';
```
**Spodziewasz się:** „**Subskrypcja wygasła.** Odnów plan, aby wrócić do pracy".
Bez linku do cennika — ten klient wie, co kupował.

### 4c. Karta nie zadziałała

```sql
UPDATE billing_subscriptions SET status = 'read_only' WHERE subscriber_id = '<PID>';
```
**Spodziewasz się:** „**Nie udało się pobrać płatności.** Zaktualizuj kartę
albo opłać abonament".

**Czerwona flaga:** ten sam komunikat we wszystkich trzech przypadkach.

---

## 5. Co działa przy blokadzie

Zostaw stan z 4c i przejdź całą listę.

| Ekran | Oczekiwane |
|---|---|
| **Siatka kafelków** (Warsztat & Auto) | karta sprzedażowa **nad** kafelkami; kafelki nadal **klikalne** |
| **Terminarz** | działa w pełni, bez nakładki |
| **Rezerwacje** (w Zleceniach) | widoczne **nad** nakładką, używalne |
| **Zlecenia** — lista | pod nakładką |
| **Kasa, Klienci, Pojazdy, Magazyn, Przechowalnia, Cennik, Ustawienia** | pod nakładką |
| **Karta zlecenia i karta pojazdu** | pod nakładką |
| **Księgowość** (osobna zakładka panelu) | **działa** — nie jest bramkowana |
| **Kalendarz / Rezerwacje** (zakładki panelu, nie modułu) | działają |

**Eksport — najważniejsze:**
1. Kliknij „Przeglądaj i eksportuj swoje dane" pod kartą sprzedażową.
2. Nakładka znika, zostaje bursztynowy pasek z powodem i przyciskiem zakupu.
3. Wejdź w **Raporty** → „Drukuj / PDF" → **musi się wygenerować**.
4. Przechowalnia → „Pokwitowanie" → też.

**Obsługa rezerwacji przy blokadzie:**
- Potwierdź rezerwację → **udaje się**, komunikat „Rezerwacja potwierdzona."
- „Przenieś do zleceń" → komunikat po polsku „Rezerwacja obsłużona. Założenie
  zlecenia wymaga aktywnego planu." — **nie** surowy błąd bazy.

**Weryfikacja, że baza faktycznie broni:**
```sql
SELECT count(*) FROM workshop_orders WHERE provider_id = '<PID>';
```
Liczba przed i po próbach zapisu musi być identyczna.

⚠️ **Znany brak:** po odsłonięciu nakładki formularze są klikalne i zapis
„uda się" bez błędu, ale nic nie zapisze. Postgres przy `UPDATE`/`DELETE`
z polityką RESTRICTIVE **filtruje wiersze zamiast zgłaszać błąd**. Dane są
bezpieczne — mylący jest komunikat. Sprawdź to świadomie: edytuj zlecenie,
odśwież stronę, zmiany nie ma. Naprawa interfejsu jest osobnym zadaniem.

---

## 6. Powrót przez PŁATNOŚĆ, nie SQL

Zostaw stan `read_only`.

**Klikasz:** ekran blokady → „Opłać abonament" → Checkout → `4242 4242 4242 4242`.

**Spodziewasz się:** powrót do panelu, w ciągu ~30 s dostęp wraca sam
(panel odpytuje bazę), nakładka znika, kafelki działają.

> To jest krok, który **do dziś by nie przeszedł**. `billing-checkout` miał
> `read_only` na liście statusów blokujących i odpowiadał „masz już aktywną
> subskrypcję", prowadząc klienta w ślepy zaułek. Naprawione i wdrożone
> (`822b32cc`) — ten krok jest sprawdzeniem tej naprawy.

**Weryfikacja:**
```sql
SELECT status, created_at, price_snapshot ->> 'zrodlo' AS zrodlo
FROM billing_subscriptions WHERE subscriber_id = '<PID>'
ORDER BY created_at DESC;
```
Oczekiwane: **dwa wiersze** — stary `read_only` i nowy `active`. To poprawny
stan; wszędzie czytamy najnowszy. Indeks jednej aktywnej subskrypcji obejmuje
tylko `trialing`/`active`/`past_due`, więc konfliktu nie ma.

```sql
SELECT public.moze_pracowac('<PID>', 'warsztat');   -- true
```

---

## 7. Nieudana płatność → past_due → read_only

**Klikasz:** Konto → „Twój plan" → „Zarządzaj płatnościami" → portal Stripe →
podmień kartę na `4000 0000 0000 0341` (przechodzi przy dodaniu, odrzuca przy
obciążeniu). Następnie w panelu Stripe wymuś pobranie: Customers → subskrypcja
→ faktura → **Charge invoice**.

**Spodziewasz się:** `invoice.payment_failed` → status `past_due`.
**Dostęp DZIAŁA DALEJ** — karencja daje pełne uprawnienia, bo połowa
nieudanych pobrań naprawia się przy ponowieniu przez operatora.

**Weryfikacja:**
```sql
SELECT status, past_due_since FROM billing_subscriptions
WHERE subscriber_id = '<PID>' ORDER BY created_at DESC LIMIT 1;
SELECT public.moze_pracowac('<PID>', 'warsztat');   -- nadal true
```
`past_due_since` musi być **ustawione** — stawia je trigger, nie webhook.

**Zejście do `read_only` bez czekania na zadanie o 3:15:**
```sql
SELECT grace_period_days FROM billing_settings;    -- domyślnie 7

UPDATE billing_subscriptions
SET past_due_since = now() - interval '30 days'
WHERE subscriber_id = '<PID>' AND status = 'past_due';

SELECT public.billing_zejdz_do_read_only();        -- ma zwrócić 1
SELECT status FROM billing_subscriptions WHERE subscriber_id = '<PID>'
ORDER BY created_at DESC LIMIT 1;                  -- read_only
```
**Spodziewasz się:** po odświeżeniu panelu — nakładka z komunikatem
„Nie udało się pobrać płatności".

---

## Przywrócenie konta testowego do stanu wyjściowego

```sql
DELETE FROM billing_subscriptions WHERE subscriber_id = '<PID>';
UPDATE paid_service_subscriptions
SET status = 'trial', expires_at = now() + interval '30 days'
WHERE user_id = '<UID>';
```
Subskrypcje testowe **anuluj też po stronie Stripe**, żeby nie generowały
kolejnych faktur.

---

## Czego ten test NIE sprawdza

- **Zadania cyklicznego o 3:15** — sprawdzamy funkcję wołaną ręcznie, nie sam
  harmonogram. Że `pg_cron` odpali ją o czasie, potwierdzi dopiero
  `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;` nazajutrz.
- **Zadania gwarancji ceny (4.20)** — pierwszy termin zapada rok po pierwszym
  kliencie. Da się wywołać ręcznie żądaniem z nagłówkiem `x-cron-secret`.
- **Bramki G5 w funkcjach brzegowych** — tę sprawdzisz przy SMS-ach: wyślij
  SMS z zablokowanego warsztatu bez `order_id` (ma odmówić) i z `order_id`
  istniejącego zlecenia (ma przejść).
- **Widoczności publicznej** — patrz niżej.

## Widoczność publiczna — osobne sprawdzenie

W oknie incognito, przy warsztacie w stanie `read_only`:
```
/uslugi  → warsztat testowy NIE jest na liście
/uslugi/uslugodawca/<PID> → nie otwiera się
```
Po powrocie do `active` warsztat wraca **do stanu sprzed** blokady — kolumny
`status` nie ruszamy, więc `active` zostaje `active`, a `verified` zostaje
`verified`.

Sprawdź przy okazji, że **pozostali usługodawcy są widoczni** — lista
`/uslugi` nie może być pusta.
