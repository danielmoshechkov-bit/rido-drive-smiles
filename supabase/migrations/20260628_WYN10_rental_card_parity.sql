-- =====================================================================
-- WYN10 — Parytet karty pojazdu ze starą Flotą (Paczka 3.2b)
-- Kolumny/tabele potrzebne, by skopiować kartę 1:1 na nowe tabele:
-- właściciel, opłata właściciela, data wypowiedzenia, galeria (jsonb),
-- giełda, przypisanie kierowcy, słownik serwisów, floty partnerskie.
-- ADDYTYWNA. NIE rusza tabel legacy.
-- =====================================================================

-- ---- Właściciele ("Nasz wynajem") -----------------------------------
CREATE TABLE IF NOT EXISTS public.rental_vehicle_owners (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name         text,
  company_name text,
  phone        text,
  email        text,
  nip          text,
  bank_account text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---- Kierowcy (źródło dropdownu „Kierowca" + „Dodaj kierowcę") -------
CREATE TABLE IF NOT EXISTS public.rental_drivers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name text,
  last_name  text,
  email      text,
  phone      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---- Przypisanie kierowcy do pojazdu (+ data „od") ------------------
CREATE TABLE IF NOT EXISTS public.rental_vehicle_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_id    uuid NOT NULL REFERENCES public.rental_subjects(id) ON DELETE CASCADE,
  driver_id     uuid REFERENCES public.rental_drivers(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'active',   -- 'active'|'inactive'
  assigned_at   timestamptz DEFAULT now(),
  unassigned_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rva_subject_idx ON public.rental_vehicle_assignments(subject_id);

-- ---- Słownik typów serwisu ------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_service_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---- Floty partnerskie ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_partner_fleets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  partner_name     text,
  nip              text,
  city             text,
  address          text,
  email            text,
  phone            text,
  is_b2b           boolean NOT NULL DEFAULT false,
  invoice_frequency text,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ---- Kolumny na rental_vehicles -------------------------------------
ALTER TABLE public.rental_vehicles
  ADD COLUMN IF NOT EXISTS contract_termination_date date,
  ADD COLUMN IF NOT EXISTS owner_id          uuid REFERENCES public.rental_vehicle_owners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_rental_fee  numeric,
  ADD COLUMN IF NOT EXISTS photos            jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_listed         boolean NOT NULL DEFAULT false;

-- ---- RLS ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rental_vehicle_owners','rental_drivers','rental_vehicle_assignments',
    'rental_service_types','rental_partner_fleets'
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

-- =====================================================================
-- WERYFIKACJA:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='rental_vehicles' AND column_name IN
--   ('contract_termination_date','owner_id','owner_rental_fee','photos','is_listed');
-- =====================================================================
