-- Trzy tabele przechowalni opon poza bramką zapisu.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO BYŁO OTWARTE
-- ═══════════════════════════════════════════════════════════════════════════
--   `workshop_tire_pricing`           — cennik przechowywania
--   `workshop_tire_reminder_log`      — dziennik przypomnień
--   `workshop_tire_storage_settings`  — ustawienia modułu
--
-- Wszystkie trzy powstały wraz z modułem przechowalni (23.08) i żadna nie
-- trafiła do `warsztat_tabele_wprost()`. Warsztat BEZ opłaconej subskrypcji
-- mógł do nich pisać — a przechowalnia opon jest funkcją planów płatnych
-- (`tire_storage` w macierzy planów Standard i Pro).
--
-- Praktycznie znaczyło to tyle: sama `workshop_tire_storage` była zamknięta,
-- więc wpisu przechowywania nie dało się założyć, ale cennik, ustawienia
-- i dziennik przypomnień — owszem. Dziura wąska, ale to nadal zapis do
-- płatnego modułu bez płacenia.
--
-- Wykryte testem `bramkaKompletna_test.ts`, który po to powstał: sprawdza,
-- czy KAŻDA tabela warsztatowa z `provider_id` jest albo w bramce, albo
-- na jawnej liście wyjątków z uzasadnieniem. Test świecił na czerwono także
-- na `main` — wyszło przy przygotowaniu gałęzi do scalenia.
--
-- Ta migracja NIE zmienia modułu przechowalni. Dokłada wyłącznie trzy nazwy
-- do listy, którą bramka i tak czyta.

BEGIN;

CREATE OR REPLACE FUNCTION public.warsztat_tabele_wprost()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $FUNKCJA$
  SELECT ARRAY[
    'workshop_orders', 'workshop_clients', 'workshop_vehicles',
    'workshop_cash_closures', 'workshop_expenses', 'workshop_recurring_costs',
    'workshop_finance_settings', 'workshop_payments',
    'workshop_employees', 'workshop_employee_invitations',
    'workshop_employee_findings', 'workshop_employee_notifications',
    'workshop_employee_payouts', 'workshop_mechanics',
    'workshop_stations', 'workshop_station_employees', 'workshop_workstations',
    'workshop_service_points', 'workshop_tire_storage',
    'workshop_order_assignments', 'workshop_order_statuses',
    'workshop_status_settings', 'workshop_order_sequences',
    'workshop_parts_integrations', 'workshop_parts_orders',
    'workshop_calendar_settings',
    -- ⬇ dołożone 23.08 wraz z modułem przechowalni opon
    'workshop_tire_pricing', 'workshop_tire_reminder_log',
    'workshop_tire_storage_settings'
  ];
$FUNKCJA$;

DO $KONTROLA$
DECLARE v_lista text[]; v_brak text;
BEGIN
  v_lista := public.warsztat_tabele_wprost();

  SELECT string_agg(t, ', ') INTO v_brak
  FROM unnest(ARRAY['workshop_tire_pricing', 'workshop_tire_reminder_log',
                    'workshop_tire_storage_settings']) AS t
  WHERE NOT (v_lista @> ARRAY[t]);

  IF v_brak IS NOT NULL THEN
    RAISE EXCEPTION 'Poza bramką nadal: %', v_brak;
  END IF;

  -- Kontrola, że NICZEGO nie zgubiłem przy przepisywaniu tablicy. Lista jest
  -- wypisana wprost, więc literówka w istniejącej nazwie otworzyłaby tabelę,
  -- która była zamknięta — i nikt by tego nie zauważył.
  IF array_length(v_lista, 1) <> 29 THEN
    RAISE EXCEPTION 'Bramka ma % tabel zamiast 29 — coś wypadło przy przepisywaniu',
      array_length(v_lista, 1);
  END IF;

  IF NOT (v_lista @> ARRAY['workshop_orders', 'workshop_clients', 'workshop_vehicles',
                           'workshop_tire_storage', 'workshop_payments']) THEN
    RAISE EXCEPTION 'Z bramki wypadła któraś z tabel podstawowych';
  END IF;

  RAISE NOTICE 'Bramka zapisu: % tabel warsztatowych.', array_length(v_lista, 1);
END $KONTROLA$;

COMMIT;

NOTIFY pgrst, 'reload schema';
