<?php
// public/invoice-pdf.php — HTML -> PDF przez Dompdf (self-hosted na LH.pl, czysty PHP, BEZ exec).
// JEDEN generator dla wszystkich dokumentów (faktura/umowa/protokół/wycena/zlecenie).
// Klient POST-uje { html } (z generateInvoiceHtml) i dostaje { pdf_base64 } -> ten sam plik
// używany przez "Pobierz" i "Wyślij mailem".
//
// Wymaga biblioteki Dompdf w invoice-pdf-lib/vendor/ (composer install — patrz README).
// Sekret/klucz nie jest potrzebny. Dane faktur NIE wychodzą na zewnątrz.

error_reporting(0);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: content-type');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

$autoload = __DIR__ . '/invoice-pdf-lib/vendor/autoload.php';
if (!file_exists($autoload)) {
  http_response_code(500);
  echo json_encode(['error' => 'Dompdf niezainstalowany (brak vendor). Uruchom composer install w invoice-pdf-lib/.']);
  exit;
}
require $autoload;

use Dompdf\Dompdf;
use Dompdf\Options;

$body = json_decode(file_get_contents('php://input'), true);
$html = is_array($body) ? ($body['html'] ?? '') : '';
if (!is_string($html) || $html === '') {
  http_response_code(400);
  echo json_encode(['error' => 'Brak HTML']);
  exit;
}

try {
  $o = new Options();
  $o->set('isRemoteEnabled', true);        // pobiera logo/QR z URL (getrido.pl)
  $o->set('isHtml5ParserEnabled', true);
  $o->set('defaultFont', 'DejaVu Sans');   // polskie znaki (ż/ł/ś/ą...)
  $o->set('isPhpEnabled', true);           // page_text: "Strona X z Y"

  $dompdf = new Dompdf($o);
  $dompdf->loadHtml($html, 'UTF-8');
  $dompdf->setPaper('A4', 'portrait');
  $dompdf->render();

  echo json_encode(['pdf_base64' => base64_encode($dompdf->output())]);
} catch (\Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'Render PDF nieudany']);
}
