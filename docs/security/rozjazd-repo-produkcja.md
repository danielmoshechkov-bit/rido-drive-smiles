# Rozjazd repo ↔ produkcja

Pytanie brzmiało: czy `stripe_price_id_target` to wyjątek. **Nie jest.**

Metoda: zbudowany z 669 plików migracji inwentarz tego, co repo **tworzy**
(`CREATE TABLE`, każdy `ADD COLUMN`, `RENAME COLUMN`, widoki), porównany
z inwentarzem tego, co kod **odwołuje** (`.select`, `.eq`, `.insert`, `.update`,
`.upsert`, `.rpc`) w `supabase/functions/**` i `src/**`. Pozycje priorytetowe
sprawdzone ręcznie — przeczytane wywołanie i przeczytana migracja.

---

## 🔴 Najgorsze: świeże środowisko nie postawi się w ogóle

`supabase db reset` **przerwie się w trakcie migracji**, zanim aplikacja
w ogóle wystartuje. Powód: migracje odwołują się do tabel, których żadna
migracja nie tworzy.

| Co | Gdzie | Skutek |
|---|---|---|
| `product_id UUID REFERENCES public.products(id)` | `20260322210059_8e704c7a…sql:6` | klucz obcy do nieistniejącej tabeli → przerwanie |
| `ALTER TABLE public.purchase_invoices …` | **8 migracji**: `20260325071649`, `20260328074355`, `20260329111709`, `20260403055344`, `20260405133329`, `20260501194349`, `20260628_ksef_purchase_invoice_type_correction`, `20260628_purchase_invoices_soft_delete` | `ALTER` na nieistniejącej tabeli → przerwanie |
| `CREATE POLICY ON public.purchase_invoice_items`, `CREATE INDEX ON public.purchase_invoices` | `20260501194349_edd561c1…sql:19,22` | to samo |

Sprawdzone: `grep "CREATE TABLE.*products\|CREATE TABLE.*purchase_invoices"`
w całym katalogu migracji zwraca **zero**. Obie tabele powstały poza repozytorium.

To znaczy, że **repo nie jest źródłem prawdy o schemacie od dawna** — nie od
`stripe_price_id_target`, tylko co najmniej od marca 2026.

---

## Kolumny odwoływane przez kod, których repo nie tworzy

### W ścieżce billingu — naprawione

| Kolumna | Wołane w | Status |
|---|---|---|
| `billing_plans.stripe_price_id_target` | `billing-stripe-sync:169,205` | dopisane w migracji 4.20 |
| `billing_plans.stripe_product_id` | `billing-stripe-sync:63,169,203` | **dopisane w migracji 4.20** |

Poza tym cała reszta schematu billingowego jest **czysta**: `billing_features`,
`billing_events`, `billing_plan_features`, `billing_subscriptions`,
`billing_usage`, `billing_addon_packs`, `billing_gateways`, `billing_settings`,
`billing_audit_log`, `payments`, `credit_packages`, `user_credits`,
`paid_service_subscriptions`, `vehicle_lookup_*` — zero rozjazdu.

### Warsztat — do rozstrzygnięcia przed wdrożeniem

| Kolumna | Wołane w | Uwaga |
|---|---|---|
| `workshop_settings.provider_id` | `CalendarSettingsPage.tsx:59,107` + `onConflict: 'provider_id'` | `workshop_settings` ma klucz `user_id`; brak też indeksu unikalnego, więc `onConflict` nie ma na czym działać |
| `workshop_settings.calendar_settings` | `CalendarSettingsPage.tsx:108`, `booking-available-slots:58` | brak w migracjach |
| `service_providers.is_active` | `ai-search:137,143` | tabela ma `status`, nigdy `is_active` |
| `service_providers.categories` | `analyze-call:25` | jest `category_id`, nie `categories` |
| `service_price_history.price_net` / `.price_gross` | `RidoPriceModal.tsx:231` | migracja definiuje `last_price_net` / `last_price_gross` — rozjazd nazw |
| `service_reviews.rating_communication` / `.rating_punctuality` | `seed-services-demo:571,572` | migracja dodaje tylko `rating_quality` |

### Tabele odwoływane, których repo nie tworzy

`workshop_order_tasks`, `workshop_order_parts` (`WorkshopEstimatePreviewDialog`),
`purchase_invoices`, `purchase_invoice_items`, `products`, `document_templates`
(istnieje tylko `fleet_document_templates`), `reminders`, `customers` (istnieje
`service_customers`), `admin_bug_reports`, `stock_movements` (istnieje
`inventory_movements`), `driver_rental_documents`, `property_listings` (istnieje
`real_estate_listings`), `vehicle_favorites`, `vehicle_driver_assignments`
(istnieje `driver_vehicle_assignments` — odwrócona kolejność słów),
`ai_agent_access_whitelist`.

### Czysto

- **Wszystkie 42 wołania `.rpc()`** mają odpowiednik wśród 174 funkcji
  tworzonych przez migracje. Zero rozjazdu.
- Żaden `GRANT EXECUTE` nie wskazuje na nieistniejącą funkcję ani rolę.
- Żadna polityka RLS nie woła funkcji, której migracje nie tworzą.

### Domeny poboczne

Rozjazd kolumn wykryty też w: `drivers`, `driver_app_users`, `fleets`,
`general_listings`, `invoices`, `real_estate_*`, `vehicle_listings`,
`workspace_documents`, `settlement_periods`, `sales_leads`, `company_settings`,
`call_queue`, `call_logs`, `ai_price_cache`, `provider_services`. Poza zakresem
billingu — do osobnego przejścia.

---

## Jak rozstrzygnąć, co jest realnym błędem, a co tylko brakiem w repo

Rozjazd oznacza jedno z dwojga: kolumna **istnieje na produkcji** (powstała poza
repozytorium — wtedy aplikacja działa, a repo kłamie), albo **nie istnieje**
(wtedy dana funkcja jest zepsuta i nikt tego nie zauważył). Bez dostępu do bazy
nie da się tego rozróżnić. To zapytanie rozstrzyga wszystko naraz:

```sql
WITH oczekiwane(tabela, kolumna) AS (VALUES
  ('billing_plans','stripe_product_id'),
  ('billing_plans','stripe_price_id_target'),
  ('workshop_settings','provider_id'),
  ('workshop_settings','calendar_settings'),
  ('service_providers','is_active'),
  ('service_providers','categories'),
  ('service_price_history','price_net'),
  ('service_price_history','price_gross'),
  ('service_reviews','rating_communication'),
  ('service_reviews','rating_punctuality')
)
SELECT o.tabela, o.kolumna,
       CASE WHEN c.column_name IS NULL THEN '🔴 NIE MA — kod jest zepsuty'
            ELSE '⚠️ jest, ale poza repo' END AS stan
FROM oczekiwane o
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name=o.tabela AND c.column_name=o.kolumna
ORDER BY stan, o.tabela;

-- To samo dla tabel
WITH oczekiwane(tabela) AS (VALUES
  ('purchase_invoices'),('purchase_invoice_items'),('products'),
  ('workshop_order_tasks'),('workshop_order_parts'),('document_templates'),
  ('reminders'),('customers'),('admin_bug_reports'),('stock_movements'),
  ('driver_rental_documents'),('property_listings'),('vehicle_favorites'),
  ('vehicle_driver_assignments'),('ai_agent_access_whitelist')
)
SELECT o.tabela,
       CASE WHEN t.table_name IS NULL THEN '🔴 NIE MA — kod jest zepsuty'
            ELSE '⚠️ jest, ale poza repo' END AS stan
FROM oczekiwane o
LEFT JOIN information_schema.tables t
  ON t.table_schema='public' AND t.table_name=o.tabela
ORDER BY stan, o.tabela;
```

Dla pozycji oznaczonych `⚠️ jest, ale poza repo` naprawa polega na dopisaniu
`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` do repo — bez ryzyka,
bo na produkcji to nic nie zmieni. Pozycje `🔴 NIE MA` to realnie zepsute
funkcje, do naprawy według tego, czy ktokolwiek ich używa.

---

## Wniosek

Rozjazd nie jest wyjątkiem, tylko stanem normalnym tego repozytorium.
Bezpośrednia przyczyna jest znana i zapisana w `CLAUDE.md`: schemat zmienia
Lovable i ręczne wklejki w SQL Editorze, a pliki migracji powstają osobno.

Dla wdrożenia gatingu ma to jeden praktyczny skutek — **żaden**, bo obie
brakujące kolumny billingowe są już dopisane w migracji 4.20, a reszta schematu
billingowego jest czysta. Dla świeżego środowiska skutek jest poważny: nie
postawi się, dopóki nie powstaną `products` i `purchase_invoices`.
