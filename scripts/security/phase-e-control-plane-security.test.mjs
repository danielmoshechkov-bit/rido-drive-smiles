import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const MIGRATION_PATH = "supabase/migrations/20260801150000_phase_e_ai_control_plane.sql";
const migration = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");

function section(start, end) {
  const startIndex = migration.indexOf(start);
  assert.ok(startIndex >= 0, `Brak początku sekcji: ${start}`);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  assert.ok(endIndex > startIndex, `Brak końca sekcji: ${end}`);
  return migration.slice(startIndex, endIndex);
}

function functionBlock(name) {
  const start = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const startIndex = migration.indexOf(start);
  assert.ok(startIndex >= 0, `Brak funkcji ${name}`);
  const endIndex = migration.indexOf("\n$$;", startIndex);
  assert.ok(endIndex > startIndex, `Brak końca funkcji ${name}`);
  return migration.slice(startIndex, endIndex + 4);
}

test("kontrolki per agent startują fail-closed i mają skończone limity", () => {
  const controls = section(
    "ALTER TABLE public.voice_agent_configs",
    "-- 2. Global emergency stop",
  );

  assert.match(controls, /kill_switch_enabled boolean NOT NULL DEFAULT true/);
  assert.match(controls, /dry_run_tools boolean NOT NULL DEFAULT true/);
  for (const column of [
    "max_concurrent_calls",
    "max_tool_calls_per_conversation",
    "max_write_tool_calls_per_conversation",
    "daily_tool_call_limit",
    "conversation_cost_limit_microusd",
    "daily_cost_limit_microusd",
  ]) {
    assert.match(
      controls,
      new RegExp(`ADD COLUMN IF NOT EXISTS ${column} (?:integer|bigint) NOT NULL DEFAULT 0`),
      `${column} nie ma bezpiecznego defaultu 0`,
    );
  }
  assert.match(controls, /max_write_tool_calls_per_conversation <= max_tool_calls_per_conversation/);
  assert.match(controls, /voice_agent_tenant_anchor_is_immutable/);
  assert.match(controls, /OLD\.kill_switch_enabled AND NOT NEW\.kill_switch_enabled/);
  assert.match(controls, /OLD\.dry_run_tools AND NOT NEW\.dry_run_tools/);
  assert.match(controls, /NEW\.max_tool_calls_per_conversation > OLD\.max_tool_calls_per_conversation/);
  assert.match(controls, /NOT OLD\.is_active AND NEW\.is_active/);
  assert.match(controls, /NEW\.custom_prompt_override IS DISTINCT FROM OLD\.custom_prompt_override/);
  assert.match(controls, /auth\.role\(\) IN \('authenticated', 'service_role'\)/);
  assert.match(controls, /current_setting\([\s\S]*'rido\.phase_e_runtime_authorization'/);
  assert.match(controls, /voice_agent_privileged_control_requires_server_authorization/);
});

test("globalny kill switch jest pojedynczy, aktywny domyślnie i bez DELETE", () => {
  const globalControl = section(
    "CREATE TABLE IF NOT EXISTS public.ai_global_runtime_control",
    "-- 3. Atomic tool claims and immutable execution ledger",
  );

  assert.match(globalControl, /CHECK \(control_key = 'global'\)/);
  assert.match(globalControl, /kill_switch_enabled boolean NOT NULL DEFAULT true/);
  assert.match(globalControl, /'global', true, 'phase_e_configuration_required'/);
  assert.match(globalControl, /ON CONFLICT \(control_key\) DO NOTHING/);
  assert.match(globalControl, /ENABLE ROW LEVEL SECURITY/);
  assert.match(globalControl, /FORCE ROW LEVEL SECURITY/);
  assert.match(globalControl, /USING \(public\.phase_c_is_system_admin\(\)\)/);
  assert.match(globalControl, /global_ai_runtime_control_is_required/);
  assert.match(globalControl, /global_ai_runtime_release_requires_actor_and_reason/);
  assert.match(globalControl, /GRANT SELECT ON TABLE public\.ai_global_runtime_control TO service_role/);
  assert.doesNotMatch(globalControl, /GRANT[^;]*(?:INSERT|UPDATE)[^;]*ai_global_runtime_control[^;]*service_role/i);
  assert.doesNotMatch(globalControl, /GRANT[^;]*DELETE[^;]*service_role/i);
});

test("globalny kill switch zmienia wyłącznie audytowane RPC system admina", () => {
  const runtime = functionBlock("phase_e_set_global_ai_kill_switch");

  assert.match(runtime, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(runtime, /public\.has_role\(p_actor_id, 'admin'::public\.app_role\)/);
  assert.match(runtime, /FOR UPDATE OF runtime/);
  assert.match(runtime, /UPDATE public\.ai_global_runtime_control/);
  assert.match(runtime, /INSERT INTO public\.security_audit_log/);
  assert.match(runtime, /p_actor_id, NULL, 'ai\.global_runtime_control\.change'/);
});

test("claim jest pre-effect, tenantowy i odporny na równoległy replay", () => {
  const claims = section(
    "CREATE TABLE IF NOT EXISTS public.ai_tool_execution_claims",
    "CREATE TABLE IF NOT EXISTS public.ai_tool_execution_ledger",
  );

  for (const field of [
    "provider_id uuid NOT NULL",
    "voice_config_id uuid NOT NULL",
    "conversation_id text NOT NULL",
    "correlation_id uuid NOT NULL",
    "idempotency_key uuid NOT NULL",
    "request_fingerprint text NOT NULL",
    "lease_token uuid NOT NULL",
    "lease_expires_at timestamptz NOT NULL",
  ]) {
    assert.ok(claims.includes(field), `Brak pola claim: ${field}`);
  }
  assert.match(claims, /UNIQUE \(provider_id, idempotency_key\)/);
  assert.match(claims, /request_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(claims, /status text NOT NULL DEFAULT 'processing'/);
  assert.match(claims, /FORCE ROW LEVEL SECURITY/);
  assert.match(claims, /REVOKE ALL PRIVILEGES[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.doesNotMatch(claims, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)/i);
});

test("klasy ryzyka są zgodne z aiSecurity i nie używają starych nazw", () => {
  for (const risk of [
    "read_only",
    "write_low",
    "write_high",
    "financial",
    "legal",
    "destructive",
  ]) {
    assert.match(migration, new RegExp(`'${risk}'`));
  }
  assert.doesNotMatch(migration, /'write_(?:low|high)_risk'/);
});

test("claim RPC wiąże config/call, kontroluje kill switch, limity i replay", () => {
  const claim = functionBlock("phase_e_claim_ai_tool_execution");

  assert.match(claim, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(claim, /p_conversation_id IS NULL/);
  assert.match(claim, /p_request_fingerprint !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(claim, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(claim, /config\.id = p_voice_config_id[\s\S]*config\.provider_id = p_provider_id/);
  assert.match(claim, /call\.provider_id = p_provider_id/);
  assert.match(claim, /ai_tool_actor_provider_mismatch/);
  assert.match(claim, /member\.user_id = p_actor_id/);
  assert.match(claim, /ai_tool_idempotency_payload_mismatch/);
  assert.match(claim, /'replay_terminal'/);
  assert.match(claim, /'already_processing'/);
  assert.match(claim, /'stale_processing_manual_recovery'/);
  assert.match(claim, /lease_token := NULL/);
  assert.match(claim, /global_control\.kill_switch_enabled = false/);
  assert.match(claim, /v_config\.kill_switch_enabled/);
  assert.match(claim, /v_config\.dry_run_tools/);
  assert.match(claim, /v_config\.max_tool_calls_per_conversation/);
  assert.match(claim, /v_config\.max_write_tool_calls_per_conversation/);
  assert.match(claim, /v_config\.daily_tool_call_limit/);
  assert.match(claim, /claim\.execution_mode = 'live'/);
  assert.match(claim, /INSERT INTO public\.ai_tool_execution_claims/);
  assert.match(claim, /INSERT INTO public\.security_audit_log/);
  assert.match(claim, /SELECT provider\.company_id INTO v_tenant_id/);
});

test("terminalny ledger jest tenantowy, append-only i zapisywany tylko przez finalize", () => {
  const ledger = section(
    "CREATE TABLE IF NOT EXISTS public.ai_tool_execution_ledger",
    "CREATE OR REPLACE FUNCTION public.phase_e_claim_ai_tool_execution",
  );

  assert.match(ledger, /claim_id uuid NOT NULL UNIQUE/);
  assert.match(ledger, /UNIQUE \(provider_id, idempotency_key\)/);
  assert.match(ledger, /execution_mode = 'dry_run' AND status = 'dry_run'/);
  assert.match(ledger, /execution_mode = 'live' AND status IN \('succeeded', 'denied', 'failed'\)/);
  assert.match(ledger, /safe_metadata jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(ledger, /FORCE ROW LEVEL SECURITY/);
  assert.match(ledger, /USING \(public\.phase_c_can_access_provider\(provider_id\)\)/);
  assert.match(ledger, /GRANT SELECT ON TABLE public\.ai_tool_execution_ledger TO authenticated/);
  assert.match(ledger, /GRANT SELECT ON TABLE public\.ai_tool_execution_ledger TO service_role/);
  assert.doesNotMatch(ledger, /GRANT[^;]*(?:INSERT|UPDATE|DELETE)[^;]*ai_tool_execution_ledger/i);
  assert.match(ledger, /claim\.status = 'processing'/);
  assert.match(ledger, /claim\.request_fingerprint IS NOT DISTINCT FROM NEW\.request_fingerprint/);
  assert.match(ledger, /config\.provider_id = NEW\.provider_id/);
  assert.match(ledger, /call\.provider_id = NEW\.provider_id/);
  assert.match(ledger, /ai_tool_execution_ledger_is_append_only/);
  assert.match(ledger, /BEFORE UPDATE OR DELETE ON public\.ai_tool_execution_ledger/);
  assert.doesNotMatch(ledger, /\b(?:prompt|authorization|api_key|access_token|refresh_token|password)\s+(?:text|jsonb)/i);
});

test("finalize blokuje cudzą lease, niespójny replay i audytuje prawdziwy tenant", () => {
  const finalize = functionBlock("phase_e_finalize_ai_tool_execution");

  assert.match(finalize, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(finalize, /FOR UPDATE/);
  assert.match(finalize, /v_claim\.lease_token IS DISTINCT FROM p_lease_token/);
  assert.match(finalize, /ai_tool_finalization_payload_mismatch/);
  assert.match(finalize, /v_existing_ledger\.safe_metadata IS DISTINCT FROM p_safe_metadata/);
  assert.match(finalize, /ai_tool_finalization_mode_mismatch/);
  assert.match(finalize, /INSERT INTO public\.ai_tool_execution_ledger/);
  assert.match(finalize, /UPDATE public\.ai_tool_execution_claims/);
  assert.match(finalize, /SELECT provider\.company_id INTO v_tenant_id/);
  assert.match(finalize, /v_claim\.actor_id, v_tenant_id, 'ai\.tool_execution\.finalize'/);
  assert.match(finalize, /OR \(p_result_code IS NOT NULL AND length\(p_result_code\) > 120\)/);
});

test("propozycje są wersjonowane, zaczynają pending i nie mają direct UPDATE", () => {
  const proposals = section(
    "CREATE TABLE IF NOT EXISTS public.ai_content_change_proposals",
    "-- Human reviewers can approve or reject",
  );

  assert.match(proposals, /content_type text NOT NULL CHECK \(content_type IN \('knowledge', 'script'\)\)/);
  assert.match(proposals, /UNIQUE \(provider_id, content_type, content_key, version_number\)/);
  assert.match(proposals, /UNIQUE \(provider_id, idempotency_key\)/);
  assert.match(proposals, /status text NOT NULL DEFAULT 'pending_review'/);
  assert.match(proposals, /ai_content_proposal_must_start_pending_review/);
  assert.match(proposals, /ai_content_proposal_config_provider_mismatch/);
  assert.match(proposals, /ai_content_proposal_call_provider_mismatch/);
  assert.match(proposals, /ai_content_proposal_version_is_immutable/);
  assert.match(proposals, /ai_content_proposal_history_is_immutable/);
  assert.match(proposals, /FORCE ROW LEVEL SECURITY/);
  assert.match(proposals, /USING \(public\.phase_c_can_access_provider\(provider_id\)\)/);
  assert.match(proposals, /GRANT SELECT, INSERT ON TABLE public\.ai_content_change_proposals TO service_role/);
  assert.doesNotMatch(proposals, /GRANT[^;]*UPDATE[^;]*ai_content_change_proposals/i);
  assert.doesNotMatch(proposals, /FOR (?:INSERT|UPDATE|DELETE) TO authenticated/);
});

test("review RPC wiąże człowieka z JWT, nie publikuje i audytuje company tenant", () => {
  const review = functionBlock("phase_e_review_ai_content_proposal");

  assert.match(review, /v_actor_id uuid := auth\.uid\(\)/);
  assert.match(review, /p_decision NOT IN \('approved', 'rejected'\)/);
  assert.doesNotMatch(review, /p_decision[^\n]*(?:published|superseded)/);
  assert.match(review, /FOR UPDATE OF proposal/);
  assert.match(review, /public\.phase_c_can_manage_provider\(v_provider_id\)/);
  assert.match(review, /reviewed_by_actor_id = v_actor_id/);
  assert.match(review, /SELECT provider\.company_id INTO v_tenant_id/);
  assert.match(review, /v_actor_id, v_tenant_id, 'ai\.content_proposal\.review'/);
});

test("publikacja wymaga approved row, managera tenanta i tworzy immutable resource", () => {
  const published = section(
    "CREATE TABLE IF NOT EXISTS public.ai_published_content_versions",
    "CREATE OR REPLACE FUNCTION public.phase_e_publish_ai_content_proposal",
  );
  const actorGuard = functionBlock("phase_e_actor_can_manage_provider");
  const publish = functionBlock("phase_e_publish_ai_content_proposal");

  assert.match(published, /proposal_id uuid NOT NULL UNIQUE/);
  assert.match(published, /UNIQUE \(provider_id, content_type, content_key, version_number\)/);
  assert.match(published, /FORCE ROW LEVEL SECURITY/);
  assert.match(published, /USING \(public\.phase_c_can_access_provider\(provider_id\)\)/);
  assert.match(published, /GRANT SELECT ON TABLE public\.ai_published_content_versions TO service_role/);
  assert.doesNotMatch(published, /GRANT[^;]*(?:INSERT|UPDATE|DELETE)[^;]*ai_published_content_versions/i);
  assert.match(published, /proposal\.status = 'approved'/);
  assert.match(published, /proposal\.provider_id = NEW\.provider_id/);
  assert.match(published, /ai_published_content_is_immutable/);

  assert.match(actorGuard, /auth\.role\(\) = 'service_role'/);
  assert.match(actorGuard, /public\.has_role\(p_actor_id, 'admin'::public\.app_role\)/);
  assert.match(actorGuard, /provider\.user_id = p_actor_id/);
  assert.match(actorGuard, /employee\.role IN \('owner', 'manager'\)/);

  assert.match(publish, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(publish, /proposal\.status IN \('approved', 'published'\)/);
  assert.match(publish, /FOR UPDATE OF proposal/);
  assert.match(publish, /phase_e_actor_can_manage_provider/);
  assert.match(publish, /INSERT INTO public\.ai_published_content_versions/);
  assert.match(publish, /SET status = 'published'/);
  assert.match(publish, /SELECT provider\.company_id INTO v_tenant_id/);
  assert.match(publish, /p_publisher_actor_id, v_tenant_id, 'ai\.content_proposal\.publish'/);
});

test("poluzowanie kontrolek agenta wymaga managera, markera transakcji i audytu", () => {
  const runtime = functionBlock("phase_e_set_voice_agent_runtime_controls");

  assert.match(runtime, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(runtime, /phase_e_actor_can_manage_provider/);
  assert.match(runtime, /voice_agent_activation_requires_privacy_confirmation/);
  assert.match(runtime, /voice_agent_runtime_release_is_not_safe/);
  assert.match(runtime, /pg_catalog\.set_config\([\s\S]*'rido\.phase_e_runtime_authorization'/);
  assert.match(runtime, /UPDATE public\.voice_agent_configs/);
  assert.match(runtime, /GET DIAGNOSTICS v_updated_rows = ROW_COUNT/);
  assert.match(runtime, /SELECT provider\.company_id INTO v_tenant_id/);
  assert.match(runtime, /p_actor_id, v_tenant_id, 'ai\.voice_agent_runtime\.change'/);
});

test("call analysis ma unikalność ElevenLabs z bezpiecznym NULL i fingerprint", () => {
  const analysis = section(
    "-- 6. Transactional, idempotent call-analysis persistence",
    "-- 7. Legacy knowledge remains readable",
  );

  assert.match(analysis, /ADD COLUMN IF NOT EXISTS analysis_idempotency_key uuid/);
  assert.match(analysis, /ADD COLUMN IF NOT EXISTS analysis_request_fingerprint text/);
  assert.match(analysis, /voice_calls_provider_elevenlabs_conversation_phase_e_uidx/);
  assert.match(analysis, /NULLIF\(pg_catalog\.btrim\(elevenlabs_conversation_id\), ''\)/);
  assert.match(analysis, /WHERE NULLIF\(pg_catalog\.btrim\(elevenlabs_conversation_id\), ''\) IS NOT NULL/);
  assert.match(analysis, /voice_calls_provider_analysis_idempotency_phase_e_uidx/);
  assert.match(analysis, /analysis_request_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(analysis, /pg_catalog\.sha256/);
});

test("record RPC ma ścisłą allowlistę, rozmiary i JSON validation", () => {
  const record = functionBlock("phase_e_record_voice_call_analysis");

  assert.match(record, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  for (const field of [
    "elevenlabs_conversation_id",
    "persona_key",
    "direction",
    "transcript",
    "outcome",
    "lessons",
    "linked_entity_type",
    "linked_entity_id",
  ]) {
    assert.match(record, new RegExp(`'${field}'`));
  }
  assert.match(record, /voice_call_analysis_contains_unknown_field/);
  assert.match(record, /octet_length\(p_analysis::text\) > 524288/);
  assert.match(record, /jsonb_array_length\(v_transcript\) NOT BETWEEN 2 AND 100/);
  assert.match(record, /jsonb_typeof\(transcript_item\.item -> 'content'\) <> 'string'/);
  assert.match(record, /voice_call_full_text_mismatch/);
  assert.match(record, /jsonb_array_length\(v_lessons\) > 8/);
  assert.match(record, /jsonb_typeof\(lesson\.item -> 'recommended_response'\) <> 'string'/);
  assert.match(record, /jsonb_object_keys\(v_customer_data\)/);
});

test("record RPC wiąże provider/config/call, serializuje replay i zapisuje atomowo", () => {
  const record = functionBlock("phase_e_record_voice_call_analysis");

  assert.match(record, /config\.id = p_voice_config_id[\s\S]*config\.provider_id = p_provider_id/);
  assert.match(record, /v_config\.persona_key IS DISTINCT FROM v_persona_key/);
  assert.match(record, /v_config\.kill_switch_enabled/);
  assert.match(record, /global_control\.kill_switch_enabled = false/);
  assert.match(record, /linked_order\.provider_id = p_provider_id/);
  assert.match(record, /linked_booking\.provider_id = p_provider_id/);
  assert.equal((record.match(/pg_catalog\.pg_advisory_xact_lock/g) ?? []).length, 2);
  assert.match(record, /existing_call\.analysis_idempotency_key = p_idempotency_key/);
  assert.match(record, /existing_call\.elevenlabs_conversation_id/);
  assert.match(record, /voice_call_analysis_idempotency_payload_mismatch/);
  assert.match(record, /voice_call_analysis_requires_manual_reconciliation/);
  assert.match(record, /RETURN QUERY SELECT v_existing_call\.id, true/);

  for (const target of [
    "voice_calls",
    "voice_transcripts",
    "voice_call_outcomes",
    "ai_content_change_proposals",
    "security_audit_log",
  ]) {
    assert.match(record, new RegExp(`INSERT INTO public\\.${target}`));
  }
  assert.match(record, /'pending_review'/);
  assert.match(record, /'auto_published', false/);
  assert.doesNotMatch(record, /INSERT INTO public\.voice_agent_knowledge/);
  assert.doesNotMatch(record, /SET status = 'published'/);
  assert.match(record, /SELECT provider\.company_id INTO v_tenant_id/);
});

test("SECURITY DEFINER mają zamknięty search_path i minimalne EXECUTE", () => {
  const functionBlocks = [...migration.matchAll(
    /CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\([^]*?\n\$\$;/g,
  )].map((match) => ({ name: match[1], source: match[0] }));
  const definers = functionBlocks
    .filter(({ source }) => source.includes("SECURITY DEFINER"))
    .map(({ name }) => name)
    .sort();

  assert.deepEqual(definers, [
    "phase_e_actor_can_manage_provider",
    "phase_e_claim_ai_tool_execution",
    "phase_e_finalize_ai_tool_execution",
    "phase_e_publish_ai_content_proposal",
    "phase_e_record_voice_call_analysis",
    "phase_e_review_ai_content_proposal",
    "phase_e_set_global_ai_kill_switch",
    "phase_e_set_voice_agent_runtime_controls",
  ]);

  for (const { name, source } of functionBlocks) {
    assert.match(source, /SET search_path = pg_catalog, public/);
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]*?\\)[\\s\\S]*?FROM PUBLIC`),
      `${name} nie ma jawnego REVOKE FROM PUBLIC`,
    );
  }
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION[^;]+TO\s+(?:PUBLIC|anon)\b/i);

  for (const name of [
    "phase_e_claim_ai_tool_execution",
    "phase_e_finalize_ai_tool_execution",
    "phase_e_publish_ai_content_proposal",
    "phase_e_record_voice_call_analysis",
    "phase_e_set_global_ai_kill_switch",
    "phase_e_set_voice_agent_runtime_controls",
  ]) {
    assert.match(
      migration,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+?\\)[\\s\\S]*?TO service_role`),
    );
  }
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.phase_e_actor_can_manage_provider[^;]+/i,
  );
});

test("legacy knowledge pozostaje read-only i nie jest celem nowej analizy", () => {
  const legacy = section(
    "-- 7. Legacy knowledge remains readable",
    "COMMENT ON TABLE public.ai_content_change_proposals",
  );

  assert.match(legacy, /ALTER COLUMN is_active SET DEFAULT false/);
  assert.match(legacy, /DROP POLICY IF EXISTS phase_c_voice_agent_knowledge_insert/);
  assert.match(legacy, /DROP POLICY IF EXISTS phase_c_voice_agent_knowledge_update/);
  assert.match(legacy, /DROP POLICY IF EXISTS phase_c_voice_agent_knowledge_delete/);
  assert.match(legacy, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.voice_agent_knowledge[\s\S]*FROM authenticated/);
  assert.match(legacy, /GRANT SELECT ON TABLE public\.voice_agent_knowledge TO authenticated/);
  assert.match(legacy, /New call analysis is[\s\S]*pending ai_content_change_proposals/);
});

test("migracja nie usuwa tabel, kolumn ani danych", () => {
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(migration, /\bDROP\s+COLUMN\b/i);
  assert.doesNotMatch(migration, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
});
