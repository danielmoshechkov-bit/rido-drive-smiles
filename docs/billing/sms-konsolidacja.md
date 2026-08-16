# 4.4 — uzgodnienie magazynów SMS: plan przed wykonaniem

**Wniosek najważniejszy: nie ma czego migrować.** Poniżej dowody, a potem to,
co naprawdę trzeba zrobić.

---

## 1. Trzy magazyny — czym naprawdę są

| Magazyn | Zawartość | Werdykt |
|---|---|---|
| **A** `service_providers.sms_balance` | 36 / 145 / 147 — **realne, używane salda** | **zostaje** |
| **B** `user_credits.credits_balance` | 3 konta po 50 | **to NIE są SMS-y** |
| **C** `billing_addon_packs` | pusto | **przyszłość, nie teraz** |

### B nie jest magazynem SMS — dowód

Trzy razy po 50 to **bonusy powitalne**, nie kredyty SMS:

- `payment-core/index.ts` `handleWelcomeCreditsClaim` przyznaje dokładnie
  `WELCOME_CREDITS` = 50 przy pierwszym zalogowaniu.
- Migracja `20260805120000_balances_server_side.sql:41-45` przepisała wszystkie
  istniejące wiersze `user_credits` do `credit_welcome_claims` **z kwotą 50**,
  z komentarzem: *„3 wiersze w user_credits, wszystkie po 50, nic nie wydane"*.
- Żaden czytelnik SMS-ów nie sięga do B. Bramki wysyłki
  (`send-sms:88`, `workshop-send-sms:179`) i pasek w interfejsie
  (`TopBarCredits:34`) czytają wyłącznie A.

Jedyną ścieżką, która kiedykolwiek zapisywałaby SMS-y do B, był zakup pakietu
(`payment-core` → `upsertCredits(..., "sms", n)`). **Zakupów było zero** —
potwierdzone Twoim zapytaniem: `payments` z `product_type='sms_credits'` nie ma
ani jednego wiersza.

**Wniosek: przeniesienie 3×50 z B do A byłoby wymyśleniem 150 SMS-ów, których
nikt nikomu nie przyznał.** Nie robimy tego. Z B tniemy tylko martwą ścieżkę
zapisu SMS-ów.

### C jest właściwym domem, ale nie dziś

`billing_addon_packs` ma to, czego A nie ma: FIFO, daty ważności, powiązanie
z funkcją, zamkniętą RLS. Ale jest pusta, w `billing_features` **nie ma klucza
`sms`**, i nie czyta jej ani nie pisze do niej ani jedna linia kodu. Przejście na
C teraz oznacza przepisanie wszystkich miejsc odczytu w trakcie uruchamiania
płatności. Docelowo tak, przy 4.10/4.11 — nie przy gatingu.

---

## 2. Skąd wzięły się 36, 145 i 147

Migracje nadają SMS-y **dokładnie dwa razy**, po 100:

- `20260331085142:5` — `UPDATE … SET sms_balance = 100 WHERE id = '664ed87b-…'`
- `20260504203043:14,28` — „Serwis Hawryluk", `100` przy wstawieniu oraz
  `GREATEST(COALESCE(sms_balance,0), 100)` gdyby wiersz już istniał

To nie tłumaczy ani 145, ani 147, ani obecności Beaty Smosarskiej. Możliwe
źródła nadwyżki, w kolejności prawdopodobieństwa:

1. **Darmowe doładowanie z przeglądarki.** `QuotaGuardProvider.handleSmsPurchase`
   dopisywał `+count` wprost do `sms_balance`, **bez pobrania płatności**.
   Ścieżka była otwarta od `6b5c11a6` (19.03.2026) do zamknięcia modala
   w `5d75c071` (06.08.2026); twardo blokuje ją trigger `guard_sms_balance`
   od 05.08.2026. Przez ~4,5 miesiąca każdy właściciel warsztatu mógł dodać
   sobie dowolną liczbę SMS-ów jednym kliknięciem.
2. **Nadanie przez administratora** — `payment-core` `handleAdminGrant`
   z `credit_type: 'sms'`.
3. **Ręczny UPDATE** w SQL Editorze.

**Nie da się tego rozstrzygnąć z bazy, bo nadania SMS nie zostawiają śladu.**
Przy kredytach VIN każde nadanie dopisuje wiersz do
`vehicle_lookup_credit_transactions` (`payment-core:730`). Przy SMS-ach — nic,
poza `console.log`. To jest prawdziwy problem do naprawienia, nie same liczby.

### Zapytania diagnostyczne (tylko odczyt)

```sql
-- Ile wysłano, ile zostało, ile musiało zostać nadane łącznie.
SELECT sp.id, sp.company_name, sp.sms_balance AS saldo,
       (SELECT count(*) FROM workshop_sms_log l
         WHERE l.provider_id = sp.id AND l.status = 'sent')      AS wyslane,
       sp.sms_balance
       + (SELECT count(*) FROM workshop_sms_log l
           WHERE l.provider_id = sp.id AND l.status = 'sent')    AS nadane_lacznie,
       sp.updated_at AS ostatnia_zmiana_wiersza
FROM service_providers sp
WHERE COALESCE(sp.sms_balance,0) > 0
ORDER BY sp.company_name;

-- Kiedy zaczęli wysyłać i kiedy przestali — czy aktywność trwa.
SELECT provider_id, min(created_at) AS pierwszy, max(created_at) AS ostatni,
       count(*) FILTER (WHERE status='sent')      AS wyslane,
       count(*) FILTER (WHERE status<>'sent')     AS nieudane,
       sum(COALESCE(parts_count,1))               AS czesci_lacznie
FROM workshop_sms_log GROUP BY provider_id ORDER BY ostatni DESC;

-- Czy to na pewno te same warsztaty co w migracjach seedowych.
SELECT id, company_name, user_id, created_at
FROM service_providers
WHERE id = '664ed87b-a20f-457b-a9fa-97ca13dcae7c'
   OR company_name ILIKE '%hawryluk%'
   OR company_name ILIKE '%smosarska%'
   OR company_name ILIKE '%cart78%';
```

`nadane_lacznie` to **dolna granica**: ścieżka flotowa (`send-sms`) też zdejmuje
saldo, ale loguje do `driver_communications`, nie do `workshop_sms_log`.

---

## 3. Co proponuję zrobić

**Żadnej migracji sald.** Salda zostają tam, gdzie są, co do jednego SMS-a.
Zamiast tego cztery kroki, z których żaden nie zmienia ani jednej liczby.

### Krok 1 — księga (nowa tabela, zero zmian w saldach)

`sms_credit_ledger`: `provider_id`, `delta` (± liczba), `powod`
(`nadanie_admin` / `wyslanie` / `saldo_otwarcia` / `korekta`), `actor_user_id`,
`ref` (np. `workshop_sms_log.id`), `created_at`.

Od tego dnia każda zmiana salda ma autora, powód i czas. Pytanie „skąd 147"
przestaje być bez odpowiedzi.

### Krok 2 — saldo otwarcia (nadal zero zmian w saldach)

Po jednym wierszu na warsztat, `delta = obecne saldo`, powód `saldo_otwarcia`,
z adnotacją, że historii sprzed tej daty nie da się odtworzyć. Po tym kroku
`SUM(ledger) = sms_balance` **z definicji** — nie da się niczego zgubić, bo
niczego nie przenosimy.

### Krok 3 — zapisy przez księgę

`deduct_sms_credit` i nadanie administratora dopisują wiersz do księgi w tej
samej transakcji, w której zmieniają saldo. `sms_balance` **zostaje** jako
szybki odczyt — wszystkie miejsca czytające działają bez zmiany.

### Krok 4 — zamknięcie martwych ścieżek

- Usunąć `handleSmsPurchase` z `QuotaGuardProvider` (dziś martwy, ale wpięty —
  wystarczy, że ktoś odblokuje modal, żeby wrócił darmowy przydział).
- Wyciąć zapis SMS-ów do `user_credits` w `payment-core` — B przestaje udawać
  magazyn SMS.
- `useCredits` w `src/hooks/usePayment.ts` czyta kolumny `balance` i
  `credit_type`, **których w tabeli nie ma** — zawsze zwraca 0. Naprawić albo
  usunąć razem z ekranem, który z niego korzysta.

Dopiero po uruchomieniu sprzedaży pakietów (4.10/4.11) `billing_addon_packs`
przejmuje rolę źródła, a `sms_balance` zostaje sumą z paczek.

---

## 4. Dwie dziury znalezione przy okazji

**Przypomnienia o płatnościach floty wysyłają SMS-y za darmo.**
Parametr `fleet_id` w `send-sms` jest przeciążony: `booking-notify:77` przekazuje
w nim **`provider_id`** i wtedy odjęcie działa poprawnie (jest o tym komentarz
w kodzie). Ale `rental-payment-reminders:314,517` przekazuje **prawdziwy
`reminder.fleet_id`** z tabeli `fleets`, a `deduct_sms_credit` robi
`UPDATE service_providers WHERE id = p_provider_id`. Identyfikatory pochodzą
z różnych tabel, więc UPDATE trafia w **zero wierszy** — a UPDATE bez trafień
nie jest błędem, więc `rpcErr` jest puste i nie pada nawet ostrzeżenie w logu.

Bramka `NO_SMS` też tej ścieżki nie zatrzyma: sprawdza saldo tylko wtedy, gdy
w żądaniu jest nagłówek `Authorization` z **kontem użytkownika**
(`send-sms:84-96`). Zadanie cykliczne woła się kluczem serwisowym, więc
`getUser()` nie zwraca użytkownika i cała bramka jest pomijana.

Efekt: SMS-y z przypomnieniami o płatnościach są dla klienta darmowe
i nielimitowane, a u operatora płatne dla nas. Nie wiadomo ile — bo ta ścieżka
loguje do `driver_communications`, nie do `workshop_sms_log`.

**Konto z dwoma warsztatami też wysyła za darmo.** `send-sms:88` i `:190`
szukają warsztatu przez `.eq('user_id', …).maybeSingle()` bez `limit(1)`.
Przy dwóch warsztatach `maybeSingle` zwraca błąd, a oba miejsca są w blokach
`try` opisanych jako `non-fatal` — więc bramka salda i odjęcie zostają po cichu
pominięte. To ta sama klasa błędu, którą naprawiłem w dziesięciu miejscach
w `src/`; w funkcjach brzegowych jej nie ruszałem, bo prosiłeś o plan przed
wykonaniem.

**SMS wieloczęściowy kosztuje jeden kredyt.** `deduct_sms_credit` zdejmuje
zawsze `1`, niezależnie od `parts_count`. Wiadomość z polskimi znakami dłuższa
niż 70 znaków to u operatora dwie lub trzy wiadomości. Do rozstrzygnięcia:
liczyć części czy zostawić — ale świadomie, nie przez przeoczenie.
