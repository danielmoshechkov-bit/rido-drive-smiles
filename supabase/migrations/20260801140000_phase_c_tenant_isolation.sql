-- Phase C: tenant isolation and fail-closed access to private domain data.
--
-- This migration intentionally blocks legacy browser workflows where a row has
-- no trustworthy tenant anchor or where a capability/credential is stored in a
-- business table. Restore those workflows only through an authenticated,
-- tenant-bound server endpoint after a data backfill and adversarial tests.

-- ---------------------------------------------------------------------------
-- 1. Canonical authorization helpers (never accept identity from request body)
-- ---------------------------------------------------------------------------

-- Legacy personal vehicles had no immutable auth ownership anchor. New rows
-- use owner_user_id; old NULL rows stay fail-closed until an operator verifies
-- ownership and performs the documented backfill.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS vehicles_owner_user_id_phase_c_idx
  ON public.vehicles (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.phase_c_is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_company_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1
         FROM public.companies AS c
         WHERE c.id = p_company_id
           AND c.status = 'active'
           AND c.owner_user_id = auth.uid()
       )
       OR EXISTS (
         SELECT 1
         FROM public.company_members AS cm
         JOIN public.companies AS c ON c.id = cm.company_id
         WHERE cm.company_id = p_company_id
           AND cm.user_id = auth.uid()
           AND cm.status = 'active'
           AND c.status = 'active'
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_manage_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_company_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1
         FROM public.companies AS c
         WHERE c.id = p_company_id
           AND c.status = 'active'
           AND c.owner_user_id = auth.uid()
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_provider(p_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_provider_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1
         FROM public.service_providers AS sp
         WHERE sp.id = p_provider_id
           AND sp.status IS DISTINCT FROM 'suspended'
           AND (
             sp.company_id IS NULL
             OR EXISTS (
               SELECT 1 FROM public.companies AS active_company
               WHERE active_company.id = sp.company_id
                 AND active_company.status = 'active'
             )
           )
           AND (
             sp.user_id = auth.uid()
             OR public.phase_c_can_access_company(sp.company_id)
             OR EXISTS (
               SELECT 1 FROM public.service_employees AS se
               WHERE se.provider_id = sp.id
                 AND se.user_id = auth.uid()
                 AND se.is_active = true
             )
             OR EXISTS (
               SELECT 1 FROM public.workshop_employees AS we
               WHERE we.provider_id = sp.id
                 AND we.user_id = auth.uid()
                 AND we.status = 'active'
             )
           )
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_manage_provider(p_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_provider_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1
         FROM public.service_providers AS sp
         WHERE sp.id = p_provider_id
           AND sp.status IS DISTINCT FROM 'suspended'
           AND (
             sp.company_id IS NULL
             OR EXISTS (
               SELECT 1 FROM public.companies AS active_company
               WHERE active_company.id = sp.company_id
                 AND active_company.status = 'active'
             )
           )
           AND (
             sp.user_id = auth.uid()
             OR public.phase_c_can_manage_company(sp.company_id)
             OR EXISTS (
               SELECT 1 FROM public.service_employees AS se
               WHERE se.provider_id = sp.id
                 AND se.user_id = auth.uid()
                 AND se.is_active = true
                 AND se.role IN ('owner', 'manager')
             )
             OR EXISTS (
               SELECT 1 FROM public.workshop_employees AS we
               WHERE we.provider_id = sp.id
                 AND we.user_id = auth.uid()
                 AND we.status = 'active'
                 AND we.role IN ('owner', 'manager')
             )
           )
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_provider_is_active(p_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_provider_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.service_providers AS provider
       LEFT JOIN public.companies AS company ON company.id = provider.company_id
       WHERE provider.id = p_provider_id
         AND provider.status IS DISTINCT FROM 'suspended'
         AND (
           provider.company_id IS NULL
           OR company.status = 'active'
         )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_provider_owner(p_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       (
         p_owner_user_id = auth.uid()
         AND EXISTS (
           SELECT 1
           FROM public.service_providers AS allowed_provider
           WHERE allowed_provider.user_id = p_owner_user_id
             AND allowed_provider.status IS DISTINCT FROM 'suspended'
             AND (
               allowed_provider.company_id IS NULL
               OR EXISTS (
                 SELECT 1 FROM public.companies AS active_company
                 WHERE active_company.id = allowed_provider.company_id
                   AND active_company.status = 'active'
               )
             )
         )
         AND NOT EXISTS (
           SELECT 1
           FROM public.service_providers AS blocked_provider
           LEFT JOIN public.companies AS provider_company
             ON provider_company.id = blocked_provider.company_id
           WHERE blocked_provider.user_id = p_owner_user_id
             AND (
               blocked_provider.status = 'suspended'
               OR (
                 blocked_provider.company_id IS NOT NULL
                 AND provider_company.status IS DISTINCT FROM 'active'
               )
             )
         )
       )
       OR public.phase_c_is_system_admin()
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_manage_provider_owner(p_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       (
         p_owner_user_id = auth.uid()
         AND EXISTS (
           SELECT 1
           FROM public.service_providers AS allowed_provider
           WHERE allowed_provider.user_id = p_owner_user_id
             AND allowed_provider.status IS DISTINCT FROM 'suspended'
             AND (
               allowed_provider.company_id IS NULL
               OR EXISTS (
                 SELECT 1 FROM public.companies AS active_company
                 WHERE active_company.id = allowed_provider.company_id
                   AND active_company.status = 'active'
               )
             )
         )
         AND NOT EXISTS (
           SELECT 1
           FROM public.service_providers AS blocked_provider
           LEFT JOIN public.companies AS provider_company
             ON provider_company.id = blocked_provider.company_id
           WHERE blocked_provider.user_id = p_owner_user_id
             AND (
               blocked_provider.status = 'suspended'
               OR (
                 blocked_provider.company_id IS NOT NULL
                 AND provider_company.status IS DISTINCT FROM 'active'
               )
             )
         )
       )
       OR public.phase_c_is_system_admin()
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_driver(p_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_driver_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1 FROM public.driver_app_users AS dau
         WHERE dau.driver_id = p_driver_id AND dau.user_id = auth.uid()
       )
       OR EXISTS (
         SELECT 1
         FROM public.drivers AS d
         JOIN public.user_roles AS ur ON ur.fleet_id = d.fleet_id
         WHERE d.id = p_driver_id
           AND ur.user_id = auth.uid()
           AND ur.role IN ('fleet_settlement'::public.app_role, 'fleet_rental'::public.app_role)
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_manage_driver(p_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_driver_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1
         FROM public.drivers AS d
         JOIN public.user_roles AS ur ON ur.fleet_id = d.fleet_id
         WHERE d.id = p_driver_id
           AND ur.user_id = auth.uid()
           AND ur.role IN ('fleet_settlement'::public.app_role, 'fleet_rental'::public.app_role)
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_vehicle(p_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_vehicle_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1
         FROM public.vehicles AS v
         JOIN public.user_roles AS ur ON ur.fleet_id = v.fleet_id
         WHERE v.id = p_vehicle_id
           AND ur.user_id = auth.uid()
           AND ur.role IN ('fleet_settlement'::public.app_role, 'fleet_rental'::public.app_role)
       )
       OR EXISTS (
         SELECT 1 FROM public.vehicles AS v
         WHERE v.id = p_vehicle_id
           AND v.fleet_id IS NULL
           AND v.owner_user_id = auth.uid()
       )
       OR EXISTS (
         SELECT 1
         FROM public.driver_vehicle_assignments AS assignment
         JOIN public.driver_app_users AS app_user
           ON app_user.driver_id = assignment.driver_id
         JOIN public.drivers AS driver ON driver.id = assignment.driver_id
         JOIN public.vehicles AS vehicle ON vehicle.id = assignment.vehicle_id
         WHERE assignment.vehicle_id = p_vehicle_id
           AND assignment.status = 'active'
           AND app_user.user_id = auth.uid()
           AND (
             (
               vehicle.fleet_id IS NULL
               AND vehicle.owner_user_id = auth.uid()
               AND assignment.fleet_id IS NULL
             )
             OR (
               vehicle.fleet_id IS NOT NULL
               AND driver.fleet_id = vehicle.fleet_id
               AND assignment.fleet_id = vehicle.fleet_id
             )
           )
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_manage_vehicle(p_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_vehicle_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1
         FROM public.vehicles AS v
         JOIN public.user_roles AS ur ON ur.fleet_id = v.fleet_id
         WHERE v.id = p_vehicle_id
           AND ur.user_id = auth.uid()
           AND ur.role IN ('fleet_settlement'::public.app_role, 'fleet_rental'::public.app_role)
       )
       OR EXISTS (
         SELECT 1 FROM public.vehicles AS v
         WHERE v.id = p_vehicle_id
           AND v.fleet_id IS NULL
           AND v.owner_user_id = auth.uid()
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_manage_vehicle_assignment(
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_fleet_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_driver_id IS NOT NULL
     AND p_vehicle_id IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1
         FROM public.drivers AS d
         JOIN public.vehicles AS v ON v.id = p_vehicle_id
         JOIN public.user_roles AS ur ON ur.fleet_id = v.fleet_id
         WHERE d.id = p_driver_id
           AND v.fleet_id IS NOT NULL
           AND d.fleet_id = v.fleet_id
           AND p_fleet_id = v.fleet_id
           AND ur.user_id = auth.uid()
           AND ur.role IN (
             'fleet_settlement'::public.app_role,
             'fleet_rental'::public.app_role
           )
       )
       OR EXISTS (
         SELECT 1
         FROM public.driver_app_users AS dau
         JOIN public.vehicles AS v ON v.id = p_vehicle_id
         WHERE dau.driver_id = p_driver_id
           AND dau.user_id = auth.uid()
           AND v.fleet_id IS NULL
           AND v.owner_user_id = auth.uid()
           AND p_fleet_id IS NULL
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_vehicle_assignment(
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_fleet_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_driver_id IS NOT NULL
     AND p_vehicle_id IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1
         FROM public.drivers AS d
         JOIN public.vehicles AS v ON v.id = p_vehicle_id
         JOIN public.driver_app_users AS dau ON dau.driver_id = d.id
         WHERE d.id = p_driver_id
           AND dau.user_id = auth.uid()
           AND (
             (v.fleet_id IS NULL AND v.owner_user_id = auth.uid() AND p_fleet_id IS NULL)
             OR (
               v.fleet_id IS NOT NULL
               AND d.fleet_id = v.fleet_id
               AND p_fleet_id = v.fleet_id
             )
           )
       )
       OR public.phase_c_can_manage_vehicle_assignment(
         p_driver_id, p_vehicle_id, p_fleet_id
       )
     )
$$;

-- Compatibility helper used by older policies. It no longer trusts a bare
-- assignment row as proof of ownership.
CREATE OR REPLACE FUNCTION public.driver_has_vehicle_access(p_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.phase_c_can_access_vehicle(p_vehicle_id)
$$;

CREATE OR REPLACE FUNCTION public.phase_c_owns_ai_config(p_config_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.ai_agent_configs AS c
       WHERE c.id = p_config_id AND c.user_id = auth.uid()
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_owns_ai_sales_agent(p_agent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.ai_sales_agents AS a
       WHERE a.id = p_agent_id AND a.user_id = auth.uid()
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_workspace_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1 FROM public.workspace_projects AS p
         WHERE p.id = p_project_id
           AND p.status = 'active'
           AND p.owner_user_id = auth.uid()
           AND (
             p.tenant_id IS NULL
             OR public.phase_c_can_access_provider(p.tenant_id)
           )
       )
       OR EXISTS (
         SELECT 1
         FROM public.workspace_project_members AS m
         JOIN public.workspace_projects AS p ON p.id = m.project_id
         WHERE m.project_id = p_project_id
           AND m.user_id = auth.uid()
           AND m.status = 'active'
           AND p.status = 'active'
           AND (
             p.tenant_id IS NULL
             OR public.phase_c_provider_is_active(p.tenant_id)
           )
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_manage_workspace_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1 FROM public.workspace_projects AS p
         WHERE p.id = p_project_id
           AND p.status = 'active'
           AND p.owner_user_id = auth.uid()
           AND (
             p.tenant_id IS NULL
             OR public.phase_c_can_manage_provider(p.tenant_id)
           )
       )
     )
$$;

-- Read access is deliberately broader than mutation access. A guest/viewer
-- may inspect the project it was invited to, but cannot use that membership
-- as a blanket write capability. Members may contribute; managers may also
-- operate privileged project content such as channels and automations.
CREATE OR REPLACE FUNCTION public.phase_c_can_contribute_workspace_project(
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       public.phase_c_can_manage_workspace_project(p_project_id)
       OR EXISTS (
         SELECT 1
         FROM public.workspace_project_members AS member
         JOIN public.workspace_projects AS project
           ON project.id = member.project_id
         WHERE member.project_id = p_project_id
           AND member.user_id = auth.uid()
           AND member.status = 'active'
           AND member.role IN ('owner', 'manager', 'member')
           AND project.status = 'active'
           AND (
             project.tenant_id IS NULL
             OR public.phase_c_provider_is_active(project.tenant_id)
           )
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_manage_workspace_content(
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       public.phase_c_can_manage_workspace_project(p_project_id)
       OR EXISTS (
         SELECT 1
         FROM public.workspace_project_members AS member
         JOIN public.workspace_projects AS project
           ON project.id = member.project_id
         WHERE member.project_id = p_project_id
           AND member.user_id = auth.uid()
           AND member.status = 'active'
           AND member.role IN ('owner', 'manager')
           AND project.status = 'active'
           AND (
             project.tenant_id IS NULL
             OR public.phase_c_provider_is_active(project.tenant_id)
           )
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_viewing_request(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1 FROM public.viewing_requests AS request
         WHERE request.id = p_request_id AND request.client_id = auth.uid()
       )
       OR EXISTS (
         SELECT 1
         FROM public.viewing_slots AS slot
         JOIN public.real_estate_agents AS agent ON agent.id = slot.agent_id
         WHERE slot.request_id = p_request_id AND agent.user_id = auth.uid()
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_viewing_slot(
  p_request_id uuid,
  p_agent_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       public.phase_c_is_system_admin()
       OR EXISTS (
         SELECT 1 FROM public.real_estate_agents AS agent
         WHERE agent.id = p_agent_id AND agent.user_id = auth.uid()
       )
       OR EXISTS (
         SELECT 1 FROM public.viewing_requests AS request
         WHERE request.id = p_request_id AND request.client_id = auth.uid()
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_calendar(p_calendar_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.calendar_calendars AS calendar
       WHERE calendar.id = p_calendar_id
         AND (
           public.phase_c_is_system_admin()
           OR (calendar.owner_type = 'user' AND calendar.owner_id = auth.uid())
           OR (
             calendar.owner_type = 'company'
             AND public.phase_c_can_access_company(calendar.owner_id)
           )
           OR (
             calendar.owner_type IN ('service_provider', 'provider')
             AND public.phase_c_can_access_provider(calendar.owner_id)
           )
         )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_manage_calendar(p_calendar_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.calendar_calendars AS calendar
       WHERE calendar.id = p_calendar_id
         AND (
           public.phase_c_is_system_admin()
           OR (calendar.owner_type = 'user' AND calendar.owner_id = auth.uid())
           OR (
             calendar.owner_type = 'company'
             AND public.phase_c_can_manage_company(calendar.owner_id)
           )
           OR (
             calendar.owner_type IN ('service_provider', 'provider')
             AND public.phase_c_can_manage_provider(calendar.owner_id)
           )
         )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_service_calendar_block_consistent(
  p_provider_id uuid,
  p_employee_id uuid,
  p_resource_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_provider_id IS NOT NULL
     AND (
       auth.role() = 'service_role'
       OR public.phase_c_can_manage_provider(p_provider_id)
     )
     AND (
       p_employee_id IS NULL
       OR EXISTS (
         SELECT 1 FROM public.service_employees AS employee
         WHERE employee.id = p_employee_id
           AND employee.provider_id = p_provider_id
       )
     )
     AND (
       p_resource_id IS NULL
       OR EXISTS (
         SELECT 1 FROM public.service_resources AS resource
         WHERE resource.id = p_resource_id
           AND resource.provider_id = p_provider_id
       )
     )
$$;

REVOKE ALL ON FUNCTION public.phase_c_is_system_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_company(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_manage_company(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_provider(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_manage_provider(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_provider_is_active(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_provider_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_manage_provider_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_driver(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_manage_driver(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_vehicle(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_manage_vehicle(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_vehicle_assignment(uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_manage_vehicle_assignment(uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_has_vehicle_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_owns_ai_config(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_owns_ai_sales_agent(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_workspace_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_manage_workspace_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_contribute_workspace_project(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_manage_workspace_content(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_viewing_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_viewing_slot(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_calendar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_manage_calendar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_service_calendar_block_consistent(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase_c_is_system_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_company(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_manage_company(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_provider(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_manage_provider(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_provider_is_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_provider_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_manage_provider_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_driver(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_manage_driver(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_vehicle(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_manage_vehicle(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_vehicle_assignment(uuid,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_manage_vehicle_assignment(uuid,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_has_vehicle_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_owns_ai_config(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_owns_ai_sales_agent(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_workspace_project(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_manage_workspace_project(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_contribute_workspace_project(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_manage_workspace_content(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_viewing_request(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_viewing_slot(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_calendar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_manage_calendar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_service_calendar_block_consistent(uuid,uuid,uuid) TO authenticated, service_role;

-- company_members previously allowed a member to update its own privilege
-- fields. Only the canonical company owner (or system admin) may mutate rows.
DO $phase_c_drop_company_member_policies$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_members', p.policyname);
  END LOOP;
END;
$phase_c_drop_company_member_policies$;

CREATE POLICY phase_c_company_members_select ON public.company_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.phase_c_can_manage_company(company_id));
CREATE POLICY phase_c_company_members_insert ON public.company_members
  FOR INSERT TO authenticated
  WITH CHECK (public.phase_c_can_manage_company(company_id));
CREATE POLICY phase_c_company_members_update ON public.company_members
  FOR UPDATE TO authenticated
  USING (public.phase_c_can_manage_company(company_id))
  WITH CHECK (public.phase_c_can_manage_company(company_id));
CREATE POLICY phase_c_company_members_delete ON public.company_members
  FOR DELETE TO authenticated
  USING (public.phase_c_can_manage_company(company_id));

-- Entitlements are value-bearing server decisions. A company owner may read
-- them, but cannot self-enable a paid module or extend trial_until through
-- PostgREST. Restoration requires an audited admin/billing command.
DO $phase_c_company_module_policies$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_modules'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_modules', p.policyname);
  END LOOP;
END;
$phase_c_company_module_policies$;
ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_modules FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.company_modules
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.company_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_modules TO service_role;
CREATE POLICY phase_c_company_modules_read ON public.company_modules
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_company(company_id));

-- ---------------------------------------------------------------------------
-- 2. service_providers: no secret-bearing table reads from browsers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.phase_c_protect_service_provider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_canonical_sms_balance bigint;
  v_canonical_rating_avg numeric;
  v_canonical_rating_count integer;
  v_old_protected jsonb;
  v_new_protected jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.role() = 'service_role' OR v_actor IS NULL THEN
      RAISE EXCEPTION 'provider_insert_requires_authorized_rpc' USING ERRCODE = '42501';
    END IF;
    IF NEW.user_id IS DISTINCT FROM v_actor
       OR NEW.company_id IS NOT NULL
       OR NEW.status IS DISTINCT FROM 'pending'
       OR NEW.verified_at IS NOT NULL
       OR coalesce(NEW.rating_avg, 0) <> 0
       OR coalesce(NEW.rating_count, 0) <> 0
       OR coalesce(NEW.total_bookings, 0) <> 0
       OR coalesce(NEW.sms_balance, 0) <> 0
       OR NEW.gmb_access_token IS NOT NULL
       OR NEW.gmb_location_id IS NOT NULL
       OR coalesce(NEW.gmb_auto_posts, false)
       OR coalesce(NEW.gmb_auto_reply_reviews, false) THEN
      RAISE EXCEPTION 'provider_privileged_fields_are_server_managed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Preserve the legacy review trigger without allowing a caller to submit
  -- rating fields.  Nested trigger execution is accepted only when the two
  -- aggregates exactly match a fresh canonical calculation from visible
  -- reviews and no other protected provider field changes.
  IF pg_catalog.pg_trigger_depth() > 1 THEN
    v_old_protected := to_jsonb(OLD) - ARRAY[
      'rating_avg', 'rating_count', 'updated_at'
    ];
    v_new_protected := to_jsonb(NEW) - ARRAY[
      'rating_avg', 'rating_count', 'updated_at'
    ];
    SELECT coalesce(avg(review.rating), 0), count(*)::integer
      INTO v_canonical_rating_avg, v_canonical_rating_count
    FROM public.service_reviews AS review
    WHERE review.provider_id = OLD.id
      AND review.is_visible = true;
    IF v_old_protected IS NOT DISTINCT FROM v_new_protected
       AND NEW.rating_avg IS NOT DISTINCT FROM v_canonical_rating_avg
       AND NEW.rating_count IS NOT DISTINCT FROM v_canonical_rating_count THEN
      RETURN NEW;
    END IF;
  END IF;

  IF auth.role() = 'service_role' THEN
    v_old_protected := to_jsonb(OLD) - ARRAY['sms_balance', 'updated_at'];
    v_new_protected := to_jsonb(NEW) - ARRAY['sms_balance', 'updated_at'];
    IF v_old_protected IS DISTINCT FROM v_new_protected THEN
      RAISE EXCEPTION 'provider_update_requires_authorized_rpc' USING ERRCODE = '42501';
    END IF;
    SELECT balance INTO v_canonical_sms_balance
    FROM public.billing_value_balances
    WHERE beneficiary_type = 'service_provider'
      AND beneficiary_id = NEW.id
      AND benefit_type = 'sms';
    IF coalesce(NEW.sms_balance, 0)
         IS DISTINCT FROM coalesce(v_canonical_sms_balance, 0) THEN
      RAISE EXCEPTION 'sms_balance_must_match_canonical_ledger'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'provider_update_requires_authorized_rpc' USING ERRCODE = '42501';
  END IF;

  -- New columns are protected by default. Only ordinary profile fields below
  -- are mutable directly; identity, tenant, verification, balances, metrics
  -- and integrations require an audited server workflow.
  v_old_protected := to_jsonb(OLD) - ARRAY[
    'category_id', 'company_name', 'company_nip', 'company_regon',
    'company_address', 'company_city', 'company_postal_code', 'company_phone',
    'company_email', 'company_website', 'logo_url', 'cover_image_url',
    'description', 'latitude', 'longitude', 'booking_advance_days',
    'cancellation_hours', 'auto_confirm', 'loyalty_enabled', 'loyalty_type',
    'loyalty_config', 'owner_first_name', 'owner_last_name', 'owner_phone',
    'owner_email', 'gallery_photos', 'short_name', 'updated_at'
  ];
  v_new_protected := to_jsonb(NEW) - ARRAY[
    'category_id', 'company_name', 'company_nip', 'company_regon',
    'company_address', 'company_city', 'company_postal_code', 'company_phone',
    'company_email', 'company_website', 'logo_url', 'cover_image_url',
    'description', 'latitude', 'longitude', 'booking_advance_days',
    'cancellation_hours', 'auto_confirm', 'loyalty_enabled', 'loyalty_type',
    'loyalty_config', 'owner_first_name', 'owner_last_name', 'owner_phone',
    'owner_email', 'gallery_photos', 'short_name', 'updated_at'
  ];
  IF v_old_protected IS DISTINCT FROM v_new_protected THEN
    RAISE EXCEPTION 'provider_privileged_fields_are_server_managed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_c_protect_service_provider()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS phase_c_protect_service_provider ON public.service_providers;
CREATE TRIGGER phase_c_protect_service_provider
  BEFORE INSERT OR UPDATE ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_service_provider();

DO $phase_c_drop_provider_policies$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_providers'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.service_providers', p.policyname);
  END LOOP;
END;
$phase_c_drop_provider_policies$;

ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.service_providers FROM PUBLIC, anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.service_providers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_providers TO service_role;

CREATE POLICY phase_c_provider_insert ON public.service_providers
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IS NULL
    AND status = 'pending'
    AND verified_at IS NULL
    AND coalesce(sms_balance, 0) = 0
  );
CREATE POLICY phase_c_provider_update ON public.service_providers
  FOR UPDATE TO authenticated
  USING (public.phase_c_can_manage_provider(id))
  WITH CHECK (public.phase_c_can_manage_provider(id));

-- Safe projections replace direct reads of the mixed secret-bearing table.
CREATE OR REPLACE VIEW public.service_providers_public
WITH (security_barrier = true)
AS
SELECT
  id, category_id, company_name, company_address, company_city,
  company_postal_code, company_phone, company_email, company_website,
  logo_url, cover_image_url, description, latitude, longitude,
  rating_avg, rating_count, total_bookings, status, booking_advance_days,
  cancellation_hours, auto_confirm, gallery_photos, short_name,
  created_at, updated_at
FROM public.service_providers
WHERE status IN ('active', 'verified');

CREATE OR REPLACE VIEW public.service_providers_private
WITH (security_barrier = true)
AS
SELECT
  id, user_id, company_id, category_id, company_name, company_nip,
  company_regon, company_address, company_city, company_postal_code,
  company_phone, company_email, company_website, logo_url, cover_image_url,
  description, latitude, longitude, owner_first_name, owner_last_name,
  owner_phone, owner_email, status, verified_at, booking_advance_days,
  cancellation_hours, auto_confirm, loyalty_enabled, loyalty_type,
  gallery_photos, short_name, created_at, updated_at
FROM public.service_providers AS sp
WHERE public.phase_c_can_manage_provider(sp.id);

REVOKE ALL PRIVILEGES ON TABLE public.service_providers_public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.service_providers_private FROM PUBLIC;
GRANT SELECT ON TABLE public.service_providers_public TO anon, authenticated;
GRANT SELECT ON TABLE public.service_providers_private TO authenticated;

-- Mixed business/credential tables cannot be exposed safely through PostgREST:
-- column privileges do not protect `select *`, nested relationships or writes
-- that can replace a credential. Keep every existing row, but close browser
-- access until secrets are moved to a server-only credential store and the UI
-- uses redacted DTOs plus write-only, tenant-bound endpoints.
DO $phase_c_mixed_credentials$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['agency_clients', 'ad_orders', 'company_settings']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      FOR p IN
        SELECT policyname
        FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
      END LOOP;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
        t
      );
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
        t
      );
    END IF;
  END LOOP;
END;
$phase_c_mixed_credentials$;

-- ---------------------------------------------------------------------------
-- 3. Provider-scoped CRM, workshop, voice and lead data
-- ---------------------------------------------------------------------------

DO $phase_c_provider_tables$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'service_customers', 'service_customer_notes',
    'workshop_clients', 'workshop_vehicles', 'workshop_orders',
    'workshop_order_statuses', 'service_leads', 'followup_sequences',
    'voice_agent_configs', 'voice_phone_numbers', 'voice_agent_knowledge'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      FOR p IN SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
      END LOOP;
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.phase_c_can_access_provider(provider_id))',
        'phase_c_' || t || '_select', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.phase_c_can_manage_provider(provider_id))',
        'phase_c_' || t || '_insert', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.phase_c_can_manage_provider(provider_id)) WITH CHECK (public.phase_c_can_manage_provider(provider_id))',
        'phase_c_' || t || '_update', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.phase_c_can_manage_provider(provider_id))',
        'phase_c_' || t || '_delete', t
      );
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'voice_call_queue', 'voice_calls', 'voice_transcripts',
    'voice_usage_monthly', 'voice_call_outcomes', 'voice_contact_history',
    'call_transcripts', 'ai_interactions'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      FOR p IN SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
      END LOOP;
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.phase_c_can_access_provider(provider_id))',
        'phase_c_' || t || '_select', t
      );
    END IF;
  END LOOP;
END;
$phase_c_provider_tables$;

-- Legacy `leads` is anchored by provider owner user id, not by tenant id.
DO $phase_c_leads_policies$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'leads'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.leads', p.policyname); END LOOP;
END;
$phase_c_leads_policies$;
CREATE POLICY phase_c_leads_select ON public.leads FOR SELECT TO authenticated
  USING (public.phase_c_can_access_provider_owner(provider_user_id));
CREATE POLICY phase_c_leads_insert ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.phase_c_can_manage_provider_owner(provider_user_id));
CREATE POLICY phase_c_leads_update ON public.leads FOR UPDATE TO authenticated
  USING (public.phase_c_can_manage_provider_owner(provider_user_id))
  WITH CHECK (public.phase_c_can_manage_provider_owner(provider_user_id));
CREATE POLICY phase_c_leads_delete ON public.leads FOR DELETE TO authenticated
  USING (public.phase_c_can_manage_provider_owner(provider_user_id));

-- Child rows are scoped through their parent order. History is server-written.
DO $phase_c_workshop_children$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['workshop_order_items', 'workshop_order_status_history'] LOOP
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t); END LOOP;
  END LOOP;
END;
$phase_c_workshop_children$;
CREATE POLICY phase_c_order_items_select ON public.workshop_order_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.workshop_orders AS o
    WHERE o.id = order_id AND public.phase_c_can_access_provider(o.provider_id)
  ));
CREATE POLICY phase_c_order_items_insert ON public.workshop_order_items
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.workshop_orders AS o
    WHERE o.id = order_id AND public.phase_c_can_manage_provider(o.provider_id)
  ));
CREATE POLICY phase_c_order_items_update ON public.workshop_order_items
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.workshop_orders AS o
    WHERE o.id = order_id AND public.phase_c_can_manage_provider(o.provider_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.workshop_orders AS o
    WHERE o.id = order_id AND public.phase_c_can_manage_provider(o.provider_id)
  ));
CREATE POLICY phase_c_order_items_delete ON public.workshop_order_items
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.workshop_orders AS o
    WHERE o.id = order_id AND public.phase_c_can_manage_provider(o.provider_id)
  ));
CREATE POLICY phase_c_order_history_select ON public.workshop_order_status_history
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.workshop_orders AS o
    WHERE o.id = order_id AND public.phase_c_can_access_provider(o.provider_id)
  ));

-- ---------------------------------------------------------------------------
-- 4. Vehicles, fleet locations, fuel and driver document metadata
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.phase_c_protect_vehicle_tenant_anchor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.fleet_id IS DISTINCT FROM OLD.fleet_id
       OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'vehicle_tenant_anchor_is_immutable' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF auth.role() = 'service_role' THEN
    IF (NEW.fleet_id IS NULL AND NEW.owner_user_id IS NULL)
       OR (NEW.fleet_id IS NOT NULL AND NEW.owner_user_id IS NOT NULL) THEN
      RAISE EXCEPTION 'vehicle_requires_exactly_one_owner_anchor' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'vehicle_requires_authentication' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.fleet_id IS NULL THEN
      NEW.owner_user_id := coalesce(NEW.owner_user_id, v_actor);
      IF NEW.owner_user_id IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'vehicle_owner_must_match_actor' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.owner_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'fleet_vehicle_cannot_have_personal_owner' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF (NEW.fleet_id IS NULL AND NEW.owner_user_id IS NULL)
     OR (NEW.fleet_id IS NOT NULL AND NEW.owner_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'vehicle_requires_exactly_one_owner_anchor' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_c_protect_vehicle_tenant_anchor()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS phase_c_protect_vehicle_tenant_anchor ON public.vehicles;
CREATE TRIGGER phase_c_protect_vehicle_tenant_anchor
  BEFORE INSERT OR UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_vehicle_tenant_anchor();

CREATE OR REPLACE FUNCTION public.phase_c_protect_vehicle_assignment_anchor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_vehicle_fleet uuid;
  v_vehicle_owner uuid;
  v_driver_fleet uuid;
BEGIN
  IF NEW.status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'invalid_vehicle_assignment_status' USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
       OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.fleet_id IS DISTINCT FROM OLD.fleet_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'vehicle_assignment_anchor_is_immutable' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT vehicle.fleet_id, vehicle.owner_user_id, driver.fleet_id
    INTO v_vehicle_fleet, v_vehicle_owner, v_driver_fleet
  FROM public.vehicles AS vehicle
  CROSS JOIN public.drivers AS driver
  WHERE vehicle.id = NEW.vehicle_id
    AND driver.id = NEW.driver_id;

  IF NOT FOUND OR NEW.vehicle_id IS NULL OR NEW.driver_id IS NULL THEN
    RAISE EXCEPTION 'vehicle_assignment_anchor_not_found' USING ERRCODE = '23503';
  END IF;

  IF v_vehicle_fleet IS NOT NULL THEN
    IF v_driver_fleet IS DISTINCT FROM v_vehicle_fleet THEN
      RAISE EXCEPTION 'vehicle_assignment_cross_fleet' USING ERRCODE = '42501';
    END IF;
    NEW.fleet_id := v_vehicle_fleet;
  ELSE
    IF v_vehicle_owner IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.driver_app_users AS app_user
      WHERE app_user.driver_id = NEW.driver_id
        AND app_user.user_id = v_vehicle_owner
    ) THEN
      RAISE EXCEPTION 'personal_vehicle_assignment_owner_mismatch' USING ERRCODE = '42501';
    END IF;
    NEW.fleet_id := NULL;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'vehicle_assignment_requires_authentication' USING ERRCODE = '42501';
  END IF;

  IF NOT public.phase_c_can_manage_vehicle_assignment(
    NEW.driver_id, NEW.vehicle_id, NEW.fleet_id
  ) THEN
    RAISE EXCEPTION 'vehicle_assignment_not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_c_protect_vehicle_assignment_anchor()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS phase_c_protect_vehicle_assignment_anchor
  ON public.driver_vehicle_assignments;
CREATE TRIGGER phase_c_protect_vehicle_assignment_anchor
  BEFORE INSERT OR UPDATE ON public.driver_vehicle_assignments
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_vehicle_assignment_anchor();

DO $phase_c_vehicle_policies$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vehicles', 'vehicle_policies', 'vehicle_inspections', 'vehicle_services',
    'vehicle_damages', 'documents', 'fuel_logs', 'fuel_transactions', 'driver_documents',
    'driver_document_statuses', 'driver_locations'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t); END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon', t);
  END LOOP;
END;
$phase_c_vehicle_policies$;

REVOKE ALL PRIVILEGES ON TABLE public.vehicles
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicles TO service_role;

-- Legacy fuel_transactions ma wyłącznie numer karty bez driver_id/fleet_id.
-- Numer karty nie jest globalnie unikalną kotwicą tenanta, więc bezpośredni
-- odczyt i RPC my_fuel_transactions pozostają zablokowane do czasu backfillu.
ALTER TABLE public.fuel_transactions FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.fuel_transactions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fuel_transactions TO service_role;

CREATE POLICY phase_c_vehicles_select ON public.vehicles FOR SELECT TO authenticated
  USING (public.phase_c_can_access_vehicle(id));
CREATE POLICY phase_c_vehicles_insert ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (
    public.phase_c_is_system_admin()
    OR (
      owner_user_id IS NULL
      AND fleet_id IN (SELECT ur.fleet_id FROM public.user_roles AS ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('fleet_settlement'::public.app_role, 'fleet_rental'::public.app_role))
    )
    OR (fleet_id IS NULL AND owner_user_id = auth.uid())
  );
CREATE POLICY phase_c_vehicles_update ON public.vehicles FOR UPDATE TO authenticated
  USING (public.phase_c_can_manage_vehicle(id))
  WITH CHECK (
    public.phase_c_is_system_admin()
    OR (
      owner_user_id IS NULL
      AND fleet_id IN (SELECT ur.fleet_id FROM public.user_roles AS ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('fleet_settlement'::public.app_role, 'fleet_rental'::public.app_role))
    )
    OR (fleet_id IS NULL AND owner_user_id = auth.uid())
  );
CREATE POLICY phase_c_vehicles_delete ON public.vehicles FOR DELETE TO authenticated
  USING (public.phase_c_can_manage_vehicle(id));

DO $phase_c_assignment_policies$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'driver_vehicle_assignments'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.driver_vehicle_assignments',
      p.policyname
    );
  END LOOP;
END;
$phase_c_assignment_policies$;

ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_vehicle_assignments FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.driver_vehicle_assignments
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.driver_vehicle_assignments
  TO authenticated;
GRANT UPDATE (status, assigned_at, unassigned_at)
  ON TABLE public.driver_vehicle_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.driver_vehicle_assignments
  TO service_role;

CREATE POLICY phase_c_vehicle_assignments_select
  ON public.driver_vehicle_assignments FOR SELECT TO authenticated
  USING (public.phase_c_can_access_vehicle_assignment(driver_id, vehicle_id, fleet_id));
CREATE POLICY phase_c_vehicle_assignments_insert
  ON public.driver_vehicle_assignments FOR INSERT TO authenticated
  WITH CHECK (public.phase_c_can_manage_vehicle_assignment(driver_id, vehicle_id, fleet_id));
CREATE POLICY phase_c_vehicle_assignments_update
  ON public.driver_vehicle_assignments FOR UPDATE TO authenticated
  USING (public.phase_c_can_manage_vehicle_assignment(driver_id, vehicle_id, fleet_id))
  WITH CHECK (public.phase_c_can_manage_vehicle_assignment(driver_id, vehicle_id, fleet_id));
CREATE POLICY phase_c_vehicle_assignments_delete
  ON public.driver_vehicle_assignments FOR DELETE TO authenticated
  USING (public.phase_c_can_manage_vehicle_assignment(driver_id, vehicle_id, fleet_id));

DO $phase_c_vehicle_children$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vehicle_policies','vehicle_inspections','vehicle_services','vehicle_damages'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.phase_c_can_access_vehicle(vehicle_id))',
      'phase_c_' || t || '_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.phase_c_can_manage_vehicle(vehicle_id))',
      'phase_c_' || t || '_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.phase_c_can_manage_vehicle(vehicle_id)) WITH CHECK (public.phase_c_can_manage_vehicle(vehicle_id))',
      'phase_c_' || t || '_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.phase_c_can_manage_vehicle(vehicle_id))',
      'phase_c_' || t || '_delete', t
    );
  END LOOP;
END;
$phase_c_vehicle_children$;

CREATE POLICY phase_c_documents_select ON public.documents FOR SELECT TO authenticated
  USING (
    (vehicle_id IS NOT NULL AND public.phase_c_can_manage_vehicle(vehicle_id))
    OR (driver_id IS NOT NULL AND public.phase_c_can_access_driver(driver_id))
  );
CREATE POLICY phase_c_documents_manage ON public.documents FOR ALL TO authenticated
  USING (
    (vehicle_id IS NOT NULL AND public.phase_c_can_manage_vehicle(vehicle_id))
    OR (driver_id IS NOT NULL AND public.phase_c_can_manage_driver(driver_id))
  ) WITH CHECK (
    (vehicle_id IS NOT NULL AND public.phase_c_can_access_vehicle(vehicle_id))
    OR (driver_id IS NOT NULL AND public.phase_c_can_manage_driver(driver_id))
  );

CREATE POLICY phase_c_fuel_logs_select ON public.fuel_logs FOR SELECT TO authenticated
  USING (public.phase_c_can_access_driver(driver_id));
CREATE POLICY phase_c_fuel_logs_manage ON public.fuel_logs FOR ALL TO authenticated
  USING (public.phase_c_can_access_driver(driver_id))
  WITH CHECK (public.phase_c_can_access_driver(driver_id));

CREATE POLICY phase_c_driver_documents_select ON public.driver_documents FOR SELECT TO authenticated
  USING (public.phase_c_can_access_driver(driver_id));
CREATE POLICY phase_c_driver_documents_manage ON public.driver_documents FOR ALL TO authenticated
  USING (public.phase_c_can_manage_driver(driver_id))
  WITH CHECK (public.phase_c_can_manage_driver(driver_id));
CREATE POLICY phase_c_driver_document_statuses_select ON public.driver_document_statuses FOR SELECT TO authenticated
  USING (public.phase_c_can_access_driver(driver_id));
CREATE POLICY phase_c_driver_document_statuses_manage ON public.driver_document_statuses FOR ALL TO authenticated
  USING (public.phase_c_can_manage_driver(driver_id))
  WITH CHECK (public.phase_c_can_manage_driver(driver_id));

CREATE POLICY phase_c_driver_locations_self ON public.driver_locations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY phase_c_driver_locations_fleet_read ON public.driver_locations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.driver_app_users AS dau
    WHERE dau.user_id = driver_locations.user_id
      AND public.phase_c_can_access_driver(dau.driver_id)
  ));

-- B2C vehicle ownership requests have no user/tenant anchor (phone is not an
-- identity). Direct access is disabled until an authenticated verification RPC
-- binds a request to auth.uid() and records an audit event.
DO $phase_c_client_vehicle_requests$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_vehicle_ownership_requests'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.client_vehicle_ownership_requests', p.policyname); END LOOP;
END;
$phase_c_client_vehicle_requests$;
REVOKE ALL PRIVILEGES ON TABLE public.client_vehicle_ownership_requests
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_vehicle_ownership_requests TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Calendars, viewings, workspace and translations
-- ---------------------------------------------------------------------------

-- Workspace membership is a tenant pivot. Invitation recipients can no
-- longer mutate project_id/role/status directly and turn an invitation into
-- membership of an unrelated project.
DO $phase_c_workspace_membership_policies$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['workspace_projects', 'workspace_project_members']
  LOOP
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$phase_c_workspace_membership_policies$;

ALTER TABLE public.workspace_project_members
  DROP CONSTRAINT IF EXISTS workspace_project_members_role_phase_c,
  ADD CONSTRAINT workspace_project_members_role_phase_c
    CHECK (role IN ('owner', 'manager', 'member', 'guest', 'viewer')) NOT VALID,
  DROP CONSTRAINT IF EXISTS workspace_project_members_status_phase_c,
  ADD CONSTRAINT workspace_project_members_status_phase_c
    CHECK (status IN ('active', 'invited', 'disabled', 'declined')) NOT VALID;

CREATE OR REPLACE FUNCTION public.phase_c_protect_workspace_project_anchor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND auth.role() <> 'service_role' THEN
    -- Identity and privilege anchors are derived from the authenticated
    -- command context, never from optional client-supplied metadata.
    IF NEW.status = 'active' AND NEW.role = 'owner' THEN
      NEW.user_id := auth.uid();
      NEW.hierarchy_role := 'owner';
      NEW.invited_by := NULL;
    ELSIF NEW.status = 'invited' THEN
      NEW.user_id := NULL;
      NEW.hierarchy_role := NEW.role;
      NEW.invited_by := auth.uid()::text;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'workspace_project_anchor_is_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.phase_c_protect_workspace_member_anchor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_trusted_command boolean := coalesce(
    current_setting('app.phase_c_workspace_member_command', true),
    'off'
  ) = 'on';
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'workspace_member_project_anchor_is_immutable' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NOT v_trusted_command
     AND (
       NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.hierarchy_role IS DISTINCT FROM OLD.hierarchy_role
       OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
     ) THEN
    RAISE EXCEPTION 'workspace_member_authorization_fields_require_command'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT'
     AND auth.role() = 'service_role'
     AND NOT v_trusted_command THEN
    RAISE EXCEPTION 'workspace_member_service_insert_requires_command'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF auth.role() = 'service_role' AND NOT v_trusted_command THEN
      RAISE EXCEPTION 'workspace_member_service_delete_requires_command'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_c_protect_workspace_project_anchor()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.phase_c_protect_workspace_member_anchor()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS phase_c_protect_workspace_project_anchor
  ON public.workspace_projects;
CREATE TRIGGER phase_c_protect_workspace_project_anchor
  BEFORE UPDATE ON public.workspace_projects
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_project_anchor();
DROP TRIGGER IF EXISTS phase_c_protect_workspace_member_anchor
  ON public.workspace_project_members;
CREATE TRIGGER phase_c_protect_workspace_member_anchor
  BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_project_members
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_member_anchor();

REVOKE ALL PRIVILEGES ON TABLE public.workspace_projects
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_project_members
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_projects
  TO authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.workspace_project_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_project_members
  TO service_role;
GRANT UPDATE (
  display_name, first_name, last_name, phone,
  last_seen_at, is_online, preferred_language, avatar_url
) ON TABLE public.workspace_project_members TO authenticated;

CREATE POLICY phase_c_workspace_projects_select ON public.workspace_projects
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_project(id));
CREATE POLICY phase_c_workspace_projects_insert ON public.workspace_projects
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND status = 'active'
    AND (
      tenant_id IS NULL
      OR public.phase_c_can_manage_provider(tenant_id)
    )
  );
CREATE POLICY phase_c_workspace_projects_update ON public.workspace_projects
  FOR UPDATE TO authenticated
  USING (public.phase_c_can_manage_workspace_project(id))
  WITH CHECK (
    owner_user_id = auth.uid()
    AND status = 'active'
    AND (
      tenant_id IS NULL
      OR public.phase_c_can_manage_provider(tenant_id)
    )
  );
CREATE POLICY phase_c_workspace_projects_delete ON public.workspace_projects
  FOR DELETE TO authenticated
  USING (public.phase_c_can_manage_workspace_project(id));

CREATE POLICY phase_c_workspace_members_select
  ON public.workspace_project_members FOR SELECT TO authenticated
  USING (
    public.phase_c_can_access_workspace_project(project_id)
    OR (
      status = 'invited'
      AND lower(email) = lower(auth.email())
      AND (user_id IS NULL OR user_id = auth.uid())
    )
  );
CREATE POLICY phase_c_workspace_members_insert
  ON public.workspace_project_members FOR INSERT TO authenticated
  WITH CHECK (
    public.phase_c_can_manage_workspace_project(project_id)
    AND (
      (
        user_id = auth.uid()
        AND status = 'active'
        AND role = 'owner'
      )
      OR (
        status = 'invited'
        AND role IN ('member', 'manager', 'guest', 'viewer')
        AND user_id IS NULL
        AND email IS NOT NULL
      )
    )
  );
CREATE POLICY phase_c_workspace_members_update
  ON public.workspace_project_members FOR UPDATE TO authenticated
  USING (
    public.phase_c_can_manage_workspace_content(project_id)
    OR (
      user_id = auth.uid()
      AND status = 'active'
      AND public.phase_c_can_access_workspace_project(project_id)
    )
  )
  WITH CHECK (
    public.phase_c_can_manage_workspace_content(project_id)
    OR (
      user_id = auth.uid()
      AND status = 'active'
      AND public.phase_c_can_access_workspace_project(project_id)
    )
  );
CREATE POLICY phase_c_workspace_members_delete
  ON public.workspace_project_members FOR DELETE TO authenticated
  USING (
    public.phase_c_can_manage_workspace_project(project_id)
    OR (
      status = 'invited'
      AND lower(email) = lower(auth.email())
      AND (user_id IS NULL OR user_id = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.phase_c_accept_workspace_invitation(p_member_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := lower(auth.email());
  v_project_id uuid;
  v_provider_id uuid;
  v_correlation_id uuid := extensions.gen_random_uuid();
BEGIN
  IF v_actor IS NULL OR v_email IS NULL OR p_member_id IS NULL THEN
    RAISE EXCEPTION 'invitation_not_available' USING ERRCODE = '42501';
  END IF;

  SELECT member.project_id, project.tenant_id
    INTO v_project_id, v_provider_id
  FROM public.workspace_project_members AS member
  JOIN public.workspace_projects AS project ON project.id = member.project_id
  WHERE member.id = p_member_id
    AND member.status = 'invited'
    AND lower(member.email) = v_email
    AND (member.user_id IS NULL OR member.user_id = v_actor)
    AND member.role IN ('member', 'manager', 'guest', 'viewer')
    AND project.status = 'active'
    AND (
      project.tenant_id IS NULL
      OR public.phase_c_provider_is_active(project.tenant_id)
    )
  FOR UPDATE OF member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_available' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config(
    'app.phase_c_workspace_member_command', 'on', true
  );

  UPDATE public.workspace_project_members
  SET user_id = v_actor,
      status = 'active',
      display_name = coalesce(nullif(display_name, ''), auth.email())
  WHERE id = p_member_id;

  PERFORM pg_catalog.set_config(
    'app.phase_c_workspace_member_command', 'off', true
  );

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    v_actor, v_provider_id, 'workspace.invitation.accept',
    'workspace_project_member', p_member_id::text,
    'succeeded', v_correlation_id,
    pg_catalog.jsonb_build_object('project_id', v_project_id)
  );

  RETURN v_project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_c_accept_workspace_invitation(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_accept_workspace_invitation(uuid)
  TO authenticated;

-- Membership privilege changes remain table-inaccessible to browsers. These
-- narrow commands re-authorize the caller under row lock and produce an audit
-- event. A manager may administer ordinary members/guests/viewers, but only
-- the project owner/system administrator may grant or remove manager access.
CREATE OR REPLACE FUNCTION public.phase_c_update_workspace_member_role(
  p_member_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project_id uuid;
  v_provider_id uuid;
  v_old_role text;
  v_actor_is_owner boolean;
  v_correlation_id uuid := extensions.gen_random_uuid();
BEGIN
  IF v_actor IS NULL OR p_member_id IS NULL
     OR p_role NOT IN ('manager', 'member', 'guest', 'viewer') THEN
    RAISE EXCEPTION 'workspace_member_change_not_allowed'
      USING ERRCODE = '42501';
  END IF;

  SELECT member.project_id, project.tenant_id, member.role
    INTO v_project_id, v_provider_id, v_old_role
  FROM public.workspace_project_members AS member
  JOIN public.workspace_projects AS project ON project.id = member.project_id
  WHERE member.id = p_member_id
    AND member.status IN ('active', 'invited')
    AND project.status = 'active'
  FOR UPDATE OF member;

  IF NOT FOUND OR NOT public.phase_c_can_manage_workspace_content(v_project_id) THEN
    RAISE EXCEPTION 'workspace_member_change_not_allowed'
      USING ERRCODE = '42501';
  END IF;

  v_actor_is_owner := public.phase_c_can_manage_workspace_project(v_project_id);
  IF v_old_role = 'owner'
     OR (NOT v_actor_is_owner AND (v_old_role = 'manager' OR p_role = 'manager')) THEN
    RAISE EXCEPTION 'workspace_member_change_not_allowed'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config(
    'app.phase_c_workspace_member_command', 'on', true
  );
  UPDATE public.workspace_project_members
  SET role = p_role,
      hierarchy_role = p_role
  WHERE id = p_member_id;
  PERFORM pg_catalog.set_config(
    'app.phase_c_workspace_member_command', 'off', true
  );

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    v_actor, v_provider_id, 'workspace.member.role.change',
    'workspace_project_member', p_member_id::text,
    'succeeded', v_correlation_id,
    pg_catalog.jsonb_build_object(
      'project_id', v_project_id,
      'old_role', v_old_role,
      'new_role', p_role
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.phase_c_remove_workspace_member(
  p_member_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project_id uuid;
  v_provider_id uuid;
  v_target_user_id uuid;
  v_target_role text;
  v_actor_is_owner boolean;
  v_correlation_id uuid := extensions.gen_random_uuid();
BEGIN
  IF v_actor IS NULL OR p_member_id IS NULL THEN
    RAISE EXCEPTION 'workspace_member_remove_not_allowed'
      USING ERRCODE = '42501';
  END IF;

  SELECT member.project_id, project.tenant_id, member.user_id, member.role
    INTO v_project_id, v_provider_id, v_target_user_id, v_target_role
  FROM public.workspace_project_members AS member
  JOIN public.workspace_projects AS project ON project.id = member.project_id
  WHERE member.id = p_member_id
    AND project.status = 'active'
  FOR UPDATE OF member;

  IF NOT FOUND OR NOT public.phase_c_can_manage_workspace_content(v_project_id) THEN
    RAISE EXCEPTION 'workspace_member_remove_not_allowed'
      USING ERRCODE = '42501';
  END IF;

  v_actor_is_owner := public.phase_c_can_manage_workspace_project(v_project_id);
  IF v_target_role = 'owner'
     OR v_target_user_id = v_actor
     OR (NOT v_actor_is_owner AND v_target_role = 'manager') THEN
    RAISE EXCEPTION 'workspace_member_remove_not_allowed'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config(
    'app.phase_c_workspace_member_command', 'on', true
  );
  DELETE FROM public.workspace_project_members WHERE id = p_member_id;
  PERFORM pg_catalog.set_config(
    'app.phase_c_workspace_member_command', 'off', true
  );

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    v_actor, v_provider_id, 'workspace.member.remove',
    'workspace_project_member', p_member_id::text,
    'succeeded', v_correlation_id,
    pg_catalog.jsonb_build_object(
      'project_id', v_project_id,
      'removed_role', v_target_role,
      'removed_user_id', v_target_user_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.phase_c_update_workspace_member_role(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.phase_c_remove_workspace_member(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_update_workspace_member_role(uuid,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase_c_remove_workspace_member(uuid)
  TO authenticated;

-- All workspace child records must inherit the current access decision of
-- their project. Historical policies treated authorship, assignment or a DM
-- participant row as a permanent independent grant, so revoked users could
-- retain data access and authenticated users could attach rows to foreign IDs.
CREATE OR REPLACE FUNCTION public.phase_c_workspace_user_is_active_member(
  p_project_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_project_id IS NOT NULL
     AND p_user_id IS NOT NULL
     AND public.phase_c_can_access_workspace_project(p_project_id)
     AND EXISTS (
       SELECT 1
       FROM public.workspace_projects AS project
       WHERE project.id = p_project_id
         AND project.status = 'active'
         AND (
           project.owner_user_id = p_user_id
           OR EXISTS (
             SELECT 1
             FROM public.workspace_project_members AS member
             WHERE member.project_id = project.id
               AND member.user_id = p_user_id
               AND member.status = 'active'
               AND member.role IN ('owner', 'manager', 'member')
           )
         )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_workspace_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_task_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.workspace_tasks AS task
       WHERE task.id = p_task_id
         AND public.phase_c_can_access_workspace_project(task.project_id)
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_contribute_workspace_task(
  p_task_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_task_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.workspace_tasks AS task
       WHERE task.id = p_task_id
         AND public.phase_c_can_contribute_workspace_project(task.project_id)
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_edit_workspace_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_task_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.workspace_tasks AS task
       WHERE task.id = p_task_id
         AND public.phase_c_can_contribute_workspace_project(task.project_id)
         AND (
           public.phase_c_can_manage_workspace_content(task.project_id)
           OR task.created_by = auth.uid()
           OR task.assigned_user_id = auth.uid()
           OR EXISTS (
             SELECT 1
             FROM public.workspace_task_assignees AS assignee
             WHERE assignee.task_id = task.id
               AND assignee.user_id = auth.uid()
           )
         )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_workspace_task_links_consistent(
  p_project_id uuid,
  p_parent_task_id uuid,
  p_blocked_by_task_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_project_id IS NOT NULL
     AND public.phase_c_can_contribute_workspace_project(p_project_id)
     AND (
       p_parent_task_id IS NULL
       OR EXISTS (
         SELECT 1 FROM public.workspace_tasks AS parent_task
         WHERE parent_task.id = p_parent_task_id
           AND parent_task.project_id = p_project_id
       )
     )
     AND (
       p_blocked_by_task_id IS NULL
       OR EXISTS (
         SELECT 1 FROM public.workspace_tasks AS blocking_task
         WHERE blocking_task.id = p_blocked_by_task_id
           AND blocking_task.project_id = p_project_id
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_workspace_assignee_consistent(
  p_task_id uuid,
  p_user_id uuid,
  p_member_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_task_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.workspace_tasks AS task
       WHERE task.id = p_task_id
         AND public.phase_c_can_edit_workspace_task(task.id)
         AND (
           (
             p_member_id IS NULL
             AND public.phase_c_workspace_user_is_active_member(
               task.project_id, p_user_id
             )
           )
           OR EXISTS (
             SELECT 1
             FROM public.workspace_project_members AS member
             WHERE member.id = p_member_id
               AND member.project_id = task.project_id
               AND member.status = 'active'
               AND member.user_id IS NOT NULL
               AND (p_user_id IS NULL OR p_user_id = member.user_id)
           )
         )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_workspace_channel(
  p_channel_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_channel_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.workspace_channels AS channel
       WHERE channel.id = p_channel_id
         AND public.phase_c_can_contribute_workspace_project(channel.project_id)
         AND (
           channel.type NOT IN ('dm', 'private')
           OR public.phase_c_can_manage_workspace_content(channel.project_id)
           OR channel.created_by = auth.uid()
           OR EXISTS (
             SELECT 1
             FROM public.workspace_channel_participants AS participant
             WHERE participant.channel_id = channel.id
               AND participant.user_id = auth.uid()
           )
         )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_manage_workspace_channel(
  p_channel_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_channel_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.workspace_channels AS channel
       WHERE channel.id = p_channel_id
         AND public.phase_c_can_contribute_workspace_project(channel.project_id)
         AND (
           public.phase_c_can_manage_workspace_content(channel.project_id)
           OR channel.created_by = auth.uid()
         )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_workspace_message(
  p_message_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_message_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.workspace_messages AS message
       WHERE message.id = p_message_id
         AND public.phase_c_can_contribute_workspace_project(message.project_id)
         AND (
           message.channel_id IS NULL
           OR EXISTS (
             SELECT 1 FROM public.workspace_channels AS channel
             WHERE channel.id = message.channel_id
               AND channel.project_id = message.project_id
               AND public.phase_c_can_access_workspace_channel(channel.id)
           )
         )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_workspace_message_links_consistent(
  p_project_id uuid,
  p_channel_id uuid,
  p_reply_to_id uuid,
  p_thread_parent_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_project_id IS NOT NULL
     AND public.phase_c_can_contribute_workspace_project(p_project_id)
     AND (
       p_channel_id IS NULL
       OR EXISTS (
         SELECT 1 FROM public.workspace_channels AS channel
         WHERE channel.id = p_channel_id
           AND channel.project_id = p_project_id
           AND public.phase_c_can_access_workspace_channel(channel.id)
       )
     )
     AND (
       p_reply_to_id IS NULL
       OR EXISTS (
         SELECT 1 FROM public.workspace_messages AS reply
         WHERE reply.id = p_reply_to_id
           AND reply.project_id = p_project_id
       )
     )
     AND (
       p_thread_parent_id IS NULL
       OR EXISTS (
         SELECT 1 FROM public.workspace_messages AS parent
         WHERE parent.id = p_thread_parent_id
           AND parent.project_id = p_project_id
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_workspace_dependency_consistent(
  p_task_id uuid,
  p_depends_on_task_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_task_id IS NOT NULL
     AND p_depends_on_task_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.workspace_tasks AS task
       JOIN public.workspace_tasks AS dependency
         ON dependency.id = p_depends_on_task_id
       WHERE task.id = p_task_id
         AND task.project_id = dependency.project_id
         AND public.phase_c_can_access_workspace_project(task.project_id)
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_access_workspace_document(
  p_document_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_document_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.workspace_documents AS document
       WHERE document.id = p_document_id
         AND public.phase_c_can_access_workspace_project(document.project_id)
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_contribute_workspace_document(
  p_document_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_document_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.workspace_documents AS document
       WHERE document.id = p_document_id
         AND public.phase_c_can_contribute_workspace_project(document.project_id)
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_can_manage_workspace_document(
  p_document_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_document_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.workspace_documents AS document
       WHERE document.id = p_document_id
         AND public.phase_c_can_contribute_workspace_project(document.project_id)
         AND (
           document.created_by = auth.uid()
           OR public.phase_c_can_manage_workspace_content(document.project_id)
         )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_workspace_document_parent_consistent(
  p_project_id uuid,
  p_parent_document_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_project_id IS NOT NULL
     AND public.phase_c_can_contribute_workspace_project(p_project_id)
     AND (
       p_parent_document_id IS NULL
       OR EXISTS (
         SELECT 1
         FROM public.workspace_documents AS parent_document
         WHERE parent_document.id = p_parent_document_id
           AND parent_document.project_id = p_project_id
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_workspace_automation_log_consistent(
  p_automation_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_automation_id IS NOT NULL
     AND p_project_id IS NOT NULL
     AND public.phase_c_can_manage_workspace_content(p_project_id)
     AND EXISTS (
       SELECT 1
       FROM public.workspace_automations AS automation
       WHERE automation.id = p_automation_id
         AND automation.project_id = p_project_id
     )
$$;

CREATE OR REPLACE FUNCTION public.phase_c_protect_workspace_child_anchor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_column text;
BEGIN
  FOREACH v_column IN ARRAY TG_ARGV LOOP
    IF (to_jsonb(NEW) -> v_column) IS DISTINCT FROM
       (to_jsonb(OLD) -> v_column) THEN
      RAISE EXCEPTION 'workspace_child_anchor_is_immutable:%', v_column
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_c_workspace_user_is_active_member(uuid,uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_workspace_task(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_contribute_workspace_task(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_edit_workspace_task(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_workspace_task_links_consistent(uuid,uuid,uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_workspace_assignee_consistent(uuid,uuid,uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_workspace_channel(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_manage_workspace_channel(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_workspace_message(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_workspace_message_links_consistent(uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_workspace_dependency_consistent(uuid,uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_access_workspace_document(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_contribute_workspace_document(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_can_manage_workspace_document(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_workspace_document_parent_consistent(uuid,uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_workspace_automation_log_consistent(uuid,uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phase_c_protect_workspace_child_anchor()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.phase_c_workspace_user_is_active_member(uuid,uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_workspace_task(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_contribute_workspace_task(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_edit_workspace_task(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_workspace_task_links_consistent(uuid,uuid,uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_workspace_assignee_consistent(uuid,uuid,uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_workspace_channel(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_manage_workspace_channel(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_workspace_message(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_workspace_message_links_consistent(uuid,uuid,uuid,uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_workspace_dependency_consistent(uuid,uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_access_workspace_document(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_contribute_workspace_document(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_can_manage_workspace_document(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_workspace_document_parent_consistent(uuid,uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_c_workspace_automation_log_consistent(uuid,uuid)
  TO authenticated, service_role;

-- The historical UI wrote task audit rows directly and could therefore forge
-- old/new values. Preserve the history feature through a database-owned
-- trigger. The compatibility columns are additive because older installations
-- created only action_type while the current UI expects field_name/user_name.
ALTER TABLE public.workspace_task_history
  ADD COLUMN IF NOT EXISTS field_name text,
  ADD COLUMN IF NOT EXISTS user_name text;

CREATE OR REPLACE FUNCTION public.phase_c_record_workspace_task_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_field text;
  v_old text;
  v_new text;
  v_fields constant text[] := ARRAY[
    'title', 'description', 'status', 'priority', 'assigned_user_id',
    'assigned_name', 'due_date', 'parent_task_id', 'blocked_by_task_id',
    'order_index', 'color', 'estimated_hours'
  ];
BEGIN
  FOREACH v_field IN ARRAY v_fields LOOP
    v_old := to_jsonb(OLD) ->> v_field;
    v_new := to_jsonb(NEW) ->> v_field;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.workspace_task_history (
        task_id, action_type, field_name, old_value, new_value,
        user_id, user_name
      ) VALUES (
        NEW.id, 'updated', v_field,
        pg_catalog.left(v_old, 4000), pg_catalog.left(v_new, 4000),
        auth.uid(), auth.email()
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_c_record_workspace_task_history()
  FROM PUBLIC, anon, authenticated, service_role;

DO $phase_c_workspace_content_policies$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workspace_tasks', 'workspace_task_comments', 'workspace_task_history',
    'workspace_task_assignees', 'workspace_task_checklist',
    'workspace_time_entries', 'workspace_task_dependencies',
    'workspace_messages', 'workspace_channels',
    'workspace_channel_participants', 'workspace_message_reactions',
    'workspace_message_pins', 'workspace_documents',
    'workspace_document_versions', 'workspace_document_comments',
    'workspace_automations', 'workspace_automation_logs'
  ]
  LOOP
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      t
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
      t
    );
  END LOOP;
END;
$phase_c_workspace_content_policies$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_tasks
  TO authenticated;
GRANT SELECT, INSERT ON TABLE public.workspace_task_comments TO authenticated;
GRANT SELECT ON TABLE public.workspace_task_history TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.workspace_task_assignees
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_task_checklist
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_time_entries
  TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.workspace_task_dependencies
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_messages
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_channels
  TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.workspace_channel_participants
  TO authenticated;
GRANT UPDATE (last_read_at) ON TABLE public.workspace_channel_participants
  TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.workspace_message_reactions
  TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.workspace_message_pins
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_documents
  TO authenticated;
GRANT SELECT, INSERT ON TABLE public.workspace_document_versions
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_document_comments
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_automations
  TO authenticated;
GRANT SELECT ON TABLE public.workspace_automation_logs TO authenticated;

CREATE POLICY phase_c_workspace_tasks_select ON public.workspace_tasks
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_project(project_id));
CREATE POLICY phase_c_workspace_tasks_insert ON public.workspace_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.phase_c_can_contribute_workspace_project(project_id)
    AND (
      assigned_user_id IS NULL
      OR public.phase_c_workspace_user_is_active_member(
        project_id, assigned_user_id
      )
    )
    AND public.phase_c_workspace_task_links_consistent(
      project_id, parent_task_id, blocked_by_task_id
    )
  );
CREATE POLICY phase_c_workspace_tasks_update ON public.workspace_tasks
  FOR UPDATE TO authenticated
  USING (public.phase_c_can_edit_workspace_task(id))
  WITH CHECK (
    public.phase_c_can_edit_workspace_task(id)
    AND (
      assigned_user_id IS NULL
      OR public.phase_c_workspace_user_is_active_member(
        project_id, assigned_user_id
      )
    )
    AND public.phase_c_workspace_task_links_consistent(
      project_id, parent_task_id, blocked_by_task_id
    )
  );
CREATE POLICY phase_c_workspace_tasks_delete ON public.workspace_tasks
  FOR DELETE TO authenticated
  USING (public.phase_c_can_edit_workspace_task(id));

CREATE POLICY phase_c_workspace_comments_select ON public.workspace_task_comments
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_task(task_id));
CREATE POLICY phase_c_workspace_comments_insert ON public.workspace_task_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.phase_c_can_access_workspace_task(task_id)
    AND public.phase_c_can_contribute_workspace_task(task_id)
  );

CREATE POLICY phase_c_workspace_history_select ON public.workspace_task_history
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_task(task_id));

CREATE POLICY phase_c_workspace_assignees_select ON public.workspace_task_assignees
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_task(task_id));
CREATE POLICY phase_c_workspace_assignees_insert ON public.workspace_task_assignees
  FOR INSERT TO authenticated
  WITH CHECK (
    public.phase_c_workspace_assignee_consistent(task_id, user_id, member_id)
  );
CREATE POLICY phase_c_workspace_assignees_delete ON public.workspace_task_assignees
  FOR DELETE TO authenticated
  USING (public.phase_c_can_edit_workspace_task(task_id));

CREATE POLICY phase_c_workspace_checklist_select ON public.workspace_task_checklist
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_task(task_id));
CREATE POLICY phase_c_workspace_checklist_insert ON public.workspace_task_checklist
  FOR INSERT TO authenticated
  WITH CHECK (
    public.phase_c_can_edit_workspace_task(task_id)
    AND (completed_by IS NULL OR completed_by = auth.uid())
  );
CREATE POLICY phase_c_workspace_checklist_update ON public.workspace_task_checklist
  FOR UPDATE TO authenticated
  USING (public.phase_c_can_edit_workspace_task(task_id))
  WITH CHECK (
    public.phase_c_can_edit_workspace_task(task_id)
    AND (completed_by IS NULL OR completed_by = auth.uid())
  );
CREATE POLICY phase_c_workspace_checklist_delete ON public.workspace_task_checklist
  FOR DELETE TO authenticated
  USING (public.phase_c_can_edit_workspace_task(task_id));

CREATE POLICY phase_c_workspace_time_select ON public.workspace_time_entries
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_task(task_id));
CREATE POLICY phase_c_workspace_time_insert ON public.workspace_time_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.phase_c_can_edit_workspace_task(task_id)
  );
CREATE POLICY phase_c_workspace_time_update ON public.workspace_time_entries
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.phase_c_can_edit_workspace_task(task_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.phase_c_can_edit_workspace_task(task_id)
  );
CREATE POLICY phase_c_workspace_time_delete ON public.workspace_time_entries
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.phase_c_can_edit_workspace_task(task_id)
  );

CREATE POLICY phase_c_workspace_dependencies_select
  ON public.workspace_task_dependencies FOR SELECT TO authenticated
  USING (
    public.phase_c_workspace_dependency_consistent(
      task_id, depends_on_task_id
    )
  );
CREATE POLICY phase_c_workspace_dependencies_insert
  ON public.workspace_task_dependencies FOR INSERT TO authenticated
  WITH CHECK (
    public.phase_c_can_edit_workspace_task(task_id)
    AND
    public.phase_c_workspace_dependency_consistent(
      task_id, depends_on_task_id
    )
  );
CREATE POLICY phase_c_workspace_dependencies_delete
  ON public.workspace_task_dependencies FOR DELETE TO authenticated
  USING (
    public.phase_c_can_edit_workspace_task(task_id)
    AND
    public.phase_c_workspace_dependency_consistent(
      task_id, depends_on_task_id
    )
  );

CREATE POLICY phase_c_workspace_channels_select ON public.workspace_channels
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_channel(id));
CREATE POLICY phase_c_workspace_channels_insert ON public.workspace_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.phase_c_can_manage_workspace_content(project_id)
  );
CREATE POLICY phase_c_workspace_channels_update ON public.workspace_channels
  FOR UPDATE TO authenticated
  USING (public.phase_c_can_manage_workspace_channel(id))
  WITH CHECK (public.phase_c_can_manage_workspace_channel(id));
CREATE POLICY phase_c_workspace_channels_delete ON public.workspace_channels
  FOR DELETE TO authenticated
  USING (public.phase_c_can_manage_workspace_channel(id));

CREATE POLICY phase_c_workspace_messages_select ON public.workspace_messages
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_message(id));
CREATE POLICY phase_c_workspace_messages_insert ON public.workspace_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.phase_c_workspace_message_links_consistent(
      project_id, channel_id, reply_to_id, thread_parent_id
    )
  );
CREATE POLICY phase_c_workspace_messages_update ON public.workspace_messages
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.phase_c_can_access_workspace_message(id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.phase_c_workspace_message_links_consistent(
      project_id, channel_id, reply_to_id, thread_parent_id
    )
  );
CREATE POLICY phase_c_workspace_messages_delete ON public.workspace_messages
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.phase_c_can_access_workspace_message(id)
  );

CREATE POLICY phase_c_workspace_participants_select
  ON public.workspace_channel_participants FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_channel(channel_id));
CREATE POLICY phase_c_workspace_participants_insert
  ON public.workspace_channel_participants FOR INSERT TO authenticated
  WITH CHECK (
    public.phase_c_can_manage_workspace_channel(channel_id)
    AND EXISTS (
      SELECT 1 FROM public.workspace_channels AS channel
      WHERE channel.id = channel_id
        AND public.phase_c_workspace_user_is_active_member(
          channel.project_id, user_id
        )
    )
  );
CREATE POLICY phase_c_workspace_participants_update
  ON public.workspace_channel_participants FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.phase_c_can_access_workspace_channel(channel_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.phase_c_can_access_workspace_channel(channel_id)
  );
CREATE POLICY phase_c_workspace_participants_delete
  ON public.workspace_channel_participants FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() OR public.phase_c_can_manage_workspace_channel(channel_id))
    AND public.phase_c_can_access_workspace_channel(channel_id)
  );

CREATE POLICY phase_c_workspace_reactions_select
  ON public.workspace_message_reactions FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_message(message_id));
CREATE POLICY phase_c_workspace_reactions_insert
  ON public.workspace_message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.phase_c_can_access_workspace_message(message_id)
  );
CREATE POLICY phase_c_workspace_reactions_delete
  ON public.workspace_message_reactions FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.phase_c_can_access_workspace_message(message_id)
  );

CREATE POLICY phase_c_workspace_pins_select ON public.workspace_message_pins
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_message(message_id));
CREATE POLICY phase_c_workspace_pins_insert ON public.workspace_message_pins
  FOR INSERT TO authenticated
  WITH CHECK (
    pinned_by = auth.uid()
    AND public.phase_c_can_access_workspace_message(message_id)
    AND (
      channel_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.workspace_messages AS message
        WHERE message.id = message_id
          AND message.channel_id = channel_id
      )
    )
  );
CREATE POLICY phase_c_workspace_pins_delete ON public.workspace_message_pins
  FOR DELETE TO authenticated
  USING (
    pinned_by = auth.uid()
    AND public.phase_c_can_access_workspace_message(message_id)
  );

CREATE POLICY phase_c_workspace_documents_select ON public.workspace_documents
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_project(project_id));
CREATE POLICY phase_c_workspace_documents_insert ON public.workspace_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.phase_c_can_contribute_workspace_project(project_id)
    AND public.phase_c_workspace_document_parent_consistent(
      project_id, parent_document_id
    )
  );
CREATE POLICY phase_c_workspace_documents_update ON public.workspace_documents
  FOR UPDATE TO authenticated
  USING (public.phase_c_can_manage_workspace_document(id))
  WITH CHECK (
    public.phase_c_can_manage_workspace_document(id)
    AND
    public.phase_c_workspace_document_parent_consistent(
      project_id, parent_document_id
    )
    AND (last_edited_by IS NULL OR last_edited_by = auth.uid())
  );
CREATE POLICY phase_c_workspace_documents_delete ON public.workspace_documents
  FOR DELETE TO authenticated
  USING (public.phase_c_can_manage_workspace_document(id));

CREATE POLICY phase_c_workspace_document_versions_select
  ON public.workspace_document_versions FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_document(document_id));
CREATE POLICY phase_c_workspace_document_versions_insert
  ON public.workspace_document_versions FOR INSERT TO authenticated
  WITH CHECK (
    edited_by = auth.uid()
    AND public.phase_c_can_manage_workspace_document(document_id)
  );

CREATE POLICY phase_c_workspace_document_comments_select
  ON public.workspace_document_comments FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_document(document_id));
CREATE POLICY phase_c_workspace_document_comments_insert
  ON public.workspace_document_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.phase_c_can_access_workspace_document(document_id)
    AND public.phase_c_can_contribute_workspace_document(document_id)
  );
CREATE POLICY phase_c_workspace_document_comments_update
  ON public.workspace_document_comments FOR UPDATE TO authenticated
  USING (
    public.phase_c_can_access_workspace_document(document_id)
    AND (
      user_id = auth.uid()
      OR public.phase_c_can_manage_workspace_document(document_id)
    )
  )
  WITH CHECK (
    public.phase_c_can_access_workspace_document(document_id)
    AND (
      user_id = auth.uid()
      OR public.phase_c_can_manage_workspace_document(document_id)
    )
    AND (
      (is_resolved = false AND resolved_by IS NULL)
      OR (is_resolved = true AND resolved_by = auth.uid())
    )
  );
CREATE POLICY phase_c_workspace_document_comments_delete
  ON public.workspace_document_comments FOR DELETE TO authenticated
  USING (
    public.phase_c_can_access_workspace_document(document_id)
    AND (
      user_id = auth.uid()
      OR public.phase_c_can_manage_workspace_document(document_id)
    )
  );

CREATE POLICY phase_c_workspace_automations_select ON public.workspace_automations
  FOR SELECT TO authenticated
  USING (public.phase_c_can_manage_workspace_content(project_id));
CREATE POLICY phase_c_workspace_automations_insert ON public.workspace_automations
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.phase_c_can_manage_workspace_content(project_id)
  );
CREATE POLICY phase_c_workspace_automations_update ON public.workspace_automations
  FOR UPDATE TO authenticated
  USING (public.phase_c_can_manage_workspace_content(project_id))
  WITH CHECK (public.phase_c_can_manage_workspace_content(project_id));
CREATE POLICY phase_c_workspace_automations_delete ON public.workspace_automations
  FOR DELETE TO authenticated
  USING (public.phase_c_can_manage_workspace_content(project_id));
CREATE POLICY phase_c_workspace_automation_logs_select
  ON public.workspace_automation_logs FOR SELECT TO authenticated
  USING (
    public.phase_c_workspace_automation_log_consistent(
      automation_id, project_id
    )
  );

DROP TRIGGER IF EXISTS phase_c_record_workspace_task_history
  ON public.workspace_tasks;
CREATE TRIGGER phase_c_record_workspace_task_history
  AFTER UPDATE ON public.workspace_tasks
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_record_workspace_task_history();

DROP TRIGGER IF EXISTS phase_c_protect_workspace_task_anchor
  ON public.workspace_tasks;
CREATE TRIGGER phase_c_protect_workspace_task_anchor
  BEFORE UPDATE ON public.workspace_tasks
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'project_id', 'created_by', 'created_at'
  );
DROP TRIGGER IF EXISTS phase_c_protect_workspace_comment_anchor
  ON public.workspace_task_comments;
CREATE TRIGGER phase_c_protect_workspace_comment_anchor
  BEFORE UPDATE ON public.workspace_task_comments
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'task_id', 'user_id', 'created_at'
  );
DROP TRIGGER IF EXISTS phase_c_protect_workspace_history_anchor
  ON public.workspace_task_history;
CREATE TRIGGER phase_c_protect_workspace_history_anchor
  BEFORE UPDATE ON public.workspace_task_history
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'task_id', 'user_id', 'created_at'
  );
DROP TRIGGER IF EXISTS phase_c_protect_workspace_assignee_anchor
  ON public.workspace_task_assignees;
CREATE TRIGGER phase_c_protect_workspace_assignee_anchor
  BEFORE UPDATE ON public.workspace_task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'task_id', 'user_id', 'member_id', 'created_at'
  );
DROP TRIGGER IF EXISTS phase_c_protect_workspace_checklist_anchor
  ON public.workspace_task_checklist;
CREATE TRIGGER phase_c_protect_workspace_checklist_anchor
  BEFORE UPDATE ON public.workspace_task_checklist
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'task_id', 'created_at'
  );
DROP TRIGGER IF EXISTS phase_c_protect_workspace_time_anchor
  ON public.workspace_time_entries;
CREATE TRIGGER phase_c_protect_workspace_time_anchor
  BEFORE UPDATE ON public.workspace_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'task_id', 'user_id', 'created_at'
  );
DROP TRIGGER IF EXISTS phase_c_protect_workspace_message_anchor
  ON public.workspace_messages;
CREATE TRIGGER phase_c_protect_workspace_message_anchor
  BEFORE UPDATE ON public.workspace_messages
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'project_id', 'channel_id', 'user_id', 'created_at'
  );
DROP TRIGGER IF EXISTS phase_c_protect_workspace_channel_anchor
  ON public.workspace_channels;
CREATE TRIGGER phase_c_protect_workspace_channel_anchor
  BEFORE UPDATE ON public.workspace_channels
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'project_id', 'created_by', 'created_at'
  );
DROP TRIGGER IF EXISTS phase_c_protect_workspace_participant_anchor
  ON public.workspace_channel_participants;
CREATE TRIGGER phase_c_protect_workspace_participant_anchor
  BEFORE UPDATE ON public.workspace_channel_participants
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'channel_id', 'user_id', 'created_at'
  );
DROP TRIGGER IF EXISTS phase_c_protect_workspace_document_anchor
  ON public.workspace_documents;
CREATE TRIGGER phase_c_protect_workspace_document_anchor
  BEFORE UPDATE ON public.workspace_documents
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'project_id', 'created_by', 'created_at'
  );
DROP TRIGGER IF EXISTS phase_c_protect_workspace_document_comment_anchor
  ON public.workspace_document_comments;
CREATE TRIGGER phase_c_protect_workspace_document_comment_anchor
  BEFORE UPDATE ON public.workspace_document_comments
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'document_id', 'user_id', 'created_at'
  );
DROP TRIGGER IF EXISTS phase_c_protect_workspace_automation_anchor
  ON public.workspace_automations;
CREATE TRIGGER phase_c_protect_workspace_automation_anchor
  BEFORE UPDATE ON public.workspace_automations
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'project_id', 'created_by', 'created_at'
  );
DROP TRIGGER IF EXISTS phase_c_protect_workspace_automation_log_anchor
  ON public.workspace_automation_logs;
CREATE TRIGGER phase_c_protect_workspace_automation_log_anchor
  BEFORE UPDATE ON public.workspace_automation_logs
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_workspace_child_anchor(
    'id', 'automation_id', 'project_id', 'executed_at'
  );

-- Both legacy token tables expose bearer capabilities directly to the browser
-- and one path generates the token client-side. Keep their data, but disable
-- direct access until a hashed, expiring, rate-limited command replaces them.
DO $phase_c_workspace_legacy_invitation_tokens$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['workspace_invitations', 'workspace_project_invitations']
  LOOP
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      t
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
      t
    );
  END LOOP;
END;
$phase_c_workspace_legacy_invitation_tokens$;

DO $phase_c_viewings$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['viewing_requests','viewing_slots','workspace_notifications','workspace_message_translations'] LOOP
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t); END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$phase_c_viewings$;

CREATE POLICY phase_c_viewing_requests_insert ON public.viewing_requests
  FOR INSERT TO authenticated WITH CHECK (
    client_id = auth.uid()
    AND status = 'pending'
    AND final_plan IS NULL
  );
CREATE POLICY phase_c_viewing_requests_select ON public.viewing_requests
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_viewing_request(id));
CREATE POLICY phase_c_viewing_slots_select ON public.viewing_slots
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_viewing_slot(request_id, agent_id));

REVOKE ALL PRIVILEGES ON TABLE public.viewing_requests
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.viewing_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.viewing_requests TO service_role;

-- confirmation_token and agent contact data are capability/PII fields. A
-- browser can only read the projection below; confirmation and decline remain
-- disabled until a signed, expiring, rate-limited and audited server command
-- replaces the legacy direct token query.
REVOKE ALL PRIVILEGES ON TABLE public.viewing_slots
  FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, request_id, listing_id, agent_id, proposed_slots,
  agent_confirmed_slots, status, email_sent_at, sms_sent_at,
  agent_responded_at, reminder_1h_sent_at, reminder_3h_sent_at, created_at
) ON TABLE public.viewing_slots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.viewing_slots TO service_role;

-- Legacy service booking accepted arbitrary public rows and let a customer
-- rewrite provider, price, commission and status. Reads are provider-bound;
-- creation/completion/cancellation now require a server command that derives
-- price, tenant and identity and records idempotency/audit.
DO $phase_c_service_booking_policies$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['service_bookings', 'service_calendar_blocks']
  LOOP
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$phase_c_service_booking_policies$;

ALTER TABLE public.service_bookings FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.service_bookings
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.service_bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_bookings TO service_role;
CREATE POLICY phase_c_service_bookings_provider_read
  ON public.service_bookings FOR SELECT TO authenticated
  USING (public.phase_c_can_access_provider(provider_id));

ALTER TABLE public.service_calendar_blocks
  DROP CONSTRAINT IF EXISTS service_calendar_blocks_window_phase_c,
  ADD CONSTRAINT service_calendar_blocks_window_phase_c
    CHECK (end_datetime > start_datetime) NOT VALID;

CREATE OR REPLACE FUNCTION public.phase_c_protect_service_calendar_block_anchor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
    OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
    OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'calendar_block_anchor_is_immutable' USING ERRCODE = '42501';
  END IF;

  IF NOT public.phase_c_service_calendar_block_consistent(
    NEW.provider_id, NEW.employee_id, NEW.resource_id
  ) THEN
    RAISE EXCEPTION 'calendar_block_cross_provider_reference' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_c_protect_service_calendar_block_anchor()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS phase_c_protect_service_calendar_block_anchor
  ON public.service_calendar_blocks;
CREATE TRIGGER phase_c_protect_service_calendar_block_anchor
  BEFORE INSERT OR UPDATE ON public.service_calendar_blocks
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_service_calendar_block_anchor();

REVOKE ALL PRIVILEGES ON TABLE public.service_calendar_blocks
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_calendar_blocks
  TO authenticated, service_role;
CREATE POLICY phase_c_calendar_blocks_select
  ON public.service_calendar_blocks FOR SELECT TO authenticated
  USING (public.phase_c_can_access_provider(provider_id));
CREATE POLICY phase_c_calendar_blocks_insert
  ON public.service_calendar_blocks FOR INSERT TO authenticated
  WITH CHECK (
    public.phase_c_can_manage_provider(provider_id)
    AND public.phase_c_service_calendar_block_consistent(
      provider_id, employee_id, resource_id
    )
  );
CREATE POLICY phase_c_calendar_blocks_update
  ON public.service_calendar_blocks FOR UPDATE TO authenticated
  USING (public.phase_c_can_manage_provider(provider_id))
  WITH CHECK (
    public.phase_c_can_manage_provider(provider_id)
    AND public.phase_c_service_calendar_block_consistent(
      provider_id, employee_id, resource_id
    )
  );
CREATE POLICY phase_c_calendar_blocks_delete
  ON public.service_calendar_blocks FOR DELETE TO authenticated
  USING (public.phase_c_can_manage_provider(provider_id));

-- Full calendar rows are private. Public availability must be exposed later as
-- a redacted, range-limited endpoint; visibility='public' is not authorization
-- to read description, location, metadata or booking identifiers.
DO $phase_c_calendar_policies$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['calendar_calendars', 'calendar_events']
  LOOP
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$phase_c_calendar_policies$;

ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_window_phase_c,
  ADD CONSTRAINT calendar_events_window_phase_c
    CHECK (end_at > start_at) NOT VALID;

CREATE OR REPLACE FUNCTION public.phase_c_protect_calendar_anchor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.owner_type IS DISTINCT FROM OLD.owner_type
    OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'calendar_owner_anchor_is_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.phase_c_protect_calendar_event_anchor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.calendar_id IS DISTINCT FROM OLD.calendar_id
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'calendar_event_anchor_is_immutable' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'calendar_event_requires_authentication' USING ERRCODE = '42501';
    END IF;
    NEW.created_by_user_id := coalesce(NEW.created_by_user_id, auth.uid());
    IF NEW.created_by_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'calendar_event_creator_must_match_actor' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_c_protect_calendar_anchor()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.phase_c_protect_calendar_event_anchor()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS phase_c_protect_calendar_anchor ON public.calendar_calendars;
CREATE TRIGGER phase_c_protect_calendar_anchor
  BEFORE UPDATE ON public.calendar_calendars
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_calendar_anchor();
DROP TRIGGER IF EXISTS phase_c_protect_calendar_event_anchor ON public.calendar_events;
CREATE TRIGGER phase_c_protect_calendar_event_anchor
  BEFORE INSERT OR UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.phase_c_protect_calendar_event_anchor();

REVOKE ALL PRIVILEGES ON TABLE public.calendar_calendars
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.calendar_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_calendars
  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.calendar_events
  TO authenticated, service_role;

CREATE POLICY phase_c_calendars_select ON public.calendar_calendars
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_calendar(id));
CREATE POLICY phase_c_calendars_insert ON public.calendar_calendars
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_type = 'user' AND owner_id = auth.uid())
    OR (owner_type = 'company' AND public.phase_c_can_manage_company(owner_id))
    OR (
      owner_type = 'service_provider'
      AND public.phase_c_can_manage_provider(owner_id)
    )
  );
CREATE POLICY phase_c_calendars_update ON public.calendar_calendars
  FOR UPDATE TO authenticated
  USING (public.phase_c_can_manage_calendar(id))
  WITH CHECK (public.phase_c_can_manage_calendar(id));
CREATE POLICY phase_c_calendars_delete ON public.calendar_calendars
  FOR DELETE TO authenticated
  USING (public.phase_c_can_manage_calendar(id));

CREATE POLICY phase_c_calendar_events_select ON public.calendar_events
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_calendar(calendar_id));
CREATE POLICY phase_c_calendar_events_insert ON public.calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND public.phase_c_can_manage_calendar(calendar_id)
  );
CREATE POLICY phase_c_calendar_events_update ON public.calendar_events
  FOR UPDATE TO authenticated
  USING (public.phase_c_can_manage_calendar(calendar_id))
  WITH CHECK (public.phase_c_can_manage_calendar(calendar_id));
CREATE POLICY phase_c_calendar_events_delete ON public.calendar_events
  FOR DELETE TO authenticated
  USING (public.phase_c_can_manage_calendar(calendar_id));

-- Rental payment capability/session fields stay server-only. The composite FK
-- prevents a payment row from claiming a company different from its booking;
-- NOT VALID preserves historical rows for a manual audit/backfill.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_id_company_phase_c_uidx
  ON public.bookings (id, company_id);
ALTER TABLE public.rental_payments
  DROP CONSTRAINT IF EXISTS rental_payments_amount_positive_phase_c,
  ADD CONSTRAINT rental_payments_amount_positive_phase_c
    CHECK (amount > 0) NOT VALID,
  DROP CONSTRAINT IF EXISTS rental_payments_booking_company_phase_c_fkey,
  ADD CONSTRAINT rental_payments_booking_company_phase_c_fkey
    FOREIGN KEY (booking_id, company_id)
    REFERENCES public.bookings (id, company_id)
    NOT VALID;

DROP POLICY IF EXISTS billing_rental_payments_tenant_read
  ON public.rental_payments;
CREATE POLICY phase_c_rental_payments_tenant_read
  ON public.rental_payments FOR SELECT TO authenticated
  USING (
    public.phase_c_can_access_company(company_id)
    AND public.can_use_module(company_id, 'rental')
  );
REVOKE SELECT ON TABLE public.rental_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, company_id, booking_id, kind, amount, method, status,
  paid_at, note, created_at
) ON TABLE public.rental_payments TO authenticated;
GRANT SELECT ON TABLE public.rental_payments TO service_role;

-- OAuth tokens are server-only (reaffirm Phase A lockdown).
DO $phase_c_calendar_tokens$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_calendar_tokens'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.agent_calendar_tokens', p.policyname); END LOOP;
END;
$phase_c_calendar_tokens$;
ALTER TABLE public.agent_calendar_tokens FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.agent_calendar_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_calendar_tokens TO service_role;

CREATE POLICY phase_c_workspace_notifications_select ON public.workspace_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY phase_c_workspace_notifications_update ON public.workspace_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY phase_c_workspace_notifications_delete ON public.workspace_notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY phase_c_workspace_notifications_insert ON public.workspace_notifications
  FOR INSERT TO authenticated WITH CHECK (
    sender_user_id = auth.uid()
    AND (
      (project_id IS NULL AND user_id = auth.uid())
      OR (
        project_id IS NOT NULL
        AND public.phase_c_can_contribute_workspace_project(project_id)
        AND (
          EXISTS (SELECT 1 FROM public.workspace_projects AS wp
            WHERE wp.id = project_id AND wp.owner_user_id = user_id)
          OR EXISTS (SELECT 1 FROM public.workspace_project_members AS wm
            WHERE wm.project_id = workspace_notifications.project_id
              AND wm.user_id = workspace_notifications.user_id
              AND wm.status = 'active')
        )
      )
    )
  );

CREATE POLICY phase_c_workspace_translations_select ON public.workspace_message_translations
  FOR SELECT TO authenticated
  USING (public.phase_c_can_access_workspace_message(message_id));
REVOKE INSERT, UPDATE, DELETE ON TABLE public.workspace_message_translations FROM authenticated;
GRANT SELECT ON TABLE public.workspace_message_translations TO authenticated;

-- Mixed/global caches contain source text but no tenant anchor. Lock them to
-- service_role until cache rows carry visibility + tenant metadata.
DO $phase_c_translation_caches$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'translation_cache_global', 'translations_cache',
    'workshop_translations_cache', 'translation_queue', 'listing_translations'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      FOR p IN SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
      LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t); END LOOP;
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;
END;
$phase_c_translation_caches$;

-- ---------------------------------------------------------------------------
-- 6. AI reports, follow-up/A-B and legacy agent data
-- ---------------------------------------------------------------------------

-- Tables without tenant anchors are deliberately browser-inaccessible.
DO $phase_c_anchorless_ai$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['followup_queue','weekly_learning_reports','ab_tests'] LOOP
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t); END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
  END LOOP;
END;
$phase_c_anchorless_ai$;

-- Global patterns are not exposed until anonymization, consent and minimum
-- aggregation thresholds are implemented. Approval alone is not proof that a
-- row cannot identify a tenant or customer.
DO $phase_c_ai_patterns$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_lead_patterns'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.ai_lead_patterns', p.policyname); END LOOP;
END;
$phase_c_ai_patterns$;
REVOKE ALL PRIVILEGES ON TABLE public.ai_lead_patterns
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_lead_patterns TO service_role;

-- ai_sales_agents mixes domain data with Meta/Twilio/VAPI/calendar secrets.
-- Lock the table; a future redacted DTO + write-only credential endpoint must
-- replace direct UI access.
DO $phase_c_ai_sales_agents$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_sales_agents'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.ai_sales_agents', p.policyname); END LOOP;
END;
$phase_c_ai_sales_agents$;
ALTER TABLE public.ai_sales_agents FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.ai_sales_agents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_sales_agents TO service_role;

DO $phase_c_ai_sales_children$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_sales_leads','ai_sales_conversations','ai_sales_questionnaire','ai_sales_knowledge'] LOOP
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t); END LOOP;
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
  END LOOP;
END;
$phase_c_ai_sales_children$;
CREATE POLICY phase_c_ai_sales_leads_read ON public.ai_sales_leads FOR SELECT TO authenticated
  USING ((agent_id IS NOT NULL AND public.phase_c_owns_ai_sales_agent(agent_id))
    OR (agent_id IS NULL AND user_id = auth.uid()));
CREATE POLICY phase_c_ai_sales_conversations_read ON public.ai_sales_conversations FOR SELECT TO authenticated
  USING (public.phase_c_owns_ai_sales_agent(agent_id));
CREATE POLICY phase_c_ai_sales_questionnaire_read ON public.ai_sales_questionnaire FOR SELECT TO authenticated
  USING (public.phase_c_owns_ai_sales_agent(agent_id));
CREATE POLICY phase_c_ai_sales_knowledge_read ON public.ai_sales_knowledge FOR SELECT TO authenticated
  USING (public.phase_c_owns_ai_sales_agent(agent_id));

-- Legacy scripts/profile remain owner-editable; call logs and learned data are
-- read-only to the owner and server-written.
DO $phase_c_legacy_ai$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_call_business_profiles', 'ai_call_scripts', 'ai_agent_calls',
    'ai_agent_conversations', 'ai_agent_global_knowledge'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t); END LOOP;
  END LOOP;
END;
$phase_c_legacy_ai$;
CREATE POLICY phase_c_ai_call_profiles_select ON public.ai_call_business_profiles FOR SELECT TO authenticated
  USING (public.phase_c_owns_ai_config(config_id) OR public.phase_c_is_system_admin());
CREATE POLICY phase_c_ai_call_profiles_manage ON public.ai_call_business_profiles FOR ALL TO authenticated
  USING (public.phase_c_owns_ai_config(config_id)) WITH CHECK (public.phase_c_owns_ai_config(config_id));
CREATE POLICY phase_c_ai_call_scripts_select ON public.ai_call_scripts FOR SELECT TO authenticated
  USING (public.phase_c_owns_ai_config(config_id) OR public.phase_c_is_system_admin());
CREATE POLICY phase_c_ai_call_scripts_manage ON public.ai_call_scripts FOR ALL TO authenticated
  USING (public.phase_c_owns_ai_config(config_id))
  WITH CHECK (public.phase_c_owns_ai_config(config_id) AND status IN ('draft_ai','approved'));
CREATE POLICY phase_c_ai_agent_calls_read ON public.ai_agent_calls FOR SELECT TO authenticated
  USING (public.phase_c_owns_ai_config(config_id) OR public.phase_c_is_system_admin());
CREATE POLICY phase_c_ai_agent_conversations_read ON public.ai_agent_conversations FOR SELECT TO authenticated
  USING (public.phase_c_owns_ai_config(config_id) OR public.phase_c_is_system_admin());
CREATE POLICY phase_c_ai_global_knowledge_read ON public.ai_agent_global_knowledge FOR SELECT TO authenticated
  USING (
    public.phase_c_is_system_admin()
    OR public.phase_c_owns_ai_config(source_config_id)
  );
REVOKE INSERT, UPDATE, DELETE ON TABLE public.ai_agent_calls FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.ai_agent_conversations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.ai_agent_global_knowledge FROM authenticated;

-- ---------------------------------------------------------------------------
-- 7. Capability-token rentals: close non-empty-token RLS anti-pattern
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public can read rentals via portal token" ON public.vehicle_rentals;
DROP POLICY IF EXISTS "Public can update driver signature with token" ON public.vehicle_rentals;
DROP POLICY IF EXISTS "Public can read rentals with token" ON public.vehicle_rentals;
DROP POLICY IF EXISTS "Public can sign contract via portal token" ON public.vehicle_rentals;
REVOKE ALL PRIVILEGES ON TABLE public.vehicle_rentals FROM anon;

-- Driver direct UPDATE could change status, price, fleet, token and signatures.
-- Keep owner/fleet reads, but writes require a tenant-bound server command.
DROP POLICY IF EXISTS "Drivers can create rental requests" ON public.vehicle_rentals;
DROP POLICY IF EXISTS "Drivers can update own rentals" ON public.vehicle_rentals;
DROP POLICY IF EXISTS "Fleet can manage their rentals" ON public.vehicle_rentals;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.vehicle_rentals FROM authenticated;
GRANT SELECT ON TABLE public.vehicle_rentals TO authenticated;

-- The rental contract RPCs lack expiry, replay control, payload limits and an
-- immutable signature event. Keep them disabled until a signed/rate-limited
-- capability endpoint is implemented.
REVOKE ALL ON FUNCTION public.rental_get_contract(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rental_sign_contract(text, text, text, text) FROM PUBLIC, anon, authenticated;

COMMENT ON VIEW public.service_providers_public IS
  'Public provider DTO. Deliberately excludes credentials, balances, tenant identity and owner PII.';
COMMENT ON VIEW public.service_providers_private IS
  'Authenticated provider DTO. Deliberately excludes credentials and server-managed balances.';
COMMENT ON FUNCTION public.phase_c_protect_service_provider() IS
  'Fail-closed guard. Direct service_role profile/tenant writes are blocked; SMS mirror must equal the canonical ledger. Privileged changes require a narrowly scoped audited RPC.';
