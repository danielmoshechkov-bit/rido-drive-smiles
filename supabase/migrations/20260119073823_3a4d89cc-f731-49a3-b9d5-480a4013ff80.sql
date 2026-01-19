-- Rozszerzone pola dla typów transakcji
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS rent_to_own_data JSONB DEFAULT NULL;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS leasing_transfer_data JSONB DEFAULT NULL;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS exchange_data JSONB DEFAULT NULL;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

-- Feature toggle dla bezterminowych ogłoszeń
INSERT INTO feature_toggles (feature_key, feature_name, is_enabled, description, category)
VALUES ('vehicle_marketplace_unlimited_listings', 'Ogłoszenia bezterminowe', true, 'Ogłoszenia pojazdów bez limitu czasowego - nie wygasają automatycznie', 'marketplace')
ON CONFLICT (feature_key) DO NOTHING;