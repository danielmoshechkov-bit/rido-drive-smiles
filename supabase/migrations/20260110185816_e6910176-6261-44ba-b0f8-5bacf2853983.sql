-- Add new address columns to real_estate_agents
ALTER TABLE public.real_estate_agents
ADD COLUMN IF NOT EXISTS company_short_name text,
ADD COLUMN IF NOT EXISTS company_street text,
ADD COLUMN IF NOT EXISTS company_building_number text,
ADD COLUMN IF NOT EXISTS company_apartment_number text;

-- Migrate existing data - move company_address to company_street
UPDATE public.real_estate_agents 
SET company_street = company_address 
WHERE company_street IS NULL AND company_address IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.real_estate_agents.company_short_name IS 'Nazwa skrócona widoczna dla użytkowników portalu';