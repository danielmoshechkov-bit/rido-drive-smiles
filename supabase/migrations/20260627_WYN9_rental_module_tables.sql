-- =====================================================================
-- WYN9 — Tabele modułu Flota & Wynajem (Paczka 3.2)
-- Dokumenty/zdjęcia/serwisy/OC/przegląd/umowy/protokoły — NA NOWYCH tabelach.
-- Migracja ADDYTYWNA. NIE rusza tabel legacy (vehicles/vehicle_policies/
-- documents/vehicle_services/fleet_document_* itd.).
-- RLS: is_company_member(company_id) AND can_use_module(company_id,'rental').
-- =====================================================================

-- ---- Dokumenty pojazdu (dowód, OC skan, przegląd skan, inne) ----------
CREATE TABLE IF NOT EXISTS public.rental_vehicle_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_id  uuid NOT NULL REFERENCES public.rental_subjects(id) ON DELETE CASCADE,
  doc_type    text NOT NULL,             -- 'dowod'|'oc'|'przeglad'|'inne'
  file_url    text NOT NULL,
  file_name   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid DEFAULT auth.uid()
);

-- ---- Zdjęcia pojazdu (galeria + pod giełdę) ---------------------------
CREATE TABLE IF NOT EXISTS public.rental_vehicle_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_id  uuid NOT NULL REFERENCES public.rental_subjects(id) ON DELETE CASCADE,
  file_url    text NOT NULL,
  caption     text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---- Serwisy ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_vehicle_services (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_id   uuid NOT NULL REFERENCES public.rental_subjects(id) ON DELETE CASCADE,
  service_type text,
  service_date date,
  odometer     integer,
  cost         numeric,
  description  text,
  provider     text,
  file_url     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---- Polisy (OC/AC) ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_vehicle_policies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_id  uuid NOT NULL REFERENCES public.rental_subjects(id) ON DELETE CASCADE,
  ptype       text NOT NULL DEFAULT 'OC',   -- 'OC'|'AC'
  policy_no   text,
  provider    text,
  valid_from  date,
  valid_to    date,
  premium     numeric,                       -- cena polisy
  file_url    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---- Przeglądy --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_vehicle_inspections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_id      uuid NOT NULL REFERENCES public.rental_subjects(id) ON DELETE CASCADE,
  inspection_date date,
  valid_to        date,
  result          text DEFAULT 'pozytywny',
  file_url        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---- Szablony umów ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_contract_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  code        text,
  content     text,
  version     text DEFAULT '1.0',
  status      text NOT NULL DEFAULT 'active', -- 'active'|'archived'
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid DEFAULT auth.uid()
);

-- ---- Instancje dokumentów (Wysłane/Podpisane) -------------------------
CREATE TABLE IF NOT EXISTS public.rental_document_instances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id      uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  subject_id      uuid REFERENCES public.rental_subjects(id) ON DELETE SET NULL,
  template_name   text,
  contract_number text,
  status          text NOT NULL DEFAULT 'draft',  -- 'draft'|'sent'|'signed'
  filled_data     jsonb NOT NULL DEFAULT '{}'::jsonb,
  filled_content  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  signed_at       timestamptz,
  created_by      uuid DEFAULT auth.uid()
);

-- ---- Protokoły wydania/zwrotu ----------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_protocols (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id       uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  phase            text NOT NULL,           -- 'handover'|'return'
  mileage          integer,
  fuel_level       text,
  notes            text,
  signed_summary_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid DEFAULT auth.uid(),
  CONSTRAINT rental_protocols_phase_chk CHECK (phase IN ('handover','return'))
);

CREATE TABLE IF NOT EXISTS public.rental_protocol_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id uuid NOT NULL REFERENCES public.rental_protocols(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category    text,
  file_url    text NOT NULL,
  taken_at    timestamptz NOT NULL DEFAULT now()
);

-- ---- Szkody -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_damages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  booking_id    uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  phase         text,                       -- 'handover'|'return'
  location_label text,
  description   text,
  severity      text,
  cost_estimate numeric,
  file_url      text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---- Indeksy ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS rvd_subject_idx   ON public.rental_vehicle_documents(subject_id);
CREATE INDEX IF NOT EXISTS rvp_subject_idx   ON public.rental_vehicle_photos(subject_id);
CREATE INDEX IF NOT EXISTS rvs_subject_idx   ON public.rental_vehicle_services(subject_id);
CREATE INDEX IF NOT EXISTS rvpol_subject_idx ON public.rental_vehicle_policies(subject_id);
CREATE INDEX IF NOT EXISTS rvi_subject_idx   ON public.rental_vehicle_inspections(subject_id);
CREATE INDEX IF NOT EXISTS rct_company_idx   ON public.rental_contract_templates(company_id);
CREATE INDEX IF NOT EXISTS rdi_company_idx   ON public.rental_document_instances(company_id);
CREATE INDEX IF NOT EXISTS rprot_booking_idx ON public.rental_protocols(booking_id);
CREATE INDEX IF NOT EXISTS rpp_protocol_idx  ON public.rental_protocol_photos(protocol_id);
CREATE INDEX IF NOT EXISTS rdam_booking_idx  ON public.rental_damages(booking_id);

-- ---- RLS (jeden FOR ALL policy per tabela; admin zawsze) -------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rental_vehicle_documents','rental_vehicle_photos','rental_vehicle_services',
    'rental_vehicle_policies','rental_vehicle_inspections','rental_contract_templates',
    'rental_document_instances','rental_protocols','rental_damages'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING (
        (public.is_company_member(company_id) AND public.can_use_module(company_id,'rental'))
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
      WITH CHECK (
        (public.is_company_member(company_id) AND public.can_use_module(company_id,'rental'))
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      );
    $p$, t || '_all', t);
  END LOOP;
END $$;

-- rental_protocol_photos: scope przez company_id (jak wyżej)
ALTER TABLE public.rental_protocol_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rental_protocol_photos_all ON public.rental_protocol_photos FOR ALL TO authenticated
  USING (
    (public.is_company_member(company_id) AND public.can_use_module(company_id,'rental'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    (public.is_company_member(company_id) AND public.can_use_module(company_id,'rental'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- =====================================================================
-- WERYFIKACJA:
--   SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'rental_%';
-- =====================================================================
