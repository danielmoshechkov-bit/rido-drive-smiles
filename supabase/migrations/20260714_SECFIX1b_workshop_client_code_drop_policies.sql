-- 20260714_SECFIX1b_workshop_client_code_drop_policies.sql
-- =====================================================================
-- SECFIX ETAP 1 — CZĘŚĆ B (DESTRUKCYJNA — wykonać DOPIERO RAZEM z deployem
-- nowego frontu, NIE wcześniej)
-- ---------------------------------------------------------------------
-- Zdejmuje 8 otwartych polityk anon/public, przez które KAŻDY anonim czytał
-- i modyfikował zlecenia/pozycje/PII/podpisy WSZYSTKICH warsztatów. Po tym
-- anon nie ma żadnego bezpośredniego dostępu do tabel — tylko przez
-- SECURITY DEFINER RPC z SECFIX1a (walidujące pełny client_code jako sekret).
--
-- WYMAGANIE KOLEJNOŚCI: nowy front (WorkshopClientCard na RPC) musi być już
-- na produkcji ALBO wchodzić w tym samym oknie. Stary front (zapytania do
-- tabel wprost) po tym DROP-ie pokaże "nie znaleziono".
--
-- Zakłada, że SECFIX1a zostało już wykonane (RPC istnieją). Polityki
-- provider/admin/employee (PERFA3) pozostają nietknięte — panel działa dalej.
-- Idempotentne (DROP POLICY IF EXISTS).
-- =====================================================================

-- workshop_order_items: pełny odczyt wszystkich pozycji (USING true)
DROP POLICY IF EXISTS "Public read order items" ON public.workshop_order_items;

-- workshop_orders: odczyt + ZAPIS dowolnego zlecenia z kodem (anon UPDATE!)
DROP POLICY IF EXISTS "Public read orders by client_code"   ON public.workshop_orders;
DROP POLICY IF EXISTS "Public update orders by client_code" ON public.workshop_orders;

-- workshop_clients / workshop_vehicles: PII + VIN cross-tenant
DROP POLICY IF EXISTS "Public read clients via client_code orders"  ON public.workshop_clients;
DROP POLICY IF EXISTS "Public read vehicles via client_code orders" ON public.workshop_vehicles;

-- workshop_order_signatures: 3 polityki — insert WITH CHECK(true) (fałszowanie
-- podpisu na dowolny order_id), anon read, anon insert dla zleceń z kodem
-- (też pozwalał podpisać cudze zlecenie znając order_id). Podpis tylko przez RPC.
DROP POLICY IF EXISTS "Workshop signatures insertable by anyone with code" ON public.workshop_order_signatures;
DROP POLICY IF EXISTS "Public read signatures via client_code orders"      ON public.workshop_order_signatures;
DROP POLICY IF EXISTS "Public insert signatures for client_code orders"    ON public.workshop_order_signatures;

-- =====================================================================
-- WERYFIKACJA po 1b (oczekiwane: 0 wierszy — brak otwartych polityk anon):
--   SELECT tablename, policyname, roles, cmd FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN ('workshop_orders','workshop_order_items','workshop_clients',
--                       'workshop_vehicles','workshop_order_signatures')
--     AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
--     AND policyname LIKE 'Public%';
-- Oraz jako rola anon (API docs → anon): SELECT z tych tabel → 0 wierszy / brak dostępu;
--   RPC z poprawnym kodem → działa.
-- =====================================================================
-- ROLLBACK 1b (przywraca WYCIEK — tylko awaryjnie): odtworzyć polityki z
-- 20260215200647 (linie 22-23,101-106) i 20260409062458 (całość).
-- =====================================================================
