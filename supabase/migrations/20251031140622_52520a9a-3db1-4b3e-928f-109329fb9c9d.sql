-- Create table for driver debts
CREATE TABLE driver_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  current_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  CONSTRAINT unique_driver_debt UNIQUE(driver_id)
);

CREATE INDEX idx_driver_debts_driver_id ON driver_debts(driver_id);

COMMENT ON TABLE driver_debts IS 'Aktualne zadłużenie kierowców';
COMMENT ON COLUMN driver_debts.current_balance IS 'Aktualne saldo zadłużenia (dodatnie = dług)';

-- Create table for debt transaction history
CREATE TABLE driver_debt_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('debt_increase', 'debt_payment')),
  amount NUMERIC NOT NULL,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  description TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_debt_transactions_driver_id ON driver_debt_transactions(driver_id);
CREATE INDEX idx_debt_transactions_settlement_id ON driver_debt_transactions(settlement_id);
CREATE INDEX idx_debt_transactions_created_at ON driver_debt_transactions(created_at DESC);

COMMENT ON TABLE driver_debt_transactions IS 'Historia transakcji zadłużenia kierowców';
COMMENT ON COLUMN driver_debt_transactions.type IS 'debt_increase = narastanie długu, debt_payment = spłata';
COMMENT ON COLUMN driver_debt_transactions.amount IS 'Kwota (dodatnia dla długu, ujemna dla spłaty)';

-- Add debt columns to settlements table
ALTER TABLE settlements
ADD COLUMN debt_before NUMERIC DEFAULT 0,
ADD COLUMN debt_payment NUMERIC DEFAULT 0,
ADD COLUMN debt_after NUMERIC DEFAULT 0,
ADD COLUMN actual_payout NUMERIC DEFAULT 0;

COMMENT ON COLUMN settlements.debt_before IS 'Zadłużenie kierowcy przed tym rozliczeniem';
COMMENT ON COLUMN settlements.debt_payment IS 'Kwota spłaty długu z tego rozliczenia';
COMMENT ON COLUMN settlements.debt_after IS 'Zadłużenie kierowcy po tym rozliczeniu';
COMMENT ON COLUMN settlements.actual_payout IS 'Faktyczna wypłata po odliczeniu długu';

-- Create function to calculate payout with debt
CREATE OR REPLACE FUNCTION calculate_driver_payout_with_debt(
  p_driver_id UUID,
  p_calculated_payout NUMERIC
) RETURNS TABLE (
  current_debt NUMERIC,
  debt_payment NUMERIC,
  remaining_debt NUMERIC,
  actual_payout NUMERIC
) AS $$
DECLARE
  v_current_debt NUMERIC;
  v_debt_payment NUMERIC;
  v_remaining_debt NUMERIC;
  v_actual_payout NUMERIC;
BEGIN
  -- Pobierz aktualny dług
  SELECT COALESCE(current_balance, 0)
  INTO v_current_debt
  FROM driver_debts
  WHERE driver_id = p_driver_id;
  
  IF v_current_debt IS NULL THEN
    v_current_debt := 0;
  END IF;
  
  -- Jeśli wypłata jest ujemna (kierowca jest winien)
  IF p_calculated_payout < 0 THEN
    v_debt_payment := 0;
    v_remaining_debt := v_current_debt + ABS(p_calculated_payout);
    v_actual_payout := 0;
    
  -- Jeśli wypłata jest dodatnia
  ELSE
    -- Jeśli nie ma długu
    IF v_current_debt <= 0 THEN
      v_debt_payment := 0;
      v_remaining_debt := 0;
      v_actual_payout := p_calculated_payout;
      
    -- Jeśli jest dług i wypłata go pokrywa całkowicie
    ELSIF p_calculated_payout >= v_current_debt THEN
      v_debt_payment := v_current_debt;
      v_remaining_debt := 0;
      v_actual_payout := p_calculated_payout - v_current_debt;
      
    -- Jeśli jest dług i wypłata go częściowo pokrywa
    ELSE
      v_debt_payment := p_calculated_payout;
      v_remaining_debt := v_current_debt - p_calculated_payout;
      v_actual_payout := 0;
    END IF;
  END IF;
  
  RETURN QUERY SELECT v_current_debt, v_debt_payment, v_remaining_debt, v_actual_payout;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RLS Policies
ALTER TABLE driver_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_debt_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage driver debts"
ON driver_debts FOR ALL
USING (true);

CREATE POLICY "Admins can manage debt transactions"
ON driver_debt_transactions FOR ALL
USING (true);