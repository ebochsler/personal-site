/* ============================================================
   Running & Training Page Scripts
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
        // Re-render maps with correct tile layer
        renderMaps();
        renderFeaturedMaps();
        renderWorldMap();
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

    // ── Data Fetching & Rendering ──────────────────────────────
    let runData = null;
    let mapInstances = [];
    let featuredData = null;
    let featuredMapInstances = [];
    let worldMapInstance = null;

    fetch('data/running-data.json')
        .then((r) => {
            if (!r.ok) throw new Error('Data not found');
            return r.json();
        })
        .then((data) => {
            runData = data;
            renderAll(data);
        })
        .catch(() => {
            document.getElementById('month-label').textContent = 'No data available yet';
            document.getElementById('stat-cards').innerHTML =
                '<p class="running-error">Run <code>python scripts/fetch_strava.py</code> to generate data.</p>';
        });

    fetch('data/featured-routes.json')
        .then((r) => {
            if (!r.ok) throw new Error('Featured data not found');
            return r.json();
        })
        .then((data) => {
            featuredData = data;
            renderFeaturedSection(data);
        })
        .catch(() => {
            // Silently skip if no featured data
        });

    function renderAll(data) {
        document.getElementById('month-label').textContent = data.year + ' Year to Date';
        renderGoalTracker(data.summary);
        renderStatCards(data.summary);
        renderCalendars(data.calendars);
        renderBarChart(data.weekly_mileage);
        renderWorkoutTypes(data.workout_types);
        renderRouteCards(data.recent_runs);
    }

    // ── Goal Tracker (Race to 1000 Miles) ─────────────────────
    function renderGoalTracker(summary) {
        const goal = 1000;
        const current = summary.total_distance_mi;
        const progress = Math.min(current / goal, 1);
        const remaining = Math.max(goal - current, 0);
        const pct = (progress * 100);

        const fill = document.getElementById('goal-fill');
        const runner = document.getElementById('goal-runner');
        const milesRunEl = document.getElementById('goal-miles-run');
        const milesLeftEl = document.getElementById('goal-miles-left');
        const pctEl = document.getElementById('goal-pct');

        if (!fill || !runner) return;

        // Observe the goal tracker and trigger animation on scroll
        const tracker = document.querySelector('.goal-tracker');
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    // Animate progress bar and runner
                    fill.style.width = `${pct}%`;
                    runner.style.left = `${pct}%`;

                    // Animate counters
                    animateGoalCounter(milesRunEl, current, 1, false);
                    animateGoalCounter(milesLeftEl, remaining, 1, false);
                    animateGoalCounter(pctEl, pct, 1, true);

                    observer.unobserve(tracker);
                }
            },
            { threshold: 0.2 }
        );
        observer.observe(tracker);
    }

    function animateGoalCounter(el, target, decimals, isPct) {
        if (!el) return;
        const duration = 1200;
        const start = performance.now();

        function tick(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            const current = target * ease;

            if (isPct) {
                el.textContent = current.toFixed(decimals) + '%';
            } else {
                el.textContent = current.toFixed(decimals);
            }

            if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    }

    // ── Stat Card Animated Counters ────────────────────────────
    function renderStatCards(summary) {
        const targets = {
            'stat-distance': { value: summary.total_distance_mi, decimals: 1 },
            'stat-runs': { value: summary.total_runs, decimals: 0 },
            'stat-pace': { value: summary.avg_pace_min, isPace: true },
            'stat-time': { value: summary.total_time_hours, decimals: 1 },
            'stat-elevation': { value: summary.total_elevation_ft, decimals: 0, separator: true },
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
            const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            const current = target * ease;

            if (cfg.isPace) {
                el.textContent = formatPace(current);
            } else if (cfg.separator) {
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

    function formatPace(decimalMinutes) {
        const mins = Math.floor(decimalMinutes);
        const secs = Math.round((decimalMinutes - mins) * 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // ── Calendar Heatmap (dual month) ─────────────────────────
    function renderCalendars(calendars) {
        const container = document.getElementById('calendar-dual');
        container.innerHTML = '';

        // Use active minutes for intensity (works for all activity types)
        const allDays = calendars.flatMap((c) => c.days);
        const maxMin = Math.max(...allDays.map((d) => d.active_minutes), 1);

        calendars.forEach((cal) => {
            const monthBlock = document.createElement('div');
            monthBlock.className = 'calendar-month';

            const title = document.createElement('span');
            title.className = 'calendar-month-label mono';
            title.textContent = cal.month;
            monthBlock.appendChild(title);

            const labels = document.createElement('div');
            labels.className = 'calendar-labels';
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d) => {
                const s = document.createElement('span');
                s.textContent = d;
                labels.appendChild(s);
            });
            monthBlock.appendChild(labels);

            const grid = document.createElement('div');
            grid.className = 'calendar-grid';

            // Determine starting day offset (Monday = 0)
            const firstDate = new Date(cal.days[0].date + 'T00:00:00');
            let dayOfWeek = firstDate.getDay(); // 0=Sun
            dayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // convert to Mon=0

            for (let i = 0; i < dayOfWeek; i++) {
                const empty = document.createElement('div');
                empty.className = 'calendar-cell empty';
                grid.appendChild(empty);
            }

            cal.days.forEach((day) => {
                const cell = document.createElement('div');
                cell.className = 'calendar-cell';
                const intensity = day.active_minutes / maxMin;

                if (day.active_minutes > 0) {
                    cell.style.setProperty('--intensity', Math.max(0.2, intensity));
                    cell.classList.add('active');
                }

                // Build tooltip with activity types
                let tooltip;
                if (day.activities && day.activities.length > 0) {
                    const types = day.activities.join(', ');
                    const parts = [types];
                    if (day.distance_mi > 0) parts.push(`${day.distance_mi} mi`);
                    parts.push(`${day.active_minutes} min`);
                    tooltip = `${day.date}: ${parts.join(' \u00b7 ')}`;
                } else {
                    tooltip = `${day.date}: Rest day`;
                }

                cell.setAttribute('data-tooltip', tooltip);
                cell.textContent = new Date(day.date + 'T00:00:00').getDate();
                grid.appendChild(cell);
            });

            monthBlock.appendChild(grid);
            container.appendChild(monthBlock);
        });
    }

    // ── Weekly Mileage Bar Chart (horizontal) ──────────────────
    function renderBarChart(weeklyMileage) {
        const container = document.getElementById('bar-chart');
        container.innerHTML = '';

        const maxMiles = Math.max(...weeklyMileage.map((w) => w.miles), 1);

        weeklyMileage.forEach((week, i) => {
            const row = document.createElement('div');
            row.className = 'hbar-row';

            const label = document.createElement('span');
            label.className = 'hbar-label mono';
            label.textContent = week.week;

            const track = document.createElement('div');
            track.className = 'hbar-track';

            const fill = document.createElement('div');
            fill.className = 'hbar-fill';
            fill.style.setProperty('--target-width', `${(week.miles / maxMiles) * 100}%`);
            fill.style.transitionDelay = `${i * 0.1}s`;

            const value = document.createElement('span');
            value.className = 'hbar-value mono';
            value.textContent = week.miles > 0 ? week.miles : '';

            track.appendChild(fill);
            row.appendChild(label);
            row.appendChild(track);
            row.appendChild(value);
            container.appendChild(row);
        });

        // Trigger bar animation when visible
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

    // ── Workout Type Breakdown ─────────────────────────────────
    function renderWorkoutTypes(types) {
        const container = document.getElementById('type-bars');
        container.innerHTML = '';

        const maxCount = Math.max(...types.map((t) => t.count), 1);

        types.forEach((t) => {
            const row = document.createElement('div');
            row.className = 'type-row';

            const label = document.createElement('span');
            label.className = 'type-label';
            label.textContent = t.type;

            const track = document.createElement('div');
            track.className = 'type-track';

            const fill = document.createElement('div');
            fill.className = 'type-fill';
            fill.style.width = `${(t.count / maxCount) * 100}%`;

            const count = document.createElement('span');
            count.className = 'type-count mono';
            count.textContent = t.count;

            track.appendChild(fill);
            row.appendChild(label);
            row.appendChild(track);
            row.appendChild(count);
            container.appendChild(row);
        });
    }

    // ── Route Map Cards ────────────────────────────────────────
    function renderRouteCards(runs) {
        const container = document.getElementById('route-cards');
        container.innerHTML = '';

        runs.forEach((run, i) => {
            const card = document.createElement('article');
            card.className = 'route-card reveal';

            const mapDiv = document.createElement('div');
            mapDiv.className = 'route-map';
            mapDiv.id = `map-${i}`;

            const details = document.createElement('div');
            details.className = 'route-details';

            const dateObj = new Date(run.date + 'T00:00:00');
            const dateStr = dateObj.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
            });

            details.innerHTML = `
                <h3 class="route-name">${run.name}</h3>
                <span class="route-date mono">${dateStr}</span>
                <div class="route-stats">
                    <div class="route-stat">
                        <span class="route-stat-value">${run.distance_mi}</span>
                        <span class="route-stat-unit">mi</span>
                    </div>
                    <div class="route-stat">
                        <span class="route-stat-value">${formatPace(run.pace_min)}</span>
                        <span class="route-stat-unit">/mi</span>
                    </div>
                    <div class="route-stat">
                        <span class="route-stat-value">${run.elapsed_time_min}</span>
                        <span class="route-stat-unit">min</span>
                    </div>
                    <div class="route-stat">
                        <span class="route-stat-value">${run.elevation_ft}</span>
                        <span class="route-stat-unit">ft</span>
                    </div>
                </div>
            `;

            card.appendChild(mapDiv);
            card.appendChild(details);
            container.appendChild(card);

            // Observe for reveal
            revealObserver.observe(card);
        });

        // Init maps after DOM is ready
        setTimeout(() => renderMaps(), 100);
    }

    function getTileUrl() {
        const isDark = root.getAttribute('data-theme') !== 'light';
        return isDark
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    }

    function addGlowPolyline(map, coords) {
        const isDark = root.getAttribute('data-theme') !== 'light';
        L.polyline(coords, {
            color: isDark ? 'rgba(0, 212, 255, 0.15)' : 'rgba(0, 136, 204, 0.15)',
            weight: 12, lineCap: 'round', lineJoin: 'round',
        }).addTo(map);
        L.polyline(coords, {
            color: isDark ? 'rgba(0, 212, 255, 0.5)' : 'rgba(0, 136, 204, 0.5)',
            weight: 5, lineCap: 'round', lineJoin: 'round',
        }).addTo(map);
        L.polyline(coords, {
            color: isDark ? '#00ff88' : '#00994d',
            weight: 2.5, lineCap: 'round', lineJoin: 'round',
        }).addTo(map);
    }

    function renderMaps() {
        // Destroy existing map instances
        mapInstances.forEach((m) => m.remove());
        mapInstances = [];

        if (!runData || !runData.recent_runs) return;

        const tileUrl = getTileUrl();

        runData.recent_runs.forEach((run, i) => {
            const mapEl = document.getElementById(`map-${i}`);
            if (!mapEl || !run.coordinates || run.coordinates.length === 0) return;

            const map = L.map(mapEl, {
                zoomControl: false,
                attributionControl: false,
                dragging: false,
                scrollWheelZoom: false,
                doubleClickZoom: false,
                touchZoom: false,
                boxZoom: false,
                keyboard: false,
            });

            L.tileLayer(tileUrl, { subdomains: 'abcd', maxZoom: 19 }).addTo(map);
            addGlowPolyline(map, run.coordinates);

            const bounds = L.latLngBounds(run.coordinates);
            map.fitBounds(bounds, { padding: [30, 30] });

            mapInstances.push(map);
        });
    }

    // ── Featured Routes Section ─────────────────────────────────
    function renderFeaturedSection(data) {
        renderFeaturedCards(data);
        setTimeout(() => {
            renderWorldMap();
            renderFeaturedMaps();
        }, 100);
    }

    function renderFeaturedCards(data) {
        const container = document.getElementById('featured-route-cards');
        container.innerHTML = '';

        data.forEach((entry, i) => {
            const run = entry.featured_run;
            const card = document.createElement('article');
            card.className = 'route-card reveal';
            card.id = `featured-card-${i}`;

            const mapDiv = document.createElement('div');
            mapDiv.className = 'route-map';
            mapDiv.id = `featured-map-${i}`;

            const details = document.createElement('div');
            details.className = 'route-details';

            const dateObj = new Date(run.date + 'T00:00:00');
            const dateStr = dateObj.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
            });

            const runsLabel = entry.total_runs === 1 ? 'run' : 'runs';

            details.innerHTML = `
                <div class="featured-city-header">
                    <span class="featured-city-badge">${entry.city}</span>
                    <span class="featured-city-aggregate">${entry.total_miles} mi &middot; ${entry.total_runs} ${runsLabel}</span>
                </div>
                <h3 class="route-name">${run.name}</h3>
                <span class="route-date mono">${dateStr}</span>
                <div class="route-stats">
                    <div class="route-stat">
                        <span class="route-stat-value">${run.distance_mi}</span>
                        <span class="route-stat-unit">mi</span>
                    </div>
                    <div class="route-stat">
                        <span class="route-stat-value">${formatPace(run.pace_min)}</span>
                        <span class="route-stat-unit">/mi</span>
                    </div>
                    <div class="route-stat">
                        <span class="route-stat-value">${run.elapsed_time_min}</span>
                        <span class="route-stat-unit">min</span>
                    </div>
                    <div class="route-stat">
                        <span class="route-stat-value">${run.elevation_ft}</span>
                        <span class="route-stat-unit">ft</span>
                    </div>
                </div>
            `;

            card.appendChild(mapDiv);
            card.appendChild(details);
            container.appendChild(card);

            revealObserver.observe(card);
        });
    }

    // ── D3 Regional Maps ────────────────────────────────────────
    let worldTopoData = null;

    // Pre-fetch world topology
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
        .then((data) => { worldTopoData = data; })
        .catch(() => {});

    function renderWorldMap() {
        if (!featuredData || featuredData.length === 0) return;

        const naData = featuredData.filter((d) => d.continent === 'na');
        const euData = featuredData.filter((d) => d.continent === 'eu');

        renderRegionMap('featured-map-na', naData);
        renderRegionMap('featured-map-eu', euData);
    }

    function renderRegionMap(elementId, regionData) {
        const mapEl = document.getElementById(elementId);
        if (!mapEl) return;
        if (regionData.length === 0) return;

        // Preserve the label
        mapEl.querySelectorAll('svg, .region-tooltip').forEach((el) => el.remove());

        const isDark = root.getAttribute('data-theme') !== 'light';
        const rect = mapEl.getBoundingClientRect();
        const width = rect.width || mapEl.clientWidth;
        const height = rect.height || mapEl.clientHeight;

        // Compute bounding box from actual marker positions with padding
        const lngs = regionData.map((d) => d.start_latlng[1]);
        const lats = regionData.map((d) => d.start_latlng[0]);
        const padLng = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 0.2, 4);
        const padLat = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.2, 4);

        const regionBbox = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                    type: 'MultiPoint',
                    coordinates: [
                        [Math.min(...lngs) - padLng, Math.min(...lats) - padLat],
                        [Math.max(...lngs) + padLng, Math.max(...lats) + padLat],
                    ],
                },
            }],
        };

        const projection = d3.geoMercator()
            .fitSize([width, height], regionBbox);

        const path = d3.geoPath(projection);

        const svg = d3.select(mapEl)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .style('display', 'block');

        // Ocean background
        svg.append('rect')
            .attr('width', width)
            .attr('height', height)
            .attr('fill', isDark ? '#0d0d18' : '#e8ecf2');

        // Graticule
        const graticule = d3.geoGraticule().step([10, 10]);
        svg.append('path')
            .datum(graticule())
            .attr('d', path)
            .attr('fill', 'none')
            .attr('stroke', isDark ? 'rgba(0, 212, 255, 0.06)' : 'rgba(0, 136, 204, 0.08)')
            .attr('stroke-width', 0.5);

        // Land masses
        if (worldTopoData) {
            const land = topojson.feature(worldTopoData, worldTopoData.objects.countries);
            svg.append('g')
                .selectAll('path')
                .data(land.features)
                .join('path')
                .attr('d', path)
                .attr('fill', isDark ? '#1a1a2e' : '#d0d5dd')
                .attr('stroke', isDark ? 'rgba(0, 212, 255, 0.1)' : 'rgba(0, 136, 204, 0.15)')
                .attr('stroke-width', 0.5);
        }

        // Tooltip
        const tooltip = d3.select(mapEl)
            .append('div')
            .attr('class', 'region-tooltip')
            .style('position', 'absolute')
            .style('pointer-events', 'none')
            .style('background', isDark ? 'rgba(18, 18, 26, 0.95)' : 'rgba(255, 255, 255, 0.95)')
            .style('border', `1px solid ${isDark ? 'rgba(0, 212, 255, 0.2)' : 'rgba(0, 136, 204, 0.25)'}`)
            .style('color', isDark ? '#e0e0e0' : '#1a1a2e')
            .style('font-family', 'var(--font-mono)')
            .style('font-size', '0.75rem')
            .style('padding', '0.35rem 0.6rem')
            .style('border-radius', '4px')
            .style('opacity', 0)
            .style('transition', 'opacity 0.15s')
            .style('z-index', 10);

        // City markers
        const markerColor = isDark ? '#00d4ff' : '#0088cc';
        const glowColor = isDark ? 'rgba(0, 212, 255, 0.3)' : 'rgba(0, 136, 204, 0.3)';

        regionData.forEach((entry) => {
            if (!entry.start_latlng || entry.start_latlng.length < 2) return;

            const globalIdx = featuredData.indexOf(entry);
            const coords = [entry.start_latlng[1], entry.start_latlng[0]];
            const projected = projection(coords);
            if (!projected) return;
            if (projected[0] < 0 || projected[0] > width || projected[1] < 0 || projected[1] > height) return;

            svg.append('circle')
                .attr('cx', projected[0])
                .attr('cy', projected[1])
                .attr('r', 10)
                .attr('fill', glowColor)
                .attr('opacity', 0.5);

            svg.append('circle')
                .attr('cx', projected[0])
                .attr('cy', projected[1])
                .attr('r', 5)
                .attr('fill', markerColor)
                .attr('stroke', '#fff')
                .attr('stroke-width', 1.5)
                .attr('opacity', 0.9)
                .style('cursor', 'pointer')
                .on('mouseenter', () => {
                    const runsLabel = entry.total_runs === 1 ? 'run' : 'runs';
                    tooltip
                        .html(`<strong>${entry.city}</strong> &middot; ${entry.total_miles} mi &middot; ${entry.total_runs} ${runsLabel}`)
                        .style('left', (projected[0] + 14) + 'px')
                        .style('top', (projected[1] - 10) + 'px')
                        .style('opacity', 1);
                })
                .on('mouseleave', () => {
                    tooltip.style('opacity', 0);
                })
                .on('click', () => {
                    const card = document.getElementById(`featured-card-${globalIdx}`);
                    if (card) {
                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                });
        });
    }

    function renderFeaturedMaps() {
        featuredMapInstances.forEach((m) => m.remove());
        featuredMapInstances = [];

        if (!featuredData) return;

        const tileUrl = getTileUrl();

        featuredData.forEach((entry, i) => {
            const run = entry.featured_run;
            const mapEl = document.getElementById(`featured-map-${i}`);
            if (!mapEl || !run.coordinates || run.coordinates.length === 0) return;

            const map = L.map(mapEl, {
                zoomControl: false,
                attributionControl: false,
                dragging: false,
                scrollWheelZoom: false,
                doubleClickZoom: false,
                touchZoom: false,
                boxZoom: false,
                keyboard: false,
            });

            L.tileLayer(tileUrl, { subdomains: 'abcd', maxZoom: 19 }).addTo(map);
            addGlowPolyline(map, run.coordinates);

            const bounds = L.latLngBounds(run.coordinates);
            map.fitBounds(bounds, { padding: [30, 30] });

            featuredMapInstances.push(map);
        });
    }
})();
