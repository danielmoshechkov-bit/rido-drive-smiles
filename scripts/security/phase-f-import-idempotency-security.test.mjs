import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const migrationPath = "supabase/migrations/20260801161000_phase_f_import_job_idempotency.sql";

test("rejestr importów jest prywatny i wiąże klucz z operacją, aktorem oraz zakresem miasta", () => {
  const sql = read(migrationPath);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.security_import_execution_jobs/);
  assert.match(sql, /actor_id uuid NOT NULL/);
  assert.doesNotMatch(sql, /actor_id uuid NOT NULL REFERENCES auth\.users[\s\S]*?ON DELETE CASCADE/);
  assert.match(sql, /tenant_scope_type text NOT NULL DEFAULT 'city'/);
  assert.match(sql, /tenant_scope_id uuid NOT NULL REFERENCES public\.cities/);
  assert.match(sql, /UNIQUE \(operation, tenant_scope_id, idempotency_key_hash\)/);
  assert.match(sql, /payload_fingerprint text NOT NULL CHECK \(payload_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.security_import_execution_jobs[\s\S]*?PUBLIC, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /idempotency_key\s+text/);
});

test("claim importu jest service-only, wymaga administratora i atomowo rozstrzyga replay", () => {
  const sql = read(migrationPath);
  const claim = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.phase_f_claim_import_execution"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.phase_f_finalize_import_execution"),
  );
  assert.match(claim, /SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/);
  assert.match(claim, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(claim, /role_row\.role::text = 'admin'/);
  assert.match(claim, /FROM public\.cities AS city WHERE city\.id = p_tenant_scope_id/);
  assert.match(claim, /ON CONFLICT \(operation, tenant_scope_id, idempotency_key_hash\)[\s\S]*?DO NOTHING/);
  assert.match(claim, /FOR UPDATE/);
  assert.match(claim, /v_job\.actor_id IS DISTINCT FROM p_actor_id/);
  assert.match(claim, /'decision', 'actor_mismatch'/);
  assert.match(claim, /payload_fingerprint IS DISTINCT FROM p_payload_fingerprint/);
  assert.match(claim, /'decision', 'payload_mismatch'/);
  assert.match(claim, /v_job\.status = 'processing' AND v_job\.lease_expires_at > v_now/);
  assert.match(claim, /v_job\.attempts >= 5/);
  assert.match(claim, /attempts = attempts \+ 1/);
  assert.match(claim, /result_summary = NULL/);
});

test("finalizacja wymaga aktualnego właściciela lease i nie przyjmuje PII w wyniku", () => {
  const sql = read(migrationPath);
  const finalize = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.phase_f_finalize_import_execution"));
  for (const binding of [
    "id = p_execution_id",
    "operation = p_operation",
    "actor_id = p_actor_id",
    "tenant_scope_id = p_tenant_scope_id",
    "idempotency_key_hash = p_idempotency_key_hash",
    "payload_fingerprint = p_payload_fingerprint",
    "correlation_id = p_correlation_id",
    "status = 'processing'",
  ]) {
    assert.match(finalize, new RegExp(binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(finalize, /jsonb_object_keys\(p_result_summary\)/);
  assert.match(finalize, /result_key\.key NOT IN/);
  assert.match(finalize, /jsonb_typeof\(result_value\.value\) NOT IN \('number', 'boolean'\)/);
  assert.match(finalize, /IF NOT FOUND THEN[\s\S]*?RETURN false/);
  assert.match(finalize, /REVOKE ALL ON FUNCTION public\.phase_f_finalize_import_execution[\s\S]*?PUBLIC, anon, authenticated, service_role/);
});

for (const [path, operation, payloadMarker] of [
  ["supabase/functions/csv-import/index.ts", "settlements_csv", "settlements_csv_v1"],
  ["supabase/functions/import-drivers/index.ts", "drivers_csv", "drivers_csv_v1"],
]) {
  test(`${path} hashuje payload i opcjonalny klucz przed claimem`, () => {
    const source = read(path);
    assert.match(source, new RegExp(`['\"]${payloadMarker}['\"]`));
    assert.match(source, /req\.headers\.get\(['"]x-idempotency-key['"]\)/);
    assert.match(source, /\^\[A-Za-z0-9\._:-\]\{16,128\}\$/);
    assert.match(source, /crypto\.subtle\.digest\(['"]SHA-256['"]/);
    assert.match(source, /suppliedKey \? `client_v1:\$\{suppliedKey\}` : `payload_v1:\$\{payloadFingerprint\}`/);
    assert.match(source, /\.rpc\(['"]phase_f_claim_import_execution['"]/);
    assert.match(source, new RegExp(`p_operation: ['\"]${operation}['\"]`));
    assert.match(source, /p_actor_id: actorId/);
    assert.match(source, /p_tenant_scope_id: tenantScopeId/);
    assert.doesNotMatch(source, /p_actor_id:\s*body/);
    assert.doesNotMatch(source, /p_tenant_scope_id:\s*body/);
  });

  test(`${path} zwraca zakończony replay i blokuje równoległe lub zmienione żądanie`, () => {
    const source = read(path);
    assert.match(source, /decision === ['"]succeeded['"]/);
    assert.match(source, /idempotent_replay: true/);
    assert.match(source, /decision === ['"]in_progress['"][\s\S]*?SecurityError\(409, ['"]import_in_progress['"]/);
    assert.match(source, /decision === ['"]payload_mismatch['"][\s\S]*?SecurityError\(409, ['"]idempotency_payload_mismatch['"]/);
    assert.match(source, /decision === ['"]actor_mismatch['"][\s\S]*?SecurityError\(403, ['"]idempotency_actor_mismatch['"]/);
    assert.match(source, /decision === ['"]retry_exhausted['"]/);
  });

  test(`${path} finalizuje sukces i bezpiecznie oznacza wyjątek jako failed`, () => {
    const source = read(path);
    assert.match(source, /\.rpc\(['"]phase_f_finalize_import_execution['"]/);
    assert.match(source, /p_idempotency_key_hash: context\.idempotencyKeyHash/);
    assert.match(source, /p_payload_fingerprint: context\.payloadFingerprint/);
    assert.match(source, /p_correlation_id: context\.correlationId/);
    assert.match(source, /await finalizeImportExecution\(supabase, executionContext, true, stats, null\)/);
    assert.match(source, /if \(executionContext && supabaseForFinalize\)[\s\S]*?safeImportErrorCode\(error\)/);
  });
}

test("import rozliczeń używa jednego domain job i jednej historii na execution", () => {
  const source = read("supabase/functions/csv-import/index.ts");
  assert.match(source, /\.from\('import_jobs'\)[\s\S]*?\.upsert\(\{[\s\S]*?id: executionContext\.executionId/);
  assert.match(source, /created_by: identity\.userId/);
  assert.match(source, /security_execution_id: executionContext\.executionId/);
  assert.match(source, /\{ onConflict: 'security_execution_id' \}/);
});

test("retry importu kierowców generuje stabilne ID z fingerprintu i indeksu wiersza", () => {
  const source = read("supabase/functions/import-drivers/index.ts");
  assert.match(source, /await generateGetRidoId\(executionContext\.payloadFingerprint, i\)/);
  assert.match(source, /sha256Hex\(JSON\.stringify\(\['driver_import_v1', payloadFingerprint, rowIndex\]\)\)/);
  assert.match(source, /return `IMP\$\{digest\.slice\(0, 13\)\.toUpperCase\(\)\}`/);
  assert.doesNotMatch(source, /crypto\.getRandomValues/);
});

test("lokalny fixture obejmuje replay, równoległość, aktora, payload i odmowę publicznego RPC", () => {
  const fixture = read("supabase/tests/security/phase_f_import_idempotency.sql");
  assert.match(fixture, /BEGIN;[\s\S]*?ROLLBACK;/);
  assert.match(fixture, /parallel_import_was_not_blocked/);
  assert.match(fixture, /foreign_actor_reused_import_claim/);
  assert.match(fixture, /changed_payload_reused_import_key/);
  assert.match(fixture, /wrong_lease_owner_finalized_import/);
  assert.match(fixture, /completed_import_replay_failed/);
  assert.match(fixture, /unsafe_result_summary_was_accepted/);
  assert.match(fixture, /ordinary_user_claimed_admin_import/);
  assert.match(fixture, /authenticated_user_called_service_import_claim/);
});
