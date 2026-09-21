// Ende-zu-Ende-Test der Filterleiste: am Desktop (ab 768 px) sind die Zusatzfilter (jetzt geöffnet, hohe
// Erfolgsrate, unzuverlässige ausblenden) immer sichtbar, am Handy sind sie eingeklappt und lassen sich über den
// Chip ganz links auf-/zuklappen. Aufruf: npm run test:e2e (Edge oder Chrome nötig, sonst übersprungen).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures.json'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };

let chromium;
try { ({ chromium } = require('playwright-core')); } catch (e) { /* nicht installiert */ }
let server;
let base;
let browser;
let skip = chromium ? false : 'playwright-core nicht installiert';

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

async function open(viewport, mobile) {
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: 'de-DE', serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('loocator_tutorial_seen', 'true'); localStorage.setItem('loocator_lang', 'de'); } catch (e) { /* egal */ } });
    await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith(base)) return /backend\.php|overpass\.php/.test(url) ? route.abort() : route.continue();
        if (/overpass/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: FIXTURE });
        if (/^https:\/\/(unpkg\.com|cdn\.jsdelivr\.net)\//.test(url)) return route.continue();
        return route.abort();
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#filter-favorites', { state: 'attached' });
    return { context, page };
}

const visible = (page, selector) => page.evaluate((s) => {
    const el = document.querySelector(s);
    const r = el.getBoundingClientRect();
    return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0;
}, selector);

test('Desktop: Zusatzfilter sind immer sichtbar, der Aufklapp-Chip fehlt', { skip }, async () => {
    const { context, page } = await open({ width: 1280, height: 800 }, false);
    assert.equal(await visible(page, '#secondary-filters'), true);
    assert.equal(await visible(page, '#filter-open'), true, 'Filter "Jetzt geöffnet" sichtbar');
    assert.equal(await visible(page, '#btn-toggle-more-filters'), false);
    await context.close();
});

test('Handy: Zusatzfilter eingeklappt, Chip steht ganz links und klappt auf und zu', { skip }, async () => {
    const { context, page } = await open({ width: 393, height: 800 }, true);
    assert.equal(await visible(page, '#secondary-filters'), false);
    assert.equal(await visible(page, '#btn-toggle-more-filters'), true);

    const firstIsToggle = await page.evaluate(() => {
        const row = document.getElementById('btn-toggle-more-filters').parentElement;
        return row.firstElementChild.id === 'btn-toggle-more-filters';
    });
    assert.equal(firstIsToggle, true, 'Chip ist das erste Element der Filterzeile');
    const left = await page.evaluate(() => document.getElementById('btn-toggle-more-filters').getBoundingClientRect().left);
    assert.ok(left >= 0 && left < 60, 'Chip ist ohne Wischen im Blickfeld (links=' + left + ')');

    await page.click('#btn-toggle-more-filters');
    assert.equal(await visible(page, '#filter-open'), true);
    assert.equal(await page.getAttribute('#btn-toggle-more-filters', 'aria-expanded'), 'true');

    await page.click('#btn-toggle-more-filters');
    assert.equal(await visible(page, '#secondary-filters'), false);
    assert.equal(await page.getAttribute('#btn-toggle-more-filters', 'aria-expanded'), 'false');
    await context.close();
});
