
-- 1. Vehicle Owners - osoby/firmy od których flota wynajmuje auta
CREATE TABLE public.vehicle_owners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fleet_id UUID NOT NULL REFERENCES public.fleets(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- imię i nazwisko lub nazwa firmy
  company_name TEXT,
  nip TEXT,
  phone TEXT,
  email TEXT,
  bank_account TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet members can view vehicle owners"
  ON public.vehicle_owners FOR SELECT
  USING (true);

CREATE POLICY "Fleet members can insert vehicle owners"
  ON public.vehicle_owners FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Fleet members can update vehicle owners"
  ON public.vehicle_owners FOR UPDATE
  USING (true);

CREATE POLICY "Fleet members can delete vehicle owners"
  ON public.vehicle_owners FOR DELETE
  USING (true);

-- 2. Dodaj owner_id do vehicles
ALTER TABLE public.vehicles ADD COLUMN owner_id UUID REFERENCES public.vehicle_owners(id) ON DELETE SET NULL;

-- 3. Vehicle owner charges - tygodniowe naliczenia i rozliczenia
CREATE TABLE public.vehicle_owner_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fleet_id UUID NOT NULL REFERENCES public.fleets(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.vehicle_owners(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  adjustment NUMERIC NOT NULL DEFAULT 0, -- korekta np. auto w serwisie
  adjustment_note TEXT,
  is_settled BOOLEAN NOT NULL DEFAULT false,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_owner_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet can view charges" ON public.vehicle_owner_charges FOR SELECT USING (true);
CREATE POLICY "Fleet can insert charges" ON public.vehicle_owner_charges FOR INSERT WITH CHECK (true);
CREATE POLICY "Fleet can update charges" ON public.vehicle_owner_charges FOR UPDATE USING (true);
CREATE POLICY "Fleet can delete charges" ON public.vehicle_owner_charges FOR DELETE USING (true);

-- 4. Fleet city settings - ustawienia rozliczeń per miasto
CREATE TABLE public.fleet_city_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fleet_id UUID NOT NULL REFERENCES public.fleets(id) ON DELETE CASCADE,
  city_name TEXT NOT NULL,
  settlement_mode TEXT NOT NULL DEFAULT 'single_tax',
  vat_rate NUMERIC NOT NULL DEFAULT 8,
  base_fee NUMERIC NOT NULL DEFAULT 0,
  additional_percent_rate NUMERIC NOT NULL DEFAULT 0,
  secondary_vat_rate NUMERIC NOT NULL DEFAULT 23,
  invoice_email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fleet_id, city_name)
);

ALTER TABLE public.fleet_city_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet can view city settings" ON public.fleet_city_settings FOR SELECT USING (true);
CREATE POLICY "Fleet can insert city settings" ON public.fleet_city_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Fleet can update city settings" ON public.fleet_city_settings FOR UPDATE USING (true);
CREATE POLICY "Fleet can delete city settings" ON public.fleet_city_settings FOR DELETE USING (true);
