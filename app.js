document.addEventListener("DOMContentLoaded", () => {
    
    // --- NEU: Besucherzähler sauber aufrufen ---
    fetch('counter.php?hit=1').catch(e => console.log('Counter-Error', e));
    // ------------------------------------------
    
    const htmlTag = document.getElementById('html-tag');
    htmlTag.lang = lang; // tatsächlich verwendete Inhaltssprache (de/en), nicht die rohe Browser-Locale

    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.innerText = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.getAttribute('data-i18n-title'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        let bgColor = 'bg-brand-600';
        if (type === 'error') bgColor = 'bg-red-600';
        if (type === 'success') bgColor = 'bg-green-600';

        toast.className = `toast-enter flex items-center justify-center p-3 rounded-lg shadow-lg text-white text-sm font-bold ${bgColor}`;
        toast.innerText = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.remove('toast-enter');
            toast.classList.add('toast-exit');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3000);
    }
    const customAlert = (msg) => showToast(msg, 'error');

        // --- KARMA SYSTEM ---
    let currentKarma = parseInt(localStorage.getItem('loocator_karma')) || 0;
    
    // Karma-Ränge + Rangberechnung leben (mit Tests) in src/lib/karma.js
    const { karmaRanks, getRankIndex } = window.LoocatorLib.karma;

    let currentRankIndex = getRankIndex(currentKarma);

    // Ein Icon (Klopapierrolle), farblich eskalierendes Badge + 0-3 Sterne als
    // Fortschritt + Krone nur beim Maximalrang - ein zusammenhängendes System
    // statt 10 emoji mit völlig unterschiedlichem visuellem Gewicht.
    function buildKarmaBadgeSvg(badge) {
        let starsHtml = '';
        for (let i = 0; i < 3; i++) {
            const cx = 13 + i * 7;
            const filled = i < badge.stars;
            starsHtml += `<path transform="translate(${cx - 2.5},28.5) scale(0.18)" d="M14 2l3.5 7.3 8 1.2-5.8 5.7 1.4 8-7.1-3.9-7.1 3.9 1.4-8L2.6 10.5l8-1.2z" fill="${filled ? '#ffffff' : 'rgba(255,255,255,0.3)'}"/>`;
        }
        const crownHtml = badge.crown
            ? `<path transform="translate(11,3.5)" d="M0 6l3.5 3 3.5-5 3.5 5L14 6l1 6H-1z" fill="#fde68a" stroke="#f59e0b" stroke-width="0.6" stroke-linejoin="round"/>`
            : '';
        return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="20" r="18" fill="${badge.color}" stroke="white" stroke-width="2"/>
            <g transform="translate(11,7) scale(0.68)">
                <path d="M7 2h9a1 1 0 0 1 1 1v3H6V3a1 1 0 0 1 1-1z" fill="white"/>
                <path d="M5 8h15a1 1 0 0 1 1 1v.5a2 2 0 0 1-1.3 1.87V13a6.7 6.7 0 0 1-6.7 6.7h-.5A6.7 6.7 0 0 1 5.3 13v-1.63A2 2 0 0 1 4 9.5V9a1 1 0 0 1 1-1z" fill="white"/>
            </g>
            ${starsHtml}
            ${crownHtml}
        </svg>`;
    }

    function updateKarmaUI() {
        const rank = karmaRanks[currentRankIndex];
        const titleEl = document.getElementById('karma-title');
        const pointsEl = document.getElementById('karma-points');
        const badgeEl = document.getElementById('karma-badge');
        const leftEl = document.getElementById('karma-left');
        const nextLabelEl = document.getElementById('karma-next-label');

        if(titleEl) titleEl.innerText = t(rank.key);
        if(pointsEl) pointsEl.innerText = t('karmaPoints', { points: currentKarma });
        if(badgeEl) badgeEl.innerHTML = buildKarmaBadgeSvg(rank.badge);

        if(leftEl && nextLabelEl) {
            if (currentRankIndex < karmaRanks.length - 1) {
                const nextRank = karmaRanks[currentRankIndex + 1];
                leftEl.innerText = nextRank.min - currentKarma;
                nextLabelEl.innerText = t('karmaNext');
            } else {
                leftEl.innerText = "MAX";
                nextLabelEl.innerText = t('karmaMax');
            }
        }
    }

    function addKarmaPoint() {
        currentKarma++;
        localStorage.setItem('loocator_karma', currentKarma);
        
        const newRankIndex = getRankIndex(currentKarma);
        if (newRankIndex > currentRankIndex) {
            currentRankIndex = newRankIndex;
            
            // Konfetti auslösen
            if(typeof confetti === 'function') {
                confetti({
                    particleCount: 150, spread: 80, origin: { y: 0.6 },
                    colors: ['#0d9488', '#e5316b', '#eab308', '#a855f7'],
                    zIndex: 9999
                });
            }
            
            // NEU: Toast mit Erklärung
            const newRankName = t(karmaRanks[currentRankIndex].key);
            showToast(t('rankUp', { rank: newRankName }), 'success');
        }
        updateKarmaUI();
    }

    const offlineBanner = document.getElementById('offline-banner');
    function updateOnlineStatus() {
        if (navigator.onLine) offlineBanner.classList.add('hidden');
        else offlineBanner.classList.remove('hidden');
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator.standalone);
    if (isIos && !isInStandaloneMode) document.getElementById('ios-install-hint').classList.remove('hidden');

    // --- NEU: Eleganter Theme Switcher ---
    const btnLight = document.getElementById('btn-theme-light');
    const btnDark = document.getElementById('btn-theme-dark');

    function updateThemeUI(isDark) {
        if (isDark) {
            btnDark.classList.add('bg-white', 'dark:bg-gray-600', 'text-brand-500', 'dark:text-brand-400', 'shadow-sm');
            btnDark.classList.remove('text-gray-400', 'dark:text-gray-500');
            btnLight.classList.add('text-gray-400', 'dark:text-gray-500');
            btnLight.classList.remove('bg-white', 'text-orange-500', 'shadow-sm');
        } else {
            btnLight.classList.add('bg-white', 'text-orange-500', 'shadow-sm');
            btnLight.classList.remove('text-gray-400', 'dark:text-gray-500');
            btnDark.classList.add('text-gray-400', 'dark:text-gray-500');
            btnDark.classList.remove('bg-white', 'dark:bg-gray-600', 'text-brand-500', 'dark:text-brand-400', 'shadow-sm');
        }
    }

    // Beim Start prüfen
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlTag.classList.add('dark');
        updateThemeUI(true);
    } else {
        htmlTag.classList.remove('dark');
        updateThemeUI(false);
    }

    // Klick auf Hell
    btnLight.addEventListener('click', () => {
        htmlTag.classList.remove('dark');
        localStorage.theme = 'light';
        updateThemeUI(false);
        applyMapTheme();
    });

    // Klick auf Dunkel
    btnDark.addEventListener('click', () => {
        htmlTag.classList.add('dark');
        localStorage.theme = 'dark';
        updateThemeUI(true);
        applyMapTheme();
    });

    const updateModal = document.getElementById('update-modal');
    const btnReloadApp = document.getElementById('btn-reload-app');
    const btnDismissUpdate = document.getElementById('btn-dismiss-update');
    const updateModalSessionKey = 'loocator_update_modal_shown';
    let updateModalWasShown = sessionStorage.getItem(updateModalSessionKey) === 'true';

    function openUpdateModal() {
        if (updateModalWasShown) return;
        if (updateModal) {
            updateModal.classList.remove('hidden');
            updateModalWasShown = true;
            sessionStorage.setItem(updateModalSessionKey, 'true');
        }
    }

    function closeUpdateModal() {
        if (updateModal) {
            updateModal.classList.add('hidden');
        }
    }

    btnReloadApp?.addEventListener('click', () => {
        if (navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
        }
        window.location.reload();
    });

    btnDismissUpdate?.addEventListener('click', closeUpdateModal);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then((registration) => {
            registration.addEventListener('updatefound', () => {
                const installingWorker = registration.installing;
                if (!installingWorker) return;

                installingWorker.addEventListener('statechange', () => {
                    if (installingWorker.state === 'installed' && registration.waiting && navigator.serviceWorker.controller) {
                        openUpdateModal();
                    }
                });
            });

            // iOS Safari kann Tabs sehr lange im Hintergrund "einfrieren" und prüft
            // dann nicht zuverlässig von selbst auf ein neues sw.js - beim Zurückkehren
            // in den Vordergrund explizit eine Update-Prüfung anstoßen.
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    registration.update().catch(() => {});
                }
            });
        }).catch(() => {});
    }

    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('btn-install').classList.remove('hidden');
    });

    document.getElementById('btn-install').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') document.getElementById('btn-install').classList.add('hidden');
            deferredPrompt = null;
        }
    });

        // ============================================
    // GOOGLE-MAPS-STYLE: SVG-Icon-Set + Pin Builder
    // ============================================
    const ICONS = {
        public:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M7 2h9a1 1 0 0 1 1 1v3H6V3a1 1 0 0 1 1-1z"/><path d="M5 8h15a1 1 0 0 1 1 1v.5a2 2 0 0 1-1.3 1.87V13a6.7 6.7 0 0 1-6.7 6.7h-.5A6.7 6.7 0 0 1 5.3 13v-1.63A2 2 0 0 1 4 9.5V9a1 1 0 0 1 1-1z"/></svg>',
        eurokey:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/></svg>',
        changing: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2" fill="white" stroke="none"/><path d="M9.3 8.7c.5.9 1.4 1.3 2.7 1.3s2.2-.4 2.7-1.3" stroke="#a855f7"/><path d="M6.5 20v-2.5a5.5 5.5 0 0111 0V20"/></svg>',
        favorite: '<svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 20.5S4 15.5 4 9.5C4 7.3 5.8 5.5 8 5.5C9.5 5.5 10.8 6.4 12 8C13.2 6.4 14.5 5.5 16 5.5C18.2 5.5 20 7.3 20 9.5C20 15.5 12 20.5 12 20.5Z"/></svg>',
        free:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="white" stroke-width="2"/><path d="M8 8L16 16" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>'
    };

    // Muss mit den Farb-Tokens in tailwind.config.js (brand/accent/eurokey/changing/
    // free/defect) übereinstimmen - Marker werden als reines SVG gebaut, kann daher
    // keine Tailwind-Klassen nutzen, deshalb hier als Hex-Werte dupliziert.
    const PRIO_COLORS = {
        favorite:   '#e5316b', // accent-500
        eurokey:    '#eab308',
        changing:   '#a855f7',
        free:       '#16a34a',
        public:     '#0d9488', // brand-600 (teal)
        defect:     '#9ca3af'
    };

    // Status-Badge oben rechts am Pin (nur EIN Status, höchste Priorität gewinnt):
    // defect > topRated > 24/7. Glyphen sind bewusst winzig - der Pin bleibt ruhig.
    const STATUS_BADGES = {
        defect:   { color: '#dc2626', glyph: '<path d="M8 4.6V8.6" stroke="white" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.2" r="1" fill="white"/>' },
        topRated: { color: '#0f766e', glyph: '<path d="M8 3.6l1.3 2.7 2.9.4-2.1 2.1.5 2.9L8 10.3l-2.6 1.4.5-2.9L3.8 6.7l2.9-.4L8 3.6z" fill="white"/>' },
        open247:  { color: '#16a34a', glyph: '<circle cx="8" cy="8" r="3.6" stroke="white" stroke-width="1.5" fill="none"/><path d="M8 6v2.2l1.4.9" stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' }
    };

    function getStatusKey({ isDefect, isTopRated, is247 }) {
        if (isDefect) return 'defect';
        if (isTopRated) return 'topRated';
        if (is247) return 'open247';
        return null;
    }

    function buildStatusBadge(statusKey, sizePx) {
        const badge = STATUS_BADGES[statusKey];
        if (!badge) return '';
        return '<svg class="loo-badge" width="' + sizePx + '" height="' + sizePx + '" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            '<circle cx="8" cy="8" r="7.2" fill="' + badge.color + '" stroke="white" stroke-width="1.6"/>' + badge.glyph + '</svg>';
    }

    // Ein einheitlicher Tropfen-Pin: Füllfarbe = Kategorie, Icon im Pin, Status als Badge.
    // Defekt: Pin wird grau (Kategorie-Icon bleibt), Badge zeigt das rote Ausrufezeichen.
    function buildPinIcon(priorityKey, statusKey = null, isDefectMode = false) {
        const color = isDefectMode ? PRIO_COLORS.defect : PRIO_COLORS[priorityKey];
        const iconSvg = ICONS[priorityKey];
        const iconDataUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(iconSvg);

        return '' +
            '<div class="loo-pin">' +
                '<svg class="loo-pin-shape" width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">' +
                    '<path d="M18 2C9.2 2 2.5 8.6 2.5 17c0 6.2 3.6 11.3 8.2 16.6 3.2 3.7 6.2 7.6 7.3 10.4 1.1-2.8 4.1-6.7 7.3-10.4 4.6-5.3 8.2-10.4 8.2-16.6C33.5 8.6 26.8 2 18 2z" fill="' + color + '" stroke="white" stroke-width="2" stroke-linejoin="round"/>' +
                '</svg>' +
                '<img class="loo-pin-icon" src="' + iconDataUrl + '" alt="">' +
                buildStatusBadge(statusKey, 16) +
            '</div>';
    }

    const map = L.map('map', { zoomControl: false, maxZoom: 19 }).setView([49.0069, 8.4037], 14);
    // --- Basiskarte: OpenFreeMap (Vektor, ohne Key) im Loocator-Markenlook ---
    // HOT (tile.openstreetmap.fr/hot) ist nicht mehr zuverlässig und zeichnet Straßen
    // sehr dominant. Wir laden die OpenFreeMap-Styles (Positron/Dark) und färben sie
    // per Palette um: leise Straßen, sichtbare Fußwege, warme Creme- bzw. Deep-Teal-Töne.
    // Zum Nachjustieren nur MAP_PALETTES anpassen.
    const OFM_STYLE_URLS = {
        light: 'https://tiles.openfreemap.org/styles/positron',
        dark: 'https://tiles.openfreemap.org/styles/dark'
    };
    const MAP_PALETTES = {
        light: {
            background: '#F1EBDC', park: '#DCE7D2', wood: '#D2E0CA', residential: '#EFE8D8',
            water: '#BBDBD7', waterway: '#A7CFCA', building: '#E7DFCC', buildingOutline: '#DBD1BA',
            roadMinor: '#FFFFFF', roadMajor: '#FFFFFF', roadCasing: '#E0D6BF', roadSubtle: '#E8E0CD',
            tunnel: '#EDE6D5', path: '#C2B493', rail: '#DCD2BB', railDash: '#F1EBDC', boundary: '#C9BFA6',
            roadLabel: '#8A8371', roadLabelHalo: '#F1EBDC', placeLabel: '#33443f', placeHalo: '#F5F0E4', waterLabel: '#3F7F7A'
        },
        // Dark: bewusst neutrales Blaugrau statt Teal-auf-Teal - Straßen und Beschriftungen
        // brauchen klaren Helligkeitsabstand zum Hintergrund, damit die Karte lesbar bleibt.
        dark: {
            background: '#1F262B', park: '#243D2F', wood: '#20372A', residential: '#222A2F',
            water: '#1D3A55', waterway: '#1D3A55', building: '#2A3339', buildingOutline: '#343F46',
            roadMinor: '#434E55', roadMajor: '#5F6E77', roadCasing: '#1F262B', roadSubtle: '#333E45',
            tunnel: '#2E383E', path: '#66757C', rail: '#4A555B', railDash: '#1F262B', boundary: '#59666D',
            roadLabel: '#B4C0C5', roadLabelHalo: '#1F262B', placeLabel: '#EDF2F4', placeHalo: '#1F262B', waterLabel: '#8DB4D6'
        }
    };

    function paintRulesFor(c) {
        return {
            background: { 'background-color': c.background },
            park: { 'fill-color': c.park }, landuse_park: { 'fill-color': c.park },
            landcover_wood: { 'fill-color': c.wood },
            landuse_residential: { 'fill-color': c.residential },
            water: { 'fill-color': c.water },
            waterway: { 'line-color': c.waterway },
            building: { 'fill-color': c.building, 'fill-outline-color': c.buildingOutline },
            highway_path: { 'line-color': c.path, 'line-opacity': 1 },
            highway_minor: { 'line-color': c.roadMinor, 'line-opacity': 1 },
            highway_major_casing: { 'line-color': c.roadCasing },
            highway_major_inner: { 'line-color': c.roadMajor },
            highway_major_subtle: { 'line-color': c.roadSubtle },
            highway_motorway_casing: { 'line-color': c.roadCasing },
            highway_motorway_inner: { 'line-color': c.roadMajor },
            highway_motorway_subtle: { 'line-color': c.roadSubtle },
            highway_motorway_bridge_casing: { 'line-color': c.roadCasing },
            highway_motorway_bridge_inner: { 'line-color': c.roadMajor },
            tunnel_motorway_casing: { 'line-color': c.roadCasing },
            tunnel_motorway_inner: { 'line-color': c.tunnel },
            railway: { 'line-color': c.rail }, railway_transit: { 'line-color': c.rail },
            railway_service: { 'line-color': c.rail }, railway_minor: { 'line-color': c.rail },
            railway_dashline: { 'line-color': c.railDash }, railway_transit_dashline: { 'line-color': c.railDash },
            railway_service_dashline: { 'line-color': c.railDash }, railway_minor_dashline: { 'line-color': c.railDash },
            boundary_3: { 'line-color': c.boundary }, boundary_2: { 'line-color': c.boundary },
            boundary_state: { 'line-color': c.boundary }, boundary_disputed: { 'line-color': c.boundary },
            'boundary_country_z0-4': { 'line-color': c.boundary }, 'boundary_country_z5-': { 'line-color': c.boundary }
        };
    }

    function applyBrandPalette(style, theme) {
        const c = MAP_PALETTES[theme];
        const rules = paintRulesFor(c);
        style.layers.forEach(layer => {
            layer.paint = layer.paint || {};
            if (rules[layer.id]) Object.assign(layer.paint, rules[layer.id]);
            if (layer.type !== 'symbol') return;
            const src = layer['source-layer'];
            if (src === 'transportation_name') {
                Object.assign(layer.paint, { 'text-color': c.roadLabel, 'text-halo-color': c.roadLabelHalo });
            } else if (src === 'place') {
                Object.assign(layer.paint, { 'text-color': c.placeLabel, 'text-halo-color': c.placeHalo });
            } else if (src === 'water_name' || src === 'waterway') {
                Object.assign(layer.paint, { 'text-color': c.waterLabel, 'text-halo-color': c.placeHalo });
            }
        });
        return style;
    }

    const brandStyleCache = {};
    async function loadBrandStyle(theme) {
        if (!brandStyleCache[theme]) {
            const res = await fetch(OFM_STYLE_URLS[theme]);
            if (!res.ok) throw new Error('OpenFreeMap style ' + res.status);
            brandStyleCache[theme] = applyBrandPalette(await res.json(), theme);
        }
        // Kopie: MapLibre darf das gecachte Objekt nicht verändern
        return JSON.parse(JSON.stringify(brandStyleCache[theme]));
    }

    function currentMapTheme() {
        return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }

    // Wird beim Hinzufügen des Layers (Start, Zurück aus Satellit) und bei Theme-Wechsel aufgerufen
    async function applyMapTheme() {
        if (!isVectorBase || !layerOSM._map) return;
        const theme = currentMapTheme();
        try {
            const style = await loadBrandStyle(theme);
            const gl = layerOSM.getMaplibreMap();
            if (gl && currentMapTheme() === theme) gl.setStyle(style);
        } catch (e) {
            console.warn('Kartenstil konnte nicht geladen werden', e);
        }
    }

    const OSM_ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> | Loocator by <a href="https://mineco.de" target="_blank" rel="noopener">Adam Weiß</a>';

    let isVectorBase = false;
    let layerOSM;
    function createBaseLayer() {
        if (typeof L.maplibreGL === 'function' && typeof maplibregl !== 'undefined') {
            try {
                // Platzhalter-Style (nur Hintergrundfarbe), der echte Style kommt per applyMapTheme()
                const placeholder = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': MAP_PALETTES[currentMapTheme()].background } }] };
                // Das Plugin ignoriert die Leaflet-Option 'attribution' und leitet den Text aus dem Style ab -
                // (fehlt anfangs und enthält nicht unseren Credit). customAttribution setzt ihn fest.
                const vec = L.maplibreGL({ style: placeholder, attributionControl: { customAttribution: OSM_ATTRIBUTION } });
                isVectorBase = true;
                vec.on('add', applyMapTheme);
                return vec;
            } catch (e) {
                console.warn('Vektorkarte nicht verfügbar, nutze Raster-Fallback', e);
            }
        }
        // Fallback (kein WebGL / Bibliothek nicht geladen): OSM-Standardkacheln, Farben per CSS-Filter (styles.css)
        isVectorBase = false;
        return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors | Loocator by <a href="https://mineco.de" target="_blank" rel="noopener">Adam Weiß</a>',
            className: 'osm-tiles'
        });
    }
    layerOSM = createBaseLayer();
    const layerSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri | Loocator by <a href="https://mineco.de" target="_blank" rel="noopener">Adam Weiß</a>'
    });
    layerOSM.addTo(map);

    let isSatMode = false;
    document.getElementById('btn-layer-toggle').addEventListener('click', (e) => {
        isSatMode = !isSatMode;
        const mapDiv = document.getElementById('map');
        if (isSatMode) {
            map.removeLayer(layerOSM);
            layerSat.addTo(map);
            mapDiv.classList.add('is-sat-mode');
        } else {
            map.removeLayer(layerSat);
            layerOSM.addTo(map);
            mapDiv.classList.remove('is-sat-mode');
        }
    });

    const markerClusterGroup = L.markerClusterGroup({
        disableClusteringAtZoom: 16,
        maxClusterRadius: 50,
        iconCreateFunction: function(cluster) {
            const childCount = cluster.getChildCount();
            const children = cluster.getAllChildMarkers();
            let hasTopRated = false;
            let hasOpen247 = false;
            let hasDefect = false;

            children.forEach(marker => {
                if (marker.options.isTopRated) hasTopRated = true;
                if (marker.options.is247) hasOpen247 = true;
                if (marker.options.isDefect) hasDefect = true;
            });

            // Gleiche Badge-Logik wie beim einzelnen Pin (ein Status, höchste Priorität)
            const statusKey = getStatusKey({ isDefect: hasDefect, isTopRated: hasTopRated, is247: hasOpen247 });

            return L.divIcon({
                html: `<div class="loo-cluster"><span>${childCount}</span>${buildStatusBadge(statusKey, 16)}</div>`,
                className: 'custom-cluster-icon bg-transparent',
                iconSize: L.point(40, 40)
            });
        }
    });
    map.addLayer(markerClusterGroup);

    let userLocation = null;
    let locationMarker = null;
    let searchMarker = null;
    let activeMarkers = [];
    let pendingOpenId = null; // Toilette, deren Detailansicht nach dem Laden der Marker geöffnet werden soll
    let currentToiletData = null;
    let isTooFarToVote = false;
    let isFetching = false;
    let refetchPending = false;
    let initialLoadComplete = false;
    let globalRatingsDb = {};
    let routingLine = null;
    let addressCache = {};
    let autoFollow = false;
    let allToilets = [];
    const ADDRESS_CACHE_TTL = 1000 * 60 * 60 * 24 * 7;
    const TOILET_CACHE_TTL = 1000 * 60 * 60 * 12;
    const TOILET_CACHE_KEY = 'loocator_cached_toilets';

    try {
        const cachedAddresses = JSON.parse(localStorage.getItem('loocator_address_cache') || '{}');
        if (cachedAddresses && typeof cachedAddresses === 'object') {
            addressCache = cachedAddresses;
        }
    } catch (e) {
        addressCache = {};
    }

    const btnLocation = document.getElementById('btn-location');
    const mainMenu = document.getElementById('main-menu');
    const btnOpenMenu = document.getElementById('btn-open-menu');
    const btnCloseMenu = document.getElementById('btn-close-menu');
    const searchInput = document.getElementById('search-input');
    const searchSuggestions = document.getElementById('search-suggestions');
    const btnCloseSheet = document.getElementById('btn-close-sheet');
    const emptyStateEl = document.getElementById('empty-state');

    function showEmptyState(message) {
        if (emptyStateEl) {
            emptyStateEl.innerText = message;
            emptyStateEl.classList.remove('hidden');
        }
    }

    function hideEmptyState() {
        if (emptyStateEl) {
            emptyStateEl.classList.add('hidden');
            emptyStateEl.innerText = '';
        }
    }

    function getBoundsCacheKey(bounds) {
        return `bbox:${bounds.getSouth().toFixed(5)}:${bounds.getWest().toFixed(5)}:${bounds.getNorth().toFixed(5)}:${bounds.getEast().toFixed(5)}`;
    }

    function loadCachedToiletsForBounds(cacheKey) {
        try {
            const raw = localStorage.getItem(TOILET_CACHE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object' || !data[cacheKey]) return null;

            const entry = data[cacheKey];
            if (!entry || !Array.isArray(entry.elements)) return null;
            if ((Date.now() - entry.savedAt) > TOILET_CACHE_TTL) return null;

            return entry.elements;
        } catch (e) {
            return null;
        }
    }

    function saveCachedToiletsForBounds(cacheKey, elements) {
        try {
            const raw = localStorage.getItem(TOILET_CACHE_KEY);
            const data = raw ? JSON.parse(raw) : {};
            data[cacheKey] = {
                savedAt: Date.now(),
                elements
            };
            localStorage.setItem(TOILET_CACHE_KEY, JSON.stringify(data));
        } catch (e) {
            // Ignore cache write failures gracefully.
        }
    }

    function updateLocationButtonUI() {
        if (autoFollow) {
            btnLocation.classList.remove('bg-white', 'text-brand-600', 'dark:bg-gray-800', 'dark:text-brand-400');
            btnLocation.classList.add('bg-brand-600', 'text-white');
        } else {
            btnLocation.classList.remove('bg-brand-600', 'text-white');
            btnLocation.classList.add('bg-white', 'text-brand-600', 'dark:bg-gray-800', 'dark:text-brand-400');
        }
    }

    map.on('dragstart', () => {
        if (autoFollow) {
            autoFollow = false;
            updateLocationButtonUI();
            map.stopLocate();
        }
    });

    map.on('locationfound', function(e) {
        userLocation = e.latlng;
        if (!locationMarker) {
            map.eachLayer(layer => {
                if(layer.options && layer.options.color === '#3b82f6') map.removeLayer(layer);
            });
            locationMarker = L.circleMarker(e.latlng, { color: '#3b82f6', fillOpacity: 1, radius: 8 }).addTo(map);
        } else {
            locationMarker.setLatLng(e.latlng);
        }
        if (autoFollow) {
            map.setView(e.latlng, map.getZoom());
        }
    });

    btnLocation.addEventListener('click', () => {
        if (navigator.geolocation) {
            document.getElementById('loading-spinner').classList.remove('hidden');
            const successCallback = (position) => {
                document.getElementById('loading-spinner').classList.add('hidden');
                userLocation = L.latLng(position.coords.latitude, position.coords.longitude);
                autoFollow = true;
                updateLocationButtonUI();
                map.setView(userLocation, 16);
                map.locate({ watch: true, enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 });
            };
            const errorCallback = (error) => {
                if (error.code === 3) {
                    navigator.geolocation.getCurrentPosition(
                        successCallback,
                        (errFallback) => {
                            document.getElementById('loading-spinner').classList.add('hidden');
                            customAlert(t('geoFallbackError', { code: errFallback.code, msg: errFallback.message }));
                            autoFollow = false;
                            updateLocationButtonUI();
                        },
                        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
                    );
                    return;
                }
                document.getElementById('loading-spinner').classList.add('hidden');
                customAlert(t('geoError', { code: error.code, msg: error.message }));
                autoFollow = false;
                updateLocationButtonUI();
            };
            navigator.geolocation.getCurrentPosition(successCallback, errorCallback, { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
        } else {
            customAlert(t('geoNotSupported'));
        }
    });

    const sidebarBackdrop = document.getElementById('sidebar-backdrop');

    // Echte linke Sidebar (Drawer), statt der vorherigen schwebenden Menü-Karte -
    // schiebt von links rein/raus statt zu faden, mit abdunkelndem Hintergrund.
    function toggleMenu(show) {
        if (show) {
            sidebarBackdrop.classList.remove('hidden');
            requestAnimationFrame(() => {
                mainMenu.classList.remove('-translate-x-full');
                sidebarBackdrop.classList.remove('opacity-0');
            });
        } else {
            mainMenu.classList.add('-translate-x-full');
            sidebarBackdrop.classList.add('opacity-0');
            searchSuggestions.classList.add('hidden');
            searchInput.blur();
            setTimeout(() => sidebarBackdrop.classList.add('hidden'), 300);
        }
    }

    btnOpenMenu.addEventListener('click', () => toggleMenu(true));
    btnCloseMenu.addEventListener('click', () => toggleMenu(false));
    sidebarBackdrop.addEventListener('click', () => toggleMenu(false));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !mainMenu.classList.contains('-translate-x-full')) toggleMenu(false);
    });

    // Sprachwechsler: überschreibt die Browser-Spracherkennung dauerhaft und lädt neu,
    // damit wirklich jeder bereits gerenderte Text (inkl. dynamischer Inhalte) konsistent ist.
    document.querySelectorAll('.lang-btn').forEach(btn => {
        if (btn.dataset.lang === lang) btn.classList.add('bg-brand-500', 'text-white', 'border-brand-500');
        btn.addEventListener('click', () => {
            localStorage.setItem('loocator_lang', btn.dataset.lang);
            window.location.reload();
        });
    });

    // Die Filter-Zeilen sind horizontal scrollbar (overflow-x: auto), aber das
    // unterstützt nativ nur Touch-Wischen - mit der Maus lässt sich per Klick+Ziehen
    // nicht scrollen, sondern es wird nur der Button-Text markiert. Click-Drag-to-
    // Scroll nachrüsten, für die Dauer des Ziehens Textmarkierung unterdrücken.
    document.querySelectorAll('.hide-scrollbar').forEach((el) => {
        let isDragging = false;
        let dragMoved = false;
        let startX = 0;
        let startScrollLeft = 0;

        el.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragMoved = false;
            startX = e.pageX;
            startScrollLeft = el.scrollLeft;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const delta = e.pageX - startX;
            if (Math.abs(delta) > 3) {
                dragMoved = true;
                el.classList.add('select-none');
                el.scrollLeft = startScrollLeft - delta;
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            el.classList.remove('select-none');
        });

        // Nach einem echten Drag den nachfolgenden Klick auf die getroffene Pille
        // unterdrücken, sonst würde ein Ziehen versehentlich einen Filter umschalten.
        el.addEventListener('click', (e) => {
            if (dragMoved) {
                e.preventDefault();
                e.stopPropagation();
                dragMoved = false;
            }
        }, true);
    });

    // Sekundäre Filter-Zeile eingeklappt lassen, bis der Nutzer sie explizit öffnet
    // (weniger gleichzeitig sichtbare Entscheidungen beim ersten Laden)
    const btnToggleMoreFilters = document.getElementById('btn-toggle-more-filters');
    const secondaryFilters = document.getElementById('secondary-filters');
    const iconMoreFilters = document.getElementById('icon-more-filters');
    btnToggleMoreFilters?.addEventListener('click', () => {
        const isOpen = !secondaryFilters.classList.contains('hidden');
        secondaryFilters.classList.toggle('hidden', isOpen);
        secondaryFilters.classList.toggle('flex', !isOpen);
        iconMoreFilters.classList.toggle('rotate-180', !isOpen);
        btnToggleMoreFilters.setAttribute('aria-expanded', String(!isOpen));
    });

    // Legende (Marker-Farben) dauerhaft über einen eigenen Button erreichbar,
    // nicht nur einmalig im Tutorial beim allerersten Start. Lebt in der Sidebar
    // statt als schwebender Button auf der Karte (wurde dort ständig aus Versehen
    // angetippt).
    document.getElementById('btn-legend')?.addEventListener('click', () => {
        toggleMenu(false);
        document.getElementById('tutorial-modal').classList.remove('hidden');
    });
        const btnContact = document.getElementById('btn-contact');
    const contactModal = document.getElementById('contact-modal');
    const btnCloseContact = document.getElementById('btn-close-contact');
    const btnCloseContactSecondary = document.getElementById('btn-close-contact-secondary');
    const contactForm = document.getElementById('contact-form');
    const btnSubmitContact = document.getElementById('btn-submit-contact');

    function openContactModal() {
        toggleMenu(false);
        contactModal.classList.remove('hidden');
    }

    function closeContactModal() {
        contactModal.classList.add('hidden');
    }

    btnContact?.addEventListener('click', openContactModal);
    btnCloseContact?.addEventListener('click', closeContactModal);
    btnCloseContactSecondary?.addEventListener('click', closeContactModal);

    contactModal?.addEventListener('click', (e) => {
        if (e.target === contactModal) {
            closeContactModal();
        }
    });

    contactForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(contactForm);
        const oldText = btnSubmitContact.innerText;

        btnSubmitContact.disabled = true;
        btnSubmitContact.innerText = t('loading');

        try {
            const response = await fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                showToast(t('contactSuccess'), 'success');
                contactForm.reset();
                closeContactModal();
            } else {
                customAlert(t('contactError'));
            }
        } catch (error) {
            customAlert(t('contactError'));
        } finally {
            btnSubmitContact.disabled = false;
            btnSubmitContact.innerText = oldText;
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (contactModal && !contactModal.classList.contains('hidden')) {
                closeContactModal();
            }
        }
    });

    function jumpToSearchResult(lat, lon, name) {
        map.setView([lat, lon], 18);
        searchInput.value = name;
        toggleMenu(false);
        if(autoFollow) {
            autoFollow = false;
            updateLocationButtonUI();
            map.stopLocate();
        }
        if (searchMarker) map.removeLayer(searchMarker);
        const searchPinSvg = '<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3))"><path d="M17 2C9 2 2 8 2 16c0 10 15 26 15 26s15-16 15-26C32 8 25 2 17 2z" fill="#e5316b" stroke="white" stroke-width="2"/><circle cx="17" cy="16" r="5.5" fill="white"/></svg>';
        searchMarker = L.marker([lat, lon], {
            icon: L.divIcon({ className: 'bg-transparent', html: searchPinSvg, iconSize: [34, 44], iconAnchor: [17, 44] })
        }).addTo(map);
    }

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value;
        if (query.length < 3) { searchSuggestions.classList.add('hidden'); return; }
        searchTimeout = setTimeout(async () => {
            try {
                // Weltweite Suche - vorher war das hart auf 5 Länder beschränkt (und "uk" war
                // sowieso kein gültiger ISO-Code; korrekt wäre "gb" für Großbritannien gewesen).
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
                const data = await res.json();
                searchSuggestions.innerHTML = '';
                if (data.length > 0) {
                    data.forEach(place => {
                        const li = document.createElement('li');
                        li.className = 'p-3 border-b border-gray-100 dark:border-gray-600 hover:bg-brand-50 dark:hover:bg-gray-600 cursor-pointer truncate font-medium';
                        const shortName = place.display_name.split(',').slice(0, 3).join(',');
                        li.innerText = shortName;
                        li.onclick = () => jumpToSearchResult(place.lat, place.lon, shortName);
                        searchSuggestions.appendChild(li);
                    });
                    searchSuggestions.classList.remove('hidden');
                } else {
                    searchSuggestions.classList.add('hidden');
                }
            } catch (e) {}
        }, 500);
    });

    document.getElementById('search-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = searchInput.value;
        if (!query) return;
        document.getElementById('loading-spinner').classList.remove('hidden');
        searchSuggestions.classList.add('hidden');
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data && data.length > 0) jumpToSearchResult(data[0].lat, data[0].lon, searchInput.value);
            else customAlert(t('alertNotFound'));
        } catch (e) {
            customAlert(t('searchFailed'));
        } finally {
            document.getElementById('loading-spinner').classList.add('hidden');
        }
    });

    const filterSelectors = ['filter-public', 'filter-eurokey', 'filter-changing', 'filter-open', 'filter-success', 'filter-favorites', 'filter-free'];
    filterSelectors.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            const savedState = localStorage.getItem('loocator_filter_' + id);
            if (savedState !== null) {
                el.checked = (savedState === 'true');
            }
            
            el.addEventListener('change', () => {
                localStorage.setItem('loocator_filter_' + id, el.checked);
                renderMarkers();
            });
        }
    });

    // --- NEUES MELDEN UI LOGIK ---
    const crosshair = document.getElementById('crosshair');
    const targetBottomBar = document.getElementById('target-bottom-bar');
    const reportModal = document.getElementById('report-modal');
    let reportMode = 'new'; // 'new' via Menü, 'existing' via Bottom-Sheet

    // 1A. Modus starten via Menü -> Fadenkreuz zeigen
    document.getElementById('btn-report').addEventListener('click', () => {
        reportMode = 'new';
        document.getElementById('label-rep-1').style.display = 'flex';
        document.getElementById('label-rep-2').style.display = 'flex';
        document.getElementById('radio-rep-1').checked = true;
        
        // Hinweis für bestehende WCs hier wieder ausblenden
        document.getElementById('modal-report-hint').style.display = 'none';
        
        toggleMenu(false);
        crosshair.classList.remove('hidden');
        targetBottomBar.classList.remove('hidden');
    });

    // 1B. Modus starten via Bottom-Sheet -> Direkt zum Modal
    if(document.getElementById('btn-report-existing')) {
        document.getElementById('btn-report-existing').addEventListener('click', () => {
            reportMode = 'existing';
            // Für bestehende WCs macht "Hier fehlt ein WC" keinen Sinn, also ausblenden
            document.getElementById('label-rep-1').style.display = 'none';
            document.getElementById('label-rep-2').style.display = 'none';
            document.getElementById('radio-rep-3').checked = true;

            // NEU: Zusatztext (Hint) anzeigen und mit der aktuellen OSM-ID füllen
            const hintEl = document.getElementById('modal-report-hint');
            hintEl.innerText = t('reportExistingHint');
            hintEl.style.display = 'block';
            
            closeSheet();
            reportModal.classList.remove('hidden');
        });
    }

    // 2. Modus abbrechen
    document.getElementById('btn-cancel-target').addEventListener('click', () => {
        crosshair.classList.add('hidden');
        targetBottomBar.classList.add('hidden');
    });

    // 3. Ort bestaetigt -> Formular zeigen
    document.getElementById('btn-confirm-target').addEventListener('click', () => {
        targetBottomBar.classList.add('hidden');
        reportModal.classList.remove('hidden');
    });

    // 4. Formular schliessen (X-Button)
    document.getElementById('btn-close-report').addEventListener('click', () => {
        reportModal.classList.add('hidden');
        crosshair.classList.add('hidden');
    });

    // 5. Daten an OSM senden
    document.getElementById('btn-submit-report').addEventListener('click', async () => {
        let lat, lon, finalOsmText;
        const typeRadio = document.querySelector('input[name="report-type"]:checked').value;
        const noteText = document.getElementById('report-note').value.trim();

        if (reportMode === 'new') {
            const center = map.getCenter();
            lat = center.lat;
            lon = center.lng;
            finalOsmText = `[Loocator App Report] Issue: ${typeRadio}`;
        } else {
            lat = currentToiletData.lat || (currentToiletData.center && currentToiletData.center.lat);
            lon = currentToiletData.lon || (currentToiletData.center && currentToiletData.center.lon);
            finalOsmText = `[Loocator App Report] Issue with existing WC (OSM-ID: ${currentToiletData.id}): ${typeRadio}`;
        }

        if (noteText.length > 0) finalOsmText += ` | User note: ${noteText}`;

        const url = `https://api.openstreetmap.org/api/0.6/notes?lat=${lat}&lon=${lon}&text=${encodeURIComponent(finalOsmText)}`;
        
        const submitBtn = document.getElementById('btn-submit-report');
        const oldText = submitBtn.innerText;
        submitBtn.innerText = t('loading');
        submitBtn.disabled = true;

        try {
            await fetch(url, { method: 'POST' });
            showToast(t('alertReportSuccess'), 'success');
            reportModal.classList.add('hidden');
            crosshair.classList.add('hidden');
            document.getElementById('report-note').value = '';
        } catch(e) {
            customAlert(t('alertError'));
        } finally {
            submitBtn.innerText = oldText;
            submitBtn.disabled = false;
        }
    });
    // ----------------------------------------------------

    // opening_hours-Auswertung lebt (mit Tests) in src/lib/openingHours.js
    const { isLikelyClosedNow } = window.LoocatorLib.openingHours;
    // Toilet-Klassifizierung (Filter/Marker-Farbe) lebt (mit Tests) in src/lib/toiletRules.js
    const ToiletRules = window.LoocatorLib.toiletRules;
    // Nachfrage "Hast du diese Toilette aufgesucht?" (Grenzen/Regeln mit Tests) lebt in src/lib/visitFollowUp.js
    const VisitFollowUp = window.LoocatorLib.visitFollowUp;

    let fetchTimeout;
    map.on('moveend', () => {
        clearTimeout(fetchTimeout);
        fetchTimeout = setTimeout(fetchToilets, 500);
    });

    function removeSplashScreen() {
        if (!initialLoadComplete) {
            initialLoadComplete = true;
            const splash = document.getElementById('splash-screen');
            if (splash) {
                splash.classList.add('opacity-0');
                setTimeout(() => splash.remove(), 500);
            }
            if (!localStorage.getItem('loocator_tutorial_seen')) {
                document.getElementById('tutorial-modal').classList.remove('hidden');
                toggleMenu(false);
            }
            setTimeout(maybeShowFollowUp, 1200);
        }
    }

    const btnCloseTutorial = document.getElementById('btn-close-tutorial');
    if (btnCloseTutorial) {
        btnCloseTutorial.addEventListener('click', () => {
            localStorage.setItem('loocator_tutorial_seen', 'true');
            const modal = document.getElementById('tutorial-modal');
            modal.classList.add('opacity-0');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('opacity-0');
            }, 300);
        });
    }

    // Öffentliche Overpass-Instanzen sind einzeln nicht sehr zuverlässig (häufig 429/503
    // unter Last, teils auch nur regionale Daten) - mehrere Mirrors nacheinander probieren,
    // bevor wir aufgeben. overpass.osm.ch liefert HTTP 200 aber nur Schweizer Daten - daher
    // NICHT als Mirror verwenden, sonst würde ein "erfolgreiches" leeres Ergebnis für jede
    // Anfrage außerhalb der Schweiz fälschlich als final akzeptiert.
    // overpass.openstreetmap.fr ist zwar der schnellste, sendet aber keine CORS-Header und ist
    // deshalb im Browser unbrauchbar; overpass.php (Server) fragt ihn direkt ab.
    const OVERPASS_MIRRORS = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
    ];

    async function fetchOverpassWithFallback(query) {
        let lastError;
        for (const base of OVERPASS_MIRRORS) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 20000);
                // POST statt GET (von Overpass selbst für alles außer trivialen Anfragen
                // empfohlen) - vermeidet außerdem, dass zwischengeschaltete CDNs/Proxys
                // GET-Query-Strings anders cachen/behandeln als POST-Bodies.
                const res = await fetch(base, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'data=' + encodeURIComponent(query),
                    signal: controller.signal
                });
                clearTimeout(timeout);
                if (!res.ok) throw new Error(`Overpass ${res.status}`);
                const data = await res.json();
                // Ein HTTP-200 mit leerem elements-Array kann ein regional beschränkter
                // Mirror sein statt "wirklich keine Toiletten hier" - im Zweifel dem
                // nächsten Mirror eine Chance geben, statt sofort leer zurückzugeben.
                if (!data || !Array.isArray(data.elements) || data.elements.length === 0) {
                    lastError = new Error(`Overpass ${base} returned no elements`);
                    console.error('Overpass mirror returned empty result:', base);
                    continue;
                }
                return data;
            } catch (e) {
                lastError = e;
                console.error('Overpass mirror failed:', base, e);
            }
        }
        throw lastError;
    }

    // Bevorzugter Weg: eigener Server (overpass.php) mit gemeinsamem Cache, schnellem Mirror und
    // längeren Timeouts. Liefert dasselbe Format wie Overpass ({ elements: [...] }).
    async function fetchToiletsFromBackend(bounds) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const qs = new URLSearchParams({
                s: bounds.getSouth(), w: bounds.getWest(), n: bounds.getNorth(), e: bounds.getEast()
            });
            const res = await fetch('overpass.php?' + qs, { signal: controller.signal });
            if (!res.ok) throw new Error(`Backend ${res.status}`);
            const data = await res.json();
            if (!data || !Array.isArray(data.elements)) throw new Error('Backend returned invalid data');
            return data;
        } finally {
            clearTimeout(timeout);
        }
    }

    async function fetchToilets() {
        if (map.getZoom() < 12) {
            showEmptyState(t('zoomHint'));
            removeSplashScreen(); // Sicherstellen, dass der Splash nie hängen bleibt
            return;
        }

        // Bewegt sich die Karte während eines (ggf. langen) Abrufs, würde der neue Ausschnitt
        // sonst verworfen und bliebe leer - stattdessen genau einmal nachladen, sobald wir fertig sind.
        if (isFetching) {
            refetchPending = true;
            return;
        }
        isFetching = true;
        document.getElementById('loading-spinner').classList.remove('hidden');
        // Erste Abfrage in einem neuen Gebiet kann dauern (Overpass): Nutzer kurz informieren.
        const slowHintTimer = setTimeout(() => showToast(t('slowLoadHint'), 'info'), 8000);

        try {
            const dbRes = await fetch('backend.php?all=1');
            globalRatingsDb = await dbRes.json();
            
            let ratedWcs = 0;
            let totalVotes = 0;
            for (const key in globalRatingsDb) {
                const wc = globalRatingsDb[key];
                ratedWcs++;
                totalVotes += (parseInt(wc.usable_yes)||0) + (parseInt(wc.usable_no)||0) + (parseInt(wc.cleanliness_count)||0);
            }
            const statsEl = document.getElementById('app-stats');
            if (ratedWcs > 0 && statsEl) {
                statsEl.innerText = t('statsText', { toilets: ratedWcs, votes: totalVotes });
                statsEl.classList.remove('hidden');
            }
        } catch (e) { }

        const bounds = map.getBounds();
        const cacheKey = getBoundsCacheKey(bounds);
        const query = `
            [out:json][timeout:25];
            (
              nwr["amenity"="toilets"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
              nwr["toilets"="yes"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
              nwr["toilets:eurokey"="yes"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
              nwr["toilets:wheelchair"="yes"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
              nwr["toilets:wheelchair"="designated"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
            );
            out center;
        `;
        try {
            let data;
            try {
                data = await fetchToiletsFromBackend(bounds);
            } catch (backendError) {
                console.error('overpass.php failed, falling back to direct Overpass:', backendError);
                data = await fetchOverpassWithFallback(query);
            }
            allToilets = data.elements;
            saveCachedToiletsForBounds(cacheKey, allToilets);
            renderMarkers();
        } catch (error) {
            const cachedElements = loadCachedToiletsForBounds(cacheKey);
            if (cachedElements && cachedElements.length > 0) {
                allToilets = cachedElements;
                renderMarkers();
                showToast(t('offline'), 'info');
            } else {
                console.error(error);
                showEmptyState(t('loadErrorHint'));
            }
        } finally {
            clearTimeout(slowHintTimer);
            isFetching = false;
            document.getElementById('loading-spinner').classList.add('hidden');
            removeSplashScreen();
            if (refetchPending) {
                refetchPending = false;
                fetchToilets();
            }
        }
    }

    function renderMarkers() {
        markerClusterGroup.clearLayers();
        activeMarkers = [];
        hideEmptyState();
        
        // 1. Welche Filter sind aktiv?
        const reqPub = document.getElementById('filter-public').checked;
        const reqEuro = document.getElementById('filter-eurokey').checked;
        
        const reqChange = document.getElementById('filter-changing').checked;
        const reqOpen = document.getElementById('filter-open').checked;
        const reqSucc = document.getElementById('filter-success').checked;
        const reqFav = document.getElementById('filter-favorites').checked;
        
        const freeCheckbox = document.getElementById('filter-free');
        const reqFree = freeCheckbox ? freeCheckbox.checked : false;
        
        // Unser neuer Anti-Schlecht-Filter
        const noBadCheckbox = document.getElementById('filter-nobad');
        const reqNoBad = noBadCheckbox ? noBadCheckbox.checked : false;

        let savedFavs = JSON.parse(localStorage.getItem('loocator_favs') || '[]');

        allToilets.forEach(toilet => { 
            if (reqFav && !savedFavs.includes(toilet.id)) return; 
            
            const tags = toilet.tags;
            const lat = toilet.lat || (toilet.center && toilet.center.lat);
            const lon = toilet.lon || (toilet.center && toilet.center.lon);
            if (!lat || !lon) return;

            // --- Klassifizierung (mit Tests) aus src/lib/toiletRules.js ---
            const isPublic = ToiletRules.isPublicAccess(tags);
            const isExplicitEurokey = ToiletRules.isExplicitEurokey(tags);
            const isWheelchair = ToiletRules.isWheelchairAccessible(tags);
            const isEurokeyOrWheelchair = isExplicitEurokey || isWheelchair;

            if (!reqPub && !reqEuro) return;

            let matchesFilter = false;
            if (reqPub && isPublic) matchesFilter = true;
            if (reqEuro && isEurokeyOrWheelchair) matchesFilter = true;

            if (!matchesFilter) return;
            // --- ENDE FILTER-LOGIK ---

            // --- UND-FILTER ---
            const hasChanging = ToiletRules.hasChangingTable(tags);
            if (reqChange && !hasChanging) return;
            if (reqOpen && isLikelyClosedNow(tags['opening_hours'])) return;

            const isFree = ToiletRules.isFreeToilet(tags);
            if (reqFree && !isFree) return;

            const { isDefect, isTopRated, isBad } = ToiletRules.classifyRating(globalRatingsDb[toilet.id]);

            if (reqSucc && !isTopRated) return;
            if (reqNoBad && isBad) return;
            const is247 = ToiletRules.isOpen247(tags);

            // --- Pin-Farbe nach Priorität + Status-Badge oben rechts ---
            const priorityKey = ToiletRules.getPriorityKey(tags, savedFavs.includes(toilet.id));

            const statusKey = getStatusKey({ isDefect, isTopRated, is247 });
            const iconHtml = buildPinIcon(priorityKey, statusKey, isDefect);

            const customIcon = L.divIcon({
                className: 'google-style-pin bg-transparent',
                html: iconHtml,
                iconSize: [40, 52],
                iconAnchor: [20, 50]
            });

            const marker = L.marker([lat, lon], { 
                icon: customIcon, 
                isTopRated: isTopRated,
                is247: is247,
                hasChanging: hasChanging,
                isDefect: isDefect,
                priorityKey: priorityKey
            });
            marker.on('click', () => {
                openSheet(toilet, isEurokeyOrWheelchair, isExplicitEurokey, isWheelchair, is247, hasChanging, isDefect, isTopRated, lat, lon);
                toggleMenu(false);
            });
            markerClusterGroup.addLayer(marker);
            activeMarkers.push(marker);
        });

        flushPendingOpen();
    }

    map.on('click', () => {
        closeSheet();
        toggleMenu(false);
        if (searchMarker) {
            map.removeLayer(searchMarker);
            searchMarker = null;
        }
    });
    let sheetState = 0; // 0=Zu, 1=Stufe1, 2=Stufe2
    const bottomSheetEl = document.getElementById('bottom-sheet');
    const feedbackSection = document.getElementById('feedback-section');
    
    function updateSheetState() {
        if (sheetState === 0) {
            bottomSheetEl.style.transform = 'translateY(calc(100% + 2rem))'; // + Abstand: md:mb-4 und Schatten dürfen nicht hervorschauen
            bottomSheetEl.style.overflowY = 'hidden';
            if (routingLine) { map.removeLayer(routingLine); routingLine = null; }
        } else if (sheetState === 1) {
            bottomSheetEl.style.transform = 'translateY(55%)'; // Stufe 1: Nur oberer Teil sichtbar
            bottomSheetEl.style.overflowY = 'hidden';
            if(feedbackSection) feedbackSection.style.opacity = '0.2';
        } else if (sheetState === 2) {
            bottomSheetEl.style.transform = 'translateY(0%)'; // Stufe 2: Ganz offen
            bottomSheetEl.style.overflowY = 'auto';
            if(feedbackSection) feedbackSection.style.opacity = '1';
        }
    }

    // Drag-Logik (Maus, Touch, Stift über Pointer Events): Der Griff folgt dem Finger/Zeiger,
    // beim Loslassen rastet das Sheet auf Stufe 0/1/2 ein. Ein Tap ohne Bewegung
    // schaltet wie bisher weiter (1 -> 2, 2 -> 0).
    const SHEET_PEEK_RATIO = 0.55; // muss zu translateY(55%) in updateSheetState passen
    const SHEET_TAP_SLOP = 6;      // px - darunter gilt die Geste als Tap
    const SHEET_FLICK_SPEED = 0.5; // px/ms - darüber wird eine Wischgeste zum Stufenwechsel
    let sheetDrag = null;

    function sheetOffsetForState(state, height) {
        return state === 0 ? height : state === 1 ? height * SHEET_PEEK_RATIO : 0;
    }

    function sheetDragEnd(e, cancelled) {
        if (!sheetDrag || e.pointerId !== sheetDrag.pointerId) return;
        const drag = sheetDrag;
        sheetDrag = null;
        if (btnCloseSheet.hasPointerCapture(e.pointerId)) btnCloseSheet.releasePointerCapture(e.pointerId);
        bottomSheetEl.style.transition = '';

        if (cancelled) {
            updateSheetState();
            return;
        }
        if (!drag.moved) {
            if (sheetState === 1) sheetState = 2;
            else if (sheetState === 2) sheetState = 0;
            updateSheetState();
            return;
        }

        const height = bottomSheetEl.offsetHeight;
        const offset = Math.min(Math.max(drag.startOffset + (e.clientY - drag.startY), 0), height);
        const elapsed = Math.max(e.timeStamp - drag.startTime, 1);
        const speed = (e.clientY - drag.startY) / elapsed;
        if (Math.abs(speed) > SHEET_FLICK_SPEED) {
            // Flick: genau eine Stufe in Wischrichtung
            sheetState = speed > 0 ? Math.max(sheetState - 1, 0) : Math.min(sheetState + 1, 2);
        } else {
            // Langsames Ziehen: nächstliegende Stufe
            sheetState = [0, 1, 2].reduce((best, st) =>
                Math.abs(sheetOffsetForState(st, height) - offset) < Math.abs(sheetOffsetForState(best, height) - offset) ? st : best, 2);
        }
        updateSheetState();
    }

    btnCloseSheet.addEventListener('pointerdown', (e) => {
        if (sheetState === 0 || (e.pointerType === 'mouse' && e.button !== 0)) return;
        btnCloseSheet.setPointerCapture(e.pointerId);
        sheetDrag = {
            pointerId: e.pointerId,
            startY: e.clientY,
            startTime: e.timeStamp,
            startOffset: sheetOffsetForState(sheetState, bottomSheetEl.offsetHeight),
            moved: false
        };
    });

    btnCloseSheet.addEventListener('pointermove', (e) => {
        if (!sheetDrag || e.pointerId !== sheetDrag.pointerId) return;
        const dy = e.clientY - sheetDrag.startY;
        if (!sheetDrag.moved) {
            if (Math.abs(dy) < SHEET_TAP_SLOP) return;
            sheetDrag.moved = true;
            bottomSheetEl.style.transition = 'none';
            bottomSheetEl.style.overflowY = 'hidden';
        }
        const height = bottomSheetEl.offsetHeight;
        const offset = Math.min(Math.max(sheetDrag.startOffset + dy, 0), height);
        bottomSheetEl.style.transform = `translateY(${offset}px)`;
    });

    btnCloseSheet.addEventListener('pointerup', (e) => sheetDragEnd(e, false));
    btnCloseSheet.addEventListener('pointercancel', (e) => sheetDragEnd(e, true));

    function closeSheet() {
        sheetState = 0;
        updateSheetState();
    }

    async function openSheet(toilet, isEurokeyOrWheelchair, isExplicitEurokey, isWheelchair, is247, hasChanging, isDefect, isTopRated, lat, lon) {
        currentToiletData = toilet;
        const tags = toilet.tags;

        document.getElementById('routing-warning').classList.add('hidden');
        if (routingLine) map.removeLayer(routingLine);

        if (userLocation) {
            routingLine = L.polyline([userLocation, [lat, lon]], { color: '#9ca3af', weight: 4, dashArray: '8, 8', lineCap: 'round' }).addTo(map);
            fetch(`https://router.project-osrm.org/route/v1/foot/${userLocation.lng},${userLocation.lat};${lon},${lat}?geometries=geojson`)
                .then(res => res.json())
                .then(data => {
                    if(data.routes && data.routes.length > 0) {
                        map.removeLayer(routingLine);
                        routingLine = L.geoJSON(data.routes[0].geometry, { style: { color: '#3b82f6', weight: 5, opacity: 0.8 } }).addTo(map);
                        if (isEurokeyOrWheelchair) document.getElementById('routing-warning').classList.remove('hidden');
                    }
                }).catch(() => console.log('Routing fallback active'));
        }

        let baseType = '';
        let isStandardPublic = false;

        // 1. Prüfen, was für eine Art von Ort es ist
        if (tags.highway === 'services') {
            baseType = t('tRestStop');
        } else if (tags.highway === 'rest_area') {
            baseType = t('tRestArea');
        } else if (tags.amenity === 'fuel') {
            baseType = t('tFuel');
        } else {
            baseType = t('tPublic');
            isStandardPublic = true; // Wir merken uns: Es ist ein ganz normales WC!
        }

        // 2. Zusätze für Eurokey / Rollstuhl sauber aus den Translations holen
        if (isEurokeyOrWheelchair) {
            if (isExplicitEurokey) {
                // Wenn es ein normales WC ist -> "Eurokey-WC", sonst z.B. "Tankstelle (Eurokey)"
                baseType = isStandardPublic ? t('tPublicEurokey') : baseType + ' (' + t('tAddEuro') + ')';
            } else if (isWheelchair) {
                // Wenn es ein normales WC ist -> "Rollstuhl-WC", sonst z.B. "Rastplatz (Rollstuhlgerecht)"
                baseType = isStandardPublic ? t('tPublicWheel') : baseType + ' (' + t('tAddWheel') + ')';
            }
        }

        document.getElementById('sheet-title').innerText = baseType;
        
        updateFavButtonUI();

        // --- DISTANZ MIT GEHZEIT ---
        const distEl = document.getElementById('sheet-distance');
        if (userLocation) {
            const targetLatLng = L.latLng(lat, lon);
            const dist = Math.round(map.distance(userLocation, targetLatLng));
            
            let walkingMinutes = Math.round(dist / 1.2 / 60);
            if(walkingMinutes < 1) walkingMinutes = 1;
            
            let distString = '';
            if (dist > 1000) {
                distString = t('distKm', { dist: (dist/1000).toFixed(1) });
            } else {
                distString = t('distM', { dist: dist });
            }
            
            distEl.innerText = distString + " (" + walkingMinutes + t('distTimeMin') + ")";
        } else {
            distEl.innerText = '';
        }

        const subtitleEl = document.getElementById('sheet-subtitle');
        if (tags.name) {
            subtitleEl.innerText = tags.name;
            subtitleEl.classList.remove('hidden');
        } else {
            subtitleEl.classList.add('hidden');
        }

        const addressEl = document.getElementById('sheet-address');
        let addressParts = [];
        if (tags['addr:street']) {
            let streetStr = tags['addr:street'];
            if (tags['addr:housenumber']) streetStr += ' ' + tags['addr:housenumber'];
            addressParts.push(streetStr);
        }
        let cityStr = [];
        if (tags['addr:postcode']) cityStr.push(tags['addr:postcode']);
        if (tags['addr:city']) cityStr.push(tags['addr:city']);
        if (cityStr.length > 0) addressParts.push(cityStr.join(' '));
        rememberLastOpened(toilet, baseType, addressParts.join(', '), lat, lon);

        if (addressParts.length > 0) {
            addressEl.innerText = addressParts.join(', ');
            addressEl.classList.remove('hidden');
        } else {
            const cacheKey = `${lat.toFixed(5)},${lon.toFixed(5)}`;
            const cacheEntry = addressCache[cacheKey];
            const now = Date.now();

            if (cacheEntry && cacheEntry.expires > now && cacheEntry.value) {
                addressEl.innerText = cacheEntry.value;
                addressEl.classList.remove('hidden');
            } else if (cacheEntry && cacheEntry.expires > now && cacheEntry.value === null) {
                addressEl.classList.add('hidden');
            } else {
                addressEl.innerText = t('addrLoading');
                addressEl.classList.remove('hidden');
                fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`)
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.address) {
                            let a = data.address;
                            let road = a.road || a.pedestrian || a.footway || a.path || a.suburb;
                            let house = a.housenumber || '';
                            let city = a.city || a.town || a.village || a.county;
                            let post = a.postcode || '';
                            let str = [];
                            if (road) str.push(road + (house ? ' ' + house : ''));
                            let cStr = [];
                            if (post) cStr.push(post);
                            if (city) cStr.push(city);
                            if (cStr.length > 0) str.push(cStr.join(' '));
                            
                            if (str.length > 0) {
                                const fullAddress = str.join(', ');
                                addressCache[cacheKey] = { value: fullAddress, expires: now + ADDRESS_CACHE_TTL };
                                try {
                                    localStorage.setItem('loocator_address_cache', JSON.stringify(addressCache));
                                } catch (e) {}
                                addressEl.innerText = fullAddress;
                            } else {
                                addressCache[cacheKey] = { value: null, expires: now + ADDRESS_CACHE_TTL };
                                try {
                                    localStorage.setItem('loocator_address_cache', JSON.stringify(addressCache));
                                } catch (e) {}
                                addressEl.classList.add('hidden');
                            }
                        } else {
                            addressCache[cacheKey] = { value: null, expires: now + ADDRESS_CACHE_TTL };
                            try {
                                localStorage.setItem('loocator_address_cache', JSON.stringify(addressCache));
                            } catch (e) {}
                            addressEl.classList.add('hidden');
                        }
                    }).catch(() => {
                        addressEl.classList.add('hidden');
                    });
            }
        }

        const noteEl = document.getElementById('sheet-note');
        const noteTextEl = noteEl.querySelector('span');
        let extraNotes = [];
        if (tags.level !== undefined) {
            let lvl = parseInt(tags.level);
            let lvlTxt = t('levelInfo');
            if (lvl === 0) lvlTxt = t('levelEG');
            else if (lvl < 0) lvlTxt = t('levelUG', { lvl: Math.abs(lvl) });
            else if (lvl > 0) lvlTxt = t('levelOG', { lvl: lvl });
            extraNotes.push(lvlTxt);
        }
        if (tags.description) extraNotes.push(tags.description);
        
        if (extraNotes.length > 0) {
            noteTextEl.innerText = extraNotes.join('\n');
            noteEl.classList.remove('hidden');
        } else {
            noteEl.classList.add('hidden');
        }

        let genderInfo = '';
        if (tags.unisex === 'yes') genderInfo = t('accUnisex');
        else if (tags.male === 'yes' && tags.female === 'yes') genderInfo = t('accBoth');
        else if (tags.female === 'yes') genderInfo = t('accFemale');
        else if (tags.male === 'yes') genderInfo = t('accMale');

        let info = [];
        if(isDefect) info.push(t('iDefect'));
        if(isTopRated && !isDefect) info.push(t('iSuccess'));
        if(genderInfo) info.push(genderInfo);
        
        if(is247) info.push(t('i247'));
        else if (tags['opening_hours']) info.push(t('iHours') + tags['opening_hours']);
        
        if(tags.fee || tags['toilets:fee']) {
            let feeVal = tags.fee || tags['toilets:fee'];
            if (feeVal.toLowerCase() === 'yes') feeVal = t('btnYes');
            else if (feeVal.toLowerCase() === 'no') feeVal = t('feeFree');
            info.push(t('iCost') + feeVal);
        }
        
        if(!isWheelchair && (tags.wheelchair || tags['toilets:wheelchair'])) {
            let wheelVal = tags.wheelchair || tags['toilets:wheelchair'];
            if (wheelVal.toLowerCase() === 'yes') wheelVal = t('btnYes');
            else if (wheelVal.toLowerCase() === 'no') wheelVal = t('btnNo');
            else if (wheelVal.toLowerCase() === 'limited') wheelVal = t('accLimited');
            info.push(t('iWheel') + wheelVal);
        }
        
        if(hasChanging) info.push(t('iChanging'));

        document.getElementById('sheet-info').innerText = info.length ? info.join('\n') : t('iNone');

        document.getElementById('btn-navigate').onclick = () => {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            if (isIOS) {
                window.location.href = `http://maps.apple.com/?daddr=${lat},${lon}`;
            } else {
                window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
            }
        };

        document.getElementById('btn-share').onclick = () => {
            const shareUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
            if (navigator.share) {
                navigator.share({ title: 'Loocator', text: t('shareText') + ' ' + baseType, url: shareUrl }).catch(()=>{});
            } else {
                navigator.clipboard.writeText(shareUrl);
                showToast(t('alertCopied'), 'success');
            }
        };

        document.getElementById('stat-usable').innerText = t('statLoading');
        document.getElementById('stat-clean').innerText = t('statLoading');
        // Öffne das Sheet nun in Stufe 1 anstelle von Stufe 2
        sheetState = 1;
        updateSheetState();

        isTooFarToVote = !canVote();
        const tooFar = isTooFarToVote;
        updateVoteUIState(tooFar);

        await loadRatings(toilet.id);
        checkVotedStatus(toilet.id);
    }

    document.getElementById('btn-fav').addEventListener('click', () => {
        if (!currentToiletData) return;
        let favs = JSON.parse(localStorage.getItem('loocator_favs') || '[]');
        if (favs.includes(currentToiletData.id)) {
            favs = favs.filter(id => id !== currentToiletData.id);
        } else {
            favs.push(currentToiletData.id);
        }
        localStorage.setItem('loocator_favs', JSON.stringify(favs));
        updateFavButtonUI();
        renderMarkers();
    });

    function updateFavButtonUI() {
        if (!currentToiletData) return;
        let favs = JSON.parse(localStorage.getItem('loocator_favs') || '[]');
        const icon = document.getElementById('btn-fav-icon');
        if (favs.includes(currentToiletData.id)) {
            icon.setAttribute('fill', 'currentColor');
            icon.classList.remove('text-stone-300', 'dark:text-deep-500');
            icon.classList.add('text-brand-600', 'dark:text-brand-400');
        } else {
            icon.setAttribute('fill', 'none');
            icon.classList.remove('text-brand-600', 'dark:text-brand-400');
            icon.classList.add('text-stone-300', 'dark:text-deep-500');
        }
    }

    async function loadRatings(osmId) {
        try {
            const res = await fetch(`backend.php?id=${osmId}`);
            if (!res.ok) throw new Error();
            const data = await res.json();

            const yesVotes = parseInt(data.usable_yes) || 0;
            const noVotes = parseInt(data.usable_no) || 0;
            const totalVotes = yesVotes + noVotes;
            
            if (totalVotes === 0) {
                document.getElementById('stat-usable').innerText = t('statNoData');
            } else {
                const percent = Math.round((yesVotes / totalVotes) * 100);
                document.getElementById('stat-usable').innerText = t('successRate', { percent: percent, total: totalVotes });
            }

            const cleanCount = parseInt(data.cleanliness_count) || 0;
            const cleanSum = parseInt(data.cleanliness_sum) || 0;

            if (cleanCount === 0) {
                document.getElementById('stat-clean').innerText = t('statNoRating');
            } else {
                const avg = (cleanSum / cleanCount).toFixed(1);
                document.getElementById('stat-clean').innerText = t('cleanRate', { avg: avg, count: cleanCount });
            }
        } catch(e) {
            document.getElementById('stat-usable').innerText = t('statLoadError');
            document.getElementById('stat-clean').innerText = t('statLoadError');
        }
    }

    // Gibt die Distanz in Metern zurück, oder null wenn sie nicht berechnet werden kann.
    function distanceToToilet() {
        if (!userLocation || !currentToiletData) return null;
        const targetLat = currentToiletData.lat || (currentToiletData.center && currentToiletData.center.lat);
        const targetLon = currentToiletData.lon || (currentToiletData.center && currentToiletData.center.lon);
        if (!targetLat || !targetLon) return null;
        return map.distance(userLocation, L.latLng(targetLat, targetLon));
    }

    function isNearToilet(maxMeters = 150) {
        const dist = distanceToToilet();
        return dist !== null && dist <= maxMeters;
    }

    // Bewerten darf man in der Nähe (150 m) ODER wenn man die Nachfrage "Ja, war dort" für genau
    // diese Toilette bestätigt hat (bis 14 Tage, danach gilt wieder die 150-m-Regel).
    function canVote() {
        if (isNearToilet()) return true;
        return Boolean(currentToiletData)
            && VisitFollowUp.canVoteRemotely(readStorageObject(VISITED_KEY), currentToiletData.id, Date.now());
    }

    // Statt die Bewertungs-Karte interaktiv aussehen zu lassen und den Nutzer erst NACH
    // dem Tippen mit einem harten "Verboten"-Overlay abzuweisen, zeigen wir proaktiv einen
    // warmen Hinweis mit der tatsächlichen Distanz - Fehlervermeidung statt Fehlerreaktion.
    function updateVoteUIState(tooFar, maxMeters = 150) {
        const voteButtons = [document.getElementById('btn-usable-yes'), document.getElementById('btn-usable-no')];
        const starButtons = document.querySelectorAll('.btn-star');
        const voteControls = document.getElementById('vote-controls');
        const voteHint = document.getElementById('vote-distance-hint');
        const statUsable = document.getElementById('stat-usable');

        voteButtons.forEach(b => {
            if (!b) return;
            b.disabled = tooFar;
        });
        starButtons.forEach(b => {
            if (!b) return;
            b.disabled = tooFar;
        });

        // Freigabe durch "Ja, war dort": Bewertung ist möglich, obwohl man weit weg ist.
        const viaFollowUp = !tooFar && !isNearToilet();

        if (voteControls) voteControls.classList.toggle('hidden', tooFar);
        if (voteHint) {
            voteHint.classList.toggle('hidden', !tooFar && !viaFollowUp);
            if (viaFollowUp) {
                voteHint.querySelector('span').innerText = t('voteFollowUpHint');
            } else if (tooFar) {
                const dist = distanceToToilet();
                const remaining = dist !== null ? Math.max(0, Math.round(dist - maxMeters)) : null;
                voteHint.querySelector('span').innerText = remaining !== null
                    ? t('voteDistanceHint', { dist: remaining })
                    : t('voteOverlayText');
            }
        }

        if (statUsable) {
            statUsable.innerText = tooFar ? t('voteDisabledTooFar') : t('statLoading');
        }
    }

    async function sendVote(payload) {
        if (!canVote()) {
            customAlert(t('alertTooFarToVote'));
        return;
        }
        payload.id = currentToiletData.id;
        // Stimmen nach "Ja, war dort" (ohne in der Nähe zu sein) werden markiert, damit man sie später filtern kann.
        payload.source = isNearToilet() ? 'near' : 'followup';
        try {
            await fetch('backend.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const voted = JSON.parse(localStorage.getItem('loocator_voted') || '{}');
            if(!voted[payload.id]) voted[payload.id] = {};
            if(payload.usable) voted[payload.id].usable = true;
            if(payload.cleanliness) voted[payload.id].cleanliness = true;
            localStorage.setItem('loocator_voted', JSON.stringify(voted));

            if (!globalRatingsDb[payload.id]) globalRatingsDb[payload.id] = { usable_yes: 0, usable_no: 0, cleanliness_sum: 0, cleanliness_count: 0 };
            if (payload.usable === 'yes') globalRatingsDb[payload.id].usable_yes += 1;
            if (payload.usable === 'no') globalRatingsDb[payload.id].usable_no += 1;

            showToast(t('voteThanks'), 'success');
            addKarmaPoint();
            loadRatings(payload.id);
            checkVotedStatus(payload.id);
            renderMarkers();
        } catch(e) {
            customAlert(t('alertError'));
        }
    }

    document.getElementById('btn-usable-yes').addEventListener('click', () => sendVote({usable: 'yes'}));
    document.getElementById('btn-usable-no').addEventListener('click', () => sendVote({usable: 'no'}));
    document.querySelectorAll('.btn-star').forEach(starBtn => {
        starBtn.addEventListener('click', (e) => {
            const val = parseInt(e.target.closest('button').getAttribute('data-val'));
            sendVote({cleanliness: val});
        });
    });

    function checkVotedStatus(osmId) {
        const voted = JSON.parse(localStorage.getItem('loocator_voted')) || {};
        const thisVote = voted[osmId] || {};
        const btnYes = document.getElementById('btn-usable-yes');
        const btnNo = document.getElementById('btn-usable-no');
        const starDiv = document.getElementById('star-rating');
        const tooFar = !canVote();

        if (tooFar) {
            updateVoteUIState(true);
            return;
        }

        if (btnYes && btnNo) {
            if (thisVote.usable !== undefined) {
                btnYes.disabled = true;
                btnYes.classList.add('opacity-50');
                btnNo.disabled = true;
                btnNo.classList.add('opacity-50');
            } else {
                btnYes.disabled = false;
                btnYes.classList.remove('opacity-50');
                btnNo.disabled = false;
                btnNo.classList.remove('opacity-50');
            }
        }

        if (starDiv) {
            if (thisVote.cleanliness) {
                starDiv.classList.add('opacity-50', 'pointer-events-none');
            } else {
                starDiv.classList.remove('opacity-50', 'pointer-events-none');
            }
        }
    }

    // --- NACHFRAGE: "Hast du diese Toilette aufgesucht? Wie war's?" ---
    // Die zuletzt geöffnete Toilette wird lokal gemerkt. Beim nächsten Öffnen der App (oder nach
    // mindestens 15 min im Hintergrund) fragen wir nach. Wer "Ja, war dort" sagt, darf genau diese
    // Toilette bewerten - auch aus der Ferne und bei erneutem Aufruf (siehe canVote()).
    const LAST_OPENED_KEY = 'loocator_last_opened';
    const VISITED_KEY = 'loocator_visited';
    const followUpModal = document.getElementById('followup-modal');
    let followUpToilet = null;

    function readStorageObject(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key));
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    function writeStorageObject(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            // Speicher voll/gesperrt: Nachfrage entfällt, alles andere funktioniert weiter.
        }
    }

    function rememberLastOpened(toilet, title, address, lat, lon) {
        writeStorageObject(LAST_OPENED_KEY, {
            id: toilet.id,
            title: title,
            name: (toilet.tags && toilet.tags.name) || '',
            address: address,
            lat: lat,
            lon: lon,
            ts: Date.now()
        });
    }

    function maybeShowFollowUp() {
        if (!followUpModal || !followUpModal.classList.contains('hidden')) return;
        if (!document.getElementById('tutorial-modal').classList.contains('hidden')) return;

        const last = readStorageObject(LAST_OPENED_KEY);
        const visited = readStorageObject(VISITED_KEY);
        const voted = readStorageObject('loocator_voted');
        if (!VisitFollowUp.shouldPromptFollowUp(last, visited, voted, Date.now())) return;

        followUpToilet = last;
        const place = [last.name, last.address].filter(Boolean).join(', ') || last.title || '';
        document.getElementById('followup-body').innerText = t('followUpBody', { place: place });
        followUpModal.classList.remove('hidden');
        document.getElementById('btn-followup-yes').focus();
    }

    function hideFollowUp() {
        followUpModal.classList.add('opacity-0');
        setTimeout(() => {
            followUpModal.classList.add('hidden');
            followUpModal.classList.remove('opacity-0');
        }, 300);
    }

    // Öffnet die Detailansicht einer Toilette anhand ihrer ID, unabhängig von den aktiven Filtern.
    function openToiletById(id) {
        const toilet = allToilets.find(item => item.id === id);
        if (!toilet) return false;
        const tags = toilet.tags;
        const lat = toilet.lat || (toilet.center && toilet.center.lat);
        const lon = toilet.lon || (toilet.center && toilet.center.lon);
        if (!lat || !lon) return false;
        const isExplicitEurokey = ToiletRules.isExplicitEurokey(tags);
        const isWheelchair = ToiletRules.isWheelchairAccessible(tags);
        const { isDefect, isTopRated } = ToiletRules.classifyRating(globalRatingsDb[toilet.id]);
        openSheet(toilet, isExplicitEurokey || isWheelchair, isExplicitEurokey, isWheelchair,
            ToiletRules.isOpen247(tags), ToiletRules.hasChangingTable(tags), isDefect, isTopRated, lat, lon);
        return true;
    }

    // Wird nach jedem renderMarkers() aufgerufen: öffnet die vorgemerkte Toilette, sobald ihre Daten da sind.
    function flushPendingOpen() {
        if (pendingOpenId === null) return false;
        const opened = openToiletById(pendingOpenId);
        if (opened) pendingOpenId = null;
        return opened;
    }

    document.getElementById('btn-followup-yes').addEventListener('click', () => {
        if (!followUpToilet) return;
        const target = followUpToilet;
        followUpToilet = null;

        const visited = readStorageObject(VISITED_KEY) || {};
        visited[target.id] = { confirmedAt: Date.now() };
        writeStorageObject(VISITED_KEY, visited);
        localStorage.removeItem(LAST_OPENED_KEY);
        hideFollowUp();

        // Karte zur Toilette bringen und ihre Detailansicht öffnen (Bewertungsfelder sind freigeschaltet).
        pendingOpenId = target.id;
        setTimeout(() => { pendingOpenId = null; }, 20000); // Daten kamen nicht an: nicht später unerwartet öffnen
        autoFollow = false;
        updateLocationButtonUI();
        if (!flushPendingOpen()) {
            map.setView([target.lat, target.lon], Math.max(map.getZoom(), 17));
        }
    });

    function declineFollowUp() {
        followUpToilet = null;
        localStorage.removeItem(LAST_OPENED_KEY);
        hideFollowUp();
    }
    document.getElementById('btn-followup-no').addEventListener('click', declineFollowUp);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && followUpModal && !followUpModal.classList.contains('hidden')) declineFollowUp();
    });

    // PWAs bleiben oft im Speicher: auch beim Zurückkehren nach längerer Pause nachfragen.
    let hiddenAt = null;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            hiddenAt = Date.now();
            return;
        }
        if (hiddenAt !== null && Date.now() - hiddenAt >= VisitFollowUp.MIN_AGE_MS) maybeShowFollowUp();
        hiddenAt = null;
    });

    updateKarmaUI();
    fetchToilets();
});