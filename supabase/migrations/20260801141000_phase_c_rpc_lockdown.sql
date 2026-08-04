-- Phase C: SECURITY DEFINER / RPC lockdown.
--
-- This migration deliberately does not restore anonymous capability-token RPCs.
-- They require a rate-limited Edge boundary, hashed expiring tokens, replay
-- protection and an audit trail before they can be safely re-enabled.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Role lookup is used by many RLS policies.  Bind arbitrary user parameters to
-- the caller, while retaining explicit administrator/service operation.
CREATE OR REPLACE FUNCTION public.has_role(
  _user_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN EXISTS (
      SELECT 1 FROM public.user_roles AS target
      WHERE target.user_id = _user_id AND target.role = _role
    )
    WHEN auth.uid() IS NULL THEN false
    WHEN _user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.user_roles AS actor
      WHERE actor.user_id = auth.uid()
        AND actor.role = 'admin'::public.app_role
    ) THEN EXISTS (
      SELECT 1 FROM public.user_roles AS target
      WHERE target.user_id = _user_id AND target.role = _role
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_fleet_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT ur.fleet_id
  FROM public.user_roles AS ur
  WHERE ur.user_id = _user_id
    AND ur.role IN ('fleet_settlement', 'fleet_rental')
    AND (
      auth.role() = 'service_role'
      OR _user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_marketplace_profile_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT profile.id
  FROM public.marketplace_user_profiles AS profile
  WHERE profile.user_id = p_user_id
    AND (
      auth.role() = 'service_role'
      OR p_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_provider_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT provider.id
  FROM public.service_providers AS provider
  LEFT JOIN public.companies AS company ON company.id = provider.company_id
  WHERE provider.user_id = p_user_id
    AND provider.status IS DISTINCT FROM 'suspended'
    AND (
      provider.company_id IS NULL
      OR company.status = 'active'
    )
    AND (
      auth.role() = 'service_role'
      OR p_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    );
$$;

-- Compatibility helpers still referenced by historical RLS are rebound to
-- active tenant state. A suspended company/provider cannot stay reachable via
-- an older policy that calls these names.
CREATE OR REPLACE FUNCTION public.is_company_owner(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.companies AS company
       WHERE company.id = p_company_id
         AND company.status = 'active'
         AND company.owner_user_id = auth.uid()
     )
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.company_members AS member
       JOIN public.companies AS company ON company.id = member.company_id
       WHERE member.company_id = p_company_id
         AND member.user_id = auth.uid()
         AND member.status = 'active'
         AND company.status = 'active'
     )
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_project_owner(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.phase_c_can_manage_workspace_project(p_project_id)
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.phase_c_can_access_workspace_project(p_project_id)
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_owned_project_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT project.id
  FROM public.workspace_projects AS project
  WHERE public.phase_c_can_manage_workspace_project(project.id)
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_member_project_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT project.id
  FROM public.workspace_projects AS project
  WHERE public.phase_c_can_access_workspace_project(project.id)
$$;

CREATE OR REPLACE FUNCTION public.can_access_workspace_task_project(
  p_task_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.phase_c_can_access_workspace_task(p_task_id)
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_task_assignee(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.phase_c_can_access_workspace_task(p_task_id)
     AND EXISTS (
       SELECT 1
       FROM public.workspace_task_assignees AS assignee
       WHERE assignee.task_id = p_task_id
         AND assignee.user_id = auth.uid()
     )
$$;

CREATE OR REPLACE FUNCTION public.is_sales_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (
    auth.role() = 'service_role'
    OR p_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) AND EXISTS (
    SELECT 1 FROM public.user_roles AS role_row
    WHERE role_row.user_id = p_user_id
      AND role_row.role IN ('sales_admin', 'sales_rep')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_sales_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (
    auth.role() = 'service_role'
    OR p_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) AND EXISTS (
    SELECT 1 FROM public.user_roles AS role_row
    WHERE role_row.user_id = p_user_id
      AND role_row.role = 'sales_admin'::public.app_role
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_driver(
  _user_id uuid,
  _driver_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (
    auth.role() = 'service_role'
    OR _user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) AND EXISTS (
    SELECT 1
    FROM public.drivers AS driver
    WHERE driver.id = _driver_id
      AND (
        public.has_role(_user_id, 'admin'::public.app_role)
        OR driver.fleet_id = public.get_user_fleet_id(_user_id)
      )
  );
$$;

-- Preserve the existing UI contract, but ignore the claimed user identity and
-- verify that the caller can see the requested driver before reading history.
CREATE OR REPLACE FUNCTION public.can_change_settlement_plan(
  _driver_id uuid,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_admin boolean;
  v_last_change_date timestamptz;
  v_days_since_change integer;
  v_can_change boolean;
  v_days_until_change integer;
BEGIN
  IF v_actor_id IS NULL OR _user_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_role(v_actor_id, 'admin'::public.app_role);
  IF NOT v_is_admin
     AND NOT public.user_can_access_driver(v_actor_id, _driver_id)
     AND NOT public.driver_owns_record(_driver_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF v_is_admin THEN
    RETURN jsonb_build_object(
      'can_change', true,
      'is_admin', true,
      'reason', 'Administrator może zmieniać plan w dowolnym momencie'
    );
  END IF;

  SELECT change.changed_at INTO v_last_change_date
  FROM public.settlement_plan_changes AS change
  WHERE change.driver_id = _driver_id
  ORDER BY change.changed_at DESC
  LIMIT 1;

  IF v_last_change_date IS NULL THEN
    RETURN jsonb_build_object(
      'can_change', true,
      'is_admin', false,
      'reason', 'Brak wcześniejszych zmian planu'
    );
  END IF;

  v_days_since_change := extract(epoch FROM (now() - v_last_change_date)) / 86400;
  v_can_change := v_days_since_change >= 30;
  v_days_until_change := greatest(0, 30 - v_days_since_change);

  RETURN jsonb_build_object(
    'can_change', v_can_change,
    'is_admin', false,
    'days_since_last_change', v_days_since_change,
    'days_until_next_change', v_days_until_change,
    'last_change_date', v_last_change_date,
    'reason', CASE
      WHEN v_can_change THEN 'Minęło 30 dni od ostatniej zmiany'
      ELSE format('Następna zmiana możliwa za %s dni', v_days_until_change)
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_use_module(
  p_company_id uuid,
  p_module_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.phase_c_can_access_company(p_company_id)
    AND public.company_module_enabled(p_company_id, p_module_key)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR NOT EXISTS (
        SELECT 1 FROM public.module_visibility AS visibility
        WHERE visibility.module_key = p_module_key
      )
      OR EXISTS (
        SELECT 1
        FROM public.module_visibility AS visibility
        JOIN public.user_roles AS role_row
          ON role_row.user_id = auth.uid()
         AND role_row.role::text = ANY (visibility.visible_to_roles)
        WHERE visibility.module_key = p_module_key
          AND visibility.is_active = true
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.init_workshop_default_statuses(p_provider_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.phase_c_can_manage_provider(p_provider_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Serialize initialisation per provider. The historical table has no unique
  -- (provider_id, name) constraint, so ON CONFLICT alone never deduplicated.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider_id::text, 0)
  );

  INSERT INTO public.workshop_order_statuses
    (provider_id, name, color, sort_order, is_default, sends_sms)
  SELECT p_provider_id, defaults.name, defaults.color,
         defaults.sort_order, defaults.is_default, defaults.sends_sms
  FROM (VALUES
    ('Przyjęcie do serwisu', '#3b82f6', 0, true, false),
    ('Nowe zlecenie', '#9ca3af', 1, false, false),
    ('Zaakceptowano', '#22c55e', 2, false, true),
    ('W trakcie naprawy', '#3b82f6', 3, false, false),
    ('Zadania wykonane', '#22c55e', 4, false, false),
    ('Gotowy do odbioru', '#7c3aed', 5, false, true),
    ('Zakończone', '#1f2937', 6, false, false)
  ) AS defaults(name, color, sort_order, is_default, sends_sms)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.workshop_order_statuses AS existing
    WHERE existing.provider_id = p_provider_id
      AND lower(existing.name) = lower(defaults.name)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_pending_reviews(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR (
    p_user_id IS DISTINCT FROM auth.uid()
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.pending_service_reviews AS review
    WHERE review.user_id = p_user_id AND review.resolved_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_commission(
  p_provider_id uuid,
  p_category_id uuid DEFAULT NULL
)
RETURNS TABLE(commission_type text, commission_value numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.phase_c_can_access_provider(p_provider_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT commission.commission_type, commission.commission_value
    FROM public.service_provider_commissions AS commission
    WHERE commission.provider_id = p_provider_id
      AND (commission.category_id = p_category_id OR commission.category_id IS NULL)
      AND (commission.valid_from IS NULL OR commission.valid_from <= current_date)
      AND (commission.valid_to IS NULL OR commission.valid_to >= current_date)
    ORDER BY commission.is_promo DESC,
             (commission.category_id IS NOT NULL) DESC,
             commission.created_at DESC
    LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.telegram_bot_token_is_set()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.secure_app_settings AS setting
    WHERE setting.key = 'telegram_bot_token'
      AND coalesce(length(setting.value ->> 'token'), 0) > 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_voice_cache_stats()
RETURNS TABLE(
  total_phrases bigint,
  total_size_bytes bigint,
  estimated_savings_pln numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT count(*)::bigint,
           coalesce(sum(length(cache.audio_url)), 0)::bigint,
           (count(*) * 0.015)::numeric
    FROM public.voice_phrase_cache AS cache;
END;
$$;

-- Remove PostgreSQL's implicit PUBLIC EXECUTE and normalize search_path for
-- every overload currently installed in public. Trigger functions continue to
-- work because trigger execution does not require a client EXECUTE grant.
DO $phase_c_all_definers$
DECLARE
  function_row record;
  role_row record;
  function_identity text;
BEGIN
  FOR function_row IN
    SELECT procedure.oid,
           procedure.proname,
           pg_get_function_identity_arguments(procedure.oid) AS identity_args
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.prokind = 'f'
      AND procedure.prosecdef
  LOOP
    function_identity := format(
      '%I.%I(%s)', 'public', function_row.proname, function_row.identity_args
    );
    EXECUTE 'ALTER FUNCTION ' || function_identity
      || ' SET search_path TO pg_catalog, public';
    EXECUTE 'REVOKE ALL ON FUNCTION ' || function_identity || ' FROM PUBLIC';
    -- Historyczne migracje często nadawały EXECUTE bezpośrednio rolom API.
    -- Samo odebranie PUBLIC nie tworzyłoby rzeczywistej allowlisty.
    FOR role_row IN
      SELECT role.rolname
      FROM pg_roles AS role
      WHERE role.rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
      EXECUTE 'REVOKE ALL ON FUNCTION ' || function_identity
        || format(' FROM %I', role_row.rolname);
    END LOOP;
  END LOOP;
END;
$phase_c_all_definers$;

-- Confirmed unsafe contracts. Re-enable only after replacing the direct RPC
-- with a server-authorized, tenant-bound, idempotent and audited boundary.
DO $phase_c_blocked$
DECLARE
  function_row record;
  role_row record;
  function_identity text;
  blocked_names constant text[] := ARRAY[
    'billing_admin_grant',
    'billing_apply_verified_payment',
    'billing_attach_gateway_session',
    'billing_post_value_entry_internal',
    'calculate_driver_payout_with_debt',
    'complete_referral_on_first_purchase',
    'confirm_workshop_booking_by_token',
    'credit_welcome_bonus',
    'deduct_sms_credit',
    'deduct_vehicle_lookup_credit',
    'get_workshop_booking_by_token',
    'get_workshop_order_by_client_code',
    'has_ai_pro_access',
    'increment_driver_debt',
    'merge_duplicate_drivers',
    'my_fuel_transactions',
    'cancel_workshop_booking_by_token',
    'rental_create_gielda_booking',
    'rental_get_contract',
    'rental_dashboard_summary',
    'rental_listing_availability',
    'rental_sign_contract',
    'reschedule_workshop_booking_by_token',
    'sign_workshop_document_by_client_code'
  ];
BEGIN
  FOR function_row IN
    SELECT procedure.oid,
           procedure.proname,
           pg_get_function_identity_arguments(procedure.oid) AS identity_args
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.prokind = 'f'
      AND procedure.proname = ANY (blocked_names)
  LOOP
    function_identity := format(
      '%I.%I(%s)', 'public', function_row.proname, function_row.identity_args
    );
    EXECUTE 'REVOKE ALL ON FUNCTION ' || function_identity || ' FROM PUBLIC';
    FOR role_row IN
      SELECT role.rolname
      FROM pg_roles AS role
      WHERE role.rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
      EXECUTE 'REVOKE ALL ON FUNCTION ' || function_identity
        || format(' FROM %I', role_row.rolname);
    END LOOP;
    EXECUTE format(
      'COMMENT ON FUNCTION %s IS %L',
      function_identity,
      'PHASE C SECURITY: direct execution is fail-closed pending a tenant-bound, idempotent and audited server boundary.'
    );
  END LOOP;
END;
$phase_c_blocked$;

-- Explicit allowlist. Signatures are resolved with to_regprocedure so a future
-- overload never inherits a grant merely because it shares a function name.
DO $phase_c_grants$
DECLARE
  function_signature text;
  function_oid regprocedure;
  authenticated_signatures constant text[] := ARRAY[
    'public.admin_find_user_by_email(text)',
    'public.admin_list_service_providers()',
    'public.can_access_workspace_task_project(uuid)',
    'public.can_change_settlement_plan(uuid,uuid)',
    'public.can_use_module(uuid,text)',
    'public.current_user_pl_phone()',
    'public.disconnect_telegram()',
    'public.driver_has_vehicle_access(uuid)',
    'public.driver_owns_record(uuid)',
    'public.ensure_referral_code(uuid)',
    'public.generate_telegram_token()',
    'public.get_active_commission(uuid,uuid)',
    'public.get_driver_city_id()',
    'public.get_my_agent_ids()',
    'public.get_my_driver_ids()',
    'public.get_my_fleet_ids()',
    'public.get_my_invited_projects()',
    'public.get_next_invoice_number(uuid,integer,integer)',
    'public.get_user_fleet_id(uuid)',
    'public.get_user_marketplace_profile_id(uuid)',
    'public.get_user_provider_ids(uuid)',
    'public.get_voice_cache_stats()',
    'public.get_workspace_member_project_ids()',
    'public.get_workspace_owned_project_ids()',
    'public.has_role(uuid,public.app_role)',
    'public.init_workshop_default_statuses(uuid)',
    'public.is_accounting_admin_for_entity(uuid)',
    'public.is_company_member(uuid)',
    'public.is_company_owner(uuid)',
    'public.is_driver_user()',
    'public.is_entity_owner(uuid)',
    'public.is_plan_available(uuid)',
    'public.is_sales_admin(uuid)',
    'public.is_sales_user(uuid)',
    'public.is_workspace_project_member(uuid)',
    'public.is_workspace_project_owner(uuid)',
    'public.is_workspace_task_assignee(uuid)',
    'public.link_auth_user_to_driver(uuid,uuid)',
    'public.link_referral_on_signup(uuid,text,text,text)',
    'public.peek_next_invoice_number(uuid,integer,integer)',
    'public.phase_c_accept_workspace_invitation(uuid)',
    'public.phase_c_can_access_workspace_channel(uuid)',
    'public.phase_c_can_access_workspace_document(uuid)',
    'public.phase_c_can_access_workspace_message(uuid)',
    'public.phase_c_can_access_calendar(uuid)',
    'public.phase_c_can_access_company(uuid)',
    'public.phase_c_can_access_driver(uuid)',
    'public.phase_c_can_access_provider(uuid)',
    'public.phase_c_can_access_provider_owner(uuid)',
    'public.phase_c_can_access_vehicle(uuid)',
    'public.phase_c_can_access_vehicle_assignment(uuid,uuid,uuid)',
    'public.phase_c_can_access_viewing_request(uuid)',
    'public.phase_c_can_access_viewing_slot(uuid,uuid)',
    'public.phase_c_can_access_workspace_project(uuid)',
    'public.phase_c_can_access_workspace_task(uuid)',
    'public.phase_c_can_contribute_workspace_document(uuid)',
    'public.phase_c_can_contribute_workspace_project(uuid)',
    'public.phase_c_can_contribute_workspace_task(uuid)',
    'public.phase_c_can_edit_workspace_task(uuid)',
    'public.phase_c_can_manage_calendar(uuid)',
    'public.phase_c_can_manage_company(uuid)',
    'public.phase_c_can_manage_driver(uuid)',
    'public.phase_c_can_manage_provider(uuid)',
    'public.phase_c_can_manage_provider_owner(uuid)',
    'public.phase_c_can_manage_vehicle(uuid)',
    'public.phase_c_can_manage_vehicle_assignment(uuid,uuid,uuid)',
    'public.phase_c_can_manage_workspace_project(uuid)',
    'public.phase_c_can_manage_workspace_channel(uuid)',
    'public.phase_c_can_manage_workspace_content(uuid)',
    'public.phase_c_can_manage_workspace_document(uuid)',
    'public.phase_c_is_system_admin()',
    'public.phase_c_owns_ai_config(uuid)',
    'public.phase_c_owns_ai_sales_agent(uuid)',
    'public.phase_c_provider_is_active(uuid)',
    'public.phase_c_service_calendar_block_consistent(uuid,uuid,uuid)',
    'public.phase_c_workspace_assignee_consistent(uuid,uuid,uuid)',
    'public.phase_c_workspace_automation_log_consistent(uuid,uuid)',
    'public.phase_c_workspace_dependency_consistent(uuid,uuid)',
    'public.phase_c_workspace_document_parent_consistent(uuid,uuid)',
    'public.phase_c_workspace_message_links_consistent(uuid,uuid,uuid,uuid)',
    'public.phase_c_workspace_task_links_consistent(uuid,uuid,uuid)',
    'public.phase_c_workspace_user_is_active_member(uuid,uuid)',
    'public.phase_c_remove_workspace_member(uuid)',
    'public.phase_c_update_workspace_member_role(uuid,text)',
    'public.telegram_bot_token_is_set()',
    'public.user_can_access_driver(uuid,uuid)',
    'public.user_has_pending_reviews(uuid)',
    'public.validate_promo_code(text)'
  ];
  service_signatures constant text[] := ARRAY[
    'public.billing_create_payment_order(uuid,text,uuid,uuid,uuid)',
    'public.cache_global_translation(text,text,text,text,text)',
    'public.claim_domain_events(integer)',
    'public.company_module_enabled(uuid,text)',
    'public.ensure_referral_code(uuid)',
    'public.get_next_invoice_number(uuid,integer,integer)',
    'public.init_workshop_default_statuses(uuid)',
    'public.link_referral_on_signup(uuid,text,text,text)',
    'public.next_workshop_order_number(uuid,text)',
    'public.peek_next_invoice_number(uuid,integer,integer)'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    FOREACH function_signature IN ARRAY authenticated_signatures LOOP
      function_oid := to_regprocedure(function_signature);
      IF function_oid IS NOT NULL THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', function_oid);
      END IF;
    END LOOP;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    FOREACH function_signature IN ARRAY service_signatures LOOP
      function_oid := to_regprocedure(function_signature);
      IF function_oid IS NOT NULL THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_oid);
      END IF;
    END LOOP;
  END IF;

  -- Some public RLS policies call has_role(auth.uid(), ...). The hardened
  -- function always returns false for an anonymous caller and reveals nothing.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    function_oid := to_regprocedure('public.has_role(uuid,public.app_role)');
    IF function_oid IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', function_oid);
    END IF;
  END IF;
END;
$phase_c_grants$;

-- Migration-time gates: abort atomically if PUBLIC survives or a blocked RPC is
-- still executable by a gateway role (including inherited privileges).
DO $phase_c_assertions$
DECLARE
  violation text;
  gateway_role text;
  blocked_names constant text[] := ARRAY[
    'billing_admin_grant', 'billing_apply_verified_payment',
    'billing_attach_gateway_session', 'billing_post_value_entry_internal',
    'calculate_driver_payout_with_debt', 'complete_referral_on_first_purchase',
    'confirm_workshop_booking_by_token', 'credit_welcome_bonus',
    'deduct_sms_credit', 'deduct_vehicle_lookup_credit',
    'get_workshop_booking_by_token', 'get_workshop_order_by_client_code',
    'has_ai_pro_access', 'increment_driver_debt', 'merge_duplicate_drivers',
    'my_fuel_transactions',
    'cancel_workshop_booking_by_token', 'rental_create_gielda_booking',
    'rental_dashboard_summary', 'rental_get_contract',
    'rental_listing_availability', 'rental_sign_contract',
    'reschedule_workshop_booking_by_token',
    'sign_workshop_document_by_client_code'
  ];
BEGIN
  SELECT procedure.oid::regprocedure::text INTO violation
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL aclexplode(
    coalesce(procedure.proacl, acldefault('f', procedure.proowner))
  ) AS privilege
  WHERE namespace.nspname = 'public'
    AND procedure.prokind = 'f'
    AND procedure.prosecdef
    AND privilege.grantee = 0
    AND privilege.privilege_type = 'EXECUTE'
  LIMIT 1;

  IF violation IS NOT NULL THEN
    RAISE EXCEPTION 'phase_c_public_execute_survived:%', violation;
  END IF;

  FOREACH gateway_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = gateway_role) THEN
      SELECT procedure.oid::regprocedure::text INTO violation
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.prokind = 'f'
        AND procedure.proname = ANY (blocked_names)
        AND has_function_privilege(gateway_role, procedure.oid, 'EXECUTE')
      LIMIT 1;

      IF violation IS NOT NULL THEN
        RAISE EXCEPTION 'phase_c_blocked_execute_survived:%:%', gateway_role, violation;
      END IF;
    END IF;
    violation := NULL;
  END LOOP;
END;
$phase_c_assertions$;
