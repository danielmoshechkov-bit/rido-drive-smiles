import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const proxy = readFileSync(join(ROOT, "public/foto-proxy.php"), "utf8");
const htaccess = readFileSync(join(ROOT, "public/.htaccess"), "utf8");

test("foto proxy zachowuje publiczne GET/HEAD/CORS, ale odrzuca pozostałe metody", () => {
  assert.match(proxy, /Access-Control-Allow-Origin: \*/);
  assert.match(proxy, /Access-Control-Allow-Methods: GET, HEAD, OPTIONS/);
  assert.match(proxy, /in_array\(\$method, \['GET', 'HEAD'\], true\)/);
  assert.match(proxy, /fotoProxyError\(405, 'Method not allowed'\)/);
  assert.match(proxy, /if \(\$method !== 'HEAD'\)/);
});

test("parametry pliku i lokalna ścieżka są zamknięte oraz ze sobą związane", () => {
  assert.match(proxy, /is_string\(\$_GET\[\$key\]\)/);
  assert.match(proxy, /\[\\x00-\\x1F\\x7F\\\/\\\\\\\\\]/);
  assert.match(proxy, /\.(?:\\?\(\?:)?jpe\?g\|png\|webp/);
  assert.match(proxy, /crm-import\/\(agencja_/);
  assert.match(proxy, /hash_equals\(\$file, \$pathMatch\[2\]\)/);
  assert.match(proxy, /realpath\(FOTO_PROXY_PUBLIC_ROOT\)/);
  assert.match(proxy, /strncmp\(\$directoryPrefix, \$crmPrefix, strlen\(\$crmPrefix\)\) !== 0/);
  assert.match(proxy, /is_link\(\$file\)/);
  assert.doesNotMatch(proxy, /\.\.\s*\.\s*\$_GET|\$_GET\[[^\]]+\][^;]*FOTO_PROXY_PUBLIC_ROOT/);
});

test("upstream jest stałą allowlistą HTTPS bez automatycznych redirectów", () => {
  for (const host of ["foto.asari.pl", "cdn.asari.pl", "k2.asari.pro"]) {
    assert.match(proxy, new RegExp(`'${host.replaceAll(".", "\\.")}'`));
  }
  assert.match(proxy, /\$scheme !== 'https'/);
  assert.match(proxy, /in_array\(\$host, FOTO_PROXY_ALLOWED_HOSTS, true\)/);
  assert.match(proxy, /\$port !== 443/);
  assert.match(proxy, /CURLOPT_FOLLOWLOCATION => false/);
  assert.match(proxy, /CURLOPT_MAXREDIRS => 0/);
  assert.match(proxy, /CURLOPT_PROTOCOLS_STR/);
  assert.match(proxy, /CURLPROTO_HTTPS/);
  assert.doesNotMatch(proxy, /follow_location['"]?\s*=>\s*1/);
});

test("TLS jest weryfikowany i bez cURL proxy działa fail-closed", () => {
  assert.match(proxy, /CURLOPT_SSL_VERIFYPEER => true/);
  assert.match(proxy, /CURLOPT_SSL_VERIFYHOST => 2/);
  assert.match(proxy, /!function_exists\('curl_init'\)/);
  assert.doesNotMatch(proxy, /function fotoProxyDownloadStream/);
  assert.doesNotMatch(proxy, /stream_context_create/);
  assert.doesNotMatch(proxy, /@fopen\(\$url/);
});

test("DNS jest sprawdzany jako publiczny i przypięty do zweryfikowanego hosta", () => {
  assert.match(proxy, /dns_get_record\(\$host, DNS_A\)/);
  assert.match(proxy, /FILTER_FLAG_NO_PRIV_RANGE/);
  assert.match(proxy, /FILTER_FLAG_NO_RES_RANGE/);
  assert.match(proxy, /CURLOPT_RESOLVE => \[sprintf\('%s:443:%s', \$host, \$ip\)\]/);
});

test("pobranie ma twardy limit czasu, Content-Length i limit strumienia", () => {
  assert.match(proxy, /FOTO_PROXY_MAX_BYTES = 12 \* 1024 \* 1024/);
  assert.match(proxy, /FOTO_PROXY_CONNECT_TIMEOUT_MS = 3000/);
  assert.match(proxy, /FOTO_PROXY_TOTAL_TIMEOUT_MS = 8000/);
  assert.match(proxy, /FOTO_PROXY_REQUEST_BUDGET_MS = 10000/);
  assert.match(proxy, /CURLOPT_CONNECTTIMEOUT_MS => min\(FOTO_PROXY_CONNECT_TIMEOUT_MS, \$timeoutMs\)/);
  assert.match(proxy, /CURLOPT_TIMEOUT_MS => \$timeoutMs/);
  assert.match(proxy, /\$downloadDeadline = microtime\(true\) \+ \(FOTO_PROXY_REQUEST_BUDGET_MS \/ 1000\)/);
  assert.match(proxy, /\$downloaded \+ \$chunkLength > FOTO_PROXY_MAX_BYTES/);
  assert.match(proxy, /\$declaredLength > FOTO_PROXY_MAX_BYTES/);
  assert.match(proxy, /strlen\(\$data\) > FOTO_PROXY_MAX_BYTES/);
  assert.match(proxy, /Accept-Encoding: identity/);
});

test("JPEG/PNG/WebP musi zgadzać się z rozszerzeniem i dać się w pełni zdekodować", () => {
  assert.match(proxy, /IMAGETYPE_JPEG => 'image\/jpeg'/);
  assert.match(proxy, /IMAGETYPE_PNG => 'image\/png'/);
  assert.match(proxy, /IMAGETYPE_WEBP/);
  assert.match(proxy, /hash_equals\(\$expectedMime, \$mime\)/);
  assert.match(proxy, /getimagesizefromstring\(\$data\)/);
  assert.match(proxy, /imagecreatefromstring\(\$data\)/);
  assert.match(proxy, /imagedestroy\(\$image\)/);
  assert.match(proxy, /FOTO_PROXY_MAX_WIDTH = 10000/);
  assert.match(proxy, /FOTO_PROXY_MAX_HEIGHT = 10000/);
  assert.match(proxy, /FOTO_PROXY_MAX_PIXELS = 12000000/);
  assert.match(proxy, /intdiv\(FOTO_PROXY_MAX_PIXELS, \$height\)/);
  assert.doesNotMatch(proxy, /unpack\('C4'/);
});

test("cache używa blokady, ponownego odczytu i atomowego rename", () => {
  assert.match(proxy, /flock\(\$handle, LOCK_EX \| LOCK_NB\)/);
  assert.match(proxy, /tempnam\(\$directory, '\.foto-proxy-'/);
  assert.match(proxy, /fflush\(\$handle\)/);
  assert.match(proxy, /fsync\(\$handle\)/);
  assert.match(proxy, /rename\(\$temporary, \$file\)/);
  assert.match(proxy, /fotoProxyReleaseCacheLock\(\$lock\)/);
  assert.doesNotMatch(proxy, /file_put_contents\(\$local_file, \$data\)/);
});

test("cache proxy jest prywatny, ograniczony i nie zapisuje do crm-import tenanta", () => {
  assert.match(proxy, /getrido-foto-proxy-v2/);
  assert.match(proxy, /FOTO_PROXY_CACHE_SLOTS = 64/);
  assert.match(proxy, /FOTO_PROXY_CACHEABLE_MAX_BYTES = 4 \* 1024 \* 1024/);
  assert.match(proxy, /chmod\(\$resolved, 0700\)/);
  assert.match(proxy, /'FOTO2 ' \. \$target\['keyHash'\]/);
  assert.match(proxy, /fotoProxyWriteSharedImage\(\$sharedCache, \$data\)/);
  assert.doesNotMatch(proxy, /fotoProxyWriteCacheAtomically\(\$local\['file'/);
  assert.doesNotMatch(proxy, /file_put_contents\([^\n]*\$local/);
});

test("cache miss ma limit klienta, limit globalny i limit współbieżności", () => {
  assert.match(proxy, /FOTO_PROXY_CLIENT_MISSES_PER_MINUTE = 90/);
  assert.match(proxy, /FOTO_PROXY_GLOBAL_MISSES_PER_MINUTE = 300/);
  assert.match(proxy, /FOTO_PROXY_MAX_CONCURRENT_DOWNLOADS = 8/);
  assert.match(proxy, /\$_SERVER\['REMOTE_ADDR'\]/);
  assert.doesNotMatch(proxy, /\$_SERVER\['HTTP_X_FORWARDED_FOR'\]/);
  assert.match(proxy, /fotoProxyConsumeMissBudget\(\$sharedCache\['dir'\]\)/);
  assert.match(proxy, /fotoProxyAcquireDownloadSlot\(\$sharedCache\['dir'\]\)/);
  assert.match(proxy, /flock\(\$handle, LOCK_EX \| LOCK_NB\)/);
  assert.match(proxy, /Retry-After: 60/);
});

test("negative cache ogranicza powtarzane pudła, a brak locka nie uruchamia outbound", () => {
  assert.match(proxy, /FOTO_PROXY_NEGATIVE_CACHE_SECONDS = 30/);
  assert.match(proxy, /'MISS2 ' \. \$target\['keyHash'\]/);
  assert.match(proxy, /fotoProxyWriteNegativeCache\(\$sharedCache\)/);

  const lockFailure = proxy.indexOf("if ($lock === null)");
  const afterLockFailure = proxy.indexOf("// Inny proces mógł uzupełnić cache", lockFailure);
  assert.ok(lockFailure >= 0 && afterLockFailure > lockFailure);
  const failureBranch = proxy.slice(lockFailure, afterLockFailure);
  assert.match(failureBranch, /fotoProxyBusy\(\)/);
  assert.doesNotMatch(failureBranch, /fotoProxyDownload\(/);
});

test("odpowiedź obrazu i błędu ma bezpieczne nagłówki i nie ujawnia upstreamu", () => {
  for (const header of [
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "Referrer-Policy: no-referrer",
    "Cross-Origin-Resource-Policy: cross-origin",
    "X-Robots-Tag: noindex, nofollow, nosnippet",
  ]) {
    assert.ok(proxy.includes(header), `Brak nagłówka proxy: ${header}`);
  }
  assert.match(proxy, /Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox/);
  assert.match(proxy, /Cache-Control: no-store, max-age=0/);
  assert.match(proxy, /Content-Disposition: inline; filename=/);
  assert.match(proxy, /hash\('sha256', \$data\)/);
  assert.doesNotMatch(proxy, /Image not found:|curl_error|X-Source:/);
});

test("Apache wymusza podstawowe nagłówki na sukcesach i błędach", () => {
  for (const header of [
    "X-Content-Type-Options \"nosniff\"",
    "X-Frame-Options \"SAMEORIGIN\"",
    "Referrer-Policy \"strict-origin-when-cross-origin\"",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy \"same-origin-allow-popups\"",
    "X-Permitted-Cross-Domain-Policies \"none\"",
    "Origin-Agent-Cluster \"?1\"",
  ]) {
    assert.ok(htaccess.includes(`Header always set ${header}`), `Brak wymuszonego ${header}`);
  }
  assert.match(htaccess, /Header always unset X-Powered-By/);
  assert.match(htaccess, /Strict-Transport-Security "max-age=86400"/);
  assert.doesNotMatch(htaccess, /Strict-Transport-Security[^\n]*includeSubDomains/i);
  assert.match(htaccess, /<If "%\{HTTPS\} == 'on'">/);
});

test("Apache nie odbija niezaufanego Host i blokuje bezpośredni crm-import", () => {
  assert.match(htaccess, /https:\/\/getrido\.pl\/\$1 \[R=301,L\]/);
  assert.doesNotMatch(htaccess, /https:\/\/%1|https:\/\/%\{HTTP_HOST\}/);
  assert.match(htaccess, /RewriteRule \^crm-import\(\?:\/\|\$\) - \[F,L,NC\]/);
  assert.doesNotMatch(htaccess, /RewriteRule \^crm-import\/\(\.\*\)\$ - \[L\]/);

  const crmBlock = htaccess.indexOf("RewriteRule ^crm-import");
  const existingFileBypass = htaccess.indexOf("RewriteCond %{REQUEST_FILENAME} -f");
  assert.ok(crmBlock >= 0 && existingFileBypass > crmBlock);
});

test("CSP portalu pozostaje wyłącznie Report-Only i obejmuje krytyczne dyrektywy", () => {
  assert.match(htaccess, /Header always set Content-Security-Policy-Report-Only/);
  assert.match(htaccess, /default-src 'self'/);
  assert.match(htaccess, /object-src 'none'/);
  assert.match(htaccess, /frame-ancestors 'self'/);
  assert.match(htaccess, /base-uri 'self'/);
  assert.match(htaccess, /connect-src 'self' https: wss:/);
  assert.match(htaccess, /img-src 'self' data: blob: https:/);
  assert.doesNotMatch(htaccess, /Header\s+always\s+set\s+Content-Security-Policy\s+"/i);
});
