-- =====================================================================
-- WYN12 — Blok 2: Umowy/podpis + Przypomnienia + mapa faktur
-- ADDYTYWNA. Faktury podpinamy do ISTNIEJĄCEGO user_invoices (zero zmian
-- w jego schemacie) — tu tylko MAPA rental_booking_invoices.
-- =====================================================================

-- ---- Log podpisu umowy (FK do bookings, bo contract_signature_logs jest do vehicle_rentals)
CREATE TABLE IF NOT EXISTS public.rental_signature_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id  uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.rental_document_instances(id) ON DELETE CASCADE,
  action_type text NOT NULL,   -- 'email_sent'|'sms_sent'|'contract_viewed'|'signature_submitted'
  actor_type  text NOT NULL DEFAULT 'renter',
  actor_email text, ip_address text, user_agent text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---- Przypomnienia
CREATE TABLE IF NOT EXISTS public.rental_reminders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id   uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  subject_id   uuid REFERENCES public.rental_subjects(id) ON DELETE CASCADE,
  type         text NOT NULL,   -- end_rental|oc_expiry|inspection_expiry|payment_due|return_today|deposit_return
  channel      text NOT NULL DEFAULT 'sms',  -- 'sms'|'email'
  scheduled_for timestamptz,
  days_before  integer,
  status       text NOT NULL DEFAULT 'planned', -- 'planned'|'sent'|'skipped'
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rr_company_idx ON public.rental_reminders(company_id);

CREATE TABLE IF NOT EXISTS public.rental_reminder_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  days_before integer NOT NULL DEFAULT 3,
  sms         boolean NOT NULL DEFAULT true,
  email       boolean NOT NULL DEFAULT false,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rrs_uq UNIQUE (company_id, event_type)
);

-- ---- MAPA najem -> faktura (faktura żyje w user_invoices)
CREATE TABLE IF NOT EXISTS public.rental_booking_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id      uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_invoice_id uuid,         -- FK logiczny do user_invoices.id (bez twardego FK — inny moduł)
  invoice_number  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rbi_booking_idx ON public.rental_booking_invoices(booking_id);

-- ---- rental_document_instances: pola podpisu/wysyłki
ALTER TABLE public.rental_document_instances
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS signer_ip     text,
  ADD COLUMN IF NOT EXISTS sent_channel  text;

-- ---- RLS (company_id) ----
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rental_signature_logs','rental_reminders','rental_reminder_settings','rental_booking_invoices'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING ((public.is_company_member(company_id) AND public.can_use_module(company_id,'rental')) OR public.has_role(auth.uid(),'admin'::public.app_role))
      WITH CHECK ((public.is_company_member(company_id) AND public.can_use_module(company_id,'rental')) OR public.has_role(auth.uid(),'admin'::public.app_role));
    $p$, t || '_all', t);
  END LOOP;
END $$;

-- ---- RPC: portal podpisu (anon, przez confirmation_token) ----
-- Bez szerokiego RLS: SECURITY DEFINER, zwraca/aktualizuje TYLKO wiersz dla tokenu.
CREATE OR REPLACE FUNCTION public.rental_get_contract(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; di record;
BEGIN
  SELECT id, booking_number, renter_name, period_start, period_end, status INTO b FROM public.bookings WHERE confirmation_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO di FROM public.rental_document_instances WHERE booking_id = b.id ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('found', di.id IS NOT NULL,
    'booking', jsonb_build_object('booking_number', b.booking_number, 'renter_name', b.renter_name, 'period_start', b.period_start, 'period_end', b.period_end),
    'instance', CASE WHEN di.id IS NOT NULL THEN jsonb_build_object('id', di.id, 'status', di.status, 'filled_content', di.filled_content, 'signature_url', di.signature_url, 'template_name', di.template_name) ELSE NULL END);
END; $$;

CREATE OR REPLACE FUNCTION public.rental_sign_contract(p_token text, p_signature text, p_ip text DEFAULT NULL, p_ua text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; di record;
BEGIN
  SELECT id INTO b FROM public.bookings WHERE confirmation_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  SELECT * INTO di FROM public.rental_document_instances WHERE booking_id = b.id ORDER BY created_at DESC LIMIT 1;
  IF di.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_contract'); END IF;
  UPDATE public.rental_document_instances SET status = 'signed', signature_url = p_signature, signer_ip = p_ip, signed_at = now() WHERE id = di.id;
  INSERT INTO public.rental_signature_logs (company_id, booking_id, instance_id, action_type, actor_type, ip_address, user_agent)
    VALUES (di.company_id, b.id, di.id, 'signature_submitted', 'renter', p_ip, p_ua);
  RETURN jsonb_build_object('ok', true);
END; $$;

GRANT EXECUTE ON FUNCTION public.rental_get_contract(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rental_sign_contract(text, text, text, text) TO anon, authenticated;
