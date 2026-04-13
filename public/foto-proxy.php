<?php
/**
 * GetRido Foto Proxy
 * Serwuje zdjecia nieruchomosci z ASARI CRM
 * Plik musi byc w public/ zeby dzialal na serwerze LH.pl
 */

$f = $_GET['f'] ?? '';

// Walidacja nazwy pliku
if (!$f || !preg_match('/^\d+\.(jpg|jpeg|png)$/i', $f)) {
    http_response_code(404);
    header('Content-Type: text/plain');
    exit('Not found');
}

$f = basename($f); // Bezpieczenstwo - zapobiegaj path traversal

// Sciezka do katalogu ze zdjeciami na serwerze LH.pl
$agency_dir = '/home/serwer408603/domains/getrido.pl/public_html/crm-import/agencja_cac64003-b89c-4a73-a2d6-c15155ce1f08/foto/';
$local_file = $agency_dir . $f;

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

// 1. Sprawdz lokalny plik (wysłany przez ASARI przez FTP)
if (file_exists($local_file) && is_readable($local_file)) {
    $size = filesize($local_file);
    if ($size > 1000) { // Minimum 1KB - prawdziwy obrazek
        $mime = preg_match('/\.png$/i', $f) ? 'image/png' : 'image/jpeg';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . $size);
        header('Cache-Control: public, max-age=2592000'); // 30 dni
        header('X-Source: local-ftp');
        readfile($local_file);
        exit;
    }
}

// 2. Pobierz z ASARI CDN (fallback gdy brak pliku lokalnie)
$sources = [
    "https://foto.asari.pl/{$f}",
    "https://foto.asari.pl/foto/{$f}",
    "https://cdn.asari.pl/foto/{$f}",
    "https://k2.asari.pro/foto/{$f}",
];

$ctx = stream_context_create([
    'http' => [
        'timeout' => 8,
        'follow_location' => 1,
        'header' => implode("\r\n", [
            'Referer: https://asari.pl/',
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept: image/webp,image/apng,image/*,*/*;q=0.8',
        ]),
    ],
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
    ]
]);

foreach ($sources as $url) {
    $data = @file_get_contents($url, false, $ctx);
    if (!$data || strlen($data) < 1000) continue;

    // Weryfikuj ze to prawdziwy obrazek (magic bytes)
    $bytes = unpack('C4', substr($data, 0, 4));
    $is_jpeg = ($bytes[1] === 0xFF && $bytes[2] === 0xD8);
    $is_png  = ($bytes[1] === 0x89 && $bytes[2] === 0x50);
    if (!$is_jpeg && !$is_png) continue;

    // Zapisz lokalnie na przyszlosc (cache)
    if (is_dir($agency_dir) && is_writable($agency_dir)) {
        @file_put_contents($local_file, $data);
    }

    header('Content-Type: ' . ($is_jpeg ? 'image/jpeg' : 'image/png'));
    header('Content-Length: ' . strlen($data));
    header('Cache-Control: public, max-age=2592000');
    header('X-Source: asari-cdn');
    echo $data;
    exit;
}

// 3. Nic nie znaleziono
http_response_code(404);
header('Content-Type: text/plain');
echo 'Image not found: ' . htmlspecialchars($f);
