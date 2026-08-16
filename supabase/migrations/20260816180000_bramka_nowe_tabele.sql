-- Domknięcie bramki zapisu na tabelach dołożonych po wdrożeniu G4.
--
-- POWÓD: `warsztat_zaloz_bramke` chodzi po LIŚCIE tabel, a lista jest statyczna.
-- Każda nowa tabela warsztatowa zostaje poza bramką, dopóki ktoś jej tam nie
-- dopisze — i nikt tego nie zauważy, bo brak polityki nie daje żadnego sygnału.
--
-- `workshop_calendar_settings` powstała 16.08 (ustawienia przypomnień SMS)
-- i jest dokładnie takim przypadkiem: ma `provider_id`, klient ją edytuje,
-- a decyduje o tym, ile SMS-ów wychodzi — czyli o koszcie.

CREATE OR REPLACE FUNCTION public.warsztat_tabele_wprost()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
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
    'workshop_calendar_settings'
  ];
$$;

-- Przebudowa polityk z furtką serwisową administratora (tak jak zostawiło G0).
CALL public.warsztat_zaloz_bramke('public.ma_okno_serwisowe(%KOLUMNA%)');

NOTIFY pgrst, 'reload schema';
