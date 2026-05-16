/* ── Canvas setup ── */
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
let W, H;
function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
resize();
window.addEventListener('resize', resize);

const mouse = { x: null, y: null, lastMove: 0 };
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.lastMove = performance.now(); });
window.addEventListener('touchmove', e => {
  const t = e.touches[0];
  mouse.x = t.clientX; mouse.y = t.clientY; mouse.lastMove = performance.now();
}, { passive: true });

/* ── Gaze ── */
const gaze = {
  px: 0, py: 0, vx: 0, vy: 0, tx: 0, ty: 0,
  wPhX: 0, wPhY: Math.PI * 0.6,
  wSpX: 0.000118, wSpY: 0.000079,
  flickActive: false,
  fOffX: 0, fOffY: 0, fVX: 0, fVY: 0,
  fTX: 0, fTY: 0, fReturnAt: 0,
  nextFlick: 5000 + Math.random() * 7000,
};

/* ── Blink ── */
const blink = {
  state: 0, active: false, t0: 0, dur: 110,
  nextBlink: 3000 + Math.random() * 4000,
  doDouble: false, gap: 0,
};

let breathPhase = 0;
let now = 0;
function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

/* ── Fire particles ── */
const FIRE_COUNT = 130;

function randHue() {
  const r = Math.random();
  if (r < 0.68) return 320 + Math.random() * 50;
  if (r < 0.88) return 195 + Math.random() * 45;
  return 265 + Math.random() * 35;
}

function mkFire() {
  return {
    ox: (Math.random() - 0.5) * 120,
    life: Math.random(),
    lifeSpd: 0.00040 + Math.random() * 0.00085,
    maxH: 55 + Math.random() * 250,
    size: 0.7 + Math.random() * 4.2,
    wAmp: 5 + Math.random() * 22,
    wFreq: 2 + Math.random() * 6,
    wPh: Math.random() * Math.PI * 2,
    hue: randHue(),
    streak: Math.random() < 0.18,
  };
}

function resetFire(p) {
  p.ox      = (Math.random() - 0.5) * 120;
  p.life    = 0;
  p.lifeSpd = 0.00040 + Math.random() * 0.00085;
  p.maxH    = 55 + Math.random() * 250;
  p.size    = 0.7 + Math.random() * 4.2;
  p.wAmp    = 5 + Math.random() * 22;
  p.wFreq   = 2 + Math.random() * 6;
  p.wPh     = Math.random() * Math.PI * 2;
  p.hue     = randHue();
  p.streak  = Math.random() < 0.18;
}

const fire = [
  Array.from({ length: FIRE_COUNT }, mkFire),
  Array.from({ length: FIRE_COUNT }, mkFire),
];

function drawFire(eyeIdx, ex, ey, dt) {
  const baseY = ey + EYE_MID_Y;
  fire[eyeIdx].forEach(p => {
    p.life += p.lifeSpd * fireMult * dt;
    if (p.life >= 1) resetFire(p);
    const t = p.life;
    const alpha = (t < 0.12 ? t / 0.12 : Math.pow(1 - t, 1.6)) * 0.88;
    if (alpha < 0.012) return;
    const turbX = Math.sin(p.wPh + t * p.wFreq * Math.PI) * p.wAmp * Math.sin(t * Math.PI);
    const px = ex + p.ox + turbX;
    const py = baseY - t * p.maxH;
    const sz = p.size * Math.max(0.1, 1 - t * 0.58);
    const sat = Math.round(55 + t * 45);
    const lit = Math.round(82 - t * 42);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = `hsl(${p.hue},${sat}%,${lit}%)`;
    ctx.shadowColor = `hsl(${p.hue},100%,68%)`;
    ctx.shadowBlur  = 14 + (1 - t) * 10;
    ctx.beginPath();
    if (p.streak) {
      ctx.ellipse(px, py, sz * 0.45, sz * (2.5 + t * 2), 0, 0, Math.PI * 2);
    } else {
      ctx.arc(px, py, sz, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  });
}

/* ── Eye shape ── */
const W2 = 114, H2 = 32;
const outerX =  W2, outerY = -30;
const innerX = -W2, innerY =  22;
const upPeakY = -48, loPeakY = 30;
const EYE_MID_Y = -8;

function eyePath(bs) {
  const u = bs * H2 * 1.8, l = -bs * H2 * 0.42;
  const p = new Path2D();
  p.moveTo(outerX, outerY + u);
  p.bezierCurveTo( 98, upPeakY + u, -92, upPeakY + u, innerX, innerY + u);
  p.bezierCurveTo(-84, loPeakY + l,  84, loPeakY + l, outerX, outerY + l);
  p.closePath();
  return p;
}

function upperLid(bs) {
  const u = bs * H2 * 1.8;
  const p = new Path2D();
  p.moveTo(outerX, outerY + u);
  p.bezierCurveTo(98, upPeakY + u, -92, upPeakY + u, innerX, innerY + u);
  return p;
}

function lowerLid(bs) {
  const l = -bs * H2 * 0.42;
  const p = new Path2D();
  p.moveTo(outerX, outerY + l);
  p.bezierCurveTo(84, loPeakY + l, -84, loPeakY + l, innerX, innerY + l);
  return p;
}

const GAZE_X = 22, GAZE_Y = 8;

/* ── Avatar state ── */
let kyoState      = 'idle'; // 'idle' | 'thinking' | 'replying'
let moodState     = 'normal'; // 'normal' | 'rage' | 'calm'
let thinkingStart = 0;
let irisR     = 24, irisRTgt    = 24;
let fireMult  = 1,  fireMultTgt = 1;

const GLITCH_DUR = 700;
let glitchEnd = 0;

function applyGlitch() {
  const remaining = glitchEnd - now;
  if (remaining <= 0) return;
  const t = remaining / GLITCH_DUR;

  // Initial white flash
  if (t > 0.82) {
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${((t - 0.82) / 0.18) * 0.75})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return;
  }

  // Horizontal slice displacement
  if (Math.random() < 0.75) {
    const count = Math.floor(2 + Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const sy = Math.floor(Math.random() * H);
      const sh = Math.ceil(2 + Math.random() * 28);
      const dx = Math.round((Math.random() - 0.5) * 80);
      if (sy + sh > H) continue;
      try {
        const data = ctx.getImageData(0, sy, W, sh);
        ctx.putImageData(data, dx, sy);
      } catch {}
    }
  }

  // Chromatic scan lines
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const colours = ['#ff0033', '#00ffee', '#cc00ff'];
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = Math.random() * 0.55;
    ctx.fillStyle = colours[i];
    ctx.fillRect(0, Math.floor(Math.random() * H), W, 1 + Math.floor(Math.random() * 2));
  }
  ctx.restore();
}

function updateGaze(dt, ts) {
  if (kyoState === 'thinking' && (now - thinkingStart) > 500) {
    gaze.tx = GAZE_X * 1.2;
    gaze.ty = -GAZE_Y * 2.2;
    const sp = 0.09, dp = 0.75;
    gaze.vx = gaze.vx * dp + (gaze.tx - gaze.px) * sp;
    gaze.vy = gaze.vy * dp + (gaze.ty - gaze.py) * sp;
    gaze.px += gaze.vx; gaze.py += gaze.vy;
    return;
  }

  const idle = !mouse.x || (ts - mouse.lastMove) > 2800;
  if (idle) {
    gaze.wPhX += gaze.wSpX * dt;
    gaze.wPhY += gaze.wSpY * dt;
    const wx = Math.sin(gaze.wPhX) * GAZE_X * 0.6;
    const wy = Math.sin(gaze.wPhY) * GAZE_Y * 0.5;
    if (!gaze.flickActive && ts > gaze.nextFlick) {
      gaze.flickActive = true;
      gaze.fTX = (Math.random() - 0.5) * GAZE_X * 1.4;
      gaze.fTY = (Math.random() - 0.5) * GAZE_Y * 1.1;
      gaze.fReturnAt = ts + 800 + Math.random() * 1600;
      gaze.nextFlick  = ts + 7000 + Math.random() * 10000;
    }
    if (gaze.flickActive) {
      const tgt = ts < gaze.fReturnAt ? { x: gaze.fTX, y: gaze.fTY } : { x: 0, y: 0 };
      const sp  = ts < gaze.fReturnAt ? 0.17 : 0.08;
      gaze.fVX = gaze.fVX * 0.72 + (tgt.x - gaze.fOffX) * sp;
      gaze.fVY = gaze.fVY * 0.72 + (tgt.y - gaze.fOffY) * sp;
      gaze.fOffX += gaze.fVX; gaze.fOffY += gaze.fVY;
      if (ts > gaze.fReturnAt && Math.hypot(gaze.fOffX, gaze.fOffY) < 0.4) gaze.flickActive = false;
    } else {
      gaze.fVX *= 0.88; gaze.fVY *= 0.88;
      gaze.fOffX += gaze.fVX; gaze.fOffY += gaze.fVY;
    }
    gaze.tx = wx + gaze.fOffX; gaze.ty = wy + gaze.fOffY;
  } else {
    const cx = W / 2, cy = H / 2;
    const ang = Math.atan2(mouse.y - cy, mouse.x - cx);
    const t = Math.pow(Math.min(1, Math.hypot(mouse.x - cx, mouse.y - cy) / 360), 0.60);
    gaze.tx = Math.cos(ang) * GAZE_X * t;
    gaze.ty = Math.sin(ang) * GAZE_Y * t;
    gaze.fOffX *= 0.88; gaze.fOffY *= 0.88;
  }
  const sp = idle ? 0.044 : 0.092, dp = idle ? 0.87 : 0.74;
  gaze.vx = gaze.vx * dp + (gaze.tx - gaze.px) * sp;
  gaze.vy = gaze.vy * dp + (gaze.ty - gaze.py) * sp;
  gaze.px += gaze.vx; gaze.py += gaze.vy;
}

function updateBlink(ts) {
  if (!blink.active && ts > blink.nextBlink) {
    blink.active = true; blink.t0 = ts;
    blink.doDouble = Math.random() < 0.20;
    blink.gap = 170 + Math.random() * 130;
  }
  if (!blink.active) return;
  const e = ts - blink.t0, h = blink.dur / 2, full = blink.dur;
  const full2 = blink.doDouble ? full + blink.gap + full : full;
  if      (e < h)    blink.state = easeInOut(e / h);
  else if (e < full) blink.state = easeInOut(1 - (e - h) / h);
  else if (!blink.doDouble || e >= full2) {
    blink.state = 0;
    if (e >= full2) { blink.active = false; blink.nextBlink = ts + 2500 + Math.random() * 5000; }
  } else {
    const e2 = e - full - blink.gap;
    if      (e2 < 0) blink.state = 0;
    else if (e2 < h) blink.state = easeInOut(e2 / h);
    else             blink.state = easeInOut(1 - (e2 - h) / h);
  }
}

function drawEye(cx, cy, mirror) {
  const bs = blink.state;
  const br = Math.sin(breathPhase);
  const midY = EYE_MID_Y;
  const ix = gaze.px * mirror;
  const iy = midY + gaze.py;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(mirror, 1);

  const ab  = 0.045 + 0.022 * br;
  const hue = Math.round(295 + Math.sin(now * 0.00038) * 35);
  const aura = ctx.createRadialGradient(0, midY, W2 * 0.05, 0, midY, W2 * 1.8);
  aura.addColorStop(0,    `hsla(${hue},85%,78%,${ab * 3.0})`);
  aura.addColorStop(0.22, `hsla(${hue},80%,65%,${ab * 1.1})`);
  aura.addColorStop(0.55, `hsla(${hue},75%,55%,${ab * 0.20})`);
  aura.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.save();
  ctx.shadowColor = `hsl(${hue},100%,65%)`;
  ctx.shadowBlur  = 28;
  ctx.beginPath();
  ctx.ellipse(0, midY, W2 * 1.9, H2 * 5.0, 0, 0, Math.PI * 2);
  ctx.fillStyle = aura;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.clip(eyePath(bs));
  ctx.fillStyle = '#fff';
  ctx.fillRect(-W2 - 12, -H2 * 3, (W2 + 12) * 2, H2 * 7);

  const irisHue = Math.round(290 + Math.sin(now * 0.00025) * 20);
  ctx.beginPath();
  ctx.arc(ix, iy, irisR, 0, Math.PI * 2);
  ctx.fillStyle = '#06000a';
  ctx.fill();

  const irisRing = ctx.createRadialGradient(ix, iy, irisR * 0.30, ix, iy, irisR);
  irisRing.addColorStop(0,    'rgba(0,0,0,0)');
  irisRing.addColorStop(0.42, `hsla(${irisHue},85%,18%,0)`);
  irisRing.addColorStop(0.55, `hsla(${irisHue},95%,42%,0.95)`);
  irisRing.addColorStop(0.75, `hsla(${irisHue},80%,28%,0.70)`);
  irisRing.addColorStop(1,    'rgba(0,0,0,0.92)');
  ctx.beginPath();
  ctx.arc(ix, iy, irisR, 0, Math.PI * 2);
  ctx.fillStyle = irisRing;
  ctx.fill();

  ctx.save();
  ctx.shadowColor = `hsl(${irisHue},100%,55%)`;
  ctx.shadowBlur  = 10;
  ctx.beginPath();
  ctx.arc(ix, iy, irisR - 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${irisHue},90%,60%,0.45)`;
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(ix, iy, irisR * 0.40, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(ix, iy, irisR, 0, Math.PI * 2);
  ctx.clip();
  const lidShadow = ctx.createLinearGradient(ix, iy - irisR, ix, iy + irisR * 0.3);
  lidShadow.addColorStop(0,   'rgba(0,0,0,0.55)');
  lidShadow.addColorStop(0.4, 'rgba(0,0,0,0)');
  ctx.fillStyle = lidShadow;
  ctx.fillRect(ix - irisR, iy - irisR, irisR * 2, irisR * 2);
  const hl = ctx.createRadialGradient(
    ix - irisR * 0.20, iy - irisR * 0.28, 0,
    ix - irisR * 0.20, iy - irisR * 0.28, irisR * 0.65
  );
  hl.addColorStop(0,   'rgba(255,255,255,0.75)');
  hl.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  hl.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(ix - irisR, iy - irisR, irisR * 2, irisR * 2);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(ix - irisR * 0.18, iy - irisR * 0.40, irisR * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ix + irisR * 0.35, iy + irisR * 0.14, irisR * 0.11, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.60)';
  ctx.fill();

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.stroke(lowerLid(bs));
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 20; ctx.lineCap = 'round';
  ctx.stroke(upperLid(bs));
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.94)';
  ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.stroke(upperLid(bs));
  ctx.restore();


  ctx.save();
  ctx.lineCap = 'round';
  [
    { x1: -100, y1: 27, x2: -97, y2: 72, w: 4.0 },
    {  x1:  -84, y1: 25, x2: -81, y2: 63, w: 2.8 },
  ].forEach(({ x1, y1, x2, y2, w }) => {
    ctx.strokeStyle = 'rgba(18,0,0,0.88)'; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });
  ctx.restore();

  ctx.restore();
}

function drawFace(cx, cy) {
  ctx.save();

  // Faint face oval glow
  const faceGrad = ctx.createRadialGradient(cx, cy + 40, 30, cx, cy + 40, 270);
  faceGrad.addColorStop(0,   'rgba(255,255,255,0)');
  faceGrad.addColorStop(0.6, 'rgba(255,255,255,0.012)');
  faceGrad.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.ellipse(cx, cy + 40, 250, 190, 0, 0, Math.PI * 2);
  ctx.fillStyle = faceGrad;
  ctx.fill();

  // Jaw outline
  ctx.beginPath();
  ctx.moveTo(cx - 205, cy - 30);
  ctx.bezierCurveTo(cx - 205, cy + 140, cx - 85, cy + 195, cx, cy + 198);
  ctx.bezierCurveTo(cx +  85, cy + 195, cx + 205, cy + 140, cx + 205, cy - 30);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Nose bridge (barely visible)
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy + 28);
  ctx.bezierCurveTo(cx - 7, cy + 58, cx + 7, cy + 58, cx + 10, cy + 28);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function draw(dt) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const vv = window.visualViewport;
  const visH = vv ? vv.height : H;
  const cy = visH < H - 80 ? visH * 0.40 : H / 2;
  const eyeScale = Math.min(1, W / 700);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(eyeScale, eyeScale);
  ctx.translate(-cx, -cy);

  drawFace(cx, cy);
  drawFire(0, cx + 195, cy, dt);
  drawFire(1, cx - 195, cy, dt);
  drawEye(cx + 195, cy,  1);
  drawEye(cx - 195, cy, -1);

  ctx.restore();

  const vig = ctx.createRadialGradient(cx, cy, H * 0.04, cx, cy, H * 0.70);
  vig.addColorStop(0,   'rgba(0,0,0,0)');
  vig.addColorStop(0.4, 'rgba(0,0,0,0.06)');
  vig.addColorStop(1,   'rgba(0,0,0,0.97)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  applyGlitch();
}

let last = performance.now();
function frame(ts) {
  const dt = Math.min(ts - last, 50); last = ts; now = ts;
  breathPhase += 0.00050 * dt;
  irisR    += (irisRTgt    - irisR)    * 0.06;
  fireMult += (fireMultTgt - fireMult) * 0.04;

  updateGaze(dt, now);
  updateBlink(now);
  draw(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ── Chat interaction ── */
const WORKER_URL = 'https://kyo-worker.victor-gaspard-mail.workers.dev';

const typingTextEl = document.getElementById('typing-text');
const typingAreaEl = document.getElementById('typing-area');
const speechBubble = document.getElementById('speech-bubble');
const ghostEl      = document.getElementById('ghost');
const cmdDescEl    = document.getElementById('cmd-desc');

/* ── Virtual keyboard offset (Android + iOS) ── */
if (window.visualViewport) {
  function adjustForKeyboard() {
    const vv = window.visualViewport;
    const keyboardH = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
    if (keyboardH > 80) {
      const above = keyboardH + 14;
      typingAreaEl.style.bottom = above + 'px';
      cmdDescEl.style.bottom    = (above + 46) + 'px';
    } else {
      typingAreaEl.style.bottom = '';
      cmdDescEl.style.bottom    = '';
    }
  }
  window.visualViewport.addEventListener('resize', adjustForKeyboard);
  window.visualViewport.addEventListener('scroll', adjustForKeyboard);
}

const COMMANDS = {
  '.clear':   'reset conversation memory',
  '.copy':    'copy last reply to clipboard',
  '.help':    'list all commands',
  '.math':    'evaluate a math expression',
  '.ping':    'test connection to AI server',
  '.calm':    'restore default fire',
  '.glitch':  'trigger a visual glitch',
  '.rage':    'unleash the fire',
  '.roll':    'roll a number from 1 to 100',
  '.time':    'show current date and time',
  '.weather': 'show current weather',
};

let typingBuffer  = '';
let bubbleTimer   = null;
let typeTimer     = null;
let chatHistory   = [];
let busy          = false;
let msgHistory    = [];
let historyIdx    = -1;
let savedDraft    = '';
let lastReply     = '';

function getCommandMatch() {
  if (!typingBuffer.startsWith('.')) return null;
  // Exact or "cmd + space + args" (for commands that take arguments)
  const withArgs = Object.keys(COMMANDS).find(c => typingBuffer === c || typingBuffer.startsWith(c + ' '));
  if (withArgs) return withArgs;
  // Prefix autocomplete
  return Object.keys(COMMANDS).find(cmd => cmd.startsWith(typingBuffer)) || null;
}

function updateGhost() {
  const match = getCommandMatch();
  const hasArgs = typingBuffer.includes(' ');
  const remainder = (match && match !== typingBuffer && !hasArgs) ? match.slice(typingBuffer.length) : '';
  ghostEl.textContent = remainder;
  cmdDescEl.textContent = match ? COMMANDS[match] : '';
  document.querySelector('.cursor').classList.toggle('cursor--line', !!remainder);
}

function updateDisplay(action, deletedChar = '') {
  typingTextEl.textContent = '';

  if (action === 'add' && typingBuffer.length > 0) {
    typingTextEl.appendChild(document.createTextNode(typingBuffer.slice(0, -1)));
    const s = document.createElement('span');
    s.className = 'char-new';
    s.textContent = typingBuffer[typingBuffer.length - 1];
    typingTextEl.appendChild(s);
  } else if (action === 'delete' && deletedChar) {
    typingTextEl.appendChild(document.createTextNode(typingBuffer));
    const s = document.createElement('span');
    s.className = 'char-del';
    s.textContent = deletedChar;
    typingTextEl.appendChild(s);
    setTimeout(() => s.remove(), 320);
  } else {
    typingTextEl.textContent = typingBuffer;
  }
}

function setKyoState(s) {
  kyoState = s;
  const rage = moodState === 'rage';
  if (s === 'thinking') {
    thinkingStart = now;
    irisRTgt    = 25;
    fireMultTgt = rage ? 5.0 : 1.4;
  } else if (s === 'replying') {
    irisRTgt    = 20;
    fireMultTgt = rage ? 6.0 : 2.4;
  } else {
    irisRTgt    = 24;
    fireMultTgt = rage ? 4.0 : 1.0;
  }
}

function showThinking() {
  clearTimeout(bubbleTimer);
  clearTimeout(typeTimer);
  speechBubble.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div>';
  speechBubble.classList.remove('speech-bubble--alert');
  speechBubble.classList.add('visible');
}

function showBubble(text, instant = false, alert = false) {
  if (text && text !== '…') lastReply = text;
  clearTimeout(bubbleTimer);
  clearTimeout(typeTimer);
  speechBubble.textContent = '';
  speechBubble.classList.toggle('speech-bubble--alert', alert);
  speechBubble.classList.add('visible');

  if (instant || text === '…') {
    speechBubble.textContent = text;
    bubbleTimer = setTimeout(() => {
      speechBubble.classList.remove('visible');
      setKyoState('idle');
    }, 5000);
    return;
  }

  // Typewriter
  let i = 0;
  function tick() {
    if (i < text.length) {
      speechBubble.textContent += text[i++];
      typeTimer = setTimeout(tick, 22 + Math.random() * 18);
    } else {
      bubbleTimer = setTimeout(() => {
        speechBubble.classList.remove('visible');
        setKyoState('idle');
      }, 5000);
    }
  }
  tick();
}

speechBubble.addEventListener('click', async () => {
  const text = speechBubble.textContent.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    speechBubble.style.transition = 'opacity 0.1s';
    speechBubble.style.opacity = '0.4';
    setTimeout(() => { speechBubble.style.opacity = ''; speechBubble.style.transition = ''; }, 180);
  } catch {}
});

async function sendMessage(message) {
  busy = true;
  setKyoState('thinking');
  showThinking();

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: chatHistory }),
    });

    const data  = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    const reply = data.reply?.trim() || '…';
    lastReply = reply;
    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: reply });
    if (chatHistory.length > 16) chatHistory = chatHistory.slice(-16);

    setKyoState('replying');
    showBubble(reply);
  } catch {
    setKyoState('idle');
    showBubble('…', true);
  } finally {
    busy = false;
  }
}

/* ── Input (unified desktop + mobile) ── */
const kb = document.getElementById('kb');

function kbRefocus() { kb.focus(); }
document.addEventListener('click', kbRefocus);
document.addEventListener('touchend', kbRefocus, { passive: true });
kb.focus();

async function runCommand(cmd) {
  const baseCmd = cmd.split(' ')[0];
  switch (baseCmd) {
    case '.math': {
      const expr = cmd.slice(5).trim();
      if (!expr) { showBubble('usage: .math [expression]', true, true); break; }
      try {
        const mathScope = Object.getOwnPropertyNames(Math)
          .map(k => `const ${k} = Math.${k};`).join('');
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; ${mathScope} return (${expr})`)();
        if (typeof result !== 'number' || !isFinite(result)) throw new Error();
        const pretty = Number.isInteger(result) ? result : parseFloat(result.toPrecision(10));
        showBubble(`${pretty}`, true, true);
      } catch {
        showBubble('invalid expression.', true, true);
      }
      break;
    }

    case '.clear':
      chatHistory = [];
      showBubble('memory cleared.', true, true);
      break;

    case '.help':
      showBubble(Object.entries(COMMANDS).map(([k, v]) => `${k} — ${v}`).join('\n'), true, true);
      break;

    case '.copy':
      if (!lastReply) { showBubble('nothing to copy yet.', true, true); break; }
      try {
        await navigator.clipboard.writeText(lastReply);
        showBubble('copied!', true, true);
      } catch {
        showBubble('clipboard access denied.', true, true);
      }
      break;

    case '.glitch':
      glitchEnd = performance.now() + GLITCH_DUR;
      break;

    case '.calm':
      moodState = 'normal';
      setKyoState('idle');
      showBubble('calm.', true, true);
      break;

    case '.rage':
      moodState = 'rage';
      setKyoState('idle');
      showBubble('rage.', true, true);
      break;

    case '.roll':
      showBubble(`${Math.floor(Math.random() * 100) + 1}`, true, true);
      break;

    case '.ping': {
      const t0 = performance.now();
      try {
        await fetch(WORKER_URL + '/ping');
        const ms = Math.round(performance.now() - t0);
        showBubble(`pong — ${ms}ms`, true, true);
      } catch {
        showBubble('worker unreachable.', true, true);
      }
      break;
    }

    case '.time': {
      const now = new Date();
      const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      showBubble(`${date} · ${time}`, true);
      break;
    }

    case '.weather': {
      busy = true;
      setKyoState('thinking');
      showThinking();
      try {
        const res  = await fetch(WORKER_URL + '/weather');
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const { city, condition, temperature, feels_like, humidity } = data;
        setKyoState('replying');
        showBubble(`${condition} in ${city}.\n${temperature} · feels ${feels_like} · ${humidity} humidity.`, true);
      } catch {
        setKyoState('idle');
        showBubble('could not fetch weather.', true, true);
      } finally {
        busy = false;
      }
      break;
    }
  }
}

function handleEnter() {
  const msg = typingBuffer.trim();
  if (!msg || busy) return;

  const cmdKey = Object.keys(COMMANDS).find(c => msg === c || msg.startsWith(c + ' '));
  if (cmdKey) {
    msgHistory.unshift(msg);
    historyIdx = -1;
    savedDraft = '';
    runCommand(msg);
    typingBuffer = '';
    kb.value = '';
    updateDisplay();
    updateGhost();
    return;
  }

  msgHistory.unshift(msg);
  historyIdx = -1;
  savedDraft = '';
  typingBuffer = '';
  kb.value = '';
  updateDisplay();
  updateGhost();
  sendMessage(msg);
}

kb.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (e.key === 'Escape') {
    clearTimeout(bubbleTimer); clearTimeout(typeTimer);
    speechBubble.classList.remove('visible');
    setKyoState('idle');
    return;
  }

  if (e.key === 'Enter') { e.preventDefault(); handleEnter(); return; }

  if (e.key === 'Tab') {
    e.preventDefault();
    const match = getCommandMatch();
    if (match) { typingBuffer = match; kb.value = match; updateDisplay(); updateGhost(); }
    return;
  }

  if (e.key === 'ArrowUp') {
    if (!msgHistory.length) return;
    if (historyIdx === -1) savedDraft = typingBuffer;
    historyIdx = Math.min(historyIdx + 1, msgHistory.length - 1);
    typingBuffer = msgHistory[historyIdx];
    kb.value = typingBuffer;
    updateDisplay();
    updateGhost();
    return;
  }

  if (e.key === 'ArrowDown') {
    if (historyIdx === -1) return;
    historyIdx--;
    typingBuffer = historyIdx === -1 ? savedDraft : msgHistory[historyIdx];
    kb.value = typingBuffer;
    updateDisplay();
    updateGhost();
    return;
  }
});

kb.addEventListener('input', () => {
  const newVal = kb.value;
  if (newVal.length === typingBuffer.length + 1 && newVal.startsWith(typingBuffer)) {
    typingBuffer = newVal;
    updateDisplay('add');
  } else if (newVal.length === typingBuffer.length - 1 && typingBuffer.startsWith(newVal)) {
    const deleted = typingBuffer[typingBuffer.length - 1];
    typingBuffer = newVal;
    updateDisplay('delete', deleted);
  } else {
    typingBuffer = newVal;
    updateDisplay();
  }
  updateGhost();
});
