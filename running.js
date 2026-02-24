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

    function renderAll(data) {
        document.getElementById('month-label').textContent = data.year + ' Year to Date';
        renderStatCards(data.summary);
        renderCalendars(data.calendars);
        renderBarChart(data.weekly_mileage);
        renderWorkoutTypes(data.workout_types);
        renderRouteCards(data.recent_runs);
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

    function renderMaps() {
        // Destroy existing map instances
        mapInstances.forEach((m) => m.remove());
        mapInstances = [];

        if (!runData || !runData.recent_runs) return;

        const isDark = root.getAttribute('data-theme') !== 'light';
        const tileUrl = isDark
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

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

            // Three-layer glow polyline
            const coords = run.coordinates;

            // Outer glow (wide, translucent cyan)
            L.polyline(coords, {
                color: isDark ? 'rgba(0, 212, 255, 0.15)' : 'rgba(0, 136, 204, 0.15)',
                weight: 12,
                lineCap: 'round',
                lineJoin: 'round',
            }).addTo(map);

            // Middle glow
            L.polyline(coords, {
                color: isDark ? 'rgba(0, 212, 255, 0.5)' : 'rgba(0, 136, 204, 0.5)',
                weight: 5,
                lineCap: 'round',
                lineJoin: 'round',
            }).addTo(map);

            // Core line (narrow, bright green)
            L.polyline(coords, {
                color: isDark ? '#00ff88' : '#00994d',
                weight: 2.5,
                lineCap: 'round',
                lineJoin: 'round',
            }).addTo(map);

            // Fit map to route bounds
            const bounds = L.latLngBounds(coords);
            map.fitBounds(bounds, { padding: [30, 30] });

            mapInstances.push(map);
        });
    }
})();
