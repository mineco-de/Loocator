<?php
// overpass.php - Serverseitiger Proxy + Dateicache für die Toiletten-Abfrage (Overpass API).
//
// Warum: Der Browser konnte die öffentlichen Overpass-Mirrors nur mit 10 s Timeout und ohne
// eigenen User-Agent abfragen; der schnellste Mirror (overpass.openstreetmap.fr) sendet zudem
// keine CORS-Header. Hier läuft die Abfrage serverseitig (längere Timeouts, Mirror-Fallback,
// identifizierbarer User-Agent) und das Ergebnis wird pro Kachel für alle Besucher gecacht.
//
// GET overpass.php?s=<lat>&w=<lon>&n=<lat>&e=<lon>
//   -> { "elements": [...], "stale": bool }   (gleiches Format wie Overpass "out center")
require_once __DIR__ . '/db.php';

header('Content-Type: application/json');
header('Cache-Control: public, max-age=300');

// --- Konfiguration ----------------------------------------------------------
const TILE_SIZE_STEPS   = 20;          // Kacheln von 1/20 Grad (0,05° = ca. 5,5 x 3,6 km)
// Größter erlaubter Kartenausschnitt: entspricht dem Mindest-Zoom 12 der App auf breiten Desktop-Fenstern.
const MAX_SPAN_LAT      = 0.6;
const MAX_SPAN_LON      = 1.0;
const MAX_TILES         = 120;
const FRESH_TTL         = 86400;       // 24 h: Kachel gilt als frisch
const EMPTY_TTL         = 21600;       // 6 h: leere Kacheln (z. B. Land) früher erneuern
const STALE_MAX_AGE     = 2592000;     // 30 Tage: so alte Daten liefern wir notfalls noch aus
const MIRROR_TIMEOUT    = 20;          // Sekunden je Mirror
const TOTAL_BUDGET      = 40;          // Sekunden für alle Mirrors zusammen (php.ini: 30 s Standard)
const UPSTREAM_SLOTS    = 2;           // max. gleichzeitige Overpass-Abfragen (pm.max_children = 5!)
const SLOT_WAIT         = 15;          // Sekunden auf einen freien Slot / Kachel-Lock warten
const USER_AGENT        = 'Loocator/1.0 (https://loocator.org; info@mineco.de)';
const DEFAULT_MIRRORS   = [
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];

function op_fail(int $status, string $error): void {
    http_response_code($status);
    header('Cache-Control: no-store');
    echo json_encode(['error' => $error]);
    exit;
}

function op_cache_dir(): string {
    $dir = getenv('LOOCATOR_CACHE_DIR') ?: (__DIR__ . '/cache/overpass');
    if (!is_dir($dir . '/locks')) {
        @mkdir($dir . '/locks', 0770, true);
        // Cache-Verzeichnis nie direkt ausliefern (falls es unterhalb des DocumentRoot liegt).
        @file_put_contents(dirname($dir) . '/.htaccess', "Require all denied\n");
    }
    return $dir;
}

function op_tile_path(string $dir, int $ix, int $iy): string {
    return "$dir/{$ix}_{$iy}.json";
}

/** Liest eine Kachel. Rückgabe: null = nicht vorhanden/zu alt, sonst ['elements'=>[], 'fresh'=>bool]. */
function op_read_tile(string $dir, int $ix, int $iy): ?array {
    $path = op_tile_path($dir, $ix, $iy);
    $mtime = @filemtime($path);
    if ($mtime === false) return null;
    $age = time() - $mtime;
    if ($age > STALE_MAX_AGE) return null;
    $raw = @file_get_contents($path);
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !isset($data['elements']) || !is_array($data['elements'])) return null;
    $ttl = count($data['elements']) === 0 ? EMPTY_TTL : FRESH_TTL;
    return ['elements' => $data['elements'], 'fresh' => $age <= $ttl];
}

function op_write_tile(string $dir, int $ix, int $iy, array $elements): void {
    $path = op_tile_path($dir, $ix, $iy);
    $tmp = $path . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, json_encode(['elements' => $elements])) !== false) {
        @rename($tmp, $path); // atomar: Leser sehen nie eine halb geschriebene Datei
    } else {
        @unlink($tmp);
    }
}

function op_element_center(array $el): ?array {
    if (isset($el['lat'], $el['lon'])) return [(float)$el['lat'], (float)$el['lon']];
    if (isset($el['center']['lat'], $el['center']['lon'])) return [(float)$el['center']['lat'], (float)$el['center']['lon']];
    return null;
}

function op_build_query(float $s, float $w, float $n, float $e): string {
    $b = "$s,$w,$n,$e";
    // Gleiche Abfrage wie bisher in app.js (fetchToilets), nur mit größerem Rechteck.
    return "[out:json][timeout:25];(nwr[\"amenity\"=\"toilets\"]($b);nwr[\"toilets\"=\"yes\"]($b);"
         . "nwr[\"toilets:eurokey\"=\"yes\"]($b);nwr[\"toilets:wheelchair\"=\"yes\"]($b);"
         . "nwr[\"toilets:wheelchair\"=\"designated\"]($b););out center;";
}

/** Fragt die Mirrors der Reihe nach ab. Gibt die Elemente zurück oder null, wenn alle scheitern. */
function op_query_upstream(string $query): ?array {
    $mirrors = getenv('LOOCATOR_OVERPASS_MIRRORS');
    $mirrors = $mirrors ? array_filter(array_map('trim', explode(',', $mirrors))) : DEFAULT_MIRRORS;
    $deadline = microtime(true) + TOTAL_BUDGET;
    $emptyResult = null; // gültige, aber leere Antwort (nur verwenden, wenn kein Mirror Daten liefert)

    foreach ($mirrors as $url) {
        $left = $deadline - microtime(true);
        if ($left < 5) break;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query(['data' => $query]),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => (int)min(MIRROR_TIMEOUT, $left),
            CURLOPT_USERAGENT => USER_AGENT,
            CURLOPT_HTTPHEADER => ['Accept: */*'],
            CURLOPT_ENCODING => '', // gzip/deflate aushandeln
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($body === false || $code !== 200) continue;
        $data = json_decode($body, true);
        if (!is_array($data) || !isset($data['elements']) || !is_array($data['elements'])) continue;
        // Overpass meldet Timeouts/Speichermangel mit HTTP 200 und einem "remark" (leeres oder
        // teilweises Ergebnis). Das ist ein Fehler und darf nicht gecacht werden.
        if (!empty($data['remark'])) continue;
        // Ein leeres Ergebnis kann ein überlasteter/regional beschränkter Mirror sein (das war
        // schon in app.js so gedacht): erst den nächsten Mirror fragen, leer nur akzeptieren,
        // wenn auch der zustimmt oder keiner mehr übrig ist.
        if (count($data['elements']) === 0) {
            $emptyResult = $data['elements'];
            continue;
        }
        return $data['elements'];
    }
    return $emptyResult;
}

/** Wartet auf einen der UPSTREAM_SLOTS. Rückgabe: Datei-Handle (Lock gehalten) oder null. */
function op_acquire_slot(string $dir) {
    $until = microtime(true) + SLOT_WAIT;
    do {
        for ($i = 0; $i < UPSTREAM_SLOTS; $i++) {
            $fh = fopen("$dir/locks/slot$i.lock", 'c');
            if ($fh && flock($fh, LOCK_EX | LOCK_NB)) return $fh;
            if ($fh) fclose($fh);
        }
        usleep(200000);
    } while (microtime(true) < $until);
    return null;
}

/**
 * Holt die angegebenen Kacheln mit EINER Overpass-Abfrage (Rechteck um alle Kacheln) und
 * schreibt jede Kachel einzeln in den Cache. $tiles = [[ix, iy], ...]. Rückgabe: true bei Erfolg.
 */
function op_fetch_tiles(string $dir, array $tiles, bool $wait): bool {
    usort($tiles, fn($a, $b) => [$a[0], $a[1]] <=> [$b[0], $b[1]]); // feste Reihenfolge gegen Deadlocks

    // Kachel-Locks: Gleichzeitige Besucher teilen sich die Abfrage (kein Dogpile).
    $locks = [];
    $until = microtime(true) + ($wait ? SLOT_WAIT : 0); // gemeinsame Wartezeit für alle Kachel-Locks
    foreach ($tiles as [$ix, $iy]) {
        $fh = fopen("$dir/locks/{$ix}_{$iy}.lock", 'c');
        $got = false;
        if ($fh) {
            do {
                $got = flock($fh, LOCK_EX | LOCK_NB);
                if (!$got && $wait) usleep(200000);
            } while (!$got && microtime(true) < $until);
        }
        if (!$got) { // Jemand anderes holt diese Kachel gerade: nach dessen Ende Cache prüfen
            if ($fh) fclose($fh);
            foreach ($locks as $l) { flock($l, LOCK_UN); fclose($l); }
            return $wait ? op_all_fresh($dir, $tiles) : false;
        }
        $locks[] = $fh;
    }

    try {
        // Nach dem Lock erneut prüfen: Vielleicht hat ein anderer Request die Kacheln schon geholt.
        $todo = array_values(array_filter($tiles, fn($t) => !(op_read_tile($dir, $t[0], $t[1])['fresh'] ?? false)));
        if (!$todo) return true;

        $slot = op_acquire_slot($dir);
        if (!$slot) return false;
        try {
            $s = min(array_map(fn($t) => $t[1], $todo)) / TILE_SIZE_STEPS;
            $w = min(array_map(fn($t) => $t[0], $todo)) / TILE_SIZE_STEPS;
            $n = (max(array_map(fn($t) => $t[1], $todo)) + 1) / TILE_SIZE_STEPS;
            $e = (max(array_map(fn($t) => $t[0], $todo)) + 1) / TILE_SIZE_STEPS;
            $elements = op_query_upstream(op_build_query($s, $w, $n, $e));
        } finally {
            flock($slot, LOCK_UN); fclose($slot);
        }
        if ($elements === null) return false;

        // Elemente den Kacheln zuordnen (anhand des Mittelpunkts, damit nichts doppelt vorkommt).
        $byTile = [];
        foreach ($todo as [$ix, $iy]) $byTile["{$ix}_{$iy}"] = [];
        foreach ($elements as $el) {
            $c = op_element_center($el);
            if (!$c) continue;
            $key = ((int)floor($c[1] * TILE_SIZE_STEPS)) . '_' . ((int)floor($c[0] * TILE_SIZE_STEPS));
            if (isset($byTile[$key])) $byTile[$key][] = $el;
        }
        foreach ($todo as [$ix, $iy]) op_write_tile($dir, $ix, $iy, $byTile["{$ix}_{$iy}"]);
        return true;
    } finally {
        foreach ($locks as $l) { flock($l, LOCK_UN); fclose($l); }
    }
}

function op_all_fresh(string $dir, array $tiles): bool {
    foreach ($tiles as [$ix, $iy]) {
        if (!(op_read_tile($dir, $ix, $iy)['fresh'] ?? false)) return false;
    }
    return true;
}

// warmcache.php bindet diese Datei nur wegen der Funktionen ein und bearbeitet keine Web-Anfrage.
if (defined('LOOCATOR_OVERPASS_LIB')) return;

// --- Anfrage validieren -------------------------------------------------------
$params = [];
foreach (['s', 'w', 'n', 'e'] as $k) {
    if (!isset($_GET[$k]) || !is_numeric($_GET[$k])) op_fail(400, 'Invalid bounds');
    $params[$k] = (float)$_GET[$k];
}
['s' => $s, 'w' => $w, 'n' => $n, 'e' => $e] = $params;
if ($s < -90 || $n > 90 || $w < -180 || $e > 180 || $s >= $n || $w >= $e
    || ($n - $s) > MAX_SPAN_LAT || ($e - $w) > MAX_SPAN_LON) {
    op_fail(400, 'Invalid bounds');
}

$tiles = [];
for ($iy = (int)floor($s * TILE_SIZE_STEPS); $iy <= (int)floor($n * TILE_SIZE_STEPS); $iy++) {
    for ($ix = (int)floor($w * TILE_SIZE_STEPS); $ix <= (int)floor($e * TILE_SIZE_STEPS); $ix++) {
        $tiles[] = [$ix, $iy];
    }
}
if (count($tiles) > MAX_TILES) op_fail(400, 'Area too large');

try {
    if (!loocator_rate_limit('overpass', 60, 60)) op_fail(429, 'Too many requests, please try again later');
} catch (Exception $ex) {
    // Rate-Limit-Datenbank nicht erreichbar: lieber ausliefern als die Karte zu blockieren.
}

set_time_limit(TOTAL_BUDGET + 15);
$dir = op_cache_dir();

// --- Kacheln sammeln ------------------------------------------------------------
$loaded = [];      // "ix_iy" => elements
$missing = [];     // gar kein (brauchbarer) Cache
$refresh = [];     // veraltet: sofort ausliefern, danach im Hintergrund erneuern
foreach ($tiles as [$ix, $iy]) {
    $tile = op_read_tile($dir, $ix, $iy);
    if ($tile === null) {
        $missing[] = [$ix, $iy];
    } else {
        $loaded["{$ix}_{$iy}"] = $tile['elements'];
        if (!$tile['fresh']) $refresh[] = [$ix, $iy];
    }
}

if ($missing) {
    // Kaltabrufe belegen einen der wenigen PHP-Worker (pm.max_children = 5) bis zu ~1 min:
    // pro IP begrenzen, damit wenige Clients mit wechselnden Ausschnitten nicht die Abstimmung blockieren.
    try {
        if (!loocator_rate_limit('overpass_cold', 10, 600)) op_fail(429, 'Too many requests, please try again later');
    } catch (Exception $ex) { /* siehe oben */ }
    if (!op_fetch_tiles($dir, $missing, true)) op_fail(503, 'Toilet data temporarily unavailable');
    foreach ($missing as [$ix, $iy]) {
        $tile = op_read_tile($dir, $ix, $iy);
        if ($tile === null) op_fail(503, 'Toilet data temporarily unavailable');
        $loaded["{$ix}_{$iy}"] = $tile['elements'];
    }
}

// --- Antwort: nur Elemente im angefragten Ausschnitt (kleiner Rand gegen Kanten-Flackern) ------
$margin = 0.003;
$out = [];
foreach ($loaded as $elements) {
    foreach ($elements as $el) {
        $c = op_element_center($el);
        if ($c && $c[0] >= $s - $margin && $c[0] <= $n + $margin && $c[1] >= $w - $margin && $c[1] <= $e + $margin) {
            $out[] = $el;
        }
    }
}

echo json_encode(['elements' => $out, 'stale' => count($refresh) > 0]);

// --- Veraltete Kacheln nach der Antwort erneuern (Besucher wartet nicht darauf) -------------
if ($refresh) {
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    try { op_fetch_tiles($dir, $refresh, false); } catch (Throwable $ex) { /* nächster Besucher versucht es erneut */ }
}
