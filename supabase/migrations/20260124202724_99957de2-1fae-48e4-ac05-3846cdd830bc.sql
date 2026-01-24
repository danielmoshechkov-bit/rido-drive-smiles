
-- Dodaj ustawienie premium featured na stronie głównej
INSERT INTO feature_toggles (feature_key, feature_name, description, is_enabled, category)
VALUES (
  'homepage_featured_premium',
  'Wyróżnione na stronie głównej',
  'Płatna opcja wyróżnienia ogłoszeń premium na stronie głównej. Gdy włączone, płatne ogłoszenia będą priorytetowo wyświetlane w sekcji "Proponowane oferty".',
  false,
  'marketplace'
)
ON CONFLICT (feature_key) DO UPDATE SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;
