-- Minimalny podkład pod URUCHOMIENIE prawdziwych migracji rozliczeniowych
-- na lokalnym PostgreSQL-u. Tylko to, czego one wymagają, i nic więcej —
-- każda dopisana tu tabela musi mieć kształt zgodny z produkcją, bo inaczej
-- test przechodzi na fikcji.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);
-- `auth.uid()` w teście zwraca to, co ustawimy w `app.uid`.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','fleet_owner','driver','user','moderator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL,
  role    public.app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(p_user uuid, p_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = p_user AND role = p_role) $$;

CREATE TABLE IF NOT EXISTS public.service_providers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  company_name text,
  sms_balance  integer DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workshop_employees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid,
  user_id     uuid,
  name        text,
  status      text DEFAULT 'active',
  is_active   boolean DEFAULT true,
  removed_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicle_lookup_credits (
  user_id                 uuid PRIMARY KEY,
  remaining_credits       integer NOT NULL DEFAULT 0,
  total_credits_purchased integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.vehicle_lookup_credit_transactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  type       text NOT NULL,
  credits    integer NOT NULL,
  source     text,
  note       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicle_lookup_usage (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  registration_number text,
  vin                 text,
  source_type         text NOT NULL,
  credits_used        integer DEFAULT 1,
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_credit_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  delta       integer NOT NULL,
  powod       text NOT NULL,
  opis        text,
  created_at  timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.grant_sms_credits(
  p_provider uuid, p_ile integer, p_powod text, p_ref uuid DEFAULT NULL, p_opis text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE service_providers SET sms_balance = COALESCE(sms_balance,0) + p_ile WHERE id = p_provider;
  INSERT INTO sms_credit_ledger (provider_id, delta, powod, opis) VALUES (p_provider, p_ile, p_powod, p_opis);
END $$;

CREATE OR REPLACE FUNCTION public.deduct_vehicle_lookup_credit(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE vehicle_lookup_credits
  SET remaining_credits = GREATEST(remaining_credits - 1, 0)
  WHERE user_id = p_user_id;
END $$;

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE
);
