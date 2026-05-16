const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SYSTEM = `You are Kyo, a personal AI assistant. Be direct, calm, and conversational. \
Always reply — never refuse or say you have nothing to say. \
Keep replies to 1-2 short sentences. No fluff, no poetry, no dramatic language. \
Greetings get a warm but brief response. General questions get direct answers. \
Only call tools when the user explicitly asks about the current time, date, or weather. \
When you get tool results, use them as ground truth, summarized as plain text. Never output JSON or bullet points.`;

const TOOLS = [
  {
    name: 'get_current_datetime',
    description: 'Returns the current date and time.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_weather',
    description: 'Returns current weather at the user\'s location.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

const WMO = {
  0:'clear sky',1:'mainly clear',2:'partly cloudy',3:'overcast',
  45:'fog',48:'icy fog',51:'light drizzle',53:'drizzle',55:'heavy drizzle',
  61:'light rain',63:'rain',65:'heavy rain',71:'light snow',73:'snow',75:'heavy snow',
  77:'snow grains',80:'light showers',81:'showers',82:'heavy showers',
  85:'snow showers',86:'heavy snow showers',95:'thunderstorm',96:'thunderstorm w/ hail',
  99:'thunderstorm w/ heavy hail',
};

async function runTool(name, request) {
  if (name === 'get_current_datetime') {
    const tz  = request.cf?.timezone ?? 'UTC';
    const now = new Date();
    const date = now.toLocaleDateString('en-US', { timeZone: tz, weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const time = now.toLocaleTimeString('en-US', { timeZone: tz, hour:'2-digit', minute:'2-digit' });
    return `Current date and time: ${date} at ${time} (${tz})`;
  }

  if (name === 'get_weather') {
    const lat = request.cf?.latitude  ?? 48.8566;
    const lon = request.cf?.longitude ?? 2.3522;
    const city = request.cf?.city ?? 'unknown location';

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relativehumidity_2m` +
      `&temperature_unit=celsius&windspeed_unit=kmh`;

    const res  = await fetch(url);
    const data = await res.json();
    const cur  = data.current;

    return {
      city,
      condition:    WMO[cur.weathercode] ?? 'unknown',
      temperature:  `${Math.round(cur.temperature_2m)}°C`,
      feels_like:   `${Math.round(cur.apparent_temperature)}°C`,
      humidity:     `${cur.relativehumidity_2m}%`,
      wind:         `${Math.round(cur.windspeed_10m)} km/h`,
    };
  }

  return { error: 'unknown tool' };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === '/ping') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/weather') {
      try {
        const result = await runTool('get_weather', request);
        return new Response(JSON.stringify(result), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    if (url.pathname === '/time') {
      const result = await runTool('get_current_datetime', request);
      return new Response(JSON.stringify({ result }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS });
    }

    let body;
    try { body = await request.json(); }
    catch { return new Response('Bad Request', { status: 400, headers: CORS }); }

    const { message, history = [] } = body;
    if (!message) return new Response('Bad Request', { status: 400, headers: CORS });

    const safeHistory = history
      .filter(m => m.role && typeof m.content === 'string' && m.content.trim())
      .slice(-8);

    const messages = [
      { role: 'system', content: SYSTEM },
      ...safeHistory,
      { role: 'user', content: message },
    ];

    try {
      const first = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages,
        tools: TOOLS,
        max_tokens: 200,
      });

      // Collect tool calls — model sometimes puts them in tool_calls, sometimes in response text
      let toolCalls = first.tool_calls || [];
      if (!toolCalls.length && first.response?.includes('"arguments"')) {
        try {
          toolCalls = first.response.trim().split('\n')
            .map(l => { try { return JSON.parse(l.trim()); } catch { return null; } })
            .filter(t => t?.name);
        } catch {}
      }

      if (toolCalls.length) {
        const toolMessages = [
          ...messages,
          { role: 'assistant', content: first.response || JSON.stringify(toolCalls[0]) },
        ];

        for (const call of toolCalls) {
          const result = await runTool(call.name, request);
          toolMessages.push({
            role: 'tool',
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
        }

        const second = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: toolMessages,
          max_tokens: 120,
        });

        const reply = second.response?.trim() || toolMessages.filter(m => m.role === 'tool').map(m => m.content).join(' ');
        return new Response(JSON.stringify({ reply }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ reply: first.response }), {
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
