import { pipeline, TextStreamer, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

env.allowLocalModels = false;

const MODEL_ID       = 'onnx-community/Qwen2.5-0.5B-Instruct';
const PERSONA        = `You are Kyo, a compact AI assistant running entirely inside the user's browser via WebAssembly — no internet connection is used for inference. You are powered by Qwen2.5-0.5B, a small but capable language model. Be helpful, honest, and concise. You can do math, answer questions, summarize, explain concepts, and hold conversation. If asked who you are, explain you are Kyo, a local AI. Never claim to be a large model like GPT or Claude.`;
const MAX_NEW_TOKENS = 128;
const MAX_PAIRS      = 8;
const ARC_LEN        = 175.93; // 2π × 28

let generator   = null;
let chatHistory = [{ role: 'system', content: PERSONA }];

const form        = document.getElementById('chat-form');
const input       = document.getElementById('user-input');
const messages    = document.getElementById('messages');
const sendBtn     = document.getElementById('send-btn');
const clearBtn    = document.getElementById('clear-chat');
const loadingEl   = document.getElementById('model-loading');
const progressBar = document.getElementById('model-progress-bar');
const progressTxt = document.getElementById('model-progress-text');
const ringArc     = document.getElementById('ring-arc');
const emptyState  = document.getElementById('empty-state');

const now          = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const scrollBottom = () => { messages.scrollTop = messages.scrollHeight; };

function hideEmpty() { if (emptyState) emptyState.style.display = 'none'; }
function showEmpty() { if (emptyState) emptyState.style.display = ''; }

function createMessageEl({ text = '', role = 'ai', isTyping = false } = {}) {
    const wrap = document.createElement('div');
    wrap.className = `msg msg--${role === 'user' ? 'user' : 'ai'}`;

    if (role === 'ai') {
        const label = document.createElement('div');
        label.className = 'msg__label';
        label.textContent = 'Kyo';
        wrap.appendChild(label);
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg__bubble';

    if (isTyping) {
        const t = document.createElement('div');
        t.className = 'typing';
        t.innerHTML = '<span class="typing__dot"></span><span class="typing__dot"></span><span class="typing__dot"></span>';
        bubble.appendChild(t);
    } else {
        bubble.textContent = text;
    }

    const meta = document.createElement('div');
    meta.className = 'msg__meta';
    meta.textContent = now();

    wrap.appendChild(bubble);
    wrap.appendChild(meta);
    return { wrap, bubble, meta };
}

function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
}

input.addEventListener('input', autosize);
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
});

clearBtn?.addEventListener('click', () => {
    messages.innerHTML = '';
    messages.appendChild(emptyState);
    showEmpty();
    chatHistory = [{ role: 'system', content: PERSONA }];
    input.focus();
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!generator) return;

    const userMsg = input.value.trim();
    if (!userMsg) return;

    hideEmpty();

    const { wrap: userWrap } = createMessageEl({ text: userMsg, role: 'user' });
    messages.appendChild(userWrap);
    scrollBottom();

    input.value = '';
    autosize();
    sendBtn.disabled = true;
    input.disabled   = true;

    const { wrap: aiWrap, bubble, meta } = createMessageEl({ isTyping: true, role: 'ai' });
    messages.appendChild(aiWrap);
    scrollBottom();

    // Yield two frames — lets browser paint before WASM blocks main thread
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    chatHistory.push({ role: 'user', content: userMsg });
    if (chatHistory.length > MAX_PAIRS * 2 + 1) {
        chatHistory = [chatHistory[0], ...chatHistory.slice(-(MAX_PAIRS * 2))];
    }

    let output = '';
    const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text) => {
            output += text;
            bubble.textContent = output;
            scrollBottom();
        },
    });

    try {
        await generator(chatHistory, { max_new_tokens: MAX_NEW_TOKENS, do_sample: false, streamer });
        if (!output) bubble.textContent = '…';
        chatHistory.push({ role: 'assistant', content: output });
    } catch (err) {
        bubble.textContent = 'Error: ' + (err?.message || 'Generation failed');
    } finally {
        meta.textContent = now();
        sendBtn.disabled = false;
        input.disabled   = false;
        input.focus();
    }
});

/* ── Model init ──────────────────────────────────────────── */
const fileBytes = {};

function setProgress(pct) {
    progressBar.style.width = pct + '%';
    if (ringArc) ringArc.style.strokeDashoffset = ARC_LEN * (1 - pct / 100);
}

async function initModel() {
    try {
        generator = await pipeline('text-generation', MODEL_ID, {
            dtype: 'q4',
            progress_callback: ({ status, file, loaded, total }) => {
                if (status === 'progress' && file) {
                    fileBytes[file] = { loaded: loaded || 0, total: total || 0 };
                    const sumLoaded = Object.values(fileBytes).reduce((a, b) => a + b.loaded, 0);
                    const sumTotal  = Object.values(fileBytes).reduce((a, b) => a + b.total, 0);
                    if (sumTotal > 0) {
                        const pct = Math.round((sumLoaded / sumTotal) * 100);
                        setProgress(pct);
                        progressTxt.textContent = `Downloading… ${pct}%`;
                    }
                } else if (status === 'done' && file && fileBytes[file]) {
                    fileBytes[file].loaded = fileBytes[file].total;
                } else if (status === 'loading') {
                    setProgress(100);
                    progressTxt.textContent = 'Loading into memory…';
                }
            },
        });
        loadingEl.classList.add('hidden');
        const panel = document.getElementById('glass-panel');
        panel.classList.remove('hidden');
        panel.classList.add('reveal');
        input.focus();
    } catch (err) {
        progressTxt.textContent = 'Failed: ' + (err?.message || 'Unknown error');
    }
}

initModel();

/* ── Parallax ────────────────────────────────────────────── */
const orbs   = [...document.querySelectorAll('.orb')];
const speeds = [[-50,-35],[42,48],[-28,52],[46,-38]];
let tgtX = 0, tgtY = 0, curX = 0, curY = 0, tick = 0;

document.addEventListener('mousemove', e => {
    tgtX = (e.clientX / innerWidth  - 0.5) * 2;
    tgtY = (e.clientY / innerHeight - 0.5) * 2;
});

(function loop() {
    tick += 0.0007;
    curX += (tgtX - curX) * 0.038;
    curY += (tgtY - curY) * 0.038;

    orbs.forEach((orb, i) => {
        const [sx, sy] = speeds[i];
        const dx = curX * sx + Math.sin(tick + i * 2.1) * 24;
        const dy = curY * sy + Math.cos(tick * 0.65 + i * 1.5) * 18;
        orb.style.transform = `translate(${dx}px,${dy}px)`;
    });

    requestAnimationFrame(loop);
})();
