<?php
// Gemeinsame DB-Verbindung + Rate-Limiting-Helfer für backend.php, counter.php,
// ha-stats.php und cleanup.php. Vorher hatte jede Datei ihre eigene Kopie der
// Verbindungs-/Tabellen-Erzeugungslogik.

function loocator_db(): PDO {
    static $db = null;
    if ($db === null) {
        $dbFile = __DIR__ . '/loocator.sqlite';
        $db = new PDO('sqlite:' . $dbFile);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $db->exec("CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            osm_id TEXT,
            usable_vote TEXT,
            cleanliness_vote INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )");

        // Migration für bestehende Datenbanken (CREATE TABLE IF NOT EXISTS ändert keine vorhandene Tabelle):
        // source = 'near' (Vor-Ort-Stimme) oder 'followup' (Stimme nach der Nachfrage "Hast du diese Toilette aufgesucht?").
        $voteColumns = $db->query("PRAGMA table_info(votes)")->fetchAll(PDO::FETCH_COLUMN, 1);
        if (!in_array('source', $voteColumns, true)) {
            try {
                $db->exec("ALTER TABLE votes ADD COLUMN source TEXT DEFAULT 'near'");
            } catch (PDOException $e) {
                // Ein paralleler Request war schneller ("duplicate column name"): dann ist alles in Ordnung.
                if (stripos($e->getMessage(), 'duplicate column') === false) throw $e;
            }
        }

        $db->exec("CREATE TABLE IF NOT EXISTS rate_limits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            action TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )");
        $db->exec("CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits (ip, action, created_at)");
    }
    return $db;
}

function loocator_client_ip(): string {
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

/**
 * Pseudonymisiert eine IP für die Rate-Limit-Tabelle: HMAC-SHA256 mit einem serverseitigen Schlüssel
 * (rate_limit.key, wird beim ersten Aufruf zufällig erzeugt, ist per .htaccess gesperrt), gekürzt auf 16 Hex-Zeichen.
 * Damit stehen in der Datenbank nie Klartext-IPs; für die Begrenzung pro Client reicht der Hash.
 */
function loocator_ip_hash(string $ip): string {
    static $key = null;
    if ($key === null) {
        $file = getenv('LOOCATOR_KEY_FILE') ?: (__DIR__ . '/rate_limit.key');
        $key = @file_get_contents($file);
        if ($key === false || strlen($key) < 32) {
            // 'x' = nur anlegen, wenn es die Datei noch nicht gibt (kein Überschreiben bei parallelen Requests)
            $fh = @fopen($file, 'x');
            if ($fh) {
                fwrite($fh, bin2hex(random_bytes(32)));
                fclose($fh);
                @chmod($file, 0600);
            }
            $key = @file_get_contents($file);
            if ($key === false || strlen($key) < 32) $key = hash('sha256', __FILE__ . php_uname()); // Notnagel: Schlüsseldatei nicht schreibbar
        }
    }
    return substr(hash_hmac('sha256', $ip, $key), 0, 16);
}

/**
 * Erlaubt maximal $maxRequests Aufrufe von $action pro IP innerhalb von
 * $windowSeconds. Gibt false zurück, wenn das Limit bereits erreicht ist.
 */
function loocator_rate_limit(string $action, int $maxRequests, int $windowSeconds): bool {
    $db = loocator_db();
    $ip = loocator_ip_hash(loocator_client_ip());

    $stmt = $db->prepare("SELECT COUNT(*) FROM rate_limits WHERE ip = ? AND action = ? AND created_at >= datetime('now', ?)");
    $stmt->execute([$ip, $action, "-{$windowSeconds} seconds"]);
    $count = (int)$stmt->fetchColumn();

    if ($count >= $maxRequests) {
        return false;
    }

    $insert = $db->prepare("INSERT INTO rate_limits (ip, action) VALUES (?, ?)");
    $insert->execute([$ip, $action]);
    return true;
}
