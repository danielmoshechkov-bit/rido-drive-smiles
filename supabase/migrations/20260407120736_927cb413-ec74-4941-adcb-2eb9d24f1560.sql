-- Fix sms_settings RLS 
DROP POLICY IF EXISTS "SMS settings admin only" ON sms_settings;
DROP POLICY IF EXISTS "SMS settings delete for authenticated" ON sms_settings;
DROP POLICY IF EXISTS "SMS settings insert for authenticated" ON sms_settings;
DROP POLICY IF EXISTS "SMS settings update for authenticated" ON sms_settings;

CREATE POLICY "sms_settings_admin_select" ON sms_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sms_settings_admin_insert" ON sms_settings FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sms_settings_admin_update" ON sms_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sms_settings_admin_delete" ON sms_settings FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Workshop settings table
CREATE TABLE IF NOT EXISTS workshop_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  firm_name text,
  nip text,
  address text,
  city text,
  postal_code text,
  phone text,
  email text,
  logo_url text,
  hourly_rate numeric DEFAULT 150,
  currency text DEFAULT 'PLN',
  show_prices_as text DEFAULT 'brutto',
  payment_days int DEFAULT 0,
  payment_method text DEFAULT 'cash',
  discounts_enabled bool DEFAULT true,
  working_hours jsonb,
  work_stations jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE workshop_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workshop_settings_own" ON workshop_settings FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Add missing columns to workshop_employees
ALTER TABLE workshop_employees ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE workshop_employees ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE workshop_employees ADD COLUMN IF NOT EXISTS role text DEFAULT 'mechanic';
ALTER TABLE workshop_employees ADD COLUMN IF NOT EXISTS pin_code text;

-- Document numbering table
CREATE TABLE IF NOT EXISTS document_numbering (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  document_type text NOT NULL,
  prefix text DEFAULT '',
  format text DEFAULT '{PREFIX}/{NR}/{ROK}',
  next_number int DEFAULT 1,
  reset_period text DEFAULT 'year',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, document_type)
);

ALTER TABLE document_numbering ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_numbering_own" ON document_numbering FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());