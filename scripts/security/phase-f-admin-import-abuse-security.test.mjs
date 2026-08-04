import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("ogólny limiter jest atomowy, service-only i działa fail-closed", () => {
  const security = read("supabase/functions/_shared/security.ts");
  const migration = read("supabase/migrations/20260801142000_phase_c_storage_lockdown.sql");
  assert.match(security, /export async function consumeRateLimit/);
  assert.match(security, /client\.rpc\("security_consume_rate_limit"/);
  assert.match(security, /throw new SecurityError\(503, "rate_limit_unavailable"/);
  assert.match(security, /throw new SecurityError\(429, "rate_limit_exceeded"/);
  assert.match(migration, /INSERT INTO public\.security_rate_limit_buckets AS bucket/);
  assert.match(migration, /ON CONFLICT \(scope, subject_id\) DO UPDATE/);
  assert.match(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
});

for (const [path, bodyLimit, hourlyScope, dailyScope] of [
  ["supabase/functions/csv-import/index.ts", "5_100_000", "admin.csv_import.user.hourly", "admin.csv_import.user.daily"],
  ["supabase/functions/import-drivers/index.ts", "7_100_000", "admin.driver_import.user.hourly", "admin.driver_import.user.daily"],
]) {
  test(`${path} limituje zweryfikowanego administratora przed parsowaniem importu`, () => {
    const source = read(path);
    const auth = source.indexOf("await requireAdmin(req");
    const firstLimit = source.indexOf("await consumeRateLimit", auth);
    const body = source.indexOf(`await readJsonBody(req, ${bodyLimit})`, firstLimit);
    assert.ok(auth > 0 && firstLimit > auth && body > firstLimit);
    assert.match(source, new RegExp(`scope: ['\"]${hourlyScope.replaceAll(".", "\\.")}['\"]`));
    assert.match(source, new RegExp(`scope: ['\"]${dailyScope.replaceAll(".", "\\.")}['\"]`));
    assert.match(source, /subjectId: identity\.userId/g);
    assert.doesNotMatch(source, /subjectId:\s*body[.?]/);
    assert.doesNotMatch(source, /await req\.json\(\)/);
  });
}

test("importy nie zapisują PII, identyfikatorów ani całych obiektów w logach technicznych", () => {
  for (const path of [
    "supabase/functions/csv-import/index.ts",
    "supabase/functions/import-drivers/index.ts",
  ]) {
    const source = read(path);
    const consoleCalls = (source.match(/console\.(?:log|info|warn|error|debug)\([\s\S]*?\);/g) ?? []).join("\n");

    assert.doesNotMatch(consoleCalls, /\$\{[^}]*(?:email|phone|full_name|firstName|lastName|getrido_id|getRidoId|driverId|\.id)[^}]*\}/i);
    assert.doesNotMatch(consoleCalls, /,\s*\{[\s\S]*?\}\s*\)/);
    assert.doesNotMatch(consoleCalls, /,\s*(?:headers|updateData|existingMap|platformIds|row|error|err|rowError|insertError|updateError|platformError)\s*\)/);
    assert.doesNotMatch(consoleCalls, /\.message\b/);
    assert.match(source, /function safeImportErrorCode\(error: unknown\)/);
  }
});

test("alerty importu nie utrwalają pełnego wiersza ani danych kierowcy w opisie", () => {
  const source = read("supabase/functions/csv-import/index.ts");
  assert.doesNotMatch(source, /\{\s*row\s*\}/);
  assert.doesNotMatch(source, /\{\s*row\s*,\s*error:/);
  assert.doesNotMatch(source, /\{\s*row\s*,\s*rowIndex:/);
  assert.doesNotMatch(source, /`Email "\$\{email\}"/);
  assert.doesNotMatch(source, /`Kierowca \$\{full_name\}/);
  assert.doesNotMatch(source, /`\$\{full_name\} - GetRido ID:/);
  assert.match(source, /\{ code: 'invalid_email' \}/);
  assert.match(source, /\{ code: 'missing_driver_identifier' \}/);
  assert.match(source, /\{ row_index: i \+ 2, code: errorCode \}/);
});

test("import rozliczeń używa atomowego upsertu i klucza SHA-256 bez historycznej kolizji", () => {
  const source = read("supabase/functions/csv-import/index.ts");
  const migration = read("supabase/migrations/20251021223927_8557901d-9e6f-4f2a-8b39-9a0b9f73924a.sql");
  assert.match(source, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(source, /current: `csv_v2_\$\{hex\}`/);
  assert.match(source, /\.eq\('driver_id', driver\.id\)[\s\S]*?\.eq\('period_from', period_from\)[\s\S]*?\.eq\('period_to', period_to\)/);
  assert.match(source, /\.upsert\([\s\S]*?\{ onConflict: 'raw_row_id' \}\)/);
  assert.match(migration, /CREATE UNIQUE INDEX idx_settlements_raw_row_id_unique\s+ON public\.settlements\(raw_row_id\)/);
});

test("import kierowców aktualizuje identyfikatory platform idempotentnie przed usuwaniem starych", () => {
  const source = read("supabase/functions/import-drivers/index.ts");
  const upsert = source.indexOf(".upsert(platformIds, { onConflict: 'driver_id,platform' })");
  const prune = source.indexOf(".not('platform', 'in'", upsert);
  assert.ok(upsert > 0 && prune > upsert);
  assert.doesNotMatch(source.slice(upsert - 500, upsert), /\.delete\(\)[\s\S]*?\.eq\('driver_id', driverId\)/);
});

for (const [path, hourlyScope, dailyScope] of [
  ["supabase/functions/admin-create-user/index.ts", "admin.user_create.user.hourly", "admin.user_create.user.daily"],
  ["supabase/functions/admin-users/index.ts", "admin.user_management.user.hourly", "admin.user_management.user.daily"],
]) {
  test(`${path} ogranicza operacje kont po sprawdzeniu roli administratora`, () => {
    const source = read(path);
    const auth = source.indexOf("await requireAdmin(req");
    const firstLimit = source.indexOf("await consumeRateLimit", auth);
    const body = source.indexOf("await readJsonBody(req, 8_192)", firstLimit);
    assert.ok(auth > 0 && firstLimit > auth && body > firstLimit);
    assert.match(source, new RegExp(hourlyScope.replaceAll(".", "\\.")));
    assert.match(source, new RegExp(dailyScope.replaceAll(".", "\\.")));
    assert.match(source, /subjectId: identity\.userId/g);
    assert.doesNotMatch(source, /await req\.json\(\)/);
  });
}

test("katalog użytkowników ma limit przed odczytem danych Auth", () => {
  const source = read("supabase/functions/admin-list-users/index.ts");
  const auth = source.indexOf("await requireAdmin(req");
  const firstLimit = source.indexOf("await consumeRateLimit", auth);
  const directoryRead = source.indexOf("auth.admin.listUsers", firstLimit);
  assert.ok(auth > 0 && firstLimit > auth && directoryRead > firstLimit);
  assert.match(source, /admin\.user_directory\.user\.hourly/);
  assert.match(source, /admin\.user_directory\.user\.daily/);
  assert.match(source, /subjectId: identity\.userId/g);
});
