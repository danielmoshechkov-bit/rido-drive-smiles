INSERT INTO ai_function_mapping (function_key, function_name, function_description, category, provider_key, is_enabled, sort_order, allow_fallback)
VALUES 
  ('fleet_document_ai', 'Generowanie dokumentów flotowych', 'AI generuje szablony dokumentów (umowy, protokoły) dla panelu flotowego', 'fleet', NULL, true, 50, true),
  ('fleet_contract_analysis', 'Analiza umów flotowych', 'AI analizuje wgrane umowy i identyfikuje pola do uzupełnienia', 'fleet', NULL, true, 51, true)
ON CONFLICT (function_key) DO NOTHING;