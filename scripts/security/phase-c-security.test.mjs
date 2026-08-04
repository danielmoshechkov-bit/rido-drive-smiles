import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  canDownloadPrivateStorageObject,
  parsePrivateStorageObjectBody,
  PRIVATE_STORAGE_MAX_BODY_BYTES,
  PRIVATE_STORAGE_SIGNED_URL_TTL_SECONDS,
  readPrivateStorageRequestBody,
} from "../../supabase/functions/_shared/privateStorageSecurity.ts";
import { SecurityError } from "../../supabase/functions/_shared/securityPrimitives.ts";

const ROOT = process.cwd();
const USER_A = "10000000-0000-4000-8000-00000000000a";
const USER_B = "10000000-0000-4000-8000-00000000000b";
const COMPANY_A = "20000000-0000-4000-8000-00000000000a";
const COMPANY_B = "20000000-0000-4000-8000-00000000000b";
const OBJECT_A = "30000000-0000-4000-8000-00000000000a";

const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");
const tenantMigration = () => read("supabase/migrations/20260801140000_phase_c_tenant_isolation.sql");
const rpcMigration = () => read("supabase/migrations/20260801141000_phase_c_rpc_lockdown.sql");
const storageMigration = () => read("supabase/migrations/20260801142000_phase_c_storage_lockdown.sql");

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `Brak początku sekcji: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(endIndex > startIndex, `Brak końca sekcji: ${end}`);
  return source.slice(startIndex, endIndex);
}

function expectSecurityError(run, code, status) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof SecurityError);
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  });
}

function identity(overrides = {}) {
  return {
    userId: USER_A,
    isAdmin: false,
    companyIds: [COMPANY_A],
    ownedCompanyIds: [COMPANY_A],
    ...overrides,
  };
}

function privateObject(overrides = {}) {
  return {
    id: OBJECT_A,
    bucket_id: "documents",
    object_path: "tenant-a/document.pdf",
    tenant_id: COMPANY_A,
    owner_user_id: USER_A,
    classification: "private",
    status: "active",
    ...overrides,
  };
}

test("kontrakt prywatnego storage przyjmuje wyłącznie object_id", () => {
  assert.equal(
    parsePrivateStorageObjectBody(
      JSON.stringify({ object_id: OBJECT_A }),
      "application/json; charset=utf-8",
      null,
    ),
    OBJECT_A,
  );

  for (const body of [
    { object_id: OBJECT_A, tenant_id: COMPANY_B },
    { object_id: OBJECT_A, object_path: "tenant-b/secret.pdf" },
    { object_id: "../tenant-b" },
    { bucket_id: "documents" },
  ]) {
    expectSecurityError(
      () => parsePrivateStorageObjectBody(JSON.stringify(body), "application/json", null),
      "invalid_object_id",
      400,
    );
  }

  expectSecurityError(
    () => parsePrivateStorageObjectBody("{}", "text/plain", null),
    "unsupported_media_type",
    415,
  );
  expectSecurityError(
    () => parsePrivateStorageObjectBody("{", "application/json", null),
    "invalid_json",
    400,
  );
  expectSecurityError(
    () => parsePrivateStorageObjectBody("{}", "application/json", "-1"),
    "invalid_content_length",
    400,
  );
  expectSecurityError(
    () => parsePrivateStorageObjectBody(
      "x".repeat(PRIVATE_STORAGE_MAX_BODY_BYTES + 1),
      "application/json",
      null,
    ),
    "payload_too_large",
    413,
  );
});

test("odczyt streamu odcina body większe niż 2 KB przed pełnym buforowaniem", async () => {
  const validBody = JSON.stringify({ object_id: OBJECT_A });
  const validRequest = new Request("https://app.getrido.pl/functions/v1/private-storage-download", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: validBody,
  });
  assert.equal(await readPrivateStorageRequestBody(validRequest), validBody);

  const oversizedRequest = new Request("https://app.getrido.pl/functions/v1/private-storage-download", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(PRIVATE_STORAGE_MAX_BODY_BYTES + 1),
  });
  await assert.rejects(
    () => readPrivateStorageRequestBody(oversizedRequest),
    (error) => error instanceof SecurityError
      && error.code === "payload_too_large"
      && error.status === 413,
  );
});

test("decyzje storage izolują tenanty i respektują klasyfikację", () => {
  assert.equal(canDownloadPrivateStorageObject(identity(), privateObject()), true);
  assert.equal(
    canDownloadPrivateStorageObject(
      identity({ userId: USER_B, companyIds: [COMPANY_B], ownedCompanyIds: [COMPANY_B] }),
      privateObject(),
    ),
    false,
  );
  assert.equal(
    canDownloadPrivateStorageObject(
      identity({ userId: USER_B, companyIds: [COMPANY_A], ownedCompanyIds: [] }),
      privateObject({ owner_user_id: null, classification: "private" }),
    ),
    false,
  );
  assert.equal(
    canDownloadPrivateStorageObject(
      identity({ userId: USER_B, companyIds: [COMPANY_A], ownedCompanyIds: [] }),
      privateObject({ owner_user_id: null, classification: "private" }),
      true,
    ),
    true,
  );
  assert.equal(
    canDownloadPrivateStorageObject(
      identity({ userId: USER_B, companyIds: [COMPANY_A], ownedCompanyIds: [] }),
      privateObject({ owner_user_id: null, classification: "confidential" }),
      true,
    ),
    true,
  );
  assert.equal(
    canDownloadPrivateStorageObject(
      identity({ userId: USER_B, companyIds: [COMPANY_A], ownedCompanyIds: [COMPANY_A] }),
      privateObject({ owner_user_id: null, classification: "confidential" }),
    ),
    true,
  );
  assert.equal(
    canDownloadPrivateStorageObject(
      identity({ userId: USER_B, companyIds: [COMPANY_A], ownedCompanyIds: [COMPANY_A] }),
      privateObject({ owner_user_id: null, classification: "restricted" }),
    ),
    false,
  );
  assert.equal(
    canDownloadPrivateStorageObject(
      identity({ userId: USER_B, companyIds: [COMPANY_A], ownedCompanyIds: [] }),
      privateObject({ owner_user_id: null, classification: "restricted" }),
      true,
    ),
    true,
  );
  assert.equal(
    canDownloadPrivateStorageObject(
      identity({ userId: USER_B, companyIds: [COMPANY_A], ownedCompanyIds: [] }),
      privateObject({ owner_user_id: USER_B, classification: "private" }),
    ),
    false,
  );
  assert.equal(
    canDownloadPrivateStorageObject(
      identity({ userId: USER_B, companyIds: [COMPANY_B], ownedCompanyIds: [COMPANY_B] }),
      privateObject({ owner_user_id: USER_B, classification: "restricted" }),
      true,
    ),
    false,
  );
  assert.equal(
    canDownloadPrivateStorageObject(
      identity({ userId: USER_B, companyIds: [], ownedCompanyIds: [] }),
      privateObject({ tenant_id: null, owner_user_id: USER_B, classification: "restricted" }),
    ),
    true,
  );
  assert.equal(canDownloadPrivateStorageObject(identity({ isAdmin: true }), privateObject({ classification: "restricted" })), true);
  assert.equal(canDownloadPrivateStorageObject(identity(), privateObject({ status: "quarantined" })), false);
  assert.equal(canDownloadPrivateStorageObject(identity(), privateObject({ bucket_id: "listing-photos" })), false);
  assert.equal(canDownloadPrivateStorageObject(identity(), null), false);
});

test("Faza C składa się z trzech kolejnych migracji bezpieczeństwa", () => {
  const migrations = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((name) => name.includes("phase_c"))
    .sort();
  assert.deepEqual(migrations, [
    "20260801140000_phase_c_tenant_isolation.sql",
    "20260801141000_phase_c_rpc_lockdown.sql",
    "20260801142000_phase_c_storage_lockdown.sql",
  ]);
});

test("helpery tenantowe wiążą dostęp z auth.uid i aktywnym membership", () => {
  const migration = tenantMigration();
  for (const name of [
    "phase_c_can_access_company",
    "phase_c_can_manage_company",
    "phase_c_can_access_provider",
    "phase_c_can_manage_provider",
    "phase_c_can_access_driver",
    "phase_c_can_manage_driver",
    "phase_c_can_access_vehicle",
    "phase_c_can_manage_vehicle",
  ]) {
    const block = section(
      migration,
      `CREATE OR REPLACE FUNCTION public.${name}`,
      "$$;",
    );
    assert.match(block, /SECURITY DEFINER/);
    assert.match(block, /SET search_path = pg_catalog, public/);
    assert.match(block, /auth\.uid\(\)/);
  }
  const companyAccess = section(
    migration,
    "CREATE OR REPLACE FUNCTION public.phase_c_can_access_company",
    "$$;",
  );
  assert.match(companyAccess, /cm\.status = 'active'/);
  assert.match(companyAccess, /c\.status = 'active'/);

  const legacyOwner = section(
    migration,
    "CREATE OR REPLACE FUNCTION public.phase_c_can_access_provider_owner",
    "$$;",
  );
  assert.doesNotMatch(legacyOwner, /service_employees|workshop_employees/);
  assert.match(legacyOwner, /p_owner_user_id = auth\.uid\(\)/);

  const edgeSecurity = read("supabase/functions/_shared/security.ts");
  assert.match(edgeSecurity, /row\.status === "active"/);
  assert.match(edgeSecurity, /\.from\("companies"\)[\s\S]*?\.in\("id", candidateMemberCompanyIds\)[\s\S]*?\.eq\("status", "active"\)/);
  assert.doesNotMatch(edgeSecurity, /!row\.status \|\| row\.status === "active"/);
});

test("przypisania pojazdów nie mogą tworzyć pivotu między flotami", () => {
  const migration = tenantMigration();
  assert.match(migration, /ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth\.users/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.phase_c_can_manage_vehicle_assignment/);
  assert.match(migration, /d\.fleet_id = v\.fleet_id/);
  assert.match(migration, /p_fleet_id = v\.fleet_id/);

  const trigger = section(
    migration,
    "CREATE OR REPLACE FUNCTION public.phase_c_protect_vehicle_assignment_anchor",
    "REVOKE ALL ON FUNCTION public.phase_c_protect_vehicle_assignment_anchor",
  );
  assert.match(trigger, /vehicle_assignment_anchor_is_immutable/);
  assert.match(trigger, /vehicle_assignment_cross_fleet/);
  assert.match(trigger, /personal_vehicle_assignment_owner_mismatch/);
  assert.ok(
    trigger.indexOf("vehicle_assignment_anchor_is_immutable")
      < trigger.indexOf("auth.role() = 'service_role'"),
    "service_role omija kontrolę niezmienności assignment",
  );

  const policies = section(
    migration,
    "DO $phase_c_assignment_policies$",
    "DO $phase_c_vehicle_children$",
  );
  assert.match(policies, /DROP POLICY IF EXISTS/);
  assert.match(policies, /FORCE ROW LEVEL SECURITY/);
  assert.match(policies, /GRANT UPDATE \(status, assigned_at, unassigned_at\)/);
  assert.doesNotMatch(policies, /GRANT UPDATE \([^)]*(driver_id|vehicle_id|fleet_id)/);
  assert.match(policies, /phase_c_can_manage_vehicle_assignment\(driver_id, vehicle_id, fleet_id\)/);
});

test("workspace nie pozwala przepiąć zaproszenia do innego projektu", () => {
  const migration = tenantMigration();
  const workspace = section(
    migration,
    "DO $phase_c_workspace_membership_policies$",
    "DO $phase_c_viewings$",
  );
  assert.match(workspace, /workspace_member_project_anchor_is_immutable/);
  assert.match(workspace, /NEW\.project_id IS DISTINCT FROM OLD\.project_id/);
  assert.match(workspace, /phase_c_workspace_members_update[\s\S]*?phase_c_can_manage_workspace_project/);
  assert.doesNotMatch(workspace, /status = 'invited'[\s\S]{0,160}FOR UPDATE TO authenticated/);

  const accept = section(
    workspace,
    "CREATE OR REPLACE FUNCTION public.phase_c_accept_workspace_invitation",
    "REVOKE ALL ON FUNCTION public.phase_c_accept_workspace_invitation",
  );
  assert.match(accept, /lower\(member\.email\) = v_email/);
  assert.match(accept, /FOR UPDATE OF member/);
  assert.match(accept, /member\.role IN \('member', 'manager', 'guest', 'viewer'\)/);
  assert.match(accept, /phase_c_provider_is_active\(project\.tenant_id\)/);
  assert.match(accept, /workspace\.invitation\.accept/);

  const bell = read("src/components/workspace/WorkspaceInvitationBell.tsx");
  assert.doesNotMatch(bell, /\.update\(\{ user_id: user\.id \}\)/);
  const invitations = read("src/components/workspace/WorkspaceInvitations.tsx");
  assert.match(invitations, /rpc\("phase_c_accept_workspace_invitation"/);
});

test("workspace wymaga aktywnego projektu dla zadań, historii, DM i dokumentów", () => {
  const migration = tenantMigration();
  const content = section(
    migration,
    "-- All workspace child records must inherit the current access decision",
    "DO $phase_c_viewings$",
  );
  for (const table of [
    "workspace_tasks",
    "workspace_task_comments",
    "workspace_task_history",
    "workspace_task_assignees",
    "workspace_task_checklist",
    "workspace_messages",
    "workspace_channels",
    "workspace_channel_participants",
    "workspace_message_reactions",
    "workspace_message_pins",
    "workspace_documents",
    "workspace_document_versions",
    "workspace_document_comments",
    "workspace_automations",
    "workspace_automation_logs",
  ]) {
    assert.ok(content.includes(`'${table}'`), `Brak lockdownu ${table}`);
  }
  assert.doesNotMatch(content, /USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(content, /WITH CHECK\s*\(\s*true\s*\)/i);
  assert.match(content, /phase_c_workspace_history_select[\s\S]*?phase_c_can_access_workspace_task\(task_id\)/);
  assert.match(content, /phase_c_workspace_comments_insert[\s\S]*?user_id = auth\.uid\(\)[\s\S]*?phase_c_can_access_workspace_task\(task_id\)/);
  assert.match(content, /phase_c_workspace_messages_select[\s\S]*?phase_c_can_access_workspace_message\(id\)/);
  assert.match(content, /phase_c_can_access_workspace_channel[\s\S]*?phase_c_can_contribute_workspace_project\(channel\.project_id\)/);
  assert.match(content, /phase_c_workspace_document_versions_select[\s\S]*?phase_c_can_access_workspace_document\(document_id\)/);
  assert.match(content, /workspace_invitations', 'workspace_project_invitations/);
  assert.match(content, /GRANT SELECT ON TABLE public\.workspace_task_history TO authenticated/);
  assert.doesNotMatch(content, /GRANT SELECT, INSERT ON TABLE public\.workspace_task_history TO authenticated/);
  assert.doesNotMatch(content, /phase_c_workspace_history_insert/);
  assert.match(content, /phase_c_record_workspace_task_history[\s\S]*?AFTER UPDATE ON public\.workspace_tasks/);
  assert.match(content, /phase_c_workspace_automations_insert[\s\S]*?phase_c_can_manage_workspace_content\(project_id\)/);
  assert.match(content, /phase_c_workspace_document_comments_update[\s\S]*?user_id = auth\.uid\(\)[\s\S]*?phase_c_can_manage_workspace_document/);

  const taskSelect = section(
    content,
    "CREATE POLICY phase_c_workspace_tasks_select",
    "CREATE POLICY phase_c_workspace_tasks_insert",
  );
  assert.doesNotMatch(taskSelect, /assigned_user_id|is_workspace_task_assignee/);

  const rpc = rpcMigration();
  const taskCompatibility = section(
    rpc,
    "CREATE OR REPLACE FUNCTION public.can_access_workspace_task_project",
    "$$;",
  );
  assert.match(taskCompatibility, /phase_c_can_access_workspace_task\(p_task_id\)/);
  const assigneeCompatibility = section(
    rpc,
    "CREATE OR REPLACE FUNCTION public.is_workspace_task_assignee",
    "$$;",
  );
  assert.match(assigneeCompatibility, /phase_c_can_access_workspace_task\(p_task_id\)/);
});

test("role workspace rozdzielają odczyt, współtworzenie i zarządzanie", () => {
  const migration = tenantMigration();
  const contribute = section(
    migration,
    "CREATE OR REPLACE FUNCTION public.phase_c_can_contribute_workspace_project",
    "$$;",
  );
  assert.match(contribute, /member\.role IN \('owner', 'manager', 'member'\)/);
  assert.doesNotMatch(contribute, /'guest'|'viewer'/);

  const manage = section(
    migration,
    "CREATE OR REPLACE FUNCTION public.phase_c_can_manage_workspace_content",
    "$$;",
  );
  assert.match(manage, /member\.role IN \('owner', 'manager'\)/);
  assert.doesNotMatch(manage, /'member'|'guest'|'viewer'/);

  const taskEdit = section(
    migration,
    "CREATE OR REPLACE FUNCTION public.phase_c_can_edit_workspace_task",
    "$$;",
  );
  assert.match(taskEdit, /task\.created_by = auth\.uid\(\)/);
  assert.match(taskEdit, /task\.assigned_user_id = auth\.uid\(\)/);
  assert.match(taskEdit, /workspace_task_assignees/);

  const members = read("src/components/workspace/WorkspaceMembersView.tsx");
  assert.match(members, /rpc\(\s*"phase_c_update_workspace_member_role"/);
  assert.doesNotMatch(members, /\.update\(\{ role: newRole, hierarchy_role: newRole \}\)/);
  const hook = read("src/hooks/useWorkspace.ts");
  assert.match(hook, /rpc\("phase_c_remove_workspace_member"/);

  const rpc = rpcMigration();
  assert.match(rpc, /public\.phase_c_update_workspace_member_role\(uuid,text\)/);
  assert.match(rpc, /public\.phase_c_remove_workspace_member\(uuid\)/);
});

test("pola uprawnień członka workspace zmienia wyłącznie oznaczona komenda", () => {
  const migration = tenantMigration();
  const guard = section(
    migration,
    "CREATE OR REPLACE FUNCTION public.phase_c_protect_workspace_member_anchor",
    "REVOKE ALL ON FUNCTION public.phase_c_protect_workspace_project_anchor",
  );
  for (const field of ["user_id", "email", "role", "status", "hierarchy_role", "invited_by"]) {
    assert.match(guard, new RegExp(`NEW\\.${field} IS DISTINCT FROM OLD\\.${field}`));
  }
  assert.match(guard, /app\.phase_c_workspace_member_command/);
  const memberGrants = section(
    migration,
    "GRANT SELECT, INSERT ON TABLE public.workspace_project_members",
    "CREATE POLICY phase_c_workspace_projects_select",
  );
  const memberGrant = memberGrants.match(
    /GRANT UPDATE \(([\s\S]*?)\) ON TABLE public\.workspace_project_members TO authenticated;/,
  );
  assert.ok(memberGrant, "Brak kolumnowego grantu profilu członka workspace");
  assert.match(memberGrant[1], /display_name[\s\S]*first_name[\s\S]*last_name[\s\S]*phone[\s\S]*last_seen_at[\s\S]*is_online[\s\S]*preferred_language[\s\S]*avatar_url/);
  assert.doesNotMatch(memberGrant[1], /role|status|user_id|email|hierarchy_role|invited_by/);

  const accept = section(
    migration,
    "CREATE OR REPLACE FUNCTION public.phase_c_accept_workspace_invitation",
    "REVOKE ALL ON FUNCTION public.phase_c_accept_workspace_invitation",
  );
  assert.match(accept, /set_config\(\s*'app\.phase_c_workspace_member_command', 'on', true/);
  assert.match(accept, /workspace\.invitation\.accept/);
});

test("rating providera może zmienić tylko kanoniczny zagnieżdżony trigger", () => {
  const migration = tenantMigration();
  const guard = section(
    migration,
    "CREATE OR REPLACE FUNCTION public.phase_c_protect_service_provider",
    "REVOKE ALL ON FUNCTION public.phase_c_protect_service_provider",
  );
  assert.match(guard, /pg_catalog\.pg_trigger_depth\(\) > 1/);
  assert.match(guard, /FROM public\.service_reviews AS review/);
  assert.match(guard, /NEW\.rating_avg IS NOT DISTINCT FROM v_canonical_rating_avg/);
  assert.match(guard, /NEW\.rating_count IS NOT DISTINCT FROM v_canonical_rating_count/);
});

test("oględziny nie ujawniają tokenu ani nie pozwalają na klientowy UPDATE", () => {
  const migration = tenantMigration();
  assert.doesNotMatch(migration, /CREATE POLICY phase_c_viewing_slots_agent_update/);
  const grant = migration.match(
    /GRANT SELECT \(([\s\S]*?)\) ON TABLE public\.viewing_slots TO authenticated;/,
  );
  assert.ok(grant, "Brak kolumnowego grantu viewing_slots");
  assert.doesNotMatch(grant[1], /confirmation_token|agent_email|agent_phone/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.viewing_slots\s+FROM PUBLIC, anon, authenticated/);
  const panel = read("src/components/realestate/MyViewingsPanel.tsx");
  assert.match(panel, /\.select\('id,request_id,status'\)/);
});

test("rezerwacje usług i kalendarze są tenant-bound i bez publicznych danych prywatnych", () => {
  const migration = tenantMigration();
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.service_bookings\s+FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /phase_c_service_bookings_provider_read[\s\S]*?phase_c_can_access_provider\(provider_id\)/);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE)[^;]*service_bookings TO authenticated/);

  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.service_calendar_blocks\s+FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /phase_c_service_calendar_block_consistent/);
  assert.match(migration, /calendar_block_anchor_is_immutable/);

  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.calendar_events\s+FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /calendar_event_anchor_is_immutable/);
  assert.match(migration, /NEW\.calendar_id IS DISTINCT FROM OLD\.calendar_id/);
  assert.match(migration, /calendar_events_window_phase_c/);
  assert.doesNotMatch(migration, /phase_c_calendar_events_select[\s\S]{0,220}visibility\s*=\s*'public'/);
});

test("entitlementów i sekretów płatności najmu nie można zmieniać lub czytać z klienta", () => {
  const migration = tenantMigration();
  const modules = section(
    migration,
    "DO $phase_c_company_module_policies$",
    "-- ---------------------------------------------------------------------------\n-- 2. service_providers",
  );
  assert.match(modules, /REVOKE ALL PRIVILEGES ON TABLE public\.company_modules\s+FROM PUBLIC, anon, authenticated/);
  assert.match(modules, /GRANT SELECT ON TABLE public\.company_modules TO authenticated/);
  assert.doesNotMatch(modules, /GRANT (?:INSERT|UPDATE|DELETE)[^;]*company_modules TO authenticated/);

  const rentalGrant = migration.match(
    /GRANT SELECT \(([\s\S]*?)\) ON TABLE public\.rental_payments TO authenticated;/,
  );
  assert.ok(rentalGrant, "Brak bezpiecznego grantu rental_payments");
  assert.doesNotMatch(rentalGrant[1], /link_url|link_token|gateway_session_id/);
  assert.match(migration, /rental_payments_booking_company_phase_c_fkey/);
  assert.match(migration, /rental_payments_amount_positive_phase_c/);
  const panel = read("src/components/rental/RentalPaymentsPanel.tsx");
  assert.doesNotMatch(panel, /from\('rental_payments'\)\.select\('\*'\)/);
  assert.doesNotMatch(panel.match(/from\('rental_payments'\)[^;]+/)?.[0] ?? "", /link_token|gateway_session_id/);
});

test("każdy tagowany blok DO migracji tenantowej kończy ciało średnikiem", () => {
  const migration = tenantMigration();
  const taggedBlocks = [...migration.matchAll(/DO (\$[a-z0-9_]+\$)([\s\S]*?)\1;/g)];
  assert.ok(taggedBlocks.length >= 10, "Nie znaleziono oczekiwanych bloków DO");
  for (const [, tag, body] of taggedBlocks) {
    assert.match(body, /END;\s*$/, `Blok ${tag} nie kończy się END;`);
  }
  assert.doesNotMatch(migration, /^END\n\$phase_c_/m);
});

test("fixture SQL ma poprawnie zakończone bloki DO", () => {
  const fixture = read("supabase/tests/security/phase_c_tenant_isolation.sql");
  const taggedBlocks = [...fixture.matchAll(/DO (\$[a-z0-9_]+\$)([\s\S]*?)\1;/g)];
  assert.equal(taggedBlocks.length, 5);
  for (const [, tag, body] of taggedBlocks) {
    assert.match(body, /END;\s*$/, `Fixture ${tag} nie kończy się END;`);
  }
});

test("service_providers nie ujawnia tokenu ani salda przez widoki", () => {
  const migration = tenantMigration();
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.service_providers FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(migration, /GRANT SELECT ON TABLE public\.service_providers TO authenticated/);

  const publicView = section(
    migration,
    "CREATE OR REPLACE VIEW public.service_providers_public",
    "CREATE OR REPLACE VIEW public.service_providers_private",
  );
  const privateView = section(
    migration,
    "CREATE OR REPLACE VIEW public.service_providers_private",
    "REVOKE ALL PRIVILEGES ON TABLE public.service_providers_public",
  );
  for (const view of [publicView, privateView]) {
    assert.doesNotMatch(view, /gmb_access_token|sms_balance/);
  }

  const guard = section(
    migration,
    "CREATE OR REPLACE FUNCTION public.phase_c_protect_service_provider",
    "REVOKE ALL ON FUNCTION public.phase_c_protect_service_provider",
  );
  assert.match(guard, /FROM public\.billing_value_balances/);
  assert.match(guard, /sms_balance_must_match_canonical_ledger/);
  assert.doesNotMatch(guard, /set_config|current_setting|app\.billing/);
});

test("mieszane tabele poświadczeń są fail-closed dla ról przeglądarki", () => {
  const migration = tenantMigration();
  const block = section(migration, "DO $phase_c_mixed_credentials$", "$phase_c_mixed_credentials$;");
  for (const table of ["agency_clients", "ad_orders", "company_settings"]) {
    assert.match(block, new RegExp(`['\"]${table}['\"]`));
  }
  assert.match(block, /ALTER TABLE public\.%I FORCE ROW LEVEL SECURITY/);
  assert.match(block, /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(block, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.%I TO service_role/);
});

test("prywatne kolejki, raporty AI i cache bez kotwicy są tylko serwerowe", () => {
  const migration = tenantMigration();
  for (const table of [
    "followup_queue",
    "weekly_learning_reports",
    "ab_tests",
    "ai_lead_patterns",
    "ai_sales_agents",
    "agent_calendar_tokens",
    "translation_cache_global",
  ]) {
    assert.match(migration, new RegExp(`['\"]${table}['\"]`), `Brak lockdownu: ${table}`);
  }
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.ai_lead_patterns\s+FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.ai_sales_agents FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /phase_c_owns_ai_config\(source_config_id\)/);
  assert.doesNotMatch(migration, /ai_agent_global_knowledge[\s\S]{0,300}is_approved\s*=\s*true/);
});

test("uprzywilejowane RPC mają deny-by-default i jawne sygnatury", () => {
  const migration = rpcMigration();
  assert.match(migration, /ALTER DEFAULT PRIVILEGES IN SCHEMA public\s+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/);
  const allDefiners = section(migration, "DO $phase_c_all_definers$", "$phase_c_all_definers$;");
  assert.match(allDefiners, /procedure\.prosecdef/);
  assert.match(allDefiners, /REVOKE ALL ON FUNCTION/);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.match(allDefiners, new RegExp(`['\"]${role}['\"]`));
  }
  const grants = section(migration, "DO $phase_c_grants$", "$phase_c_grants$;");
  assert.match(grants, /to_regprocedure\(function_signature\)/);
  assert.doesNotMatch(grants, /GRANT EXECUTE ON ALL FUNCTIONS/);
  for (const signature of [
    "public.phase_c_can_access_company(uuid)",
    "public.phase_c_can_manage_provider(uuid)",
    "public.phase_c_can_manage_vehicle(uuid)",
    "public.has_role(uuid,public.app_role)",
  ]) {
    assert.ok(grants.includes(`'${signature}'`), `Brak jawnej sygnatury: ${signature}`);
  }
});

test("finansowe i tokenowe RPC pozostają niewykonywalne", () => {
  const migration = rpcMigration();
  const blocked = section(migration, "DO $phase_c_blocked$", "$phase_c_blocked$;");
  for (const name of [
    "billing_admin_grant",
    "billing_apply_verified_payment",
    "credit_welcome_bonus",
    "increment_driver_debt",
    "merge_duplicate_drivers",
    "rental_get_contract",
    "rental_sign_contract",
    "sign_workshop_document_by_client_code",
  ]) {
    assert.ok(blocked.includes(`'${name}'`), `Brak blokady RPC: ${name}`);
  }
  const assertions = section(migration, "DO $phase_c_assertions$", "$phase_c_assertions$;");
  assert.match(assertions, /aclexplode/);
  assert.match(assertions, /has_function_privilege/);
  assert.match(assertions, /phase_c_public_execute_survived/);
  assert.match(assertions, /phase_c_blocked_execute_survived/);
});

test("prywatne buckety są deterministycznie prywatne i nie mają polityk klientowych", () => {
  const migration = storageMigration();
  const bucketBlock = section(
    migration,
    "INSERT INTO storage.buckets",
    "-- Kanoniczne powiązanie prywatnego obiektu",
  );
  for (const bucket of [
    "documents",
    "workspace-files",
    "ticket-screenshots",
    "driver-documents",
    "meeting-audio",
    "invoice-pdfs",
    "invoices",
    "workshop-order-photos",
  ]) {
    assert.ok(bucketBlock.includes(`'${bucket}'`), `Brak prywatnego bucketu: ${bucket}`);
  }
  assert.match(bucketBlock, /ON CONFLICT \(id\) DO UPDATE/);
  assert.match(bucketBlock, /SET public = false/);

  const dropBlock = section(
    migration,
    "DO $phase_c_storage_policies$",
    "$phase_c_storage_policies$;",
  );
  assert.match(dropBlock, /pg_catalog\.pg_policies/);
  assert.match(dropBlock, /DROP POLICY IF EXISTS/);
  assert.ok(dropBlock.includes("'workshop-order-photos'"));

  const privatePolicyArea = section(
    migration,
    "-- 3. Brak klientowych polityk dla prywatnych bucketów",
    "-- 4. Publiczne media pozostają publiczne",
  );
  assert.doesNotMatch(privatePolicyArea, /CREATE POLICY/);

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.private_storage_object_acl/);
  assert.match(migration, /UNIQUE \(object_id, grantee_user_id, permission\)/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.private_storage_object_acl\s+FROM PUBLIC, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /GRANT SELECT ON TABLE public\.private_storage_objects TO authenticated/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.security_consume_rate_limit/);
  assert.match(migration, /ON CONFLICT \(scope, subject_id\) DO UPDATE/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.security_consume_rate_limit[\s\S]*?TO service_role/);
});

test("publiczne obrazy mają limity MIME, rozmiaru, właściciela i rozszerzenia", () => {
  const migration = storageMigration();
  const publicMedia = section(
    migration,
    "-- 4. Publiczne media pozostają publiczne",
    "CREATE OR REPLACE FUNCTION public.security_can_write_entity_logo",
  );
  assert.ok(publicMedia.includes("'listing-photos'"));
  assert.ok(publicMedia.includes("'entity-logos'"));
  assert.ok(publicMedia.includes("'car-photos'"));
  assert.ok(publicMedia.includes("'ad-media'"));
  assert.match(publicMedia, /image\/jpeg/);
  assert.match(publicMedia, /image\/png/);
  assert.match(publicMedia, /image\/webp/);
  assert.doesNotMatch(publicMedia, /image\/svg|text\/html/);
  assert.match(publicMedia, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(publicMedia, /lower\(name\) ~ '\\\.\(jpe\?g\|png\|webp\)\$'/);
  const entityAcl = section(
    migration,
    "CREATE OR REPLACE FUNCTION public.security_can_write_entity_logo",
    "REVOKE ALL ON FUNCTION public.security_can_write_entity_logo",
  );
  assert.match(entityAcl, /phase_c_can_manage_provider\(provider\.id\)/);
  assert.doesNotMatch(entityAcl, /is_company_member/);
});

test("endpoint signed URL wymaga JWT, audytu i TTL pięciu minut", () => {
  const config = read("supabase/config.toml");
  assert.match(config, /\[functions\.private-storage-download\]\nverify_jwt = true/);

  const endpoint = read("supabase/functions/private-storage-download/index.ts");
  assert.match(endpoint, /requireUser\(req, admin\)/);
  assert.match(endpoint, /enforceDownloadRateLimit\(admin, identity\.userId\)/);
  assert.match(endpoint, /readPrivateStorageRequestBody\(req\)/);
  assert.doesNotMatch(endpoint, /req\.text\(\)/);
  const storageHelper = read("supabase/functions/_shared/privateStorageSecurity.ts");
  assert.match(storageHelper, /req\.body\.getReader\(\)/);
  assert.match(endpoint, /parsePrivateStorageObjectBody/);
  assert.match(endpoint, /canDownloadPrivateStorageObject/);
  assert.match(endpoint, /from\("private_storage_object_acl"\)/);
  assert.match(endpoint, /grantee_user_id/);
  assert.match(endpoint, /hasExplicitAccess/);
  assert.match(endpoint, /createSignedUrl\(object\.object_path, PRIVATE_STORAGE_SIGNED_URL_TTL_SECONDS\)/);
  assert.match(endpoint, /storage\.private_download_denied/);
  assert.match(endpoint, /storage\.private_download_authorized/);
  assert.match(endpoint, /object_not_found/);
  assert.doesNotMatch(endpoint, /body\.(?:tenant_id|company_id|object_path|bucket_id)/);
  assert.equal(PRIVATE_STORAGE_SIGNED_URL_TTL_SECONDS, 300);
});

test("fixture integracyjny obejmuje Tenant A, Tenant B, anon i ROLLBACK", () => {
  const fixture = read("supabase/tests/security/phase_c_tenant_isolation.sql");
  assert.match(fixture, /^BEGIN;/m);
  assert.match(fixture, /^ROLLBACK;/m);
  assert.ok(fixture.includes(USER_A));
  assert.ok(fixture.includes(USER_B));
  assert.ok(fixture.includes(COMPANY_A));
  assert.ok(fixture.includes(COMPANY_B));
  assert.match(fixture, /SET LOCAL ROLE authenticated/);
  assert.match(fixture, /SET LOCAL ROLE anon/);
  assert.match(fixture, /tenant_a_can_access_tenant_b/);
  assert.match(fixture, /tenant_b_can_access_tenant_a_by_id/);
  assert.match(fixture, /anonymous_storage_read_was_not_denied/);
  assert.match(fixture, /tenant_a_direct_storage_metadata_read_was_not_denied/);
  assert.match(fixture, /tenant_b_direct_storage_metadata_read_was_not_denied/);
  assert.match(fixture, /tenant_a_update_was_not_denied/);
  assert.match(fixture, /driver_a_cross_fleet_assignment_was_not_denied/);
  assert.match(fixture, /workspace_invitation_reparent_was_not_denied/);
  assert.match(fixture, /workspace_history_cross_tenant_read/);
  assert.match(fixture, /workspace_history_cross_tenant_insert_was_not_denied/);
  assert.match(fixture, /workspace_owner_forged_task_history/);
  assert.match(fixture, /workspace_comment_cross_tenant_insert_was_not_denied/);
  assert.match(fixture, /workspace_stale_participant_or_sender_retained_access/);
  assert.match(fixture, /workspace_document_author_retained_access/);
  assert.match(fixture, /workspace_owner_bypassed_member_command/);
  assert.match(fixture, /workspace_member_modified_foreign_document_comment/);
  assert.match(fixture, /workspace_member_changed_project_role/);
  assert.match(fixture, /workspace_viewer_inserted_task/);
  assert.match(fixture, /workspace_viewer_read_internal_content/);
  assert.match(fixture, /workspace_viewer_created_automation/);
  assert.match(fixture, /workspace_viewer_forged_task_history/);
  assert.match(fixture, /viewer_a_can_read_confirmation_token/);
  assert.match(fixture, /calendar_event_reparent_was_not_denied/);
  assert.match(fixture, /company_owner_can_modify_entitlement/);
  assert.match(fixture, /anonymous_service_booking_insert_was_not_denied/);
});
