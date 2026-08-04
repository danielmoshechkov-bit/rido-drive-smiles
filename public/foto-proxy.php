<?php
declare(strict_types=1);

/**
 * Publiczny proxy zdjęć nieruchomości z ASARI CRM.
 *
 * Endpoint pozostaje publiczny, ale akceptuje wyłącznie bezpieczne nazwy plików
 * i pobiera obrazy z zamkniętej allowlisty hostów HTTPS. Nigdy nie zwraca
 * niezweryfikowanych bajtów ani szczegółów błędu upstreamu.
 */

const FOTO_PROXY_PUBLIC_ROOT = '/home/serwer408603/domains/getrido.pl/public_html/';
const FOTO_PROXY_MIN_BYTES = 1000;
const FOTO_PROXY_MAX_BYTES = 12 * 1024 * 1024;
const FOTO_PROXY_MAX_WIDTH = 10000;
const FOTO_PROXY_MAX_HEIGHT = 10000;
const FOTO_PROXY_MAX_PIXELS = 12000000;
const FOTO_PROXY_CONNECT_TIMEOUT_MS = 3000;
const FOTO_PROXY_TOTAL_TIMEOUT_MS = 8000;
const FOTO_PROXY_REQUEST_BUDGET_MS = 10000;
const FOTO_PROXY_CACHE_SECONDS = 2592000;
const FOTO_PROXY_NEGATIVE_CACHE_SECONDS = 30;
const FOTO_PROXY_CACHEABLE_MAX_BYTES = 4 * 1024 * 1024;
const FOTO_PROXY_CACHE_SLOTS = 64;
const FOTO_PROXY_CLIENT_MISSES_PER_MINUTE = 90;
const FOTO_PROXY_GLOBAL_MISSES_PER_MINUTE = 300;
const FOTO_PROXY_MAX_CONCURRENT_DOWNLOADS = 8;
const FOTO_PROXY_ALLOWED_HOSTS = [
    'foto.asari.pl',
    'cdn.asari.pl',
    'k2.asari.pro',
];

@ini_set('display_errors', '0');
@header_remove('X-Powered-By');

function fotoProxyBaseHeaders(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
    header('Cross-Origin-Resource-Policy: cross-origin');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox");
}

function fotoProxyError(int $status, string $message = 'Not found'): void
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=UTF-8');
    header('Cache-Control: no-store, max-age=0');
    header('Pragma: no-cache');
    header('X-Robots-Tag: noindex, nofollow, nosnippet');
    echo $message;
    exit;
}

function fotoProxyQueryString(string $key): ?string
{
    if (!array_key_exists($key, $_GET)) {
        return '';
    }

    return is_string($_GET[$key]) ? $_GET[$key] : null;
}

function fotoProxyValidFileName(string $file): bool
{
    $length = strlen($file);
    if ($length < 5 || $length > 200 || $file !== basename($file)) {
        return false;
    }
    if (preg_match('/[\x00-\x1F\x7F\/\\\\]/', $file) === 1) {
        return false;
    }

    return preg_match('/\.(?:jpe?g|png|webp)\z/iD', $file) === 1;
}

function fotoProxyExpectedMime(string $file): ?string
{
    $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    if ($extension === 'jpg' || $extension === 'jpeg') {
        return 'image/jpeg';
    }
    if ($extension === 'png') {
        return 'image/png';
    }
    if ($extension === 'webp') {
        return 'image/webp';
    }
    return null;
}

/**
 * @return array{file:string,dir:string}|null
 */
function fotoProxyLocalTarget(string $relativeFile): ?array
{
    if ($relativeFile === '') {
        return null;
    }

    $root = realpath(FOTO_PROXY_PUBLIC_ROOT);
    if ($root === false) {
        return null;
    }

    $directory = realpath($root . DIRECTORY_SEPARATOR . dirname($relativeFile));
    if ($directory === false || !is_dir($directory)) {
        return null;
    }

    $rootPrefix = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    $crmPrefix = $rootPrefix . 'crm-import' . DIRECTORY_SEPARATOR;
    $directoryPrefix = rtrim($directory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    if (strncmp($directoryPrefix, $crmPrefix, strlen($crmPrefix)) !== 0) {
        return null;
    }

    $file = $directoryPrefix . basename($relativeFile);
    if (is_link($file)) {
        return null;
    }
    if (file_exists($file)) {
        $resolvedFile = realpath($file);
        if ($resolvedFile === false || dirname($resolvedFile) !== rtrim($directory, DIRECTORY_SEPARATOR)) {
            return null;
        }
    }

    return ['file' => $file, 'dir' => rtrim($directory, DIRECTORY_SEPARATOR)];
}

function fotoProxyReadCappedFile(string $file): ?string
{
    clearstatcache(true, $file);
    if (is_link($file) || !is_file($file) || !is_readable($file)) {
        return null;
    }

    $size = filesize($file);
    if (!is_int($size) || $size < FOTO_PROXY_MIN_BYTES || $size > FOTO_PROXY_MAX_BYTES) {
        return null;
    }

    $handle = @fopen($file, 'rb');
    if ($handle === false) {
        return null;
    }

    $data = '';
    while (!feof($handle)) {
        $chunk = fread($handle, 8192);
        if ($chunk === false) {
            fclose($handle);
            return null;
        }
        $data .= $chunk;
        if (strlen($data) > FOTO_PROXY_MAX_BYTES) {
            fclose($handle);
            return null;
        }
    }
    fclose($handle);

    return strlen($data) >= FOTO_PROXY_MIN_BYTES ? $data : null;
}

/**
 * @return array{mime:string,width:int,height:int}|null
 */
function fotoProxyInspectImage(string $data, string $expectedMime): ?array
{
    $length = strlen($data);
    if ($length < FOTO_PROXY_MIN_BYTES || $length > FOTO_PROXY_MAX_BYTES) {
        return null;
    }

    $imageInfo = @getimagesizefromstring($data);
    if (!is_array($imageInfo) || !isset($imageInfo[0], $imageInfo[1], $imageInfo[2])) {
        return null;
    }

    $allowedTypes = [IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_PNG => 'image/png'];
    if (defined('IMAGETYPE_WEBP')) {
        $allowedTypes[constant('IMAGETYPE_WEBP')] = 'image/webp';
    }

    $width = (int) $imageInfo[0];
    $height = (int) $imageInfo[1];
    $type = (int) $imageInfo[2];
    $mime = $allowedTypes[$type] ?? null;
    if ($mime === null || !hash_equals($expectedMime, $mime)) {
        return null;
    }
    if ($width < 1 || $height < 1 || $width > FOTO_PROXY_MAX_WIDTH || $height > FOTO_PROXY_MAX_HEIGHT) {
        return null;
    }
    if ($width > intdiv(FOTO_PROXY_MAX_PIXELS, $height)) {
        return null;
    }

    // getimagesize sprawdza nagłówek, a imagecreatefromstring wymusza pełne
    // zdekodowanie danych. Brak GD oznacza bezpieczne odrzucenie obrazu.
    if (!function_exists('imagecreatefromstring')) {
        return null;
    }
    $image = @imagecreatefromstring($data);
    if ($image === false) {
        return null;
    }
    imagedestroy($image);

    return ['mime' => $mime, 'width' => $width, 'height' => $height];
}

function fotoProxyPublicIpv4(string $host): ?string
{
    $records = @dns_get_record($host, DNS_A);
    if (!is_array($records) || $records === []) {
        return null;
    }

    $publicAddresses = [];
    foreach ($records as $record) {
        $ip = isset($record['ip']) && is_string($record['ip']) ? $record['ip'] : '';
        if (filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) === false) {
            return null;
        }
        $publicAddresses[] = $ip;
    }

    return $publicAddresses[0] ?? null;
}

function fotoProxyValidatedRemote(string $url): ?array
{
    $parts = parse_url($url);
    if (!is_array($parts)) {
        return null;
    }

    $scheme = strtolower((string) ($parts['scheme'] ?? ''));
    $host = strtolower((string) ($parts['host'] ?? ''));
    $port = $parts['port'] ?? 443;
    if ($scheme !== 'https' || !in_array($host, FOTO_PROXY_ALLOWED_HOSTS, true)) {
        return null;
    }
    if ($port !== 443 || isset($parts['user']) || isset($parts['pass'])) {
        return null;
    }

    $ip = fotoProxyPublicIpv4($host);
    return $ip === null ? null : ['host' => $host, 'ip' => $ip];
}

function fotoProxyDownloadCurl(string $url, string $host, string $ip, int $timeoutMs): ?string
{
    if (!function_exists('curl_init')) {
        return null;
    }

    $handle = curl_init($url);
    if ($handle === false) {
        return null;
    }

    $chunks = [];
    $downloaded = 0;
    $declaredLength = null;
    curl_setopt_array($handle, [
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_MAXREDIRS => 0,
        CURLOPT_CONNECTTIMEOUT_MS => min(FOTO_PROXY_CONNECT_TIMEOUT_MS, $timeoutMs),
        CURLOPT_TIMEOUT_MS => $timeoutMs,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_PROXY => '',
        CURLOPT_NOSIGNAL => true,
        CURLOPT_HTTPHEADER => [
            'Accept: image/avif,image/webp,image/png,image/jpeg',
            'Accept-Encoding: identity',
            'Referer: https://asari.pl/',
        ],
        CURLOPT_USERAGENT => 'GetRidoFotoProxy/2.0',
        CURLOPT_RESOLVE => [sprintf('%s:443:%s', $host, $ip)],
        CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$declaredLength): int {
            if (stripos($line, 'Content-Length:') === 0) {
                $value = trim(substr($line, strlen('Content-Length:')));
                if ($value === '' || !ctype_digit($value)) {
                    return 0;
                }
                $declaredLength = (int) $value;
                if ($declaredLength > FOTO_PROXY_MAX_BYTES) {
                    return 0;
                }
            }
            return strlen($line);
        },
        CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$chunks, &$downloaded): int {
            $chunkLength = strlen($chunk);
            if ($downloaded + $chunkLength > FOTO_PROXY_MAX_BYTES) {
                return 0;
            }
            $downloaded += $chunkLength;
            $chunks[] = $chunk;
            return $chunkLength;
        },
    ]);

    if (defined('CURLOPT_PROTOCOLS_STR')) {
        curl_setopt($handle, constant('CURLOPT_PROTOCOLS_STR'), 'https');
    } else {
        curl_setopt($handle, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
    }

    $ok = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    curl_close($handle);
    if ($ok !== true || $status !== 200 || $downloaded < FOTO_PROXY_MIN_BYTES) {
        return null;
    }
    if ($declaredLength !== null && $declaredLength !== $downloaded) {
        return null;
    }

    return implode('', $chunks);
}

function fotoProxyDownload(string $url, int $timeoutMs): ?string
{
    // Fallback strumieniowy ponownie rozwiązywałby DNS pomiędzy walidacją a
    // połączeniem. Bez cURL i CURLOPT_RESOLVE działamy bezpiecznie fail-closed.
    if ($timeoutMs < 250 || !function_exists('curl_init')) {
        return null;
    }
    $remote = fotoProxyValidatedRemote($url);
    if ($remote === null) {
        return null;
    }

    return fotoProxyDownloadCurl($url, $remote['host'], $remote['ip'], $timeoutMs);
}

function fotoProxyPrivateCacheDirectory(): ?string
{
    static $initialized = false;
    static $cacheDirectory = null;
    if ($initialized) {
        return $cacheDirectory;
    }
    $initialized = true;

    $temporaryRoot = realpath(sys_get_temp_dir());
    if ($temporaryRoot === false || !is_dir($temporaryRoot)) {
        return null;
    }
    $directory = rtrim($temporaryRoot, DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR . 'getrido-foto-proxy-v2';
    if (is_link($directory) || (file_exists($directory) && !is_dir($directory))) {
        return null;
    }
    if (!is_dir($directory) && !@mkdir($directory, 0700)) {
        return null;
    }

    clearstatcache(true, $directory);
    $resolved = realpath($directory);
    if ($resolved === false || $resolved !== $directory || is_link($directory)) {
        return null;
    }
    $owner = @fileowner($resolved);
    if (function_exists('posix_geteuid') && $owner !== false && $owner !== posix_geteuid()) {
        return null;
    }
    if (!@chmod($resolved, 0700)) {
        return null;
    }
    clearstatcache(true, $resolved);
    $permissions = @fileperms($resolved);
    if ($permissions === false || ($permissions & 0077) !== 0 || !is_writable($resolved)) {
        return null;
    }

    $cacheDirectory = $resolved;
    return $cacheDirectory;
}

/** @return array{file:string,dir:string,keyHash:string,lockKey:string}|null */
function fotoProxySharedCacheTarget(string $file): ?array
{
    $directory = fotoProxyPrivateCacheDirectory();
    if ($directory === null) {
        return null;
    }

    $keyHash = hash('sha256', $file);
    $slot = hexdec(substr($keyHash, 0, 2)) % FOTO_PROXY_CACHE_SLOTS;
    $slotName = str_pad(dechex($slot), 2, '0', STR_PAD_LEFT);
    return [
        'file' => $directory . DIRECTORY_SEPARATOR . 'cache-' . $slotName . '.bin',
        'dir' => $directory,
        'keyHash' => $keyHash,
        'lockKey' => 'cache-slot-' . $slotName,
    ];
}

function fotoProxyReadPrivateCacheFile(string $file): ?string
{
    clearstatcache(true, $file);
    if (is_link($file) || !is_file($file) || !is_readable($file)) {
        return null;
    }

    $size = @filesize($file);
    $maxSize = FOTO_PROXY_CACHEABLE_MAX_BYTES + 128;
    if (!is_int($size) || $size < 16 || $size > $maxSize) {
        return null;
    }

    $handle = @fopen($file, 'rb');
    if ($handle === false) {
        return null;
    }
    $data = '';
    while (!feof($handle)) {
        $chunk = fread($handle, 8192);
        if ($chunk === false) {
            fclose($handle);
            return null;
        }
        $data .= $chunk;
        if (strlen($data) > $maxSize) {
            fclose($handle);
            return null;
        }
    }
    fclose($handle);
    return $data;
}

/** @return array{state:string,data?:string,image?:array{mime:string,width:int,height:int}} */
function fotoProxyReadSharedCache(array $target, string $expectedMime): array
{
    $packed = fotoProxyReadPrivateCacheFile($target['file']);
    if ($packed === null) {
        return ['state' => 'miss'];
    }

    $newline = strpos($packed, "\n");
    if ($newline === false || $newline > 110) {
        return ['state' => 'miss'];
    }
    $header = substr($packed, 0, $newline);
    $now = time();

    if (strncmp($header, 'MISS2 ', 6) === 0) {
        $parts = explode(' ', $header);
        if (count($parts) !== 3 || !hash_equals($target['keyHash'], $parts[1]) || !ctype_digit($parts[2])) {
            return ['state' => 'miss'];
        }
        $createdAt = (int) $parts[2];
        if ($createdAt <= $now && $createdAt >= $now - FOTO_PROXY_NEGATIVE_CACHE_SECONDS) {
            return ['state' => 'negative'];
        }
        return ['state' => 'miss'];
    }

    if (!hash_equals('FOTO2 ' . $target['keyHash'], $header)) {
        return ['state' => 'miss'];
    }
    $modifiedAt = @filemtime($target['file']);
    if (!is_int($modifiedAt) || $modifiedAt < $now - FOTO_PROXY_CACHE_SECONDS) {
        return ['state' => 'miss'];
    }

    $data = substr($packed, $newline + 1);
    $image = fotoProxyInspectImage($data, $expectedMime);
    if ($image === null) {
        return ['state' => 'miss'];
    }
    return ['state' => 'hit', 'data' => $data, 'image' => $image];
}

function fotoProxyTrustedClientKey(): string
{
    $address = $_SERVER['REMOTE_ADDR'] ?? '';
    if (!is_string($address) || filter_var($address, FILTER_VALIDATE_IP) === false) {
        $address = 'unknown';
    }
    // Nie ufamy X-Forwarded-For; REMOTE_ADDR pochodzi z połączenia do serwera.
    return hash('sha256', $address);
}

function fotoProxyConsumeMissBudget(string $directory): bool
{
    $file = $directory . DIRECTORY_SEPARATOR . 'rate-limit.state';
    if (is_link($file)) {
        return false;
    }
    $handle = @fopen($file, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) {
            fclose($handle);
        }
        return false;
    }

    $raw = stream_get_contents($handle);
    $window = intdiv(time(), 60);
    $state = ['window' => $window, 'global' => 0, 'clients' => []];
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            flock($handle, LOCK_UN);
            fclose($handle);
            return false;
        }
        if (($decoded['window'] ?? null) === $window
            && is_int($decoded['global'] ?? null)
            && is_array($decoded['clients'] ?? null)) {
            $state = $decoded;
        }
    }

    $clientKey = fotoProxyTrustedClientKey();
    $clientCount = isset($state['clients'][$clientKey]) && is_int($state['clients'][$clientKey])
        ? $state['clients'][$clientKey]
        : 0;
    if ($clientCount >= FOTO_PROXY_CLIENT_MISSES_PER_MINUTE
        || $state['global'] >= FOTO_PROXY_GLOBAL_MISSES_PER_MINUTE) {
        flock($handle, LOCK_UN);
        fclose($handle);
        return false;
    }

    $state['global']++;
    $state['clients'][$clientKey] = $clientCount + 1;
    $encoded = json_encode($state, JSON_UNESCAPED_SLASHES);
    $stored = is_string($encoded)
        && rewind($handle)
        && ftruncate($handle, 0)
        && fwrite($handle, $encoded) === strlen($encoded)
        && fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    return $stored;
}

/** @return resource|null */
function fotoProxyAcquireDownloadSlot(string $directory)
{
    for ($slot = 0; $slot < FOTO_PROXY_MAX_CONCURRENT_DOWNLOADS; $slot++) {
        $file = $directory . DIRECTORY_SEPARATOR . 'download-' . $slot . '.lock';
        if (is_link($file)) {
            continue;
        }
        $handle = @fopen($file, 'c');
        if ($handle !== false && flock($handle, LOCK_EX | LOCK_NB)) {
            return $handle;
        }
        if (is_resource($handle)) {
            fclose($handle);
        }
    }
    return null;
}

/** @return resource|null */
function fotoProxyAcquireCacheLock(string $cacheKey, string $directory)
{
    $lockPath = $directory . DIRECTORY_SEPARATOR
        . 'cache-lock-' . hash('sha256', $cacheKey) . '.lock';
    $handle = @fopen($lockPath, 'c');
    if ($handle === false) {
        return null;
    }

    $deadline = microtime(true) + 1.5;
    do {
        if (flock($handle, LOCK_EX | LOCK_NB)) {
            return $handle;
        }
        usleep(50000);
    } while (microtime(true) < $deadline);

    fclose($handle);
    return null;
}

/** @param resource|null $lock */
function fotoProxyReleaseCacheLock($lock): void
{
    if (is_resource($lock)) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function fotoProxyWriteCacheAtomically(string $file, string $directory, string $data): bool
{
    if (!is_dir($directory) || !is_writable($directory) || is_link($file)) {
        return false;
    }

    $temporary = @tempnam($directory, '.foto-proxy-');
    if ($temporary === false) {
        return false;
    }

    $handle = @fopen($temporary, 'wb');
    if ($handle === false) {
        @unlink($temporary);
        return false;
    }
    $written = 0;
    $length = strlen($data);
    while ($written < $length) {
        $result = fwrite($handle, substr($data, $written, 8192));
        if ($result === false || $result === 0) {
            fclose($handle);
            @unlink($temporary);
            return false;
        }
        $written += $result;
    }
    $flushed = fflush($handle);
    if ($flushed && function_exists('fsync')) {
        $flushed = fsync($handle);
    }
    fclose($handle);
    if (!$flushed || $written !== $length) {
        @unlink($temporary);
        return false;
    }

    @chmod($temporary, 0600);
    clearstatcache(true, $file);
    if (is_link($file) || !@rename($temporary, $file)) {
        @unlink($temporary);
        return false;
    }
    return true;
}

function fotoProxyWriteSharedImage(array $target, string $data): bool
{
    if (strlen($data) > FOTO_PROXY_CACHEABLE_MAX_BYTES) {
        return false;
    }
    return fotoProxyWriteCacheAtomically(
        $target['file'],
        $target['dir'],
        'FOTO2 ' . $target['keyHash'] . "\n" . $data
    );
}

function fotoProxyWriteNegativeCache(array $target): bool
{
    return fotoProxyWriteCacheAtomically(
        $target['file'],
        $target['dir'],
        'MISS2 ' . $target['keyHash'] . ' ' . time() . "\n"
    );
}

function fotoProxyBusy(): void
{
    header('Retry-After: 60');
    fotoProxyError(429, 'Too many requests');
}

/** @param array{mime:string,width:int,height:int} $image */
function fotoProxySendImage(
    string $data,
    array $image,
    string $file,
    string $cacheState,
    string $method
): void {
    $etag = '"' . hash('sha256', $data) . '"';
    header('Content-Type: ' . $image['mime']);
    header('Cache-Control: public, max-age=' . FOTO_PROXY_CACHE_SECONDS . ', immutable');
    header('ETag: ' . $etag);
    header('Content-Disposition: inline; filename="image.'
        . strtolower(pathinfo($file, PATHINFO_EXTENSION)) . '"');
    header('X-Proxy-Cache: ' . $cacheState);

    $ifNoneMatch = isset($_SERVER['HTTP_IF_NONE_MATCH']) && is_string($_SERVER['HTTP_IF_NONE_MATCH'])
        ? trim($_SERVER['HTTP_IF_NONE_MATCH'])
        : '';
    if ($ifNoneMatch !== '' && hash_equals($etag, $ifNoneMatch)) {
        http_response_code(304);
        exit;
    }

    header('Content-Length: ' . strlen($data));
    if ($method !== 'HEAD') {
        echo $data;
    }
    exit;
}

fotoProxyBaseHeaders();
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    http_response_code(204);
    header('Cache-Control: no-store, max-age=0');
    exit;
}
if (!in_array($method, ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD, OPTIONS');
    fotoProxyError(405, 'Method not allowed');
}

$file = fotoProxyQueryString('f');
$agency = fotoProxyQueryString('agency');
$path = fotoProxyQueryString('p');
if ($file === null || $agency === null || $path === null || !fotoProxyValidFileName($file)) {
    fotoProxyError(404);
}

$agency = trim($agency);
$path = ltrim(trim($path), '/');
if ($agency !== '' && preg_match('/\A[A-Za-z0-9][A-Za-z0-9_-]{0,79}\z/D', $agency) !== 1) {
    fotoProxyError(404);
}

$relativeFile = '';
if ($path !== '') {
    if (strlen($path) > 320 || preg_match(
        '#\Acrm-import/(agencja_[A-Za-z0-9_-]{1,80})/foto/([^/\\\\]+)\z#D',
        $path,
        $pathMatch
    ) !== 1) {
        fotoProxyError(404);
    }
    if (!hash_equals($file, $pathMatch[2]) || !fotoProxyValidFileName($pathMatch[2])) {
        fotoProxyError(404);
    }
    if ($agency !== '' && !hash_equals($agency, $pathMatch[1])) {
        fotoProxyError(404);
    }
    $relativeFile = $path;
} elseif ($agency !== '') {
    $relativeFile = 'crm-import/' . $agency . '/foto/' . $file;
}

$expectedMime = fotoProxyExpectedMime($file);
if ($expectedMime === null) {
    fotoProxyError(404);
}

$local = fotoProxyLocalTarget($relativeFile);
if ($local !== null) {
    $localData = fotoProxyReadCappedFile($local['file']);
    $localImage = $localData === null ? null : fotoProxyInspectImage($localData, $expectedMime);
    if ($localData !== null && $localImage !== null) {
        fotoProxySendImage($localData, $localImage, $file, 'HIT', $method);
    }
}

$sharedCache = fotoProxySharedCacheTarget($file);
if ($sharedCache === null) {
    fotoProxyError(503, 'Service unavailable');
}
$sharedState = fotoProxyReadSharedCache($sharedCache, $expectedMime);
if ($sharedState['state'] === 'hit') {
    fotoProxySendImage(
        $sharedState['data'],
        $sharedState['image'],
        $file,
        'HIT',
        $method
    );
}
if ($sharedState['state'] === 'negative') {
    fotoProxyError(404);
}

$lock = fotoProxyAcquireCacheLock($sharedCache['lockKey'], $sharedCache['dir']);
if ($lock === null) {
    // Po nieuzyskaniu blokady wolno tylko ponownie odczytać cache. Nigdy nie
    // rozpoczynamy drugiego pobrania tego samego slotu.
    if ($local !== null) {
        $localData = fotoProxyReadCappedFile($local['file']);
        $localImage = $localData === null ? null : fotoProxyInspectImage($localData, $expectedMime);
        if ($localData !== null && $localImage !== null) {
            fotoProxySendImage($localData, $localImage, $file, 'HIT', $method);
        }
    }
    $sharedState = fotoProxyReadSharedCache($sharedCache, $expectedMime);
    if ($sharedState['state'] === 'hit') {
        fotoProxySendImage(
            $sharedState['data'],
            $sharedState['image'],
            $file,
            'HIT',
            $method
        );
    }
    if ($sharedState['state'] === 'negative') {
        fotoProxyError(404);
    }
    fotoProxyBusy();
}

// Inny proces mógł uzupełnić cache, gdy czekaliśmy na blokadę.
if ($local !== null) {
    $localData = fotoProxyReadCappedFile($local['file']);
    $localImage = $localData === null ? null : fotoProxyInspectImage($localData, $expectedMime);
    if ($localData !== null && $localImage !== null) {
        fotoProxyReleaseCacheLock($lock);
        fotoProxySendImage($localData, $localImage, $file, 'HIT', $method);
    }
}
$sharedState = fotoProxyReadSharedCache($sharedCache, $expectedMime);
if ($sharedState['state'] === 'hit') {
    fotoProxyReleaseCacheLock($lock);
    fotoProxySendImage(
        $sharedState['data'],
        $sharedState['image'],
        $file,
        'HIT',
        $method
    );
}
if ($sharedState['state'] === 'negative') {
    fotoProxyReleaseCacheLock($lock);
    fotoProxyError(404);
}

if (!function_exists('curl_init')) {
    fotoProxyReleaseCacheLock($lock);
    fotoProxyError(503, 'Service unavailable');
}
if (!fotoProxyConsumeMissBudget($sharedCache['dir'])) {
    fotoProxyReleaseCacheLock($lock);
    fotoProxyBusy();
}
$downloadSlot = fotoProxyAcquireDownloadSlot($sharedCache['dir']);
if ($downloadSlot === null) {
    fotoProxyReleaseCacheLock($lock);
    fotoProxyBusy();
}

$encodedFile = rawurlencode($file);
$sources = [
    'https://foto.asari.pl/' . $encodedFile,
    'https://foto.asari.pl/foto/' . $encodedFile,
    'https://cdn.asari.pl/foto/' . $encodedFile,
    'https://k2.asari.pro/foto/' . $encodedFile,
];

$downloadDeadline = microtime(true) + (FOTO_PROXY_REQUEST_BUDGET_MS / 1000);
foreach ($sources as $source) {
    $remainingMs = (int) floor(($downloadDeadline - microtime(true)) * 1000);
    if ($remainingMs < 250) {
        break;
    }
    $data = fotoProxyDownload(
        $source,
        min(FOTO_PROXY_TOTAL_TIMEOUT_MS, $remainingMs)
    );
    if ($data === null) {
        continue;
    }
    $image = fotoProxyInspectImage($data, $expectedMime);
    if ($image === null) {
        continue;
    }

    // Publiczny request nigdy nie zapisuje do tenantowego crm-import. Cache
    // jest prywatny, ograniczony do stałej liczby slotów i związany z hashem f.
    fotoProxyWriteSharedImage($sharedCache, $data);
    fotoProxyReleaseCacheLock($downloadSlot);
    fotoProxyReleaseCacheLock($lock);
    fotoProxySendImage($data, $image, $file, 'MISS', $method);
}

fotoProxyWriteNegativeCache($sharedCache);
fotoProxyReleaseCacheLock($downloadSlot);
fotoProxyReleaseCacheLock($lock);
fotoProxyError(404);
