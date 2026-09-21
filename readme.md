# Loocator

[![Live App](https://img.shields.io/badge/Live_App-app.loocator.org-0d9488?style=for-the-badge)](https://app.loocator.org) [![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE) [![Ko-fi Support](https://img.shields.io/badge/Support_me_on-Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/minecode) [![Email](https://img.shields.io/badge/Email-info@loocator.org-0d9488?style=for-the-badge&logo=minutemailer&logoColor=white)](mailto:info@loocator.org)

Loocator is a free, open-source Progressive Web App that helps people find public and accessible toilets worldwide — regular restrooms, "Eurokey" wheelchair-accessible facilities, and baby-changing tables — using live [OpenStreetMap](https://www.openstreetmap.org) data. No registration, no tracking, no ads.

**[loocator.org](https://loocator.org)**

## Features

- **Map-first search** — a Leaflet map with a Google Maps–style search bar and filter pills (public / Eurokey / changing table / free / favorites)
- **Community ratings** — anonymous "was it usable?" / cleanliness voting flags unreliable toilets and highlights the best ones
- **Gamified karma system** — earn points and ranks for contributing feedback
- **Installable PWA** — works offline for the app shell, installable to the home screen on iOS and Android
- **Multi-language** — German, English, French, Spanish, auto-detected with a manual switcher in the sidebar
- **Report missing/incorrect data** — reports feed back into OpenStreetMap for everyone to benefit from

## Tech stack

Loocator is intentionally a static site with a thin backend — no framework, no bundler:

- **Frontend:** Vanilla JS, HTML, [Tailwind CSS](https://tailwindcss.com) (compiled locally, not the runtime CDN build), [Leaflet](https://leafletjs.com) + Leaflet.markercluster for the map
- **Backend:** Plain PHP (PDO/SQLite) for votes and visit stats — see [`db.php`](db.php), [`backend.php`](backend.php), [`counter.php`](counter.php)
- **Data sources:** [Overpass API](https://overpass-api.de) (toilet locations), [Nominatim](https://nominatim.openstreetmap.org) (search/geocoding), [OSRM](https://project-osrm.org) (walking directions)
- **Tests:** Node's built-in test runner, no extra dependency — see [Testing](#testing)

There's no CI/build step at deploy time: compiled assets (`output.css`) are committed to the repo and served as-is by a plain Apache/PHP host.

## Getting started

**Requirements:** [Node.js](https://nodejs.org) 18+ (for the Tailwind build and tests) and a PHP 8+ server with SQLite support (for the backend).

```bash
git clone https://github.com/mineco-de/Loocator.git
cd Loocator
npm install
npm run build:css
```

Then serve the directory with any PHP-capable web server, for example:

```bash
php -S localhost:8000
```

and open `http://localhost:8000`. The map, search, and PWA shell work without any further setup; voting/rating requires the PHP backend, which auto-creates `loocator.sqlite` on first use.

While developing, rebuild CSS automatically on change with:

```bash
npm run watch:css
```

## Project structure

```
index.html              App shell (markup + Tailwind classes)
app.js                  Core app logic (map, filters, voting, UI)
translations.js         i18n dictionary (de/en/fr/es)
styles.css              Custom CSS beyond Tailwind (map layers, fonts)
src/lib/                Pure, unit-tested logic modules:
  openingHours.js         OSM opening_hours parsing
  karma.js                Karma rank calculation
  toiletRules.js          Toilet classification (public/Eurokey/free/rating)
test/                   Tests for the modules in src/lib/
db.php                  Shared SQLite connection + rate limiting
backend.php             Vote read/write API
counter.php             Visit counter + public stats page
ha-stats.php            Compact JSON stats endpoint (e.g. for Home Assistant)
cleanup.php             Cron job: prunes old votes/rate-limit rows
sw.js / manifest.json   PWA service worker + manifest
```

## Testing

The trickiest logic (opening-hours parsing, karma ranks, toilet classification) is extracted into standalone modules under `src/lib/` and covered by tests:

```bash
npm test
```

These modules are written so the *exact same file* runs in the browser (as a plain `<script>`, attached to `window.LoocatorLib`) and under Node (via `require()`) — there's no separate "browser copy" that can drift out of sync with what's tested.

`npm test` also runs integration tests for the PHP backend (`overpass.php` proxy/cache and the `source` of votes in `backend.php`). They start a throwaway `php -S` server against a mocked Overpass and are skipped when `php` is not installed.

The "Were you there?" follow-up prompt has an end-to-end test that drives the real app in Edge or Chrome:

```bash
npm run test:e2e
```

## Contributing

Contributions are welcome, whether that's code, translations, or just reporting a bug.

- **Found a toilet that's missing, wrong, or gone?** Use the in-app "Report" button — reports go back into OpenStreetMap, benefiting every OSM-based app, not just Loocator.
- **Found a bug or have a feature idea?** Open an [issue](https://github.com/mineco-de/Loocator/issues).
- **Want to submit a fix?** Fork the repo, make your change, run `npm test` and `npm run build:css`, and open a pull request. Keep PRs focused — one change per PR is easier to review than several bundled together.
- **Adding or fixing a translation?** All UI strings live in `translations.js`; each language object must have exactly the same set of keys as `de` (there's no automated check for this yet — please double-check by eye).

## License

MIT — see [LICENSE](LICENSE).

## Support

Loocator is free forever and carries no ads. If you'd like to support server costs, you can do so via **[Ko-fi](https://ko-fi.com/minecode)**.
