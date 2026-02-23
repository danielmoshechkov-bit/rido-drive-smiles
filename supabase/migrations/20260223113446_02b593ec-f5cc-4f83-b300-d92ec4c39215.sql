
-- Table: driver_fleet_partnerships
-- Links a driver to a partner fleet (external fleet that owns the car)
CREATE TABLE public.driver_fleet_partnerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  partner_fleet_id UUID NOT NULL REFERENCES public.fleets(id) ON DELETE CASCADE,
  managing_fleet_id UUID NOT NULL REFERENCES public.fleets(id) ON DELETE CASCADE,
  
  -- Who settles the driver
  settled_by TEXT NOT NULL DEFAULT 'managing' CHECK (settled_by IN ('managing', 'partner')),
  
  -- B2B invoicing settings
  is_b2b BOOLEAN NOT NULL DEFAULT false,
  invoice_frequency TEXT DEFAULT 'weekly' CHECK (invoice_frequency IN ('weekly', 'biweekly', 'monthly')),
  
  -- Payment details
  transfer_title_template TEXT DEFAULT 'Zaliczka na fakturę - rozliczenie kierowcy',
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- A driver can only have one active partnership with a given partner fleet
  UNIQUE(driver_id, partner_fleet_id)
);

-- Enable RLS
ALTER TABLE public.driver_fleet_partnerships ENABLE ROW LEVEL SECURITY;

-- RLS: Fleet managers can see partnerships for their fleet (as managing or partner)
CREATE POLICY "Fleet managers can view partnerships"
  ON public.driver_fleet_partnerships FOR SELECT TO authenticated
  USING (
    managing_fleet_id IN (SELECT fleet_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('fleet_settlement', 'fleet_rental'))
    OR partner_fleet_id IN (SELECT fleet_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('fleet_settlement', 'fleet_rental'))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Fleet managers can insert partnerships"
  ON public.driver_fleet_partnerships FOR INSERT TO authenticated
  WITH CHECK (
    managing_fleet_id IN (SELECT fleet_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('fleet_settlement', 'fleet_rental'))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Fleet managers can update partnerships"
  ON public.driver_fleet_partnerships FOR UPDATE TO authenticated
  USING (
    managing_fleet_id IN (SELECT fleet_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('fleet_settlement', 'fleet_rental'))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Fleet managers can delete partnerships"
  ON public.driver_fleet_partnerships FOR DELETE TO authenticated
  USING (
    managing_fleet_id IN (SELECT fleet_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('fleet_settlement', 'fleet_rental'))
    OR public.has_role(auth.uid(), 'admin')
  );

-- Trigger for updated_at
CREATE TRIGGER update_driver_fleet_partnerships_updated_at
  BEFORE UPDATE ON public.driver_fleet_partnerships
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- Admin RLS for fleets table INSERT (so fleet managers can create partner fleets)
CREATE POLICY "Fleet managers can insert new fleets as partners"
  ON public.fleets FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('fleet_settlement', 'fleet_rental', 'admin'))
  );
