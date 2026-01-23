-- =====================================================
-- MODUŁ AUTOFAKTUROWANIA B2B - Art. 106d Ustawy o VAT
-- =====================================================

-- 1. Rozszerzenie tabeli driver_b2b_profiles o weryfikację VAT
ALTER TABLE driver_b2b_profiles 
ADD COLUMN IF NOT EXISTS vat_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS vat_verification_status TEXT DEFAULT 'unverified' CHECK (vat_verification_status IN ('verified', 'unverified', 'invalid', 'error')),
ADD COLUMN IF NOT EXISTS vat_verification_response JSONB;

-- 2. Tabela zgód na autofakturowanie (compliance)
CREATE TABLE IF NOT EXISTS auto_invoicing_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  consent_self_billing BOOLEAN NOT NULL DEFAULT false,
  consent_terms BOOLEAN NOT NULL DEFAULT false,
  terms_version TEXT NOT NULL DEFAULT '1.0',
  ip_address TEXT,
  user_agent TEXT,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela sekwencji numerów faktur AF/RRRR/MM/NNN
CREATE TABLE IF NOT EXISTS auto_invoice_number_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL,
  last_number INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fleet_id, year, month)
);

-- 4. Rozszerzenie driver_auto_invoicing_settings o tryb numeracji
-- (kolumna już dodana wcześniej, ale dodajmy inne pola)
ALTER TABLE driver_auto_invoicing_settings 
ADD COLUMN IF NOT EXISTS auto_invoice_series TEXT DEFAULT 'AF',
ADD COLUMN IF NOT EXISTS include_vat_annotation BOOLEAN DEFAULT true;

-- 5. Indeksy
CREATE INDEX IF NOT EXISTS idx_auto_invoicing_consents_user ON auto_invoicing_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_invoicing_consents_driver ON auto_invoicing_consents(driver_id);
CREATE INDEX IF NOT EXISTS idx_auto_invoicing_consents_status ON auto_invoicing_consents(status);
CREATE INDEX IF NOT EXISTS idx_auto_invoice_sequences_fleet ON auto_invoice_number_sequences(fleet_id, year, month);

-- 6. RLS dla auto_invoicing_consents
ALTER TABLE auto_invoicing_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own consents" ON auto_invoicing_consents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own consents" ON auto_invoicing_consents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own consents" ON auto_invoicing_consents
  FOR UPDATE USING (auth.uid() = user_id);

-- 7. RLS dla auto_invoice_number_sequences (tylko admini i floty)
ALTER TABLE auto_invoice_number_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invoice sequences" ON auto_invoice_number_sequences
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Fleet owners can view their sequences" ON auto_invoice_number_sequences
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND fleet_id = auto_invoice_number_sequences.fleet_id)
  );

-- 8. Trigger do aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_auto_invoicing_consents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS auto_invoicing_consents_updated_at ON auto_invoicing_consents;
CREATE TRIGGER auto_invoicing_consents_updated_at
  BEFORE UPDATE ON auto_invoicing_consents
  FOR EACH ROW EXECUTE FUNCTION update_auto_invoicing_consents_updated_at();

-- 9. Funkcja do generowania numeru faktury AF
CREATE OR REPLACE FUNCTION get_next_auto_invoice_number(p_fleet_id UUID, p_year INT, p_month INT)
RETURNS TEXT AS $$
DECLARE
  v_next_number INT;
  v_invoice_number TEXT;
BEGIN
  -- Upsert do tabeli sekwencji
  INSERT INTO auto_invoice_number_sequences (fleet_id, year, month, last_number)
  VALUES (p_fleet_id, p_year, p_month, 1)
  ON CONFLICT (fleet_id, year, month) 
  DO UPDATE SET last_number = auto_invoice_number_sequences.last_number + 1
  RETURNING last_number INTO v_next_number;
  
  -- Format: AF/RRRR/MM/NNN
  v_invoice_number := 'AF/' || p_year::TEXT || '/' || LPAD(p_month::TEXT, 2, '0') || '/' || LPAD(v_next_number::TEXT, 3, '0');
  
  RETURN v_invoice_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;