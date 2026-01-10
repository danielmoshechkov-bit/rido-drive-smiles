-- Insert the real estate agent record for "Nieruchomości Premium"
INSERT INTO real_estate_agents (
  user_id,
  company_name,
  company_nip,
  company_address,
  company_city,
  company_postal_code,
  owner_first_name,
  owner_last_name,
  owner_phone,
  owner_email,
  status,
  max_employees,
  active_listings_count
) VALUES (
  '21ba094d-b587-4030-9fe0-743c2b661ba9',
  'Nieruchomości Premium',
  '1234567891',
  'ul. Główna 15',
  'Kraków',
  '31-001',
  'Jan',
  'Kowalski',
  '+48 123 456 789',
  'nieruchomosci@test.pl',
  'verified',
  10,
  0
);