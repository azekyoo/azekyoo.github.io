// Build intro: four fake agents scaffold, write, style and animate the home page
// on top of the real DOM. What is on screen is built on load, and every further part
// joins the same work queue the moment it scrolls into view. Once every part is built
// the page is handed back untouched.
(function () {
    const root = document.documentElement;
    if (!root.classList.contains('bi')) return;

    const page = document.querySelector('.page');
    if (!page) { root.classList.remove('bi'); return; }

    const BOX = '.avatar, .about-card, .link-plate, .paper-card, .repo-card, .article-card';
    const LOOSE = '.hero-text, .section-head, .page-foot';
    const MEDIA = '.avatar img, .plate-icon img, .zenn-mark, .plate-arrow, .about-icon, .article-emoji, .dot';
    const TEXT = '.hero-text h1, .tagline, .about-row, .plate-title, .plate-sub, .section-head, .badge, ' +
        '.paper-title, .paper-authors, .paper-venue, .pill, .paper-notice, .repo-name, .repo-desc, ' +
        '.repo-meta, .article-title, .article-meta, .page-foot';
    const BI_CLASSES = ['bi-z', 'bi-drawn', 'bi-styled', 'bi-pop', 'bi-hover'];

    const AGENTS = [
        { name: 'aria', color: '#7c5cff' },
        { name: 'kai', color: '#ff4f8b' },
        { name: 'nyx', color: '#12a88f' },
        { name: 'juno', color: '#f08a00' },
    ];

    const SNIPPETS = ['backdrop-filter: blur(24px)', 'border-radius: 20px', 'background: var(--surface)',
        'box-shadow: inset 0 1px 0 #fffb', 'saturate(1.8)', 'border: 1px solid var(--border)'];

    const t0 = performance.now();
    let skipped = false;   // set at teardown; stops any animation still in flight
    let finished = false;
    const wakers = new Set();

    // ─── Helpers ────────────────────────────────────────────────────
    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const easeInOut = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const easeOut = p => 1 - Math.pow(1 - p, 3);
    const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const tagOf = el => el.tagName.toLowerCase() + '.' + el.classList[0];
    const secs = () => ((performance.now() - t0) / 1000).toFixed(1) + 's';
    const inView = el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };

    // Rect in document coordinates, so positions stay right while the page scrolls.
    function docRect(el) {
        const r = el.getBoundingClientRect();
        return { left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY,
            width: r.width, height: r.height };
    }

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

    // ─── Units ──────────────────────────────────────────────────────
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    scrollTo(0, 0);

    const units = [...page.querySelectorAll(BOX + ', ' + LOOSE)];
    const savedStyle = new Map(units.map(u => [u, u.getAttribute('style')]));
    const pending = new Set(units);   // not started yet
    const live = new Set(units);      // not handed back yet
    const unitWraps = new Map();
    const unitTags = new Map();
    units.forEach(u => u.classList.add('bi-z'));

    // Wrap every visible character in a span so it can be "typed" without the layout moving.
    // Whitespace runs stay as plain text nodes so collapsing is unchanged.
    const seg = window.Intl && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    const graphemes = s => seg ? Array.from(seg.segment(s), x => x.segment) : Array.from(s);
    units.forEach(u => {
        const nodes = [];
        const walker = document.createTreeWalker(u, NodeFilter.SHOW_TEXT, {
            acceptNode: n => n.nodeValue.trim() && !n.parentElement.closest('.about-icon, .article-emoji')
                ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
        });
        while (walker.nextNode()) nodes.push(walker.currentNode);
        unitWraps.set(u, nodes.map(node => {
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
            return { wrap, node };
        }));
    });

    // ─── Layers ─────────────────────────────────────────────────────
    const canvas = document.createElement('div');
    canvas.id = 'bi-canvas';
    document.body.appendChild(canvas);

    const layer = document.createElement('div');
    layer.id = 'bi-layer';
    document.body.appendChild(layer);
    const sizeLayer = () => { layer.style.height = document.documentElement.scrollHeight + 'px'; };
    sizeLayer();

    const hud = document.createElement('div');
    hud.id = 'bi-hud';
    hud.innerHTML =
        '<div class="bi-log"><div class="bi-log-head"><span>build · azekyo.com</span><span class="bi-time">0.0s</span></div>' +
        '<div class="bi-log-lines"></div><div class="bi-progress"><i></i></div></div>';
    document.body.appendChild(hud);
    const logLines = hud.querySelector('.bi-log-lines');
    const progressBar = hud.querySelector('.bi-progress i');
    const timeEl = hud.querySelector('.bi-time');

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
    const progress = () => { progressBar.style.width = Math.round((1 - live.size / units.length) * 100) + '%'; };
    const clock = setInterval(() => { timeEl.textContent = secs(); }, 100);

    // ─── Agents (cursors) ───────────────────────────────────────────
    const ARROW = '<svg viewBox="0 0 18 18"><path d="M2 1.5 L2 15 L5.6 11.6 L8.2 17 L10.6 15.9 L8.1 10.7 L13.2 10.5 Z" ' +
        'fill="currentColor" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>';

    const agents = AGENTS.map(a => {
        const el = document.createElement('div');
        el.className = 'bi-cur';
        el.style.color = a.color;
        el.innerHTML = ARROW + `<div class="bi-cur-label"><span class="bi-cur-name" style="background:${a.color}">${a.name}</span>` +
            '<span class="bi-cur-status"></span></div>';
        layer.appendChild(el);
        return { ...a, el, status: el.querySelector('.bi-cur-status'), x: -60, y: 0, present: false, moveId: 0, nextDur: 0, leaveTimer: 0 };
    });

    function place(a, x, y) {
        a.x = x; a.y = y;
        a.el.style.transform = `translate(${x}px, ${y}px)`;
    }

    function setStatus(a, text) { a.status.textContent = text; }

    // Curved, eased glide to a point (document coordinates). A newer move cancels an older one.
    function move(a, tx, ty, dur) {
        const id = ++a.moveId;
        const sx = a.x, sy = a.y;
        const dist = Math.hypot(tx - sx, ty - sy);
        dur = dur || a.nextDur || clamp(dist * 0.5, 150, 380);
        a.nextDur = 0;
        const bend = rand(-0.25, 0.25) * dist;
        const cx = (sx + tx) / 2 + (ty - sy) / (dist || 1) * bend;
        const cy = (sy + ty) / 2 - (tx - sx) / (dist || 1) * bend;
        return tween(dur, p => {
            if (a.moveId !== id) return;
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

    // Fly in from a screen edge (around the current scroll position) when picking up work.
    function arriveOne(a) {
        a.present = true;
        const edge = [[-40, 0.3], [innerWidth + 40, 0.2], [innerWidth * 0.4, 1.05], [innerWidth + 40, 0.8]][agents.indexOf(a)];
        place(a, scrollX + edge[0], scrollY + innerHeight * edge[1]);
        a.el.style.opacity = '1';
        a.nextDur = 520;
    }

    function leaveOne(a) {
        a.present = false;
        a.el.style.opacity = '0';
        setStatus(a, '');
        move(a, a.x + rand(-80, 80), a.y + rand(40, 120), 500);
    }

    // ─── Scaffold ───────────────────────────────────────────────────
    async function draw(a, el) {
        const r = docRect(el);
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
        unitTags.set(el, t);
        setStatus(a, '');
    }

    // ─── Write ──────────────────────────────────────────────────────
    async function type(a, el) {
        const chars = [...el.querySelectorAll('.bi-ch:not(.on)')];
        if (!chars.length) return;
        const first = chars[0].getBoundingClientRect();
        setStatus(a, 'writing');
        await move(a, first.left + scrollX, first.bottom + scrollY);
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
            const x = r.right + 2 + scrollX, y = r.bottom + scrollY;
            place(a, a.x + (x - a.x) * 0.35, a.y + (y - a.y) * 0.35);
            setStatus(a, `writing ${shown}/${chars.length}`);
        });
        if (caret) caret.classList.remove('caret');
        setStatus(a, '');
    }

    // ─── Style ──────────────────────────────────────────────────────
    function styleNow(el) {
        el.classList.add('bi-styled');
        el.querySelectorAll('.badge, .pill').forEach(b => b.classList.add('bi-styled'));
        [...el.querySelectorAll(MEDIA)].forEach((m, i) =>
            setTimeout(() => live.has(el) && m.classList.add('bi-pop'), 80 + i * 70));
        const t = unitTags.get(el);
        if (t) t.classList.add('off');
    }

    async function paint(a, el) {
        const r = docRect(el);
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

    // ─── Motion ─────────────────────────────────────────────────────
    async function hover(a, el) {
        const r = docRect(el);
        setStatus(a, ':hover');
        await move(a, r.left + r.width * rand(0.4, 0.75), r.top + r.height * 0.55);
        if (skipped) return;
        say(a, `.${el.classList[0]}:hover <span style="opacity:.7">{ translateY(-6px) }</span>`);
        el.classList.add('bi-hover');
        await wait(380);
        el.classList.remove('bi-hover');
        setStatus(a, '');
    }

    // ─── Work queue ─────────────────────────────────────────────────
    // One shared queue for the whole visit. Units join it the moment they scroll into view,
    // even mid-intro. Agents always take the earliest stage first (draw → write → style →
    // hover), so newly visible boxes get scaffolded straight away and the build never pauses
    // between "batches". Few tasks → only the first agent or two to wake pick them up.
    const STAGE = { draw: 0, type: 1, paint: 2, hover: 3 };
    const queue = [];
    const firstSet = new Set();
    const said = new Set();
    let seq = 0, busy = 0, idleTimer = 0, signals = [];

    const once = (key, fn) => { if (!said.has(key)) { said.add(key); fn(); } };
    const notify = () => signals.splice(0).forEach(f => f());
    const nextSignal = () => new Promise(res => { if (skipped) return res(); signals.push(res); });

    function push(stage, unit, run, ready, done) {
        queue.push({ stage, order: seq++, unit, run, ready, done });
    }

    function takeTask() {
        let best = -1;
        queue.forEach((t, i) => {
            if (!t.ready()) return;
            const b = queue[best];
            if (!b || t.stage < b.stage || (t.stage === b.stage && t.order < b.order)) best = i;
        });
        return best < 0 ? null : queue.splice(best, 1)[0];
    }

    function enqueue(list, fromScroll) {
        if (!list.length) return;
        list.forEach(u => {
            pending.delete(u);
            const isBox = u.matches(BOX);
            const texts = u.matches(TEXT) ? [u] : [...u.querySelectorAll(TEXT)];
            const st = { drawn: !isBox, typesLeft: texts.length };
            if (isBox) push(STAGE.draw, u, a => draw(a, u), () => true, () => { st.drawn = true; });
            texts.forEach(t => push(STAGE.type, u, a => type(a, t), () => st.drawn, () => {
                if (--st.typesLeft) return;
                u.querySelectorAll('.bi-ch').forEach(c => c.classList.add('on'));
                if (!isBox) unitStyled(u);
            }));
            if (isBox) push(STAGE.paint, u, a => paint(a, u), () => st.drawn && !st.typesLeft, () => unitStyled(u));
        });
        if (fromScroll) {
            const where = [...new Set(list.map(u => {
                const sec = u.closest('section, header, footer');
                return sec ? '.' + sec.classList[0] : 'page';
            }))].join(' ');
            log(`● scroll → building ${where}`, 'phase');
        }
        clearTimeout(idleTimer);
        hud.classList.remove('idle');
        notify();
    }

    // A unit is finished: let its wireframe → glass transition play out, then hand it back.
    function unitStyled(u) {
        u.classList.add('bi-styled');
        u.querySelectorAll('.bi-ch').forEach(c => c.classList.add('on'));
        setTimeout(() => handBack(u), 900);
        if (firstSet.delete(u) && !firstSet.size) firstViewBuilt();
    }

    function firstViewBuilt() {
        log(`✓ viewport built in ${secs()}` + (pending.size ? ' · scroll for more' : ''), 'ok');
        const demo = units.filter(u => u.matches('.link-plate, .repo-card, .article-card') && inView(u)).slice(0, agents.length);
        demo.forEach(u => push(STAGE.hover, u, a => hover(a, u), () => true));
        notify();
    }

    function runTask(a, t) {
        if (t.stage === STAGE.type) once('type', () => log('● writing content', 'phase'));
        if (t.stage === STAGE.paint) once('paint', () => {
            log('● applying design tokens', 'phase');
            canvas.classList.add('gone');
            layer.querySelectorAll('.bi-guide').forEach(g => g.classList.add('off'));
            setTimeout(() => canvas.remove(), 1500);
        });
        if (t.stage === STAGE.hover) once('hover', () => log('● wiring interactions', 'phase'));
        return t.run(a);
    }

    function idleSoon() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { if (!busy && !queue.length && !skipped) hud.classList.add('idle'); }, 1600);
    }

    async function worker(a, k) {
        await wait(k * 90);
        while (!skipped) {
            const task = takeTask();
            if (!task) {
                // Nothing left at all → wander off after a moment. Work still blocked on
                // another agent → stay around.
                if (!queue.length) {
                    if (a.present && !a.leaveTimer) a.leaveTimer = setTimeout(() => { a.leaveTimer = 0; leaveOne(a); }, 600);
                    if (!busy) idleSoon();
                }
                await nextSignal();
                await wait(k * 90);
                continue;
            }
            clearTimeout(a.leaveTimer);
            a.leaveTimer = 0;
            if (!a.present) arriveOne(a);
            busy++;
            await runTask(a, task);
            busy--;
            if (skipped) return;
            if (task.done) task.done();
            notify();
            await wait(rand(10, 50));
        }
    }

    // ─── Hand a unit back to the real page, byte-for-byte ───────────
    function handBack(u) {
        if (!live.has(u)) return;
        live.delete(u);
        unitWraps.get(u).forEach(({ wrap, node }) => wrap.replaceWith(node));
        // Chrome writes CSSOM edits to the attribute lazily; reading it first flushes that,
        // otherwise a stale style="" can come back after removeAttribute.
        u.getAttribute('style');
        const st = savedStyle.get(u);
        st === null ? u.removeAttribute('style') : u.setAttribute('style', st);
        [u, ...u.querySelectorAll('.' + BI_CLASSES.join(', .'))].forEach(el => {
            el.classList.remove(...BI_CLASSES);
            if (!el.classList.length) el.removeAttribute('class');
        });
        const t = unitTags.get(u);
        if (t) setTimeout(() => t.remove(), 600);
        progress();
        if (!live.size && !finished) {
            log(`✓ all sections built in ${secs()} · 0 errors`, 'ok');
            setTimeout(finish, 1400);
        }
    }

    // ─── Start: what is on screen now; the rest joins as it scrolls in ─
    function start() {
        log('● scaffolding layout', 'phase');
        const pr = page.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(page).paddingLeft);
        [pr.left + pad, pr.right - pad].forEach(x => {
            const g = document.createElement('div');
            g.className = 'bi-guide';
            g.style.left = x + scrollX + 'px';
            layer.appendChild(g);
            requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add('on')));
        });
        const firstUnits = units.filter(inView);
        firstUnits.forEach(u => firstSet.add(u));
        enqueue(firstUnits, false);
        agents.forEach(worker);
    }

    let scrollQueued = false;
    function onScroll() {
        if (scrollQueued || skipped) return;
        scrollQueued = true;
        requestAnimationFrame(() => {
            scrollQueued = false;
            if (!skipped) enqueue([...pending].filter(inView), true);
        });
    }

    function onResize() { sizeLayer(); onScroll(); }

    // ─── Tear down once every unit is handed back ──────────────────────────────────────
    function finish() {
        if (finished) return;
        finished = true;
        skipped = true;
        wakers.forEach(w => w());
        notify();
        clearInterval(clock);
        clearTimeout(idleTimer);
        agents.forEach(a => clearTimeout(a.leaveTimer));

        [...live].forEach(handBack);
        root.classList.add('bi-done');
        root.classList.remove('bi', 'bi-ready');

        canvas.classList.add('gone');
        layer.classList.add('gone');
        hud.classList.add('gone');
        setTimeout(() => { canvas.remove(); layer.remove(); hud.remove(); }, 1500);

        removeEventListener('scroll', onScroll);
        removeEventListener('resize', onResize);
    }

    // No skip: the build always plays. Each part becomes clickable as soon as it is styled.
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onResize);

    start();
})();
