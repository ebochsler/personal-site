/* ============================================================
   Travel Page Scripts — City Log & Ratings
   ============================================================ */

(function () {
    'use strict';

    const root = document.documentElement;

    // ── Theme Toggle ─────────────────────────────────────────────
    const themeToggle = document.getElementById('theme-toggle');

    function setTheme(theme) {
        root.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }

    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);

    themeToggle.addEventListener('click', () => {
        const current = root.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
        cancelAnimationFrame(animationId);
        initCanvas();
        renderCityMap();
        // Re-render spider charts so they pick up CSS var changes
        document.querySelectorAll('.spider-chart-container').forEach((container) => {
            const ratingsStr = container.getAttribute('data-ratings');
            if (ratingsStr) {
                renderSpiderChart(container, JSON.parse(ratingsStr));
            }
        });
    });

    // ── Mobile Nav Toggle ──────────────────────────────────────
    const navToggle = document.querySelector('.nav-toggle');
    const nav = document.getElementById('nav');

    navToggle.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('open');
        navToggle.classList.toggle('active');
        navToggle.setAttribute('aria-expanded', isOpen);
    });

    nav.querySelectorAll('.nav-link').forEach((link) => {
        link.addEventListener('click', () => {
            nav.classList.remove('open');
            navToggle.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });

    // ── Header Background on Scroll ────────────────────────────
    const header = document.getElementById('header');

    window.addEventListener(
        'scroll',
        () => {
            const style = getComputedStyle(root);
            if (window.scrollY > 50) {
                header.style.background = style.getPropertyValue('--header-bg-scroll');
            } else {
                header.style.background = style.getPropertyValue('--header-bg');
            }
        },
        { passive: true }
    );

    // ── Scroll Reveal ──────────────────────────────────────────
    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.15 }
    );

    document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

    // ── Animated Background (Canvas) ───────────────────────────
    const canvas = document.getElementById('bg-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId;

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function createParticles() {
        particles = [];
        const count = Math.floor((canvas.width * canvas.height) / 18000);
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 1.5 + 0.5,
                dx: (Math.random() - 0.5) * 0.3,
                dy: (Math.random() - 0.5) * 0.3,
                opacity: Math.random() * 0.4 + 0.1,
            });
        }
    }

    function getParticleColor() {
        return getComputedStyle(root).getPropertyValue('--particle-color').trim();
    }

    function drawGrid() {
        const c = getParticleColor();
        ctx.strokeStyle = `rgba(${c}, 0.03)`;
        ctx.lineWidth = 0.5;
        const spacing = 60;
        for (let x = 0; x < canvas.width; x += spacing) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += spacing) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }
    }

    function drawParticles() {
        const c = getParticleColor();
        particles.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${c}, ${p.opacity})`;
            ctx.fill();
        });
    }

    function updateParticles() {
        particles.forEach((p) => {
            p.x += p.dx; p.y += p.dy;
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;
        });
    }

    function drawConnections() {
        const c = getParticleColor();
        const maxDist = 120;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < maxDist) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(${c}, ${0.06 * (1 - dist / maxDist)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid(); updateParticles(); drawConnections(); drawParticles();
        animationId = requestAnimationFrame(animate);
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function initCanvas() {
        resizeCanvas(); createParticles();
        if (!prefersReducedMotion.matches) { animate(); }
        else { drawGrid(); drawParticles(); drawConnections(); }
    }

    window.addEventListener('resize', () => { cancelAnimationFrame(animationId); initCanvas(); });
    initCanvas();

    // ── Tier Colors ──────────────────────────────────────────────
    const TIER_COLORS = {
        dark: { S: '#fbbf24', A: '#00d4ff', B: '#00ff88', C: '#ff6b35', D: '#ef4444' },
        light: { S: '#b8860b', A: '#0088cc', B: '#00994d', C: '#d45a2a', D: '#dc2626' },
    };

    function getTierColor(tier) {
        const mode = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        return TIER_COLORS[mode][tier] || TIER_COLORS[mode].B;
    }

    function getTileUrl() {
        const isDark = root.getAttribute('data-theme') !== 'light';
        return isDark
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    }

    // ── Data Fetching & Rendering ──────────────────────────────
    let travelData = null;
    let cityMapInstance = null;

    fetch('data/travel-data.json')
        .then((r) => {
            if (!r.ok) throw new Error('Data not found');
            return r.json();
        })
        .then((data) => {
            travelData = data;
            renderAll(data);
        })
        .catch(() => {
            const subtitle = document.getElementById('travel-subtitle');
            if (subtitle) subtitle.textContent = 'No data available yet';
            const cards = document.getElementById('stat-cards');
            if (cards) cards.innerHTML =
                '<p class="running-error">Create <code>data/travel-data.json</code> to get started.</p>';
        });

    function renderAll(data) {
        const subtitle = document.getElementById('travel-subtitle');
        if (subtitle) subtitle.textContent = `${data.summary.total_cities} cities rated across ${data.summary.total_continents} continents`;
        renderStatCards(data.summary);
        setTimeout(() => renderCityMap(), 100);
        renderCityCards(data.cities);
        setupTierFilters();
    }

    // ── Stat Card Animated Counters ────────────────────────────
    function renderStatCards(summary) {
        const targets = {
            'stat-cities': { value: summary.total_cities, decimals: 0 },
            'stat-countries': { value: summary.total_countries, decimals: 0 },
            'stat-continents': { value: summary.total_continents, decimals: 0 },
            'stat-avg': { value: summary.avg_overall, decimals: 1 },
        };

        Object.entries(targets).forEach(([id, cfg]) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.setAttribute('data-target', cfg.value);

            const observer = new IntersectionObserver(
                (entries) => {
                    if (entries[0].isIntersecting) {
                        animateCounter(el, cfg);
                        observer.unobserve(el);
                    }
                },
                { threshold: 0.5 }
            );
            observer.observe(el);
        });
    }

    function animateCounter(el, cfg) {
        const duration = 1200;
        const start = performance.now();
        const target = cfg.value;

        function tick(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            const current = target * ease;

            if (cfg.decimals === 0) {
                el.textContent = Math.round(current);
            } else {
                el.textContent = current.toFixed(cfg.decimals);
            }

            if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    }

    // ── City Map ───────────────────────────────────────────────
    function renderCityMap() {
        if (cityMapInstance) {
            cityMapInstance.remove();
            cityMapInstance = null;
        }

        if (!travelData || !travelData.cities || travelData.cities.length === 0) return;

        const mapEl = document.getElementById('city-map');
        if (!mapEl) return;

        const isDark = root.getAttribute('data-theme') !== 'light';
        const tileUrl = getTileUrl();

        const map = L.map(mapEl, {
            zoomControl: true,
            attributionControl: false,
            scrollWheelZoom: true,
        });

        L.tileLayer(tileUrl, { subdomains: 'abcd', maxZoom: 19 }).addTo(map);

        const bounds = [];

        travelData.cities.forEach((city) => {
            if (!city.lat || !city.lng) return;

            const color = getTierColor(city.tier);
            const latlng = [city.lat, city.lng];
            bounds.push(latlng);

            const circle = L.circleMarker(latlng, {
                radius: 8,
                fillColor: color,
                fillOpacity: isDark ? 0.8 : 0.7,
                color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)',
                weight: 1.5,
            }).addTo(map);

            const popupContent = `
                <div class="venue-popup">
                    <strong class="venue-popup-name">${city.name}</strong>
                    <span class="venue-popup-cat">${city.country}</span>
                    <span class="venue-popup-stat">Tier ${city.tier} &middot; ${city.overall}/10</span>
                </div>
            `;
            circle.bindPopup(popupContent);
        });

        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 4 });
        }

        cityMapInstance = map;
    }

    // ── City Cards ─────────────────────────────────────────────
    function renderCityCards(cities) {
        const grid = document.getElementById('city-cards-grid');
        if (!grid) return;
        grid.innerHTML = '';

        // Sort by overall descending
        const sorted = [...cities].sort((a, b) => b.overall - a.overall);

        sorted.forEach((city) => {
            const card = document.createElement('div');
            card.className = 'city-card reveal';
            card.setAttribute('data-tier', city.tier);

            const tierClass = 'tier-' + city.tier.toLowerCase();

            card.innerHTML = `
                <div class="city-card-header">
                    <div class="city-card-title-row">
                        <h3 class="city-card-name">${city.name}</h3>
                        <span class="tier-badge ${tierClass}">${city.tier}</span>
                    </div>
                    <span class="city-card-country mono">${city.country} &middot; ${city.visited_year}</span>
                </div>
                <div class="spider-chart-container" data-ratings='${JSON.stringify(city.ratings)}'></div>
                <div class="city-card-footer">
                    <span class="city-card-overall">${city.overall}<span class="city-card-overall-unit">/10</span></span>
                    <p class="city-card-notes">${city.notes}</p>
                </div>
            `;

            grid.appendChild(card);

            // Render spider chart into the container
            const spiderContainer = card.querySelector('.spider-chart-container');
            renderSpiderChart(spiderContainer, city.ratings);

            // Observe for reveal animation
            revealObserver.observe(card);
        });
    }

    // ── Spider / Radar Chart (Pure SVG) ─────────────────────────
    const RATING_KEYS = [
        { key: 'public_transit', label: 'Transit' },
        { key: 'food', label: 'Food' },
        { key: 'cost', label: 'Cost' },
        { key: 'drinks_nightlife', label: 'Nightlife' },
        { key: 'arts_culture', label: 'Culture' },
        { key: 'public_space', label: 'Space' },
        { key: 'biking_walking', label: 'Biking' },
    ];

    function renderSpiderChart(container, ratings) {
        container.innerHTML = '';

        const size = 200;
        const cx = 100;
        const cy = 100;
        const maxR = 72;
        const n = RATING_KEYS.length;
        const angleStep = (2 * Math.PI) / n;
        const startAngle = -Math.PI / 2; // 12 o'clock

        const style = getComputedStyle(root);
        const primaryColor = style.getPropertyValue('--primary').trim();
        const mutedColor = style.getPropertyValue('--text-muted').trim();
        const gridColor = style.getPropertyValue('--border-subtle').trim();

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.setAttribute('class', 'spider-chart');

        // Helper: get point on axis at given score (0-10)
        function getPoint(axisIndex, score) {
            const angle = startAngle + axisIndex * angleStep;
            const r = (score / 10) * maxR;
            return {
                x: cx + r * Math.cos(angle),
                y: cy + r * Math.sin(angle),
            };
        }

        // Draw 5 concentric grid polygons (scores 2, 4, 6, 8, 10)
        [2, 4, 6, 8, 10].forEach((level) => {
            const points = [];
            for (let i = 0; i < n; i++) {
                const p = getPoint(i, level);
                points.push(`${p.x},${p.y}`);
            }
            const polygon = document.createElementNS(svgNS, 'polygon');
            polygon.setAttribute('points', points.join(' '));
            polygon.setAttribute('class', 'spider-grid-line');
            polygon.setAttribute('fill', 'none');
            polygon.setAttribute('stroke', gridColor);
            polygon.setAttribute('stroke-width', '0.5');
            svg.appendChild(polygon);
        });

        // Draw axis lines
        for (let i = 0; i < n; i++) {
            const p = getPoint(i, 10);
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', cx);
            line.setAttribute('y1', cy);
            line.setAttribute('x2', p.x);
            line.setAttribute('y2', p.y);
            line.setAttribute('class', 'spider-axis-line');
            line.setAttribute('stroke', gridColor);
            line.setAttribute('stroke-width', '0.5');
            svg.appendChild(line);
        }

        // Draw data polygon
        const dataPoints = [];
        for (let i = 0; i < n; i++) {
            const score = ratings[RATING_KEYS[i].key] || 0;
            const p = getPoint(i, score);
            dataPoints.push(p);
        }

        const dataPolygon = document.createElementNS(svgNS, 'polygon');
        dataPolygon.setAttribute('points', dataPoints.map((p) => `${p.x},${p.y}`).join(' '));
        dataPolygon.setAttribute('class', 'spider-data-polygon');
        dataPolygon.setAttribute('fill', primaryColor);
        dataPolygon.setAttribute('fill-opacity', '0.2');
        dataPolygon.setAttribute('stroke', primaryColor);
        dataPolygon.setAttribute('stroke-width', '1.5');
        svg.appendChild(dataPolygon);

        // Draw data dots
        dataPoints.forEach((p) => {
            const dot = document.createElementNS(svgNS, 'circle');
            dot.setAttribute('cx', p.x);
            dot.setAttribute('cy', p.y);
            dot.setAttribute('r', '3');
            dot.setAttribute('class', 'spider-data-dot');
            dot.setAttribute('fill', primaryColor);
            svg.appendChild(dot);
        });

        // Draw labels
        for (let i = 0; i < n; i++) {
            const angle = startAngle + i * angleStep;
            const labelR = maxR + 18;
            const lx = cx + labelR * Math.cos(angle);
            const ly = cy + labelR * Math.sin(angle);

            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', lx);
            text.setAttribute('y', ly);
            text.setAttribute('class', 'spider-label-text');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'central');
            text.setAttribute('fill', mutedColor);
            text.setAttribute('font-size', '8');
            text.setAttribute('font-family', 'var(--font-mono)');
            text.textContent = RATING_KEYS[i].label;
            svg.appendChild(text);
        }

        container.appendChild(svg);
    }

    // ── Tier Filters ───────────────────────────────────────────
    function setupTierFilters() {
        const filterBtns = document.querySelectorAll('.tier-filter-btn');
        const cards = document.querySelectorAll('.city-card');

        filterBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                // Update active state
                filterBtns.forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');

                const tier = btn.getAttribute('data-tier');

                cards.forEach((card) => {
                    if (tier === 'all' || card.getAttribute('data-tier') === tier) {
                        card.style.display = '';
                    } else {
                        card.style.display = 'none';
                    }
                });
            });
        });
    }
})();
