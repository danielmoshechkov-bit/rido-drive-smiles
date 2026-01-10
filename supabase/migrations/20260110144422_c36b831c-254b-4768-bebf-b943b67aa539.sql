-- Add real estate transaction types (without category_id since the column doesn't exist)
INSERT INTO marketplace_transaction_types (name, slug, color, sort_order, is_active)
VALUES 
  ('Na sprzedaż', 'sprzedaz-nieruchomosci', '#10b981', 10, true),
  ('Wynajem nieruchomości', 'wynajem-nieruchomosci', '#3b82f6', 11, true),
  ('Wynajem krótkoterminowy', 'wynajem-krotkoterminowy', '#8b5cf6', 12, true)
ON CONFLICT (slug) DO NOTHING;