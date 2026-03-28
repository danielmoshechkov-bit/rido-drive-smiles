
INSERT INTO ai_function_mapping (function_key, function_name, function_description, category, sort_order, is_enabled)
VALUES
  ('parts_pricing', 'Wycena części', 'Wyszukiwanie i porównywanie cen części z hurtowni motoryzacyjnych', 'search', 3, true),
  ('task_breakdown', 'Rozbijanie zadań AI', 'Automatyczne rozbijanie opisów na konkretne zadania projektowe w Workspace', 'text', 30, true),
  ('project_planning', 'Planowanie projektu AI', 'Generowanie planu projektu z priorytetami i opisami zadań', 'text', 31, true),
  ('project_summary', 'Podsumowanie projektu AI', 'Analiza stanu projektu i rekomendacje na podstawie zadań', 'text', 32, true),
  ('admin_ai_chat', 'Chat AI Admin', 'Chat z AI w panelu administracyjnym — zarządzanie portalem', 'general', 20, true),
  ('ai_connection_test', 'Test połączenia AI', 'Szybki test czy połączenie z dostawcą AI działa prawidłowo', 'general', 21, true),
  ('workshop_order_ai', 'AI zlecenia warsztatowe', 'Sugestie AI przy tworzeniu i edycji zleceń serwisowych', 'text', 33, true),
  ('client_communication_ai', 'Komunikacja z klientem AI', 'Generowanie wiadomości SMS/email do klientów warsztatu', 'text', 34, true),
  ('inventory_analysis', 'Analiza magazynu AI', 'Inteligentna analiza stanów magazynowych i sugestie zamówień', 'search', 4, true),
  ('booking_ai', 'Rezerwacje AI', 'Sugestie terminów i automatyczne dopasowanie rezerwacji', 'general', 22, true)
ON CONFLICT (function_key) DO NOTHING;
