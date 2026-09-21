// Ende-zu-Ende-Test der Nachfrage "Hast du diese Toilette aufgesucht?" im echten Browser.
// Aufruf: npm run test:e2e   (braucht Microsoft Edge oder Google Chrome; playwright-core lädt keinen Browser).
// Ohne Browser werden die Tests übersprungen. Die App wird von einem kleinen Node-Server ausgeliefert,
// Overpass und backend.php sind per Route ersetzt; nur die Karten-Bibliotheken (unpkg/jsDelivr) werden real geladen.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures.json'));
const TOILET_ID = 900001;
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

let chromium;
try { ({ chromium } = require('playwright-core')); } catch (e) { /* nicht installiert */ }

let server;
let base;
let browser;
let skip = chromium ? false : 'playwright-core nicht installiert';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };

before(async () => {
    if (skip) return;
    for (const channel of ['msedge', 'chrome']) {
        try { browser = await chromium.launch({ channel }); break; } catch (e) { /* nächster Kandidat */ }
    }
    if (!browser) { skip = 'kein Edge/Chrome gefunden'; return; }
    server = http.createServer((req, res) => {
        const rel = decodeURIComponent(req.url.split('?')[0]);
        const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end(); }
        res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/`;
});

after(async () => {
    if (browser) await browser.close();
    if (server) server.close();
});

/** Neuer Browser-Kontext wie ein Handy; Netzwerk ist komplett gemockt. */
async function newSession() {
    const context = await browser.newContext({
        viewport: { width: 393, height: 853 }, isMobile: true, hasTouch: true,
        locale: 'de-DE', colorScheme: 'light', serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const posts = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('loocator_tutorial_seen', 'true'); localStorage.setItem('loocator_lang', 'de'); } catch (e) { /* egal */ } });
    await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith(base)) {
            if (url.includes('/backend.php')) {
                if (route.request().method() === 'POST') posts.push(JSON.parse(route.request().postData()));
                return route.fulfill({ status: 200, contentType: 'application/json', body: '{"usable_yes":0,"usable_no":0,"cleanliness_sum":0,"cleanliness_count":0}' });
            }
            if (url.includes('/overpass.php')) return route.abort(); // -> App nutzt ihre Mirror-Kette
            return route.continue();
        }
        if (/overpass/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: FIXTURE });
        if (/^https:\/\/(unpkg\.com|cdn\.jsdelivr\.net)\//.test(url)) return route.continue(); // Leaflet/MapLibre kommen von den CDNs
        return route.abort(); // Kacheln, Nominatim usw. gar nicht erst laden
    });
    return { context, page, posts, errors };
}

const load = async (page) => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('.leaflet-marker-icon.google-style-pin').length > 0, null, { timeout: 15000 });
};
const modalVisible = (page) => page.evaluate(() => !document.getElementById('followup-modal').classList.contains('hidden'));
const storage = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
const voteControlsHidden = (page) => page.evaluate(() => document.getElementById('vote-controls').classList.contains('hidden'));
const openToilet = async (page) => {
    await page.evaluate(() => document.querySelector('.leaflet-marker-icon.google-style-pin').click());
    await page.waitForFunction(() => localStorage.getItem('loocator_last_opened'), null, { timeout: 5000 });
};
const ageLastOpened = (page, ms) => page.evaluate((age) => {
    const o = JSON.parse(localStorage.getItem('loocator_last_opened'));
    o.ts = Date.now() - age;
    localStorage.setItem('loocator_last_opened', JSON.stringify(o));
}, ms);

test('Nachfrage: Grenze 15 Minuten, "Ja" schaltet die Bewertung frei, Stimme trägt source=followup', { skip }, async () => {
    const { context, page, posts, errors } = await newSession();
    await load(page);

    assert.equal(await storage(page, 'loocator_last_opened'), null, 'vor dem Öffnen wird nichts gemerkt');
    await openToilet(page);
    assert.equal((await storage(page, 'loocator_last_opened')).id, TOILET_ID);
    assert.equal(await voteControlsHidden(page), true, 'ohne Nähe ist die Bewertung zunächst gesperrt');

    await ageLastOpened(page, 5 * MIN);
    await load(page);
    assert.equal(await modalVisible(page), false, 'unter 15 min keine Nachfrage');

    await ageLastOpened(page, 20 * MIN);
    await load(page);
    await page.waitForFunction(() => !document.getElementById('followup-modal').classList.contains('hidden'), null, { timeout: 5000 });
    assert.match(await page.innerText('#followup-body'), /Testklo am Schloss/, 'Nachfrage nennt die Toilette');

    await page.click('#btn-followup-yes');
    await page.waitForFunction(() => !document.getElementById('vote-controls').classList.contains('hidden'), null, { timeout: 10000 });
    assert.ok((await storage(page, 'loocator_visited'))[TOILET_ID].confirmedAt, 'Besuch bestätigt');
    assert.equal(await page.evaluate(() => document.getElementById('sheet-title').innerText.length > 0), true, 'Detailansicht ist offen');

    await page.evaluate(() => document.querySelector('.btn-star[data-val="4"]').click());
    await page.waitForFunction(() => document.getElementById('star-rating').classList.contains('pointer-events-none'), null, { timeout: 5000 });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].source, 'followup');
    assert.equal(posts[0].cleanliness, 4);

    await load(page);
    assert.equal(await modalVisible(page), false, 'nach der Bestätigung keine weitere Nachfrage');

    // 14 Tage später gilt wieder die 150-m-Regel
    await page.evaluate((age) => {
        const v = JSON.parse(localStorage.getItem('loocator_visited'));
        for (const k in v) v[k].confirmedAt = Date.now() - age;
        localStorage.setItem('loocator_visited', JSON.stringify(v));
    }, 14 * DAY + MIN);
    await load(page);
    await openToilet(page);
    assert.equal(await voteControlsHidden(page), true, 'Freigabe ist nach 14 Tagen abgelaufen');

    assert.deepEqual(errors, []);
    await context.close();
});

test('Nachfrage: "Nein" löscht den Merker, danach kommt keine Nachfrage mehr', { skip }, async () => {
    const { context, page, errors } = await newSession();
    await load(page);
    await openToilet(page);
    await ageLastOpened(page, 30 * MIN);
    await load(page);
    await page.waitForFunction(() => !document.getElementById('followup-modal').classList.contains('hidden'), null, { timeout: 5000 });

    await page.click('#btn-followup-no');
    await page.waitForFunction(() => document.getElementById('followup-modal').classList.contains('hidden'), null, { timeout: 5000 });
    assert.equal(await storage(page, 'loocator_last_opened'), null);
    assert.equal(await storage(page, 'loocator_visited'), null, '"Nein" schaltet nichts frei');

    await load(page);
    assert.equal(await modalVisible(page), false);
    assert.deepEqual(errors, []);
    await context.close();
});

test('Nachfrage: nach mehr als 7 Tagen wird nicht mehr gefragt', { skip }, async () => {
    const { context, page } = await newSession();
    await load(page);
    await openToilet(page);
    await ageLastOpened(page, 7 * DAY + MIN);
    await load(page);
    await page.waitForTimeout(2000); // die Nachfrage kommt sonst ca. 1,2 s nach dem Start
    assert.equal(await modalVisible(page), false);
    await context.close();
});
