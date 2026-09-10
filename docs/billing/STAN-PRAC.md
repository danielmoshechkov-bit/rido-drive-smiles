# Stan prac — płatności, kredyty, bezpieczeństwo zapisu

---

## 🔴 „SUCCESS" NIE ZNACZY, ŻE MIGRACJA WESZŁA (10.09.2026)

Migracja `20260909162228_numer_faktury_nie_wraca` **nigdy nie weszła w życie**,
mimo że jej uruchomienie zwróciło „Success, no rows returned". Padała na
ostatnim kroku:

```
ERROR: could not create unique index "idx_user_invoices_number_active"
SZCZEGÓŁY: Key (user_id, invoice_number)=(…, FV/2026/01/001) is duplicated.
```

Konto `iwa4155@wp.pl` ma DWIE AKTYWNE faktury o tym numerze. Migracja jest
w jednej transakcji, więc wycofywało się WSZYSTKO — razem z poprawioną funkcją
`prevent_duplicate_invoice_number`. Przez dobę stan wyglądał na wdrożony,
a numer skasowanej faktury dalej wracał.

**Wyszło to dopiero z kontroli w NASTĘPNEJ migracji** — tej, która sprawdza
skutek zapisem, a nie treść funkcji. Gdyby jej nie było, dowiedzielibyśmy się
przy kolejnym duplikacie u klienta.

Pierwsza diagnoza brzmiała „ktoś nadpisał funkcję" i **była błędna**.
Nikt niczego nie nadpisywał.

### Wniosek, który wchodzi do CLAUDE.md

Migracja, która zmienia funkcję ORAZ zakłada więz na danych, ma dwa różne
rodzaje kroków w jednej transakcji: pierwszy zawsze się uda, drugi zależy od
tego, co jest w tabelach. Przy niepowodzeniu drugiego **cofa się też pierwszy**,
a wynik wygląda jak sukces. **Rozdzielaj je: najpierw funkcje, potem dane,
na końcu więzy.**

### Kontrola, która to łapie

`scripts/sql-harness/sprawdz_dryf_funkcji.py` — porównuje CIAŁO każdej funkcji
w bazie z ostatnią definicją w migracjach. Znalazła przy okazji drugą
rozbieżność: `warsztat_tabele_wprost` miała 26 tabel zamiast 29, czyli
`workshop_tire_pricing`, `workshop_tire_reminder_log`
i `workshop_tire_storage_settings` były **poza bramką zapisu**.

Dwie pozostałe rozbieżności są znane i świadome: `voice_commit_call`
(agent głosowy, zakaz zmian) i `rental_listing_availability` — obie zmieniane
poza repozytorium.

### Kolejność wykonania — obowiązuje

1. `20260910124828_przywrocenie_nadpisanych_funkcji` — same funkcje
2. `20260910104210` — wycofanie numerów ze skasowanych faktur
3. decyzja o dwóch parach AKTYWNYCH duplikatów
4. `20260910111807` — dopiero wtedy indeksy

**`20260909162228` NIE URUCHAMIAJ PONOWNIE** — jej krok z indeksem padnie tak
samo. Zastępuje ją punkt 1.

---

## ⭐ DUPLIKATY NUMERÓW FAKTUR — stan i decyzja do podjęcia

Pełny indeks unikalny padł: kolizji jest **dziewięć**, nie jedna. Cała tabela
`user_invoices` to **69 faktur u 5 wystawców**, więc zakres jest zamknięty —
ukrytych duplikatów nie ma i nie może być więcej.

**Czy poprawka `20260909162228` objęła numerację warsztatów: TAK.** Wyzwalacz
`prevent_duplicate_invoice_number` stoi na tabeli, więc obowiązuje każdego
wystawcę. Numer liczą **dokładnie dwa miejsca** — `SimpleFreeInvoice`
(moduł faktur warsztatów, razem z numeracją korekt `KOR/`) i
`billing-invoice-issue` (faktury platformy). Oba poprawione. Pozostałe tabele
faktur (`invoices`, `rental_booking_invoices`, `service_commission_invoices`)
są PUSTE.

### Siedem kolizji: ślad po kasowaniu — bezpieczne

Wszystkie u `warsztat@test.pl` (CART78GARAGE — prawdziwa firma na loginie
testowym, 47 faktur, 28 w KSeF) plus nasze `GR/2026/007`. Wzór jest ten sam:
wersje robocze kasowane, wersja końcowa **wysłana do KSeF**. Skasowane wiersze
nie mają numeru KSeF, więc nie są zamrożone i wolno je przenumerować.

Migracja `20260910104210` nadaje im sufiks `-WYCOFANA-n` — numer spoza serii,
więc `extractSeq` go ignoruje i nie wpływa na liczenie kolejnych.

### Dwie kolizje: po DWIE AKTYWNE faktury — DECYZJA CZŁOWIEKA

| konto | numer | dokumenty |
|---|---|---|
| `daniel.moshechkov@gmail.com` | `FV/2026/02/001` | 12.02 11:53 — **0,00 zł**, nabywca „sdfsdf"; 12.02 12:05 — 3313,80 zł, nabywca „asdasdad" |
| `iwa4155@wp.pl` | `FV/2026/01/001` | 26.01 07:26 — 272,13 zł, nabywca „wqeqwe"; 26.01 07:27 — 1490,53 zł, nabywca „qweqwe" |

Żadna nie ma numeru KSeF. Nazwy nabywców to uderzenia w klawiaturę, a odstęp
w drugiej parze to **jedna minuta** — to wygląda na dwie próby tego samego
wpisu, nie na dwie sprzedaże.

`iwa4155@wp.pl`: konto z 12.12.2025, **ma dokładnie te dwie faktury i nic
poza nimi**, ostatnia aktywność 26.01.2026, brak warsztatu. Nie ruszamy bez
zgody właściciela konta.

Dopóki te dwie grupy istnieją, pełny indeks (`20260910111807`) odmawia
z wypisaną listą — celowo, zamiast padać na komunikacie o kluczu.

---

## ⭐ AKTUALIZACJA 10.09.2026 (wieczór) — CZYTAJ TO NAJPIERW

### ⚠️ KOLEJNOŚĆ WDROŻENIA — `payment-core` DOPIERO PO MIGRACJI

`payment-core` czeka niewdrożona. Woła `nadaj_paczke_admin`, której na
produkcji jeszcze nie ma — wdrożenie przed migracją `20260910102714`
zamieniłoby ciche nieprzyznawanie kredytów na twardy błąd.

Kolejność: migracja `20260910102714` → wdrożenie `payment-core`.

### 🔴 Kredyty z panelu admina szły do tabel, których nikt nie czyta — ZAMKNIĘTE

Nie było to odcięcie ról migracją `20260822185000`: panel woła funkcję brzegową
z kluczem serwisowym, a rola admina z `drivers.user_role` przechodzi. Zapis
kończył się powodzeniem — tylko trafiał do `vehicle_lookup_credits` (stara)
i `user_credits.credits_balance` (martwa, JEDNO nietypowane saldo), a liczniki
czytają `check_usage` i `billing_addon_packs`.

Ślad: 09.09 → 20 + 20, 10.09 → 50 + 50. Na koncie `bf7c8a4b…` nic z tego nie
było widać. Naprawione: `nadaj_paczke_admin` + poprawiony `payment-core` + panel,
który przestał meldować sukces nad nieudanym zapisem.

`nadaj_numer_przechowania` z `authenticated = true` to NIE przeoczenie —
to funkcja WYZWALACZA, ustawia numer pokwitowania i nie rusza sald.

### 🔴 `ksef-integration` — ZAMKNIĘTE I WDROŻONE

Bramka `_shared/ksefDostep.ts`: kanał wewnętrzny (klucz serwisowy) → admin →
właściciel. Sprawdzone zachowaniem na produkcji: bez tokenu i z kluczem
anonimowym odpowiedź to `401`, także przy podanym `invoice_id`.

### Stan pozostałych pozycji z sekcji 4 — sprawdzony zapytaniem 10.09

| pozycja | stan |
|---|---|
| 4.1 odczyt umów najmu | ZAMKNIĘTE (0 polityk) |
| 4.2 `viewing_slots` | OTWARTE (2 polityki `USING(true)`) |
| 4.3 `anonymous_service_prices` | OTWARTE (1 polityka) |
| 4.4 tokeny w `cron.job` | OTWARTE — **7 zadań** ma token JWT w treści |
| 4.5 `user_credits` jako piąte źródło | OTWARTE — czyta je `useUserCredits`, `creditGate` i `payment-core` |
| 4.9a wnioski o przeniesienie własności | OTWARTE (1 polityka) |

### Pamięć podręczna rejestru — ile jest warta

Ze 172 sprawdzeń po tablicy **127 dotyczyło różnych numerów, 45 to powtórki**
(26%). Z tych powtórek **38 mieści się w 30 dniach**, a 25 w dobie.

Czyli pamięć podręczna z terminem ważności 30 dni oszczędziłaby ~22% wywołań
płatnego API, dobowa ~15%. Kwoty nie podaję — nie znam stawki RegCheck za
sprawdzenie; przy niej te procenty przeliczą się wprost.

Termin ważności jest tu warunkiem, nie ozdobą: dane rejestrowe się zmieniają,
a `vehicle_registry_cache` ma dziś **jeden wiersz z 19 marca** — czyli zapisu
praktycznie nie ma i trzeba by go najpierw naprawić.

---

## ⭐ AKTUALIZACJA 10.09.2026 — CZYTAJ TO NAJPIERW

### 🔴 Sprawdzenie po tablicy pokazywało cudze auto — ZAMKNIĘTE

Dwie różne przyczyny pod jednym objawem:

**`WW140TV` — nasza wina, rejestr nie był pytany.** To tablica AUTA POKAZOWEGO
z `src/lib/autoDemo.ts` (Toyota Auris HSD, VIN `SB1KZ3JE60E123456`), a skrót
w `WorkshopAddVehicleDialog` działał ZAWSZE, nie tylko we wprowadzeniu.
`WW140TV` jest przy tym PRAWDZIWĄ tablicą — należy do Opla Astry IV, VIN
`W0VPD5ED4JG110852`. Rejestr pytany o nią odpowiada poprawnie i tak stoi
w `vehicle_integration_logs` z 17.08; wpisów dla Toyoty nie ma tam w ogóle.
Zasięg: 21 wierszy w `workshop_vehicles` u trzech warsztatów.
Naprawa: skrót działa wyłącznie w `trybProbny`.

⚠️ **Zostaje do rozstrzygnięcia:** auto pokazowe nadal używa cudzej, prawdziwej
tablicy. Domknięciem jest przycisk „Wczytaj auto pokazowe" zamiast rozpoznawania
po wpisanym numerze — wtedy żadna prawdziwa tablica nie może się z tym zderzyć.

**`WK93400` — rejestr oddaje złe dane, my uznawaliśmy je za fakt.** Odpowiedź
z 10.09: `CarMake BMW`, `CarModel "M 3 2.3 Kat. E30"`, VIN **pusty**,
`ManufacturingYear "0"`. Klient ma BMW GT5. Warunek `hasUsefulVehicleData`
brzmiał „którekolwiek pole niepuste", więc marka i model bez VIN-u przechodziły
jako identyfikacja i schodził kredyt — dwa razy tego samego dnia.
Reguła w `_shared/vehicleIdentyfikacja.ts`, test w CI na prawdziwych
odpowiedziach. Zasięg: ze 172 sprawdzeń po tablicy VIN-u zabrakło w CZTERECH.

**Czego NIE było, mimo podejrzeń:** dopasowania luźnego. `findInPortalDb` używa
`ilike`, ale jest martwym kodem — nikt jej nie woła.

**Osobno:** `vehicle_registry_cache` ma jeden wiersz z 19 marca. Pamięć podręczna
praktycznie nie działa; nic z tego nie wynika dla poprawności, ale każde
sprawdzenie idzie do płatnego API.

### ✅ Trial WYGASA — poprzedni wpis (3.1) był NIEAKTUALNY

Sprawdzone zachowaniem: `moze_pracowac` pobrana z produkcji i uruchomiona na
kopii odmawia trialowi z minioną datą (`moze_pracowac = f`), przepuszcza
trwający. `useSubscriptionAccess` mówi to samo — obie strony zamknęła migracja
`20260821091000`. Na produkcji 11 trialów, **każdy z datą końca, żaden wygasły**.

Zdanie z sekcji 3.1 („`moze_pracowac` i `useSubscriptionAccess` ignorują
`current_period_end`") jest z 19.08 i nie obowiązuje. Powtórzyłem je 09.09 na
liście blokerów bez sprawdzenia — błędnie.

### Hawryluk — odnośnik płatności zwolniony, faktura do wystawienia

Migracja `20260910095342`. Polecenie: `docs/billing/hawryluk-wystaw-fakture.md`.
Numer 007 zostaje przy CART78GARAGE (decyzja z 10.09), Hawryluk dostaje kolejny.

### 🔴 `ksef-integration` — BRAK JAKIEJKOLWIEK AUTORYZACJI

`verify_jwt = false` i zero kontroli w kodzie. `getUserFromJwt` zwraca `null`
przy braku tokenu i **funkcja idzie dalej**: gdy w ciele jest `invoice_id`,
tożsamość ustala się z `user_invoices.user_id` TEJ FAKTURY, po czym używa
tokenu KSeF jej właściciela.

Da się z zewnątrz, znając identyfikator faktury albo encji:
- **wysłać cudzą fakturę do KSeF** cudzym tokenem — nieodwracalnie,
- odczytać jej pełny XML FA(3): nabywca, NIP, adres, kwoty,
- odczytać i **nadpisać** `ksef_settings` wskazanej encji,
- pobrać UPO i status.

Ograniczenie: potrzebny jest identyfikator (UUID), więc nie da się tego
przeglądać masowo. To zawęża zasięg, ale nie zamyka sprawy — identyfikatory
wyciekają adresami, mailami i logami, a `send` jest nieodwracalny.

**Rekomendacja: zamknąć przed uruchomieniem KSeF na produkcji.** Dopóki
środowisko stoi na `integration`, szkoda jest odwracalna.

---

## ⭐ AKTUALIZACJA 09.09.2026

### Wdrożone 09.09 (SHA porównane z `main`, nie numery wersji)

`billing-invoice-issue`, `billing-faktura-mail-ponow`, `rido-help` — wszystkie
trzy zgodne bajt w bajt, bez starych kopii `_shared`.

### 🔴 AUTO-SERWIS HAWRYLUK ZAPŁACIŁ I NIE MA FAKTURY

Zamówienie `MF4W6851B6…` z 09.09 09:51, 84,87 zł, status `oplacone`. Faktura
GR/2026/007 wystawiona o 09:51 została **skasowana o 12:18** i nigdy nie
wystawiono nowej. Konto ma dziś **zero aktywnych faktur**.

Samo ponowienie płatności tego nie naprawi: `billing-invoice-issue` sprawdza
`external_payment_ref` i znajduje SKASOWANY wiersz, po czym odpowiada
`duplicate: true` — czyli melduje sukces nad nieistniejącym dokumentem.
Indeks `user_invoices_external_payment_ref` jest przy tym unikalny **bez
względu na `deleted_at`**, więc drugi wiersz z tym samym odnośnikiem i tak by
nie wszedł.

Do rozstrzygnięcia: czy faktura ma zostać wystawiona ponownie (wtedy trzeba
zwolnić odnośnik płatności skasowanego wiersza), i czy Hawryluk dostał maila
z numerem 007 — bo ten numer należy dziś do CART78GARAGE.

### Numer faktury nie wraca (09.09)

Skasowanie faktury zwalniało jej numer — stąd dwa GR/2026/007. Poprawione
w siedmiu miejscach naraz plus wyzwalacz i **unikalny** indeks (dotąd nie był
unikalny). Istniejąca kolizja **zostaje** i czeka na decyzję księgową; migracja
`20260909162228` wypisuje ją ostrzeżeniem przy każdym przebiegu.

### KSeF: instrukcja przełączenia

`docs/billing/ksef-przelaczenie-na-produkcje.md`. Konto platformowe stoi na
`integration` z tokenem testowym; token produkcyjny jeszcze nie wpisany.
NIP tokenu i NIP sprzedawcy są zgodne (`5223377431`).


Dokument niżej jest z 24.08 i **w kilku miejscach nieaktualny**. Co się zmieniło:

### Zamknięte od tamtego czasu

- **4.1 „Odczyt umów najmu otwarty dla każdego" — ZAMKNIĘTE.** Sprawdzone
  zapytaniem na produkcji: polityk `Public can read rentals with token`
  i `Public can sign contract via portal token` **nie ma**. Migracje
  `20260820140000` i `20260820180000` są wykonane, `rental-portal-get` wdrożona.
- **Wszystkie migracje z repozytorium są na produkcji.** Sprawdzone przez
  porównanie obiektów (funkcje, tabele, kolumny, polityki, wyzwalacze) ze
  wszystkimi migracjami po `20260820` — zero braków. Rejestr
  `supabase_migrations.schema_migrations` nadal kłamie (ostatni wpis 03.08),
  więc **nie da się tego odczytać z rejestru** — trzeba porównywać obiekty.

### Rozjazd produkcja ↔ main (zmierzony 09.09, SHA-256 kodu, nie numery wersji)

Ze 193 funkcji brzegowych **181 zgodnych**, 12 rozjechanych — w OBIE strony:

| kierunek | funkcje | co z tego wynika |
|---|---|---|
| **produkcja MA, main NIE** | `billing-stripe-webhook`, `send-invoice-email` | wdrożone z `feat/tryb-dokonczenia`; Lovable przebuduje je z `main` i **skasuje** |
| **main MA, produkcja NIE** | 10 funkcji `voice-*` | 26 commitów pracy nad agentem głosowym (wielojęzyczność EN/RU/UK, snapshot, ścieżka odwołania wizyty) **zbudowane i niewdrożone** |

Front na produkcji **jest zgodny** z `main` (`wersja.json` → `d10a57e3`, wdrożenie
28.08). Niezgodne są wyłącznie funkcje brzegowe.

### 🔴 Codzienna kontrola „Zgodność produkcji z main" DAJE FAŁSZYWE ALARMY

`.github/workflows/zgodnosc-produkcji.yml` zgłasza **wszystkie 190 funkcji**
jako rozjechane — zgłoszenie #67 jest tego pełne. Sprawdzone: `billing-checkout`
pobrany z produkcji jest **bajt w bajt** zgodny z `main` (SHA `fca3c8fa…`),
a kontrola i tak go zgłasza.

Przyczyna: przebieg pobiera CLI z `releases/latest` (dziś v2.117), a lokalne
v2.101 daje zgodny wynik. **Kontrola, która zapala się na wszystkim, nie zapala
się na niczym** — nikt nie odróżni w niej prawdziwego rozjazdu. Do naprawy:
przypiąć wersję CLI w przebiegu.

### 🔴 CI `Testy i kontrola typów` na main było CZERWONE od 23.08

Dwa przebiegi (`32662233541`, `33160898402`) czerwone przez dwanaście dni, nikt
ich nie otworzył. Przyczyna: dwa błędy typów w `WorkshopTireStorage.tsx:374`.
Naprawione 09.09. **Bramka działała — zabrakło patrzenia na jej wynik.**

### Naprawione 09.09

- **Odmowa płatności mówiła „Edge Function returned a non-2xx status code".**
  Dotyczyło **25 z 30 warsztatów** (brak danych do faktury). Dwie przyczyny:
  martwe mapy komunikatów (`functions.invoke` przy 4xx daje `data === null`,
  a zdanie serwera chowa w `error.context`) oraz dwa przyciski omijające krok
  „Dane do faktury" (`TrialPlanBanner`, karty planów na `/warsztat-info`).
  Jedno źródło odczytu odmowy: `src/lib/odmowaZakupu.ts` nad istniejącym
  `odczytajBladFunkcji`. Bramka: `npm run test:front`.
- **Pakiet startowy: 10 VIN (było 5), 100 Rido AI (było 50).** Migracja
  `20260909125826` — **do wykonania**. Zeruje przy okazji pulę Rido AI planów
  próbnych, bo były DWA źródła startowe i odpalały niespójnie (3 konta z 17
  miały 100, reszta 50).

### Czego NIE MA nigdzie — ani na produkcji, ani w gałęziach

**Numer techniczny z puli dla agenta głosowego** (z instrukcją przekierowania).
Sprawdzone we wszystkich gałęziach — ta funkcja nie została zbudowana. Stoi
w tym dokumencie jako pozycja **4.9**, pod obowiązującym zakazem zmian
w agencie głosowym. To backlog, nie zaginione wdrożenie.

---


**Data spisania:** 19.08.2026, zaktualizowane 21.08.2026
**Gałąź robocza:** `wdrozenie` (worktree `/Users/moshechkov/rido-pay-lock`)
**Stan względem `origin/main`:** wszystko scalone poza jednym commitem (`c11710ba`,
poprawka kontroli w migracji podpisu najmu).

Dokument jest punktem powrotu między sesjami. Cztery grupy: co działa na produkcji,
co czeka na wdrożenie, co zostało w połowie, co świadomie odłożone.

> **Zasada nadrzędna, która obowiązuje w całej tej pracy:** wszystko, co dotyka
> pieniędzy, jest fail-closed — brak konfiguracji znaczy odmowa, nie domyślne
> przepuszczenie. Każdy webhook idempotentny. Żadnego „TODO" w miejscu weryfikacji.

---

## 1. WYKONANE I WDROŻONE

### 1.1 Migracje uruchomione na produkcji

| Migracja | Czego dotyczy |
|---|---|
| `20260818090000_vin_pula_warsztatu` | Sprawdzenia VIN rozliczane z puli warsztatu, nie z osobistych kredytów. Trzeci poziom (własne kredyty pracownika) za jawną zgodą — decyzja podejmowana w interfejsie, nie w `billing_consume`. |
| `20260819…` (limity VIN w planach) | VIN nie wchodzi w abonament: limit miesięczny 0 we **wszystkich** planach. Pakiet startowy 50 SMS + 5 sprawdzeń VIN (30 → 50 decyzją z 23.08, migracja `20260823130000`). |
| `20260819100000_audyt_sms_balance_i_email` | Zamknięcie darmowych SMS-ów przez `sms_balance` (kolumna zapisywalna z przeglądarki, a czytana jako pierwsze źródło bramki). Normalizacja e-maila przy rejestracji. Kontrola kwoty w webhooku. |
| `20260819140000_zwroty` | Obsługa zwrotów i obciążeń zwrotnych — odebranie jednostek przy chargebacku. |
| `20260819170000_referral_uses_lockdown` | Zamknięcie najkrótszej drogi do wydawalnych pieniędzy: `referral_uses` pozwalał wpisać sobie 150 + 150 zł do `pln_balance`. |
| `20260819200000_program_polecen_wylaczony` | Program poleceń wyłączony **flagą**, nie usunięciem kodu — da się go włączyć z powrotem bez deployu. |
| `20260819230000_polityki_admin_public` | Zamknięcie dwudziestu polityk `FOR ALL USING(true)` na tabelach administracyjnych. |
| `20260820100000_tlumaczenia_i_ewidencja` | Cztery tabele tłumaczeń przestały być zapisywalne z przeglądarki (można było podmienić teksty w całym portalu). Ewidencja sprawdzeń VIN. |
| `20260821090000_paczki_niezaleznie_od_planu` | 🔴 Kupione paczki były **niewidoczne** dla warsztatu bez subskrypcji — `check_usage` wychodziła wcześniej i zerowała licznik. Kolejność została (pula planu → paczki → nadwyżka), ale brak pierwszego elementu już nie zeruje reszty. |
| `20260822090000_sms_fail_closed` | 🔴 SMS-y wychodziły **za darmo** przy odmowie zużycia: `deduct_sms_credit` robiła `RAISE WARNING`, a ostrzeżenie w PostgreSQL nie wraca do wywołującego jako błąd. Teraz odmowa to wyjątek. Wiersz księgi powstaje wyłącznie po potwierdzonym pobraniu. Dołożona `zwroc_sms_credit`. |
| `20260823090000_ksiega_rejestr_decyzji` | Księga SMS jako pełny rejestr: zakup też zapisuje wiersz, powody `zwrot`/`wygasniecie`/`wyrownanie`, jednorazowe wyrównanie wstecz z tabelą wycofania, kontrola `sms_saldo_kontrola`. |

**Kontrola po księdze (Twój wynik):** CART78GARAGE — księga 123, paczki 123;
CART sp. z o.o. — księga 197, paczki 197; `sms_saldo_kontrola` pusta. Zgodne co do sztuki.

### 1.2 Funkcje brzegowe wdrożone (SHA porównane z repozytorium)

| Funkcja | SHA-256 (skrót) | Czego dotyczy |
|---|---|---|
| `send-sms` | `6dc7887e…` | Pobranie jednostki **przed** wysyłką; odmowa → 402; zwrot przy odmowie operatora. |
| `workshop-send-sms` | `cc5c19bf…` | To samo dla wysyłek z warsztatu. |
| `rental-sign` | wdrożona (v1) | Podpis umowy najmu: porównanie **pełnego** tokenu, nieważny token blokuje podpis, IP i przeglądarka ustalane po stronie serwera, `.is('driver_signature_url', null)` w aktualizacji (podpis nie do nadpisania). |
| `billing-payu-webhook` | wdrożona | Idempotentna obsługa powiadomień PayU. |
| `vehicle-check` | wdrożona | Sprawdzenia VIN po nowym rozliczeniu trzypoziomowym. |
| `activate-workshop-trial`, `billing-checkout` | wdrożone | — |

### 1.3 Front

Ostatni wdrożony przebieg: **32132551107**, bundle `index-DJWsdd7v.js` zgodny z lokalnym.

Zawiera m.in.:
- **jedno źródło liczników** — `src/lib/dostepneJednostki.ts` + `src/hooks/useDostepneJednostki.ts`,
  jeden klucz pamięci podręcznej na jednostkę. Koniec trzech różnych sald tego samego konta
  (pasek pokazywał 28, modal 29) i koniec „kredyty pojawiają się dopiero po wylogowaniu";
- naprawa `useUserWallet` (zakładka Portfel w ogóle się nie renderowała — `ReferenceError`);
- ilości ułamkowe w karcie zlecenia (`1,5` i `1.5` traktowane tak samo);
- zgoda przy kosztorysie podpisywana **raz**, nie dwa razy;
- adres nabywcy na fakturze brany z kartoteki zamiast pustych pól;
- usunięta faktura nie blokuje już wystawienia nowej do tego samego zlecenia
  (blokowała, i zawyżała raport sprzedaży);
- daty w potwierdzeniu wykonania usługi ze zlecenia, nie „dzisiaj".

### 1.4 Poza produkcją, ale działające

- **`npm run typecheck` naprawdę sprawdza kod.** Był ślepy: korzeniowy `tsconfig.json`
  ma `"files": []` i `references`, więc `tsc --noEmit` sprawdzał **zero plików**.
  Udowodnione celowo wstawionym nieistniejącym identyfikatorem — zero trafień.
  Teraz sprawdza oba projekty i jest **twardą bramką w CI** (`.github/workflows/tests.yml`).
  Repozytorium na zerze błędów typów.
- **`scripts/sql-harness/sprawdz_kolumny.py`** — buduje schemat ze wszystkich migracji
  i wykrywa odwołania do nieistniejących kolumn. Powstał, bo trzy razy w jednej sesji
  założyłem nazwę kolumny zamiast ją odczytać.
- **`scripts/sql-harness/audyt_rls_pieniadze.sql`** — audyt prób zapisu przez RLS,
  z opisaną pułapką `SET LOCAL ROLE` poza transakcją i **wymaganą kontrolą pozytywną**.

---

## 2. GOTOWE, ALE NIEWDROŻONE

> **Stan na 21.08.2026:** wszystko z tej grupy poza migracją kont demonstracyjnych
> jest już na produkcji. `20260820140000` i `20260820180000` wykonane, `rental-portal-get`
> wdrożona 19.08, front scalony do `main` (PR #57) i wdrożony. Dziesięć funkcji
> brzegowych porównanych z `main` po przebudowie przez Lovable — wszystkie zgodne
> bajt w bajt. Pozycje niżej zostają jako zapis, co i dlaczego wchodziło w tej
> kolejności.

### 2.1 Migracja `20260820140000_podpis_najmu_i_widocznosc` — **następny krok**

**Co robi:** zdejmuje politykę `Public can sign contract via portal token`
(pozwalała każdemu z kluczem anonimowym oznaczyć **dowolną** umowę jako podpisaną,
własnym obrazkiem podpisu), zamyka zapis do dziennika podpisu, zawęża
`settlement_visibility_settings` do administratora.

**Stan:** poprawiona, niescalona (commit `c11710ba`).

**Dlaczego pierwsze uruchomienie padło:** nie z powodu polityki, tylko z powodu
**mojej własnej kontroli końcowej**. Pytała „czy istnieje polityka UPDATE dla `anon`" —
czyli pytała o **rolę**. W tej bazie prawie żadna polityka nie ma klauzuli `TO`, więc
wszystkie mają role `{public}`, łącznie z całkowicie bezpiecznymi (`Drivers can update
own rentals`, `Fleet can manage their rentals`, oba warunkowane po `auth.uid()`).
Kontrola wywalała się na nich i cofała całą transakcję — razem ze zdjęciem dziurawej
polityki. Dlatego po nieudanym przebiegu polityka nadal była widoczna: to skutek
wycofania, nie tego, że `DROP` szukał złej nazwy.

**Poprawka:** kontrola pyta teraz, czy warunek zapisu w ogóle odwołuje się do tożsamości
wołającego (`auth.uid()` albo `has_role`). Komunikat odmowy wypisuje nazwę polityki
i jej warunek. Sprawdzone na lokalnym PostgreSQL 16 z odwzorowaniem produkcyjnego
zestawu polityk: **trzy kolejne przebiegi zielone**, idempotentne, zdjęta dokładnie
jedna polityka, cztery bezpieczne nietknięte.

**Ograniczenie tej kontroli, świadome:** sprawdza, czy warunek o tożsamość **pyta**,
a nie czy pyta **dobrze**.

**Blokada:** brak — `rental-sign` jest wdrożona. Migracja wypisze zamierzone
`WARNING` o wciąż otwartym **odczycie** umów.

### 2.2 `rental-portal-get` + migracja `20260820180000_odczyt_umow_zamkniety`

**Co robi:** przenosi odczyt umowy najmu z przeglądarki do funkcji brzegowej, w dwóch
zakresach — `portal` (bez numeru PESEL) i `umowa` (pełny). Identyczna odmowa dla
„nie ma takiego zlecenia" i „zły token", żeby nie dało się zgadywać istnienia umów.

**Blokada:** funkcja **nie jest wdrożona** (potwierdzone: nie ma jej na liście funkcji
projektu). Migracja **musi** iść dopiero po deployu — inaczej zgaśnie ekran podpisu
wszystkim klientom.

**Kolejność:** deploy `rental-portal-get` + front → dopiero potem migracja.

**Zależy od tego:** zamknięcie ostatniej otwartej rzeczy z audytu najmu —
polityka `Public can read rentals with token` pozwala dziś **każdemu** odczytać
**każdą** umowę mającą token: dane najemcy z numerem PESEL, kwoty, pojazd.

### 2.3 `sms_wygas_paczki()`

Funkcja wygaszania paczek zbudowana i wdrożona w bazie, ale **bez `cron.schedule`** —
celowo, bo decyzja brzmiała: paczki zostają bezterminowe. Zadanie czeka gotowe na wypadek
zmiany zdania. Wszystkie 18 paczek jest dziś bezterminowych.

---

## 3. ZACZĘTE I NIEDOKOŃCZONE

### 3.1 Wariant A dla subskrypcji

**Decyzja podjęta**, budowa niezaczęta. Rzecz w tym, że **21 z 22 warsztatów nie ma
wiersza w `billing_subscriptions`** — trial zapisuje się gdzie indziej.

Do zrobienia, w tej kolejności:
1. `activate-workshop-trial` pisze wyłącznie do `billing_subscriptions`;
2. migracja uzupełniająca dla 21 warsztatów — ze stanem przed, kontrolą w transakcji
   i tabelą wycofania (wzór: `ksiega_wyrownanie_4_20`);
3. **wygasanie trialu** — dziś `moze_pracowac` i `useSubscriptionAccess` **ignorują**
   `current_period_end` dla statusu `trialing`, czyli trial nigdy się nie kończy;
4. `paid_service_subscriptions` staje się archiwum tylko do odczytu.

**Warunek postawiony wprost:** przed wdrożeniem pokazuję wynik sprawdzenia, czy bramkowanie
i `useSubscriptionAccess` nie zaczną liczyć trialu podwójnie.

**Czy da się zostawić na dłużej:** tak, ale **nie po starcie sprzedaży** — trial,
który nigdy nie wygasa, to darmowy dostęp bezterminowo.

### 3.2 Limity AI i zleceń

Zaplanowane, niezaczęte. Ten sam mechanizm co przy SMS-ach: `check_usage` przed,
`billing_consume` po, fail-closed, licznik w interfejsie, natychmiastowe zejście.

Kolejność: `ai_repair_help` i `ai_labor_pricing` → potem `workshop_orders`.
**`voice_minutes` zostaje nietknięte — zakaz obowiązuje.**

Komunikat odmowy ma prowadzić do rozwiązania, np.: *„Wykorzystałeś limit pytań AI
w tym miesiącu. Przejdź na plan Pro (300 pytań) albo dokup pakiet"* — z przyciskiem.

**Czy da się zostawić:** do startu sprzedaży tak. Po starcie to niepoliczony koszt
modeli AI na każdym koncie.

### 3.3 Wiarygodność podpisu umowy najmu

Kolejność ustalona przez Ciebie, punkt 1 gotowy:
1. ~~`rental-portal-get`~~ — kod gotowy, czeka na deploy (patrz 2.2);
2. **PDF ze skrótem SHA-256** w chwili podpisu — niezaczęte;
3. **kod SMS** jako potwierdzenie tożsamości — niezaczęte;
4. znacznik czasu trzeciej strony — dopiero gdy zobaczysz skalę.

**Czy da się zostawić:** punkty 2–4 tak. Dziś podpis jest technicznie poprawny
(pełny token, serwerowe IP i przeglądarka, brak nadpisania), ale w sporze sądowym
brakuje niezmienialnej postaci dokumentu.

### 3.4 Scenariusz testu dymnego na sandboxie

`docs/billing/test-dymny-sandbox.md` spisany, **nieprzeklikany**.
PayU sandbox `pos_id 300746`, produkcja `4436976`.
BLIK: `200201` sukces, `3932` brak środków, `3931` limit.

---

## 4. ZNANE, NIENAPRAWIONE

### 4.1 Odczyt umów najmu otwarty dla każdego — 🔴 PILNE

Polityka `Public can read rentals with token` sprawdza, czy umowa **ma** token,
a nie czy wołający go **zna**. Każdy z kluczem anonimowym (a klucz jest w bundlu)
odczyta wszystkie umowy: imię, nazwisko, **PESEL**, adres, kwoty, pojazd.

**Grozi:** wyciekiem danych osobowych najemców na skalę całej bazy.
**Pilność:** najwyższa z otwartych. Naprawa gotowa (2.2), brakuje deployu.

### 4.2 `viewing_slots` — polityka „by token", która tokenu nie sprawdza

```
CREATE POLICY "Anyone can view slots by token"   ON viewing_slots FOR SELECT USING (true);
CREATE POLICY "Anyone can update slots by token" ON viewing_slots FOR UPDATE USING (true);
```
Nazwa mówi o tokenie, warunek to `true`. Ta sama klasa błędu co przy najmie.

**Grozi:** odczytem i **zmianą** cudzych terminów oglądania nieruchomości.
**Pilność:** wysoka, ale niższa niż 4.1 — mniej wrażliwe dane, mniejszy moduł.

### 4.3 `anonymous_service_prices` — brak ograniczeń zapisu

```
CREATE POLICY "Anyone authenticated can insert anon prices" … WITH CHECK (true);
```
Każde zalogowane konto może dosypać dowolne wyceny do wspólnej bazy portalu,
z której liczy się podpowiedzi cen (`src/lib/pricingSuggestions.ts`).

**Grozi:** zatruciem podpowiedzi cenowych dla wszystkich warsztatów — bez włamania,
samym założeniem darmowego konta.
**Pilność:** średnia teraz, rosnąca z liczbą klientów. Decyzja: **po starcie**.

### 4.4 Siedem zadań `pg_cron` z tokenem jawnie w `cron.job.command`

Potwierdzone w migracjach: `20260419084520`, `20260426094344`, `20260426084309` (dwa),
`20260626_WYN6_dispatcher_cron`, `20260802_tire_reminders_dispatch`.
Wzorzec dobry jest tylko w jednym miejscu — `20260813_voice_recording_retention`
czyta token z `vault.decrypted_secrets`.

**Grozi:** token widoczny dla każdego, kto odczyta `cron.job`, i **zapisany w publicznym
repozytorium** razem z treścią migracji. Rotacja tokenu wywraca wszystkie zadania naraz.
**Pilność:** średnia–wysoka; wpisuje się w szerszy problem sekretów w repo
(patrz plan `sec/…` i notatki o rotacji).

### 4.5 `BuyCredits` czyta `user_credits` — piąte źródło salda

`src/hooks/useUserCredits.ts:37` i `src/hooks/usePayment.ts:84` czytają starą tabelę
`user_credits`, poza mechanizmem `dostepneJednostkiCechy`.

**Grozi:** powrotem dokładnie tej usterki, którą właśnie zamknęliśmy — dwa liczniki
pokazujące różne liczby dla tego samego konta.
**Pilność:** średnia. Dotyczy dziś zdjęć w giełdzie (`VehiclePhotoUpload`), nie SMS-ów.

### 4.6 `payment-core`: `sms_credits` opłacalne w 80% z portfela

Ścieżka pozwala pokryć zakup kredytów SMS w większości środkami z portfela,
z pominięciem nowej ewidencji.
**Grozi:** rozjazdem księgi z rzeczywistością (dokładnie to, co właśnie wyrównywaliśmy).
**Pilność:** średnia — do domknięcia razem z 4.5.

### 4.7 Jeden ekran ustawień usługodawcy zamiast trzech edytorów tych samych danych

Te same dane firmy edytuje się dziś w trzech miejscach.
**Grozi:** rozjazdem danych na dokumentach (faktura pokaże co innego niż karta klienta)
i pytaniami do wsparcia „gdzie to się zmienia".
**Pilność:** niska technicznie, **wysoka dla wrażenia z produktu** przed sprzedażą.

### 4.8 Bramkowanie ustawień po branży

Zakład detailingowy widzi ustawienia kasy fiskalnej, których nigdy nie użyje.
**Grozi:** wrażeniem produktu nie na miarę tej branży; ryzyko włączenia czegoś na oślep.
**Pilność:** niska technicznie, ta sama kategoria co 4.7.

### 4.9 Panel Asystenta głosowego — **wyłącznie czytanie i raport**

Zakaz zmian w `voice-agent-chat`, `voice-agent-llm`, `voice-agent-tools`, `voice-agent-init`,
`voice-call-commit`, `voice-call-postprocess`, `voice-call-reconcile`, `_shared/voice*`
oraz w konfiguracji ElevenLabs **obowiązuje**. Zaległe, wszystko jako opis:

1. raport z przeglądu ustawień panelu;
2. proponowana kolejność zakładek;
3. instrukcja uruchomienia — kody USSD są uniwersalne dla polskich sieci:
   `*61*NUMER*11*SEKUNDY#` (przekierowanie po nieodebraniu), `##61#` (kasowanie),
   `##002#` (kasowanie wszystkich); zwłoka **10/15/20 s, domyślnie 15**;
4. ukrycie sekcji ElevenLabs przed klientem — jako propozycja, nie zmiana.

**Grozi:** tym, że klient nie uruchomi funkcji, za którą płaci.
**Pilność:** przed sprzedażą modułu głosowego.

### 4.10 Uprawnienia tabelowe w całej bazie — DO ROZSTRZYGNIĘCIA

**530 z 561 tabel** daje rolom `anon` i `authenticated` pełne uprawnienia zapisu
(`INSERT`, `UPDATE`, `DELETE`). To domyślna konfiguracja platformy Supabase, nie
przeoczenie w konkretnej migracji — `GRANT SELECT` dopisany w migracji niczego nie
odbiera, a nowa tabela dostaje szerokie uprawnienia z automatu.

Skutek: **jedyną realną warstwą ochrony jest RLS.** Tabela bez polityki zapisu jest
zamknięta (RLS odmawia domyślnie), ale wystarczy, że ktoś dołoży politykę zbyt
szeroką, i uprawnienia nie stawiają żadnego oporu.

Wyszło przy `workshop_onboarding_usage` (licznik darmowego wprowadzenia): migracja
deklarowała `GRANT SELECT` dla `authenticated`, a produkcja pokazała pełen zestaw.

**Pytanie do rozstrzygnięcia:** czy odbieramy uprawnienia zapisu w całej bazie
i zostawiamy je tylko tam, gdzie są potrzebne — czy świadomie zostajemy przy RLS
jako jedynej warstwie.

Argument za domknięciem: dwie warstwy zamiast jednej; błąd w polityce przestaje
wystarczać do wycieku. Argument przeciw: 530 tabel to duża zmiana o szerokim
zasięgu, a każda nowa tabela wymagałaby pamiętania o `REVOKE` — czyli reguły,
o której się zapomina. Jeśli w tę stronę, to razem z kontrolą w CI.

**Czym grozi w międzyczasie:** niczym nowym — tak działa dziś cały projekt.
To decyzja o warstwie zapasowej, nie naprawa dziury.
**Pilność:** niska technicznie, ale **rozstrzygnąć przed wzrostem liczby tabel**.
Pojedynczych wyjątków nie robimy: jedna wyspa nie jest polityką, a następna
migracja i tak by ją cofnęła.

### 4.7a Rabat roczny występuje w DWÓCH miejscach

Rok kosztuje dziesięć miesięcy — klient płaci za 10, dostaje 12. Ta liczba stoi
w `billing_cena_okresu` jako jedyne źródło… **prawie**.

Drugie wystąpienie jest w `billing-stripe-sync`, przy liczeniu ceny DOCELOWEJ roku:

```ts
const kwotaRokTarget = grosze(Number(plan.price_net_target) * 10, plan.vat_rate);
```

Powód jest realny: `billing_cena_okresu` wycenia po gwarancji **konkretnego klienta**,
a przy zakładaniu cennika w Stripe klienta nie ma. Cena startowa roku idzie z bazy
(bo dla `p_provider = NULL` gwarancja nie obowiązuje i wychodzi startowa), ale
docelowej tą drogą nie da się uzyskać.

**Co z tego wynika: zmiana rabatu wymaga ruszenia OBU miejsc.** Sama zmiana stałej
w funkcji SQL da rozjazd — nowa cena startowa roku i stara docelowa.

**Jak naprawić docelowo:** dołożyć `billing_cena_okresu` trzeci argument wymuszający
wariant ceny (`startowa` / `docelowa`) zamiast wnioskować go z gwarancji klienta.
Wtedy synchronizacja pyta bazę o obie i mnożnik wraca do jednego miejsca.

**Pilność:** niska, dopóki rabat wynosi dwa miesiące i nikt go nie zmienia.
**Przed zmianą rabatu — obowiązkowo.**

### 4.8a Śmieci w `entities` i otwarte zakładanie wystawcy

Dziewięć wpisów, z czego cztery to oczywiste śmieci z testów (`asdadasdad`,
`asdasd`, `asdasdasd`, `rdsffsd`), jeden ma zmyślony NIP `1111111111`, jeden jest
duplikatem. **Żaden nie ma ani jednej faktury**, więc usunięcie jest bezpieczne.

**Nie są widoczne dla klientów** — sprawdzone: polityka `SELECT` ogranicza do
właściciela, księgowego przypisanego do wystawcy i administratora. Widać je tylko
z konta administratora.

Osobna sprawa: `entities` ma `INSERT` z warunkiem `true`, więc każde zalogowane
konto może założyć wystawcę o dowolnym NIP-ie. Dziś bez skutku — widzi tylko swoje.
**Przy fakturach sprzedaży platformy to znaczy tyle, że wystawcy GetRido nie wolno
wybierać z listy; ma być przypięty po identyfikatorze.**

**Pilność:** sprzątanie — niska, kosmetyka panelu administratora. Przypięcie
wystawcy — wchodzi razem z fakturami.

### 4.9a Zatwierdzenie cudzego przeniesienia własności pojazdu

`client_vehicle_ownership_requests` ma politykę `UPDATE` z warunkiem `true` —
*„Users can update ownership requests"*. Każde zalogowane konto może zmienić dowolny
wniosek o przeniesienie własności pojazdu, w tym cudzy.

To nie są pieniądze, ale też nie drobiazg: most warsztat→klient przenosi historię
napraw po numerze VIN, a wniosek jest jedyną bramką w tej ścieżce.

**Czym grozi:** przejęcie historii serwisowej cudzego auta albo zablokowanie
transferu. **Jak naprawić:** warunek po właścicielu wniosku albo po warsztacie,
który go wystawił. **Pilność:** średnia; przed uruchomieniem mostu na szerszą skalę.

### 4.9b Kod współdzielony jest kopiowany PER FUNKCJA przy wdrożeniu

Każda funkcja brzegowa dostaje **własny odcisk** katalogu `_shared` w chwili
wdrożenia. Poprawka w kodzie współdzielonym dociera **wyłącznie do funkcji
wdrożonych po niej** — pozostałe niosą starą kopię, dopóki ktoś ich nie wdroży
ponownie.

Wyszło przy `_shared/smtpSend.ts`: rozszerzyliśmy go o `replyTo` i załączniki,
wdrożyliśmy `billing-ostrzezenia` (ma nową wersję), a `billing-price-guarantee`
nadal niesie starą. Sprawdziłem trzynaście innych funkcji — wszystkie aktualne.

Dziś bez skutku, bo tamta funkcja `replyTo` nie używa. **Ale przy poprawce
BEZPIECZEŃSTWA w `_shared` znaczy to, że część funkcji jej nie dostaje** —
i po numerze wersji tego nie widać.

**Jak sprawdzić:** pobrać funkcję (`supabase functions download`) do czystego
drzewa na `main` i zobaczyć, czy `git status` zostaje czysty. Uwaga: pobranie
nadpisuje `_shared`, więc kolejne pobranie zaciera poprzednie — sprawdzać po jednej.

**Co z tego wynika w praktyce:** po zmianie w `_shared` trzeba wdrożyć ponownie
**każdą funkcję, która z niej korzysta**, nie tylko tę, dla której zmianę robiono.

### 4.10a Dane firmy w trzech miejscach

Te same dane żyją równolegle w `workshop_settings` (`firm_name`, `nip`, `address`,
`city`, `postal_code`, `bank_account`) i w `service_providers` (`company_name`,
`company_nip`, `company_address`, …), a ekran ustawień czyta je **z trzech źródeł po
kolei** i zapisuje do jednego.

To ta sama klasa co „jeden ekran ustawień zamiast trzech edytorów tych samych danych"
(pozycja 4.7) — tylko warstwę niżej, w samych tabelach. Faktura sprzedaży platformy
użyje **tej samej kolejności co ekran**, żeby to, co klient widzi w ustawieniach,
trafiło na dokument. To obejście, nie rozwiązanie.

**Czym grozi:** dane na fakturze mogą różnić się od danych w karcie warsztatu,
zależnie od tego, które źródło było ostatnio zapisane.
**Jak naprawić:** jedno źródło, pozostałe jako widok. **Pilność:** niska technicznie,
ale rośnie z każdym miejscem, które te dane czyta.

### 4.10b Korekta faktury przy zwrocie — ODŁOŻONE ŚWIADOMIE

Zwroty i obciążenia zwrotne odbierają jednostki (migracja `20260819140000`), ale
**nie wystawiają faktury korygującej**. Przy włączonym KSeF korekta musi tam trafić.

**Decyzja (22.08.2026): odkładamy.** Powód: zwrot na starcie sprzedaży jest zdarzeniem
rzadkim, a korekta wystawiona ręcznie w module księgowości zajmuje kilka minut i jest
poprawna. Automat wart jest zbudowania, gdy zwroty przestaną być pojedynczymi
przypadkami.

**Czym grozi:** przy zwrocie trzeba pamiętać o ręcznej korekcie. Jeśli się o niej
zapomni, przychód w księgach jest zawyżony.
**Pilność:** niska, dopóki zwroty liczy się na palcach. **Do przypomnienia po
pierwszych dziesięciu zwrotach.**

### 4.10c Postacie Rido bez plików graficznych

`mascot-fleet`, `mascot-accountant` i `mascot-driver` istnieją w repozytorium wyłącznie
jako `.asset.json`, bez samego obrazu. Mapowanie linii produktowej na postać użyje dla
nich wersji domyślnej. Do wgrania, gdy któraś linia będzie ich potrzebować.

### 4.11 Node.js 20 wycofywany z GitHub Actions

Przy wdrożeniu 21.08.2026 pojawiło się ostrzeżenie, że akcje działające na Node 20
będą zmuszane do Node 24. Dotyczy `actions/checkout@v4`, `actions/setup-node@v4`
i `SamKirkland/FTP-Deploy-Action@v4.3.4`.

**Czym grozi:** dziś niczym — działa. Kiedyś przebiegi zaczną padać, i stanie się to
w dniu, w którym akurat trzeba coś wdrożyć.
**Jak naprawić:** podbicie do `@v5` przy checkout i setup-node; przy FTP-Deploy
sprawdzić, czy jest wydanie na Node 24, bo to akcja spoza GitHuba.
**Pilność:** niska, ale to praca na dziesięć minut — zrobić przy najbliższej okazji,
nie pod presją zepsutego wdrożenia.

### 4.12 Ostrzeżenie o Lovable

Lovable nadpisuje funkcje brzegowe po scaleniu do `main`. **Po każdym deployu**
porównuj SHA-256 kodu z produkcji (`supabase functions download`) z zawartością `main`.
Numer wersji nie jest dowodem — zdarzało się, że rósł przy przywróconym starym kodzie.

---

## Zasady pracy, które obowiązują dalej

- Przed każdą zmianą: które pliki, czy któryś jest współdzielony z agentem głosowym.
  Jeśli tak — **zatrzymanie i pytanie**.
- Przed otwarciem PR do `main` — spis, co w nim jest.
- Migracje **podaję do wklejenia**, nie uruchamiam. Nie mam dostępu do produkcyjnej bazy.
- Nie zmieniam cen w `billing_plans`.
- Stripe = subskrypcje. PayU = jednorazówki. Bez `mode: 'payment'` w Stripe.
- Sekrety wyłącznie w panelu Supabase, nigdy w repozytorium.
- **Reguła trzech przebiegów:** weryfikacja trzy razy pod rząd; jedna czerwień —
  diagnoza, poprawka, licznik od zera. Bez udawania, że coś zostało sprawdzone.
- **Nie badamy, czy ktoś już wykorzystał lukę** — zamykamy.
- Budujemy tak, jakby jutro przyszło pięćdziesięciu płacących klientów, i zakładamy,
  że ktoś **będzie** szukał dróg do darmowych rzeczy.
- Moduł faktur jest gotowy i działa — **nie ruszamy go**.

## Kolejność następnych kroków

1. Migracja `20260820140000` (poprawiona) — do wykonania.
2. Deploy `rental-portal-get` + front → migracja `20260820180000`. **Zamyka 4.1.**
3. Wariant A z wygasaniem trialu (3.1).
4. Limity AI (3.2).

## Encje — znaleziska z 23.08 (nie naprawione, świadomie)

**🔴 CAR4RIDE figuruje w `entities` DWA RAZY z tym samym NIP-em 5223252793.**

Sprawdzone 24.08 — **dokumenty NIE są zdublowane**, zdublowana jest FIRMA:

| | encja A `2b4433ab` | encja B `292d23d2` |
|---|---|---|
| właściciel | anastasiia.shapovalova1991@gmail.com | **warsztat@test.pl** |
| założona | 23.03.2026 | 02.04.2026 |
| dokumentów | 97 | 500 |
| okres zakupów | 31.03 – 29.06 | 14.01 – 17.08 |
| brutto | 177 941,77 zł | 174 558,92 zł |

Wspólny jest **jeden** dokument (369 zł) i **jeden** przypadek zgodności
dostawca+kwota+data. Czyli koszty nie są policzone dwa razy — po prostu ta sama
firma prowadzi księgi w dwóch miejscach, z zachodzącymi na siebie okresami.

**Groźniejsze niż samo rozdzielenie:** encja B, z 500 dokumentami na 174 tys. zł,
wisi przy koncie **`warsztat@test.pl`**. Prawdziwa księgowość na loginie testowym —
kto skasuje to konto „bo testowe", zabierze ze sobą 500 faktur zakupowych.

Scalenie wymaga decyzji właściciela, który wiersz jest właściwy, i przepisania
`owner_user_id` na prawdziwe konto. Przeniesienie dokumentów pod jeden
identyfikator jest mechaniczne, wybór nie jest.

**`Majewski`, NIP 1111111111** — dane testowe, ale trzymają 3 dokumenty zakupowe
i 1 towar, więc nie są puste. Do sprzątnięcia razem z tymi dokumentami albo wcale.

**`cart sp zoo`, NIP 5222884984** — literówka (prawdziwy CART to 5272884984).
Usunięta migracją `20260823150000`.

## Rejestracja — dwie sprawy otwarte (23.08)

### 🔴 `InsuranceAgentRegister` pada z 500 przy niedostarczalnym mailu

**Ta sama przyczyna co w oknie logowania — nie diagnozuj od nowa.** GoTrue
WYCOFUJE utworzenie konta, gdy nie uda się wysłać maila potwierdzającego,
i oddaje `500 Error sending confirmation email`. Konta nie ma, klient nie wie
dlaczego. Nie da się tego skonfigurować po stronie Supabase.

Sprawdzone obiema drogami na tym samym adresie w tej samej minucie:
`auth.signUp` → 500 i brak konta; funkcja brzegowa → 200, konto jest,
`email_sent: false`.

`src/pages/InsuranceAgentRegister.tsx:132` woła `supabase.auth.signUp` wprost.
Naprawa polega na tym samym co w `signUpClient`: przejść na funkcję brzegową,
która zakłada konto kluczem serwisowym i traktuje wysyłkę jako osobny krok.

**Nie jest to jedna linia.** Ten portal ma własne metadane
(`company_name`, `account_type: 'insurance_agent'`) i najpewniej dokłada
rekordy agenta po rejestracji, więc `register-marketplace-user` potrzebowałby
kolejnej gałęzi `account_type` albo agent dostanie własną funkcję.

### ⚠️ Przełącznik `marketplace_email_confirmation_required` — co po zdjęciu

Dziś `true`. `register-marketplace-user` czyta go i przekazuje do
`createUser({ email_confirm: !wymagane })`, więc **zdjęcie przełącznika sprawia,
że konta powstają POTWIERDZONE bez żadnego maila.**

Skutek: rejestracja na cudzy adres. Ktoś zakłada konto na adres firmy, dostaje
działający dostęp od razu, a właściciel adresu nigdy się o tym nie dowiaduje —
bo nie przychodzi żadna wiadomość. Do tego potwierdzony adres bywa u nas
przepustką (odzyskiwanie hasła, powiązania), więc to nie jest sama niewygoda.

Ten przełącznik obejmuje teraz TRZY drogi rejestracji: giełdę, warsztat
z `module` i konto klienta z okna logowania. Zdejmowanie go bez decyzji
o skutkach jest zmianą w bezpieczeństwie, nie w wygodzie.

## Zmiana planu — co zostało otwarte (23.08)

### Zdarzenia `pending_update_*` ze Stripe nieobsłużone

Wejście w górę idzie z `payment_behavior=pending_if_incomplete`, więc operator
stosuje zmianę **wyłącznie po udanej zapłacie** — to zamyka dziurę „plan
zmieniony, pieniędzy nie ma". Gdy zapłata nie przejdzie, oddaje subskrypcję
z wypełnionym `pending_update` i my odpowiadamy klientowi `402`.

**Czego brakuje:** rachunek wisi u operatora **23 godziny** i klient może go
opłacić później — z maila od Stripe albo z portalu rozliczeń. Wtedy operator
zastosuje zmianę u siebie i wyśle `customer.subscription.pending_update_applied`,
którego **nasz webhook nie obsługuje**. Klient miałby wyższy plan u operatora
i niższy u nas.

Do dopięcia w webhooku (`billing-stripe-webhook`):
- `customer.subscription.pending_update_applied` → zapisać nowy `plan_id`,
- `customer.subscription.pending_update_expired` → nic nie zmieniać, ale zalogować.

Skala dzisiaj: zero, bo nikt jeszcze nie zmienił planu kartą. Przed pierwszym
płacącym klientem to ma być zamknięte.

### Zmiana okresu miesiąc → rok przesuwa datę odnowienia

Nie jest to błąd, ale różni się od tego, czego można się spodziewać.
Dokumentacja operatora: *„switching a customer from a monthly subscription to
a yearly subscription moves the billing date to the date of the switch"*.

Czyli niewykorzystana część opłaconego miesiąca **nie dokleja się na końcu roku**
— wraca jako **upust na rachunku** za rok. Klient nie traci pieniędzy, ale data
odnowienia przeskakuje na dzień zmiany. Decyzja produktowa: zostawiamy tak,
bo to jest zachowanie standardowe i najprostsze do wytłumaczenia na fakturze.

## 🔴 Dane wystawcy GetRido żyją w TRZECH tabelach

Jeśli znajdziesz rozjazd w danych na fakturze, zacznij tutaj, a nie od zera.

| tabela | kto zapisuje | kto czyta |
|---|---|---|
| `company_settings` | kafel **Ustawienia** w `/admin/platnosci?tab=ksiegowosc` | ekran ustawień |
| `entities` | wyzwalacz lustrzany z `company_settings` | moduł zakupowy, KSeF, dokumenty |
| **`user_invoice_companies`** | **nikt automatycznie** | **`billing-invoice-issue` — czyli FAKTURA** |

Pierwsze dwie łączą dwa wyzwalacze z migracji `20260823200000_dane_firmy_synchronizacja.sql`.
Lustrują **wyłącznie kolumny, które właśnie się zmieniły**, i nie rozstrzygają
istniejących rozbieżności.

**Trzecia jest poza tym obiegiem.** Wskazuje ją `billing_settings.platform_invoice_company_id`.
Zmiana adresu w kafelku Ustawień **nie zmienia adresu na fakturach** — bez błędu,
bez ostrzeżenia. Rozjazd widoczny już dziś: nazwa „Getrido Sp. z o.o." zamiast
pełnej formy prawnej i puste `bank_account`.

Domknięcie tego (trzecie ogniwo lustra + wyrównanie danych) to **etap 2** kolejności
uzgodnionej 23.08: dane nabywcy → **lustro wystawcy** → numeracja i konto →
wpięcie Stripe'a → przełącznik `auto_invoice_on_paid`.

## ⚠️ `auto_invoice_on_paid` to martwy przełącznik

Kolumna w `billing_settings` istnieje i stoi na `false`. **Nic jej nie czyta.**

`billing-payu-webhook` wystawia fakturę przy każdej opłaconej sprzedaży
bezwarunkowo, i tak samo robi teraz `billing-stripe-webhook` — świadomie, żeby
obie metody płatności zachowywały się tak samo. Zostawienie jednej z nich
za przełącznikiem znaczyłoby, że klient dostaje fakturę albo nie w zależności
od tego, czym zapłacił.

Do rozstrzygnięcia: **albo oba webhooki zaczynają go pytać, albo kolumna
znika.** Przełącznik, który nic nie przełącza, przy następnym incydencie każe
komuś stracić godzinę na sprawdzanie, czemu jego przestawienie nic nie dało.

Fakturowanie jest dziś zabezpieczone od innej strony: bez kompletu danych
nabywcy (`billing_dane_nabywcy_kompletne`) płatność w ogóle nie startuje,
więc faktura z pustym nabywcą nie ma jak powstać.

## ~~Faktura z webhooka idzie BEZ załącznika PDF~~ — ZAMKNIĘTE 23.08

Generator przeniesiony do `supabase/functions/_shared/invoiceHtml.ts` jako
**jedyne źródło**: panel i funkcja brzegowa wołają tę samą funkcję.
`src/utils/invoiceHtmlGenerator.ts` re-eksportuje ją i zatrzymuje wyłącznie
`printHtmlDocument` oraz `printInvoice` — jedyne dwie rzeczy, które dotykały
`window`. Wygląd faktury nietknięty, sprawdzone odciskiem SHA-256 przed i po.

PDF składa ten sam `getrido.pl/invoice-pdf.php` co przeglądarka.

<details><summary>opis sprzed naprawy</summary>

`billing-invoice-issue` wysyła mail przez `send-invoice-email` z samym
`invoice_id` — bez `pdf_base64`.

Powód: przycisk „Email" w panelu składa PDF **w przeglądarce** (`renderInvoicePdf`
posyła gotowy HTML do `public/invoice-pdf.php`, Dompdf na LH.pl) i dopiero wtedy
woła funkcję mailową z załącznikiem. Webhook przeglądarki nie ma.

`send-invoice-email` obsługuje wywołanie bez załącznika — front sam z tego
korzysta, gdy PDF się nie uda. Klient dostaje wiadomość z numerem i kwotą,
a plik pobiera z panelu.

**Do dorobienia:** serwerowe składanie HTML faktury w funkcji brzegowej, żeby
mail niósł załącznik. Szablon jest dziś w komponencie frontu, więc to znaczy
albo wyciągnięcie go do `_shared/`, albo osobny generator — i w obu wypadkach
pilnowanie, żeby dwie wersje szablonu się nie rozjechały.

</details>
