<?php
$f = basename($_GET['f'] ?? '');
if (!$f || !preg_match('/^\d+\.(jpg|jpeg|png)$/i', $f)) { http_response_code(404); die(); }
$cacheDir = __DIR__ . '/foto-cache/';
if (!is_dir($cacheDir)) mkdir($cacheDir, 0755, true);
$cachePath = $cacheDir . $f;
if (file_exists($cachePath) && filemtime($cachePath) > time() - 86400*30) {
    header('Content-Type: image/jpeg');
    header('Cache-Control: public, max-age=2592000');
    readfile($cachePath); exit;
}
$data = @file_get_contents('https://foto.asari.pl/' . $f, false, stream_context_create([
    'http' => [
        'header' => "Referer: https://asari.pl/\r\nUser-Agent: Mozilla/5.0\r\n",
        'timeout' => 10
    ]
]));
if (!$data) { http_response_code(404); die(); }
file_put_contents($cachePath, $data);
header('Content-Type: image/jpeg');
header('Cache-Control: public, max-age=2592000');
echo $data;
