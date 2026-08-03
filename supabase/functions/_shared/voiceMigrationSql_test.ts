import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../../migrations/20260801090000_voice_conversation_finalization.sql", import.meta.url),
  "utf8",
);
const fixtureSql = readFileSync(
  new URL("../../tests/voice_conversation_finalization_duplicates_fixture.sql", import.meta.url),
  "utf8",
);
const verifySql = readFileSync(
  new URL("../../tests/voice_conversation_finalization_duplicates_verify.sql", import.meta.url),
  "utf8",
);
const testReadme = readFileSync(
  new URL("../../tests/voice_conversation_finalization_duplicates_README.md", import.meta.url),
  "utf8",
);

test("migracja archiwizuje i kontroluje historyczne duplikaty przed indeksami unikalnymi", () => {
  const archiveTable = sql.indexOf("CREATE TABLE IF NOT EXISTS public.voice_deduplication_archive");
  const callsArchive = sql.indexOf("SELECT 'voice_call', duplicate.id");
  const callsUpdate = sql.indexOf("UPDATE public.voice_calls duplicate");
  const transcriptsArchive = sql.indexOf("SELECT 'voice_transcript', duplicate.id");
  const transcriptsDelete = sql.indexOf("DELETE FROM public.voice_transcripts");
  const outcomesArchive = sql.indexOf("SELECT 'voice_call_outcome', duplicate.id");
  const outcomesDelete = sql.indexOf("DELETE FROM public.voice_call_outcomes");
  const finalCheck = sql.indexOf("check_voice_deduplication_result");
  const firstUniqueIndex = sql.indexOf("CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_calls_provider_conversation");

  assert.ok(archiveTable >= 0);
  assert.ok(callsArchive > archiveTable);
  assert.ok(callsUpdate > callsArchive);
  assert.ok(transcriptsArchive > callsUpdate);
  assert.ok(transcriptsDelete > transcriptsArchive);
  assert.ok(outcomesArchive > transcriptsDelete);
  assert.ok(outcomesDelete > outcomesArchive);
  assert.ok(finalCheck > outcomesDelete);
  assert.ok(firstUniqueIndex > finalCheck);
  assert.match(sql, /row_data\)\s*SELECT 'voice_transcript'.*to_jsonb\(duplicate\)/s);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /provider_id\s+uuid NOT NULL REFERENCES public\.service_providers\(id\) ON DELETE CASCADE/);
  assert.match(sql, /LOCK TABLE public\.voice_calls, public\.voice_transcripts, public\.voice_call_outcomes/);
  assert.match(sql, /JOIN public\.voice_calls call_record ON call_record\.id = transcript\.call_id/);
  assert.match(sql, /JOIN public\.voice_calls call_record ON call_record\.id = outcome\.call_id/);
  assert.match(sql, /SELECT 'voice_transcript', duplicate\.id, mapping\.canonical_id, mapping\.provider_id, to_jsonb\(duplicate\)/);
  assert.match(sql, /SELECT 'voice_call_outcome', duplicate\.id, mapping\.canonical_id, mapping\.provider_id, to_jsonb\(duplicate\)/);
  assert.match(sql, /linked_entity_type = 'workshop_order'.*DESC/s);
  assert.match(sql, /ORDER BY transcript\.created_at DESC, transcript\.id DESC/);
  assert.match(sql, /ORDER BY COALESCE\(outcome\.analyzed_at, outcome\.created_at\) DESC,\s*outcome\.created_at DESC, outcome\.id DESC/);
  assert.doesNotMatch(sql, /DELETE FROM public\.voice_calls/);
});

test("fixture PostgreSQL pokrywa duplikaty i zachowanie pełnej treści w jednej transakcji", () => {
  assert.equal((fixtureSql.match(/'conv_p1_fixture'/g) || []).length, 2);
  assert.match(fixtureSql, /starszy transkrypt do zachowania/);
  assert.match(fixtureSql, /nowszy transkrypt bieżący/);
  assert.match(fixtureSql, /starszy wynik/);
  assert.match(fixtureSql, /nowszy wynik/);
  assert.match(verifySql, /row_data ->> 'full_text' = 'starszy transkrypt do zachowania'/);
  assert.match(verifySql, /row_data ->> 'summary' = 'starsze podsumowanie'/);
  assert.match(verifySql, /row_data -> 'customer_data' ->> 'fixture' = 'starszy wynik'/);
  assert.match(verifySql, /provider_id = '90000000-0000-0000-0000-000000000001'/);
  assert.match(verifySql, /row_data ->> 'provider_id' = '90000000-0000-0000-0000-000000000002'/);
  assert.match(verifySql, /to_regclass\('public\.uq_voice_calls_provider_conversation'\)/);
  assert.match(testReadme, /psql "\$VOICE_TEST_DATABASE_URL" -1 -v ON_ERROR_STOP=1/);
});
