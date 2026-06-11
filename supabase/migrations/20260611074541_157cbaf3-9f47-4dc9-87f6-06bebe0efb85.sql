
-- 1. Stanowiska (workshop stations - departments like Myjnia, Geometria, Mechanika)
CREATE TABLE IF NOT EXISTS public.workshop_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT '#8b5cf6',
  icon text DEFAULT 'wrench',
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workshop_stations TO authenticated;
GRANT ALL ON public.workshop_stations TO service_role;
ALTER TABLE public.workshop_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider manages own stations" ON public.workshop_stations
  FOR ALL USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

CREATE POLICY "Employees can read stations of their provider" ON public.workshop_stations
  FOR SELECT USING (provider_id IN (SELECT provider_id FROM workshop_employees WHERE user_id = auth.uid() AND status = 'active'));

-- 2. Mapping pracownik <-> stanowisko
CREATE TABLE IF NOT EXISTS public.workshop_station_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.workshop_stations(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL,
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(station_id, employee_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workshop_station_employees TO authenticated;
GRANT ALL ON public.workshop_station_employees TO service_role;
ALTER TABLE public.workshop_station_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider manages station employees" ON public.workshop_station_employees
  FOR ALL USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

CREATE POLICY "Employee can read own station assignments" ON public.workshop_station_employees
  FOR SELECT USING (employee_user_id = auth.uid());

-- 3. Historia zdarzeń (audit timeline + notatki wewnętrzne)
CREATE TABLE IF NOT EXISTS public.workshop_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.workshop_orders(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL,
  event_type text NOT NULL, -- status_change, claimed, released, quote_done, repair_started, repair_done, note_added, station_assigned, assigned, unassigned
  from_status text,
  to_status text,
  station_id uuid REFERENCES public.workshop_stations(id) ON DELETE SET NULL,
  note text,
  actor_user_id uuid,
  actor_name text,
  actor_role text, -- admin / employee / system
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workshop_order_events_order ON public.workshop_order_events(order_id, created_at DESC);
GRANT SELECT, INSERT ON public.workshop_order_events TO authenticated;
GRANT ALL ON public.workshop_order_events TO service_role;
ALTER TABLE public.workshop_order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider reads own order events" ON public.workshop_order_events
  FOR SELECT USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

CREATE POLICY "Provider inserts own order events" ON public.workshop_order_events
  FOR INSERT WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

CREATE POLICY "Employee reads events of provider" ON public.workshop_order_events
  FOR SELECT USING (provider_id IN (SELECT provider_id FROM workshop_employees WHERE user_id = auth.uid() AND status = 'active'));

CREATE POLICY "Employee inserts events for assigned/pool orders" ON public.workshop_order_events
  FOR INSERT WITH CHECK (
    actor_user_id = auth.uid() AND
    provider_id IN (SELECT provider_id FROM workshop_employees WHERE user_id = auth.uid() AND status = 'active')
  );

-- 4. Powiadomienia in-app dla pracowników
CREATE TABLE IF NOT EXISTS public.workshop_employee_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  order_id uuid REFERENCES public.workshop_orders(id) ON DELETE CASCADE,
  type text NOT NULL, -- assigned, quote_accepted, station_assigned, note_added, repair_done
  title text NOT NULL,
  body text,
  link text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workshop_employee_notif_user ON public.workshop_employee_notifications(employee_user_id, is_read, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workshop_employee_notifications TO authenticated;
GRANT ALL ON public.workshop_employee_notifications TO service_role;
ALTER TABLE public.workshop_employee_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User reads own notifications" ON public.workshop_employee_notifications
  FOR SELECT USING (employee_user_id = auth.uid());

CREATE POLICY "User updates own notifications" ON public.workshop_employee_notifications
  FOR UPDATE USING (employee_user_id = auth.uid()) WITH CHECK (employee_user_id = auth.uid());

CREATE POLICY "Provider can insert notifications" ON public.workshop_employee_notifications
  FOR INSERT WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

CREATE POLICY "Employee can insert notifications for provider mates" ON public.workshop_employee_notifications
  FOR INSERT WITH CHECK (provider_id IN (SELECT provider_id FROM workshop_employees WHERE user_id = auth.uid() AND status = 'active'));

-- 5. Rozszerzenie workshop_orders
ALTER TABLE public.workshop_orders
  ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES public.workshop_stations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS has_unread_notes boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS repaired_at timestamptz,
  ADD COLUMN IF NOT EXISTS repaired_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS quote_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_done_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS repair_started_at timestamptz;

-- 6. Trigger: na zmianę statusu zlecenia loguj event
CREATE OR REPLACE FUNCTION public.log_workshop_order_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name text;
BEGIN
  IF NEW.status_name IS DISTINCT FROM OLD.status_name THEN
    SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_name FROM workshop_employees WHERE user_id = v_actor AND provider_id = NEW.provider_id LIMIT 1;
    INSERT INTO workshop_order_events (order_id, provider_id, event_type, from_status, to_status, actor_user_id, actor_name, actor_role)
    VALUES (NEW.id, NEW.provider_id, 'status_change', OLD.status_name, NEW.status_name, v_actor, v_name, CASE WHEN v_name IS NOT NULL THEN 'employee' ELSE 'admin' END);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_workshop_order_status ON public.workshop_orders;
CREATE TRIGGER trg_log_workshop_order_status
  AFTER UPDATE OF status_name ON public.workshop_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_workshop_order_status_event();

-- 7. Updated_at trigger dla nowych tabel
DROP TRIGGER IF EXISTS trg_workshop_stations_updated ON public.workshop_stations;
CREATE TRIGGER trg_workshop_stations_updated BEFORE UPDATE ON public.workshop_stations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
