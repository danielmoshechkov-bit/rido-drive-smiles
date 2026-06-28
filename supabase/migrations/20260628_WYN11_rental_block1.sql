-- =====================================================================
-- WYN11 — Blok 1: Cennik + Kalendarz + Zlecenia + Płatności
-- ADDYTYWNA. NIE rusza tabel legacy. RLS = is_company_member + can_use_module.
-- =====================================================================

-- ---- CENNIK ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_rate_cards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_id  uuid REFERENCES public.rental_subjects(id) ON DELETE CASCADE,  -- NULL = domyślny firmy
  currency    text NOT NULL DEFAULT 'PLN',
  rate_hour   numeric,
  rate_day    numeric,
  rate_week   numeric,
  rate_month  numeric,
  deposit     numeric,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rrc_subject_uq ON public.rental_rate_cards(subject_id) WHERE subject_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rrc_company_default_uq ON public.rental_rate_cards(company_id) WHERE subject_id IS NULL;

CREATE TABLE IF NOT EXISTS public.rental_rate_tiers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rate_card_id     uuid NOT NULL REFERENCES public.rental_rate_cards(id) ON DELETE CASCADE,
  min_days         integer NOT NULL,
  discount_percent numeric NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rrt_card_idx ON public.rental_rate_tiers(rate_card_id);

-- ---- KALENDARZ: blokady ręczne --------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.rental_subjects(id) ON DELETE CASCADE,
  start_at   timestamptz NOT NULL,
  end_at     timestamptz NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rb_subject_idx ON public.rental_blocks(subject_id);

-- ---- NAJEMCY ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_renters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  renter_type  text NOT NULL DEFAULT 'private',  -- 'private'|'driver'|'company'
  full_name    text,
  company_name text,
  nip          text,
  pesel        text,
  phone        text,
  email        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_renters_type_chk CHECK (renter_type IN ('private','driver','company'))
);

-- ---- PŁATNOŚCI -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id         uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  kind               text NOT NULL DEFAULT 'oplata',  -- 'oplata'|'kaucja'|'zwrot'
  amount             numeric NOT NULL DEFAULT 0,
  method             text NOT NULL DEFAULT 'reczna',  -- 'reczna'|'bramka'
  status             text NOT NULL DEFAULT 'oczekuje',-- 'oczekuje'|'oplacone'|'zwrocone'|'potracone'
  paid_at            timestamptz,
  link_url           text,
  link_token         text,
  gateway_session_id text,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_payments_kind_chk CHECK (kind IN ('oplata','kaucja','zwrot')),
  CONSTRAINT rental_payments_method_chk CHECK (method IN ('reczna','bramka')),
  CONSTRAINT rental_payments_status_chk CHECK (status IN ('oczekuje','oplacone','zwrocone','potracone'))
);
CREATE INDEX IF NOT EXISTS rp_booking_idx ON public.rental_payments(booking_id);

-- ---- bookings: najemca z wizarda ------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS renter_id    uuid REFERENCES public.rental_renters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS renter_type  text,
  ADD COLUMN IF NOT EXISTS renter_nip   text,
  ADD COLUMN IF NOT EXISTS renter_pesel text;

-- ---- RLS ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rental_rate_cards','rental_rate_tiers','rental_blocks','rental_renters','rental_payments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING ((public.is_company_member(company_id) AND public.can_use_module(company_id,'rental')) OR public.has_role(auth.uid(),'admin'::public.app_role))
      WITH CHECK ((public.is_company_member(company_id) AND public.can_use_module(company_id,'rental')) OR public.has_role(auth.uid(),'admin'::public.app_role));
    $p$, t || '_all', t);
  END LOOP;
END $$;

-- ---- RPC: wycena ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.rental_calc_price(p_subject_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  rc record; v record;
  r_hour numeric; r_day numeric; r_week numeric; r_month numeric; r_deposit numeric;
  total_hours numeric; total_days numeric;
  rem int; months int := 0; weeks int := 0; days int := 0;
  base numeric := 0; card_id uuid; disc numeric := 0; final numeric;
BEGIN
  IF p_end <= p_start THEN RETURN jsonb_build_object('error','Nieprawidłowy okres'); END IF;

  SELECT * INTO rc FROM public.rental_rate_cards WHERE subject_id = p_subject_id LIMIT 1;
  IF FOUND THEN
    r_hour:=rc.rate_hour; r_day:=rc.rate_day; r_week:=rc.rate_week; r_month:=rc.rate_month; r_deposit:=rc.deposit; card_id:=rc.id;
  ELSE
    SELECT * INTO v FROM public.rental_vehicles WHERE subject_id = p_subject_id LIMIT 1;
    IF FOUND THEN r_day:=v.rate_daily; r_week:=v.rate_weekly; r_month:=v.rate_monthly; r_deposit:=v.deposit; END IF;
    IF r_day IS NULL AND r_week IS NULL AND r_month IS NULL THEN
      SELECT rc2.* INTO rc FROM public.rental_rate_cards rc2
        JOIN public.rental_subjects s ON s.owner_company_id = rc2.company_id
        WHERE rc2.subject_id IS NULL AND s.id = p_subject_id LIMIT 1;
      IF FOUND THEN r_hour:=rc.rate_hour; r_day:=rc.rate_day; r_week:=rc.rate_week; r_month:=rc.rate_month; r_deposit:=COALESCE(r_deposit,rc.deposit); card_id:=rc.id; END IF;
    END IF;
  END IF;

  total_hours := ceil(extract(epoch from (p_end - p_start))/3600.0);
  total_days  := ceil(total_hours/24.0);

  IF total_days <= 1 AND r_hour IS NOT NULL AND r_hour > 0 AND total_hours < 24 THEN
    base := total_hours * r_hour;
  ELSE
    rem := total_days::int;
    IF r_month IS NOT NULL AND r_month > 0 THEN months := floor(rem/30.0); rem := rem - months*30; END IF;
    IF r_week  IS NOT NULL AND r_week  > 0 THEN weeks  := floor(rem/7.0);  rem := rem - weeks*7;  END IF;
    days := rem;
    base := months*COALESCE(r_month,0) + weeks*COALESCE(r_week,0) + days*COALESCE(r_day,0);
    IF r_day IS NULL AND days > 0 AND r_week IS NOT NULL THEN base := base + COALESCE(r_week,0); END IF;
    IF r_day IS NOT NULL AND r_day > 0 THEN base := LEAST(base, total_days * r_day); END IF;
  END IF;

  IF card_id IS NOT NULL THEN
    SELECT COALESCE(MAX(discount_percent),0) INTO disc FROM public.rental_rate_tiers WHERE rate_card_id = card_id AND min_days <= total_days;
  END IF;
  final := base - base*disc/100.0;

  RETURN jsonb_build_object(
    'amount', round(COALESCE(final,0),2), 'base', round(COALESCE(base,0),2),
    'deposit', COALESCE(r_deposit,0), 'total_days', total_days, 'total_hours', total_hours,
    'discount_percent', disc,
    'breakdown', jsonb_build_object('months',months,'weeks',weeks,'days',days),
    'rate', jsonb_build_object('hour',r_hour,'day',r_day,'week',r_week,'month',r_month)
  );
END;
$$;

-- ---- RPC: dostępność (anti-double-booking) --------------------------
CREATE OR REPLACE FUNCTION public.rental_check_availability(p_subject_id uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE conflicts jsonb := '[]'::jsonb; subj_status text;
BEGIN
  SELECT status INTO subj_status FROM public.rental_subjects WHERE id = p_subject_id;
  SELECT conflicts || COALESCE(jsonb_agg(jsonb_build_object('type','booking','from',period_start,'to',period_end,'label',COALESCE(renter_name,booking_number),'status',status)),'[]'::jsonb)
    INTO conflicts FROM public.bookings
    WHERE subject_id = p_subject_id AND status IN ('new','pending_confirmation','confirmed','in_progress')
      AND (p_exclude IS NULL OR id <> p_exclude) AND p_start < period_end AND p_end > period_start;
  SELECT conflicts || COALESCE(jsonb_agg(jsonb_build_object('type','block','from',start_at,'to',end_at,'label',COALESCE(reason,'Blokada'))),'[]'::jsonb)
    INTO conflicts FROM public.rental_blocks
    WHERE subject_id = p_subject_id AND p_start < end_at AND p_end > start_at;
  RETURN jsonb_build_object('available', (jsonb_array_length(conflicts) = 0 AND COALESCE(subj_status,'available') = 'available'),
    'subject_status', subj_status, 'conflicts', conflicts);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rental_calc_price(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rental_check_availability(uuid, timestamptz, timestamptz, uuid) TO authenticated;
