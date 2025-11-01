-- Create fuel_transactions table to store fuel transaction data from CSV imports
CREATE TABLE IF NOT EXISTS public.fuel_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  transaction_time TIME NOT NULL,
  vehicle_number TEXT,
  driver_name TEXT,
  brand TEXT,
  liters NUMERIC(10, 2),
  price_per_liter NUMERIC(10, 4),
  total_amount NUMERIC(10, 2) NOT NULL,
  fuel_type TEXT,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  import_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_card ON public.fuel_transactions(card_number);
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_period ON public.fuel_transactions(period_from, period_to);
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_date ON public.fuel_transactions(transaction_date);

-- Enable Row Level Security
ALTER TABLE public.fuel_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for admins
CREATE POLICY "Admins can manage fuel transactions"
  ON public.fuel_transactions
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));