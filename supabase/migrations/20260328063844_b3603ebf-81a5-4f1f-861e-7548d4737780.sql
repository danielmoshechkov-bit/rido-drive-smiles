INSERT INTO ai_function_mapping (function_key, function_name, function_description, category, provider_key, is_enabled, sort_order) VALUES
('rido_price', 'Rido Wycena', 'Sugestie cenowe AI dla usług warsztatowych — analiza stawek rynkowych', 'text', 'kimi', true, 15),
('workspace_ai_planner', 'AI Planner', 'Inteligentne planowanie zadań, sugestie priorytetów i harmonogramów w projektach Workspace', 'text', 'openai', true, 16),
('document_ai', 'AI Dokumentów', 'Generowanie, podsumowanie i edycja dokumentów w Workspace przy pomocy AI', 'text', 'openai', true, 17),
('ocr_invoice', 'OCR Faktur zakupowych', 'Automatyczne odczytywanie pozycji z faktur zakupowych — magazyn/części', 'image', 'gemini', true, 18),
('chat_translation', 'Auto-tłumaczenie czatu', 'Automatyczne tłumaczenie wiadomości w komunikatorze Workspace na inne języki', 'text', 'openai', true, 19),
('image_generation', 'Generowanie grafik', 'Tworzenie obrazów AI (Nano Banana) — plakaty, banery, zdjęcia produktowe', 'image', 'gemini', true, 20),
('inpainting', 'Retusz zdjęć AI', 'Edycja fragmentów zdjęć (inpainting) — usuwanie obiektów, zmiana tła', 'image', 'gemini', true, 21),
('vehicle_description_gen', 'Opis pojazdu AI', 'Automatyczne generowanie atrakcyjnych opisów ogłoszeń motoryzacyjnych', 'text', 'openai', true, 22),
('meeting_transcription', 'Transkrypcja spotkań', 'Zamiana nagrań spotkań na tekst i generowanie podsumowań AI', 'voice', 'openai', true, 23),
('map_risk_assessment', 'Ocena ryzyka trasy', 'Analiza AI bezpieczeństwa tras na mapach — incydenty, pogoda, natężenie', 'general', 'openai', true, 24),
('ai_chat_main', 'RidoAI Chat', 'Główny asystent AI portalu — pytania, porady, generowanie treści, Cowork', 'general', 'openai', true, 25),
('dual_ai_mode', 'Tryb Dual AI', 'Równoległe zapytanie do Claude i Gemini — wybór lepszej odpowiedzi', 'general', 'openai', true, 26),
('parts_search_ai', 'Wyszukiwanie części AI', 'Inteligentne wyszukiwanie części zamiennych w hurtowniach po VIN/modelu', 'search', 'kimi', true, 27),
('email_ai_assistant', 'Asystent poczty AI', 'Analiza emaili, sugestie odpowiedzi, wyciąganie zadań z wiadomości', 'text', 'openai', true, 28)
ON CONFLICT (function_key) DO NOTHING;