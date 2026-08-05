-- ============================================================================
-- BILLING — ETAP 2: ZASIEW PLANÓW I FUNKCJI
--
-- Dane wejściowe: src/pages/CennikPage.tsx (sekcje „GetRido Warsztat",
-- „GetRido Agent AI", „Pakiety łączone"). Nazwy pakietów, ceny i przypisanie
-- funkcji wzięte stamtąd, nie wymyślone.
--
-- Ustalenia spoza cennika, zatwierdzone 06.08.2026:
--   * ai_labor_pricing w planie Standard = 30/mc. Cennik nie podaje liczby;
--     ustalone tak, żeby było wyraźnie niżej niż Pro (100), ale użyteczne.
--   * Pakiet 289 zawiera Agenta w wersji PODSTAWOWEJ — bez wielu numerów,
--     analityki rozmów i priorytetu głosu. Inaczej MAX traci sens.
--   * Sieci: limity ustalane per umowa, wpisywane do billing_subscription_limits
--     przy zakładaniu subskrypcji. W planie zostają jako „bez limitu".
--   * Trial to osobny plan trial_max na 14 dni, bo cennik obiecuje „Pro + oba
--     Agenty AI", czyli zakres, którego nie ma żaden pojedynczy plan.
--
-- Wszystkie INSERT-y są idempotentne (ON CONFLICT DO NOTHING / NOT EXISTS).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Uzupełnienie widoczności dla administratora.
--
-- Etap 1 dał na billing_plans i billing_features wyłącznie politykę
-- `USING (is_active)`. Platform_admin też jest `authenticated`, więc nie widziałby
-- planów wyłączonych — a admin-panel.md §3 mówi wprost, że usunięcie planu to
-- is_active = false. Bez tej poprawki dezaktywowany plan znikałby adminowi
-- z panelu i nie dałoby się go przywrócić. Polityki RLS są łączone przez OR,
-- więc to rozszerzenie, nie zmiana dla zwykłych użytkowników.
-- ----------------------------------------------------------------------------
CREATE POLICY billing_plans_select_admin ON public.billing_plans
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role));

CREATE POLICY billing_features_select_admin ON public.billing_features
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role));

-- ----------------------------------------------------------------------------
-- Rola platform_admin dla właściciela platformy.
--
-- Bez niej żadna tabela billingowa nie jest widoczna w panelu — polityki
-- z etapu 1 wymagają tej roli. Docelowo zastąpi OWNER_EMAILS zaszyte w siedmiu
-- plikach frontu (plan.md, decyzja 5).
--
-- WHERE NOT EXISTS zamiast ON CONFLICT: user_roles ma UNIQUE(user_id, role,
-- fleet_id), a przy fleet_id = NULL Postgres traktuje wiersze jako różne, więc
-- ON CONFLICT nie wyłapałby duplikatu przy ponownym uruchomieniu.
-- ----------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'platform_admin'::public.app_role
FROM auth.users u
WHERE u.email = 'daniel.moshechkov@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = u.id
      AND r.role = 'platform_admin'::public.app_role
  );

-- ------------------------------------------------------------ FUNKCJE (29)
INSERT INTO public.billing_features (key, name, description, kind, unit, sort_order) VALUES
  ('workshop_core', 'Baza klientów i pojazdów', 'Kartoteka klientów, pojazdów i historii napraw', 'boolean', NULL, 10),
  ('workshop_orders', 'Zlecenia i terminarz', 'Przyjmowanie zleceń i planowanie w kalendarzu', 'metered', 'zlecenie', 20),
  ('workshop_photos', 'Zdjęcia przy przyjęciu', 'Dokumentacja stanu pojazdu w chwili przyjęcia', 'boolean', NULL, 30),
  ('marketplace_access', 'Dostęp do giełdy GetRido', 'Zlecenia z platformy GetRido', 'boolean', NULL, 40),
  ('ai_repair_help', 'Pomoc AI przy naprawie', 'Pytania do asystenta AI o diagnostykę i naprawę', 'metered', 'pytanie', 50),
  ('workshop_invoices', 'Wyceny i faktury', 'Kosztorysy i faktury bez limitu', 'boolean', NULL, 60),
  ('tire_storage', 'Przechowalnia opon', 'Ewidencja opon w przechowalni z przypomnieniami', 'boolean', NULL, 70),
  ('fiscalization', 'Fiskalizacja', 'Paragony na drukarce fiskalnej', 'boolean', NULL, 80),
  ('ksef', 'KSeF', 'Wysyłka faktur do Krajowego Systemu e-Faktur', 'boolean', NULL, 90),
  ('reports_margin', 'Raporty i marża live', 'Raporty zleceń i marża liczona na bieżąco', 'boolean', NULL, 100),
  ('vehicle_lookup', 'Dane pojazdu po VIN', 'Pobieranie danych po numerze VIN i rejestracyjnym', 'boolean', NULL, 110),
  ('dynamic_statuses', 'Dynamiczne statusy i e-podpis', 'Własne statusy zleceń i podpis elektroniczny', 'boolean', NULL, 120),
  ('ai_labor_pricing', 'Wyceny robocizny AI', 'Automatyczna wycena czasu i kosztu robocizny', 'metered', 'wycena', 130),
  ('warehouse_ocr', 'Magazyn i OCR faktur', 'Stany magazynowe i odczyt faktur zakupowych', 'boolean', NULL, 140),
  ('wholesaler_integrations', 'Integracje z hurtowniami', 'Wyszukiwanie i zamawianie części u dostawców', 'boolean', NULL, 150),
  ('employees_panel', 'Panel pracowników', 'Konta mechaników i listy kontrolne', 'boolean', NULL, 160),
  ('tecrmi', 'Dane naprawcze TecRMI', 'Czasy pracy i procedury naprawcze', 'boolean', NULL, 170),
  ('multi_location', 'Wiele lokalizacji', 'Wspólna baza dla sieci warsztatów', 'boolean', NULL, 180),
  ('network_analytics', 'Analityka sieci', 'Raporty zbiorcze dla wielu lokalizacji', 'boolean', NULL, 190),
  ('voice_agent', 'Voicebot 24/7', 'Agent AI odbierający telefon całą dobę', 'boolean', NULL, 200),
  ('voice_minutes', 'Minuty rozmów AI', 'Czas rozmów obsłużonych przez agenta', 'metered', 'minuta', 210),
  ('voice_creates_orders', 'Tworzenie zleceń z rozmów', 'Agent zakłada zlecenie na podstawie rozmowy', 'boolean', NULL, 220),
  ('voice_callback', 'Bot po godzinach i oddzwanianie', 'Obsługa poza godzinami pracy i oddzwanianie do leadów', 'boolean', NULL, 230),
  ('voice_transcriptions', 'Transkrypcje i umawianie wizyt', 'Zapis rozmów i rezerwacja terminów', 'boolean', NULL, 240),
  ('voice_multi_number', 'Obsługa wielu numerów', 'Wiele numerów i lokalizacji na jednym agencie', 'boolean', NULL, 250),
  ('voice_ai_quotes', 'Wyceny AI i dobór części', 'Wyceny, dobór części i protokoły napraw z rozmowy', 'boolean', NULL, 260),
  ('voice_priority_quality', 'Priorytetowa jakość głosu', 'Lepszy głos i szybsze odpowiedzi', 'boolean', NULL, 270),
  ('voice_analytics', 'Analityka rozmów', 'Tagi, powody kontaktu i raporty', 'boolean', NULL, 280),
  ('dedicated_manager', 'Dedykowany opiekun klienta', 'Wyznaczona osoba do kontaktu po stronie GetRido', 'boolean', NULL, 290)
ON CONFLICT (key) DO NOTHING;

-- -------------------------------------------------------------- PLANY (9)
-- trial_max ma is_active = false: nie ma być kupowany ani pokazywany w cenniku,
-- ale ma być przypisywalny. Uprawnienia działają niezależnie od tej flagi —
-- billing_active_plan nie filtruje po is_active.
INSERT INTO public.billing_plans
  (code, name, description, subscriber_type, price_net, vat_rate, billing_interval, trial_days, is_custom, is_active, sort_order)
VALUES
  ('warsztat_free',         'Darmowy',                          'Baza klientów i pojazdów, terminarz, 20 zleceń miesięcznie', 'service_provider',   0, 23, 'month',  0, false, true,  10),
  ('warsztat_standard',     'Standard',                         'Zlecenia, wyceny i faktury bez limitu, fiskalizacja, KSeF',   'service_provider',  89, 23, 'month', 14, false, true,  20),
  ('warsztat_pro',          'Pro',                              'Standard plus magazyn, hurtownie, panel pracowników',         'service_provider', 169, 23, 'month', 14, false, true,  30),
  ('warsztat_sieci',        'Sieci',                            'Pro dla wielu lokalizacji, wycena indywidualna',              'service_provider', NULL, 23, 'month',  0, true,  true,  40),
  ('agent',                 'Agent',                            'Voicebot odbiera telefon 24/7, 120 minut AI miesięcznie',     'service_provider', 139, 23, 'month', 14, false, true,  50),
  ('agent_pro',             'Agent Pro',                        'Agent z 300 minutami, wieloma numerami i analityką rozmów',   'service_provider', 289, 23, 'month', 14, false, true,  60),
  ('bundle_warsztat_agent', 'Pakiet Warsztat + Agent AI',       'Program Pro i Agent w jednym, zamiast 308 zł',                'service_provider', 289, 23, 'month', 14, false, true,  70),
  ('bundle_max',            'Warsztat Pro + Agent Pro — MAX',   'Pełny program, Agent Pro i 500 pytań AI, zamiast 458 zł',     'service_provider', 399, 23, 'month', 14, false, true,  80),
  ('trial_max',             'Okres próbny MAX',                 '14 dni pełnego dostępu bez karty, zakres pakietu MAX',        'service_provider',   0, 23, 'month', 14, false, false, 90)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------- MACIERZ PLAN × FUNKCJA
-- NULL w limit_value = bez limitu. Liczba = limit miesięczny.
WITH matrix(plan_code, feature_key, limit_value) AS (
  VALUES
    ('warsztat_free', 'workshop_core', NULL::numeric),
    ('warsztat_free', 'workshop_photos', NULL),
    ('warsztat_free', 'marketplace_access', NULL),
    ('warsztat_free', 'workshop_orders', 20),
    ('warsztat_free', 'ai_repair_help', 3),
    ('warsztat_standard', 'workshop_core', NULL),
    ('warsztat_standard', 'workshop_photos', NULL),
    ('warsztat_standard', 'marketplace_access', NULL),
    ('warsztat_standard', 'workshop_invoices', NULL),
    ('warsztat_standard', 'tire_storage', NULL),
    ('warsztat_standard', 'fiscalization', NULL),
    ('warsztat_standard', 'ksef', NULL),
    ('warsztat_standard', 'reports_margin', NULL),
    ('warsztat_standard', 'vehicle_lookup', NULL),
    ('warsztat_standard', 'dynamic_statuses', NULL),
    ('warsztat_standard', 'workshop_orders', NULL),
    ('warsztat_standard', 'ai_repair_help', 50),
    ('warsztat_standard', 'ai_labor_pricing', 30),
    ('warsztat_pro', 'workshop_core', NULL),
    ('warsztat_pro', 'workshop_photos', NULL),
    ('warsztat_pro', 'marketplace_access', NULL),
    ('warsztat_pro', 'workshop_invoices', NULL),
    ('warsztat_pro', 'tire_storage', NULL),
    ('warsztat_pro', 'fiscalization', NULL),
    ('warsztat_pro', 'ksef', NULL),
    ('warsztat_pro', 'reports_margin', NULL),
    ('warsztat_pro', 'vehicle_lookup', NULL),
    ('warsztat_pro', 'dynamic_statuses', NULL),
    ('warsztat_pro', 'warehouse_ocr', NULL),
    ('warsztat_pro', 'wholesaler_integrations', NULL),
    ('warsztat_pro', 'employees_panel', NULL),
    ('warsztat_pro', 'tecrmi', NULL),
    ('warsztat_pro', 'workshop_orders', NULL),
    ('warsztat_pro', 'ai_repair_help', 300),
    ('warsztat_pro', 'ai_labor_pricing', 100),
    ('warsztat_sieci', 'workshop_core', NULL),
    ('warsztat_sieci', 'workshop_photos', NULL),
    ('warsztat_sieci', 'marketplace_access', NULL),
    ('warsztat_sieci', 'workshop_invoices', NULL),
    ('warsztat_sieci', 'tire_storage', NULL),
    ('warsztat_sieci', 'fiscalization', NULL),
    ('warsztat_sieci', 'ksef', NULL),
    ('warsztat_sieci', 'reports_margin', NULL),
    ('warsztat_sieci', 'vehicle_lookup', NULL),
    ('warsztat_sieci', 'dynamic_statuses', NULL),
    ('warsztat_sieci', 'warehouse_ocr', NULL),
    ('warsztat_sieci', 'wholesaler_integrations', NULL),
    ('warsztat_sieci', 'employees_panel', NULL),
    ('warsztat_sieci', 'tecrmi', NULL),
    ('warsztat_sieci', 'multi_location', NULL),
    ('warsztat_sieci', 'network_analytics', NULL),
    ('warsztat_sieci', 'dedicated_manager', NULL),
    ('warsztat_sieci', 'workshop_orders', NULL),
    ('warsztat_sieci', 'ai_repair_help', NULL),
    ('warsztat_sieci', 'ai_labor_pricing', NULL),
    ('agent', 'voice_agent', NULL),
    ('agent', 'voice_creates_orders', NULL),
    ('agent', 'voice_callback', NULL),
    ('agent', 'voice_transcriptions', NULL),
    ('agent', 'voice_minutes', 120),
    ('agent_pro', 'voice_agent', NULL),
    ('agent_pro', 'voice_creates_orders', NULL),
    ('agent_pro', 'voice_callback', NULL),
    ('agent_pro', 'voice_transcriptions', NULL),
    ('agent_pro', 'voice_multi_number', NULL),
    ('agent_pro', 'voice_ai_quotes', NULL),
    ('agent_pro', 'voice_priority_quality', NULL),
    ('agent_pro', 'voice_analytics', NULL),
    ('agent_pro', 'dedicated_manager', NULL),
    ('agent_pro', 'voice_minutes', 300),
    ('bundle_warsztat_agent', 'workshop_core', NULL),
    ('bundle_warsztat_agent', 'workshop_photos', NULL),
    ('bundle_warsztat_agent', 'marketplace_access', NULL),
    ('bundle_warsztat_agent', 'workshop_invoices', NULL),
    ('bundle_warsztat_agent', 'tire_storage', NULL),
    ('bundle_warsztat_agent', 'fiscalization', NULL),
    ('bundle_warsztat_agent', 'ksef', NULL),
    ('bundle_warsztat_agent', 'reports_margin', NULL),
    ('bundle_warsztat_agent', 'vehicle_lookup', NULL),
    ('bundle_warsztat_agent', 'dynamic_statuses', NULL),
    ('bundle_warsztat_agent', 'warehouse_ocr', NULL),
    ('bundle_warsztat_agent', 'wholesaler_integrations', NULL),
    ('bundle_warsztat_agent', 'employees_panel', NULL),
    ('bundle_warsztat_agent', 'tecrmi', NULL),
    ('bundle_warsztat_agent', 'voice_agent', NULL),
    ('bundle_warsztat_agent', 'voice_creates_orders', NULL),
    ('bundle_warsztat_agent', 'voice_callback', NULL),
    ('bundle_warsztat_agent', 'voice_transcriptions', NULL),
    ('bundle_warsztat_agent', 'workshop_orders', NULL),
    ('bundle_warsztat_agent', 'ai_repair_help', 300),
    ('bundle_warsztat_agent', 'ai_labor_pricing', 100),
    ('bundle_warsztat_agent', 'voice_minutes', 120),
    ('bundle_max', 'workshop_core', NULL),
    ('bundle_max', 'workshop_photos', NULL),
    ('bundle_max', 'marketplace_access', NULL),
    ('bundle_max', 'workshop_invoices', NULL),
    ('bundle_max', 'tire_storage', NULL),
    ('bundle_max', 'fiscalization', NULL),
    ('bundle_max', 'ksef', NULL),
    ('bundle_max', 'reports_margin', NULL),
    ('bundle_max', 'vehicle_lookup', NULL),
    ('bundle_max', 'dynamic_statuses', NULL),
    ('bundle_max', 'warehouse_ocr', NULL),
    ('bundle_max', 'wholesaler_integrations', NULL),
    ('bundle_max', 'employees_panel', NULL),
    ('bundle_max', 'tecrmi', NULL),
    ('bundle_max', 'voice_agent', NULL),
    ('bundle_max', 'voice_creates_orders', NULL),
    ('bundle_max', 'voice_callback', NULL),
    ('bundle_max', 'voice_transcriptions', NULL),
    ('bundle_max', 'voice_multi_number', NULL),
    ('bundle_max', 'voice_ai_quotes', NULL),
    ('bundle_max', 'voice_priority_quality', NULL),
    ('bundle_max', 'voice_analytics', NULL),
    ('bundle_max', 'dedicated_manager', NULL),
    ('bundle_max', 'workshop_orders', NULL),
    ('bundle_max', 'ai_repair_help', 500),
    ('bundle_max', 'ai_labor_pricing', 100),
    ('bundle_max', 'voice_minutes', 300),
    ('trial_max', 'workshop_core', NULL),
    ('trial_max', 'workshop_photos', NULL),
    ('trial_max', 'marketplace_access', NULL),
    ('trial_max', 'workshop_invoices', NULL),
    ('trial_max', 'tire_storage', NULL),
    ('trial_max', 'fiscalization', NULL),
    ('trial_max', 'ksef', NULL),
    ('trial_max', 'reports_margin', NULL),
    ('trial_max', 'vehicle_lookup', NULL),
    ('trial_max', 'dynamic_statuses', NULL),
    ('trial_max', 'warehouse_ocr', NULL),
    ('trial_max', 'wholesaler_integrations', NULL),
    ('trial_max', 'employees_panel', NULL),
    ('trial_max', 'tecrmi', NULL),
    ('trial_max', 'voice_agent', NULL),
    ('trial_max', 'voice_creates_orders', NULL),
    ('trial_max', 'voice_callback', NULL),
    ('trial_max', 'voice_transcriptions', NULL),
    ('trial_max', 'voice_multi_number', NULL),
    ('trial_max', 'voice_ai_quotes', NULL),
    ('trial_max', 'voice_priority_quality', NULL),
    ('trial_max', 'voice_analytics', NULL),
    ('trial_max', 'dedicated_manager', NULL),
    ('trial_max', 'workshop_orders', NULL),
    ('trial_max', 'ai_repair_help', 500),
    ('trial_max', 'ai_labor_pricing', 100),
    ('trial_max', 'voice_minutes', 300)
)
INSERT INTO public.billing_plan_features (plan_id, feature_id, is_enabled, limit_value)
SELECT p.id, f.id, true, m.limit_value
FROM matrix m
JOIN public.billing_plans p ON p.code = m.plan_code
JOIN public.billing_features f ON f.key = m.feature_key
ON CONFLICT (plan_id, feature_id) DO NOTHING;

COMMIT;
