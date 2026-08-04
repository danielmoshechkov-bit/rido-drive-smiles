import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Deepgram limituje zweryfikowanego użytkownika i spotkanie przed płatnym wywołaniem", () => {
  const source = read("supabase/functions/deepgram-transcribe/index.ts");
  assert.match(source, /const identity = await requireUser\(req, admin\)/);
  assert.match(source, /await readJsonBody\(req, 4_096\)/);
  assert.match(source, /subjectId: identity\.userId/g);
  assert.match(source, /subjectId: meeting\.id/);
  assert.doesNotMatch(source, /subjectId:\s*body[.?]/);

  const firstLimit = source.indexOf("await consumeAiRateLimit");
  const claim = source.indexOf('admin.rpc("phase_f_claim_meeting_transcription"');
  const secret = source.indexOf('getSecret(admin, "DEEPGRAM_API_KEY")');
  const provider = source.indexOf('fetch(`https://api.deepgram.com');
  assert.ok(firstLimit > 0 && firstLimit < claim && claim < secret && secret < provider);
  assert.match(source, /signal: AbortSignal\.timeout\(60_000\)/);
});

test("transkrypcja jest single-flight i nie zapisze wyniku do zmienionego nagrania", () => {
  const source = read("supabase/functions/deepgram-transcribe/index.ts");
  assert.match(source, /claimResult === "in_progress"/);
  assert.match(source, /claimResult === "succeeded"/);
  assert.match(source, /phase_f_finalize_meeting_transcription/);
  assert.match(source, /\.eq\("audio_url", audioPath\)[\s\S]*?\.select\("id"\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(source, /\.eq\("audio_url", authorizedAudioPath\)/);
  assert.match(source, /if \(admin && transcriptionClaim && !transcriptionFinalized\)/);
});

test("lease transkrypcji jest prywatny, atomowy, związany z właścicielem i service-only", () => {
  const migration = read("supabase/migrations/20260801160000_phase_f_abuse_controls.sql");
  assert.match(migration, /ALTER TABLE public\.security_meeting_transcription_jobs ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\.security_meeting_transcription_jobs FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.security_meeting_transcription_jobs\s+FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.phase_f_claim_meeting_transcription/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.phase_f_finalize_meeting_transcription/);
  assert.equal((migration.match(/auth\.role\(\) IS DISTINCT FROM 'service_role'/g) ?? []).length, 3);
  assert.equal((migration.match(/SECURITY DEFINER\s+SET search_path = pg_catalog, public/g) ?? []).length, 3);
  assert.match(migration, /meeting\.user_id = p_actor_id[\s\S]*?meeting\.audio_url = p_audio_path/);
  assert.match(migration, /ON CONFLICT \(meeting_id\) DO NOTHING/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /v_job\.status = 'processing' AND v_job\.lease_expires_at > v_now/);
  assert.match(migration, /audio_fingerprint = p_audio_fingerprint[\s\S]*?correlation_id = p_correlation_id[\s\S]*?status = 'processing'/);
  assert.equal((migration.match(/FROM PUBLIC, anon, authenticated, service_role/g) ?? []).length, 4);
  assert.equal((migration.match(/TO service_role/g) ?? []).length, 3);
});

test("monitoring zwraca tylko agregaty sygnałów i pozostaje service-only", () => {
  const migration = read("supabase/migrations/20260801160000_phase_f_abuse_controls.sql");
  assert.match(migration, /CREATE INDEX IF NOT EXISTS security_audit_log_action_time_idx/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS security_audit_log_result_time_idx/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.phase_f_security_signal_summary/);
  assert.match(migration, /RETURNS TABLE \(\s*signal text,\s*event_count bigint,\s*last_seen_at timestamptz/);
  assert.match(migration, /p_since < clock_timestamp\(\) - interval '7 days'/);
  assert.match(migration, /'cross_tenant_attempt'/);
  assert.match(migration, /'replay_attempt'/);
  assert.match(migration, /'payment_failure_or_denial'/);
  assert.match(migration, /'ai_failure_or_denial'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.phase_f_security_signal_summary\(timestamptz, uuid\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.phase_f_security_signal_summary\(timestamptz, uuid\)[\s\S]*?TO service_role/);
});

test("Rido Mail ogranicza tworzenie kont i koszt AI wyłącznie z zaufanym aktorem", () => {
  const source = read("supabase/functions/rido-mail/index.ts");
  assert.match(source, /const identity = await requireUser\(req, admin\)/);
  assert.match(source, /await readJsonBody\(req, 32_768\)/);
  assert.match(source, /scope: "ai\.mail\.account\.user\.hourly"[\s\S]*?subjectId: identity\.userId/);
  assert.match(source, /scope: analyze \? "ai\.mail\.analyze\.user\.hourly" : "ai\.mail\.reply\.user\.hourly"[\s\S]*?subjectId: identity\.userId/);
  assert.match(source, /scope: analyze \? "ai\.mail\.analyze\.email\.daily" : "ai\.mail\.reply\.email\.daily"[\s\S]*?subjectId: email\.id/);
  assert.match(source, /\.eq\("id", body\.email_id\)[\s\S]*?\.eq\("user_id", identity\.userId\)/);
  assert.doesNotMatch(source, /subjectId:\s*body[.?]/);

  const aiBranch = source.indexOf('if (action === "analyze_email"');
  const limit = source.indexOf("await consumeAiRateLimit", aiBranch);
  const secret = source.indexOf('getSecret(admin, "LOVABLE_API_KEY")', aiBranch);
  const provider = source.indexOf('fetch("https://ai.gateway.lovable.dev', aiBranch);
  assert.ok(aiBranch > 0 && limit < secret && secret < provider);
  assert.match(source, /signal: AbortSignal\.timeout\(45_000\)/);
});

test("admin AI wymaga roli admina i limituje JWT przed sekretem oraz providerem", () => {
  const source = read("supabase/functions/admin-ai-agent/index.ts");
  assert.match(source, /const identity = await requireAdmin\(req, supabaseAdmin\)/);
  assert.match(source, /await readJsonBody\(req, 32_768\)/);
  assert.match(source, /scope: 'ai\.admin\.agent\.user\.hourly'[\s\S]*?subjectId: identity\.userId/);
  assert.match(source, /scope: 'ai\.admin\.agent\.user\.daily'[\s\S]*?subjectId: identity\.userId/);
  assert.doesNotMatch(source, /subjectId:\s*body[.?]/);

  const limit = source.indexOf("await consumeAiRateLimit");
  const secret = source.indexOf("Deno.env.get('LOVABLE_API_KEY')");
  const provider = source.indexOf("fetch('https://ai.gateway.lovable.dev");
  assert.ok(limit > 0 && limit < secret && secret < provider);
  assert.match(source, /const MAX_TOOL_ROUNDS = 3/);
  assert.match(source, /toolRounds > MAX_TOOL_ROUNDS/);
  assert.equal((source.match(/signal: AbortSignal\.timeout\(45_000\)/g) ?? []).length, 2);
});

test("testy sekretów admina mają limit body, atomowy budżet i timeout providera", () => {
  const source = read("supabase/functions/admin-ai-secrets/index.ts");
  const handler = source.slice(source.indexOf("serve(async (req) =>"));
  assert.match(source, /import \{ consumeAiRateLimit \} from "\.\.\/_shared\/aiSecurity\.ts";/);
  assert.match(source, /const ADMIN_SECRET_MAX_BODY_BYTES = 32_768/);
  assert.match(source, /const ADMIN_SECRET_TEST_HOURLY_LIMIT = 10/);
  assert.match(source, /const ADMIN_SECRET_TEST_DAILY_LIMIT = 30/);
  assert.match(handler, /const identity = await requireAdmin\(req, admin\)/);
  assert.match(handler, /const body = await readJsonBody\(req, ADMIN_SECRET_MAX_BODY_BYTES\)/);
  assert.doesNotMatch(handler, /req\.json\(/);
  assert.match(handler, /scope: "ai\.admin_secret\.test\.user\.hourly"[\s\S]*?subjectId: identity\.userId/);
  assert.match(handler, /scope: "ai\.admin_secret\.test\.user\.daily"[\s\S]*?subjectId: identity\.userId/);

  const testBranch = handler.indexOf('if (action === "test")');
  const firstLimit = handler.indexOf("await consumeAiRateLimit", testBranch);
  const providerTest = handler.indexOf("await testConnection(admin, def.test)", testBranch);
  assert.ok(testBranch > 0 && firstLimit > testBranch && providerTest > firstLimit);

  const fetchCount = (source.match(/\bfetch\(/g) ?? []).length;
  const timeoutCount = (source.match(/signal: AbortSignal\.timeout\(ADMIN_SECRET_PROVIDER_TIMEOUT_MS\)/g) ?? []).length;
  assert.equal(fetchCount, 4);
  assert.equal(timeoutCount, fetchCount);
  assert.match(source, /result: result\.ok \? "succeeded" : "failed"/);
});

test("nieużywany ciężki runtime Transformers został usunięty bez zmiany innych wersji", () => {
  const packageJson = JSON.parse(read("package.json"));
  const packageLock = JSON.parse(read("package-lock.json"));
  assert.equal(packageJson.dependencies?.["@huggingface/transformers"], undefined);
  assert.equal(packageLock.packages?.["node_modules/@huggingface/transformers"], undefined);
  assert.equal(packageLock.packages?.["node_modules/onnxruntime-node"], undefined);
  assert.equal(packageLock.packages?.["node_modules/onnxruntime-web"], undefined);
  assert.equal(packageLock.packages?.["node_modules/sharp"], undefined);
});

test("stary html2pdf został usunięty, a eksport PDF ma limity i sprzątanie DOM", () => {
  const packageJson = JSON.parse(read("package.json"));
  const packageLock = JSON.parse(read("package-lock.json"));
  const helper = read("src/utils/exportElementToPdf.ts");
  const bankExport = read("src/components/fleet/BankTransferExportDialog.tsx");
  const settlements = read("src/components/FleetSettlementsView.tsx");
  assert.equal(packageJson.dependencies?.["html2pdf.js"], undefined);
  assert.equal(packageLock.packages?.["node_modules/html2pdf.js"], undefined);
  assert.equal(packageLock.packages?.["node_modules/html2pdf.js/node_modules/jspdf"], undefined);
  assert.match(helper, /const MAX_RENDER_PIXELS = 60_000_000/);
  assert.match(helper, /const MAX_PDF_PAGES = 100/);
  assert.match(helper, /import\('html2canvas'\)/);
  assert.match(helper, /import\('jspdf'\)/);
  assert.match(bankExport, /try \{[\s\S]*?exportElementToPdf[\s\S]*?finally \{[\s\S]*?container\.remove\(\)/);
  assert.match(settlements, /try \{[\s\S]*?exportElementToPdf[\s\S]*?finally \{[\s\S]*?container\.remove\(\)/);
  assert.doesNotMatch(bankExport + settlements, /html2pdf/);
});

test("eksport XLSX używa ograniczonego writera bez parsera, makr i relacji zewnętrznych", () => {
  const source = read("src/components/SettlementPreview.tsx");
  const writer = read("src/utils/exportFlatXlsx.ts");
  assert.doesNotMatch(source, /^import .* from ['"]xlsx['"];?$/m);
  assert.doesNotMatch(source, /import\(['"]xlsx['"]\)/);
  assert.match(source, /downloadFlatXlsx\(data,/);
  assert.match(source, /filteredSettlements\.length > 10_000/);
  assert.match(writer, /export const MAX_XLSX_ROWS = 10_000/);
  assert.match(writer, /export const MAX_XLSX_TEXT_LENGTH = 500/);
  assert.match(writer, /const FORMULA_PREFIX = \/\^\\s\*\[=\+\\-@\]\//);
  assert.doesNotMatch(writer, /<f[ >]/);
  assert.doesNotMatch(writer, /TargetMode=["']External["']/i);
  assert.doesNotMatch(writer, /vbaProject|macroEnabled|<hyperlinks?>/i);
});
