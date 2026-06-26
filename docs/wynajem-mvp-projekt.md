# Moduł WYNAJEM — Projekt Fazy 1 (MVP) · **wersja 2**
### Propozycja do akceptacji · ZERO kodu / ZERO migracji · stan repo 2026‑06‑26

## Changelog v1 → v2
- **R1 — płatności:** odstąpiono od rozszerzania `payments`. Nowa **osobna tabela `rental_payments`** (polimorfizm `source_type/source_id`); istniejący P24/`payment-core` = adapter **GATEWAY w Fazie 2**. Wspólny interfejs `PaymentAdapter` zostaje. (pkt 5, R1)
- **Warstwa zdarzeń — rozstrzygnięto:** wzorzec **outbox + `pg_cron` poller** jako trakt główny, `pg_notify` jako opcjonalny akcelerator. Dodano **gwarancję idempotencji** (claim + `event_handler_runs` z UNIQUE). (pkt 1.2/1.3)
- **Uprawnienia — jeden helper:** funkcja `can_use_module(company_id, module_key)` łącząca AND trzech warstw w **udokumentowanej kolejności**, brak rozsiewania logiki. (pkt 1.4)
- **GPS — dodano `rental_gps_track`** per najem (trasa = część łańcucha dowodowego). (pkt 4 + 11)
- **Google Calendar — dodano dwukierunkowy sync** (reuse `agent_calendar_tokens`); zajętość z Google blokuje sloty w `rental-availability`. (nowy pkt 2.5 + 7a)
- **Sekwencja:** Google Calendar sync wstawiony **po rdzeniu+dostępności** (krok 3). (pkt 15)
- Doprecyzowano rozróżnienie najem‑Uber (zostaje we Flocie/Rozliczeniach) vs najem komercyjny (nowy moduł) — brak kolizji dostępności. (pkt 0)

---

## 0. Streszczenie i kluczowe decyzje

| # | Decyzja | Uzasadnienie |
|---|---------|-------------|
| D1 | Nowy silnik = nowe tabele. Stara flota zostaje na `vehicle_rentals`. | Ogr. #1 + #2; brak kolizji statusów/FK. |
| D2 | `bookings` kopiuje **kształt** `service_bookings` (oryginału nie ruszamy). | Ogr. #2. |
| D3 | Kanon statusów = słownik `service_bookings`, lock na starcie. | Ogr. #3. |
| D4 | Entitlementy per‑company (`company_modules`) + **outbox‑events**. | Modularność = priorytet #1; graceful degradation. |
| D5 | **`rental_payments` osobno**, P24 = GATEWAY adapter Faza 2. | R1 — zero regresji marketplace. |
| D6 | Flaga `companies.uses_new_rental_engine` (+ rollback). | Ogr. #1, współistnienie. |

**Dwa rozłączne światy najmu (potwierdzone):**
- *Najem kierowcy Uber* — długoterminowy, auto przypisane, stawka potrącana w settlemencie → **zostaje w Rozliczeniach/Flocie, bez zmian**.
- *Wynajem komercyjny* — okres od–do, płatność, umowa, kaucja, protokół → **ten nowy moduł**.

Auto przypisane kierowcy nie idzie na wynajem komercyjny → **brak kolizji dostępności**. Wspólny mianownik = ten sam fizyczny pojazd → uzasadnia polimorficzny `rental_subjects`.

---

## 1. Modularność — warstwa zdarzeń + entitlementy (priorytet #1)

### 1.1 Entitlementy per‑company
```
company_modules
  company_id  FK companies
  module_key  TEXT   -- 'rental'|'invoicing'|'payments'|'calendar'|'gielda'|'telematics'
  enabled     BOOL
  trial_until TIMESTAMPTZ NULL
  settings    JSONB  -- np. reminder_days_before, auto_extend_days
  PRIMARY KEY (company_id, module_key)
```
Nie zastępuje globalnych `feature_toggles` / `module_visibility` — to nowa warstwa „co dana firma ma włączone".

### 1.2 Warstwa zdarzeń — **wzorzec OUTBOX + `pg_cron` poller** (rozstrzygnięcie)

**Wybór: `pg_cron` poller jako trakt główny, `pg_notify` jako opcjonalny akcelerator.**

Uzasadnienie (niezawodność vs latencja):
- **`pg_notify` sam w sobie jest ulotny** — jeśli w chwili `NOTIFY` żaden listener nie jest podłączony (restart edge runtime, deploy, chwilowy brak połączenia), powiadomienie **przepada bezpowrotnie**. Dla łańcucha „rezerwacja → faktura → płatność" utrata zdarzenia = brak faktury. Niedopuszczalne.
- **Outbox** = zdarzenia są **trwałym wierszem w tabeli** (`domain_events`), a nie sygnałem. To źródło prawdy.
- **`pg_cron` poller** (co 1 min) odpytuje `domain_events` o `status='pending'` i przetwarza. Przeżywa restarty, deploye, ma wbudowany retry (nieprzetworzone zostają `pending`). **Niezawodność > latencja** — dla faktury/płatności minuta opóźnienia jest akceptowalna.
- **`pg_notify` = opcjonalny przyspieszacz**: trigger na INSERT do `domain_events` budzi dispatcher natychmiast (latencja ~sekundy), ale **poller i tak gwarantuje dostarczenie**, gdyby notify przepadł. Najlepsze z obu: niska latencja w happy‑path, twarda gwarancja w tle.

```
domain_events                         (OUTBOX — trwałe źródło prawdy)
  id          UUID
  company_id  FK companies
  event_key   TEXT   -- 'rezerwacja_potwierdzona'|'auto_wydane'|'auto_zwrocone'|'platnosc_oplacona'
  source_type TEXT   source_id UUID
  payload     JSONB
  status      TEXT   -- 'pending'|'processing'|'done'|'failed'
  attempts    INT
  locked_at   TIMESTAMPTZ NULL
  created_at / processed_at

event_handler_runs                    (gwarancja idempotencji)
  event_id    FK domain_events
  handler_key TEXT
  status      TEXT   -- 'done'|'failed'
  result      JSONB
  created_at
  UNIQUE (event_id, handler_key)      -- handler odpala się raz na event
```

**Idempotencja dispatchera — trzy warstwy:**
1. **Atomic claim:** dispatcher pobiera porcję przez `UPDATE domain_events SET status='processing', locked_at=now() WHERE id IN (SELECT id FROM domain_events WHERE status='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT N) RETURNING *`. `SKIP LOCKED` → dwa równoległe pollery nie wezmą tego samego eventu.
2. **Run‑guard:** przed wykonaniem handlera INSERT do `event_handler_runs (event_id, handler_key)`; UNIQUE blokuje powtórkę nawet przy retry/dwóch pollerach — handler dla danego eventu wykona się **dokładnie raz**.
3. **Idempotentny efekt:** dodatkowo skutki mają klucz naturalny (np. UNIQUE „jedna faktura per booking", „jeden payment_link aktywny per booking") — nawet gdyby coś przeszło dwa razy, baza odbije duplikat.

Po sukcesie: `status='done'`. Po błędzie: `status='failed'`, `attempts++`, ponowienie przez poller z backoffem; po N próbach → kolejka „dead letter" (widoczna w UI admina).

### 1.3 Dispatcher + graceful degradation
Poller → dla `event_key` bierze listę handlerów z rejestru → dla każdego sprawdza **`can_use_module(company_id, module_key)`** (pkt 1.4):
- moduł włączony → handler (edge function) wykonuje krok, zapis w `event_handler_runs`,
- moduł wyłączony → **skip** (zapis `status='skipped'`), nic się nie wywala.

**Worked example:**
```
booking → confirmed → INSERT domain_events('rezerwacja_potwierdzona')
poller (≤1 min, lub pg_notify natychmiast):
  ├─ handler:invoice   can_use_module(co,'invoicing')? → invoice draft : skip
  └─ handler:payment   can_use_module(co,'payments')?  → rental_payments + payment_link + mail : skip
klient → link (confirmation_token) → operator klika „opłacono" → rental_payments.status='paid'
  → INSERT domain_events('platnosc_oplacona')
poller:
  └─ handler:invoice → invoice.paid → (KSeF on?) ksef-integration
```

### 1.4 Uprawnienia — **JEDEN helper RLS** (rozstrzygnięcie)
Trzy istniejące warstwy łączymy w jednej funkcji SQL, z udokumentowaną kolejnością — logika **nie jest rozsiewana** po kodzie/RLS:

```
FUNCTION can_use_module(p_company_id UUID, p_module_key TEXT) RETURNS BOOL
  -- Kolejność AND (od najtańszego/najszerszego kill-switcha do najwęższego):
  -- 1. PLATFORMA: feature_toggles.is_enabled(module_key)         -- globalny wyłącznik
  -- 2. FIRMA:    company_modules.enabled OR trial_until > now()  -- co firma ma wykupione
  -- 3. ROLA:     module_visibility.is_active                      -- moduł aktywny w ogóle
  --              AND auth.uid() ma rolę z module_visibility.visible_to_roles[]
  RETURN  platform_enabled AND company_entitled AND role_visible;
```
- **Kolejność uzasadniona:** globalny kill‑switch (1) ucina najszybciej i najszerzej; entitlement firmy (2) to sedno modularności; widoczność wg roli (3) jest najwęższa (per‑użytkownik). Short‑circuit AND = najtańsze sprawdzenie pierwsze.
- Używana **wszędzie** jednakowo: w RLS policy nowych tabel (`USING (can_use_module(company_id,'rental'))`), w dispatcherze (decyzja skip/run), w UI (pokaż/ukryj kafelek). Jedno źródło prawdy.

---

## 2. Rdzeń danych

### 2.1 Polimorfizm rodzic + realny FK dziecka
```
rental_subjects (rodzic)
  id PK, owner_company_id FK companies
  subject_kind TEXT      -- 'vehicle'|'equipment'|'other'
  title, status          -- 'available'|'maintenance'|'retired'
  attributes JSONB
  -- TELEMATYKA (provider-agnostic, ostatni stan):
  telematics_provider TEXT NULL  -- 'solid'|'icar'|...
  device_id TEXT NULL
  last_location JSONB NULL  last_mileage NUMERIC NULL  last_seen_at TIMESTAMPTZ NULL

rental_vehicles (dziecko — REALNY FK 1:1)
  subject_id PK FK rental_subjects(id) ON DELETE CASCADE   -- UNIQUE = 1:1
  vehicle_id FK vehicles NULL    -- opc. podpięcie istniejącego pojazdu floty
  brand/model/plate/vin/year
```
`subject_kind` na rodzicu dyskryminuje, które dziecko istnieje; dla `equipment/other` analogiczne tabele dochodzą bez ruszania rodzica.

### 2.2 `bookings` (kształt `service_bookings`, okres jako timestamptz)
```
bookings
  id, booking_number (auto), company_id, subject_id FK rental_subjects, listing_id NULL
  renter_user_id NULL, renter_name, renter_phone, renter_email
  period_start TIMESTAMPTZ, period_end TIMESTAMPTZ        -- ZMIANA vs date+time+duration
  rate_basis TEXT('hour'|'day'|'week'|'month'), rate_amount, estimated_price, final_price, deposit_amount
  status TEXT (KANON), source TEXT('calendar'|'gielda'|'uslugi')
  confirmation_token TEXT UNIQUE DEFAULT gen_random_uuid()::text
  external_calendar_event_id TEXT NULL                    -- powiązanie z Google (pkt 2.5)
  created_at, confirmed_at, started_at, completed_at, cancelled_at, updated_at
```

### 2.3 Kanon statusów (LOCK)
```
new → pending_confirmation → confirmed → in_progress → completed
                                      ↘ cancelled  ↘ no_show
```
`in_progress` = wydane/trwa; `completed` = zwrócone i rozliczone. Stara `vehicle_rentals` ma własny słownik — **nie unifikujemy**.

### 2.4 Adapter dostępności (`rental-availability`)
Nowa funkcja parametryzowana `subject_id` (nie `service_provider`); liczy **wolne interwały** metodą overlap z `bookings(confirmed/in_progress)` danego subjectu + blokady serwisowe + opcjonalne `subject_working_hours` (godziny wydań/zwrotów). Reużywa logikę nakładania zakresów ze slotownika usług; odrzuca część provider‑specific (dziś czyta legacy `workshop_client_bookings`).

### 2.5 **Google Calendar — dwukierunkowy sync** (nowe)
Reuse OAuth z Nieruchomości: `agent_calendar_tokens` → uogólniamy do `company_calendar_tokens (company_id, provider='google', access/refresh, expiry, calendar_id)`.

**Kierunek A — GetRido → Google (push):** handler na `domain_events('rezerwacja_potwierdzona' / zmiana / anulacja)` tworzy/aktualizuje/usuwa event w Google; `bookings.external_calendar_event_id` trzyma id eventu (idempotentny upsert — przy retry update, nie duplikat).

**Kierunek B — Google → GetRido (busy blokuje sloty):** `rental-availability` przy liczeniu wolnych interwałów **dociąga zajętość z Google** (FreeBusy API) dla skojarzonego kalendarza i traktuje ją jak zajęty zakres → operator nie zarezerwuje na termin, w którym auto/zasób jest zajęte poza GetRido. Sync inkrementalny przez `pg_cron` (webhook push Google = Faza 2). Dzięki temu **wszystkie rezerwacje lądują w jednym kalendarzu**, a dostępność jest pełna dla operatora.

---

## 3. Cennik
```
rental_rate_cards: subject_id|listing_id, currency, rate_hour/day/week/month NULL
rental_rate_tiers: rate_card_id, unit('day'|'week'|'month'), min_duration INT, price  -- stawka malejąca
```
Stawka **edytowalna per najem** → snapshot na `bookings.rate_basis/rate_amount` (niezależny od późniejszych zmian cennika). Silnik wybiera próg wg długości; operator może nadpisać.

---

## 4. Łańcuch dowodowy (anti‑chargeback) — serce modułu

Reuse `RentalPhotoProtocol` (foto datowane, bucket `driver-documents`, kompresja) + `contract_signature_logs` (audyt IP/UA). Dokładamy strukturę pozycyjną **i trasę GPS**.
```
rental_protocols       : id, booking_id, phase('handover'|'return'), mileage, fuel_level,
                         completed_at, signed_summary_at, created_by
rental_protocol_photos : protocol_id, category, file_url, taken_at
rental_damages         : booking_id, phase, description, location_label, severity, cost_estimate, photo_url
rental_gps_track       : id, booking_id, points JSONB (lub geography), speed, ts, provider   -- NOWE (pkt 11)
```
Sześcioelementowy dowód produkowany sam przy każdym najmie:
1. foto **wydania** (datowane) · 2. **umowa** (podpis) · 3. **oddzielny podpis streszczenia** warunków (`contract_signature_logs.action_type='terms_summary_signed'`) · 4. **kaucja** · 5. foto **zwrotu** + porównanie → nowe szkody → potrącenie z kaucji · 6. **historia GPS** (`rental_gps_track`: gdzie był, jak szybko, w okresie najmu).

**Cała historia per najem na jednym widoku** = tarcza operatora w sporze. Wizualna mapa szkód (hotspoty) = Faza 2; MVP: foto + lista pozycyjna.

---

## 5. Płatności — globalna warstwa platformy (MVP = RĘCZNY)

### R1 — rozstrzygnięcie i uzasadnienie
**NIE modyfikujemy istniejącej `payments`** — używa jej marketplace (kredyty, wyróżnienia, InPost), zmiana kolumn/semantyki = realne ryzyko regresji w działającym przepływie P24. Tworzymy **osobną `rental_payments`** (docelowo `platform_payments` jako wspólna warstwa, z której skorzystają też warsztat/usługi). Istniejący `payment-core`/`payment-core-webhook` (P24) podłączamy **jako adapter GATEWAY w Fazie 2** — kod P24 zostaje nietknięty, my go tylko wołamy przez interfejs.

```
rental_payments
  id, company_id
  amount, currency, status('pending'|'paid'|'refunded'|'cancelled')
  kind  TEXT('oplata'|'kaucja'|'zwrot')
  method TEXT('reczna'|'bramka')
  source_type TEXT, source_id UUID            -- polimorfizm ('booking', później 'invoice'...)
  gateway, gateway_session_id, gateway_transaction_id   -- wypełniane gdy method='bramka' (Faza 2)
payment_links       : payment_id, token, url, expires_at, sent_at
payment_events_log  : payment_id, event, actor_type, metadata JSONB, created_at
```

### 5.1 Interfejs adaptera — dwa tryby
```
PaymentAdapter:
  createPayment(kind, amount, source) -> rental_payment + payment_link
  confirm(payment) -> status='paid' + INSERT domain_events('platnosc_oplacona')
```
- **MANUAL** (MVP, zostaje na stałe — gotówka/przelew): rekord + link → operator klika „opłacono" → `paid` → event.
- **GATEWAY** (Faza 2): ten sam interfejs, `confirm` woła **istniejący `payment-core-webhook` P24**. Wybór bramki osobno (Daniel). Teraz **nie integrujemy żadnej** — tylko miejsce.

### 5.2 Kaucja (MVP)
`rental_payments(kind='kaucja')` ze statusami klikanymi przez operatora: `pobrana/zwrócona/potrącona` (potrącenie → `kind='zwrot'` na resztę). Pre‑auth (pre‑auth hold) = Faza 2, wymaga bramki.

### 5.3 Izolacja
Wynajem woła płatności **przez zdarzenia, nie zna metody**. Faktura/KSeF podpina się przez `platnosc_oplacona` — identycznie dla ręcznego i bramki.

---

## 6. Zwrot / brak zwrotu
- **Domknięcie zwrotu (dziś brak):** `pg_cron` na `period_end` → porównanie foto handover↔return → rozliczenie kaucji → faktura końcowa → `status=completed` + (jeśli GPS) zaciągnięcie przebiegu z `rental_gps_track`/`last_mileage`.
- **Kontynuacja najmu:** nowy okres → wycena z `rental_rate_cards`/ręcznie → `payment_link` → potwierdzenie (ręczne MVP) → status → auto‑faktura. Opcja: automat X dni przed końcem (`company_modules['rental'].settings.auto_extend_days`).

---

## 7. Przypomnienia
Reuse `rental-payment-reminders` + `fleet_sms_templates` + `send-sms` (JustSend/SMSAPI). Wyciągamy zahardkodowane „3 dni" do `company_modules['rental'].settings.reminder_days_before` (edytowalne). Placeholdery szablonu reużyte.

## 7a. Co operator widzi (kalendarz scalony)
Wszystkie rezerwacje (GetRido + Google, pkt 2.5) w jednym kalendarzu; edycja terminu po stronie GetRido → push do Google; zajętość z Google → blokada slotów w `rental-availability`. Most giełda→rezerwacja (pkt 9) z priorytetem własnego kalendarza.

---

## 8. Umowa przez AI
Fundament: `rentalContractGenerator` + `RentalContractViewer` + `RentalClientPortal` (`portal_access_token`, scroll→checkboxy→`SignaturePad`→upload→`contract_signature_logs`). Dokładamy `rental_contract_templates (company_id, name, body_html, data_schema JSONB)`. Flow: klient wgrywa dokument → edge AI (wzorzec `ai-*`, model z `aiModels.ts`) analizuje → wzór + edytowalna tabliczka danych → załącza foto/skany → podpis (istniejący) → druk/mail/podpis u nas.

---

## 9. Giełda jako baza NIE‑modułowa
Wypożyczalnia = karta w Usługach (`service_providers`, ma `company_id`). Ogłoszenia auto‑trafiają na portal (`vehicle_listings`) przez handler zdarzenia. Dwa wejścia: ogłoszenie + rezerwacja w usługach. Rezerwacje z giełdy: wzorzec **zatwierdź/odrzuć** (`bookings.status new→pending_confirmation`), priorytet własnego kalendarza (adapter dostępności sprawdza kolizje z `confirmed/in_progress` + busy Google).

---

## 10. UI / Nawigacja
Styl Warsztatu (reuse `WorkshopDashboard` + `WorkshopSidebar`): siatka kafelków na wejściu (Flota/Przedmioty, Kalendarz, Zlecenia na wynajem, Cennik, Płatności, Raporty) + boczny rail. **„Zlecenia na wynajem"** = analog `workshop_orders`, karta najmu z zakładkami: foto · protokół · szkody · trasa GPS · podsumowanie · umowa · link płatniczy + ręczne „opłacono". Pierwsze logowanie: wybór modułów → `company_modules` (wszystkie ON do testów / podzbiór), reuse `OnboardingContext/Widget` (+ moduł `'rental'`, toury). Opcjonalny RidoAI‑doradca: „opisz firmę" → proponuje moduły.

---

## 11. GPS / telematyka — adapter (provider‑agnostic) + **trasa per najem**
- Ostatni stan na `rental_subjects` (provider, device_id, last_location, last_mileage, last_seen_at).
- **`rental_gps_track`** (nowe) — historia trasy **per `booking_id`** (points, speed, ts): „gdzie był, jak szybko" w okresie najmu → integralna część łańcucha dowodowego (pkt 4) i auto‑zaciąganie przebiegu przy zwrocie (pkt 6).
- **Adapter telematyczny** (interfejs): pierwszy provider Solid/iCar; inni (Cartrack/Autoguard) dokładani bez zmian w module. **MVP: samo miejsce w modelu + interfejs**; faktyczne pobieranie/wizualizacja trasy gdy Daniel pozyska spec API iCar (`auto@solidsecurity.pl`).

---

## 12. Współistnienie ścieżek + rollback
`companies.uses_new_rental_engine BOOL DEFAULT false`. Stare flotowe = `false` → `vehicle_rentals`/`FleetRentalsTab` (bez zmian). Nowe rejestracje = `true` → nowy silnik. Przepięcie starych: narzędzie **kopiujące** (nie przenoszące), idempotentne, per‑firma. Rollback = flaga `false` (stare dane nietknięte).

---

## 13. Co reużyte / co nowe

**♻️ Reużyte:** `service_bookings` (kształt+słownik) · `booking-available-slots`/`service_working_hours`/`service_resources` (logika overlap) · `rentalContractGenerator`/`RentalContractViewer`/`RentalClientPortal`/`contract_signature_logs` · `RentalPhotoProtocol`+bucket `driver-documents` · `rental-payment-reminders`/`fleet_sms_templates`/`send-sms` · `confirmation_token` (wzorzec z `viewing_slots`) · `invoices`/`get_next_auto_invoice_number()`/`ksef-integration`/`invoice-pdf` · **`payment-core`/`payment-core-webhook` (P24) — jako GATEWAY w Fazie 2** · `service_providers`/`companies`/`company_members` · `WorkshopDashboard`/`WorkshopSidebar`/`WorkshopOrderDetail` · `OnboardingContext`/`Widget` · `vehicle_listings` · **`agent_calendar_tokens` (OAuth Google) → uogólnione**.

**🆕 Nowe:**
- Tabele: `company_modules`, `domain_events`, `event_handler_runs`, `rental_subjects`, `rental_vehicles`, `bookings`, `rental_rate_cards`, `rental_rate_tiers`, `rental_protocols`, `rental_protocol_photos`, `rental_damages`, **`rental_gps_track`**, **`rental_payments`**, `payment_links`, `payment_events_log`, `rental_contract_templates`, `company_calendar_tokens` (uogólnienie).
- Funkcje SQL: **`can_use_module()`**.
- Edge functions: `dispatcher` (poller), `rental-availability` (+ FreeBusy Google), handlery (faktura/płatność/kalendarz‑push/przypomnienie), AI‑analiza umowy.
- Flaga: `companies.uses_new_rental_engine`.
- UI: moduł Wynajem (tile+rail), „Zlecenia na wynajem", wybór modułów.

---

## 14. Szkic ERD
```
companies ─┬─< company_modules (entitlementy)
           ├─< company_members
           ├─< company_calendar_tokens (Google OAuth, z agent_calendar_tokens)
           ├─ uses_new_rental_engine (flaga)
           └─< rental_subjects ──1:1── rental_vehicles ──opc.──> vehicles
                    │ (subject_kind, telematyka: last_location/mileage/seen)
                    ├─< rental_rate_cards ─< rental_rate_tiers
                    └─< bookings  (KSZTAŁT service_bookings; status=KANON; external_calendar_event_id)
                          ├─< rental_protocols ─< rental_protocol_photos
                          ├─< rental_damages (handover|return)
                          ├─< rental_gps_track (trasa per najem)            ← łańcuch dowodowy
                          ├─< rental_payments (kind/method; source=booking) ─< payment_links / payment_events_log
                          ├─ umowa → contract_signature_logs        (reuse)
                          └─ faktura → invoices → ksef-integration   (reuse, przez event)

domain_events (OUTBOX) ──pg_cron poller (+pg_notify akcelerator)──> dispatcher
     dispatcher: can_use_module(company_id, module_key)? → handler : skip
     event_handler_runs UNIQUE(event_id, handler_key)  → idempotencja
     handlery: invoice · payment · calendar_push · reminder

[STARA ŚCIEŻKA, nietknięta]  fleets ─< vehicle_rentals (własny słownik) ─< vehicles/drivers
[ISTNIEJE, nietknięte]       payments + payment-core (P24)  → podłączane jako GATEWAY w Fazie 2
```

---

## 15. Ryzyka migracji

| # | Ryzyko | Mitygacja |
|---|--------|-----------|
| R1 | Modyfikacja `payments` → regresja marketplace. | **Osobna `rental_payments`**; P24 jako GATEWAY Faza 2. (rozstrzygnięte) |
| R2 | Kolizja nazwy „rental" / inny słownik `vehicle_rentals`. | Tabela `bookings`; ścieżki rozdzielone flagą; brak unifikacji słowników. |
| R3 | `driver_rental_documents` może nie istnieć w migracjach. | Własne `rental_protocol_photos`; zweryfikować przed budową. |
| R4 | Niespójność 3 warstw uprawnień. | **Jeden `can_use_module()`** w udokumentowanej kolejności. (rozstrzygnięte) |
| R5 | Anchor `company_id` (wzorzec 20260620_A2) niejednolity; flota na `fleet_id`. | Nowe tabele konsekwentnie `company_id`; mapowanie fleet→company w narzędziu przepięcia. |
| R6 | Odwracalność migracji stare→nowe. | Kopiująca, idempotentna, per‑firma; rollback = flaga. |
| R7 | Utrata zdarzenia (gdyby tylko pg_notify). | **Outbox + poller** = trwałość; notify tylko akcelerator. (rozstrzygnięte) |
| R8 | Podwójne przetworzenie eventu (retry/2 pollery). | Atomic claim `FOR UPDATE SKIP LOCKED` + `event_handler_runs` UNIQUE + idempotentne efekty. |
| R9 | Google token wygasa / brak refresh → sync pada cicho. | `company_calendar_tokens` z refresh + retry; błąd sync widoczny w UI, nie blokuje rezerwacji lokalnej. |
| R10 | `rental-availability` legacy czyta `workshop_client_bookings`. | Nowa funkcja od zera na `bookings` + FreeBusy Google; tylko logika overlap reużyta. |
| R11 | PWA NetworkFirst cache 24h serwuje stale kształty. | Świadomość przy zmianie shape; ew. bump cache key. |
| R12 | `verify_jwt=false` — funkcje same autoryzują. | Każdy handler waliduje token/source + `can_use_module` przed akcją. |

---

## 16. Sekwencja wdrożenia (zaktualizowana — Google Calendar po rdzeniu)

1. **Fundament modularności:** `company_modules` + `domain_events`/`event_handler_runs` + dispatcher (outbox poller, idempotencja) + `can_use_module()`.
2. **Rdzeń + dostępność:** `rental_subjects`/`rental_vehicles` + `bookings` (kanon) + `rental-availability`.
3. **⭐ Google Calendar dwukierunkowy sync** (push rezerwacji + FreeBusy blokuje sloty) — *wstawione tu zgodnie z zaleceniem: dostępność bez kalendarza zewnętrznego jest niepełna dla operatora.*
4. **Cennik** + UI tile/rail + „Zlecenia na wynajem".
5. **Łańcuch dowodowy:** protokoły + szkody + oddzielny podpis streszczenia + `rental_gps_track` (miejsce + interfejs adaptera).
6. **Płatności MANUAL** (`rental_payments` + `PaymentAdapter`) + kaucja ręczna.
7. **Eventy → Faktura/KSeF** + przypomnienia (konfigurowalne dni).
8. **Domknięcie zwrotu** (cron) + kontynuacja najmu.
9. **Giełda/listing** + zatwierdź/odrzuć + onboarding wyboru modułów.
10. **Flaga `uses_new_rental_engine`** + narzędzie przepięcia (rollback‑safe).

**Faza 2:** bramka P24 (GATEWAY przez istniejący `payment-core`), pre‑auth kaucji, wizualna mapa szkód, webhook push Google + iCal/channel manager, dynamic pricing, add‑ony, wizualizacja trasy GPS (po spec API iCar), kolejne `subject_kind`.
