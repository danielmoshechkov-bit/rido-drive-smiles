ALTER TABLE public.driver_debt_transactions 
ADD COLUMN IF NOT EXISTS debt_category text NOT NULL DEFAULT 'settlement' 
CHECK (debt_category IN ('settlement', 'rental', 'manual'));