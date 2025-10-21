-- Tabela settlement_visibility_settings do ustawiania widoczności kolumn dla kierowców
CREATE TABLE IF NOT EXISTS settlement_visibility_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Widoczność kolumn dla kierowców
  show_uber boolean DEFAULT true,
  show_uber_cashless boolean DEFAULT true,
  show_uber_cash boolean DEFAULT true,
  show_bolt_gross boolean DEFAULT true,
  show_bolt_net boolean DEFAULT true,
  show_bolt_commission boolean DEFAULT false,
  show_bolt_cash boolean DEFAULT true,
  show_freenow_gross boolean DEFAULT true,
  show_freenow_net boolean DEFAULT true,
  show_freenow_commission boolean DEFAULT false,
  show_freenow_cash boolean DEFAULT true,
  show_total_cash boolean DEFAULT true,
  show_total_commission boolean DEFAULT false,
  show_tax boolean DEFAULT false,
  show_fuel boolean DEFAULT true,
  show_fuel_vat boolean DEFAULT false,
  show_fuel_vat_refund boolean DEFAULT false,
  
  -- Formuła wypłaty (używana do kalkulacji "Do wypłaty" dla kierowcy)
  payout_formula text DEFAULT 'uberCashless + boltNet + freenowNet - fuel + fuelVATRefund'
);

-- Insert domyślnych ustawień
INSERT INTO settlement_visibility_settings (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE settlement_visibility_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage visibility settings"
ON settlement_visibility_settings
FOR ALL
TO authenticated
USING (true);

-- Trigger dla updated_at
CREATE TRIGGER update_settlement_visibility_settings_updated_at
  BEFORE UPDATE ON settlement_visibility_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();