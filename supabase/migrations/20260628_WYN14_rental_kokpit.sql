-- =====================================================================
-- WYN14 — Kokpit zarządcy floty: RPC agregujące "co wymaga uwagi"
-- ADDYTYWNA (tylko funkcja). STABLE/invoker → RLS naturalnie ogranicza do firmy.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rental_dashboard_summary(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total int; busy int; maint int;
  oc jsonb; insp jsonb; overdue jsonb; ret_today jsonb; ret_tom jsonb; dep jsonb;
BEGIN
  -- autoryzacja: tylko członek firmy lub admin
  IF NOT (public.is_company_member(p_company_id) OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  SELECT count(*) INTO total FROM public.rental_subjects WHERE owner_company_id=p_company_id AND subject_kind='vehicle';
  SELECT count(*) INTO maint FROM public.rental_subjects WHERE owner_company_id=p_company_id AND subject_kind='vehicle' AND status='maintenance';
  SELECT count(DISTINCT subject_id) INTO busy FROM public.bookings
    WHERE company_id=p_company_id AND status IN ('confirmed','in_progress')
      AND period_start < (current_date + 1) AND period_end > current_date;

  WITH latest_oc AS (
    SELECT DISTINCT ON (subject_id) subject_id, valid_to FROM public.rental_vehicle_policies
    WHERE company_id=p_company_id AND ptype='OC' ORDER BY subject_id, valid_to DESC)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('subject_id',l.subject_id,'label',COALESCE(NULLIF(trim(COALESCE(v.plate,'')||' '||COALESCE(v.brand,'')||' '||COALESCE(v.model,'')),''),s.title),'valid_to',l.valid_to) ORDER BY l.valid_to),'[]'::jsonb)
    INTO oc FROM latest_oc l JOIN public.rental_subjects s ON s.id=l.subject_id LEFT JOIN public.rental_vehicles v ON v.subject_id=l.subject_id
    WHERE l.valid_to <= current_date + 30;

  WITH latest_in AS (
    SELECT DISTINCT ON (subject_id) subject_id, valid_to FROM public.rental_vehicle_inspections
    WHERE company_id=p_company_id ORDER BY subject_id, valid_to DESC)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('subject_id',l.subject_id,'label',COALESCE(NULLIF(trim(COALESCE(v.plate,'')||' '||COALESCE(v.brand,'')||' '||COALESCE(v.model,'')),''),s.title),'valid_to',l.valid_to) ORDER BY l.valid_to),'[]'::jsonb)
    INTO insp FROM latest_in l JOIN public.rental_subjects s ON s.id=l.subject_id LEFT JOIN public.rental_vehicles v ON v.subject_id=l.subject_id
    WHERE l.valid_to <= current_date + 30;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('booking_id',b.id,'booking_number',b.booking_number,'renter_name',b.renter_name,'amount',COALESCE(b.rate_amount,b.estimated_price),'period_end',b.period_end) ORDER BY b.period_end),'[]'::jsonb)
    INTO overdue FROM public.bookings b
    WHERE b.company_id=p_company_id AND b.status NOT IN ('cancelled','completed') AND b.period_end < now()
      AND COALESCE(b.rate_amount,b.estimated_price,0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.rental_payments rp WHERE rp.booking_id=b.id AND rp.kind='oplata' AND rp.status='oplacone');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('booking_id',id,'booking_number',booking_number,'renter_name',renter_name,'period_end',period_end)),'[]'::jsonb)
    INTO ret_today FROM public.bookings WHERE company_id=p_company_id AND status IN ('confirmed','in_progress') AND period_end::date = current_date;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('booking_id',id,'booking_number',booking_number,'renter_name',renter_name,'period_end',period_end)),'[]'::jsonb)
    INTO ret_tom FROM public.bookings WHERE company_id=p_company_id AND status IN ('confirmed','in_progress') AND period_end::date = current_date + 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('booking_id',b.id,'booking_number',b.booking_number,'renter_name',b.renter_name)),'[]'::jsonb)
    INTO dep FROM public.bookings b
    WHERE b.company_id=p_company_id AND b.status='completed'
      AND EXISTS (SELECT 1 FROM public.rental_payments rp WHERE rp.booking_id=b.id AND rp.kind='kaucja' AND rp.status='oplacone');

  RETURN jsonb_build_object(
    'vehicles', jsonb_build_object('total',total,'busy_today',busy,'free_today',GREATEST(total-busy-maint,0),'maintenance',maint),
    'oc_expiring', oc, 'inspection_expiring', insp, 'overdue', overdue,
    'returns_today', ret_today, 'returns_tomorrow', ret_tom, 'deposits_return', dep);
END; $$;

GRANT EXECUTE ON FUNCTION public.rental_dashboard_summary(uuid) TO authenticated;
