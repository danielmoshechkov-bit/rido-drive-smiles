INSERT INTO ai_function_mapping (function_key, function_name, function_description, category, is_enabled, sort_order) VALUES
('invoice_recognition', 'Rozpoznawanie faktur AI', 'Automatyczne odczytywanie danych z faktur (sprzedawca, NIP, pozycje, kwoty) za pomocą AI', 'image', true, 45),
('invoice_booking', 'Księgowanie faktur AI', 'Sugestie dekretacji i automatyczne księgowanie faktur kosztowych', 'text', true, 46),
('supplier_mapping', 'Mapowanie dostawców AI', 'Automatyczne rozpoznawanie i mapowanie produktów dostawców do wewnętrznego magazynu', 'text', true, 47),
('ksef_integration', 'KSeF - e-Faktura AI', 'Wsparcie AI przy obsłudze Krajowego Systemu e-Faktur', 'text', true, 48),
('inventory_ocr', 'OCR dokumentów magazynowych', 'Skanowanie i rozpoznawanie dokumentów magazynowych (WZ, PZ, MM)', 'image', true, 49),
('price_suggestion', 'Sugestia cen AI', 'Sugerowanie cen sprzedaży na podstawie cen zakupu i marży rynkowej', 'text', true, 50)
ON CONFLICT (function_key) DO NOTHING;