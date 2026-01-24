-- Add new service categories for automotive and real estate
INSERT INTO public.service_categories (name, slug, icon, description, sort_order, is_active) VALUES
('Studio PPF', 'ppf', 'shield', 'Folie ochronne PPF, ceramika i zabezpieczenia lakieru', 9, true),
('Projektanci wnętrz', 'projektanci', 'pen-tool', 'Projekty wnętrz, aranżacje i wizualizacje 3D', 10, true),
('Remonty i wykończenia', 'remonty', 'hammer', 'Kompleksowe wykończenia mieszkań i domów', 11, true),
('Budowlanka', 'budowlanka', 'hard-hat', 'Prace budowlane, konstrukcyjne i ziemne', 12, true)
ON CONFLICT (slug) DO NOTHING;