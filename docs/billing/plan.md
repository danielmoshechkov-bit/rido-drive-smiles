# Billing GetRido — punkt wyjścia

Stan na 06.08.2026. Dokument powstał po audycie modułu płatności (KROK 1) i pracach
zabezpieczających (KROK 2–3). Jest to **punkt startu do budowy billingu**, nie opis
działającego systemu.

> **Uwaga o źródle.** Decyzja 4 poniżej odwołuje się do `getrido-billing-admin.md`.
> Tego pliku nie ma w repozytorium ani w historii gita — nie widziałem jego treści.
> Zapisałem wyłącznie ustalenie w postaci, w jakiej padło. Jeśli dokument istnieje
> poza repo, warto go tu wnieść, zanim zacznie się projektowanie `billing_gateways`.

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

### Zepsute niezależnie od billingu

- `handleCreditsCheck` — te same nieistniejące kolumny co `upsertCredits`; akcja zawsze kończy się błędem
- zakładka **Historia** w panelu pokazywała adminowi wyłącznie jego własne płatności; naprawia to polityka `payments_select_admin` z migracji `20260805090000`
- `MapWalletPanel` wstawiał `user_id` do `wallet_transactions.wallet_id` (FK do `user_wallets.id`) — naprawione w PR #29

---

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
