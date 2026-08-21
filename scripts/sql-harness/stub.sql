
CREATE ROLE anon;  CREATE ROLE authenticated;  CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TYPE public.billing_product_line       AS ENUM ('warsztat','agent','other');
CREATE TYPE public.billing_subscriber_type    AS ENUM ('service_provider','fleet','entity','company');
CREATE TYPE public.billing_subscription_status AS ENUM ('trialing','active','past_due','canceled','expired','read_only');
CREATE TYPE public.billing_provider           AS ENUM ('stripe','payu','p24');

CREATE TABLE public.service_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  status text DEFAULT 'pending',
  company_name text,
  sms_balance int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now());

CREATE TABLE public.billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text, name text, price_net numeric, price_net_target numeric, vat_rate numeric DEFAULT 23,
  product_line public.billing_product_line NOT NULL DEFAULT 'other',
  stripe_price_id text, is_active boolean DEFAULT true, is_custom boolean DEFAULT false,
  created_at timestamptz DEFAULT now());

CREATE TABLE public.billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_type public.billing_subscriber_type NOT NULL,
  subscriber_id uuid NOT NULL,
  plan_id uuid REFERENCES public.billing_plans(id),
  status public.billing_subscription_status NOT NULL DEFAULT 'trialing',
  product_line public.billing_product_line NOT NULL DEFAULT 'other',
  current_period_start timestamptz DEFAULT now(), current_period_end timestamptz,
  -- `trial_ends_at` JEST na produkcji od pierwszej migracji rozliczeniowej
  -- (20260806100000). Brakowało go w namiastce, więc test wariantu A nie miałby
  -- gdzie zapisać końca okresu próbnego — czyli sprawdzałby fikcję.
  trial_ends_at timestamptz,
  provider public.billing_provider, provider_subscription_id text,
  price_snapshot jsonb DEFAULT '{}'::jsonb, price_guarantee_until timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());

CREATE TABLE public.billing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  grace_period_days integer NOT NULL DEFAULT 7,
  promo_enrollment_until timestamptz);
INSERT INTO public.billing_settings (id) VALUES (true);

CREATE TABLE public.paid_service_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  status text DEFAULT 'active', expires_at timestamptz,
  metadata jsonb, created_at timestamptz DEFAULT now());

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES public.service_providers(id), is_active boolean DEFAULT true);

CREATE TABLE public.provider_service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES public.service_providers(id), is_active boolean DEFAULT true);

CREATE FUNCTION public.has_role(p_user uuid, p_role text) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;

-- polityki, które G4 i G0 podmieniają (muszą istnieć, żeby DROP miał sens)
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active providers are public" ON public.service_providers FOR SELECT
  USING (status IN ('active','verified') OR user_id = auth.uid());
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active services are public" ON public.services FOR SELECT USING (is_active);
ALTER TABLE public.provider_service_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active provider categories are public" ON public.provider_service_categories FOR SELECT USING (is_active);

CREATE TABLE public.workshop_cash_closures (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_client_bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_employee_findings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_employee_invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_employee_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_employee_payouts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_employees (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_expenses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_finance_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_mechanics (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_order_assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_order_sequences (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_order_statuses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_parts_integrations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_parts_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_recurring_costs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_service_points (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_station_employees (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_stations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_status_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_tire_storage (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_vehicles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_workstations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_order_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_order_photos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_order_signatures (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.workshop_order_status_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, created_at timestamptz DEFAULT now());
ALTER TABLE public.workshop_cash_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_client_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_employee_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_employee_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_employee_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_employee_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_mechanics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_order_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_order_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_order_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_order_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_order_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_order_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_parts_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_parts_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_recurring_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_service_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_station_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_status_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_tire_storage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_workstations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access workshop_clients" ON public.workshop_clients FOR ALL USING ((SELECT public.has_role(auth.uid(),'admin')));
CREATE POLICY "Admin full access workshop_order_items" ON public.workshop_order_items FOR ALL USING ((SELECT public.has_role(auth.uid(),'admin')));
CREATE POLICY "Admin full access workshop_order_status_history" ON public.workshop_order_status_history FOR ALL USING ((SELECT public.has_role(auth.uid(),'admin')));
CREATE POLICY "Admin full access workshop_order_statuses" ON public.workshop_order_statuses FOR ALL USING ((SELECT public.has_role(auth.uid(),'admin')));
CREATE POLICY "Admin full access workshop_orders" ON public.workshop_orders FOR ALL USING ((SELECT public.has_role(auth.uid(),'admin')));
CREATE POLICY "Admin full access workshop_vehicles" ON public.workshop_vehicles FOR ALL USING ((SELECT public.has_role(auth.uid(),'admin')));

-- Kredyty VIN — potrzebne do sprawdzenia pakietu startowego.
CREATE TABLE public.vehicle_lookup_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  total_credits_purchased integer DEFAULT 0,
  remaining_credits integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now());

CREATE TABLE public.vehicle_lookup_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('purchase','usage','manual_add','manual_remove')),
  credits integer NOT NULL,
  price_net numeric(10,2),
  source text DEFAULT 'system' CHECK (source IN ('payment','admin','system')),
  note text,
  created_at timestamptz DEFAULT now(),
  created_by_admin_id uuid);
