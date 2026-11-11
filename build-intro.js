// Build intro: four fake agents scaffold, write, style and animate the home page
// on top of the real DOM, then hand over to the untouched page.
(function () {
    const root = document.documentElement;
    if (!root.classList.contains('bi')) return;

    const page = document.querySelector('.page');
    if (!page) { root.classList.remove('bi'); return; }

    const BOX = '.avatar, .about-card, .link-plate, .paper-card, .repo-card, .article-card';
    const MEDIA = '.avatar img, .plate-icon img, .zenn-mark, .plate-arrow, .about-icon, .article-emoji, .dot';
    const TEXT = '.hero-text h1, .tagline, .about-row, .plate-title, .plate-sub, .section-head, .badge, ' +
        '.paper-title, .paper-authors, .paper-venue, .pill, .paper-notice, .repo-name, .repo-desc, ' +
        '.repo-meta, .article-title, .article-meta, .page-foot';

    const AGENTS = [
        { name: 'aria', color: '#7c5cff' },
        { name: 'kai', color: '#ff4f8b' },
        { name: 'nyx', color: '#12a88f' },
        { name: 'juno', color: '#f08a00' },
    ];

    const t0 = performance.now();
    let skipped = false;
    let finished = false;
    const wakers = new Set();

    // ─── Helpers ────────────────────────────────────────────────────
    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const easeInOut = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const easeOut = p => 1 - Math.pow(1 - p, 3);
    const visible = el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
    const tagOf = el => el.tagName.toLowerCase() + '.' + el.classList[0];

    function wait(ms) {
        return new Promise(res => {
            if (skipped) return res();
            const wake = () => { clearTimeout(t); wakers.delete(wake); res(); };
            const t = setTimeout(wake, ms);
            wakers.add(wake);
        });
    }

    function tween(dur, fn) {
        return new Promise(res => {
            if (skipped) return res();
            const start = performance.now();
            const tick = now => {
                if (skipped) return res();
                const p = Math.min(1, (now - start) / dur);
                fn(p);
                p < 1 ? requestAnimationFrame(tick) : res();
            };
            requestAnimationFrame(tick);
        });
    }

    async function pool(tasks, run) {
        let i = 0;
        await Promise.all(agents.map(async (a, k) => {
            await wait(k * 90);
            while (!skipped && i < tasks.length) {
                await run(a, tasks[i++]);
                await wait(rand(10, 50));
            }
        }));
    }

    // ─── Start state ────────────────────────────────────────────────
    const boxStyles = new Map([...document.querySelectorAll(BOX)].map(el => [el, el.getAttribute('style')]));

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    scrollTo(0, 0);

    // Wrap every visible character in a span so it can be "typed" without the layout moving.
    // Whitespace runs stay as plain text nodes so collapsing is unchanged.
    const seg = window.Intl && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    const graphemes = s => seg ? Array.from(seg.segment(s), x => x.segment) : Array.from(s);
    const wraps = [];
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
        acceptNode: n => n.nodeValue.trim() && !n.parentElement.closest('.about-icon, .article-emoji')
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(node => {
        const wrap = document.createElement('span');
        wrap.className = 'bi-w';
        node.nodeValue.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { wrap.appendChild(document.createTextNode(part)); return; }
            graphemes(part).forEach(g => {
                const s = document.createElement('span');
                s.className = 'bi-ch';
                s.textContent = g;
                wrap.appendChild(s);
            });
        });
        node.replaceWith(wrap);
        wraps.push({ wrap, node });
    });

    const canvas = document.createElement('div');
    canvas.id = 'bi-canvas';
    document.body.appendChild(canvas);

    const layer = document.createElement('div');
    layer.id = 'bi-layer';
    layer.innerHTML =
        '<div class="bi-log"><div class="bi-log-head"><span>build · azekyo.com</span><span class="bi-time">0.0s</span></div>' +
        '<div class="bi-log-lines"></div><div class="bi-progress"><i></i></div></div>' +
        '<button class="bi-skip" type="button">skip intro ⏭</button>';
    document.body.appendChild(layer);
    const logLines = layer.querySelector('.bi-log-lines');
    const progressBar = layer.querySelector('.bi-progress i');
    const timeEl = layer.querySelector('.bi-time');

    root.classList.add('bi-ready');

    // ─── Log ────────────────────────────────────────────────────────
    function log(html, cls) {
        const line = document.createElement('div');
        line.className = 'bi-log-line' + (cls ? ' ' + cls : '');
        line.innerHTML = html;
        logLines.appendChild(line);
        while (logLines.children.length > (innerWidth <= 760 ? 4 : 6)) logLines.firstChild.remove();
    }
    const say = (a, msg) => log(`<b style="color:${a.color}">${a.name}</b> ${msg}`);
    const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const progress = p => { progressBar.style.width = Math.round(p * 100) + '%'; };
    const clock = setInterval(() => { timeEl.textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's'; }, 100);

    // ─── Agents (cursors) ───────────────────────────────────────────
    const ARROW = '<svg viewBox="0 0 18 18"><path d="M2 1.5 L2 15 L5.6 11.6 L8.2 17 L10.6 15.9 L8.1 10.7 L13.2 10.5 Z" ' +
        'fill="currentColor" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>';

    const agents = AGENTS.map((a, i) => {
        const el = document.createElement('div');
        el.className = 'bi-cur';
        el.style.color = a.color;
        el.innerHTML = ARROW + `<div class="bi-cur-label"><span class="bi-cur-name" style="background:${a.color}">${a.name}</span>` +
            '<span class="bi-cur-status"></span></div>';
        layer.appendChild(el);
        // Enter from the four sides of the screen.
        const starts = [[-40, innerHeight * 0.3], [innerWidth + 40, innerHeight * 0.2],
            [innerWidth * 0.4, innerHeight + 40], [innerWidth + 40, innerHeight * 0.8]];
        const agent = { ...a, el, status: el.querySelector('.bi-cur-status'), x: starts[i][0], y: starts[i][1] };
        place(agent, agent.x, agent.y);
        return agent;
    });

    function place(a, x, y) {
        a.x = x; a.y = y;
        a.el.style.transform = `translate(${x}px, ${y}px)`;
    }

    function setStatus(a, text) { a.status.textContent = text; }

    // Curved, eased glide to a point.
    function move(a, tx, ty, dur) {
        const sx = a.x, sy = a.y;
        const dist = Math.hypot(tx - sx, ty - sy);
        dur = dur || clamp(dist * 0.5, 150, 380);
        const bend = rand(-0.25, 0.25) * dist;
        const cx = (sx + tx) / 2 + (ty - sy) / (dist || 1) * bend;
        const cy = (sy + ty) / 2 - (tx - sx) / (dist || 1) * bend;
        return tween(dur, p => {
            const e = easeInOut(p), u = 1 - e;
            place(a, u * u * sx + 2 * u * e * cx + e * e * tx, u * u * sy + 2 * u * e * cy + e * e * ty);
        });
    }

    function press(a, down) { a.el.classList.toggle('down', down); }

    function ripple(a, x, y) {
        const r = document.createElement('div');
        r.className = 'bi-ripple';
        r.style.cssText = `left:${x}px;top:${y}px;--c:${a.color}`;
        layer.appendChild(r);
        setTimeout(() => r.remove(), 700);
    }

    // ─── Phase 1: scaffold boxes ────────────────────────────────────
    const tags = [];

    async function draw(a, el) {
        const r = el.getBoundingClientRect();
        const tag = tagOf(el);
        setStatus(a, '<' + tag + '>');
        await move(a, r.left, r.top);
        if (skipped) return;
        press(a, true);
        say(a, `scaffold <span style="opacity:.7">&lt;${tag}&gt;</span>`);
        el.style.clipPath = 'inset(0 100% 100% 0)';
        el.classList.add('bi-drawn');
        await tween(clamp((r.width + r.height) * 0.7, 220, 420), p => {
            const e = easeOut(p);
            el.style.clipPath = `inset(0 ${(1 - e) * 100}% ${(1 - e) * 100}% 0)`;
            place(a, r.left + r.width * e, r.top + r.height * e);
            setStatus(a, `${Math.round(r.width * e)} × ${Math.round(r.height * e)}`);
        });
        if (skipped) return;
        el.style.clipPath = '';
        press(a, false);
        const t = document.createElement('div');
        t.className = 'bi-tag';
        t.textContent = tag;
        t.style.cssText = `left:${r.left}px;top:${r.top - 2}px;background:${a.color}`;
        layer.appendChild(t);
        tags.push(t);
        setStatus(a, '');
    }

    // ─── Phase 2: write content ─────────────────────────────────────
    async function type(a, el) {
        const chars = [...el.querySelectorAll('.bi-ch:not(.on)')];
        if (!chars.length) return;
        const first = chars[0].getBoundingClientRect();
        setStatus(a, 'writing');
        await move(a, first.left, first.bottom);
        if (skipped) return;
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        say(a, `write <span style="opacity:.7">"${esc(text.length > 30 ? text.slice(0, 30) + '…' : text)}"</span>`);
        let shown = 0, caret = null;
        await tween(clamp(chars.length * 7, 110, 300), p => {
            const n = Math.ceil(p * chars.length);
            while (shown < n) chars[shown++].classList.add('on');
            if (caret) caret.classList.remove('caret');
            caret = chars[n - 1];
            if (!caret) return;
            caret.style.setProperty('--c', a.color);
            caret.classList.add('caret');
            const r = caret.getBoundingClientRect();
            place(a, a.x + (r.right + 2 - a.x) * 0.35, a.y + (r.bottom - a.y) * 0.35);
            setStatus(a, `writing ${shown}/${chars.length}`);
        });
        if (caret) caret.classList.remove('caret');
        setStatus(a, '');
    }

    // ─── Phase 3: style ─────────────────────────────────────────────
    const SNIPPETS = ['backdrop-filter: blur(24px)', 'border-radius: 20px', 'background: var(--surface)',
        'box-shadow: inset 0 1px 0 #fffb', 'saturate(1.8)', 'border: 1px solid var(--border)'];

    function styleNow(el) {
        el.classList.add('bi-styled');
        el.querySelectorAll('.badge, .pill').forEach(b => b.classList.add('bi-styled'));
        [...el.querySelectorAll(MEDIA)].forEach((m, i) => setTimeout(() => finished || m.classList.add('bi-pop'), 80 + i * 70));
    }

    async function paint(a, el) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width * rand(0.3, 0.7), y = r.top + r.height * rand(0.35, 0.65);
        setStatus(a, '.' + el.classList[0]);
        await move(a, x, y);
        if (skipped) return;
        press(a, true);
        ripple(a, x, y);
        say(a, `.${el.classList[0]} { <span style="opacity:.7">${SNIPPETS[Math.floor(Math.random() * SNIPPETS.length)]}</span> }`);
        styleNow(el);
        await wait(110);
        press(a, false);
        setStatus(a, '');
    }

    // ─── Phase 4: motion ────────────────────────────────────────────
    async function hover(a, el) {
        const r = el.getBoundingClientRect();
        setStatus(a, ':hover');
        await move(a, r.left + r.width * rand(0.4, 0.75), r.top + r.height * 0.55);
        if (skipped) return;
        say(a, `.${el.classList[0]}:hover <span style="opacity:.7">{ translateY(-6px) }</span>`);
        el.classList.add('bi-hover');
        await wait(380);
        el.classList.remove('bi-hover');
        setStatus(a, '');
    }

    // ─── Sequence ───────────────────────────────────────────────────
    async function run() {
        const boxes = [...document.querySelectorAll(BOX)];
        const onScreen = boxes.filter(visible);
        boxes.filter(b => !onScreen.includes(b)).forEach(b => b.classList.add('bi-drawn'));

        // Agents fly in, layout guides drop.
        log('● scaffolding layout', 'phase');
        const pr = page.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(page).paddingLeft);
        [pr.left + pad, pr.right - pad].forEach(x => {
            const g = document.createElement('div');
            g.className = 'bi-guide';
            g.style.left = x + 'px';
            layer.appendChild(g);
            requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add('on')));
        });
        await Promise.all(agents.map((a, i) =>
            wait(i * 70).then(() => move(a, innerWidth * rand(0.25, 0.75), innerHeight * rand(0.2, 0.5), 520))));
        if (skipped) return;
        progress(0.05);

        await pool(onScreen, draw);
        if (skipped) return;
        progress(0.3);

        // Content.
        log('● writing content', 'phase');
        const texts = [...page.querySelectorAll(TEXT)];
        const textOnScreen = texts.filter(visible);
        texts.filter(t => !textOnScreen.includes(t)).forEach(t => t.querySelectorAll('.bi-ch').forEach(c => c.classList.add('on')));
        await pool(textOnScreen, type);
        if (skipped) return;
        page.querySelectorAll('.bi-ch').forEach(c => c.classList.add('on'));
        progress(0.6);

        // Style.
        log('● applying design tokens', 'phase');
        canvas.classList.add('gone');
        layer.querySelectorAll('.bi-guide').forEach(g => g.classList.add('off'));
        tags.forEach((t, i) => setTimeout(() => t.classList.add('off'), i * 60));
        boxes.filter(b => !onScreen.includes(b)).forEach(styleNow);
        await pool(onScreen, paint);
        if (skipped) return;
        progress(0.85);

        // Motion.
        log('● wiring interactions', 'phase');
        const demo = onScreen.filter(b => b.matches('.link-plate, .repo-card, .article-card')).slice(0, agents.length);
        await pool(demo, hover);
        if (skipped) return;
        const shine = document.createElement('div');
        shine.className = 'bi-shine';
        layer.appendChild(shine);
        progress(1);
        log(`✓ build complete in ${((performance.now() - t0) / 1000).toFixed(1)}s · 0 errors`, 'ok');

        // Agents leave.
        await Promise.all(agents.map((a, i) => wait(i * 60).then(() => {
            a.el.style.opacity = '0';
            return move(a, a.x + rand(-80, 80), a.y + rand(40, 120), 500);
        })));
        if (skipped) return;
        await wait(150);
        if (skipped) return;
        finish();
    }

    // ─── Hand over to the real page ─────────────────────────────────
    function finish() {
        if (finished) return;
        finished = true;
        skipped = true;
        wakers.forEach(w => w());
        clearInterval(clock);

        wraps.forEach(({ wrap, node }) => wrap.replaceWith(node));
        // Put attributes back byte-for-byte so the page DOM matches a no-intro load.
        // (Chrome writes CSSOM edits to the attribute lazily; reading it first flushes that,
        // otherwise a stale style="" can come back after removeAttribute.)
        boxStyles.forEach((style, el) => {
            el.getAttribute('style');
            style === null ? el.removeAttribute('style') : el.setAttribute('style', style);
        });
        document.querySelectorAll('.bi-drawn, .bi-styled, .bi-pop, .bi-hover').forEach(el => {
            el.classList.remove('bi-drawn', 'bi-styled', 'bi-pop', 'bi-hover');
            if (!el.classList.length) el.removeAttribute('class');
        });

        root.classList.add('bi-done');
        root.classList.remove('bi', 'bi-ready');

        canvas.classList.add('gone');
        layer.classList.add('gone');
        setTimeout(() => { canvas.remove(); layer.remove(); }, 1500);

        ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(e => removeEventListener(e, skip, true));
    }

    function skip() { finish(); }
    ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(e => addEventListener(e, skip, { capture: true, passive: true }));

    run();
})();
