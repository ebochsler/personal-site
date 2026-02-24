/* ============================================================
   Fun Page Scripts — Brewery & Venue Tracker
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
        renderVenueMap();
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

    // ── Category Colors ──────────────────────────────────────────
    const CATEGORY_COLORS = {
        dark: {
            brewery: '#00d4ff',
            bar: '#00ff88',
            winery: '#ff6b35',
            distillery: '#a855f7',
            cidery: '#f59e0b',
            other: '#888888',
        },
        light: {
            brewery: '#0088cc',
            bar: '#00994d',
            winery: '#d45a2a',
            distillery: '#7c3aed',
            cidery: '#d97706',
            other: '#555566',
        },
    };

    function getCategoryColor(category) {
        const mode = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        return CATEGORY_COLORS[mode][category] || CATEGORY_COLORS[mode].other;
    }

    function getTileUrl() {
        const isDark = root.getAttribute('data-theme') !== 'light';
        return isDark
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    }

    // ── Data Fetching & Rendering ──────────────────────────────
    let brewData = null;
    let venueMapInstance = null;

    fetch('data/brewery-data.json')
        .then((r) => {
            if (!r.ok) throw new Error('Data not found');
            return r.json();
        })
        .then((data) => {
            brewData = data;
            renderAll(data);
        })
        .catch(() => {
            const subtitle = document.getElementById('fun-subtitle');
            if (subtitle) subtitle.textContent = 'No data available yet';
            const cards = document.getElementById('stat-cards');
            if (cards) cards.innerHTML =
                '<p class="running-error">Run <code>python scripts/parse_timeline.py</code> to generate data.</p>';
        });

    function renderAll(data) {
        const subtitle = document.getElementById('fun-subtitle');
        if (subtitle) subtitle.textContent = `${data.summary.total_venues} venues tracked`;
        renderStatCards(data.summary);
        renderCategoryBars(data.summary.category_breakdown);
        renderMonthlyBars(data.visits_by_month);
        setTimeout(() => renderVenueMap(), 100);
        renderLeaderboard('leaderboard-visits', data.top_by_visits, 'visit_count', 'visits');
        renderLeaderboard('leaderboard-hours', data.top_by_hours, 'total_hours', 'hrs');
    }

    // ── Stat Card Animated Counters ────────────────────────────
    function renderStatCards(summary) {
        const targets = {
            'stat-venues': { value: summary.total_venues, decimals: 0 },
            'stat-visits': { value: summary.total_visits, decimals: 0 },
            'stat-hours': { value: summary.total_hours, decimals: 1 },
            'stat-cities': { value: summary.unique_cities, decimals: 0 },
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

            if (cfg.separator) {
                el.textContent = Math.round(current).toLocaleString();
            } else if (cfg.decimals === 0) {
                el.textContent = Math.round(current);
            } else {
                el.textContent = current.toFixed(cfg.decimals);
            }

            if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    }

    // ── Category Breakdown Bars ─────────────────────────────────
    function renderCategoryBars(breakdown) {
        const container = document.getElementById('category-bars');
        if (!container) return;
        container.innerHTML = '';

        const maxCount = Math.max(...breakdown.map((b) => b.count), 1);

        breakdown.forEach((item, i) => {
            const row = document.createElement('div');
            row.className = 'hbar-row venue-hbar-row';

            const label = document.createElement('span');
            label.className = 'hbar-label';
            label.textContent = item.category;

            const track = document.createElement('div');
            track.className = 'hbar-track';

            const fill = document.createElement('div');
            fill.className = 'hbar-fill';
            fill.style.setProperty('--target-width', `${(item.count / maxCount) * 100}%`);
            fill.style.transitionDelay = `${i * 0.1}s`;
            fill.style.background = getCategoryColor(item.category);

            const value = document.createElement('span');
            value.className = 'hbar-value mono';
            value.textContent = item.count;

            track.appendChild(fill);
            row.appendChild(label);
            row.appendChild(track);
            row.appendChild(value);
            container.appendChild(row);
        });

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    container.classList.add('animate');
                    observer.unobserve(container);
                }
            },
            { threshold: 0.2 }
        );
        observer.observe(container);
    }

    // ── Monthly Visit Bars ──────────────────────────────────────
    function renderMonthlyBars(visitsByMonth) {
        const container = document.getElementById('monthly-bars');
        if (!container) return;
        container.innerHTML = '';

        // Show last 12 months
        const recent = visitsByMonth.slice(-12);
        const maxCount = Math.max(...recent.map((m) => m.count), 1);

        recent.forEach((item, i) => {
            const row = document.createElement('div');
            row.className = 'hbar-row';

            const label = document.createElement('span');
            label.className = 'hbar-label mono';
            // Format month: "2025-01" -> "Jan '25"
            const [y, m] = item.month.split('-');
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            label.textContent = `${monthNames[parseInt(m) - 1]} '${y.slice(2)}`;

            const track = document.createElement('div');
            track.className = 'hbar-track';

            const fill = document.createElement('div');
            fill.className = 'hbar-fill';
            fill.style.setProperty('--target-width', `${(item.count / maxCount) * 100}%`);
            fill.style.transitionDelay = `${i * 0.08}s`;

            const value = document.createElement('span');
            value.className = 'hbar-value mono';
            value.textContent = item.count;

            track.appendChild(fill);
            row.appendChild(label);
            row.appendChild(track);
            row.appendChild(value);
            container.appendChild(row);
        });

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    container.classList.add('animate');
                    observer.unobserve(container);
                }
            },
            { threshold: 0.2 }
        );
        observer.observe(container);
    }

    // ── Venue Map ───────────────────────────────────────────────
    function renderVenueMap() {
        if (venueMapInstance) {
            venueMapInstance.remove();
            venueMapInstance = null;
        }

        if (!brewData || !brewData.all_venues || brewData.all_venues.length === 0) return;

        const mapEl = document.getElementById('venue-map');
        if (!mapEl) return;

        const isDark = root.getAttribute('data-theme') !== 'light';
        const tileUrl = getTileUrl();

        const map = L.map(mapEl, {
            zoomControl: true,
            attributionControl: false,
            scrollWheelZoom: true,
        });

        L.tileLayer(tileUrl, { subdomains: 'abcd', maxZoom: 19 }).addTo(map);

        const maxVisits = Math.max(...brewData.all_venues.map((v) => v.visit_count), 1);
        const bounds = [];

        brewData.all_venues.forEach((venue) => {
            if (!venue.lat || !venue.lng) return;

            const color = getCategoryColor(venue.category);
            const radius = 6 + (venue.visit_count / maxVisits) * 14;
            const latlng = [venue.lat, venue.lng];
            bounds.push(latlng);

            const circle = L.circleMarker(latlng, {
                radius: radius,
                fillColor: color,
                fillOpacity: isDark ? 0.7 : 0.6,
                color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
                weight: 1.5,
            }).addTo(map);

            const popupContent = `
                <div class="venue-popup">
                    <strong class="venue-popup-name">${venue.name}</strong>
                    <span class="venue-popup-cat">${venue.category}</span>
                    <span class="venue-popup-stat">${venue.visit_count} visits &middot; ${venue.total_hours} hrs</span>
                </div>
            `;
            circle.bindPopup(popupContent);
        });

        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
        }

        venueMapInstance = map;
    }

    // ── Leaderboard (reusable) ──────────────────────────────────
    function renderLeaderboard(containerId, items, valueKey, unitLabel) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        const top = items.slice(0, 10);
        const maxVal = Math.max(...top.map((v) => v[valueKey]), 1);

        top.forEach((venue, i) => {
            const row = document.createElement('div');
            row.className = 'hbar-row venue-hbar-row';

            const label = document.createElement('span');
            label.className = 'hbar-label venue-hbar-label';
            label.textContent = venue.name;
            label.title = venue.name;

            const track = document.createElement('div');
            track.className = 'hbar-track';

            const fill = document.createElement('div');
            fill.className = 'hbar-fill';
            fill.style.setProperty('--target-width', `${(venue[valueKey] / maxVal) * 100}%`);
            fill.style.transitionDelay = `${i * 0.08}s`;
            fill.style.background = getCategoryColor(venue.category);

            const value = document.createElement('span');
            value.className = 'hbar-value mono';
            value.textContent = venue[valueKey];

            track.appendChild(fill);
            row.appendChild(label);
            row.appendChild(track);
            row.appendChild(value);
            container.appendChild(row);
        });

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    container.classList.add('animate');
                    observer.unobserve(container);
                }
            },
            { threshold: 0.2 }
        );
        observer.observe(container);
    }
})();
