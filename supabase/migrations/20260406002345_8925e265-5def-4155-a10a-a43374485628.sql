
-- Workshop client bookings table
CREATE TABLE public.workshop_client_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  plate TEXT,
  brand TEXT,
  model TEXT,
  service_description TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  station_id UUID,
  reminder_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_24h_sent BOOLEAN NOT NULL DEFAULT false,
  reminder_2h_sent BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated at trigger
CREATE TRIGGER set_workshop_client_bookings_updated_at
  BEFORE UPDATE ON public.workshop_client_bookings
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- RLS
ALTER TABLE public.workshop_client_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own workshop bookings"
  ON public.workshop_client_bookings
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
