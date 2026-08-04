import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

test("publiczny generator PDF jest zamknięty fail-closed", () => {
  const source = read("public/invoice-pdf.php");

  assert.match(source, /respondJson\(410, \['error' => 'endpoint_disabled'\]\)/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin\s*:\s*\*/i);
  assert.doesNotMatch(source, /\[['\"]html['\"]\]/);
  assert.doesNotMatch(source, /loadHtml\s*\(/);
  assert.doesNotMatch(source, /isPhpEnabled['\"]?\s*[,)]?\s*,?\s*true/i);
  assert.doesNotMatch(source, /isRemoteEnabled['\"]?\s*[,)]?\s*,?\s*true/i);
  assert.match(source, /'isPhpEnabled'\s*=>\s*false/);
  assert.match(source, /'isRemoteEnabled'\s*=>\s*false/);
});

test("endpoint ogranicza metodę, content type i rozmiar body przed odmową", () => {
  const source = read("public/invoice-pdf.php");

  assert.match(source, /\$requestMethod\s*!==\s*'POST'/);
  assert.match(source, /respondJson\(405, \['error' => 'method_not_allowed'\]\)/);
  assert.match(source, /\$contentType\s*!==\s*'application\/json'/);
  assert.match(source, /respondJson\(415, \['error' => 'unsupported_media_type'\]\)/);
  assert.match(source, /const MAX_REQUEST_BODY_BYTES\s*=\s*4096/);
  assert.match(source, /stream_get_contents\(\$input, MAX_REQUEST_BODY_BYTES \+ 1\)/);
  assert.match(source, /respondJson\(413, \['error' => 'payload_too_large'\]\)/);
  assert.match(source, /Cache-Control: no-store/);
  assert.match(source, /X-Content-Type-Options: nosniff/);
});

test("klient nie wysyła dowolnego HTML do publicznego PHP", () => {
  const source = read("src/utils/renderInvoicePdf.ts");

  assert.match(source, /export async function renderInvoicePdf\(/);
  assert.match(source, /return null;/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /JSON\.stringify/);
  assert.doesNotMatch(source, /invoice-pdf\.php/);
});
