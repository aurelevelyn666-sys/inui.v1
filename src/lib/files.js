// File parsing, in-browser JSX bundling, and sandboxed srcDoc preview builder.
// Babel loads via a plain <script> tag (public/babel.min.js) as window.Babel —
// importing the UMD package through the bundler proved unreliable, so we don't.
function babelApi() {
  const B = typeof window !== 'undefined' ? window.Babel : null;
  if (!B || typeof B.transform !== 'function') {
    throw new Error('Babel failed to load (babel.min.js missing). Restart the dev server.');
  }
  return B;
}

export const STARTER_FILES = {
  '/App.jsx': [
    "import './index.css';",
    '',
    'export default function App() {',
    '  return (',
    '    <div className="inui-welcome">',
    '      <div className="inui-card">',
    '        <h1>Inui canvas ready</h1>',
    '        <p>Describe the site you want in the chat — it will render here live.</p>',
    '        <p className="inui-hint">Tip: add your API key via the gear icon, then try “a dark landing page for a coffee brand”.</p>',
    '      </div>',
    '    </div>',
    '  );',
    '}',
    ''
  ].join('\n'),
  '/index.css': [
    '.inui-welcome { min-height: 100vh; display: flex; align-items: center; justify-content: center;',
    '  background: #0a0a0b; color: #e4e4e7; font-family: ui-sans-serif, system-ui, sans-serif; }',
    '.inui-card { max-width: 560px; padding: 40px; border: 1px solid #27272a; border-radius: 16px;',
    '  background: #131316; text-align: center; }',
    '.inui-card h1 { font-size: 28px; margin: 0 0 12px; }',
    '.inui-card p { color: #71717a; line-height: 1.6; }',
    '.inui-hint { font-size: 13px; color: #71717a !important; }',
    ''
  ].join('\n')
};

export function normalizePath(p) {
  let s = String(p || '').trim();
  if (!s) return '/App.jsx';
  if (!s.startsWith('/')) s = '/' + s;
  return s;
}

export function pickEntry(files) {
  const keys = Object.keys(files);
  for (const c of ['/App.jsx', '/App.js', '/app.jsx', '/app.js']) {
    if (files[c]) return c;
  }
  return keys.find((k) => k.endsWith('.jsx') || k.endsWith('.js')) || keys[0];
}

export function extractFences(text) {
  const out = [];
  const src = String(text || '').replace(/\r\n/g, '\n'); // CRLF-safe
  const re = /```(\S*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(src))) out.push({ lang: (m[1] || '').trim(), code: m[2] });
  return out;
}

// Salvage path->code pairs from broken/truncated/unfenced files JSON.
// A tiny state machine that walks the text respecting string escapes and
// accepts unterminated values — recovers files even when the stream died
// mid-string or the model wrapped code in stray triple backticks.
function salvageStringMap(src) {
  const s = String(src || '').replace(/\r\n/g, '\n');
  const n = s.length;
  const out = {};
  let i = 0;
  const ws = () => {
    while (i < n && /\s/.test(s[i])) i++;
  };
  // Reads a JSON string starting at s[i] === '"'. Returns the decoded value;
  // tolerates an unterminated string (truncated stream) by returning the rest.
  const readStr = () => {
    i++;
    let v = '';
    while (i < n) {
      const c = s[i];
      if (c === '\\') {
        const d = s[i + 1];
        if (d === undefined) break; // truncated right after the backslash
        if (d === 'u') {
          const hex = s.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            v += String.fromCharCode(parseInt(hex, 16));
            i += 6;
            continue;
          }
          v += 'u';
          i += 2;
          continue;
        }
        v += d === 'n' ? '\n' : d === 't' ? '\t' : d === 'r' ? '\n' : d === 'b' ? '\b' : d === 'f' ? '\f' : d === 'v' ? '\v' : d === '0' ? '\0' : d;
        i += 2;
        continue;
      }
      if (c === '"') {
        i++;
        return { value: v, closed: true };
      }
      v += c;
      i++;
    }
    return { value: v, closed: false };
  };
  ws();
  if (s[i] === '{') i++;
  let guard = 0;
  while (i < n && guard++ < 200) {
    ws();
    if (i >= n) break;
    if (s[i] !== '"') {
      // resync at the next quote
      const nxt = s.indexOf('"', i);
      if (nxt < 0) break;
      i = nxt;
    }
    const key = readStr().value;
    ws();
    if (s[i] !== ':') continue;
    i++;
    ws();
    if (s[i] !== '"') {
      const nxt = s.indexOf('"', i);
      if (nxt < 0) break;
      i = nxt;
      continue;
    }
    const val = readStr();
    if (looksLikePath(key) && val.value.trim()) out[normalizePath(key)] = val.value;
    ws();
    if (s[i] === ',') {
      i++;
      continue;
    }
    if (s[i] === '}') {
      i++;
      ws();
      if (i >= n) break;
      // more content after the object — resync
    }
  }
  return out;
}

function looksLikePath(s) {
  return /^(\/[\w\-.]+)+\.(jsx?|css)$/.test(s.trim());
}

// Salvages the single-file shape {"path": "/App.jsx", "code": "..."} when the
// code string is broken (stray backticks, truncation, literal newlines).
// Escape-aware: reads until the closing unescaped quote, tolerates EOF.
function salvageSingleFileJson(src) {
  const s = String(src || '');
  const pathKey = s.search(/"path"\s*:/);
  if (pathKey < 0) return {};
  const pathQuote = s.indexOf('"', s.indexOf(':', pathKey) + 1);
  if (pathQuote < 0) return {};
  let pe = pathQuote + 1;
  let pathVal = '';
  while (pe < s.length && s[pe] !== '"') {
    if (s[pe] === '\\' && pe + 1 < s.length) {
      pathVal += s[pe + 1];
      pe += 2;
    } else {
      pathVal += s[pe];
      pe++;
    }
  }
  if (!looksLikePath(pathVal)) return {};
  const codeKey = s.search(/"code"\s*:/);
  if (codeKey < 0) return {};
  const codeQuote = s.indexOf('"', s.indexOf(':', codeKey) + 1);
  if (codeQuote < 0) return {};
  let i = codeQuote + 1;
  let codeVal = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const d = s[i + 1];
      if (d === undefined) break; // truncated right after the backslash
      if (d === 'u') {
        const hex = s.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          codeVal += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        codeVal += 'u';
        i += 2;
        continue;
      }
      codeVal += d === 'n' ? '\n' : d === 't' ? '\t' : d === 'r' ? '\n' : d === 'b' ? '\b' : d === 'f' ? '\f' : d === 'v' ? '\v' : d === '0' ? '\0' : (d ?? '');
      i += 2;
      continue;
    }
    if (c === '"') break; // closing quote (truncated stream => runs to EOF)
    codeVal += c;
    i++;
  }
  if (!codeVal.trim()) return {};
  return { [normalizePath(pathVal)]: codeVal };
}

function fileHeaderPath(code) {
  const first = String(code).replace(/^\n/, '').split('\n')[0] || '';
  const m = first.match(/(?:\/\/|#|\/\*+)\s*FILE:\s*(\S+?)(?:\s*\*\/)?\s*$/i);
  return m && looksLikePath(m[1]) ? normalizePath(m[1]) : null;
}

function stripFileHeader(code) {
  return String(code).replace(/^\n/, '').replace(/^(?:\/\/|#|\/\*+)\s*FILE:\s*\S+?(?:\s*\*\/)?\s*\n/, '');
}

// Best-effort recovery: pull a usable component out of a reply that ignored
// the FILES_JSON format. Returns { path, code } or null.
export function recoverFileFromText(text) {
  const fences = extractFences(text);
  const scored = fences
    .filter((f) => !['tool_call', 'toolcall', 'toolcalls', 'tool_calls'].includes(f.lang.toLowerCase()))
    .map((f) => {
      let code = f.code;
      let path = looksLikePath(f.lang) ? normalizePath(f.lang) : fileHeaderPath(code);
      if (path) code = stripFileHeader(code);
      const score =
        (/export\s+default/.test(code) ? 50 : 0) +
        (/<[A-Z][\w]*|className=/.test(code) ? 20 : 0) +
        Math.min(code.length / 100, 30);
      return { path, code: code.replace(/^\n/, ''), score };
    })
    .filter((c) => /export\s+default|function\s+App|className=|<\w+/.test(c.code));
  if (!scored.length) {
    // No fences at all — maybe the whole reply is the component.
    if (/export\s+default[\s\S]{0,400}return\s*\(/.test(text) && text.length < 30000) {
      return { path: '/App.jsx', code: text.trim() };
    }
    return null;
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return { path: best.path || '/App.jsx', code: best.code };
}

// Last-resort splitter: carve components out of replies that ignored every
// file format. Returns {path: code} (possibly empty).
export function splitComponentsFromText(text) {
  const files = {};
  const src = String(text || '');
  // 1) explicit FILE headers (fenced or not) — single-line match only
  const headerRe = /^[ \t]*(?:\/\/|#|\/\*+|<!--|=+)[ \t]*(?:FILE:[ \t]*)?(\/[\w\-.]+(?:\/[\w\-.]+)*\.(jsx?|css))[ \t]*(?:\*+\/|-->|=+)?[ \t]*$/gm;
  const marks = [];
  let m;
  while ((m = headerRe.exec(src))) marks.push({ path: normalizePath(m[1]), lineStart: m.index, codeStart: m.index + m[0].length + 1 });
  if (marks.length) {
    marks.forEach((mk, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].lineStart : src.length;
      const code = src.slice(mk.codeStart, end).replace(/```\w*\n?/g, '').trim();
      if (code.length > 40 && /<\w+|return|const\s|function\s/.test(code)) files[mk.path] = code;
    });
    if (Object.keys(files).length) return files;
  }
  // 2) export-default boundaries (fence markers stripped, contents kept)
  const flat = src.replace(/```(\S*)\n?/g, '\n');
  const expRe = /export\s+default\s+(?:function|class)\s+([A-Za-z_$][\w$]*)/g;
  const parts = [];
  while ((m = expRe.exec(flat))) parts.push({ name: m[1], index: m.index });
  const looksCode = (c) => c.length > 80 && /export\s+default/.test(c) && /<\w+/.test(c);
  // Same component name twice must not silently drop the second one.
  const claimKey = (base) => {
    let key = base;
    let n = 2;
    while (files[key]) key = base.replace(/\.jsx$/, '') + n + '.jsx';
    return key;
  };
  if (parts.length === 1) {
    const code = flat.trim();
    if (looksCode(code)) {
      files[claimKey(parts[0].name === 'App' ? '/App.jsx' : '/components/' + parts[0].name + '.jsx')] = code;
    }
  } else if (parts.length > 1) {
    parts.forEach((p, i) => {
      const end = i + 1 < parts.length ? parts[i + 1].index : flat.length;
      const prevEnd = i > 0 ? parts[i - 1].index : -1;
      const before = flat.slice(0, p.index).split('\n');
      let j = before.length - 1;
      let taken = 0;
      while (j >= 0 && taken < 25) {
        const lineStart = before.slice(0, j).join('\n').length + (j > 0 ? 1 : 0);
        if (lineStart < prevEnd) break;
        if (/^\s*(import\s|export\s+(?!default)|$|\/\/|\/\*|\*)/.test(before[j])) {
          j--;
          taken++;
        } else break;
      }
      const start = Math.max(0, before.slice(0, j + 1).join('\n').length + (j + 1 > 0 && j + 1 < before.length ? 1 : 0));
      const code = flat.slice(Math.min(start, p.index), end).trim();
      if (looksCode(code)) {
        const base = p.name === 'App' && !files['/App.jsx'] ? '/App.jsx' : '/components/' + p.name + '.jsx';
        files[claimKey(base)] = code;
      }
    });
  }
  return files;
}

function cssDeclsToObject(decls) {
  const css = {};
  String(decls).split(';').forEach((part) => {
    const i = part.indexOf(':');
    if (i < 0) return;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim();
    if (!k || !v) return;
    css[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  });
  return css;
}

export const MAX_PATCHES = 12;

function normalizePatchItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const css = item.css && typeof item.css === 'object' && !Array.isArray(item.css) ? item.css : null;
  const text = typeof item.text === 'string' ? item.text : null;
  if (!css && text === null) return null;
  const selector = typeof item.selector === 'string' && item.selector.trim() ? item.selector.trim() : null;
  return { selector, css, text };
}

// Partitions a patch list into applicable vs skipped (pure — unit tested).
// knownSelectors: selector strings from the live layer tree (+ the pinned
// target). Unknown selectors are refused, never applied blind; extras past
// the cap are reported, not silently run.
export function matchPatches(patches, knownSelectors) {
  const known = new Set((knownSelectors || []).filter((s) => typeof s === 'string'));
  const apply = [];
  const skipped = [];
  (Array.isArray(patches) ? patches : []).forEach((raw, i) => {
    if (apply.length >= MAX_PATCHES) {
      skipped.push({ index: i, reason: 'over cap of ' + MAX_PATCHES });
      return;
    }
    const item = normalizePatchItem(raw);
    if (!item) {
      skipped.push({ index: i, reason: 'empty (no css or text)' });
      return;
    }
    if (item.selector && !known.has(item.selector)) {
      skipped.push({ index: i, selector: item.selector, reason: 'unknown selector' });
      return;
    }
    apply.push(item);
  });
  return { apply, skipped };
}

// Flattens a layer tree into prompt-sized context lines + selector set.
export function condenseLayers(layers, maxChars = 3000, maxNodes = 40) {
  const lines = [];
  const selectors = [];
  let chars = 0;
  const walk = (nodes, depth) => {
    for (const n of nodes || []) {
      if (lines.length >= maxNodes || chars >= maxChars) return;
      const tag = String((n && n.tag) || '?').slice(0, 24);
      const text = String((n && n.text) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const sel = String((n && n.selector) || '');
      if (sel) selectors.push(sel);
      const line = '  '.repeat(Math.min(depth, 4)) + tag + (text ? ' | "' + text + '"' : '') + (sel ? ' | ' + sel : '');
      lines.push(line);
      chars += line.length;
      if (n && n.kids) walk(n.kids, depth + 1);
    }
  };
  walk(Array.isArray(layers) ? layers : [], 0);
  return { text: lines.join('\n').slice(0, maxChars), selectors, count: lines.length };
}

function tryParsePatchJson(s) {
  let obj;
  try {
    obj = JSON.parse(String(s).trim());
  } catch {
    return null;
  }
  if (Array.isArray(obj)) {
    // Multi-patch turn: shape-check here, selector matching happens later
    // in matchPatches() against the live layer tree.
    const list = normalizePatchList(obj);
    return list.length ? { patches: list } : null;
  }
  if (obj && (obj.css || typeof obj.text === 'string')) {
    return { css: obj.css || null, text: typeof obj.text === 'string' ? obj.text : null };
  }
  return null;
}

// Normalizes a raw array into patch items (shape only — matching happens in
// matchPatches with live layers). Caps length; drops empties.
function normalizePatchList(arr) {
  const out = [];
  (Array.isArray(arr) ? arr : []).forEach((raw) => {
    if (out.length >= MAX_PATCHES) return;
    const item = normalizePatchItem(raw);
    if (item) out.push(item);
  });
  return out;
}

// Tolerates: ```patch / ```json fences, ```css declarations,
// raw JSON anywhere, or plain prose (used as the new text).
// Parses a SELECTION PATCH fence -> { css, text } | { patches } | null.
export function parsePatchFromText(text) {
  const src = String(text || '');
  const fences = extractFences(src);
  for (const f of fences) {
    const lang = f.lang.toLowerCase();
    if (lang === 'patch' || lang === 'json') {
      const p = tryParsePatchJson(f.code);
      if (p) return p;
    } else if (lang === 'css') {
      const css = cssDeclsToObject(f.code);
      if (Object.keys(css).length) return { css, text: null };
    }
  }
  // raw JSON array anywhere (multi-patch without fences) — scanned BEFORE
  // single objects, because an array span contains inner {...} spans that
  // would otherwise match first and lose the batch. Same bounds.
  const aOpens = [];
  for (let i = 0; i < src.length && aOpens.length < 8; i++) if (src[i] === '[') aOpens.push(i);
  const aCloses = [];
  for (let i = src.length - 1; i >= 0 && aCloses.length < 8; i--) if (src[i] === ']') aCloses.push(i);
  for (const e of aCloses) {
    for (const s of aOpens) {
      if (e - s > 4 && e - s < 40000) {
        const p = tryParsePatchJson(src.slice(s, e + 1));
        if (p && p.patches) return p;
      }
    }
  }
  // raw JSON object anywhere (bounded attempts, longest spans first)
  const opens = [];
  for (let i = 0; i < src.length && opens.length < 8; i++) if (src[i] === '{') opens.push(i);
  const closes = [];
  for (let i = src.length - 1; i >= 0 && closes.length < 8; i--) if (src[i] === '}') closes.push(i);
  for (const e of closes) {
    for (const s of opens) {
      if (e - s > 4 && e - s < 4000) {
        const p = tryParsePatchJson(src.slice(s, e + 1));
        if (p) return p;
      }
    }
  }
  // plain prose fallback (no code at all) -> treat as the new text
  const prose = src.replace(/```[\s\S]*?```/g, '').trim();
  if (!/```/.test(src) && !/[{}]/.test(src) && prose.length >= 8 && prose.length <= 600 &&
      !/(can't|cannot|unable|sorry|error|failed|don't know|no change|unchanged|remain)/i.test(prose)) {
    return { css: null, text: prose };
  }
  return null;
}

// Extracts image URLs from assistant/tool text: markdown images (remote or
// data:) + IMAGE_URL: lines.
export function extractImages(text) {
  const out = [];
  const src = String(text || '');
  const md = src.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g);
  for (const m of md) out.push(m[1]);
  const mdData = src.matchAll(/!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)\)/g);
  for (const m of mdData) {
    // Data URLs can be megabytes — only keep previewable ones.
    if (m[1].length < 700000) out.push(m[1]);
  }
  src.split('\n').forEach((line) => {
    const m = line.match(/IMAGE_URL:\s*(https?:\/\/\S+)/i);
    if (m) out.push(m[1].replace(/[),.]+$/, ''));
  });
  return [...new Set(out)].slice(0, 6);
}

// Verifies a project WITHOUT rendering: JSX transpiles + relative imports resolve.
export function verifyProject(files) {
  const problems = [];
  const jsFiles = Object.entries(files).filter(([p]) => p.endsWith('.jsx') || p.endsWith('.js'));
  if (!jsFiles.length) problems.push({ path: '(project)', error: 'No JavaScript entry file found (expected /App.jsx).' });
  else if (!jsFiles.some(([p]) => p.toLowerCase() === '/app.jsx' || p.toLowerCase() === '/app.js')) {
    problems.push({ path: '(project)', error: 'No /App.jsx entry file found — the preview needs a default export there.' });
  }
  // Strip comments first so `// import './ghost'` can't fail the build, and
  // catch `export … from` plus dynamic `import()` alongside static imports.
  const reqRe = /(?:import\s+(?:[^'"]+?\s+from\s+)?|export\s+[^;'"]*?\s+from\s+|(?:require|import)\(\s*)['"]([^'"]+)['"]/g;
  const edges = {};
  jsFiles.forEach(([path, code]) => {
    try {
      transpile(path, code);
    } catch (e) {
      problems.push({ path, error: String((e && e.message) || e).split('\n')[0].slice(0, 220) });
      return;
    }
    const stripped = String(code).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;])\/\/[^\n]*/g, '$1');
    edges[path] = [];
    let m;
    reqRe.lastIndex = 0;
    while ((m = reqRe.exec(stripped))) {
      const spec = m[1];
      if (spec.startsWith('.') && !spec.endsWith('.css')) {
        const found = resolveImport(path, spec, files);
        if (!found) problems.push({ path, error: 'Cannot resolve import "' + spec + '" — file does not exist.' });
        else edges[path].push(found);
      } else if (!spec.startsWith('.') && spec !== 'react' && spec !== 'react-dom' && spec !== 'react-dom/client') {
        problems.push({ path, error: 'External package "' + spec + '" is not allowed (react + relative files only).' });
      }
    }
  });
  // Circular imports resolve to half-initialized modules at runtime (silent
  // empty renders) — surface them as a clear diagnostic instead.
  try {
    const state = {};
    const stack = [];
    const visit = (p) => {
      if (state[p] === 2) return;
      if (state[p] === 1) {
        const cyc = [...stack.slice(stack.indexOf(p)), p].join(' → ');
        problems.push({ path: p, error: 'Circular import detected: ' + cyc + ' — one of these will render empty.' });
        return;
      }
      state[p] = 1;
      stack.push(p);
      (edges[p] || []).forEach(visit);
      stack.pop();
      state[p] = 2;
    };
    Object.keys(edges).forEach(visit);
  } catch {
    /* cycle check is best-effort */
  }
  return problems.slice(0, 12);
}

// Lightweight static audit (Framer-style pre-publish check).
// Returns [{ type, file, detail }].
export function auditFiles(files, entry) {
  const issues = [];
  const push = (type, file, detail) => {
    if (issues.length < 40) issues.push({ type, file, detail });
  };
  Object.entries(files).forEach(([path, code]) => {
    if (!(path.endsWith('.jsx') || path.endsWith('.js'))) return;
    const imgs = code.match(/<img[\s\S]*?>/g) || [];
    imgs.forEach((img) => {
      if (!/\balt=/.test(img)) push('a11y', path, 'Image without alt text: ' + img.slice(0, 70));
    });
    const dead = code.match(/<a[^>]*href="#"[^>]*>/g) || [];
    if (dead.length) push('links', path, dead.length + ' placeholder link(s) with href="#"');
    const empties = code.match(/<button[^>]*>\s*<\/button>/g) || [];
    if (empties.length) push('a11y', path, empties.length + ' empty <button> element(s)');
  });
  if (entry && files[entry] && !/<h1[\s>]/.test(files[entry])) {
    push('seo', entry, 'Entry page has no <h1> heading');
  }
  return issues;
}

// Normalizes either shape models emit:
//   object map  {"/App.jsx": "code"}   OR   array  [{path, code}]
//   single file {path: "/App.jsx", code: "..."} (models often emit this
//   after misreading the prompt — accept it instead of dropping the build).
function jsonToFiles(obj) {
  const files = {};
  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      if (!item || typeof item.path !== 'string') return;
      const code = typeof item.code === 'string' ? item.code : typeof item.content === 'string' ? item.content : null;
      if (code === null) return;
      // Allowlist: file keys end up interpolated into preview HTML/JS, so
      // reject anything that is not a plain component/stylesheet path.
      const np = normalizePath(item.path);
      if (!looksLikePath(np)) return;
      files[np] = code;
    });
  } else if (obj && typeof obj === 'object') {
    if (typeof obj.path === 'string' && (typeof obj.code === 'string' || typeof obj.content === 'string')) {
      const np = normalizePath(obj.path);
      if (looksLikePath(np)) files[np] = typeof obj.code === 'string' ? obj.code : obj.content;
      return files;
    }
    Object.entries(obj).forEach(([k, v]) => {
      if (typeof v === 'string' && looksLikePath(k)) files[normalizePath(k)] = v;
    });
  }
  return files;
}

// Finds file JSON anywhere: in fences (any label) or raw/unfenced in the text.
export function extractJsonFiles(text) {
  const files = {};
  extractFences(text).forEach((f) => {
    try {
      Object.assign(files, jsonToFiles(JSON.parse(f.code.trim())));
    } catch {
      /* not JSON */
    }
  });
  if (!Object.keys(files).length) {
    const s = text.indexOf('[');
    const e = text.lastIndexOf(']');
    // Speculative whole-span parses are capped: a 300KB JSON.parse freezes
    // the main thread, and fences already cover the normal case.
    if (s >= 0 && e > s && e - s < 100000) {
      try {
        Object.assign(files, jsonToFiles(JSON.parse(text.slice(s, e + 1))));
      } catch {
        /* not parseable */
      }
    }
  }
  if (!Object.keys(files).length) {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s >= 0 && e > s && e - s < 100000) {
      try {
        Object.assign(files, jsonToFiles(JSON.parse(text.slice(s, e + 1))));
      } catch {
        /* not parseable */
      }
    }
  }
  // Last resort: state-machine salvage of truncated/broken files JSON
  // (stream cut off, stray backticks inside code, unterminated strings).
  if (!Object.keys(files).length) {
    const first = text.search(/\{\s*"(\/|\\\/)/);
    if (first >= 0) Object.assign(files, salvageStringMap(text.slice(first)));
  }
  // Single-file shape {"path": ..., "code": ...} — valid or broken.
  if (!Object.keys(files).length) {
    const at = text.search(/\{\s*"path"\s*:/);
    if (at >= 0) {
      try {
        const end = text.lastIndexOf('}');
        if (end > at && end - at < 100000) Object.assign(files, jsonToFiles(JSON.parse(text.slice(at, end + 1))));
      } catch {
        /* fall through to escape-aware salvage */
      }
      if (!Object.keys(files).length) Object.assign(files, salvageSingleFileJson(text.slice(at, at + 100000)));
    }
  }
  return files;
}

// Parses assistant output -> { chatText, files, toolCalls }
export function parseAssistantOutput(text) {
  const src = String(text || '').replace(/\r\n/g, '\n'); // CRLF-safe stripping below
  const files = {};
  const toolCalls = [];
  const fences = extractFences(src);
  const consumed = new Array(fences.length).fill(false);

  fences.forEach((f, i) => {
    const lang = f.lang.toLowerCase();
    if (['files', 'file', 'json'].includes(lang)) {
      try {
        const got = jsonToFiles(JSON.parse(f.code.trim()));
        if (Object.keys(got).length) {
          Object.assign(files, got);
          consumed[i] = true;
        }
      } catch {
        // Not valid JSON — often stray ``` inside code strings. Salvage what
        // is there instead of losing the whole block (map shape or single file).
        const got = salvageStringMap(f.code);
        if (Object.keys(got).length) {
          Object.assign(files, got);
          consumed[i] = true;
        } else {
          const single = salvageSingleFileJson(f.code);
          if (Object.keys(single).length) {
            Object.assign(files, single);
            consumed[i] = true;
          }
        }
      }
    } else if (looksLikePath(lang)) {
      files[normalizePath(lang)] = f.code.replace(/^\n/, '');
      consumed[i] = true;
    } else if (['jsx', 'js', 'javascript', 'css'].includes(lang)) {
      const header = fileHeaderPath(f.code);
      if (header) {
        files[header] = stripFileHeader(f.code);
        consumed[i] = true;
      } else if (lang === 'css' && /[.#][\w-]+\s*\{/.test(f.code) && Object.keys(files).length === 0) {
        // Lone CSS block before any files exist -> treat as /index.css
        files['/index.css'] = f.code.replace(/^\n/, '');
        consumed[i] = true;
      }
    } else if (['tool_call', 'toolcall', 'toolcalls', 'tool_calls'].includes(lang)) {
      try {
        const obj = JSON.parse(f.code.trim());
        (Array.isArray(obj) ? obj : [obj]).forEach((t) => {
          if (t && t.tool) toolCalls.push({ tool: t.tool, args: t.args || {}, serverUrl: t.server });
        });
        consumed[i] = true;
      } catch {
        /* ignore */
      }
    }
  });

  let chatText = src;
  fences.forEach((f, i) => {
    if (consumed[i]) chatText = chatText.replace('```' + f.lang + '\n' + f.code + '```', '');
  });
  return { chatText: chatText.trim(), files, toolCalls };
}

function resolveImport(fromPath, spec, files) {
  if (!spec.startsWith('.')) return spec; // bare specifier (react, etc.)
  const di = String(fromPath).lastIndexOf('/');
  const dir = di > 0 ? fromPath.slice(0, di) : '';
  const base = (dir + '/' + spec).replace(/\/+/g, '/').replace(/\/\.(?=\/)/g, '');
  const parts = [];
  for (const p of base.split('/')) {
    // Clamp `..` at the project root instead of popping into nothing (which
    // could resolve the wrong file); escaping root fails the lookup below.
    if (p === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else if (p !== '.') {
      parts.push(p);
    }
  }
  const norm = parts.join('/') || '/';
  const cands = [norm, norm + '.jsx', norm + '.js', norm + '/index.jsx', norm + '/index.js'];
  return cands.find((c) => files[c]) || null;
}

function transpile(path, code) {
  const out = babelApi().transform(code, {
    filename: path,
    presets: [['react', { runtime: 'classic' }]],
    plugins: ['transform-modules-commonjs']
  });
  return out.code;
}

const esc = (s) =>
  String(s)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<\/style/gi, '<\\/style');

export function overridesToCss(styles = {}) {
  return Object.entries(styles)
    .map(([sel, props]) => {
      // Patch content can come from the model — never let a selector or value
      // open a tag inside the <style> block (only `</style` can close it, and
      // that needs `<`). `>` alone is kept: canvas selectors legitimately use
      // the child combinator (`body > div:nth-of-type(1)`).
      if (String(sel).includes('<')) return '';
      const body = Object.entries(props || {})
        .map(([k, v]) => {
          const name = String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
          if (!/^(--)?[a-z][a-z0-9-]*$/.test(name)) return '';
          if (String(v).includes('<')) return '';
          return name + ': ' + v + ';';
        })
        .filter(Boolean)
        .join(' ');
      if (!body) return '';
      return sel + ' { ' + body + ' }';
    })
    .filter(Boolean)
    .join('\n');
}

// Injected editor agent: lives INSIDE the sandboxed preview, talks via postMessage only.
const EDITOR_SCRIPT = `
(function () {
  var mode = 'select';
  var selected = null;
  var ui = null, handles = [];
  var hoverBox = null, hoverLabel = null;
  var locked = [];
  function curT(el) {
    return { x: parseFloat(el.dataset.indx || '0'), y: parseFloat(el.dataset.indy || '0'), r: parseFloat(el.dataset.inrot || '0') };
  }
  function setT(el, t) {
    el.dataset.indx = t.x; el.dataset.indy = t.y; el.dataset.inrot = t.r;
    el.style.transform = 'translate(' + t.x + 'px,' + t.y + 'px) rotate(' + t.r + 'deg)';
  }
  function isLocked(sel) { return locked.indexOf(sel) >= 0; }
  // Handshake token: the host passes a fresh nonce in 'inui:init' and the
  // frame echoes it on every message. The host drops anything without the
  // current nonce, so generated page code cannot forge editor commands
  // (and stale documents from a previous build are ignored too).
  var nonce = null;
  function send(msg) {
    try {
      msg.nonce = nonce;
    } catch (e0) {}
    parent.postMessage(msg, '*');
  }
  function cssPath(el) {
    if (!el || el === document.body) return 'body';
    var parts = [];
    while (el && el !== document.body && parts.length < 6) {
      var tag = el.tagName.toLowerCase();
      var sib = el, n = 1;
      while ((sib = sib.previousElementSibling)) { if (sib.tagName === el.tagName) n++; }
      parts.unshift(tag + ':nth-of-type(' + n + ')');
      el = el.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }
  function ensureUI() {
    if (ui) return;
    ui = document.createElement('div');
    ui.id = 'inui-ui';
    ui.style.cssText = 'position:fixed;border:2px solid #18181b;box-shadow:0 0 0 1px #fff,0 0 14px rgba(0,0,0,.25);background:rgba(24,24,27,.05);pointer-events:none;z-index:2147483646;display:none;';
    document.body.appendChild(ui);
    for (var i = 0; i < 4; i++) {
      var h = document.createElement('div');
      h.setAttribute('data-handle', i);
      h.style.cssText = 'position:fixed;width:12px;height:12px;background:#fff;border:2px solid #000;border-radius:3px;z-index:2147483647;display:none;cursor:nwse-resize;';
      document.body.appendChild(h);
      handles.push(h);
    }
    hoverBox = document.createElement('div');
    hoverBox.id = 'inui-hover';
    hoverBox.style.cssText = 'position:fixed;border:1px dashed rgba(0,0,0,.5);pointer-events:none;z-index:2147483645;display:none;';
    document.body.appendChild(hoverBox);
    hoverLabel = document.createElement('div');
    hoverLabel.id = 'inui-hover-label';
    hoverLabel.style.cssText = 'position:fixed;background:#000;color:#fff;border:1px solid rgba(255,255,255,.4);font:600 10px/1 sans-serif;padding:3px 6px;border-radius:4px;pointer-events:none;z-index:2147483645;display:none;';
    document.body.appendChild(hoverLabel);
  }
  function showUI() {
    if (!selected) return;
    var el = document.querySelector(selected.selector);
    if (!el) return;
    var r = el.getBoundingClientRect();
    ui.style.display = 'block';
    ui.style.left = r.left + 'px'; ui.style.top = r.top + 'px';
    ui.style.width = r.width + 'px'; ui.style.height = r.height + 'px';
    var showH = true;
    var pts = [[r.left - 6, r.top - 6], [r.right - 6, r.top - 6], [r.left - 6, r.bottom - 6], [r.right - 6, r.bottom - 6]];
    handles.forEach(function (h, i) {
      h.style.display = showH ? 'block' : 'none';
      h.style.left = pts[i][0] + 'px'; h.style.top = pts[i][1] + 'px';
    });
  }
  function hideUI() {
    if (!ui) return;
    ui.style.display = 'none';
    handles.forEach(function (h) { h.style.display = 'none'; });
  }
  function isUiNode(t) {
    return t && (t.id === 'inui-ui' || t.id === 'inui-hover' || t.id === 'inui-hover-label' || (t.hasAttribute && t.hasAttribute('data-handle')));
  }
  function showHover(el) {
    if (!el || !hoverBox || el === document.body || el === document.documentElement) return;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    hoverBox.style.display = 'block';
    hoverBox.style.left = r.left + 'px'; hoverBox.style.top = r.top + 'px';
    hoverBox.style.width = r.width + 'px'; hoverBox.style.height = r.height + 'px';
    hoverLabel.textContent = el.tagName.toLowerCase();
    hoverLabel.style.display = 'block';
    hoverLabel.style.left = r.left + 'px';
    hoverLabel.style.top = Math.max(0, r.top - 20) + 'px';
  }
  function hideHover() {
    if (!hoverBox) return;
    hoverBox.style.display = 'none'; hoverLabel.style.display = 'none';
  }
  document.addEventListener('mouseover', function (e) {
    if (mode === 'off' || mode === 'interact') { hideHover(); return; }
    var t = e.target;
    if (!t || t === document.body || t === document.documentElement || isUiNode(t)) { hideHover(); return; }
    showHover(t);
  }, true);
  document.addEventListener('mouseout', function () { hideHover(); }, true);
  function rgbHex(c) {
    var m = String(c || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return String(c || '');
    var p = m[1].split(',').map(function (x) { return parseFloat(x); });
    if (p.length >= 4 && p[3] === 0) return 'transparent';
    function h(n) { n = Math.max(0, Math.min(255, Math.round(n))); var s = n.toString(16); return s.length < 2 ? '0' + s : s; }
    var hex = '#' + h(p[0]) + h(p[1]) + h(p[2]);
    if (p.length >= 4 && p[3] < 1) hex += h(p[3] * 255);
    return hex;
  }
  function short4(top, right, bottom, left) {
    if (top === right && right === bottom && bottom === left) return top;
    if (top === bottom && right === left) return top + ' ' + right;
    return top + ' ' + right + ' ' + bottom + ' ' + left;
  }
  function describe(el) {
    var cls = '';
    try { cls = typeof el.className === 'string' ? el.className : ''; } catch (e) {}
    var t = curT(el);
    var r = { x: 0, y: 0 };
    try { r = el.getBoundingClientRect(); } catch (e2) {}
    var cs = null;
    try { cs = getComputedStyle(el); } catch (e3) {}
    function g(k) { return cs ? cs[k] : ''; }
    return {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || '').slice(0, 140),
      className: String(cls || '').slice(0, 160),
      x: t.x, y: t.y, rot: t.r,
      w: el.offsetWidth || Math.round(r.width) || 0,
      h: el.offsetHeight || Math.round(r.height) || 0,
      computed: {
        color: rgbHex(g('color')),
        background: rgbHex(g('backgroundColor')),
        fontFamily: String(g('fontFamily') || '').split(',')[0].replace(/["']/g, '').trim(),
        fontSize: g('fontSize'), fontWeight: g('fontWeight'),
        lineHeight: g('lineHeight'), letterSpacing: g('letterSpacing'),
        textAlign: g('textAlign'), textTransform: g('textTransform'),
        fontStyle: g('fontStyle'), textDeco: g('textDecorationLine'),
        padding: short4(g('paddingTop'), g('paddingRight'), g('paddingBottom'), g('paddingLeft')),
        margin: short4(g('marginTop'), g('marginRight'), g('marginBottom'), g('marginLeft')),
        display: g('display'), flexDirection: g('flexDirection'),
        alignItems: g('alignItems'), justifyContent: g('justifyContent'), gap: g('gap'),
        width: g('width'), height: g('height'),
        radius: g('borderTopLeftRadius'),
        borderWidth: g('borderTopWidth'), borderColor: rgbHex(g('borderTopColor')), borderStyle: g('borderTopStyle'),
        opacity: g('opacity'), boxShadow: g('boxShadow') === 'none' ? '' : g('boxShadow')
      }
    };
  }
  function select(el) {
    ensureUI();
    hideHover();
    selected = describe(el);
    showUI();
    send({ type: 'inui:select', selection: selected });
  }
  document.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; return; }
    if (mode === 'off' || mode === 'interact') return;
    var t = e.target;
    if (isUiNode(t)) return;
    e.preventDefault(); e.stopPropagation();
    if (isLocked(cssPath(t))) { send({ type: 'inui:lockedTap', selector: cssPath(t) }); return; }
    select(t);
  }, true);
  document.addEventListener('contextmenu', function (e) {
    if (mode === 'off' || mode === 'interact') return;
    var t = e.target;
    if (isUiNode(t)) return;
    e.preventDefault(); e.stopPropagation();
    var sel = cssPath(t);
    if (!isLocked(sel)) select(t);
    var r = t.getBoundingClientRect ? t.getBoundingClientRect() : { left: 0, top: 0 };
    send({ type: 'inui:context', selector: sel, x: e.clientX, y: e.clientY, tag: t.tagName.toLowerCase(), locked: isLocked(sel) });
  }, true);
  document.addEventListener('dblclick', function (e) {
    if (mode === 'off' || mode === 'interact') return;
    var t = e.target;
    e.preventDefault(); e.stopPropagation();
    select(t);
    t.contentEditable = 'true';
    t.focus();
    var done = function () {
      t.contentEditable = 'false';
      t.removeEventListener('blur', done);
      var patch = { selector: cssPath(t), text: t.innerText };
      send({ type: 'inui:select', selection: describe(t) });
      send({ type: 'inui:patch', patch: patch });
    };
    t.addEventListener('blur', done);
  }, true);
  var drag = null;
  var pending = null;
  var suppressClick = false;
  document.addEventListener('mousedown', function (e) {
    if (mode === 'off' || mode === 'interact') return;
    var t = e.target;
    if (isUiNode(t)) return;
    // resize handles always work on the current selection
    if (t.hasAttribute && t.hasAttribute('data-handle')) {
      if (!selected) return;
      var el0 = document.querySelector(selected.selector);
      if (!el0) return;
      e.preventDefault(); e.stopPropagation();
      var r0 = el0.getBoundingClientRect();
      drag = { el: el0, selector: selected.selector, resize: true, sx: e.clientX, sy: e.clientY, w: r0.width, h: r0.height };
      return;
    }
    if (!t || t === document.body || t === document.documentElement) return;
    // anything on canvas can be dragged; a press without movement is a click
    e.preventDefault();
    pending = { el: t, selector: cssPath(t), sx: e.clientX, sy: e.clientY, moved: false };
  }, true);
  document.addEventListener('mousemove', function (e) {
    if (pending && !drag) {
      if (Math.abs(e.clientX - pending.sx) + Math.abs(e.clientY - pending.sy) > 4) {
        pending.moved = true;
        suppressClick = true;
        var pel = pending.el;
        if (!pel || !document.contains(pel)) { pending = null; return; }
        var tt = curT(pel);
        drag = { el: pel, selector: pending.selector, resize: false, sx: e.clientX, sy: e.clientY, dx: tt.x, dy: tt.y };
        if (!selected || selected.selector !== pending.selector) select(pel);
      }
      return;
    }
    if (!drag) return;
    if (drag.resize) {
      drag.el.style.width = Math.max(20, drag.w + (e.clientX - drag.sx)) + 'px';
      drag.el.style.height = Math.max(20, drag.h + (e.clientY - drag.sy)) + 'px';
    } else {
      var nx2 = drag.dx + (e.clientX - drag.sx);
      var ny2 = drag.dy + (e.clientY - drag.sy);
      setT(drag.el, { x: nx2, y: ny2, r: parseFloat(drag.el.dataset.inrot || '0') });
    }
    showUI();
  }, true);
  document.addEventListener('mouseup', function () {
    if (pending && !pending.moved) {
      var cel = pending.el;
      var csel = pending.selector;
      pending = null;
      if (cel && document.contains(cel)) {
        if (isLocked(csel)) send({ type: 'inui:lockedTap', selector: csel });
        else select(cel);
      }
      return;
    }
    pending = null;
    if (!drag) return;
    var css = drag.resize
      ? { width: drag.el.style.width, height: drag.el.style.height }
      : { transform: drag.el.style.transform };
    // Ship a fresh describe() alongside the patch so the host panel never
    // goes stale (same selector, new geometry) after canvas-side edits.
    var fresh = null;
    try {
      fresh = describe(drag.el);
    } catch (eDesc) {}
    send({ type: 'inui:patch', patch: { selector: drag.selector, css: css }, selection: fresh });
    drag = null;
  }, true);
  window.addEventListener('scroll', function () { if (selected) showUI(); hideHover(); }, true);
  window.addEventListener('resize', function () { if (selected) showUI(); });
  function applyOne(selector, css, text) {
    var el = document.querySelector(selector);
    if (!el) return false;
    if (css) Object.keys(css).forEach(function (k) { el.style[k] = css[k]; });
    if (typeof text === 'string') el.textContent = text;
    return true;
  }
  function visibleText(el) {
    var t = '';
    try { t = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40); } catch (e) {}
    return t;
  }
  function buildTree() {
    var out = [];
    var count = 0;
    function walk(el, depth) {
      if (!el || el.nodeType !== 1 || count > 250) return null;
      var tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style') return null;
      if (el.id === 'inui-ui' || (el.hasAttribute && el.hasAttribute('data-handle'))) return null;
      count++;
      var kids = [];
      if (depth < 6 && el.children) {
        for (var i = 0; i < el.children.length && kids.length < 30; i++) {
          var n = walk(el.children[i], depth + 1);
          if (n) kids.push(n);
        }
      }
      return { tag: tag, text: visibleText(el), selector: cssPath(el), kids: kids };
    }
    var b = document.body;
    if (b) for (var i = 0; i < b.children.length; i++) {
      var n = walk(b.children[i], 1);
      if (n) out.push(n);
    }
    return out;
  }
  function isEditing() {
    var a = document.activeElement;
    return a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  }
  var nudgeTimer = null;
  document.addEventListener('keydown', function (e) {
    if (mode === 'off' || mode === 'interact') return;
    if (e.key === 'Escape') {
      hideUI(); hideHover(); selected = null;
      send({ type: 'inui:deselect' });
      return;
    }
    if (isEditing() || !selected) return;
    var el = document.querySelector(selected.selector);
    if (!el) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      send({ type: 'inui:patch', patch: { selector: selected.selector, css: { display: 'none' } } });
      hideUI(); selected = null;
      send({ type: 'inui:deselect' });
      return;
    }
    var step = e.shiftKey ? 10 : 1, dx = 0, dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;
    e.preventDefault();
    var nx = parseFloat(el.dataset.indx || '0') + dx;
    var ny = parseFloat(el.dataset.indy || '0') + dy;
    setT(el, { x: nx, y: ny, r: parseFloat(el.dataset.inrot || '0') });
    showUI();
    clearTimeout(nudgeTimer);
    var sel = selected.selector;
    nudgeTimer = setTimeout(function () {
      var freshN = null;
      try {
        if (document.contains(el)) freshN = describe(el);
      } catch (eDesc2) {}
      send({ type: 'inui:patch', patch: { selector: sel, css: { transform: el.style.transform } }, selection: freshN });
    }, 400);
  }, true);
  function reportHeight() {
    var h = 0;
    try {
      h = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0
      );
    } catch (e) {}
    send({ type: 'inui:height', h: Math.max(300, Math.min(9000, h)) });
  }
  var heightTimer = null;
  function queueHeight() {
    clearTimeout(heightTimer);
    heightTimer = setTimeout(reportHeight, 250);
  }
  var docHeightTimer = null;
  function queueDocHeight() {
    clearTimeout(docHeightTimer);
    docHeightTimer = setTimeout(reportDocHeight, 250);
  }
  function queueAllHeights() {
    queueHeight();
    queueDocHeight();
  }
  // Late growth (images, webfonts, async render) happens AFTER load, and a
  // ResizeObserver on documentElement never sees body content grow — so
  // re-report on a schedule plus on any DOM/image change. Otherwise the host
  // iframe keeps its load-time height and everything below the fold is cut.
  function kickHeights() {
    queueAllHeights();
    [400, 1200, 2500, 5000, 9000].forEach(function (ms) {
      setTimeout(function () {
        reportHeight();
        reportDocHeight();
      }, ms);
    });
  }
  window.addEventListener('load', function () {
    kickHeights();
  });
  // Capture-phase: late image/iframe loads change layout without any DOM
  // mutation, so listen for them directly.
  document.addEventListener('load', function () {
    queueAllHeights();
  }, true);
  document.addEventListener('error', function () {
    queueAllHeights();
  }, true);
  if (typeof MutationObserver !== 'undefined') {
    try {
      new MutationObserver(function () {
        queueAllHeights();
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    } catch (eMo) {}
  }
  if (typeof ResizeObserver !== 'undefined') {
    try {
      new ResizeObserver(queueHeight).observe(document.documentElement);
    } catch (e2) {}
  }
  function reportDocHeight() {
    var h = 0;
    try {
      var b = document.body;
      if (b && b.children) {
        for (var i = 0; i < b.children.length; i++) {
          try {
            var t = b.children[i].getBoundingClientRect().bottom;
            if (t > h) h = t;
          } catch (e) {}
        }
      }
      if (h < 50) {
        h = Math.max(
          b ? b.scrollHeight : 0,
          document.documentElement ? document.documentElement.scrollHeight : 0
        );
      }
      send({ type: 'inui:height', h: Math.max(300, Math.min(9000, Math.round(h) + 16)) });
    } catch (e2) {}
  }
  var docHeightTimer = null;
  function queueDocHeight() {
    clearTimeout(docHeightTimer);
    docHeightTimer = setTimeout(reportDocHeight, 250);
  }
  if (typeof ResizeObserver !== 'undefined') {
    try {
      new ResizeObserver(queueDocHeight).observe(document.documentElement);
    } catch (e3) {}
  }
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'inui:init') {
      var _m = d.mode || 'select';
      mode = _m === 'interact' ? 'off' : 'select';
      if (typeof d.nonce === 'string' && d.nonce) nonce = d.nonce;
      if (d.locked) locked = d.locked;
      ensureUI();
      kickHeights();
      setTimeout(function () { send({ type: 'inui:layers', tree: buildTree() }); }, 900);
      (d.texts || []).forEach(function (t, i) {
        setTimeout(function () { applyOne(t.selector, null, t.text); }, 300 * (i + 1));
      });
    } else if (d.type === 'inui:setMode') {
      mode = d.mode === 'interact' ? 'off' : 'select';
      hideUI(); hideHover(); selected = null;
    } else if (d.type === 'inui:apply') {
      if (applyOne(d.selector, d.css, d.text)) { selected = selected || { selector: d.selector }; showUI(); }
    } else if (d.type === 'inui:clear') {
      hideUI(); selected = null;
    } else if (d.type === 'inui:getLayers') {
      send({ type: 'inui:layers', tree: buildTree() });
    } else if (d.type === 'inui:getHeight') {
      reportHeight();
      reportDocHeight();
    } else if (d.type === 'inui:selectAt') {
      var tgt = document.querySelector(d.selector);
      if (tgt) {
        ensureUI();
        if (!isLocked(d.selector)) select(tgt);
        else send({ type: 'inui:select', selection: describe(tgt) });
        try { tgt.scrollIntoView({ block: 'nearest' }); } catch (e2) {}
      }
    } else if (d.type === 'inui:locked') {
      locked = d.locked || [];
    } else if (d.type === 'inui:cmd') {
      var op = d.op;
      var sel = d.selector || (selected && selected.selector);
      if (op === 'lock' && sel) {
        if (!isLocked(sel)) locked.push(sel);
        send({ type: 'inui:lockedChanged', locked: locked.slice() });
        hideUI(); selected = null;
        send({ type: 'inui:deselect' });
        return;
      }
      if (op === 'unlock' && sel) {
        locked = locked.filter(function (s) { return s !== sel; });
        send({ type: 'inui:lockedChanged', locked: locked.slice() });
        return;
      }
      var target = sel && document.querySelector(sel);
      if (!target) return;
      if (op === 'forward' || op === 'backward' || op === 'front' || op === 'back') {
        var nz;
        if (op === 'front' || op === 'back') {
          nz = 0;
          var sibs = target.parentElement ? target.parentElement.children : [];
          for (var zi = 0; zi < sibs.length; zi++) {
            var c = sibs[zi];
            if (c === target || c.nodeType !== 1) continue;
            var v = parseInt(getComputedStyle(c).zIndex || '0', 10);
            if (isNaN(v)) v = 0;
            nz = op === 'front' ? Math.max(nz, v) : Math.min(nz, v);
          }
          nz = op === 'front' ? nz + 1 : nz - 1;
        } else {
          nz = parseInt(getComputedStyle(target).zIndex || '0', 10);
          if (isNaN(nz)) nz = 0;
          nz = nz + (op === 'forward' ? 1 : -1);
        }
        if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
        target.style.zIndex = String(nz);
        send({ type: 'inui:patch', patch: { selector: sel, css: { position: target.style.position, zIndex: target.style.zIndex } } });
      } else if (op === 'delete') {
        send({ type: 'inui:patch', patch: { selector: sel, css: { display: 'none' } } });
        hideUI(); selected = null;
        send({ type: 'inui:deselect' });
      } else if (op === 'duplicate') {
        var clone = target.cloneNode(true);
        clone.removeAttribute('id');
        target.parentNode.insertBefore(clone, target.nextSibling);
        send({ type: 'inui:changed' });
        select(clone);
      } else if (op === 'copy') {
        send({ type: 'inui:copied', html: target.outerHTML, tag: target.tagName.toLowerCase() });
      } else if (op === 'paste') {
        if (d.html) {
          target.insertAdjacentHTML('beforeend', d.html);
          send({ type: 'inui:changed' });
          var last = target.lastElementChild;
          if (last) select(last);
        }
      } else if (op === 'group') {
        var g = document.createElement('div');
        g.setAttribute('data-inui-group', '1');
        target.parentNode.insertBefore(g, target);
        g.appendChild(target);
        send({ type: 'inui:changed' });
        select(g);
      } else if (op === 'ungroup') {
        var w = target.hasAttribute && target.hasAttribute('data-inui-group')
          ? target
          : (target.closest ? target.closest('[data-inui-group]') : null);
        if (w && w.parentNode) {
          var pp = w.parentNode;
          while (w.firstChild) pp.insertBefore(w.firstChild, w);
          pp.removeChild(w);
          send({ type: 'inui:changed' });
        }
      }
    }
  });
  window.addEventListener('error', function (e) {
    send({ type: 'inui:error', message: String(e.message || e.error || 'preview error') });
  });
  window.addEventListener('unhandledrejection', function (e) {
    send({ type: 'inui:error', message: 'Promise: ' + String(e.reason && e.reason.message || e.reason) });
  });
  send({ type: 'inui:ready' });
})();
`;

export function buildSrcDoc({ files, overrides = {}, editable = true, entry: entryParam }) {
  try {
    const entry = entryParam && files[entryParam] ? entryParam : pickEntry(files);
    if (!entry) return { error: 'No files in project.' };
    const cssFiles = Object.entries(files)
      .filter(([p]) => p.endsWith('.css'))
      .map(([, c]) => c)
      .join('\n');
    const jsFiles = Object.entries(files).filter(([p]) => p.endsWith('.jsx') || p.endsWith('.js'));

    const registry = jsFiles.map(([path, code]) => {
      const compiled = transpile(path, code);
      return '__register__(' + JSON.stringify(path) + ', function(require, module, exports){\n' + compiled + '\n});';
    });

    const resolver = `
      var __mods__ = {};
      function __register__(p, fn) { __mods__[p] = { fn: fn, done: false, exports: {} }; }
      function __resolve__(from, spec) { return window.__inuiResolve__(from, spec); }
      function __require__(from, spec) {
        if (spec === 'react') return window.React;
        if (spec === 'react-dom' || spec === 'react-dom/client') return window.ReactDOM;
        var p = (typeof from === 'string' && spec) ? __resolve__(from, spec) : from;
        if (typeof p !== 'string') throw new Error('bad require');
        if (p.endsWith('.css')) return {};
        var m = __mods__[p];
        if (!m) throw new Error('Cannot find module ' + p);
        if (!m.done) { m.done = true; m.fn(function (s) { return __require__(p, s); }, m, m.exports); }
        return m.exports;
      }
    `;

    const resolveFn = `
      window.__inuiResolve__ = function (from, spec) {
        var files = ${esc(JSON.stringify(Object.keys(files)))};
        if (!spec.startsWith('.')) return spec;
        var dir = from.slice(0, from.lastIndexOf('/')) || '';
        var base = (dir + '/' + spec).replace(/\\/+/g, '/');
        var parts = [];
        base.split('/').forEach(function (p) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); });
        var norm = parts.join('/') || '/';
        var cands = [norm, norm + '.jsx', norm + '.js', norm + '/index.jsx', norm + '/index.js'];
        for (var i = 0; i < cands.length; i++) if (files.indexOf(cands[i]) >= 0) return cands[i];
        return norm;
      };
    `;

    const boot = `
      try {
        var mod = __require__(${esc(JSON.stringify(entry))});
        var Comp = mod && mod.default ? mod.default : mod;
        var root = document.getElementById('root');
        if (typeof Comp === 'function') {
          ReactDOM.createRoot(root).render(React.createElement(Comp));
        } else { root.innerHTML = '<pre style="color:#f87171">Entry has no default export.</pre>'; }
      } catch (err) {
        document.getElementById('root').innerHTML = '<pre style="color:#f87171;white-space:pre-wrap;padding:24px">' + String(err && err.stack || err).replace(/</g, '&lt;') + '</pre>';
      }
    `;

    const textsInit = Object.entries(overrides.texts || {}).map(([selector, text]) => ({ selector, text }));

    // Non-editable previews still report their height so hosts can size the frame.
    // Measured from real painted content (not scrollHeight, which overshoots).
    // Late growth (images, webfonts, async render) happens AFTER load, and a
    // ResizeObserver on documentElement never sees body content grow — so
    // re-report on a schedule plus on any DOM/image change. Otherwise the host
    // iframe keeps its load-time height and everything below the fold is cut.
    const HEIGHT_INNER = '(function(){'
      + 'function sendH(h){try{parent.postMessage({type:"inui:height",h:Math.max(300,Math.min(9000,Math.round(h)+16))},"*");}catch(e){}}'
      + 'function measure(){var h=0;try{var b=document.body;if(b&&b.children){for(var i=0;i<b.children.length;i++){try{var t=b.children[i].getBoundingClientRect().bottom;if(t>h)h=t;}catch(e){}}}if(h<50){h=Math.max(b?b.scrollHeight:0,document.documentElement?document.documentElement.scrollHeight:0);}}catch(e2){}return h;}'
      + 'function r(){sendH(measure());}'
      + 'var t=null;function q(){clearTimeout(t);t=setTimeout(r,250);}'
      + 'function kick(){q();[400,1200,2500,5000,9000].forEach(function(ms){setTimeout(r,ms);});}'
      + 'window.addEventListener("load",function(){kick();});'
      + 'document.addEventListener("load",function(){q();},true);'
      + 'document.addEventListener("error",function(){q();},true);'
      + 'if(typeof MutationObserver!=="undefined"){try{new MutationObserver(function(){q();}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true});}catch(e3){}}'
      + 'if(typeof ResizeObserver!=="undefined"){try{new ResizeObserver(function(){q();}).observe(document.documentElement);}catch(e4){}}'
      + 'r();'
      + '})();';
    const HEIGHT_SCRIPT = '<scr' + 'ipt>' + HEIGHT_INNER + '</scr' + 'ipt>';

    const keyframes = [
      '@keyframes inui-fade-in { from { opacity: 0; } to { opacity: 1; } }',
      '@keyframes inui-fade-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }',
      '@keyframes inui-scale-in { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }'
    ].join('\n');

    const doc = [
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
      '<script src="https://cdn.tailwindcss.com"></scr' + 'ipt>',
      '<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></scr' + 'ipt>',
      '<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></scr' + 'ipt>',
      '<style>html,body{margin:0;padding:0;background:#fff}\n' + keyframes + '\n' + esc(cssFiles) + '\n' + esc(overridesToCss(overrides.styles)) + '</style>',
      '</head><body><div id="root"></div>',
      '<script>' + resolveFn + resolver + registry.map(esc).join('\n') + esc(boot) + '</scr' + 'ipt>',
      editable ? '<script>window.__inuiInit__=' + esc(JSON.stringify({ texts: textsInit })) + ';' + EDITOR_SCRIPT + '</scr' + 'ipt>' : HEIGHT_SCRIPT,
      '</body></html>'
    ].join('');
    return { srcDoc: doc, entry };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

export function debounce(fn, ms) {
  let t;
  const d = function (...a) {
    clearTimeout(t);
    t = setTimeout(() => {
      try {
        const r = fn.apply(this, a);
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch {
        /* a debounced throw must not surface as an uncaught timer error */
      }
    }, ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}
