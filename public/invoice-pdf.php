<?php
declare(strict_types=1);

// SECURITY: ten historyczny endpoint przyjmował dowolny HTML z przeglądarki i
// renderował go bez uwierzytelnienia. Plik publiczny nie ma zaufanej warstwy,
// która zweryfikuje JWT, tenant i uprawnienie do dokumentu, dlatego pozostaje
// zamknięty fail-closed. Nie włączaj go ponownie przez samą zmianę kodu statusu.

error_reporting(0);
ini_set('display_errors', '0');

const MAX_REQUEST_BODY_BYTES = 4096;

// Te wartości są obowiązkowe również po przeniesieniu generatora do
// uwierzytelnionej usługi. Generator nie może wykonywać PHP ani pobierać zasobów
// wskazanych przez dokument lub użytkownika.
const DOMPDF_SECURITY_OPTIONS = [
  'isPhpEnabled' => false,
  'isRemoteEnabled' => false,
];

/** @param array<string, string> $payload */
function respondJson(int $status, array $payload): void
{
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES);
  exit;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('Cross-Origin-Resource-Policy: same-origin');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
header('Allow: POST');

$requestMethod = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if ($requestMethod !== 'POST') {
  respondJson(405, ['error' => 'method_not_allowed']);
}

$contentTypeHeader = strtolower(trim((string) ($_SERVER['CONTENT_TYPE'] ?? '')));
$contentType = trim(explode(';', $contentTypeHeader, 2)[0]);
if ($contentType !== 'application/json') {
  respondJson(415, ['error' => 'unsupported_media_type']);
}

$contentLengthHeader = trim((string) ($_SERVER['CONTENT_LENGTH'] ?? ''));
if ($contentLengthHeader !== '') {
  if (!ctype_digit($contentLengthHeader)) {
    respondJson(400, ['error' => 'invalid_content_length']);
  }

  if ((int) $contentLengthHeader > MAX_REQUEST_BODY_BYTES) {
    respondJson(413, ['error' => 'payload_too_large']);
  }
}

$input = fopen('php://input', 'rb');
if ($input === false) {
  respondJson(400, ['error' => 'invalid_request']);
}

$rawBody = stream_get_contents($input, MAX_REQUEST_BODY_BYTES + 1);
fclose($input);
if ($rawBody === false) {
  respondJson(400, ['error' => 'invalid_request']);
}
if (strlen($rawBody) > MAX_REQUEST_BODY_BYTES) {
  respondJson(413, ['error' => 'payload_too_large']);
}

// Celowo nie dekodujemy ani nie renderujemy body. Bezpieczna wersja musi
// przyjmować wyłącznie document_id, zweryfikować JWT i tenant po stronie serwera,
// pobrać dane dokumentu z bazy oraz wyrenderować zaufany szablon.
respondJson(410, ['error' => 'endpoint_disabled']);
