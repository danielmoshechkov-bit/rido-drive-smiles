# Billing GetRido — punkt wyjścia

Stan na 06.08.2026. Dokument powstał po audycie modułu płatności (KROK 1) i pracach
zabezpieczających (KROK 2–3). Jest to **punkt startu do budowy billingu**, nie opis
działającego systemu.

**Dokumenty w tym katalogu:**

| Plik | Zakres |
|---|---|
| `plan.md` (ten) | stan faktyczny, decyzje, podział „przepinamy / budujemy od zera", kolejność wdrożeń |
| [`admin-panel.md`](./admin-panel.md) | specyfikacja panelu admina: `billing_gateways`, docelowe 10 pod-zakładek, zasady implementacji, test akceptacyjny, dane wejściowe cennika |

`admin-panel.md` powstał przed rozpoczęciem prac, poza repozytorium (jako
`getrido-billing-admin.md`), i został wniesiony tutaj 06.08.2026 bez zmian w treści.

---

## Stan faktyczny: dziś nikt nie płaci

Każde wywołanie `payment-core` akcją `init` kończyło się dotąd **symulacją**:
gałąź przy braku konfiguracji bramki ustawiała płatność na `paid` z sesją `SIM-`,
uruchamiała `processPaymentSuccess` (wydanie produktu) i `tryReferralCompletion`
(wypłatę prowizji). Konfiguracja bramki jest pusta, bo formularz w panelu zapisuje
kolumny `pos_id` i `is_sandbox`, których tabela `payment_gateway_config` nie ma —
każdy zapis kończy się błędem PostgREST.

Efekt: **piąta droga do darmowych środków**, obok czterech znanych z KROKU 2.
Zamknięta w KROKU 3 — `init` zwraca teraz `503 GATEWAY_NOT_CONFIGURED`, gdy po
odjęciu salda zostaje kwota do zapłaty, a bramka nie jest skonfigurowana. Kontrola
stoi **przed** utworzeniem wiersza płatności i przed zdjęciem salda, żeby odmowa
nie zostawiała obciążonego portfela.

Ścieżka „saldo pokryło całość" (`amount_to_charge === 0`) została — jest poprawna.

---

## Decyzje

### 1. Ścieżka symulacji

Do **usunięcia przy billingu**, nie wcześniej. Do tego czasu blokuje ją warunek
opisany wyżej. Przy usuwaniu pamiętać, że prefiks `SIM-` występuje w istniejących
wierszach `payments` i służy do ich odróżnienia w analizach.

### 2. Jeden magazyn kredytów SMS

Docelowo i obecnie: **`service_providers.sms_balance`** — to z niego czyta aplikacja
(`TopBarCredits`, `QuotaGuardProvider`, `workshop-send-sms`, `send-sms`) i to jego
używa `admin_grant`. `processPaymentSuccess` przy `sms_credits` pisze dziś do
`user_credits` z `credit_type='sms'`, czyli tam, gdzie nikt nie patrzy — do naprawy
razem z resztą billingu.

Przy billingu: **wydzielenie do `provider_sms_balance (provider_id pk, balance,
updated_at)`** — wariant B z analizy `sms_balance`. Dotyka 27 miejsc w kodzie,
dlatego nie robimy tego teraz. Do czasu wydzielenia kolumny pilnuje trigger
`guard_sms_balance` (wariant C, migracja `20260805090000`): klient nie zmieni salda,
`service_role` przechodzi, edycja profilu działa bez zmian.

### 3. `upsertCredits`

Kolumny do naprawy **w ramach billingu**. Teraz dodane wyłącznie logowanie błędów —
ciche niepowodzenie przestało być ciche. Każda nieudana próba zostawia w logach
`user`, `typ` i `ilosc`, więc da się ręcznie skorygować.

### 4. `payment_gateway_config`

**Przepisanie w całości** na `billing_gateways`, z sekretami w Supabase secrets,
a nie w kolumnie tabeli. Obecny stan do wyrzucenia: klucz API trafia do kolumny
`api_key_secret_name` (przeznaczonej na *nazwę* sekretu, nie jego wartość),
brakuje kolumn `pos_id` i `is_sandbox`, przez co przełącznik sandbox/produkcja nie
ma pokrycia w schemacie i `init` zawsze wskazuje `sandbox.przelewy24.pl`.

Schemat `billing_gateways`, podział „sekret vs jawne", RLS i wymagania UI (karty
providerów zamiast dropdowna, pole sekretu write-only, badge SANDBOX, blokada
włączenia bez sekretu i webhooka) — patrz [`admin-panel.md`, sekcja 1](./admin-panel.md#1-sekrety-bramek--obowiązkowa-zmiana).
`payment_gateway_config` jest pusta, więc migracja danych jest zbędna — wystarczy
podmiana tabeli i formularza.

### 5. Rola `platform_admin`

Dostęp do sekcji billingowej sprawdzany **serwerowo**, nie ukryciem zakładki.
Przy tej okazji `OWNER_EMAILS` — dziś zaszyte w siedmiu plikach front-endu jako
gating po stronie przeglądarki — przechodzi na rolę w bazie.

---

## Co przepinamy, a co budujemy od zera

### Gotowe — do przepięcia

| Element | Gdzie | Uwagi |
|---|---|---|
| Rejestracja transakcji w P24 | `payment-core` `handleInit` | autentyczne `POST /api/v1/transaction/register`, Basic auth, token → `/trnRequest/{token}` |
| Tabela `payments` | migracja `20260405175210` | statusy, `gateway_session_id`, `gateway_transaction_id` |
| Webhook + weryfikacja podpisu | `payment-core-webhook` | SHA-384 z `P24_CRC_KEY`, dodane w PR #28; **nieprzetestowane na realnym powiadomieniu** |
| Płatność saldem do 80% zamówienia | `handleInit` | wraz z wpisem do `wallet_pln_transactions` |
| Prowizja referral | `tryReferralCompletion` | |
| Mail potwierdzający | `processPaymentSuccess` → `rido-mail` | |
| Wydanie produktu | `processPaymentSuccess` | gałęzie: `marketplace_purchase`, `ai_photo_package`, `sms_credits`, `ai_credits`, `listing_featured` |
| Kontrola tożsamości i ról | `payment-core` `resolveCaller` | PR #28 |

### Do zbudowania od zera

| Element | Dlaczego |
|---|---|
| `billing_gateways` + panel konfiguracji | obecna tabela i formularz nie zapisują się w ogóle (dwie nieistniejące kolumny), sekret trzymany plaintextem w złej kolumnie |
| Przełącznik sandbox / produkcja | brak kolumny; `gw.is_sandbox` to `undefined`, więc `undefined !== false` daje zawsze sandbox |
| `product_type` dla kredytów pojazdowych | jedyna rzecz, którą użytkownicy realnie próbowali kupować, nie ma typu produktu |
| Naprawa `upsertCredits` + uzgodnienie magazynów | pisze do `user_credits.balance` i `credit_type` — obu kolumn nie ma |
| `provider_sms_balance` | wydzielenie salda SMS, wariant B |
| Przywrócenie zakupów w UI | `VehicleLookupCreditsModal` i `SmsPurchaseModal` pokazują „Doładowania wkrótce"; `onPurchase` został w interfejsie, więc wraca się przepięciem na `init`, bez ruszania siedmiu ekranów |
| Test podpisu na sandboxie | weryfikacja P24 napisana z dokumentacji, nigdy nie odebrała prawdziwego powiadomienia |
| `billing_features`, `billing_plans`, `billing_events` + zakładki Plany / Funkcje / Subskrypcje / Zdarzenia / Ustawienia | dziś nie istnieją; Subskrypcje to placeholder „Wkrótce". Pełna specyfikacja: [`admin-panel.md`, sekcja 2](./admin-panel.md#2-docelowa-struktura-pod-zakładek) |
| Rola `platform_admin` + edge `billing-admin-*` | zapisy billingowe mają iść przez `service_role`, a uprawnienie być sprawdzane serwerowo; dziś gating opiera się na `OWNER_EMAILS` w przeglądarce |
| Dane cennika w `billing_plans` | Warsztat 0/89/169/indyw., Agent AI 139/289, bundle MAX 289 — brać z gałęzi `feat/cennik-porownanie-warsztat` (w main), nie wymyślać |

### Zepsute niezależnie od billingu

- `handleCreditsCheck` — te same nieistniejące kolumny co `upsertCredits`; akcja zawsze kończy się błędem
- zakładka **Historia** w panelu pokazywała adminowi wyłącznie jego własne płatności; naprawia to polityka `payments_select_admin` z migracji `20260805090000`
- `MapWalletPanel` wstawiał `user_id` do `wallet_transactions.wallet_id` (FK do `user_wallets.id`) — naprawione w PR #29

---

## Etapy budowy billingu

| Etap | Zakres | Stan |
|---|---|---|
| **1** | Schemat: tabele, enumy, funkcje `has_feature` / `feature_limit` / `check_usage`, `billing_gateways`, override limitów per subskrypcja, pola promo i polecenia | **wykonana** 07.08 |
| **2** | Zasiew planów i funkcji + macierz plan × funkcja (zatwierdzona 06.08) | **wykonana**; cennik zrewidowany 11–13.08 |
| **3** | Panel admina — kolejność: **3.0** fundament (`platform_admin` w `useUserRole`, edge `billing-admin-*`) · **3.1** Funkcje · **3.2** Plany + macierz · **3.3** strona `/cennik` czyta z `billing_plans` · **3.4** Bramki · **3.5** Subskrypcje, Zdarzenia, Ustawienia + nadpisywanie limitu per subskrypcja (plan „Sieci") | **3.0–3.3 gotowe**; 3.4–3.5 zostają |
| **3.6** 🔴 | **Kontekst wielu podmiotów we froncie.** `useWorkshopProviderId` (`src/hooks/useWorkshop.ts:80`) robi `.eq('user_id', …).maybeSingle()`, co **rzuca błędem przy dwóch warsztatach na jednym koncie** — wywala cały panel warsztatu, nie tylko billing. Dotyczy dokładnie tych klientów, którzy kupią najwięcej. RPC `get_user_provider_ids` już istnieje; brakuje przełącznika podmiotu i miejsca na wybór. **Odłożone 13.08**: na produkcji zero userów z dwoma warsztatami. Wymagane przed sprzedażą planu Sieci | odłożone |
| **3.7** | Zadanie cykliczne: zejście z `trial_warsztat` na `warsztat_free` po 30 dniach | do zrobienia |
| **3.8** | `billing_consume()` — zdjęcie z puli planu, potem z pakietów FIFO wg daty ważności, reszta jako nadwyżka. Wymaga reguł rozliczenia (0,60 zł/min, sufit 200 zł/mc), więc idzie razem z katalogiem produktów | do zrobienia |
| **4** | Uruchomienie płatności — **pełny rozpis w sekcji „ETAP 4" na końcu dokumentu**. Wariant startowy (a): subskrypcje Stripe, 7 sesji do pierwszej płatności | w toku |
| **5** | `provider_sms_balance` — wydzielenie salda SMS z `service_providers` (wariant B, 27 miejsc w kodzie) | do zrobienia |
| **6** | **Rabaty i polecenia w subskrypcjach**: spięcie istniejących `promo_codes` / `promo_code_redemptions` z planami (dziś rabaty działają tylko na jednorazówki) oraz rozszerzenie `tryReferralCompletion` z `payment-core` o prowizję od subskrypcji, nie tylko od pierwszego zakupu | do zrobienia |
| **7** | Plany pozostałych portali: **Flota** (25/45/79), **Ogłoszenia** (0/5/9/19/29), **AI** (RidoAI Lite 29, AI Pro 99) oraz pakiety dokupowane (SMS, VIN, minuty AI powyżej limitu — 0,69 zł/min) jako jednorazówki | do zrobienia |

### Etap 3.3 — `/cennik` z bazy, nie z hardkodu

`src/pages/CennikPage.tsx` trzyma dziś ceny i listy funkcji wpisane w kodzie. Po
uruchomieniu zakładki Plany będą to **dwa niezależne źródła prawdy** i rozjadą się
przy pierwszej zmianie ceny w panelu — z tą różnicą, że klient zobaczy wersję
z kodu, a policzy się wersja z bazy.

Zakres: strona czyta plany, ceny i przypisane funkcje z `billing_plans`,
`billing_features` i `billing_plan_features` (polityka `USING (is_active)`
przepuszcza każdego zalogowanego, więc wystarczy zwykły `select`). W kodzie
zostają wyłącznie teksty nienależące do cennika — nagłówki sekcji, opisy
marketingowe i przypisy.

Robimy **po 3.2**, gdy macierz jest już edytowalna — inaczej strona zaczęłaby
czytać z tabeli, której nikt nie może poprawić.

Etap 6 nie wymaga migracji tabeli `billing_subscriptions` — pola `promo_code_id`,
`promo_code`, `promo_discount_percent`, `referral_use_id` i `referral_code` są
w schemacie od etapu 1 właśnie po to, żeby nie migrować tabeli z ruchem produkcyjnym.

## Kolejność wdrożeń

1. **PR #28** — tożsamość w `payment-core`, podpis P24. Bez sekretu `P24_CRC_KEY`
   webhook zwraca 503 i jest zamknięty; reszta akcji działa normalnie.
2. **PR #29** — salda na serwerze, `admin_wallet_topup`, blokada `init` bez bramki,
   ukryte doładowania.
3. **Front** z #29 na produkcję.
4. **Migracja `20260805120000`** — trigger provisioningu i księga bonusów.
5. **Migracja `20260805090000`** — lockdown RLS + trigger `sms_balance`.
6. **Kontrola** — zapytanie o polityki inne niż `SELECT` na ośmiu tabelach; pusty
   wynik oznacza kompletny lockdown.

Kolejność 4 przed 5 jest istotna mimo znaczników czasu sugerujących odwrotnie.
Rollback lockdownu: `docs/rollback-20260805090000-payments-lockdown.sql`.

**Punkt 7 testu akceptacyjnego** z `admin-panel.md` — „pusta konfiguracja bramki →
`init` zwraca `GATEWAY_NOT_CONFIGURED`, nie przyznaje produktu" — jest już
zaimplementowany w PR #29 i gotowy do weryfikacji od razu po jego wdrożeniu.
Pozostałe sześć punktów wymaga zbudowania billingu.

---

## Stan bazy przed zmianami (śledztwo 05.08.2026)

Żadna z pięciu luk nie została wykorzystana:

- płatności `paid` bez potwierdzenia operatora: **1**, własny test właściciela (`SIM-`, 05.04.2026)
- bonus powitalny w kwocie innej niż 20 zł: **0**
- `user_credits`: 3 wiersze, wszystkie po 50, nic nie wydane
- `vehicle_lookup_credit_transactions`: 119 wpisów zużycia, 3 ręczne przyznania admina,
  **1 fikcyjny zakup** (+10 kredytów, 22.07.2026)
- `service_providers` z saldem SMS: 3, łącznie 334 SMS-y — salda realne, nietknięte

Wszystkie zmiany są prewencyjne. Nie ma sald do korekty ani kont do zablokowania.

---

# ETAP 4 — URUCHOMIENIE PŁATNOŚCI

Rozpisany 13.08.2026 po audycie pokrycia funkcji kodem. Cel: **warsztat wchodzi na
cennik, klika plan, płaci, dostaje to, co kupił, i otrzymuje fakturę VAT od
GETRIDO sp. z o.o. na maila oraz w KSeF.**

Wariant startowy zatwierdzony 13.08: **(a) — subskrypcje Stripe, bez pakietów
dokupowanych, bez PayU, bez gatingu, faktura półautomatyczna**, z pominięciem
podetapu 4.2 (panel bramek). Uzasadnienie przy każdym podetapie niżej.

---

## 0. DO ZROBIENIA PRZEZ DANIELA, POZA KODEM

Trzy rzeczy, których nie da się zaprogramować. **Blokują 4.5 i 4.17** — dopóki nie
są zrobione, kod nie ma się o co oprzeć.

### 0.A Stripe — Products i Prices

Konto jest zweryfikowane, produktów nie ma. Synchronizacja z 4.5 ma je **tworzyć od
zera** przez API, nie tylko podpinać istniejące — więc ręcznie nic nie zakładaj.
Do sprawdzenia w panelu Stripe przed startem:

1. **Tryb testowy i produkcyjny to dwa osobne światy.** Przełącznik „Test mode"
   w prawym górnym rogu. Produkty, ceny, klucze i webhooki utworzone w trybie
   testowym **nie istnieją** w produkcyjnym. Zaczynamy w testowym, przechodzimy na
   produkcyjny dopiero po punkcie kontrolnym.
2. **Klucze API** — Developers → API keys. Potrzebne dwa:
   - `sk_test_…` (Secret key) → do **Supabase secrets**, nigdy do bazy i nigdy do frontu
   - `pk_test_…` (Publishable) → tylko jeśli użyjemy Stripe Elements; przy Checkoucie
     hostowanym przez Stripe nie jest potrzebny
   Po przejściu na produkcję: te same pola, wartości `sk_live_…`.
3. **Webhook** — Developers → Webhooks → Add endpoint.
   - URL: `https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/stripe-webhook`
   - zdarzenia: `checkout.session.completed`, `invoice.paid`,
     `invoice.payment_failed`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `charge.refunded`
   - po zapisaniu skopiuj **Signing secret** (`whsec_…`) → do Supabase secrets.
     Bez niego weryfikacja podpisu nie ma czym działać, a funkcja ma wtedy odmawiać
     (fail-closed), nie przepuszczać
4. **Waluta i profil firmy** — Settings → Business: waluta domyślna **PLN**, dane
   spółki zgodne z NIP 5223377431.
5. **Customer Portal** — Settings → Billing → Customer portal: włączyć, zaznaczyć
   „Update payment method" i „Cancel subscription". Potrzebne do 4.8.

**Decyzja POTWIERDZONA 13.08: cena w Stripe to kwota BRUTTO.** W `billing_plans`
trzymamy netto (99, 169, 199) i brutto liczone kolumną generowaną. Stripe pobiera
jedną kwotę — jeśli wystawimy tam netto, obciążymy klienta o 23% za mało. Dlatego
`stripe_price_id` wskazuje cenę **brutto** (99 → 121,77 zł), a rozbicie na netto
i VAT robi nasza faktura z 4.17. Stripe Tax odrzucony na start — osobna konfiguracja podatkowa i dodatkowy koszt.

### 0.B KSeF — token dla GETRIDO sp. z o.o.

Dzisiejsze tokeny w `company_settings` należą do **warsztatów**. Token jest wydawany
na NIP, więc GetRido potrzebuje własnego, na NIP **5223377431**.

Kroki:

1. Wejdź na **środowisko testowe**: `ksef-test.mf.gov.pl`. Uwierzytelnienie jako
   podmiot — podpisem kwalifikowanym, pieczęcią kwalifikowaną albo Profilem
   Zaufanym osoby uprawnionej do reprezentacji.
2. Jeśli spółka nie ma podpisu ani pieczęci kwalifikowanej — najpierw **ZAW-FA**
   (papierowe zawiadomienie do urzędu skarbowego wskazujące osobę uprawnioną).
   To jest ścieżka najdłuższa, kilka dni, więc sprawdź to najpierw.
3. Po zalogowaniu: sekcja **Tokeny** → wygeneruj token z uprawnieniami do
   **wystawiania i odczytu faktur**. Token pokazuje się **raz** — zapisz od razu.
4. Powtórz **to samo na produkcji** (`ksef.mf.gov.pl`). Token testowy nie działa
   na produkcji i odwrotnie — kod (`ksef-integration/index.ts:316-320`) trzyma je
   w osobnych kolumnach `ksef_token_test` i `ksef_token_production` właśnie dlatego.
5. Oba tokeny wklejasz w ustawieniach konta platformowego (0.C), nie w sekretach.

**Zakładamy, że KSeF jest obowiązkowy od pierwszej faktury.** Zwolnienie dla
drobnych faktur (do 450 zł, do 10 tys. zł miesięcznie) Daniel weryfikuje z księgową
— implementacji na nim nie opieramy.

### 0.C Konto platformowe GetRido

**Migracja nie jest potrzebna.** Wszystko w silniku faktur jest kluczowane po
`user_id`: `company_settings` (NIP, tokeny KSeF, środowisko) i numeracja
`user_invoices`. Wystarczy zwykłe konto.

1. Zarejestruj konto na dedykowany adres, np. `faktury@getrido.pl` — nie na adres
   prywatny, bo to konto będzie wystawiać wszystkie faktury sprzedażowe spółki.
2. W ustawieniach firmy uzupełnij dane GETRIDO sp. z o.o. wraz z NIP 5223377431
   i adresem rejestrowym.
3. Wklej oba tokeny KSeF z 0.B, ustaw środowisko na **testowe** do czasu punktu
   kontrolnego przed pierwszą prawdziwą płatnością.
4. **Seria numeracji — ustawić PRZED fakturą numer 1.** Kolizji z fakturami
   warsztatów nie ma z definicji, bo numeracja jest per użytkownik, ale seria musi
   być czytelna w razie kontroli i nie może się zmienić w połowie roku.
   Rekomendacja: **`FS/{nr}/{rok}`** („faktura sprzedaży"), licznik od 1, reset
   roczny. Przenumerować się później nie da.

---

## Podetapy

Szacunek w sesjach roboczych. **Pogrubione** leżą na ścieżce krytycznej wariantu (a).

### Tor A — fundament

| # | podetap | sesje | zależy od |
|---|---|---|---|
| 4.3 | Naprawa `upsertCredits` — `payment-core/index.ts:630-635` robi `select("id, balance")` z filtrem `.eq("credit_type", …)`, a `user_credits` ma wyłącznie `id`, `user_id`, `credits_balance`. PostgREST zwraca błąd, `fail("odczyt salda")` loguje i funkcja **kończy się cicho**: płatność przechodzi, kredyty nie wchodzą | 1 | — |
| 4.1 | Kontekst wielu podmiotów (podetap 3.6). **Odłożony**: na produkcji zero userów z dwoma warsztatami (sprawdzone 13.08). `maybeSingle()` nie wywala się przy jednym. **Wymagane przed sprzedażą planu Sieci** | 1–2 | — |
| 4.2 | Panel bramek — `billing_gateways`, sekrety write-only, test połączenia, webhook URL, badge SANDBOX. **Pominięty na start**: przy jednej bramce i jednym administratorze klucze wystarczy raz wstawić w sekretach Supabase. Oszczędza 2 sesje. Wraca razem z PayU | 2 | — |
| 4.4 | Uzgodnienie magazynu SMS — dziś trzy prawdy o jednym saldzie: `service_providers.sms_balance`, `user_credits`, `billing_addon_packs`. **Nieodwracalna migracja danych na saldach, za które ktoś zapłacił** — punkt kontrolny | 2 | 4.3 |

### Tor B — pieniądze wchodzą

| # | podetap | sesje | zależy od |
|---|---|---|---|
| **4.5** | **Stripe checkout subskrypcji** + synchronizacja `billing_plans` → Stripe Products/Prices (tworzenie od zera), zapis `stripe_price_id` | 3 | 0.A |
| **4.6** | **Stripe webhook** — `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated/deleted`, `charge.refunded` → statusy `billing_subscriptions`. Idempotencja po `event.id` w `billing_events` | 2 | 4.5 |
| **4.9** | **`price_guarantee_until`** przy aktywacji: `now() + 12 miesięcy`, gdy zakup przed `promo_enrollment_until` | 0,5 | 4.6 |
| 4.8 | Stripe Customer Portal — zmiana karty, anulowanie, historia | 1 | 4.6, 0.A pkt 5 |
| 4.7 | PayU — jednorazówki (BLIK, przelew), webhook z weryfikacją `OpenPayu-Signature` (MD5 z second key). **Uwaga:** w kodzie jest szkielet P24, nigdy nieuruchomiony — to nie to samo | 3 | 4.2, 4.3, 4.4 |

### Tor C — zużycie i produkty dokupowane

| # | podetap | sesje | zależy od |
|---|---|---|---|
| 4.10 | `billing_consume()` — pula planu → `billing_addon_packs` FIFO wg daty ważności → nadwyżka; sufit 200 zł/mc; jedna transakcja | 2–3 | 4.1 |
| 4.11 | Katalog produktów dokupowanych — pakiety SMS, VIN, minuty 100/250/500, ceny, `product_type` | 2 | 4.10 |
| 4.12 | `vehicle_lookup` — jedno źródło prawdy. Dziś limit 3 na Free jest **ozdobą**: siedzi w `billing_plan_features`, a kod czyta `vehicle_lookup_credits`. **Przed uruchomieniem sprzedaży Free** — to jedna z dwóch bram konwersji | 1–2 | 4.10 |
| 4.13 | Przywrócenie ukrytych przycisków doładowania (`VehicleLookupCreditsModal`, `SmsPurchaseModal`) | 0,5 | 4.11 |

### Tor D — dostęp i dokumenty

| # | podetap | sesje | zależy od |
|---|---|---|---|

### Kontrola dostępu — ustalenia z audytu 13.08 (fundament pod 4.14)

Audyt panelu usługodawcy wykazał, że izolacja między warsztatami **trzyma się**:
anon nie ma dostępu do żadnej tabeli warsztatowej (`SECFIX1b` z 14.07 wykonany,
sprawdzone empirycznie kluczem anon — osiem tabel zwraca zero wierszy), a konto
bez warsztatu nie zobaczy cudzych danych, bo RLS filtruje po
`provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())`.

Trzy rzeczy do naprawienia przed gatingiem:

**A. Rola bez podmiotu to stan nielegalny, a powstaje po cichu.** `/uslugi/panel`
bramkuje wyłącznie po roli `service_provider` (`ServiceProviderDashboard.tsx:287`),
nie po istnieniu wiersza w `service_providers`. Rolę nadają `upsert`-em
`activate-workshop-trial` i `register-marketplace-user`, a wstawienie wiersza
providera jest w obu osobnym krokiem, który przy błędzie tylko loguje ostrzeżenie
i idzie dalej. Efekt: konto z rolą i bez warsztatu widzi pełny panel z zerami.
**Do 4.1**: nadanie roli atomowe z utworzeniem podmiotu + jednorazowe sprzątanie
istniejących kont w tym stanie.

**B. Panel ma odmawiać przy `providerId = null`.** Dziś warunek jest tylko przy
Kalendarzu i Rezerwacjach; Zlecenia, Kasa, Magazyn, Pracownicy i reszta renderują
się puste. Zera nie są zabezpieczeniem — biorą się z `enabled: !!providerId`
w sześciu hookach `useWorkshop.ts`, czyli z warstwy prezentacji. **Do 4.14**, ten
sam `FeatureGate`, inny warunek: „masz warsztat" zamiast „masz plan".

**C. `Admin full access` do rozstrzygnięcia PRZED 4.14.** Sześć polityk RLS
(`workshop_orders`, `_clients`, `_vehicles`, `_order_items`, `_order_statuses`,
`_order_status_history`) daje roli `admin` pełny odczyt i zapis danych
**wszystkich** warsztatów. Polityki łączą się przez OR, więc dopóki tak jest,
każda bramka planowa w UI jest dla admina dekoracją. Panel usługodawcy nie jest
narzędziem administracyjnym, a `provider_id` cudzych warsztatów jest publiczny
(`service_providers` czyta anon).

Zależność jest wąska: **jedyny ekran korzystający z tych polityk to wyszukiwarka
pojazdów po VIN/nr rej. w `AdminPaymentsTab.tsx:306`**. Pozostali czytelnicy tych
tabel (`useFiscal`, `CalendarView`, `FiscalReceiptDialog`, `workshopStationHandover`)
działają w kontekście właściciela i mieszczą się w polityce providera. Edge
functions używają service_role, więc RLS ich nie dotyczy.

| 4.14 + 4.16 | **Jeden PR, nierozdzielnie**: gating (`useFeature`, `FeatureGate`, bramka serwerowa w edge) **i** tryb `read_only`. Wdrożenie blokady bez trybu odczytu odcięłoby klientowi dostęp do własnych danych | 3–4 | 4.1 |
| 4.15 | RLS na tabelach modułowych — bez tego gating frontowy jest dekoracją | 2 | 4.14 |
| **4.17-mini** | **Faktura sprzedażowa, wersja startowa: PDF + mail automatycznie, wysyłka do KSeF ręcznym kliknięciem tego samego dnia.** W reżimie obowiązkowym faktura jest wystawiona w dniu wysłania do KSeF, a tryby offline dają czas do następnego dnia roboczego — „wypchnę za tydzień" nie jest legalne | 1,5 | 0.B, 0.C, 4.6 |
| 4.17 | Faktura sprzedażowa, pełna: automat KSeF w webhooku, korekty przy zwrocie, faktury bez NIP i zagraniczne | 2 | 4.17-mini |

**Ścieżka krytyczna wariantu (a): 4.5 → 4.6 → 4.9 → 4.17-mini = 7 sesji.**
Pełny etap 4 ze wszystkim: 26–33 sesje.

### Co można robić równolegle

- 4.3 i 4.5 — rozłączne; 4.3 nie leży na ścieżce subskrypcji
- Tor B i Tor C — spotykają się dopiero przy 4.13
- 4.14 i 4.15 — najlepiej jedna osoba, to ta sama decyzja na dwóch poziomach
- 4.17 — może iść na końcu, równolegle do czegokolwiek

---

## Zmiana planu w trakcie okresu (do 4.5) — decyzje z 13.08

**Proration liczy Stripe, nie my.** Własna logika oznaczałaby liczenie
niewykorzystanych dni, kredytów i przypadków brzegowych, które Stripe ma
przetestowane, a i tak trzeba by wystawić dokument na różnicę.

- **Upgrade** (Standard → Pro): `proration_behavior: 'always_invoice'`. Stripe
  liczy zwrot za niewykorzystaną część starego planu, dolicza nowy pro rata,
  wystawia fakturę na różnicę i pobiera ją **od razu**. Webhook widzi
  `invoice.paid` i podnosi `plan_id`. Klient dostaje wyższy plan natychmiast,
  bo zapłacił.
- **Downgrade** (Pro → Standard): `proration_behavior: 'none'` + zmiana
  **zaplanowana na koniec okresu**. Klient dopłacił za Pro do końca miesiąca,
  więc niech go ma. Oszczędza nam zwrotów, korekt i sald kredytowych u Stripe'a,
  których nie ma jak odwzorować w polskiej fakturze.

**Konsekwencja dla 4.17:** faktura z upgrade'u ma **dwie pozycje** — ujemną
(zwrot za stary plan) i dodatnią (nowy plan pro rata). To zwykła faktura
z pozycją ujemną, nie korekta. Generator musi odwzorować pozycje Stripe'a jeden
do jednego, VAT liczony od sumy.

**Gwarancja ceny PRZECHODZI na nowy plan, nie startuje od nowa.** Trzy powody:
obietnica brzmi „12 miesięcy **od aktywacji**", więc jest przypisana do wejścia
klienta na platformę, nie do planu; restart tworzyłby patologię (upgrade w 364.
dniu kupuje kolejne 12 miesięcy cen promocyjnych, downgrade zamyka pętlę);
skrócenie byłoby karą za upgrade. Schemat to ułatwia — jedna aktywna subskrypcja
na linię produktową, więc upgrade to `UPDATE plan_id` na istniejącym wierszu
i `price_guarantee_until` przetrwa samo, o ile nikt go nie nadpisze.

**`price_snapshot` aktualizowany** na cenę **startową** nowego planu (Pro = 169,
nie docelową 249 — klient jest w oknie gwarancji), wraz z datą zmiany i kodem
poprzedniego planu. Pełne przed/po ląduje w `billing_audit_log` w tej samej
transakcji. Kolumna jest `jsonb`, więc bez migracji.

---

## 4.20 — Wygaśnięcie gwarancji ceny

Dziura w łańcuchu obietnicy, znaleziona 13.08: mamy `price_net_target` w planie
i `price_guarantee_until` w subskrypcji, ale **nic nie przenosi klienta z ceny
startowej na docelową** po 12 miesiącach ani nie powiadamia go 30 dni wcześniej,
jak obiecuje cennik.

Konsekwencja dla **4.5**: każdy plan potrzebuje **dwóch obiektów Price w Stripe**
— startowego i docelowego — tworzonych od razu przy synchronizacji, z zapisem obu
identyfikatorów. Wygaśnięcie gwarancji to podmiana pozycji subskrypcji z jednej
ceny na drugą. Jeśli synchronizacja utworzy tylko cenę startową, za rok trzeba
będzie zakładać ceny ręcznie dla każdego klienta osobno.

Zakres 4.20: zadanie cykliczne — mail 30 dni przed datą z `price_guarantee_until`,
po dacie podmiana pozycji w Stripe i aktualizacja `price_snapshot`. **~1,5 sesji**,
plus 1 sesja doliczona do 4.5 na drugą cenę. Nie blokuje pierwszej płatności;
pierwszy termin zapada 12 miesięcy po pierwszym kliencie.

**Do przemyślenia przed implementacją** (pytanie Daniela z 13.08): klient
w gwarancji robi upgrade, a po jej wygaśnięciu ma przejść na cenę docelową planu,
na którym **wtedy** jest. Czy `price_guarantee_until` wystarczy, czy trzeba
trzymać także, **z którego `price_id` przechodzimy** — bo po zmianie planu
w międzyczasie pozycja subskrypcji wskazuje już inną cenę startową, niż ta,
od której gwarancja się zaczynała. Rozstrzygnąć przed pisaniem zadania cyklicznego.

---

## 4.18 — Przywrócenie Agent Pro do sprzedaży

**13.08.2026 sprzedaż `agent_pro` i `agent_sieci` wstrzymana** (`is_active = false`).
Powód: po zdjęciu z kart funkcji bez implementacji różnica 199 → 399 zł opierała się
na czterech pozycjach, z których **trzy nie były egzekwowane, a czwarta działała
w połowie**. Warsztat płacący 399 dostawał technicznie to samo co za 199.

Warunki przywrócenia — **komplet, nie wybiórczo**:

1. **Liczenie minut** (4.10) — `voice_minutes` zdejmowane z puli planu do
   `billing_usage`. Dziś nikt nie liczy, więc „600 vs 1000 minut" jest liczbą bez
   pokrycia w pomiarze.
2. **Egzekwowanie `voice_concurrent_calls`** — limit sprawdzany w momencie
   zestawiania połączenia, przez `feature_limit()`, nie `check_usage()`
   (to pojemność, nie licznik miesięczny). To jest główny argument wobec fonio Solo.
3. **Egzekwowanie `voice_numbers`** — jak wyżej.
4. **Zbiorcza analityka rozmów** — dziś `voice_call_outcomes` widać wyłącznie
   w karcie zlecenia (`OrderCallPanel`), a `ai-agents/ConversationAnalytics.tsx`
   to martwy kod z usuniętym importem.

Punkty 1–3 leżą w wątku agenta głosowego, nie w billingu.

Przy okazji przywracania rozstrzygnąć, czy wracają na karty `voice_ai_quotes`,
`voice_priority_quality` i `voice_multi_number` — zdjęte 13.08 jako obietnice bez
ani jednej linii kodu. Zostały w `billing_features`, więc wracają jednym `INSERT`-em.

---

## Tryb `read_only` — specyfikacja (do 4.16)

Warsztat bez opłaconego abonamentu. Zasada nadrzędna: **może domknąć to, co zaczął
i za co zapłacił, ale nie zaczyna nic nowego.** Po opłaceniu wszystko wraca
natychmiast, bez utraty danych.

**DZIAŁA:**

- podgląd wszystkich swoich zleceń, klientów, pojazdów, historii, zdjęć
- wyszukiwanie i filtrowanie
- **eksport danych (CSV, PDF) — zawsze, bez wyjątku, w każdym statusie.**
  Trzymanie danych klienta zakładnikiem zamienia windykację w spór i generuje złe
  opinie. To nie podlega dyskusji
- wystawianie faktur — moduł fakturowy jest ogólnodostępny, poza gatingiem
- wysyłka SMS wyłącznie do zleceń, które **już istnieją**, i tylko z posiadanego pakietu
- opłacenie abonamentu

**ZABLOKOWANE:**

- tworzenie nowych zleceń
- edycja istniejących: zmiana pojazdu, właściciela, pozycji, statusu
- dodawanie klientów i pojazdów
- fiskalizacja, wysyłka do KSeF
- zamówienia do hurtowni
- akcje AI
- e-podpis SMS na nowych dokumentach

Banner: *„Subskrypcja wygasła. Masz podgląd i eksport danych. Aby wrócić do pracy —
opłać abonament."*

Statusy: `trialing` (30 dni) → `active` → `past_due` (7 dni karencji, **pełny
dostęp**) → `read_only` → `canceled`.

**Ustalone i ZWERYFIKOWANE 13.08:** moduł fakturowy da się wyłączyć z gatingu
czysto. Powiązanie zlecenia z fakturą siedzi na `user_invoices.workshop_order_id`,
a `workshop_orders` **nie ma** kolumny wskazującej na fakturę. Sprawdzone również
triggery po obu stronach — żaden nie przekracza granicy tabeli:

| tabela | triggery | wniosek |
|---|---|---|
| `user_invoices` | `trg_freeze_ksef_invoice_delete`, `trg_freeze_ksef_invoice_update`, `trg_unique_invoice_number`, `update_user_invoices_updated_at` | wszystkie na własnej tabeli, żaden nie pisze do `workshop_orders` |
| `workshop_orders` | `trg_log_workshop_order_status`, `trg_workshop_client_code`, `trg_workshop_order_delete_sync`, `trg_workshop_order_flags_update_status`, `trg_workshop_order_number`, `trg_workshop_orders_updated` | żaden nie odwołuje się do faktur |

Blokada zapisu na zleceniach nie dotknie wystawiania faktur — rozdział jest czysty,
bez skutków ubocznych.

---

## 🔴 Jawny dług: pierwsi klienci bez gatingu

**Decyzja z 13.08, świadoma.** Wariant (a) wpuszcza pierwszych płacących klientów,
zanim powstanie gating (4.14–4.16). Konsekwencje, przyjęte z pełną świadomością:

- **Danych to nie psuje.** `has_feature` / `feature_limit` / `check_usage` nie mają
  ani jednego wywołania w kodzie, więc nie ma czego zapisać źle. `billing_usage`
  zostaje puste i zacznie liczyć od zera, gdy wejdzie 4.10 — to poprawny stan
  początkowy, nie luka.
- **Klient dostaje więcej, niż kupił.** Koszt realny w trzech miejscach — zapytania
  AI, SMS-y, sprawdzenia VIN — ale każde ma własny, działający licznik kredytów
  niezależny od billingu, więc to brak różnicowania planów, nie dziura bez dna.
- **Nieopłacona subskrypcja niczego nie odetnie**, bo `read_only` też jeszcze nie
  działa.
- **Ryzyko niefinansowe:** klient przyzwyczai się do funkcji spoza swojego planu
  i odbierze późniejszy gating jako zabranie czegoś, za co płacił. Dlatego pierwsi
  klienci mają być **uprzedzeni, że są na wczesnym dostępie**.

**Termin spłaty: gating musi wejść przed szóstym klientem.** Przy pięciu pierwszych
rozmowa wystarczy; przy szóstym to już polityka, a nie wyjątek.

---

## Plan testów przed pierwszą prawdziwą płatnością

Do przeprowadzenia w trybie testowym Stripe i sandboxie PayU, zanim ktokolwiek
zapłaci naprawdę.

1. **Stripe test mode, pełna ścieżka** — checkout → webhook →
   `billing_subscriptions.status = 'active'` → uprawnienia → faktura → mail → KSeF testowy
2. **PayU sandbox** — jednorazówka: pakiet SMS → webhook → `billing_addon_packs` →
   saldo widoczne w panelu warsztatu *(dopiero po 4.7)*
3. **Nieudana płatność** — `invoice.payment_failed` → `past_due` → 7 dni karencji
   z pełnym dostępem → `read_only` → opłacenie → natychmiastowy powrót *(po 4.16)*
4. **Webhook trzy razy** — to samo zdarzenie wysłane trzykrotnie: jeden wpis
   w `billing_events`, jedna subskrypcja, **jedna faktura**
5. **Zwrot płatności** — `charge.refunded` → korekta → KSeF
6. **Druga subskrypcja na jednym koncie** — Warsztat + Agent równolegle
   (test `product_line`; przed rewizją cennika baza by tego zabroniła)
7. **Doładowanie ponad limit planu** — `check_usage` pokazuje `remaining` z planu
   i `packs_remaining` osobno, `available` jako sumę
8. **Pusta konfiguracja bramki** — `init` zwraca `GATEWAY_NOT_CONFIGURED`, nie
   przyznaje produktu za darmo
9. **Gating** — próba `INSERT` do tabeli modułu tokenem użytkownika bez uprawnienia:
   RLS odrzuca, nie tylko UI *(po 4.15)*

---

## Zasady pracy w etapie 4

- **Fail-closed przy wszystkim, co dotyka pieniędzy.** Brak konfiguracji = odmowa,
  nigdy domyślne przepuszczenie. Żadnych `TODO` w miejscu weryfikacji podpisu.
- **Idempotencja przy każdym webhooku** — operator wyśle to samo zdarzenie dwa razy.
- **Migracje pokazywane do wklejenia.** `ALTER TYPE … ADD VALUE` w osobnej
  transakcji; SQL Editor rozbija skrypt na sesje, więc `CREATE TEMP TABLE` nie
  przeżywa — audyt przez CTE w tym samym zapytaniu.
- **Po każdym deployu edge: `functions download` + SHA-256 wobec `main`.** Lovable
  deployuje z `main` i nadpisuje funkcje wdrożone z gałęzi.
- **Nie dotykać plików agenta głosowego** (`voice-*`, `_shared/voice*`) — praca
  równoległa w drugim wątku.
