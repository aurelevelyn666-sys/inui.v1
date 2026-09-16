// Minimal MCP client: Streamable HTTP with legacy SSE fallback.
// Also ships local demo tools so the tool-loop works with no server.

export const PRESET_MCP = [
  { name: 'Higgsfield (example)', url: 'https://mcp.higgsfield.ai/sse' },
  { name: 'GitHub MCP (example)', url: 'https://api.githubcopilot.com/mcp/' }
];

export const DEMO_TOOLS = [
  {
    name: 'demo.echo',
    description: 'Echoes args back as formatted text. Useful to test the tool loop.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } }
  },
  {
    name: 'demo.placeholder-image',
    description: 'Returns a picsum.photos placeholder image URL for a topic.',
    inputSchema: { type: 'object', properties: { topic: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' } } }
  }
];

export function executeDemoTool(tool, args = {}) {
  if (tool === 'demo.echo') return 'ECHO:\n' + (args.text || '(empty)');
  if (tool === 'demo.placeholder-image') {
    const w = args.width || 800;
    const h = args.height || 500;
    const seed = encodeURIComponent(String(args.topic || 'inui'));
    return 'IMAGE_URL: https://picsum.photos/seed/' + seed + '/' + w + '/' + h;
  }
  throw new Error('Unknown demo tool: ' + tool);
}

// Cap a response body while reading so a rogue server can't OOM the tab.
async function readCappedText(res, max = 1048576) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    const t = await res.text();
    if (t.length > max) throw new Error('Response too large (over 1MB) — refusing to buffer');
    return t;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
    if (out.length > max) {
      try {
        reader.cancel();
      } catch {
        /* noop */
      }
      throw new Error('Response too large (over 1MB) — refusing to buffer');
    }
  }
  return out;
}

async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const c = new AbortController();
  const t = setTimeout(() => {
    try {
      c.abort();
    } catch {
      /* noop */
    }
  }, ms);
  try {
    return await fetch(url, { ...opts, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

// Unicode-safe truncation (never splits a surrogate pair) with a marker.
function safeSlice(s, n) {
  s = String(s == null ? '' : s);
  if (s.length <= n) return s;
  let c = s.slice(0, n);
  const t = c.charCodeAt(c.length - 1);
  if (t >= 0xd800 && t <= 0xdbff) c = c.slice(0, -1);
  return c + '…[truncated]';
}

let rpcId = 100;

// Built-in read-only web search (no key, no server). DuckDuckGo first,
// Wikipedia opensearch as fallback. Both are CORS-open for browsers.
export const WEB_SEARCH_TOOL = {
  name: 'web.search',
  description: 'Search the public web and return short text results. Use automatically whenever you need current info, docs, prices, news, or anything outside training data.',
  inputSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', description: 'Search query' },
      count: { type: 'number', description: 'Max results (default 5)' }
    }
  }
};

export async function executeWebSearch(args = {}) {
  const q = String(args.query || '').trim();
  const n = Math.min(8, Math.max(1, Number(args.count) || 5));
  if (!q) throw new Error('Empty query');
  try {
    const res = await fetchWithTimeout(
      'https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1',
      { headers: { Accept: 'application/json' } },
      15000
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const lines = [];
    if (data.AbstractText) {
      lines.push('Summary: ' + data.AbstractText.slice(0, 400) + (data.AbstractURL ? ' [' + data.AbstractURL + ']' : ''));
    }
    (data.RelatedTopics || []).forEach((t) => {
      const item = Array.isArray(t.Topics) && t.Topics.length ? t.Topics[0] : t;
      if (item && item.Text) lines.push('- ' + String(item.Text).slice(0, 220) + (item.FirstURL ? ' [' + item.FirstURL + ']' : ''));
    });
    const out = lines.slice(0, n + 1).join('\n');
    if (out.trim()) return 'WEB RESULTS for "' + q + '":\n' + safeSlice(out, 3000);
  } catch {
    /* fall through to Wikipedia */
  }
  let res;
  try {
    res = await fetchWithTimeout(
      'https://en.wikipedia.org/w/api.php?action=opensearch&search=' + encodeURIComponent(q) + '&limit=' + n + '&format=json&origin=*',
      {},
      15000
    );
  } catch (e) {
    throw new Error('Web search failed (network/timeout): ' + String((e && e.message) || e).slice(0, 120));
  }
  if (!res.ok) throw new Error('Web search failed (HTTP ' + res.status + ')');
  const data = await res.json();
  const titles = data[1] || [];
  const descs = data[2] || [];
  const links = data[3] || [];
  if (!titles.length) return 'No web results for "' + q + '".';
  return (
    'WEB RESULTS for "' +
    q +
    '":\n' +
    safeSlice(
      titles
        .map((t, i) => '- ' + t + (descs[i] ? ': ' + String(descs[i]).slice(0, 200) : '') + ' [' + (links[i] || '') + ']')
        .join('\n'),
      3000
    )
  );
}

function sseToJson(text, wantId) {
  const lines = String(text).split('\n');
  const datas = lines.filter((l) => l.trim().startsWith('data:')).map((l) => l.trim().slice(5).trim());
  const cands = datas.filter((d) => d && d !== '[DONE]');
  // Prefer the payload matching our request id (a progress notification plus
  // the real response may both be present); fall back to the last candidate.
  const pick = (arr) => {
    if (wantId !== undefined) {
      for (const d of arr) {
        try {
          const o = JSON.parse(d);
          if (o && o.id === wantId) return o;
        } catch {
          /* not JSON — keep looking */
        }
      }
    }
    for (let i = arr.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(arr[i]);
      } catch {
        /* keep looking */
      }
    }
    return null;
  };
  const got = pick(cands);
  if (got) return got;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('MCP server returned non-JSON: ' + String(text).slice(0, 200));
  }
}

async function mcpPost(url, body, sessionId) {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {})
      },
      body: JSON.stringify(body)
    },
    30000
  );
  const sid = res.headers.get('mcp-session-id') || res.headers.get('Mcp-Session-Id') || sessionId;
  const text = await readCappedText(res);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + text.slice(0, 200));
  return { json: sseToJson(text, body && body.id), sessionId: sid };
}

async function legacySseConnect(url) {
  const res = await fetchWithTimeout(url, { headers: { Accept: 'text/event-stream' } }, 15000);
  if (!res.ok || !res.body) throw new Error('SSE GET failed: HTTP ' + res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let endpoint = null;
  const timer = setTimeout(() => {
    try {
      reader.cancel();
    } catch {
      /* noop */
    }
  }, 8000);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // Normalize CRLF framing per the SSE spec, and cap the buffer.
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    if (buf.length > 262144) {
      try {
        reader.cancel();
      } catch {
        /* noop */
      }
      throw new Error('SSE stream overflow (>256KB without an event)');
    }
    const idx = buf.indexOf('\n\n');
    if (idx < 0) continue;
    const chunk = buf.slice(0, idx);
    buf = buf.slice(idx + 2);
    let ev = '';
    let data = '';
    chunk.split('\n').forEach((l) => {
      if (l.startsWith('event:')) ev = l.slice(6).trim();
      // Multi-line data: joined with \n per spec.
      if (l.startsWith('data:')) data += (data ? '\n' : '') + l.slice(5).trim();
    });
    if (ev === 'endpoint' && data) {
      const u = new URL(data.trim().split('\n')[0], url);
      if (!/^https?:$/.test(u.protocol)) throw new Error('MCP endpoint must be http(s)');
      endpoint = u.toString();
      break;
    }
  }
  clearTimeout(timer);
  try {
    reader.cancel();
  } catch {
    /* noop */
  }
  if (!endpoint) throw new Error('No MCP endpoint event from SSE stream');
  return endpoint;
}

async function legacyPost(endpoint, body) {
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body)
    },
    30000
  );
  const text = await readCappedText(res);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + text.slice(0, 200));
  return sseToJson(text, body && body.id);
}

export async function connectMcpServer(url) {
  const clean = String(url).trim().replace(/\/+$/, '');
  if (!clean) throw new Error('Empty MCP URL');
  // Try Streamable HTTP first.
  try {
    let sessionId = null;
    const init = await mcpPost(clean, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'inui-harness', version: '0.1.0' }
      }
    });
    sessionId = init.sessionId;
    if (init.json.error) {
      // The server speaks Streamable HTTP and refused us — retrying over
      // legacy SSE is pointless, fail fast with the real reason.
      const err = new Error(init.json.error.message || 'initialize failed');
      err.jsonRpc = true;
      throw err;
    }
    try {
      await mcpPost(clean, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);
    } catch {
      /* optional */
    }
    const listed = await mcpPost(clean, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sessionId);
    if (listed.json.error) {
      const err = new Error(listed.json.error.message || 'tools/list failed');
      err.jsonRpc = true;
      throw err;
    }
    const tools = listed.json.result?.tools || [];
    return { ok: true, mode: 'streamable', url: clean, sessionId, tools };
  } catch (e) {
    if (e && e.jsonRpc) throw e;
    // Fall back to legacy SSE (transport-level failure only).
    try {
      const endpoint = await legacySseConnect(clean);
      const init = await legacyPost(endpoint, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'inui-harness', version: '0.1.0' }
        }
      });
      if (init.error) throw new Error(init.error.message || 'initialize failed');
      const listed = await legacyPost(endpoint, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
      if (listed.error) throw new Error(listed.error.message || 'tools/list failed');
      return { ok: true, mode: 'legacy-sse', url: clean, endpoint, tools: listed.result?.tools || [] };
    } catch (e2) {
      throw new Error('Streamable: ' + e.message + ' | SSE: ' + e2.message);
    }
  }
}

export async function callMcpTool(server, tool, args = {}) {
  if (server.url === 'local://demo') return executeDemoTool(tool, args);
  if (server.url === 'local://builtin') {
    if (tool === 'web.search') return executeWebSearch(args);
    throw new Error('Unknown builtin tool: ' + tool);
  }
  const body = { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name: tool, arguments: args } };
  const res =
    server.mode === 'legacy-sse'
      ? await legacyPost(server.endpoint, body)
      : (await mcpPost(server.url, body, server.sessionId)).json;
  if (res.error) throw new Error(res.error.message || 'tool call failed');
  const content = res.result?.content || [];
  return safeSlice(
    content
      .map((c) => {
        if (typeof c.text === 'string') return c.text;
        // MCP image parts previously became useless JSON strings — convert to
        // a markdown image the chat can actually render (size-guarded).
        if (c && c.type === 'image' && typeof c.data === 'string') {
          if (c.data.length > 700000) return '[image omitted: over size budget]';
          return '![mcp image](data:' + (c.mimeType || 'image/png') + ';base64,' + c.data + ')';
        }
        return JSON.stringify(c);
      })
      .join('\n'),
    6000
  );
}
