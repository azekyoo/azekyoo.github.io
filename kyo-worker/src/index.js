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
    const lat  = request.cf?.latitude  ?? 48.8566;
    const lon  = request.cf?.longitude ?? 2.3522;
    const city = request.cf?.city ?? 'unknown location';
    const url  = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relativehumidity_2m` +
      `&temperature_unit=celsius&windspeed_unit=kmh`;
    const res  = await fetch(url);
    const data = await res.json();
    const cur  = data.current;
    return {
      city,
      condition:   WMO[cur.weathercode] ?? 'unknown',
      temperature: `${Math.round(cur.temperature_2m)}°C`,
      feels_like:  `${Math.round(cur.apparent_temperature)}°C`,
      humidity:    `${cur.relativehumidity_2m}%`,
      wind:        `${Math.round(cur.windspeed_10m)} km/h`,
    };
  }

  return { error: 'unknown tool' };
}

const enc = new TextEncoder();
const sseDone = enc.encode('data: [DONE]\n\n');
function sseChunk(text) {
  return enc.encode(`data: ${JSON.stringify({ response: text })}\n\n`);
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

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Return the stream immediately; fill it in the background
    const response = new Response(readable, {
      headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });

    (async () => {
      try {
        const aiStream = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages,
          tools: TOOLS,
          max_tokens: 200,
          stream: true,
        });

        const reader  = aiStream.getReader();
        const decoder = new TextDecoder();
        let buf           = '';
        let mode          = null; // 'text' | 'tool'
        let toolCalls     = [];
        let assistantText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;

            let chunk;
            try { chunk = JSON.parse(raw); } catch { continue; }

            if (chunk.tool_calls?.length && mode !== 'text') {
              mode = 'tool';
              toolCalls.push(...chunk.tool_calls);
            } else if (chunk.response && mode !== 'tool') {
              assistantText += chunk.response;

              if (mode === 'text') {
                await writer.write(sseChunk(chunk.response));
              } else {
                // Peek: if first non-whitespace char isn't '{', it's text — flush buffer
                const trimmed = assistantText.trimStart();
                if (trimmed && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
                  mode = 'text';
                  await writer.write(sseChunk(assistantText));
                  assistantText = '';
                }
                // else: keep buffering — might be a tool call JSON
              }
            }
          }
        }

        // Resolve undecided mode: buffered text that might be a tool call JSON
        if (mode === null && assistantText) {
          const lines = assistantText.trim().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const tc = JSON.parse(line);
              if (tc?.name) { mode = 'tool'; toolCalls.push(tc); }
            } catch {}
          }
          if (mode !== 'tool') {
            await writer.write(sseChunk(assistantText));
          }
        }

        if (mode === 'tool' && toolCalls.length) {
          // Execute tools then stream the final answer
          const toolMessages = [
            ...messages,
            { role: 'assistant', content: assistantText || JSON.stringify(toolCalls[0]) },
          ];
          for (const call of toolCalls) {
            const result = await runTool(call.name, request);
            toolMessages.push({
              role: 'tool',
              content: typeof result === 'string' ? result : JSON.stringify(result),
            });
          }

          const finalStream = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: toolMessages,
            stream: true,
            max_tokens: 120,
          });
          const finalReader = finalStream.getReader();
          while (true) {
            const { done, value } = await finalReader.read();
            if (done) break;
            await writer.write(value); // forward raw SSE bytes (already formatted)
          }
        } else {
          await writer.write(sseDone);
        }

      } catch (err) {
        try {
          await writer.write(enc.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
          await writer.write(sseDone);
        } catch {}
      } finally {
        try { await writer.close(); } catch {}
      }
    })();

    return response;
  },
};
