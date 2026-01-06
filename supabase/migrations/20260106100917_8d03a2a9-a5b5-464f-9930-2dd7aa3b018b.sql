-- Rename feature toggles for clarity and add category column
ALTER TABLE feature_toggles ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';

-- Update toggle names and categories
UPDATE feature_toggles SET 
  feature_name = 'Marketplace (cały portal)',
  description = 'Włącza lub wyłącza dostęp do całego portalu giełdowego',
  category = 'marketplace'
WHERE feature_key = 'marketplace_enabled';

UPDATE feature_toggles SET 
  feature_name = 'Marketplace: Giełda aut',
  description = 'Pokazuje kategorię pojazdów w marketplace',
  category = 'marketplace'
WHERE feature_key = 'marketplace_vehicles_enabled';

UPDATE feature_toggles SET 
  feature_name = 'Marketplace: Nieruchomości',
  description = 'Pokazuje kategorię nieruchomości w marketplace',
  category = 'marketplace'
WHERE feature_key = 'marketplace_realestate_enabled';

UPDATE feature_toggles SET 
  feature_name = 'Marketplace: Usługi',
  description = 'Pokazuje kategorię usług w marketplace',
  category = 'marketplace'
WHERE feature_key = 'marketplace_services_enabled';

UPDATE feature_toggles SET 
  category = 'registration'
WHERE feature_key IN ('fleet_registration_enabled', 'driver_registration_enabled');