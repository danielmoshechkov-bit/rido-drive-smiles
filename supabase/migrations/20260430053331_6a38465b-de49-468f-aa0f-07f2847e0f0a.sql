-- =========================================================
-- NOWY MODUŁ DŁUGU TYGODNIOWEGO
-- driver_weekly_debts + driver_weekly_debt_payments
-- =========================================================

-- Tabela 1: tygodniowy stan długu
CREATE TABLE IF NOT EXISTS public.driver_weekly_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  settlement_id uuid NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  week_number integer NULL,
  year integer NULL,
  opening_debt numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  remaining_debt numeric NOT NULL DEFAULT 0,
  source_previous_settlement_id uuid NULL,
  source_previous_actual_payout numeric NOT NULL DEFAULT 0,
  source_note text NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_weekly_debts_unique_week UNIQUE (driver_id, period_from, period_to)
);

CREATE INDEX IF NOT EXISTS idx_dwd_driver ON public.driver_weekly_debts(driver_id);
CREATE INDEX IF NOT EXISTS idx_dwd_period ON public.driver_weekly_debts(period_from, period_to);
CREATE INDEX IF NOT EXISTS idx_dwd_settlement ON public.driver_weekly_debts(settlement_id);

-- Tabela 2: wpłaty długu w tygodniu
CREATE TABLE IF NOT EXISTS public.driver_weekly_debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_debt_id uuid NULL REFERENCES public.driver_weekly_debts(id) ON DELETE SET NULL,
  driver_id uuid NOT NULL,
  settlement_id uuid NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  amount numeric NOT NULL,
  payment_type text NOT NULL DEFAULT 'manual_payment',
  note text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dwdp_driver_period ON public.driver_weekly_debt_payments(driver_id, period_from, period_to);
CREATE INDEX IF NOT EXISTS idx_dwdp_settlement ON public.driver_weekly_debt_payments(settlement_id);
CREATE INDEX IF NOT EXISTS idx_dwdp_weekly_debt ON public.driver_weekly_debt_payments(weekly_debt_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.dwd_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dwd_updated_at ON public.driver_weekly_debts;
CREATE TRIGGER trg_dwd_updated_at
BEFORE UPDATE ON public.driver_weekly_debts
FOR EACH ROW EXECUTE FUNCTION public.dwd_set_updated_at();

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.driver_weekly_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_weekly_debt_payments ENABLE ROW LEVEL SECURITY;

-- Helper: czy kierowca należy do floty użytkownika
CREATE OR REPLACE FUNCTION public.user_can_access_driver(_user_id uuid, _driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.id = _driver_id
      AND (
        public.has_role(_user_id, 'admin'::app_role)
        OR d.fleet_id = public.get_user_fleet_id(_user_id)
      )
  );
$$;

-- Helper: czy zalogowany kierowca jest właścicielem rekordu
CREATE OR REPLACE FUNCTION public.driver_owns_record(_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.driver_app_users dau
    WHERE dau.user_id = auth.uid() AND dau.driver_id = _driver_id
  );
$$;

-- Polityki dla driver_weekly_debts
DROP POLICY IF EXISTS dwd_admin_all ON public.driver_weekly_debts;
CREATE POLICY dwd_admin_all ON public.driver_weekly_debts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS dwd_fleet_all ON public.driver_weekly_debts;
CREATE POLICY dwd_fleet_all ON public.driver_weekly_debts
  FOR ALL TO authenticated
  USING (public.user_can_access_driver(auth.uid(), driver_id))
  WITH CHECK (public.user_can_access_driver(auth.uid(), driver_id));

DROP POLICY IF EXISTS dwd_driver_select ON public.driver_weekly_debts;
CREATE POLICY dwd_driver_select ON public.driver_weekly_debts
  FOR SELECT TO authenticated
  USING (public.driver_owns_record(driver_id));

-- Polityki dla driver_weekly_debt_payments
DROP POLICY IF EXISTS dwdp_admin_all ON public.driver_weekly_debt_payments;
CREATE POLICY dwdp_admin_all ON public.driver_weekly_debt_payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS dwdp_fleet_all ON public.driver_weekly_debt_payments;
CREATE POLICY dwdp_fleet_all ON public.driver_weekly_debt_payments
  FOR ALL TO authenticated
  USING (public.user_can_access_driver(auth.uid(), driver_id))
  WITH CHECK (public.user_can_access_driver(auth.uid(), driver_id));

DROP POLICY IF EXISTS dwdp_driver_select ON public.driver_weekly_debt_payments;
CREATE POLICY dwdp_driver_select ON public.driver_weekly_debt_payments
  FOR SELECT TO authenticated
  USING (public.driver_owns_record(driver_id));