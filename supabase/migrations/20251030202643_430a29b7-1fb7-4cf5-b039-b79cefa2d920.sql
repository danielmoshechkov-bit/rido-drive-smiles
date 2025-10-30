-- Create settlement_plans table
CREATE TABLE public.settlement_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_fee numeric NOT NULL DEFAULT 0,
  tax_percentage numeric DEFAULT NULL,
  service_fee numeric DEFAULT 0,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.settlement_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Admins can manage settlement plans"
  ON public.settlement_plans FOR ALL
  USING (true);

-- Insert default plans
INSERT INTO public.settlement_plans (name, base_fee, tax_percentage, service_fee, description) VALUES
  ('50+8%', 50, 8, 0, 'Plan z podatkiem 8% i opłatą 50 PLN'),
  ('159', 159, NULL, 0, 'Plan bez podatku z opłatą 159 PLN tygodniowo');

-- Create driver_additional_fees table
CREATE TABLE public.driver_additional_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'once')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_additional_fees ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage additional fees"
  ON public.driver_additional_fees FOR ALL
  USING (true);

-- Update driver_app_users table
ALTER TABLE public.driver_app_users 
  ADD COLUMN settlement_plan_id uuid REFERENCES public.settlement_plans(id);

-- Create trigger for updated_at on settlement_plans
CREATE TRIGGER update_settlement_plans_updated_at
  BEFORE UPDATE ON public.settlement_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on driver_additional_fees
CREATE TRIGGER update_driver_additional_fees_updated_at
  BEFORE UPDATE ON public.driver_additional_fees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();