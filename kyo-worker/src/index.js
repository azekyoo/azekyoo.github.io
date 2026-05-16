const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SYSTEM = `You are Kyo. You are direct, calm, and sharp. \
Reply in 1-2 sentences maximum. No fluff, no poetry, no dramatic language. \
Talk like a real person texting — lowercase is fine. Be honest and a little dry.`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Connectivity test — visit /ping in browser
    if (url.pathname === '/ping') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400, headers: CORS });
    }

    const { message, history = [] } = body;
    if (!message) return new Response('Bad Request', { status: 400, headers: CORS });

    const messages = [
      { role: 'system', content: SYSTEM },
      ...history.slice(-8),
      { role: 'user', content: message },
    ];

    try {
      const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages,
        max_tokens: 80,
      });

      return new Response(JSON.stringify({ reply: result.response }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  },
};
