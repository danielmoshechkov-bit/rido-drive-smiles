
-- 1. Extend workshop_employees
ALTER TABLE public.workshop_employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS language_preference text NOT NULL DEFAULT 'pl',
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_workshop_employees_user_id ON public.workshop_employees(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_employees_provider_user_unique
  ON public.workshop_employees(provider_id, user_id) WHERE user_id IS NOT NULL;

-- 2. Invitations
CREATE TABLE IF NOT EXISTS public.workshop_employee_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  invited_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'mechanic',
  language_preference text DEFAULT 'pl',
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_wei_provider ON public.workshop_employee_invitations(provider_id);
CREATE INDEX IF NOT EXISTS idx_wei_email ON public.workshop_employee_invitations(lower(invited_email));
CREATE INDEX IF NOT EXISTS idx_wei_user ON public.workshop_employee_invitations(invited_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workshop_employee_invitations TO authenticated;
GRANT ALL ON public.workshop_employee_invitations TO service_role;
ALTER TABLE public.workshop_employee_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider owners manage invitations"
ON public.workshop_employee_invitations FOR ALL TO authenticated
USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

CREATE POLICY "Invited user can view own invitations"
ON public.workshop_employee_invitations FOR SELECT TO authenticated
USING (invited_user_id = auth.uid() OR lower(invited_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())));

CREATE POLICY "Invited user can accept/reject own invitation"
ON public.workshop_employee_invitations FOR UPDATE TO authenticated
USING (invited_user_id = auth.uid() OR lower(invited_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())))
WITH CHECK (invited_user_id = auth.uid() OR lower(invited_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())));

-- 3. Order Assignments
CREATE TABLE IF NOT EXISTS public.workshop_order_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.workshop_orders(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'assigned',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_woa_order ON public.workshop_order_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_woa_employee ON public.workshop_order_assignments(employee_user_id);
CREATE INDEX IF NOT EXISTS idx_woa_provider ON public.workshop_order_assignments(provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_woa_order_emp_unique ON public.workshop_order_assignments(order_id, employee_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workshop_order_assignments TO authenticated;
GRANT ALL ON public.workshop_order_assignments TO service_role;
ALTER TABLE public.workshop_order_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider owners manage assignments"
ON public.workshop_order_assignments FOR ALL TO authenticated
USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

CREATE POLICY "Employee can view own assignments"
ON public.workshop_order_assignments FOR SELECT TO authenticated
USING (employee_user_id = auth.uid());

CREATE POLICY "Employee can update own assignment status"
ON public.workshop_order_assignments FOR UPDATE TO authenticated
USING (employee_user_id = auth.uid())
WITH CHECK (employee_user_id = auth.uid());

-- 4. Findings
CREATE TABLE IF NOT EXISTS public.workshop_employee_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.workshop_orders(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 1,
  description_original text NOT NULL,
  description_original_lang text NOT NULL DEFAULT 'pl',
  description_pl text,
  action_type text NOT NULL DEFAULT 'inne',
  part_oe_code text,
  part_name text,
  part_supplier text,
  estimated_hours numeric(6,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  moved_to_order_at timestamptz,
  moved_to_order_item_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wef_order ON public.workshop_employee_findings(order_id);
CREATE INDEX IF NOT EXISTS idx_wef_employee ON public.workshop_employee_findings(employee_user_id);
CREATE INDEX IF NOT EXISTS idx_wef_provider ON public.workshop_employee_findings(provider_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workshop_employee_findings TO authenticated;
GRANT ALL ON public.workshop_employee_findings TO service_role;
ALTER TABLE public.workshop_employee_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider owners manage findings"
ON public.workshop_employee_findings FOR ALL TO authenticated
USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

CREATE POLICY "Employee can view own findings"
ON public.workshop_employee_findings FOR SELECT TO authenticated
USING (employee_user_id = auth.uid());

CREATE POLICY "Employee can create findings on own assignment"
ON public.workshop_employee_findings FOR INSERT TO authenticated
WITH CHECK (
  employee_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.workshop_order_assignments
    WHERE order_id = workshop_employee_findings.order_id
      AND employee_user_id = auth.uid()
  )
);

CREATE POLICY "Employee can update own pending findings"
ON public.workshop_employee_findings FOR UPDATE TO authenticated
USING (employee_user_id = auth.uid() AND status = 'pending')
WITH CHECK (employee_user_id = auth.uid());

-- 5. Translation cache (global)
CREATE TABLE IF NOT EXISTS public.translation_cache_global (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_text_hash text NOT NULL,
  source_lang text NOT NULL,
  source_text text NOT NULL,
  translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  hit_count int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tcg_hash_lang ON public.translation_cache_global(source_text_hash, source_lang);

GRANT SELECT ON public.translation_cache_global TO authenticated;
GRANT SELECT ON public.translation_cache_global TO anon;
GRANT ALL ON public.translation_cache_global TO service_role;
ALTER TABLE public.translation_cache_global ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read translation cache"
ON public.translation_cache_global FOR SELECT TO anon, authenticated USING (true);

-- updated_at triggers
CREATE TRIGGER trg_woa_updated BEFORE UPDATE ON public.workshop_order_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_wef_updated BEFORE UPDATE ON public.workshop_employee_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tcg_updated BEFORE UPDATE ON public.translation_cache_global
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
