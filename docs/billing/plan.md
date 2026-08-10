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
| **1** | Schemat: tabele, enumy, funkcje `has_feature` / `feature_limit` / `check_usage`, `billing_gateways`, override limitów per subskrypcja, pola promo i polecenia | PR #34, **niewykonana** |
| **2** | Zasiew planów i funkcji + macierz plan × funkcja (zatwierdzona 06.08) | do zrobienia |
| **3** | Panel admina — kolejność: **3.0** fundament (`platform_admin` w `useUserRole`, edge `billing-admin-*`) · **3.1** Funkcje · **3.2** Plany + macierz · **3.3** strona `/cennik` czyta z `billing_plans` · **3.4** Bramki · **3.5** Subskrypcje, Zdarzenia, Ustawienia + nadpisywanie limitu per subskrypcja (plan „Sieci") | 3.0–3.2 gotowe |
| **4** | Podpięcie płatności: `product_type` dla kredytów pojazdowych, naprawa `upsertCredits`, przywrócenie zakupów w UI, usunięcie ścieżki symulacji | do zrobienia |
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
