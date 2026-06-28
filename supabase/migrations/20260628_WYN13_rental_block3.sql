-- =====================================================================
-- WYN13 — Blok 3: Giełda (mapa) + Wybierz moduł floty + RPC rezerwacji z portalu
-- ADDYTYWNA. Publikujemy do ŻYWEGO vehicle_listings (zero zmian jego schematu);
-- tu tylko MAPA rental_listings + preferencje paska floty + RPC anon.
-- =====================================================================

-- ---- Mapa najem/sprzedaż <-> ogłoszenie (vehicle_listings) ----------
CREATE TABLE IF NOT EXISTS public.rental_listings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_id        uuid NOT NULL REFERENCES public.rental_subjects(id) ON DELETE CASCADE,
  vehicle_listing_id uuid,            -- logiczny do vehicle_listings.id (inny moduł)
  kind              text NOT NULL DEFAULT 'rental',  -- 'rental'|'sale'
  transaction_type  text,
  status            text NOT NULL DEFAULT 'active',  -- 'active'|'archived'
  is_featured       boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rl_subject_idx ON public.rental_listings(subject_id);
CREATE INDEX IF NOT EXISTS rl_listing_idx ON public.rental_listings(vehicle_listing_id);

-- ---- Preferencje paska panelu flotowego ("Wybierz moduł") ----------
CREATE TABLE IF NOT EXISTS public.fleet_nav_preferences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  company_id   uuid,
  primary_tabs text[] NOT NULL DEFAULT '{}',
  hidden_tabs  text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fnp_user_uq UNIQUE (user_id)
);

-- ---- RLS ----
ALTER TABLE public.rental_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY rental_listings_all ON public.rental_listings FOR ALL TO authenticated
  USING ((public.is_company_member(company_id) AND public.can_use_module(company_id,'rental')) OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK ((public.is_company_member(company_id) AND public.can_use_module(company_id,'rental')) OR public.has_role(auth.uid(),'admin'::public.app_role));

ALTER TABLE public.fleet_nav_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY fnp_self ON public.fleet_nav_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role));

-- ---- RPC: dostępność oferty (anon portal) --------------------------
CREATE OR REPLACE FUNCTION public.rental_listing_availability(p_listing_id uuid, p_start timestamptz DEFAULT NULL, p_end timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE rl record; conflicts jsonb := '[]'::jsonb; subj_status text;
BEGIN
  SELECT * INTO rl FROM public.rental_listings WHERE vehicle_listing_id = p_listing_id AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('mapped', false); END IF;
  IF p_start IS NULL OR p_end IS NULL THEN RETURN jsonb_build_object('mapped', true, 'subject_id', rl.subject_id); END IF;
  SELECT status INTO subj_status FROM public.rental_subjects WHERE id = rl.subject_id;
  SELECT conflicts || COALESCE(jsonb_agg(jsonb_build_object('from',period_start,'to',period_end)),'[]'::jsonb) INTO conflicts
    FROM public.bookings WHERE subject_id = rl.subject_id AND status IN ('new','pending_confirmation','confirmed','in_progress') AND p_start < period_end AND p_end > period_start;
  SELECT conflicts || COALESCE(jsonb_agg(jsonb_build_object('from',start_at,'to',end_at,'block',true)),'[]'::jsonb) INTO conflicts
    FROM public.rental_blocks WHERE subject_id = rl.subject_id AND p_start < end_at AND p_end > start_at;
  RETURN jsonb_build_object('mapped', true, 'subject_id', rl.subject_id,
    'available', (jsonb_array_length(conflicts) = 0 AND COALESCE(subj_status,'available')='available'), 'conflicts', conflicts);
END; $$;

-- ---- RPC: rezerwacja z portalu (anon) -> bookings source='gielda' ---
CREATE OR REPLACE FUNCTION public.rental_create_gielda_booking(
  p_listing_id uuid, p_start timestamptz, p_end timestamptz, p_name text, p_phone text, p_email text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rl record; av jsonb; bn text;
BEGIN
  SELECT * INTO rl FROM public.rental_listings WHERE vehicle_listing_id = p_listing_id AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_mapped'); END IF;
  IF p_end <= p_start THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_period'); END IF;
  av := public.rental_listing_availability(p_listing_id, p_start, p_end);
  IF NOT (av->>'available')::boolean THEN RETURN jsonb_build_object('ok', false, 'error', 'busy'); END IF;
  INSERT INTO public.bookings (company_id, subject_id, listing_id, renter_name, renter_phone, renter_email, renter_notes, period_start, period_end, status, source)
    VALUES (rl.company_id, rl.subject_id, p_listing_id, p_name, p_phone, p_email, p_notes, p_start, p_end, 'pending_confirmation', 'gielda')
    RETURNING booking_number INTO bn;
  RETURN jsonb_build_object('ok', true, 'booking_number', bn);
END; $$;

GRANT EXECUTE ON FUNCTION public.rental_listing_availability(uuid, timestamptz, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rental_create_gielda_booking(uuid, timestamptz, timestamptz, text, text, text, text) TO anon, authenticated;
