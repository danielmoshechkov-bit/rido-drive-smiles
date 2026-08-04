-- Run only against a disposable local Supabase database after all migrations:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/security/phase_c_tenant_isolation.sql
-- The transaction always rolls back. Never point this fixture at production.

BEGIN;

-- Seed synthetic rows as the local database owner. Disabling triggers is
-- limited to this rollback-only fixture and avoids requiring real auth.users
-- rows; all attack attempts below run again with triggers enabled.
SET LOCAL session_replication_role = replica;

INSERT INTO public.companies (id, name, owner_user_id, status)
VALUES
  ('20000000-0000-4000-8000-00000000000a', 'Security Tenant A',
   '10000000-0000-4000-8000-00000000000a', 'active'),
  ('20000000-0000-4000-8000-00000000000b', 'Security Tenant B',
   '10000000-0000-4000-8000-00000000000b', 'active');

INSERT INTO public.company_members (company_id, user_id, is_owner, status)
VALUES
  ('20000000-0000-4000-8000-00000000000a',
   '10000000-0000-4000-8000-00000000000a', true, 'active'),
  ('20000000-0000-4000-8000-00000000000b',
   '10000000-0000-4000-8000-00000000000b', true, 'active');

INSERT INTO public.private_storage_objects (
  id, bucket_id, object_path, tenant_id, owner_user_id,
  resource_type, classification, status
)
VALUES
  ('30000000-0000-4000-8000-00000000000a', 'documents',
   'tenant-a/document-a.pdf', '20000000-0000-4000-8000-00000000000a',
   '10000000-0000-4000-8000-00000000000a', 'security_fixture', 'private', 'active'),
  ('30000000-0000-4000-8000-00000000000b', 'documents',
   'tenant-b/document-b.pdf', '20000000-0000-4000-8000-00000000000b',
   '10000000-0000-4000-8000-00000000000b', 'security_fixture', 'private', 'active');

INSERT INTO public.cities (id, name)
VALUES ('40000000-0000-4000-8000-000000000001', 'Security Fixture City');

INSERT INTO public.fleets (id, name)
VALUES
  ('41000000-0000-4000-8000-00000000000a', 'Security Fixture Fleet A'),
  ('41000000-0000-4000-8000-00000000000b', 'Security Fixture Fleet B');

INSERT INTO public.drivers (id, city_id, fleet_id, first_name, last_name)
VALUES
  ('42000000-0000-4000-8000-00000000000a',
   '40000000-0000-4000-8000-000000000001',
   '41000000-0000-4000-8000-00000000000a', 'Driver', 'A'),
  ('42000000-0000-4000-8000-00000000000b',
   '40000000-0000-4000-8000-000000000001',
   '41000000-0000-4000-8000-00000000000b', 'Driver', 'B');

INSERT INTO public.driver_app_users (user_id, driver_id, city_id)
VALUES
  ('10000000-0000-4000-8000-00000000000a',
   '42000000-0000-4000-8000-00000000000a',
   '40000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-00000000000b',
   '42000000-0000-4000-8000-00000000000b',
   '40000000-0000-4000-8000-000000000001');

INSERT INTO public.vehicles (id, plate, brand, model, fleet_id)
VALUES
  ('43000000-0000-4000-8000-00000000000a', 'SEC-A-001', 'Test', 'A',
   '41000000-0000-4000-8000-00000000000a'),
  ('43000000-0000-4000-8000-00000000000b', 'SEC-B-001', 'Test', 'B',
   '41000000-0000-4000-8000-00000000000b');

INSERT INTO public.driver_vehicle_assignments
  (id, driver_id, vehicle_id, fleet_id, status)
VALUES
  ('44000000-0000-4000-8000-00000000000a',
   '42000000-0000-4000-8000-00000000000a',
   '43000000-0000-4000-8000-00000000000a',
   '41000000-0000-4000-8000-00000000000a', 'active'),
  ('44000000-0000-4000-8000-00000000000b',
   '42000000-0000-4000-8000-00000000000b',
   '43000000-0000-4000-8000-00000000000b',
   '41000000-0000-4000-8000-00000000000b', 'active');

INSERT INTO public.workspace_projects (id, name, owner_user_id, status)
VALUES
  ('45000000-0000-4000-8000-00000000000a', 'Workspace A',
   '10000000-0000-4000-8000-00000000000a', 'active'),
  ('45000000-0000-4000-8000-00000000000b', 'Workspace B',
   '10000000-0000-4000-8000-00000000000b', 'active');

INSERT INTO public.workspace_project_members
  (id, project_id, user_id, email, role, hierarchy_role, status)
VALUES
  ('46000000-0000-4000-8000-00000000000a',
   '45000000-0000-4000-8000-00000000000b',
   NULL, 'security-a@example.test', 'member', 'member', 'invited'),
  ('46000000-0000-4000-8000-00000000000c',
   '45000000-0000-4000-8000-00000000000a',
   '10000000-0000-4000-8000-00000000000c', 'viewer-c@example.test',
   'viewer', 'viewer', 'active'),
  ('46000000-0000-4000-8000-00000000000d',
   '45000000-0000-4000-8000-00000000000a',
   '10000000-0000-4000-8000-00000000000d', 'member-d@example.test',
   'member', 'member', 'active'),
  ('46000000-0000-4000-8000-00000000000e',
   '45000000-0000-4000-8000-00000000000a',
   '10000000-0000-4000-8000-00000000000e', 'manager-e@example.test',
   'manager', 'manager', 'active'),
  ('46000000-0000-4000-8000-00000000000f',
   '45000000-0000-4000-8000-00000000000a',
   '10000000-0000-4000-8000-00000000000f', 'member-f@example.test',
   'member', 'member', 'active');

INSERT INTO public.workspace_tasks
  (id, project_id, title, created_by)
VALUES
  ('45100000-0000-4000-8000-00000000000a',
   '45000000-0000-4000-8000-00000000000a', 'Task A',
   '10000000-0000-4000-8000-00000000000a'),
  ('45100000-0000-4000-8000-00000000000b',
   '45000000-0000-4000-8000-00000000000b', 'Task B',
   '10000000-0000-4000-8000-00000000000b');

INSERT INTO public.workspace_task_history
  (id, task_id, action_type, user_id)
VALUES
  ('45200000-0000-4000-8000-00000000000a',
   '45100000-0000-4000-8000-00000000000a', 'created',
   '10000000-0000-4000-8000-00000000000a'),
  ('45200000-0000-4000-8000-00000000000b',
   '45100000-0000-4000-8000-00000000000b', 'created',
   '10000000-0000-4000-8000-00000000000b');

INSERT INTO public.workspace_task_comments
  (id, task_id, user_id, content)
VALUES
  ('45300000-0000-4000-8000-00000000000a',
   '45100000-0000-4000-8000-00000000000a',
   '10000000-0000-4000-8000-00000000000a', 'Comment A'),
  ('45300000-0000-4000-8000-00000000000b',
   '45100000-0000-4000-8000-00000000000b',
   '10000000-0000-4000-8000-00000000000b', 'Comment B');

INSERT INTO public.workspace_channels
  (id, project_id, name, type, created_by)
VALUES
  ('45400000-0000-4000-8000-00000000000a',
   '45000000-0000-4000-8000-00000000000a', 'General A', 'public',
   '10000000-0000-4000-8000-00000000000a'),
  ('45400000-0000-4000-8000-00000000000b',
   '45000000-0000-4000-8000-00000000000b', 'Private B', 'private',
   '10000000-0000-4000-8000-00000000000b');

-- Stale/malicious participant and sender rows must never replace current
-- project membership as the authorization source.
INSERT INTO public.workspace_channel_participants
  (id, channel_id, user_id)
VALUES
  ('45500000-0000-4000-8000-00000000000a',
   '45400000-0000-4000-8000-00000000000b',
   '10000000-0000-4000-8000-00000000000a');

INSERT INTO public.workspace_messages
  (id, project_id, channel_id, user_id, content)
VALUES
  ('45600000-0000-4000-8000-00000000000a',
   '45000000-0000-4000-8000-00000000000a',
   '45400000-0000-4000-8000-00000000000a',
   '10000000-0000-4000-8000-00000000000a',
   'Internal message A'),
  ('45600000-0000-4000-8000-00000000000b',
   '45000000-0000-4000-8000-00000000000b',
   '45400000-0000-4000-8000-00000000000b',
   '10000000-0000-4000-8000-00000000000a',
   'Message B must stay private');

INSERT INTO public.workspace_documents
  (id, project_id, title, created_by)
VALUES
  ('45700000-0000-4000-8000-00000000000a',
   '45000000-0000-4000-8000-00000000000a', 'Document A',
   '10000000-0000-4000-8000-00000000000a'),
  ('45700000-0000-4000-8000-00000000000b',
   '45000000-0000-4000-8000-00000000000b', 'Document B',
   '10000000-0000-4000-8000-00000000000a');

INSERT INTO public.workspace_document_versions
  (id, document_id, version, title, edited_by)
VALUES
  ('45800000-0000-4000-8000-00000000000b',
   '45700000-0000-4000-8000-00000000000b', 1, 'Document B v1',
   '10000000-0000-4000-8000-00000000000a');

INSERT INTO public.workspace_document_comments
  (id, document_id, user_id, content)
VALUES
  ('45900000-0000-4000-8000-00000000000a',
   '45700000-0000-4000-8000-00000000000a',
   '10000000-0000-4000-8000-00000000000a', 'Owner comment');

INSERT INTO public.workspace_automations
  (id, project_id, created_by, name, trigger_type)
VALUES
  ('45a00000-0000-4000-8000-00000000000a',
   '45000000-0000-4000-8000-00000000000a',
   '10000000-0000-4000-8000-00000000000a',
   'Automation A', 'task_status_changed');

INSERT INTO public.viewing_requests (id, client_id, client_name, status)
VALUES
  ('47000000-0000-4000-8000-00000000000a',
   '10000000-0000-4000-8000-00000000000a', 'Viewer A', 'pending'),
  ('47000000-0000-4000-8000-00000000000b',
   '10000000-0000-4000-8000-00000000000b', 'Viewer B', 'pending');

INSERT INTO public.viewing_slots
  (id, request_id, agent_id, confirmation_token, status)
VALUES
  ('48000000-0000-4000-8000-00000000000a',
   '47000000-0000-4000-8000-00000000000a',
   '48100000-0000-4000-8000-00000000000a', 'secret-viewing-a', 'awaiting'),
  ('48000000-0000-4000-8000-00000000000b',
   '47000000-0000-4000-8000-00000000000b',
   '48100000-0000-4000-8000-00000000000b', 'secret-viewing-b', 'awaiting');

INSERT INTO public.calendar_calendars
  (id, owner_type, owner_id, name, is_public)
VALUES
  ('49000000-0000-4000-8000-00000000000a', 'user',
   '10000000-0000-4000-8000-00000000000a', 'Calendar A', false),
  ('49000000-0000-4000-8000-00000000000b', 'user',
   '10000000-0000-4000-8000-00000000000b', 'Calendar B', false);

INSERT INTO public.calendar_events
  (id, calendar_id, type, title, start_at, end_at, created_by_user_id)
VALUES
  ('4a000000-0000-4000-8000-00000000000a',
   '49000000-0000-4000-8000-00000000000a', 'private_event', 'Event A',
   now() + interval '1 day', now() + interval '1 day 1 hour',
   '10000000-0000-4000-8000-00000000000a'),
  ('4a000000-0000-4000-8000-00000000000b',
   '49000000-0000-4000-8000-00000000000b', 'private_event', 'Event B',
   now() + interval '2 days', now() + interval '2 days 1 hour',
   '10000000-0000-4000-8000-00000000000b');

INSERT INTO public.company_modules (company_id, module_key, enabled)
VALUES
  ('20000000-0000-4000-8000-00000000000a', 'rental', true),
  ('20000000-0000-4000-8000-00000000000b', 'rental', true);

SET LOCAL session_replication_role = origin;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  '10000000-0000-4000-8000-00000000000a', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.email', 'security-a@example.test', true);

DO $tenant_a_assertions$
DECLARE
  v_rows integer;
BEGIN
  IF NOT public.phase_c_can_access_company(
    '20000000-0000-4000-8000-00000000000a'::uuid
  ) THEN
    RAISE EXCEPTION 'tenant_a_cannot_access_own_company';
  END IF;

  IF public.phase_c_can_access_company(
    '20000000-0000-4000-8000-00000000000b'::uuid
  ) THEN
    RAISE EXCEPTION 'tenant_a_can_access_tenant_b';
  END IF;

  -- Metadane i ścieżki są server-only. Pozytywny odczyt własnego pliku jest
  -- testowany na rzeczywistym helperze endpointu w phase-c-security.test.mjs.
  BEGIN
    PERFORM id FROM public.private_storage_objects LIMIT 1;
    RAISE EXCEPTION 'tenant_a_direct_storage_metadata_read_was_not_denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.private_storage_objects
    SET resource_type = 'cross_tenant_write'
    WHERE id = '30000000-0000-4000-8000-00000000000b';
    RAISE EXCEPTION 'tenant_a_update_was_not_denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = '43000000-0000-4000-8000-00000000000a'
  ) THEN
    RAISE EXCEPTION 'driver_a_cannot_read_assigned_vehicle_a';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = '43000000-0000-4000-8000-00000000000b'
  ) THEN
    RAISE EXCEPTION 'driver_a_can_read_vehicle_b';
  END IF;

  BEGIN
    INSERT INTO public.driver_vehicle_assignments
      (driver_id, vehicle_id, fleet_id, status)
    VALUES (
      '42000000-0000-4000-8000-00000000000a',
      '43000000-0000-4000-8000-00000000000b',
      '41000000-0000-4000-8000-00000000000a', 'active'
    );
    RAISE EXCEPTION 'driver_a_cross_fleet_assignment_was_not_denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.driver_vehicle_assignments
    SET vehicle_id = '43000000-0000-4000-8000-00000000000b'
    WHERE id = '44000000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'assignment_anchor_update_was_not_denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_tasks
    WHERE id = '45100000-0000-4000-8000-00000000000a'
  ) OR EXISTS (
    SELECT 1 FROM public.workspace_tasks
    WHERE id = '45100000-0000-4000-8000-00000000000b'
  ) THEN
    RAISE EXCEPTION 'workspace_task_cross_tenant_read';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_task_history
    WHERE id = '45200000-0000-4000-8000-00000000000b'
  ) THEN
    RAISE EXCEPTION 'workspace_history_cross_tenant_read';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_messages
    WHERE id = '45600000-0000-4000-8000-00000000000b'
  ) THEN
    RAISE EXCEPTION 'workspace_stale_participant_or_sender_retained_access';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_documents
    WHERE id = '45700000-0000-4000-8000-00000000000b'
  ) OR EXISTS (
    SELECT 1 FROM public.workspace_document_versions
    WHERE id = '45800000-0000-4000-8000-00000000000b'
  ) THEN
    RAISE EXCEPTION 'workspace_document_author_retained_access';
  END IF;

  BEGIN
    INSERT INTO public.workspace_task_history
      (task_id, action_type, user_id)
    VALUES (
      '45100000-0000-4000-8000-00000000000b', 'forged',
      '10000000-0000-4000-8000-00000000000a'
    );
    RAISE EXCEPTION 'workspace_history_cross_tenant_insert_was_not_denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.workspace_task_history
      (task_id, action_type, user_id)
    VALUES (
      '45100000-0000-4000-8000-00000000000a', 'forged-own-history',
      '10000000-0000-4000-8000-00000000000a'
    );
    RAISE EXCEPTION 'workspace_owner_forged_task_history';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.workspace_task_comments
      (task_id, user_id, content)
    VALUES (
      '45100000-0000-4000-8000-00000000000b',
      '10000000-0000-4000-8000-00000000000a', 'forged'
    );
    RAISE EXCEPTION 'workspace_comment_cross_tenant_insert_was_not_denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.workspace_project_members
    SET project_id = '45000000-0000-4000-8000-00000000000a',
        user_id = '10000000-0000-4000-8000-00000000000a',
        role = 'owner', status = 'active'
    WHERE id = '46000000-0000-4000-8000-00000000000a';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN
      RAISE EXCEPTION 'workspace_invitation_reparent_was_not_denied';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF EXISTS (
    SELECT 1 FROM public.workspace_project_members
    WHERE id = '46000000-0000-4000-8000-00000000000a'
      AND (
        project_id <> '45000000-0000-4000-8000-00000000000b'
        OR role <> 'member'
        OR status <> 'invited'
        OR user_id IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'workspace_invitation_authorization_fields_changed';
  END IF;

  PERFORM public.phase_c_accept_workspace_invitation(
    '46000000-0000-4000-8000-00000000000a'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_project_members
    WHERE id = '46000000-0000-4000-8000-00000000000a'
      AND project_id = '45000000-0000-4000-8000-00000000000b'
      AND user_id = '10000000-0000-4000-8000-00000000000a'
      AND role = 'member' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'workspace_invitation_safe_accept_failed';
  END IF;

  PERFORM public.phase_c_update_workspace_member_role(
    '46000000-0000-4000-8000-00000000000f', 'guest'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_project_members
    WHERE id = '46000000-0000-4000-8000-00000000000f'
      AND role = 'guest' AND hierarchy_role = 'guest'
  ) THEN
    RAISE EXCEPTION 'workspace_owner_role_command_failed';
  END IF;

  PERFORM public.phase_c_remove_workspace_member(
    '46000000-0000-4000-8000-00000000000f'
  );
  IF EXISTS (
    SELECT 1 FROM public.workspace_project_members
    WHERE id = '46000000-0000-4000-8000-00000000000f'
  ) THEN
    RAISE EXCEPTION 'workspace_owner_remove_command_failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.viewing_requests
    WHERE id = '47000000-0000-4000-8000-00000000000b'
  ) THEN
    RAISE EXCEPTION 'viewer_a_can_read_viewing_request_b';
  END IF;
  BEGIN
    PERFORM confirmation_token FROM public.viewing_slots
    WHERE id = '48000000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'viewer_a_can_read_confirmation_token';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    UPDATE public.viewing_slots SET status = 'confirmed'
    WHERE id = '48000000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'viewer_a_can_update_viewing_slot';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF EXISTS (
    SELECT 1 FROM public.calendar_events
    WHERE id = '4a000000-0000-4000-8000-00000000000b'
  ) THEN
    RAISE EXCEPTION 'calendar_user_a_can_read_event_b';
  END IF;
  BEGIN
    UPDATE public.calendar_events
    SET calendar_id = '49000000-0000-4000-8000-00000000000b'
    WHERE id = '4a000000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'calendar_event_reparent_was_not_denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.company_modules SET enabled = false
    WHERE company_id = '20000000-0000-4000-8000-00000000000a'
      AND module_key = 'rental';
    RAISE EXCEPTION 'company_owner_can_modify_entitlement';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM link_token FROM public.rental_payments LIMIT 1;
    RAISE EXCEPTION 'tenant_a_can_read_rental_payment_secret';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$tenant_a_assertions$;

SELECT set_config('request.jwt.claim.sub',
  '10000000-0000-4000-8000-00000000000b', true);
SELECT set_config('request.jwt.claim.email', 'security-b@example.test', true);

DO $tenant_b_assertions$
BEGIN
  IF public.phase_c_can_access_company(
    '20000000-0000-4000-8000-00000000000a'::uuid
  ) THEN
    RAISE EXCEPTION 'tenant_b_can_access_tenant_a_by_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = '43000000-0000-4000-8000-00000000000b'
  ) OR EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = '43000000-0000-4000-8000-00000000000a'
  ) THEN
    RAISE EXCEPTION 'tenant_b_vehicle_isolation_failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.viewing_requests
    WHERE id = '47000000-0000-4000-8000-00000000000a'
  ) THEN
    RAISE EXCEPTION 'viewer_b_can_read_viewing_request_a';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_tasks
    WHERE id = '45100000-0000-4000-8000-00000000000b'
  ) OR EXISTS (
    SELECT 1 FROM public.workspace_tasks
    WHERE id = '45100000-0000-4000-8000-00000000000a'
  ) THEN
    RAISE EXCEPTION 'tenant_b_workspace_task_isolation_failed';
  END IF;

  BEGIN
    UPDATE public.workspace_project_members
    SET role = 'owner', hierarchy_role = 'owner'
    WHERE id = '46000000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'workspace_owner_bypassed_member_command';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM id FROM public.private_storage_objects LIMIT 1;
    RAISE EXCEPTION 'tenant_b_direct_storage_metadata_read_was_not_denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$tenant_b_assertions$;

-- Ordinary members can collaborate, but they cannot rewrite somebody else's
-- document comments or administer project roles.
SELECT set_config('request.jwt.claim.sub',
  '10000000-0000-4000-8000-00000000000d', true);
SELECT set_config('request.jwt.claim.email', 'member-d@example.test', true);

DO $workspace_member_assertions$
DECLARE
  v_rows integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_tasks
    WHERE id = '45100000-0000-4000-8000-00000000000a'
  ) THEN
    RAISE EXCEPTION 'workspace_member_cannot_read_project_task';
  END IF;

  UPDATE public.workspace_document_comments
  SET content = 'forged by another member'
  WHERE id = '45900000-0000-4000-8000-00000000000a';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'workspace_member_modified_foreign_document_comment';
  END IF;

  BEGIN
    PERFORM public.phase_c_update_workspace_member_role(
      '46000000-0000-4000-8000-00000000000c', 'member'
    );
    RAISE EXCEPTION 'workspace_member_changed_project_role';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$workspace_member_assertions$;

-- Viewer access is read-only and excludes internal communication and
-- automation definitions even when record IDs are known.
SELECT set_config('request.jwt.claim.sub',
  '10000000-0000-4000-8000-00000000000c', true);
SELECT set_config('request.jwt.claim.email', 'viewer-c@example.test', true);

DO $workspace_viewer_assertions$
DECLARE
  v_rows integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_tasks
    WHERE id = '45100000-0000-4000-8000-00000000000a'
  ) THEN
    RAISE EXCEPTION 'workspace_viewer_cannot_read_project_task';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workspace_channels
    WHERE id = '45400000-0000-4000-8000-00000000000a'
  ) OR EXISTS (
    SELECT 1 FROM public.workspace_messages
    WHERE id = '45600000-0000-4000-8000-00000000000a'
  ) OR EXISTS (
    SELECT 1 FROM public.workspace_automations
    WHERE id = '45a00000-0000-4000-8000-00000000000a'
  ) THEN
    RAISE EXCEPTION 'workspace_viewer_read_internal_content';
  END IF;

  BEGIN
    INSERT INTO public.workspace_tasks
      (project_id, title, created_by)
    VALUES (
      '45000000-0000-4000-8000-00000000000a', 'viewer forged task',
      '10000000-0000-4000-8000-00000000000c'
    );
    RAISE EXCEPTION 'workspace_viewer_inserted_task';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  UPDATE public.workspace_tasks SET title = 'viewer changed task'
  WHERE id = '45100000-0000-4000-8000-00000000000a';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'workspace_viewer_updated_task';
  END IF;

  UPDATE public.workspace_documents SET title = 'viewer changed document'
  WHERE id = '45700000-0000-4000-8000-00000000000a';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'workspace_viewer_updated_document';
  END IF;

  BEGIN
    INSERT INTO public.workspace_automations
      (project_id, created_by, name, trigger_type)
    VALUES (
      '45000000-0000-4000-8000-00000000000a',
      '10000000-0000-4000-8000-00000000000c',
      'viewer automation', 'task_status_changed'
    );
    RAISE EXCEPTION 'workspace_viewer_created_automation';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.workspace_task_history
      (task_id, action_type, user_id)
    VALUES (
      '45100000-0000-4000-8000-00000000000a', 'viewer forged history',
      '10000000-0000-4000-8000-00000000000c'
    );
    RAISE EXCEPTION 'workspace_viewer_forged_task_history';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$workspace_viewer_assertions$;

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claim.email', '', true);

DO $anonymous_assertions$
BEGIN
  BEGIN
    PERFORM id FROM public.private_storage_objects LIMIT 1;
    RAISE EXCEPTION 'anonymous_storage_read_was_not_denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM id FROM public.viewing_slots LIMIT 1;
    RAISE EXCEPTION 'anonymous_viewing_slots_read_was_not_denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM id FROM public.calendar_events LIMIT 1;
    RAISE EXCEPTION 'anonymous_calendar_event_read_was_not_denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.service_bookings (
      booking_number, customer_name, customer_phone,
      scheduled_date, scheduled_time, duration_minutes
    ) VALUES (
      'SECURITY-ANON-BOOKING', 'Anonymous', '+48000000000',
      current_date, '12:00', 60
    );
    RAISE EXCEPTION 'anonymous_service_booking_insert_was_not_denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$anonymous_assertions$;

RESET ROLE;
ROLLBACK;
