-- Add driver_plan_selection_enabled to fleets table
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS driver_plan_selection_enabled boolean DEFAULT true;

-- Add account_switching_enabled feature toggle
INSERT INTO feature_toggles (feature_key, feature_name, description, is_enabled, category)
VALUES ('account_switching_enabled', 'Przełączanie kont', 'Pokazuje przycisk przełączania między kontami (kierowca/flota/giełda)', false, 'general')
ON CONFLICT (feature_key) DO NOTHING;