// Integrationstests für overpass.php (Proxy + Kachel-Cache) und die Herkunft `source` der Stimmen in backend.php.
// Starten je Test einen eigenen PHP-Entwicklungsserver mit frischem Temp-Verzeichnis (eigene SQLite-DB und
// eigener Cache) gegen einen Node-Mock als "Overpass". Ohne installiertes `php` werden die Tests übersprungen.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HAS_PHP = spawnSync('php', ['-v']).status === 0;
const skip = HAS_PHP ? false : 'php nicht installiert';

// Ausschnitt innerhalb genau einer 0,05°-Kachel (Spalte 168, Zeile 980)
const BBOX = 's=49.005&w=8.405&n=49.02&e=8.42';
const INSIDE = { type: 'node', id: 1, lat: 49.01, lon: 8.41, tags: { amenity: 'toilets' } };
const OUTSIDE = { type: 'node', id: 2, lat: 49.0001, lon: 8.4001, tags: { amenity: 'toilets' } }; // gleiche Kachel, aber außerhalb des Ausschnitts

function freePort() {
    return new Promise((resolve) => {
        const srv = net.createServer().listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

/** Mock-Overpass: `handlers` ist eine Liste von Funktionen je Mirror-Pfad (/m0, /m1, ...). */
async function startMock(handlers) {
    const hits = handlers.map(() => 0);
    const userAgents = [];
    const server = http.createServer((req, res) => {
        const i = Number(req.url.replace('/m', ''));
        hits[i]++;
        userAgents.push(req.headers['user-agent']);
        req.resume();
        req.on('end', () => handlers[i](res));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    return {
        mirrors: handlers.map((_, i) => `http://127.0.0.1:${port}/m${i}`).join(','),
        hits,
        userAgents,
        close: () => server.close(),
    };
}

const ok = (elements, extra = {}) => (res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ elements, ...extra }));
};
const fail = (status = 500) => (res) => { res.statusCode = status; res.end('nope'); };

async function startPhp(mirrors) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loocator-php-'));
    for (const f of ['overpass.php', 'db.php', 'backend.php', 'warmcache.php']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    const port = await freePort();
    const proc = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', dir], {
        env: {
            ...process.env,
            PHP_CLI_SERVER_WORKERS: '4',
            LOOCATOR_CACHE_DIR: path.join(dir, 'cache', 'overpass'),
            LOOCATOR_OVERPASS_MIRRORS: mirrors,
        },
        stdio: 'ignore',
    });
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) {
        try { await fetch(`${base}/overpass.php`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
    }
    return {
        base,
        dir,
        env: {
            ...process.env,
            LOOCATOR_CACHE_DIR: path.join(dir, 'cache', 'overpass'),
            LOOCATOR_OVERPASS_MIRRORS: mirrors,
        },
        get: async (query) => {
            const res = await fetch(`${base}/overpass.php?${query}`);
            return { status: res.status, body: await res.json() };
        },
        stop: () => { proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); },
    };
}

async function withEnv(handlers, fn) {
    const mock = await startMock(handlers);
    const php = await startPhp(mock.mirrors);
    try { await fn(php, mock); } finally { php.stop(); mock.close(); }
}

const ids = (body) => body.elements.map((e) => e.id).sort();
const tileFile = (php) => path.join(php.dir, 'cache', 'overpass', '168_980.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('overpass.php: ungültige Parameter -> 400', { skip }, async () => {
    await withEnv([ok([INSIDE])], async (php) => {
        for (const q of [
            '', 's=1&w=2&n=3',                          // fehlt
            's=abc&w=8&n=49&e=9',                       // keine Zahl
            'inc=1&s=49.02&w=8.405&n=49.005&e=8.42',    // s >= n
            's=48&w=8&n=49&e=9',                        // Höhe > 0,6°
            's=49&w=8&n=49.1&e=9.5',                    // Breite > 1°
            's=-95&w=8&n=-94&e=9',                      // außerhalb der Erde
        ]) {
            const r = await php.get(q);
            assert.equal(r.status, 400, q);
            assert.ok(r.body.error);
        }
    });
});

test('overpass.php: Kaltabruf filtert auf den Ausschnitt, zweiter Abruf kommt aus dem Cache', { skip }, async () => {
    await withEnv([ok([INSIDE, OUTSIDE])], async (php, mock) => {
        const first = await php.get(BBOX);
        assert.equal(first.status, 200);
        assert.deepEqual(ids(first.body), [1]);      // OUTSIDE wird nicht ausgeliefert
        assert.equal(first.body.stale, false);
        assert.equal(mock.hits[0], 1);
        assert.match(mock.userAgents[0], /Loocator/); // identifizierbarer User-Agent

        const second = await php.get(BBOX);
        assert.deepEqual(ids(second.body), [1]);
        assert.equal(mock.hits[0], 1);                // kein weiterer Upstream-Abruf
        assert.ok(fs.existsSync(path.join(php.dir, 'cache', '.htaccess')), 'Cache-Ordner ist per .htaccess gesperrt');
    });
});

test('overpass.php: fällt auf den nächsten Mirror zurück', { skip }, async () => {
    await withEnv([fail(504), ok([INSIDE])], async (php, mock) => {
        const r = await php.get(BBOX);
        assert.equal(r.status, 200);
        assert.deepEqual(ids(r.body), [1]);
        assert.deepEqual(mock.hits, [1, 1]);
    });
});

test('overpass.php: Overpass-"remark" (Timeout mit HTTP 200) ist ein Fehler und wird nicht gecacht', { skip }, async () => {
    let broken = true;
    const flaky = (res) => (broken ? ok([INSIDE], { remark: 'runtime error: Query timed out' })(res) : ok([INSIDE])(res));
    await withEnv([flaky], async (php, mock) => {
        const failed = await php.get(BBOX);
        assert.equal(failed.status, 503);
        assert.ok(!fs.existsSync(tileFile(php)), 'kaputte Antwort nicht gespeichert');

        broken = false;
        const healed = await php.get(BBOX);
        assert.equal(healed.status, 200);
        assert.deepEqual(ids(healed.body), [1]);
    });
});

test('overpass.php: leeres Ergebnis braucht Bestätigung durch einen zweiten Mirror', { skip }, async () => {
    await withEnv([ok([]), ok([INSIDE])], async (php, mock) => {
        const r = await php.get(BBOX);
        assert.deepEqual(ids(r.body), [1]);           // der erste Mirror war "leer", der zweite liefert Daten
        assert.deepEqual(mock.hits, [1, 1]);
    });
    await withEnv([ok([]), ok([])], async (php) => {
        const r = await php.get(BBOX);
        assert.equal(r.status, 200);                  // beide leer: gilt als wirklich leer
        assert.deepEqual(r.body.elements, []);
    });
});

test('overpass.php: alle Mirrors down und kein Cache -> 503', { skip }, async () => {
    await withEnv([fail(500), fail(429)], async (php) => {
        const r = await php.get(BBOX);
        assert.equal(r.status, 503);
        assert.ok(r.body.error);
    });
});

test('overpass.php: veralteter Cache wird sofort geliefert (stale) und danach erneuert', { skip }, async () => {
    let elements = [INSIDE];
    await withEnv([(res) => ok(elements)(res)], async (php, mock) => {
        await php.get(BBOX);
        assert.equal(mock.hits[0], 1);

        const old = new Date(Date.now() - 2 * 86400 * 1000);   // > 24 h, < 30 Tage
        fs.utimesSync(tileFile(php), old, old);
        elements = [INSIDE, { ...INSIDE, id: 3, lat: 49.011 }];

        const stale = await php.get(BBOX);
        assert.equal(stale.status, 200);
        assert.equal(stale.body.stale, true);
        assert.deepEqual(ids(stale.body), [1]);                 // noch die alten Daten

        for (let i = 0; i < 30 && mock.hits[0] < 2; i++) await sleep(100);
        assert.equal(mock.hits[0], 2, 'Hintergrund-Erneuerung hat Overpass gefragt');

        const fresh = await php.get(BBOX);
        assert.equal(fresh.body.stale, false);
        assert.deepEqual(ids(fresh.body), [1, 3]);
    });
});

test('overpass.php: Mirrors down, aber alter Cache vorhanden -> alte Daten statt Fehler', { skip }, async () => {
    let down = false;
    await withEnv([(res) => (down ? fail(500)(res) : ok([INSIDE])(res))], async (php) => {
        await php.get(BBOX);
        const old = new Date(Date.now() - 3 * 86400 * 1000);
        fs.utimesSync(tileFile(php), old, old);
        down = true;
        const r = await php.get(BBOX);
        assert.equal(r.status, 200);
        assert.equal(r.body.stale, true);
        assert.deepEqual(ids(r.body), [1]);
    });
});

test('overpass.php: Kaltabrufe sind pro IP begrenzt (429)', { skip }, async () => {
    await withEnv([ok([INSIDE])], async (php) => {
        const statuses = [];
        for (let i = 0; i < 11; i++) {
            const lon = 8.4 + i * 0.05;                  // jede Anfrage eine neue Kachel
            statuses.push((await php.get(`s=49.005&w=${lon + 0.005}&n=49.02&e=${lon + 0.02}`)).status);
        }
        assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
        assert.equal(statuses[10], 429);
    });
});

// --- backend.php: Herkunft der Stimme (`source`) ---------------------------------------------------

async function vote(php, payload) {
    const res = await fetch(`${php.base}/backend.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'node/1', ...payload }),
    });
    return res.status;
}

function sources(php) {
    const script = "$d=new PDO('sqlite:'.$argv[1]);echo json_encode($d->query('SELECT source FROM votes ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));";
    const out = spawnSync('php', ['-r', script, path.join(php.dir, 'loocator.sqlite')], { encoding: 'utf8' });
    return JSON.parse(out.stdout);
}

test('backend.php: source wird gespeichert, Unbekanntes wird zu "near"', { skip }, async () => {
    await withEnv([ok([])], async (php) => {
        assert.equal(await vote(php, { usable: 'yes', source: 'followup' }), 200);
        assert.equal(await vote(php, { usable: 'yes', source: 'near' }), 200);
        assert.equal(await vote(php, { usable: 'yes' }), 200);                       // alter Client ohne Feld
        assert.equal(await vote(php, { usable: 'yes', source: "x'; DROP TABLE votes;--" }), 200);
        assert.deepEqual(sources(php), ['followup', 'near', 'near', 'near']);
    });
});

// --- warmcache.php: Vorwärmen der Städte-Kacheln (CLI) ------------------------------------------------

function runWarm(php, args) {
    return new Promise((resolve) => {
        const proc = spawn('php', ['warmcache.php', ...args], { cwd: php.dir, env: php.env });
        let out = '';
        proc.stdout.on('data', (d) => { out += d; });
        proc.on('close', (code) => resolve({ code, out }));
    });
}
const cachedTiles = (php) => fs.readdirSync(path.join(php.dir, 'cache', 'overpass')).filter((f) => f.endsWith('.json'));

test('warmcache.php: holt die Kacheln einer Stadt mit einer Abfrage und lässt frische in Ruhe', { skip }, async () => {
    const node = { type: 'node', id: 7, lat: 49.007, lon: 8.404, tags: { amenity: 'toilets' } };
    await withEnv([ok([node])], async (php, mock) => {
        const dry = await runWarm(php, ['--dry-run', '--only=Karlsruhe']);
        assert.equal(dry.code, 0);
        assert.match(dry.out, /Karlsruhe\s+\d+ Kacheln würden geholt/);
        assert.equal(mock.hits[0], 0, 'Trockenlauf fragt Overpass nicht');

        const first = await runWarm(php, ['--only=Karlsruhe', '--sleep=0']);
        assert.equal(first.code, 0);
        assert.match(first.out, /1 Städte geholt/);
        assert.equal(mock.hits[0], 1, 'eine Abfrage für die ganze Stadt');
        const files = cachedTiles(php);
        assert.ok(files.length >= 10, 'viele Kacheln geschrieben: ' + files.length);

        const second = await runWarm(php, ['--only=Karlsruhe', '--sleep=0']);
        assert.match(second.out, /alle Kacheln frisch/);
        assert.equal(mock.hits[0], 1, 'frische Kacheln werden nicht erneut geholt');

        // Ein Besucher bekommt die Toilette jetzt aus dem Cache, ohne dass Overpass gefragt wird.
        const r = await php.get('s=48.99&w=8.39&n=49.02&e=8.42');
        assert.equal(r.status, 200);
        assert.deepEqual(ids(r.body), [7]);
        assert.equal(mock.hits[0], 1);
    });
});

test('warmcache.php: Mirror-Ausfall wird gemeldet (Exit 1), nichts wird gecacht', { skip }, async () => {
    await withEnv([fail(500)], async (php) => {
        const r = await runWarm(php, ['--only=Karlsruhe', '--sleep=0']);
        assert.equal(r.code, 1);
        assert.match(r.out, /FEHLGESCHLAGEN/);
        assert.equal(cachedTiles(php).length, 0);
    });
});

test('warmcache.php: per HTTP nicht aufrufbar (403)', { skip }, async () => {
    await withEnv([ok([])], async (php) => {
        const res = await fetch(`${php.base}/warmcache.php`);
        assert.equal(res.status, 403);
    });
});
