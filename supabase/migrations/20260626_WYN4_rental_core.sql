-- =====================================================================
-- WYN4 — Rdzeń wynajmu: rental_subjects, rental_vehicles, bookings
-- Paczka 2. Migracja ADDYTYWNA.
-- Dokument: docs/wynajem-mvp-projekt.md (pkt 2.1 / 2.2 / 2.3)
--
-- - rental_subjects: polimorficzny rodzic (vehicle|equipment|other),
--   pola telematyki = MIEJSCA (bez logiki w tej paczce).
-- - rental_vehicles: dziecko 1:1 (subject_id PK = REALNY FK do rodzica).
-- - bookings: KSZTAŁT service_bookings, ale okres jako timestamptz
--   (period_start/end) i status = KANON ze service_bookings.
-- - Spójność subject_kind <-> rental_vehicles pilnowana TRIGGEREM (w bazie).
-- - RLS = is_company_member(...) AND can_use_module(..., 'rental')  [N2].
--
-- NIE rusza: service_bookings (kopiujemy tylko kształt), vehicle_rentals, payments.
-- =====================================================================

-- ---- 1) rental_subjects (rodzic polimorficzny) ----------------------
CREATE TABLE IF NOT EXISTS public.rental_subjects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_kind        text NOT NULL,                  -- 'vehicle'|'equipment'|'other'
  title               text NOT NULL,
  status              text NOT NULL DEFAULT 'available', -- 'available'|'maintenance'|'retired'
  attributes          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- TELEMATYKA (provider-agnostic; tylko miejsca w modelu, pkt 11)
  telematics_provider text,
  device_id           text,
  last_location       jsonb,
  last_mileage        numeric,
  last_seen_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_subjects_kind_chk
    CHECK (subject_kind IN ('vehicle','equipment','other')),
  CONSTRAINT rental_subjects_status_chk
    CHECK (status IN ('available','maintenance','retired'))
);

CREATE INDEX IF NOT EXISTS rental_subjects_company_idx
  ON public.rental_subjects(owner_company_id);
CREATE INDEX IF NOT EXISTS rental_subjects_kind_idx
  ON public.rental_subjects(subject_kind);

CREATE TRIGGER trg_rental_subjects_touch
  BEFORE UPDATE ON public.rental_subjects
  FOR EACH ROW EXECUTE FUNCTION public.rental_touch_updated_at();

-- ---- 2) rental_vehicles (dziecko 1:1, REALNY FK) -------------------
-- subject_id jest PK i FK jednocześnie -> twarda relacja 1:1.
CREATE TABLE IF NOT EXISTS public.rental_vehicles (
  subject_id uuid PRIMARY KEY REFERENCES public.rental_subjects(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id),  -- opc. podpięcie istniejącego pojazdu floty
  brand      text,
  model      text,
  plate      text,
  vin        text,
  year       integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_rental_vehicles_touch
  BEFORE UPDATE ON public.rental_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.rental_touch_updated_at();

-- ---- 3) Spójność subject_kind <-> rental_vehicles (TRIGGERY) -------
-- (a) rental_vehicles może wskazywać tylko na rodzica o subject_kind='vehicle'.
CREATE OR REPLACE FUNCTION public.enforce_rental_vehicle_kind()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT subject_kind INTO v_kind
    FROM public.rental_subjects WHERE id = NEW.subject_id;
  IF v_kind IS DISTINCT FROM 'vehicle' THEN
    RAISE EXCEPTION
      'rental_vehicles wymaga rental_subjects.subject_kind = ''vehicle'' (subject_id=%, kind=%)',
      NEW.subject_id, v_kind;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rental_vehicles_kind
  BEFORE INSERT OR UPDATE ON public.rental_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rental_vehicle_kind();

-- (b) nie można zmienić subject_kind rodzica, gdy istnieje powiązane dziecko.
CREATE OR REPLACE FUNCTION public.guard_rental_subject_kind()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.subject_kind = 'vehicle'
     AND NEW.subject_kind IS DISTINCT FROM 'vehicle'
     AND EXISTS (SELECT 1 FROM public.rental_vehicles WHERE subject_id = OLD.id) THEN
    RAISE EXCEPTION
      'Nie można zmienić subject_kind: istnieje powiązany rental_vehicles (subject_id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rental_subjects_kind_guard
  BEFORE UPDATE ON public.rental_subjects
  FOR EACH ROW EXECUTE FUNCTION public.guard_rental_subject_kind();

-- ---- 4) bookings (KSZTAŁT service_bookings; okres timestamptz; KANON) -
CREATE SEQUENCE IF NOT EXISTS public.rental_booking_seq;

CREATE TABLE IF NOT EXISTS public.bookings (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_number             text UNIQUE NOT NULL,
  company_id                 uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_id                 uuid NOT NULL REFERENCES public.rental_subjects(id) ON DELETE RESTRICT,
  listing_id                 uuid,                  -- uniwersalny (giełda = późniejsza paczka), bez FK

  -- Najemca (na wzór customer_* w service_bookings)
  renter_user_id             uuid REFERENCES auth.users(id),
  renter_name                text NOT NULL,
  renter_email               text,
  renter_phone               text NOT NULL,

  -- Okres (ZMIANA vs service_bookings: timestamptz zamiast date+time+duration)
  period_start               timestamptz NOT NULL,
  period_end                 timestamptz NOT NULL,

  -- Cennik (snapshot per najem)
  rate_basis                 text,                  -- 'hour'|'day'|'week'|'month'
  rate_amount                numeric,
  estimated_price            numeric,
  final_price                numeric,
  deposit_amount             numeric,

  -- Status (KANON ze service_bookings)
  status                     text NOT NULL DEFAULT 'new',
  source                     text,                  -- 'calendar'|'gielda'|'uslugi'
  confirmation_token         text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  external_calendar_event_id text,                  -- miejsce pod Google (późniejsza paczka)

  -- Notatki
  renter_notes               text,
  operator_notes             text,

  -- Timestamps
  confirmed_at               timestamptz,
  started_at                 timestamptz,
  completed_at               timestamptz,
  cancelled_at               timestamptz,
  cancellation_reason        text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookings_status_chk
    CHECK (status IN ('new','pending_confirmation','confirmed','in_progress','completed','cancelled','no_show')),
  CONSTRAINT bookings_rate_basis_chk
    CHECK (rate_basis IS NULL OR rate_basis IN ('hour','day','week','month')),
  CONSTRAINT bookings_period_chk
    CHECK (period_end > period_start)
);

CREATE INDEX IF NOT EXISTS bookings_company_idx ON public.bookings(company_id);
CREATE INDEX IF NOT EXISTS bookings_subject_idx ON public.bookings(subject_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx  ON public.bookings(status);
CREATE INDEX IF NOT EXISTS bookings_period_idx  ON public.bookings(period_start, period_end);

-- Auto-numer rezerwacji (gdy nie podano): WYN-RRRR-NNNNNN
CREATE OR REPLACE FUNCTION public.set_booking_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.booking_number IS NULL OR NEW.booking_number = '' THEN
    NEW.booking_number := 'WYN-' || to_char(now(), 'YYYY') || '-' ||
                          lpad(nextval('public.rental_booking_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bookings_number
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_number();

CREATE TRIGGER trg_bookings_touch
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.rental_touch_updated_at();

-- ---- 5) RLS: członek firmy + gate modułu (N2) ----------------------
-- Wzorzec: USING ( is_company_member(<company>) AND can_use_module(<company>,'rental') )
-- Człon membership = scoping najemcy (brak wycieku między firmami).
-- can_use_module = gate uprawnienia do modułu. Admin zawsze.

ALTER TABLE public.rental_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- rental_subjects
CREATE POLICY "rental_subjects_select" ON public.rental_subjects
  FOR SELECT TO authenticated
  USING (
    (public.is_company_member(owner_company_id) AND public.can_use_module(owner_company_id, 'rental'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "rental_subjects_insert" ON public.rental_subjects
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_company_member(owner_company_id) AND public.can_use_module(owner_company_id, 'rental'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "rental_subjects_update" ON public.rental_subjects
  FOR UPDATE TO authenticated
  USING (
    (public.is_company_member(owner_company_id) AND public.can_use_module(owner_company_id, 'rental'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    (public.is_company_member(owner_company_id) AND public.can_use_module(owner_company_id, 'rental'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "rental_subjects_delete" ON public.rental_subjects
  FOR DELETE TO authenticated
  USING (
    (public.is_company_member(owner_company_id) AND public.can_use_module(owner_company_id, 'rental'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- rental_vehicles (scope przez rodzica)
CREATE POLICY "rental_vehicles_all" ON public.rental_vehicles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rental_subjects s
      WHERE s.id = rental_vehicles.subject_id
        AND (
          (public.is_company_member(s.owner_company_id) AND public.can_use_module(s.owner_company_id, 'rental'))
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rental_subjects s
      WHERE s.id = rental_vehicles.subject_id
        AND (
          (public.is_company_member(s.owner_company_id) AND public.can_use_module(s.owner_company_id, 'rental'))
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
    )
  );

-- bookings
CREATE POLICY "bookings_select" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    (public.is_company_member(company_id) AND public.can_use_module(company_id, 'rental'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "bookings_insert" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_company_member(company_id) AND public.can_use_module(company_id, 'rental'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "bookings_update" ON public.bookings
  FOR UPDATE TO authenticated
  USING (
    (public.is_company_member(company_id) AND public.can_use_module(company_id, 'rental'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    (public.is_company_member(company_id) AND public.can_use_module(company_id, 'rental'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "bookings_delete" ON public.bookings
  FOR DELETE TO authenticated
  USING (
    (public.is_company_member(company_id) AND public.can_use_module(company_id, 'rental'))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- =====================================================================
-- WERYFIKACJA:
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename IN ('rental_subjects','rental_vehicles','bookings')
--   ORDER BY tablename, cmd;
--   -- Trigger spójności: próba INSERT rental_vehicles na subject_kind<>'vehicle' -> EXCEPTION.
-- =====================================================================
