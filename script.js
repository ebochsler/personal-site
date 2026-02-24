/* ============================================================
   Eric Bochsler — Personal Website Scripts
   ============================================================ */

(function () {
    'use strict';

    // ── Typing Effect ──────────────────────────────────────────
    const typingEl = document.getElementById('typing-text');
    if (typingEl) {
        const name = 'Eric Bochsler';
        let charIndex = 0;

        function type() {
            if (charIndex <= name.length) {
                typingEl.textContent = name.slice(0, charIndex);
                charIndex++;
                setTimeout(type, 100);
            }
        }

        // Start typing after a brief delay
        setTimeout(type, 600);
    }

    // ── Scroll Reveal ──────────────────────────────────────────
    const revealElements = document.querySelectorAll('.reveal');

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

    revealElements.forEach((el) => revealObserver.observe(el));

    // ── Skill Bar Animation ────────────────────────────────────
    const skillFills = document.querySelectorAll('.skill-fill');

    if (skillFills.length) {
        const skillObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const width = entry.target.getAttribute('data-width');
                        entry.target.style.width = width + '%';
                        entry.target.classList.add('animate');
                        skillObserver.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.3 }
        );

        skillFills.forEach((el) => skillObserver.observe(el));
    }

    // ── Mobile Nav Toggle ──────────────────────────────────────
    const navToggle = document.querySelector('.nav-toggle');
    const nav = document.getElementById('nav');

    navToggle.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('open');
        navToggle.classList.toggle('active');
        navToggle.setAttribute('aria-expanded', isOpen);
    });

    // Close mobile nav when a link is clicked
    nav.querySelectorAll('.nav-link').forEach((link) => {
        link.addEventListener('click', () => {
            nav.classList.remove('open');
            navToggle.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });

    // ── Theme Toggle ─────────────────────────────────────────────
    const themeToggle = document.getElementById('theme-toggle');
    const root = document.documentElement;

    function setTheme(theme) {
        root.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }

    // Load saved preference or default to dark
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);

    themeToggle.addEventListener('click', () => {
        const current = root.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
        // Reinit canvas so particle/grid colors update
        cancelAnimationFrame(animationId);
        initCanvas();
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

    // ── Animated Background (Canvas Particles) ─────────────────
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
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        for (let y = 0; y < canvas.height; y += spacing) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
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
            p.x += p.dx;
            p.y += p.dy;

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
        drawGrid();
        updateParticles();
        drawConnections();
        drawParticles();
        animationId = requestAnimationFrame(animate);
    }

    // Respect reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function initCanvas() {
        resizeCanvas();
        createParticles();
        if (!prefersReducedMotion.matches) {
            animate();
        } else {
            // Draw a single static frame
            drawGrid();
            drawParticles();
            drawConnections();
        }
    }

    window.addEventListener('resize', () => {
        cancelAnimationFrame(animationId);
        initCanvas();
    });

    initCanvas();
})();
