-- Add contract_termination_date to vehicles table
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS contract_termination_date DATE;

-- Add comment
COMMENT ON COLUMN public.vehicles.contract_termination_date IS 'Date when the rental contract is terminated/ending';