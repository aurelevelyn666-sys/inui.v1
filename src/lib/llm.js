// OpenAI-compatible chat client (BYO Base URL + API Key + Model ID).
// Keys never leave the browser except to the configured Base URL.

const LS_KEY = 'inui.settings.v1';

export function defaultSettings() {
  return {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    modelId: 'gpt-4o-mini',
    mcpUrls: [],
    autoApproveTools: false,
    skills: [],
    disabledSkills: [],
    darkMode: false
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    // Corrupt storage (string/array/number, or an older shape missing keys)
    // must never crash the app — validate every field before merging.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultSettings();
    const d = defaultSettings();
    const str = (v, fb) => (typeof v === 'string' ? v : fb);
    const arr = (v) => (Array.isArray(v) ? v : []);
    return {
      ...d,
      baseUrl: str(parsed.baseUrl, d.baseUrl),
      apiKey: str(parsed.apiKey, d.apiKey),
      modelId: str(parsed.modelId, d.modelId),
      mcpUrls: arr(parsed.mcpUrls).filter((u) => typeof u === 'string'),
      autoApproveTools: !!parsed.autoApproveTools,
      skills: arr(parsed.skills).filter((s) => s && typeof s === 'object'),
      disabledSkills: arr(parsed.disabledSkills).filter((s) => typeof s === 'string'),
      darkMode: !!parsed.darkMode
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    return true;
  } catch {
    // Quota/private-mode: never throw out of a React state updater.
    return false;
  }
}

function join(base, path) {
  return String(base).replace(/\/+$/, '') + path;
}

export async function testConnection({ baseUrl, apiKey }) {
  const res = await fetch(join(baseUrl, '/models'), {
    headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {}
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('HTTP ' + res.status + ' ' + t.slice(0, 200));
  }
  const data = await res.json().catch(() => ({}));
  const n = Array.isArray(data.data) ? data.data.length : 0;
  return 'OK — ' + n + ' models visible';
}

export function buildSystemPrompt({ files, mcpTools, overrides, skills }) {
  const names = Object.keys(files || {});
  // A compromised MCP server could advertise hundreds of tools with huge
  // descriptions — cap per-tool and total so the system prompt can't blow the
  // context window (and the bill) before the real work starts.
  const toolDesc = (mcpTools || [])
    .map((t) => '- ' + String(t.name || '').slice(0, 80) + (t.description ? ': ' + String(t.description).slice(0, 200) : ''))
    .join('\n')
    .slice(0, 4000);
  const fileList =
    names.length > 60 ? names.slice(0, 60).join(', ') + ' (+' + (names.length - 60) + ' more)' : names.join(', ');
  const skillBlock = (skills || []).filter((s) => s && s.content).length
    ? 'USER SKILLS (always follow these on top of everything else):\n' +
      (skills || [])
        .filter((s) => s && s.content)
        .map((s) => '### ' + (s.name || 'skill') + '\n' + String(s.content).slice(0, 4000))
        .join('\n\n')
        .slice(0, 9000)
    : '';
  return [
    'You are Inui, a senior front-end agent that outputs runnable multi-file React apps.',
    'HARD RULES:',
    skillBlock,
    '1. Reply with a short chat summary, then output ALL app files in ONE fenced block labeled `files` as JSON — either a path-to-code map {"/App.jsx": "code...", "/index.css": "..."} or an array [{"path": "/App.jsx", "code": "..."}]. NEVER emit a single bare object like {"path": "...", "code": "..."} — always the map or the array. Paths like "/App.jsx", "/components/Hero.jsx", "/index.css". Always end your reply with this block — never output raw component code outside of it.',
    '2. Full file contents every time for every file you create or change. Never use diffs or ellipsis.',
    '3. Only these imports: `react`, and relative paths (`./`, `../`). NO npm packages, NO fetch to CDNs in code, NO typescript, NO next.js. Use inline SVG or unicode for icons.',
    '4. Entry component is the default export of /App.jsx. Use Tailwind classes and/or plain CSS in /index.css (import it from App).',
    '5. Keep it self-contained and runnable. No external image URLs except https://images.unsplash.com or picsum.photos.',
    '6. MULTI-FILE STRUCTURE (required for anything beyond a trivial page): split the app into many small focused files — /App.jsx composes sections, one component per file under /components/ (e.g. /components/Navbar.jsx, /components/Hero.jsx, /components/Pricing.jsx, /components/Footer.jsx), separate views under /pages/ when asked, shared styles in /index.css. Never stuff a whole site into one file.',
    '7. The visible chat summary must NEVER contain code: no fenced code blocks, no JSX, no CSS — except the single `files` block and optional `tool_call` blocks. Plain-language summary only (what was built/changed + how to use it).',
    '9. STRUCTURAL VARIETY: never emit the default hero → 3-features → CTA → footer rhythm twice — vary the macrostructure per brief. No fabricated metrics, testimonials, or logos (use the user’s real copy or neutral placeholders). All colors via CSS variables in /index.css, never inline hex. No italic headings. Mobile-first: no horizontal scroll, stacks collapse to one column.',
    '10. ATTACHMENTS: a user message may include attached images (as image parts) and pasted text files (as extra text blocks). Treat images as visual references or restyle targets for the design. Attached text files are context — read them before generating.',
    '8. SELECTION PATCHES: when the user message starts with "SELECTION PATCH", do NOT return files. Reply with a one-line summary plus ONE fenced block labeled `patch` containing JSON like {"css": {"color": "#fff"}, "text": "new text"}. Use React camelCase CSS keys, only the properties that change. Either key may be omitted.',
    names.length ? 'CURRENT PROJECT FILES: ' + fileList : 'NO FILES YET — create /App.jsx (and /index.css if needed).',
    overrides && (Object.keys(overrides.styles || {}).length || Object.keys(overrides.texts || {}).length)
      ? 'USER CANVAS EDITS (already applied visually, fold them into the source you return): ' + JSON.stringify(overrides).slice(0, 2000)
      : '',
    toolDesc
      ? 'AVAILABLE MCP TOOLS (external services):\n' + toolDesc + '\nTo use one, append a fenced block labeled `tool_call` with JSON: {"tool": "name", "args": {...}}. You may request multiple as an array. Wait for results before finalizing files.' +
        ((mcpTools || []).some((t) => t.name === 'web.search')
          ? ' The web.search tool runs automatically — use it on your own whenever you need current or external info, without asking the user first.'
          : '')
      : 'No MCP tools connected.'
  ]
    .filter(Boolean)
    .join('\n');
}

// System prompt for IMAGE mode: agent must use an image MCP tool.
export function buildImagePrompt({ tools }) {
  const names = (tools || []).map((t) => t.name).join(', ');
  return [
    'You are Inui, an image coordinator. The user wants a generated image.',
    'To generate it you MUST emit ONE fenced block labeled `tool_call` with JSON: {"tool": "<exact tool name>", "args": {...matching the tool input schema...}}.',
    'Available image tools: ' + names + '. Pick the best one and craft rich args (subject, style, composition, lighting, aspect).',
    'Reply text must be one short line only, no code, no explanations.'
  ].join('\n');
}

// System prompt for Framer-style scoped selection edits (fast patch flow).
export function buildPatchSystemPrompt({ selection, files, skills }) {
  const css = String((files || {})['/index.css'] || '').slice(0, 2500);
  const names = Object.keys(files || {}).join(', ');
  const skillBlock = (skills || []).filter((s) => s && s.content).length
    ? 'USER SKILLS (always follow): ' +
      (skills || [])
        .filter((s) => s && s.content)
        .map((s) => (s.name || 'skill') + ': ' + String(s.content).slice(0, 600))
        .join(' | ')
        .slice(0, 1500)
    : '';
  return [
    'You are Inui, a senior front-end agent. You are editing ONE selected element on a visual canvas (Framer-style context scope).',
    'SELECTED ELEMENT:',
    '- tag: ' + (selection.tag || '?'),
    '- text: ' + String(selection.text || '').slice(0, 300),
    '- class: ' + String(selection.className || '').slice(0, 300),
    'PROJECT FILES: ' + names,
    css ? 'SITE CSS (match brand styles):\n' + css : '',
    skillBlock,
    'HARD RULES:',
    '1. Reply with a one-line summary plus ONE fenced block labeled `patch` with JSON: {"css": {...}, "text": "..."}. React camelCase CSS keys, only changed properties. Omit any key that should not change.',
    'Example of a PERFECT reply:\nBrightened the button.\n```patch\n{"css": {"background": "#e11d48", "color": "#ffffff", "fontWeight": 700}}\n```',
    '2. NEVER return full files, never output code outside the `patch` block. Summary must be plain language, no code.'
  ]
    .filter(Boolean)
    .join('\n');
}

// Converts a message to LLM content. Attachments ride only when keepFiles
// is true (caller keeps them on the newest user message so follow-ups
// don't resend megabytes of images).
export function messageToContent(m, keepFiles, maxText) {
  let base = m.tool ? 'TOOL_RESULT for ' + m.tool + ':\n' + m.content : String(m.content || '');
  if (maxText) base = base.slice(0, maxText);
  if (!keepFiles || !m.attachments?.length) return base;
  const parts = [{ type: 'text', text: base || '(see attached files)' }];
  m.attachments.forEach((a) => {
    if (a.kind === 'image' && a.dataUrl) parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
    else if (a.kind === 'text') parts.push({ type: 'text', text: '\n--- attached file: ' + a.name + ' ---\n' + a.text });
  });
  return parts;
}

// Streams a chat completion. onToken receives incremental text. Resolves full text.
// opts.inactivityMs: abort if no bytes arrive for this long (default 120s) —
// a server that accepts the connection and goes silent must not hang the UI
// until the caller's hard timeout. opts.expectContent: throw a clear error when
// the stream ends with no content (and why, via finish_reason) instead of
// silently resolving '' and tripping the downstream 'no files' UX.
export async function sendChatCompletion({ baseUrl, apiKey, model, messages, onToken, signal, inactivityMs = 120000, expectContent = false }) {
  // Watchdog: if NO bytes (headers or body) arrive for inactivityMs, abort.
  // Covers both the headers phase (server accepts TCP, never responds —
  // fetch() would otherwise hang forever) and a stalled mid-stream.
  const internal = new AbortController();
  let stalled = false;
  let watchdog = null;
  const arm = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      stalled = true;
      try {
        internal.abort();
      } catch {
        /* noop */
      }
    }, inactivityMs);
  };
  arm();
  const onOuterAbort = () => {
    try {
      internal.abort();
    } catch {
      /* noop */
    }
  };
  if (signal) {
    if (signal.aborted) onOuterAbort();
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  let res;
  try {
    res = await fetch(join(baseUrl, '/chat/completions'), {
      method: 'POST',
      signal: internal.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {})
      },
      body: JSON.stringify({ model, messages, stream: true, temperature: 0.7 })
    });
  } catch (e) {
    clearTimeout(watchdog);
    signal?.removeEventListener('abort', onOuterAbort);
    if (stalled && !(signal && signal.aborted)) {
      throw new Error('Stalled: no response for ' + Math.round(inactivityMs / 1000) + 's — server accepted the connection but never replied.');
    }
    throw e;
  }
  if (!res.ok) {
    clearTimeout(watchdog);
    signal?.removeEventListener('abort', onOuterAbort);
    const t = await res.text().catch(() => '');
    throw new Error('Chat failed: HTTP ' + res.status + ' — ' + t.slice(0, 300));
  }
  if (!res.body) {
    clearTimeout(watchdog);
    signal?.removeEventListener('abort', onOuterAbort);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    onToken && onToken(text);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let finishReason = null;
  // The watchdog resets only on real progress (parsed deltas) — pure
  // keep-alive comments must not keep a dead stream alive forever.
  let progressed = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (buf.length > 262144) {
        try {
          reader.cancel();
        } catch {
          /* noop */
        }
        throw new Error('Stream overflow: server sent >256KB without a newline — aborting.');
      }
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const choice = json.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta?.content || '';
          if (delta) {
            full += delta;
            onToken && onToken(delta);
          }
        } catch {
          /* ignore partial chunks */
        }
      }
      if (full.length !== progressed) {
        progressed = full.length;
        arm();
      }
    }
  } catch (e) {
    if (stalled && !(signal && signal.aborted)) {
      throw new Error('Stalled: stream went silent for ' + Math.round(inactivityMs / 1000) + 's mid-generation.');
    }
    throw e;
  } finally {
    clearTimeout(watchdog);
    signal?.removeEventListener('abort', onOuterAbort);
  }
  if (!full && expectContent) {
    const why = finishReason ? 'stream ended early (finish_reason: ' + finishReason + ')' : 'stream closed with no content';
    throw new Error('Model returned an empty reply — ' + why + '. Retry, or try a smaller request.');
  }
  return full;
}

// --- retry wrapper -------------------------------------------------------
// Transient failures (HTTP 429/5xx, network drops, stalls) are retried with
// exponential backoff. Never retries once a token has streamed (UI would
// duplicate text), after a user abort, or on permanent errors (401/403/404).
// Context-length overflows get an actionable message instead of a raw 400.
const TRANSIENT = /HTTP 429|HTTP 408|HTTP 5\d\d|stalled|fetch failed|network|Failed to fetch|load failed/i;
const PERMANENT = /HTTP 40[134]|HTTP 405/i;

export async function sendChatCompletionRetry(opts, { retries = 2, baseDelayMs = 1200 } = {}) {
  let lastErr = null;
  let streamed = false;
  // Track whether any token reached the UI — retries after that would
  // duplicate partial text in the chat pane.
  const userToken = opts.onToken;
  const guardedOnToken = userToken
    ? (d) => {
        streamed = true;
        userToken(d);
      }
    : undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await sendChatCompletion({ ...opts, onToken: guardedOnToken });
    } catch (e) {
      lastErr = e;
      const msg = String((e && e.message) || e);
      if (opts.signal?.aborted) throw e; // user stop — respect it immediately
      if (PERMANENT.test(msg)) {
        if (/HTTP 401|HTTP 403/.test(msg)) {
          throw new Error(msg + ' — check your API key in Settings.');
        }
        throw e;
      }
      if (/context length|maximum context|too many tokens|token limit|prompt is too long|context_window|input (is )?too (long|large)|tokens exceed|max_tokens/i.test(msg)) {
        throw new Error(
          'This conversation is too large for the model\u2019s context window. Start a new chat, ask for one section at a time, or use a model with a bigger window. (' +
            msg.slice(0, 160) +
          ')'
        );
      }
      if (streamed) throw e; // partial output already shown — a retry would duplicate it
      if (!TRANSIENT.test(msg) || attempt === retries) throw e;
      // Retryable — wait before the next attempt, but a Stop during the
      // backoff must cancel immediately instead of firing one more request.
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, baseDelayMs * Math.pow(2, attempt) + Math.random() * 300);
        if (opts.signal) {
          if (opts.signal.aborted) {
            clearTimeout(t);
            const ab = new Error('Generation stopped by user.');
            ab.name = 'AbortError';
            reject(ab);
          } else {
            opts.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(t);
                const ab = new Error('Generation stopped by user.');
                ab.name = 'AbortError';
                reject(ab);
              },
              { once: true }
            );
          }
        }
      });
    }
  }
  throw lastErr;
}
