# GetRido — panel admina: moduł Płatności (specyfikacja)

Uzupełnienie do `docs/billing/plan.md`. Dotyczy `/admin/portal?tab=payments`.
Wersja po audycie z 05-06.08.2026.

---

## 1. Sekrety bramek — obowiązkowa zmiana

Obecny formularz zapisuje klucz API do kolumny `api_key_secret_name` — plaintext, w polu przeznaczonym na *nazwę* sekretu. Do przepisania.

**Zasada:** klucze produkcyjne bramek to sekrety platformy, nie dane konfiguracyjne tenanta.

| Dana | Gdzie |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYU_CLIENT_SECRET`, `PAYU_MD5_KEY`, `P24_CRC_KEY`, `P24_API_KEY` | **Supabase secrets** — wyłącznie edge functions |
| `PAYU_POS_ID`, `PAYU_CLIENT_ID`, `P24_MERCHANT_ID`, `STRIPE_PUBLISHABLE_KEY`, tryb sandbox/live, flaga aktywności | tabela `billing_gateways` (jawne) |

```sql
create table public.billing_gateways (
  id uuid primary key default gen_random_uuid(),
  provider billing_provider not null unique,     -- stripe | payu | p24
  is_enabled boolean not null default false,
  is_sandbox boolean not null default true,
  merchant_id text,
  pos_id text,
  client_id text,
  publishable_key text,
  supports_subscriptions boolean not null default false,
  supports_one_time boolean not null default true,
  secret_status text not null default 'missing',  -- missing|set (NIGDY wartość)
  last_webhook_at timestamptz,
  last_test_at timestamptz,
  last_test_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS: SELECT tylko `platform_admin`, UPDATE wyłącznie `service_role` przez edge function `billing-admin-config`.

**UI zakładki Bramki po zmianie:**
- Lista providerów jako karty (Stripe / PayU / Przelewy24), każdy z własnym przełącznikiem — nie dropdown, bo Stripe i PayU mają działać równolegle
- Pole sekretu **write-only**: wpisujesz → edge zapisuje do Supabase secrets → pole się czyści, status „Ustawiony ✓". Wartość nigdy nie wraca do przeglądarki
- Przy każdym providerze: **URL webhooka + przycisk kopiuj**
- Przycisk **„Testuj połączenie"** → lekki call do API providera → zapis `last_test_result`
- Wskaźnik „Ostatni webhook: X min temu" — najszybsza diagnostyka, gdy płatności przestaną wpadać
- Badge **SANDBOX** dużym, czerwonym. Zapomniany sandbox to najczęstszy błąd produkcyjny
- Walidacja: nie da się włączyć `is_enabled` bez sekretu i webhooka

Migracja z `payment_gateway_config`: tabela jest pusta (formularz nigdy nie zapisał poprawnie — wysyła kolumny `pos_id` i `is_sandbox`, których w niej nie ma), więc przenoszenie danych zbędne. Tylko podmiana tabeli i formularza.

---

## 2. Docelowa struktura pod-zakładek

Kolejność w UI = kolejność konfiguracji przy pierwszym uruchomieniu.

| # | Zakładka | Status | Zawartość |
|---|---|---|---|
| 1 | **Bramki** | przepisać | jw. |
| 2 | **Funkcje** *(nowa)* | dodać | CRUD `billing_features`. Klucz, nazwa, opis, on/off vs metered, jednostka. Nie mylić z top-level zakładką Funkcje (`feature_toggles`) — to feature flagi portalu, zostają osobno |
| 3 | **Plany** *(nowa — krytyczna)* | dodać | CRUD `billing_plans` + macierz `plan × feature` z limitami. Cena netto/brutto/VAT, interwał, trial, `stripe_price_id`. Przycisk **„Synchronizuj ze Stripe"**. Bez tego cennik = deploy |
| 4 | **Pakiety** | przepisać | jednorazówki: ogłoszenie, aukcja, pakiet SMS, foto AI, kredyty pojazdowe. Dziś tylko odczyt `credit_packages` |
| 5 | **Kredyty** | zweryfikować | po #28 idzie przez `payment-core` z rolą |
| 6 | **Subskrypcje** | zbudować | dziś placeholder „Wkrótce". Lista tenantów: plan, status, okres, MRR. Akcje admina → `billing_events` z `source='manual'` i user_id |
| 7 | **Historia** | przepisać | dziś pokazuje tylko własne płatności admina (brak polityki SELECT — naprawiane w #26). Docelowo filtry, zwrot → korekta, export CSV |
| 8 | **Kody promo** | zostawić | działa. Zawęzić SELECT — dziś `USING (true)` dla każdego zalogowanego |
| 9 | **Zdarzenia** *(nowa)* | dodać | log `billing_events`: provider, typ, czas, status. Podgląd payloadu, **retry ręczny**. Bez tego nieprzetworzony webhook = niewidoczna utrata płatności |
| 10 | **Ustawienia** *(nowa)* | dodać | domyślny VAT, opłata serwisowa (flat + on/off), grace period, trial, auto-faktura po `invoice.paid`, KSeF, adresy powiadomień |

---

## 3. Zasady implementacji

- Wszystkie zapisy przez edge `billing-admin-*` z `service_role`. Tabele billingowe: zero polityk INSERT/UPDATE dla `authenticated` — spójne z lockdownem #26
- Uprawnienie do sekcji: rola `platform_admin`, sprawdzana serwerowo, nie ukryciem zakładki. `OWNER_EMAILS` zaszyte w 7 plikach jako gating po stronie przeglądarki — przenieść na rolę w bazie przy tej okazji
- Każda zmiana planu/ceny/feature → wpis audytowy (kto, co, kiedy, przed/po). Przy sporze o cenę to jedyny dowód
- Zmiana ceny planu **nie zmienia** ceny istniejących subskrypcji — Stripe trzyma cenę per `price_id`. Nowa cena = nowy `price_id`. UI ma to komunikować
- Usunięcie planu = `is_active = false`, nigdy DELETE, gdy ktoś go używa
- Wyłączenie feature'a z planu odbiera dostęp aktywnym — potwierdzenie z licznikiem („dotyczy 14 firm")

---

## 4. Test akceptacyjny

1. Świeży admin: Bramki → Stripe sandbox → sekret → webhook → test zielony
2. Funkcje → `modul_rental`. Plany → nowy plan + feature. Sync ze Stripe → `price_id` zapisany
3. Testowy tenant kupuje → Subskrypcje `active`, Historia pokazuje płatność, Zdarzenia `checkout.session.completed` przetworzone
4. Admin ręcznie przedłuża → widoczne w logu z user_id
5. Symulowany błąd webhooka → widoczny w Zdarzeniach → retry → przetworzony
6. Sekret NIE wraca żadnym zapytaniem z tokenem admina (Network)
7. Pusta konfiguracja bramki → `init` zwraca `GATEWAY_NOT_CONFIGURED`, nie przyznaje produktu

---

## 5. Dane wejściowe do `billing_plans`

Cennik jest w repo, gałąź `feat/cennik-porownanie-warsztat` (w main):
- Warsztat: 0 / 89 / 169 / indywidualny
- Agent AI: 139 / 289
- Bundle MAX: 289

Brać stamtąd, nie wymyślać od nowa.

---

## 6. Ustalenia z audytu, które dotyczą tego panelu

- **Magazyn SMS**: jeden — `service_providers.sms_balance`. `processPaymentSuccess` pisze dziś do `user_credits` z `credit_type='sms'`, czyli tam, gdzie nikt nie czyta. Docelowo wydzielenie do `provider_sms_balance`
- **`upsertCredits`** pisze do nieistniejących kolumn (`balance`, `credit_type` zamiast `credits_balance`) — naprawa przy billingu
- **Brak `product_type`** dla kredytów pojazdowych — jedynej rzeczy, którą użytkownicy próbowali kupować. Dodać
- **Ścieżka symulacji** w `handleInit` (linia 202) — do usunięcia przy billingu. Twardy `GATEWAY_NOT_CONFIGURED` dodany w #29
