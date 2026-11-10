// TRACE//SYS — client-side user info, hacker HUD edition
'use strict';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n, l = 2) => String(n).padStart(l, '0');
const ua = navigator.userAgent;
const state = { geo: null, gpu: null, battery: null, adblock: false, rttMs: null, fp: null };

/* ---------- small helpers ---------- */

function set(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function scramble(id, finalText, dur = 700) {
    const el = document.getElementById(id);
    if (!el) return;
    const chars = '0123456789ABCDEF#$%&@*<>/\\';
    const t0 = Date.now();
    const iv = setInterval(() => {
        const p = Math.min(1, (Date.now() - t0) / dur);
        const fixed = Math.floor(finalText.length * p);
        let s = finalText.slice(0, fixed);
        for (let i = fixed; i < finalText.length; i++) {
            s += finalText[i] === ' ' ? ' ' : chars[(Math.random() * chars.length) | 0];
        }
        el.textContent = s;
        if (p >= 1) {
            clearInterval(iv);
            el.classList.add('glitch');
            setTimeout(() => el.classList.remove('glitch'), 1000);
        }
    }, 33);
}

const logEl = $('#log');
function log(msg, cls = '') {
    const d = new Date();
    const line = document.createElement('div');
    line.className = cls;
    line.textContent = `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}] ${msg}`;
    logEl.appendChild(line);
    while (logEl.children.length > 7) logEl.firstChild.remove();
}

function hash(str, seed = 0) {
    // cyrb53
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

async function fetchJson(url, ms = 4500) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms);
    try {
        const r = await fetch(url, { signal: ctrl.signal });
        if (!r.ok) throw new Error(r.status);
        return await r.json();
    } finally { clearTimeout(to); }
}

/* ---------- detection ---------- */

function getOS() {
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1)) return 'iOS';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac/i.test(ua)) return 'macOS';
    if (/CrOS/i.test(ua)) return 'ChromeOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Unknown';
}

function getBrowser() {
    const m = (re) => ua.match(re)?.[1] || '?';
    if (/Edg\//.test(ua)) return { name: 'Edge', version: m(/Edg\/([\d.]+)/), engine: 'Blink' };
    if (/OPR\/|Opera/.test(ua)) return { name: 'Opera', version: m(/(?:OPR|Opera)\/([\d.]+)/), engine: 'Blink' };
    if (/Firefox\//.test(ua)) return { name: 'Firefox', version: m(/Firefox\/([\d.]+)/), engine: 'Gecko' };
    if (/Chrome\//.test(ua)) return { name: 'Chrome', version: m(/Chrome\/([\d.]+)/), engine: 'Blink' };
    if (/Safari\//.test(ua)) return { name: 'Safari', version: m(/Version\/([\d.]+)/), engine: 'WebKit' };
    return { name: 'Unknown', version: '?', engine: '?' };
}

async function getGeo() {
    const t0 = performance.now();
    try {
        const d = await fetchJson('https://ipapi.co/json/');
        if (d.error) throw new Error(d.reason);
        state.rttMs = Math.round(performance.now() - t0);
        return {
            ip: d.ip, city: d.city, region: d.region, country: d.country_name, cc: d.country_code,
            postal: d.postal, lat: d.latitude, lon: d.longitude, isp: d.org, asn: d.asn,
        };
    } catch (e) {
        log('primary geo relay refused, rerouting…', 'warn');
    }
    try {
        const t1 = performance.now();
        const d = await fetchJson('https://ipwho.is/');
        if (d.success === false) throw new Error(d.message);
        state.rttMs = Math.round(performance.now() - t1);
        return {
            ip: d.ip, city: d.city, region: d.region, country: d.country, cc: d.country_code,
            postal: d.postal, lat: d.latitude, lon: d.longitude,
            isp: d.connection?.isp || d.connection?.org, asn: d.connection?.asn ? 'AS' + d.connection.asn : null,
        };
    } catch (e) {
        return null;
    }
}

function getGPU() {
    try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
        if (!gl) return null;
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        return {
            renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
            unmasked: !!dbg,
        };
    } catch { return null; }
}

function canvasFingerprint() {
    try {
        const c = document.createElement('canvas');
        c.width = 220; c.height = 40;
        const x = c.getContext('2d');
        x.textBaseline = 'top';
        x.font = '16px Arial';
        x.fillStyle = '#f60'; x.fillRect(100, 1, 62, 20);
        x.fillStyle = '#069'; x.fillText('TRACE//SYS 😎 ☯', 2, 15);
        x.fillStyle = 'rgba(102,204,0,0.7)'; x.fillText('TRACE//SYS 😎 ☯', 4, 17);
        return c.toDataURL();
    } catch { return ''; }
}

function detectAdBlock() {
    return new Promise((res) => {
        const el = document.createElement('div');
        el.className = 'adsbox ad-banner textads banner-ads';
        el.innerHTML = '&nbsp;';
        el.style.cssText = 'position:absolute;left:-9999px;height:10px;width:10px';
        document.body.appendChild(el);
        setTimeout(() => {
            const blocked = el.offsetHeight === 0 || getComputedStyle(el).display === 'none';
            el.remove();
            res(blocked);
        }, 120);
    });
}

/* ---------- globe ---------- */

const Globe = (() => {
    const wrap = $('#globeWrap');
    const canvas = $('#globe');
    if (typeof d3 === 'undefined') {
        return { lockOn() {}, ok: false };
    }
    const ctx = canvas.getContext('2d');
    canvas.style.touchAction = 'none';
    const proj = d3.geoOrthographic().clipAngle(90).precision(0.6);
    const path = d3.geoPath(proj, ctx);
    const grat = d3.geoGraticule10();
    const relays = [[-21.9, 64.1], [103.8, 1.35], [8.68, 50.11], [-122.4, 37.77], [151.2, -33.87]];
    let w = 0, h = 0, R = 0, zoom = 1;
    let rot = [0, -18, 0];
    let land = null, borders = null, countries = null, hit = null;
    let target = null, anim = null, locked = false, lockT = 0;
    let drag = null, lastInteract = 0;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = wrap.clientWidth; h = wrap.clientHeight;
        canvas.width = w * dpr; canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        R = Math.min(w, h) * 0.42;
    }
    window.addEventListener('resize', resize);
    resize();

    fetchJson('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json', 10000)
        .then((world) => {
            land = topojson.feature(world, world.objects.land);
            countries = topojson.feature(world, world.objects.countries).features;
            borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
            if (target) findHit();
            log('world mesh loaded: ' + countries.length + ' sectors', 'ok');
        })
        .catch(() => log('world mesh unavailable', 'bad'));

    function findHit() {
        hit = countries?.find((f) => d3.geoContains(f, [target.lon, target.lat])) || null;
    }

    canvas.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY, r: rot.slice() };
        anim = null;
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const k = 0.35 / zoom;
        rot[0] = drag.r[0] + (e.clientX - drag.x) * k;
        rot[1] = Math.max(-85, Math.min(85, drag.r[1] - (e.clientY - drag.y) * k));
    });
    const endDrag = () => { drag = null; lastInteract = performance.now(); };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    function flyTo(lon, lat, z, dur) {
        const from = rot.slice();
        const d = ((-lon - from[0] + 540) % 360) - 180;
        anim = { t0: performance.now(), dur, from, to: [from[0] + d, -lat, 0], z0: zoom, z1: z };
    }

    function lockOn(lat, lon) {
        target = { lat, lon };
        findHit();
        flyTo(lon, lat, 1.3, 3000);
    }

    function frame(t) {
        if (wrap.clientWidth !== w || wrap.clientHeight !== h) resize();
        if (anim) {
            const p = Math.min(1, (t - anim.t0) / anim.dur);
            const e = ease(p);
            rot = anim.from.map((v, i) => v + (anim.to[i] - v) * e);
            zoom = anim.z0 + (anim.z1 - anim.z0) * e;
            if (p >= 1) {
                anim = null;
                if (target && !locked) {
                    locked = true; lockT = t;
                    $('#lockOut').textContent = 'LOCKED';
                    $('#lockOut').classList.add('locked');
                    log('TARGET LOCKED', 'bad');
                }
            }
        } else if (!drag) {
            if (!target) rot[0] += 0.18;
            else if (t - lastInteract > 3500 && lastInteract) {
                lastInteract = 0;
                flyTo(target.lon, target.lat, 1.3, 1600);
            }
        }

        const r = R * zoom;
        proj.rotate(rot).scale(r).translate([w / 2, h / 2]);
        wrap.style.setProperty('--d', Math.min(r * 2, Math.max(w, h) * 1.2) + 'px');
        ctx.clearRect(0, 0, w, h);

        // glow
        const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.6, w / 2, h / 2, r * 1.25);
        g.addColorStop(0, 'rgba(0,255,136,0.10)');
        g.addColorStop(1, 'rgba(0,255,136,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        // sphere
        const sg = ctx.createRadialGradient(w / 2 - r * 0.3, h / 2 - r * 0.3, r * 0.1, w / 2, h / 2, r);
        sg.addColorStop(0, '#04261a');
        sg.addColorStop(1, '#010a06');
        ctx.beginPath(); path({ type: 'Sphere' });
        ctx.fillStyle = sg; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,255,136,0.55)'; ctx.stroke();

        ctx.beginPath(); path(grat);
        ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(0,255,136,0.12)'; ctx.stroke();

        if (land) {
            ctx.beginPath(); path(land);
            ctx.fillStyle = 'rgba(0,255,136,0.13)'; ctx.fill();
            ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(0,255,136,0.75)'; ctx.stroke();
            ctx.beginPath(); path(borders);
            ctx.lineWidth = 0.4; ctx.strokeStyle = 'rgba(0,255,136,0.25)'; ctx.stroke();
        }
        if (hit) {
            ctx.beginPath(); path(hit);
            const a = 0.18 + 0.12 * Math.sin(t / 300);
            ctx.fillStyle = `rgba(255,51,85,${a})`; ctx.fill();
            ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,51,85,0.9)'; ctx.stroke();
        }

        if (target) {
            const tp = [target.lon, target.lat];

            // relay trace arcs
            if (locked) {
                relays.forEach((src, i) => {
                    const prog = Math.min(1, Math.max(0, (t - lockT - i * 250) / 1400));
                    if (prog <= 0) return;
                    const interp = d3.geoInterpolate(src, tp);
                    const pts = d3.range(0, prog + 1e-9, 0.02).map(interp);
                    ctx.beginPath(); path({ type: 'LineString', coordinates: pts });
                    ctx.setLineDash([4, 4]); ctx.lineDashOffset = -t / 40;
                    ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(54,230,255,0.75)'; ctx.stroke();
                    ctx.setLineDash([]);
                    const s = proj(src);
                    if (s && d3.geoDistance(src, [-rot[0], -rot[1]]) < Math.PI / 2) {
                        ctx.fillStyle = '#36e6ff';
                        ctx.fillRect(s[0] - 2, s[1] - 2, 4, 4);
                    }
                });
            }

            const visible = d3.geoDistance(tp, [-rot[0], -rot[1]]) < Math.PI / 2 - 0.02;
            const p = proj(tp);
            if (visible && p) {
                const [x, y] = p;
                // crosshair
                ctx.setLineDash([3, 5]);
                ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,51,85,0.45)';
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
                ctx.setLineDash([]);
                // pulse rings
                for (let k = 0; k < 3; k++) {
                    const ph = ((t / 1600) + k / 3) % 1;
                    ctx.beginPath(); ctx.arc(x, y, 4 + ph * 38, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(255,51,85,${1 - ph})`; ctx.lineWidth = 1.5; ctx.stroke();
                }
                // reticle
                ctx.strokeStyle = '#ff3355'; ctx.lineWidth = 1.5;
                const s = 14;
                ctx.beginPath();
                ctx.moveTo(x - s, y - s + 5); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + 5, y - s);
                ctx.moveTo(x + s - 5, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + 5);
                ctx.moveTo(x + s, y + s - 5); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - 5, y + s);
                ctx.moveTo(x - s + 5, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s, y + s - 5);
                ctx.stroke();
                // pin
                ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#ff3355'; ctx.shadowColor = '#ff3355'; ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0;
                // label
                if (locked) {
                    const label = (target.label || 'TARGET').toUpperCase();
                    ctx.font = '700 11px "JetBrains Mono", monospace';
                    const tw = ctx.measureText(label).width;
                    const lx = Math.min(x + 22, w - tw - 20), ly = Math.max(y - 34, 14);
                    ctx.strokeStyle = '#ff3355'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(x + 6, y - 6); ctx.lineTo(lx, ly + 10); ctx.stroke();
                    ctx.fillStyle = 'rgba(30,0,8,0.85)';
                    ctx.fillRect(lx, ly - 4, tw + 14, 20);
                    ctx.strokeRect(lx, ly - 4, tw + 14, 20);
                    ctx.fillStyle = '#ff3355';
                    ctx.fillText(label, lx + 7, ly + 10);
                }
            }
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
        ok: true,
        lockOn(lat, lon, label) { lockOn(lat, lon); target.label = label; },
    };
})();

/* ---------- renderers ---------- */

function renderGeo(geo) {
    if (!geo) {
        set('ipAddress', 'UNRESOLVED');
        ['isp', 'asn', 'city', 'region', 'country', 'postal', 'coords'].forEach((k) => set(k, 'blocked'));
        $('#lockOut').textContent = 'FAILED';
        log('geo trace failed — target behind shield', 'bad');
        return;
    }
    if ((geo.ip || '').includes(':')) $('#ipAddress').classList.add('v6');
    scramble('ipAddress', geo.ip || '?', 1200);
    set('isp', geo.isp || '—');
    set('asn', geo.asn || '—');
    set('city', geo.city || '—');
    set('region', geo.region || '—');
    set('country', `${geo.country || '—'}${geo.cc ? ' [' + geo.cc + ']' : ''}`);
    set('postal', geo.postal || '—');
    if (geo.lat != null && geo.lon != null) {
        const lat = (+geo.lat).toFixed(4), lon = (+geo.lon).toFixed(4);
        set('coords', `${lat}, ${lon}`);
        scramble('latOut', lat, 2600);
        scramble('lonOut', lon, 2600);
        $('#lockOut').textContent = 'ACQUIRING';
        Globe.lockOn(+geo.lat, +geo.lon, `${geo.city || '?'}, ${geo.cc || ''}`);
        log(`triangulated ${geo.city}, ${geo.country}`, 'ok');
    }
    log(`uplink via ${geo.isp || 'unknown carrier'}`);
}

async function renderDevice() {
    const os = getOS();
    const br = getBrowser();
    const badges = { Windows: 'WIN', macOS: 'MAC', Linux: 'LNX', Android: 'AND', iOS: 'iOS', ChromeOS: 'CRS' };
    set('osBadge', badges[os] || '???');
    set('browserLine', `${br.name} ${br.version} · ${br.engine}`);

    let osName = os, arch = '';
    if (navigator.userAgentData?.getHighEntropyValues) {
        try {
            const hv = await navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness', 'platformVersion', 'model']);
            if (os === 'Windows' && hv.platformVersion) {
                osName = parseInt(hv.platformVersion, 10) >= 13 ? 'Windows 11' : 'Windows 10';
            } else if (hv.platformVersion) {
                osName = `${os} ${hv.platformVersion}`;
            }
            arch = [hv.architecture, hv.bitness && hv.bitness + '-bit', hv.model].filter(Boolean).join(' · ');
        } catch {}
    }
    if (!arch) {
        if (/arm64|aarch64/i.test(ua)) arch = 'arm64';
        else if (/x64|Win64|x86_64|amd64/i.test(ua)) arch = 'x86 · 64-bit';
        else arch = navigator.platform || 'unknown arch';
    }
    set('osName', osName);
    set('archLine', arch);
    log(`os signature: ${osName} / ${br.name}`);

    // CPU
    const n = navigator.hardwareConcurrency || 0;
    set('cpuCount', n ? n + ' threads' : 'hidden');
    const cores = $('#cores');
    for (let i = 0; i < Math.min(n || 4, 64); i++) cores.appendChild(document.createElement('i'));
    const pulse = () => cores.querySelectorAll('i').forEach((c) => c.style.setProperty('--h', (15 + Math.random() * 85) + '%'));
    pulse(); setInterval(pulse, 700);

    // Memory
    const mem = navigator.deviceMemory;
    if (mem) {
        set('memTxt', mem >= 8 ? '≥ 8 GB' : mem + ' GB');
        setTimeout(() => ($('#memFill').style.width = Math.min(100, (mem / 8) * 100) + '%'), 300);
    } else set('memTxt', 'hidden');

    // Battery
    if (navigator.getBattery) {
        try {
            const b = await navigator.getBattery();
            state.battery = b;
            const upd = () => {
                const lvl = Math.round(b.level * 100);
                let t = `${lvl}% ${b.charging ? '⚡ AC' : 'DISCHARGING'}`;
                const secs = b.charging ? b.chargingTime : b.dischargingTime;
                if (secs && isFinite(secs)) t += ` · ${Math.floor(secs / 3600)}h${pad(Math.floor((secs % 3600) / 60))}`;
                set('batTxt', t);
                $('#batFill').style.width = lvl + '%';
                $('#batFill').classList.toggle('charging', b.charging);
            };
            upd();
            b.addEventListener('levelchange', upd);
            b.addEventListener('chargingchange', upd);
        } catch { set('batTxt', 'shielded'); }
    } else set('batTxt', 'no api');

    // GPU
    state.gpu = getGPU();
    set('gpu', state.gpu ? `${state.gpu.renderer}\n${state.gpu.vendor}` : 'WebGL disabled');
    if (state.gpu) log('gpu exposed: ' + state.gpu.renderer.slice(0, 48), state.gpu.unmasked ? 'warn' : '');

    renderScreens();
    setInterval(renderScreens, 1000);
    window.addEventListener('resize', renderScreens);
}

function renderNet() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let bars = 0, txt = '';
    if (c && c.effectiveType) {
        bars = { 'slow-2g': 1, '2g': 2, '3g': 3, '4g': c.rtt > 120 ? 4 : 5 }[c.effectiveType] || 3;
        txt = [c.effectiveType.toUpperCase(), c.downlink != null && c.downlink + 'Mbps', c.rtt != null && c.rtt + 'ms'].filter(Boolean).join(' · ');
    } else if (state.rttMs != null) {
        const r = state.rttMs;
        bars = r < 150 ? 5 : r < 300 ? 4 : r < 600 ? 3 : r < 1200 ? 2 : 1;
        txt = `~${r}ms (measured)`;
    } else txt = navigator.onLine ? 'ONLINE' : 'OFFLINE';
    set('netTxt', txt);
    $('#signal').querySelectorAll('i').forEach((el, i) => setTimeout(() => el.classList.toggle('on', i < bars), i * 150));
}

function renderScreens() {
    const box = $('#screens');
    const bw = box.clientWidth - 12, bh = box.clientHeight - 12;
    const sw = screen.width, sh = screen.height;
    const k = Math.min(bw / sw, bh / sh);
    const ox = 6 + (bw - sw * k) / 2, oy = 6 + (bh - sh * k) / 2;
    const place = (el, x, y, w, h) => Object.assign(el.style, {
        left: ox + x * k + 'px', top: oy + y * k + 'px', width: Math.max(4, w * k) + 'px', height: Math.max(4, h * k) + 'px',
    });
    const wx = Math.max(0, Math.min(sw - window.outerWidth, (window.screenX || 0) - (screen.availLeft || 0)));
    const wy = Math.max(0, Math.min(sh - window.outerHeight, (window.screenY || 0) - (screen.availTop || 0)));
    place($('#scrScreen'), 0, 0, sw, sh);
    const ow = Math.min(sw, window.outerWidth || innerWidth), oh = Math.min(sh, window.outerHeight || innerHeight);
    place($('#scrWindow'), wx, wy, ow, oh);
    const vw = Math.min(ow, innerWidth), vh = Math.min(oh, innerHeight);
    const chromeX = Math.max(0, (ow - vw) / 2);
    const chromeY = Math.max(0, oh - vh - chromeX);
    place($('#scrViewport'), wx + chromeX, wy + chromeY, vw, vh);
    set('screenTxt', `${sw}×${sh}`);
    set('dprTxt', `DPR ${window.devicePixelRatio}×`);
    set('depthTxt', `${screen.colorDepth}-bit`);
    set('orientTxt', screen.orientation ? screen.orientation.type.toUpperCase() : (innerWidth > innerHeight ? 'LANDSCAPE' : 'PORTRAIT'));
}

async function renderFingerprint() {
    const parts = [
        ua, navigator.language, (navigator.languages || []).join(), screen.width, screen.height, screen.colorDepth,
        devicePixelRatio, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.hardwareConcurrency,
        navigator.deviceMemory, navigator.maxTouchPoints, state.gpu?.renderer, state.gpu?.vendor, canvasFingerprint(),
    ];
    const raw = parts.join('|');
    const h = (hash(raw) + hash(raw, 1337)).toUpperCase();
    state.fp = h;
    scramble('fpHash', h.match(/.{4}/g).join(' '), 1500);

    // barcode
    const c = $('#fpCanvas');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = c.clientWidth * dpr; c.height = 48 * dpr;
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const W = c.clientWidth;
    const bits = h.split('').map((ch) => parseInt(ch, 16).toString(2).padStart(4, '0')).join('');
    const bw = W / bits.length;
    bits.split('').forEach((b, i) => {
        setTimeout(() => {
            x.fillStyle = b === '1' ? '#00ff88' : 'rgba(0,255,136,0.12)';
            x.fillRect(i * bw, 4, Math.max(1, bw - 0.5), 40);
        }, i * 6);
    });

    // rough entropy estimate (illustrative)
    let bitsEst = 10;
    if (state.gpu?.unmasked) bitsEst += 7;
    if ((navigator.languages || []).length > 1) bitsEst += 3;
    if (navigator.hardwareConcurrency) bitsEst += 3;
    if (navigator.deviceMemory) bitsEst += 2;
    if (screen.width !== 1920) bitsEst += 3;
    if (devicePixelRatio !== 1) bitsEst += 2;
    if (!state.adblock) bitsEst += 1;
    const pct = Math.min(99.9, 100 - 100 / Math.pow(2, bitsEst / 3.2)).toFixed(1);
    set('fpUniqueTxt', `${pct}% · ~${bitsEst} bits`);
    setTimeout(() => ($('#fpUnique').style.width = pct + '%'), 300);
    log('fingerprint hashed: ' + h.slice(0, 12) + '…', 'warn');
}

function renderThreat() {
    let s = 0;
    if (state.geo?.lat != null) s += 25;
    if (state.gpu?.unmasked) s += 12;
    if (state.battery) s += 8;
    if (!navigator.doNotTrack || navigator.doNotTrack === '0' || navigator.doNotTrack === 'unspecified') s += 10;
    if (!state.adblock) s += 15;
    if (navigator.cookieEnabled) s += 5;
    if (navigator.connection) s += 5;
    if (navigator.userAgentData) s += 5;
    if ((navigator.languages || []).length > 1) s += 5;
    if ('RTCPeerConnection' in window) s += 5;
    s = Math.min(100, s);
    $('#threatArc').style.strokeDashoffset = 157 * (1 - s / 100);
    const lvl = s >= 75 ? 'CRITICAL' : s >= 50 ? 'HIGH' : s >= 25 ? 'MEDIUM' : 'LOW';
    let cur = 0;
    const iv = setInterval(() => {
        cur = Math.min(s, cur + 2);
        set('threatVal', `${cur}% ${cur === s ? lvl : ''}`);
        if (cur >= s) clearInterval(iv);
    }, 30);
}

async function renderCaps() {
    const has = (o, k) => { try { return k in o; } catch { return false; } };
    let wg2 = false;
    try { wg2 = !!document.createElement('canvas').getContext('webgl2'); } catch {}
    const dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1';
    const caps = [
        ['HTTPS', location.protocol === 'https:'],
        ['COOKIES', navigator.cookieEnabled],
        ['DO-NOT-TRACK', dnt, dnt ? 'y' : 'w'],
        ['AD-BLOCK', state.adblock, state.adblock ? 'y' : 'w'],
        ['WEBGL', !!state.gpu], ['WEBGL2', wg2], ['WEBGPU', has(navigator, 'gpu')],
        ['WEBASSEMBLY', typeof WebAssembly === 'object'], ['SHARED-MEM', typeof SharedArrayBuffer === 'function'],
        ['WEBRTC', has(window, 'RTCPeerConnection')], ['SERVICE-WORKER', has(navigator, 'serviceWorker')],
        ['INDEXEDDB', has(window, 'indexedDB')], ['NOTIFICATIONS', has(window, 'Notification')],
        ['GEOLOCATION', has(navigator, 'geolocation')], ['BLUETOOTH', has(navigator, 'bluetooth')],
        ['USB', has(navigator, 'usb')], ['SERIAL', has(navigator, 'serial')], ['HID', has(navigator, 'hid')],
        ['MIDI', has(navigator, 'requestMIDIAccess')], ['CLIPBOARD', has(navigator, 'clipboard')],
        ['WEB-SHARE', has(navigator, 'share')], ['VIBRATE', has(navigator, 'vibrate')],
        ['WEBXR', has(navigator, 'xr')], ['WAKE-LOCK', has(navigator, 'wakeLock')],
        ['SPEECH', has(window, 'speechSynthesis')], ['PAYMENT', has(window, 'PaymentRequest')],
        ['TOUCH', navigator.maxTouchPoints > 0], ['GAMEPAD', has(navigator, 'getGamepads')],
        ['PDF-VIEWER', !!navigator.pdfViewerEnabled], ['BATTERY', !!state.battery],
    ];
    const box = $('#chips');
    caps.forEach(([name, ok, cls], i) => {
        const el = document.createElement('span');
        el.className = 'chip ' + (cls || (ok ? 'y' : 'n'));
        el.textContent = name;
        el.style.animationDelay = i * 40 + 'ms';
        box.appendChild(el);
    });
    log(`${caps.filter((c) => c[1]).length}/${caps.length} capabilities exposed`);
}

async function renderRaw() {
    const rows = [
        ['USER-AGENT', ua],
        ['LANGUAGES', (navigator.languages || [navigator.language]).join(', ')],
        ['PLATFORM', navigator.userAgentData?.platform || navigator.platform || '—'],
        ['TIMEZONE', Intl.DateTimeFormat().resolvedOptions().timeZone],
        ['LOCALE', Intl.DateTimeFormat().resolvedOptions().locale],
        ['TOUCH PTS', navigator.maxTouchPoints || 0],
        ['VIEWPORT', `${innerWidth}×${innerHeight}`],
        ['AVAIL SCR', `${screen.availWidth}×${screen.availHeight}`],
    ];
    try {
        if (navigator.storage?.estimate) {
            const e = await navigator.storage.estimate();
            rows.push(['STORAGE', `${(e.usage / 1048576).toFixed(2)} MB / ${(e.quota / 1073741824).toFixed(1)} GB`]);
        }
    } catch {}
    try {
        if (navigator.serviceWorker) rows.push(['SW REGS', (await navigator.serviceWorker.getRegistrations()).length]);
    } catch {}
    if ('Notification' in window) rows.push(['PUSH PERM', Notification.permission]);
    try { rows.push(['LOCALSTORE', `${localStorage.length} keys`]); } catch { rows.push(['LOCALSTORE', 'blocked']); }
    try {
        const pe = performance.getEntriesByType('navigation')[0];
        if (pe) rows.push(['PAGE LOAD', Math.round(pe.domContentLoadedEventEnd) + ' ms']);
    } catch {}
    const dl = $('#rawKv');
    rows.forEach(([k, v]) => {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        dl.append(dt, dd);
    });
}

/* ---------- live surveillance ---------- */

function startLive() {
    const t0 = Date.now();
    let clicks = 0, keys = 0;
    set('referrer', document.referrer || 'DIRECT');
    const trail = $('#trail');
    const tx = trail.getContext('2d');
    let last = null;
    const sizeTrail = () => { trail.width = trail.clientWidth; trail.height = trail.clientHeight; };
    sizeTrail();
    window.addEventListener('resize', sizeTrail);

    window.addEventListener('pointermove', (e) => {
        set('cursorPos', `${e.clientX},${e.clientY}`);
        const p = [e.clientX / innerWidth * trail.width, e.clientY / innerHeight * trail.height];
        if (last) {
            tx.strokeStyle = '#00ff88'; tx.lineWidth = 1.2;
            tx.beginPath(); tx.moveTo(last[0], last[1]); tx.lineTo(p[0], p[1]); tx.stroke();
        }
        last = p;
    });
    window.addEventListener('pointerdown', (e) => {
        set('clickCount', ++clicks);
        const p = [e.clientX / innerWidth * trail.width, e.clientY / innerHeight * trail.height];
        tx.strokeStyle = '#ff3355';
        tx.beginPath(); tx.arc(p[0], p[1], 5, 0, Math.PI * 2); tx.stroke();
    });
    window.addEventListener('keydown', () => set('keyCount', ++keys));
    document.addEventListener('visibilitychange', () => {
        const hidden = document.hidden;
        set('tabState', hidden ? 'AWAY' : 'FOCUSED');
        if (!hidden) log('subject returned to tab', 'warn');
    });
    window.addEventListener('blur', () => set('tabState', 'BLURRED'));
    window.addEventListener('focus', () => set('tabState', 'FOCUSED'));
    window.addEventListener('online', () => { log('link restored', 'ok'); renderNet(); });
    window.addEventListener('offline', () => { log('link lost', 'bad'); renderNet(); });

    setInterval(() => {
        if (trail.width !== trail.clientWidth || trail.height !== trail.clientHeight) sizeTrail();
        tx.fillStyle = 'rgba(2,6,4,0.06)';
        tx.fillRect(0, 0, trail.width, trail.height);
    }, 60);

    const tick = () => {
        const now = new Date();
        const s = Math.floor((Date.now() - t0) / 1000);
        set('dwell', `${pad(Math.floor(s / 60))}:${pad(s % 60)}`);
        set('utcClock', now.toISOString().slice(11, 19));
        set('localClock', now.toLocaleTimeString([], { hour12: false }));
    };
    tick(); setInterval(tick, 1000);

    const off = -new Date().getTimezoneOffset();
    set('tzName', Intl.DateTimeFormat().resolvedOptions().timeZone);
    set('tzOffset', `UTC${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`);
}

/* ---------- boot ---------- */

async function boot(geoPromise) {
    const pre = $('#bootLog');
    const fill = $('#bootFill');
    const lines = [
        '> TRACE//SYS kernel 4.2.0 … [ OK ]',
        '> opening covert channel to ' + location.host + ' … [ OK ]',
        '> handshake: ' + (location.protocol === 'https:' ? 'TLS secured' : 'PLAINTEXT') + ' … [ OK ]',
        '> injecting probe into ' + getBrowser().name.toLowerCase() + ' runtime … [ OK ]',
        '> enumerating hardware … [ OK ]',
        '> rendering canvas fingerprint … [ OK ]',
        '> resolving public uplink … ',
    ];
    const total = lines.length + 2;
    for (let i = 0; i < lines.length; i++) {
        pre.textContent += lines[i] + (i < lines.length - 1 ? '\n' : '');
        fill.style.width = ((i + 1) / total) * 100 + '%';
        await sleep(140 + Math.random() * 160);
    }
    const geo = await geoPromise;
    pre.textContent += geo ? '[ ' + geo.ip + ' ]\n' : '[ SHIELDED ]\n';
    fill.style.width = ((lines.length + 1) / total) * 100 + '%';
    await sleep(250);
    pre.textContent += '> triangulating …\n\n  ACCESS GRANTED.';
    fill.style.width = '100%';
    await sleep(650);
    $('#boot').classList.add('done');
    $('#hud').classList.add('on');
    setTimeout(() => $('#boot').remove(), 700);
}

(async function main() {
    $('#sessionId').textContent = Math.random().toString(16).slice(2, 10).toUpperCase();
    const geoPromise = getGeo();
    const adPromise = detectAdBlock();
    startLive();
    log('probe initialised');
    await boot(geoPromise);

    state.geo = await geoPromise;
    state.adblock = await adPromise;
    log(state.adblock ? 'ad-block shield detected' : 'no ad-block shield', state.adblock ? 'ok' : 'warn');

    await renderDevice();
    renderGeo(state.geo);
    renderNet();
    await renderFingerprint();
    renderThreat();
    renderCaps();
    renderRaw();
})();
