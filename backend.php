<?php
// backend.php - Votes lesen/schreiben, mit Datum & Selbstheilung (90 Tage)
require_once __DIR__ . '/db.php';

header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");

try {
    $db = loocator_db();
    $method = $_SERVER['REQUEST_METHOD'];

    // --- GET: App fragt Daten ab ---
    if ($method === 'GET') {
        // MAGIE: Wir holen nur Stimmen aus der Datenbank, die jünger als 90 Tage sind! (Selbstheilung)
        $stmt = $db->query("SELECT osm_id, usable_vote, cleanliness_vote FROM votes WHERE created_at >= datetime('now', '-90 days')");
        $allVotes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Rechnet die Einzel-Votes in fertige Summen um, wie die App es erwartet
        $result = [];
        foreach ($allVotes as $vote) {
            $id = $vote['osm_id'];
            if (!isset($result[$id])) {
                $result[$id] = [
                    'usable_yes' => 0,
                    'usable_no' => 0,
                    'cleanliness_sum' => 0,
                    'cleanliness_count' => 0
                ];
            }

            if ($vote['usable_vote'] === 'yes') $result[$id]['usable_yes'] += 1;
            if ($vote['usable_vote'] === 'no') $result[$id]['usable_no'] += 1;

            if ($vote['cleanliness_vote'] !== null) {
                $result[$id]['cleanliness_sum'] += (int)$vote['cleanliness_vote'];
                $result[$id]['cleanliness_count'] += 1;
            }
        }

        // Wenn '?all=1' angefragt wird, senden wir ALLES zurück (für die Karte beim Start)
        if (isset($_GET['all'])) {
            echo json_encode($result);
            exit;
        }

        // Wenn nur ein einzelnes WC angefragt wird
        $id = $_GET['id'] ?? '';
        if ($id && isset($result[$id])) {
            $result[$id]['osm_id'] = $id; // Die App erwartet diese ID manchmal explizit nochmal im Array
            echo json_encode($result[$id]);
        } else {
            echo json_encode(['osm_id' => $id, 'usable_yes' => 0, 'usable_no' => 0, 'cleanliness_sum' => 0, 'cleanliness_count' => 0]);
        }
        exit;
    }

    // --- POST: Jemand stimmt ab ---
    elseif ($method === 'POST') {
        // Max. 20 Stimmen pro IP und 15 Minuten - schützt vor Skript-Spam auf einzelne WCs
        if (!loocator_rate_limit('vote', 20, 15 * 60)) {
            http_response_code(429);
            die(json_encode(['error' => 'Too many votes, please try again later']));
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? '';
        $usable = $data['usable'] ?? null;
        $cleanliness = isset($data['cleanliness']) ? (int)$data['cleanliness'] : null;

        if (!$id) die(json_encode(['error' => 'No ID']));

        // Herkunft der Stimme: nur bekannte Werte, sonst wie bisher 'near'
        $source = ($data['source'] ?? 'near') === 'followup' ? 'followup' : 'near';

        // Validierung - nur erlaubte Werte akzeptieren
        if ($usable !== null && !in_array($usable, ['yes', 'no'], true)) {
            $usable = null;
        }
        if ($cleanliness !== null && ($cleanliness < 1 || $cleanliness > 5)) {
            $cleanliness = null;
        }
        // Wenn nach der Prüfung nichts Sinnvolles übrig bleibt, abbrechen
        if ($usable === null && $cleanliness === null) {
            http_response_code(400);
            die(json_encode(['error' => 'Invalid vote data']));
        }

        $stmt = $db->prepare("INSERT INTO votes (osm_id, usable_vote, cleanliness_vote, source) VALUES (?, ?, ?, ?)");
        $stmt->execute([$id, $usable, $cleanliness, $source]);

        echo json_encode(['status' => 'success']);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
