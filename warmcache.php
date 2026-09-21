<?php
// warmcache.php - wärmt den Kachel-Cache von overpass.php für die größten Städte vor (nur per CLI/Cron).
//
// Warum: Die erste Abfrage einer Kachel dauert je nach Overpass-Mirror 3-20 s. Läuft dieses Skript nachts,
// wartet in diesen Städten tagsüber kein Besucher mehr auf eine kalte Abfrage.
//
//   php warmcache.php [--dry-run] [--only=Karlsruhe,Berlin] [--sleep=20]
//
// Nutzt dieselben Funktionen, Sperren (Upstream-Slots, Kachel-Locks) und Mirrors wie overpass.php, aber
// ohne die Web-Rate-Limits. Pro Stadt eine Overpass-Abfrage, dazwischen Pause, damit die Mirrors geschont werden.
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }

define('LOOCATOR_OVERPASS_LIB', true);
require __DIR__ . '/overpass.php';

// Mittelpunkte (lat, lon). Gewärmt wird ein Ausschnitt von etwa 17 x 17 km um die Mitte,
// das entspricht dem, was Besucher beim Öffnen und Verschieben der Karte typischerweise sehen.
const WARM_HALF_LAT = 0.075;
const WARM_HALF_LON = 0.11;
const WARM_CITIES = [
    'Berlin' => [52.520, 13.405], 'Hamburg' => [53.551, 9.994], 'München' => [48.137, 11.575],
    'Köln' => [50.938, 6.960], 'Frankfurt' => [50.110, 8.682], 'Stuttgart' => [48.775, 9.182],
    'Düsseldorf' => [51.227, 6.774], 'Leipzig' => [51.340, 12.375], 'Dortmund' => [51.514, 7.468],
    'Essen' => [51.455, 7.012], 'Bremen' => [53.079, 8.802], 'Dresden' => [51.050, 13.738],
    'Hannover' => [52.375, 9.732], 'Nürnberg' => [49.452, 11.077], 'Duisburg' => [51.435, 6.763],
    'Bochum' => [51.482, 7.216], 'Wuppertal' => [51.256, 7.150], 'Bielefeld' => [52.021, 8.533],
    'Bonn' => [50.737, 7.098], 'Münster' => [51.961, 7.626], 'Karlsruhe' => [49.007, 8.404],
    'Mannheim' => [49.489, 8.467], 'Augsburg' => [48.371, 10.898], 'Wiesbaden' => [50.083, 8.240],
    'Mönchengladbach' => [51.195, 6.440], 'Braunschweig' => [52.269, 10.521], 'Kiel' => [54.323, 10.123],
    'Freiburg' => [47.999, 7.842], 'Heidelberg' => [49.399, 8.672], 'Rheinstetten' => [48.960, 8.310],
];

$opts = getopt('', ['dry-run', 'only:', 'sleep:']);
$dryRun = isset($opts['dry-run']);
$pause = isset($opts['sleep']) ? max(0, (int)$opts['sleep']) : 20;
$only = isset($opts['only']) ? array_map('trim', explode(',', $opts['only'])) : null;

$dir = op_cache_dir();
$fetched = $skipped = $failed = 0;
$first = true;
foreach (WARM_CITIES as $name => [$lat, $lon]) {
    if ($only !== null && !in_array($name, $only, true)) continue;

    $tiles = [];
    for ($iy = (int)floor(($lat - WARM_HALF_LAT) * TILE_SIZE_STEPS); $iy <= (int)floor(($lat + WARM_HALF_LAT) * TILE_SIZE_STEPS); $iy++) {
        for ($ix = (int)floor(($lon - WARM_HALF_LON) * TILE_SIZE_STEPS); $ix <= (int)floor(($lon + WARM_HALF_LON) * TILE_SIZE_STEPS); $ix++) {
            $tile = op_read_tile($dir, $ix, $iy);
            if ($tile === null || !$tile['fresh']) $tiles[] = [$ix, $iy];
        }
    }
    if (!$tiles) { printf("%-16s alle Kacheln frisch\n", $name); $skipped++; continue; }
    if ($dryRun) { printf("%-16s %d Kacheln würden geholt\n", $name, count($tiles)); continue; }

    if (!$first && $pause > 0) sleep($pause);
    $first = false;
    $ok = op_fetch_tiles($dir, $tiles, true);
    printf("%-16s %d Kacheln %s\n", $name, count($tiles), $ok ? 'geholt' : 'FEHLGESCHLAGEN');
    $ok ? $fetched++ : $failed++;
}
printf("fertig: %d Städte geholt, %d schon frisch, %d fehlgeschlagen\n", $fetched, $skipped, $failed);
exit($failed > 0 && $fetched === 0 ? 1 : 0);
