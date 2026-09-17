// Dependency-free syntax highlighter for the read-only Code tab.
// Tokenizes JS/JSX and CSS into [{ t: text, c: class-key }] — good enough to
// read generated code, not a full parser. Class keys: x plain, k keyword,
// s string, c comment, n number, t tag/selector, a attr/property, p punct.
//
// Safety notes: `<` only opens a tag for Uppercase components or known HTML
// tags (so `a < b` comparisons and generics stay plain); regex literals are
// left plain rather than misread as comments.

const JS_KEYWORDS = new Set(
  'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof new return super switch this throw try typeof var void while with yield async await static get set of from as true false null undefined'.split(
    ' '
  )
);

const HTML_TAGS = new Set(
  'a abbr b body br button canvas code div em footer form h1 h2 h3 h4 h5 h6 head header hr html i iframe img input label li link main meta nav ol option p pre script section select small span strong style table tbody td textarea th thead title tr u ul video footer aside article'.split(
    ' '
  )
);

function highlightJS(code) {
  const tokens = [];
  let i = 0;
  let buf = '';
  let inTag = false;
  const n = code.length;
  const push = (t, c) => {
    if (t) tokens.push({ t, c });
  };
  const flush = () => {
    push(buf, 'x');
    buf = '';
  };
  const isIdentStart = (c) => /[A-Za-z_$]/.test(c || '');
  const isIdent = (c) => /[\w$]/.test(c || '');

  while (i < n) {
    const c = code[i];
    const d = code[i + 1];
    // line / block comments
    if (c === '/' && d === '/') {
      flush();
      let j = code.indexOf('\n', i);
      if (j < 0) j = n;
      push(code.slice(i, j), 'c');
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      flush();
      const j = code.indexOf('*/', i + 2);
      const end = j < 0 ? n : j + 2;
      push(code.slice(i, end), 'c');
      i = end;
      continue;
    }
    // strings (regex literals intentionally left plain)
    if (c === '"' || c === "'" || c === '`') {
      flush();
      let j = i + 1;
      while (j < n && code[j] !== c) {
        if (code[j] === '\\') j++;
        j++;
      }
      push(code.slice(i, Math.min(n, j + 1)), 's');
      i = Math.min(n, j + 1);
      continue;
    }
    // numbers (incl. 0xFF, 1.5, 100vh handled as number+suffix below)
    if (/[0-9]/.test(c) && (i === 0 || /[^A-Za-z0-9_$.]/.test(code[i - 1]))) {
      flush();
      const m = /^[0-9][\w.]*/.exec(code.slice(i));
      push(m[0], 'n');
      i += m[0].length;
      continue;
    }
    // JSX tag open: <Tag, </Tag (uppercase components or known HTML tags)
    if (c === '<' && /[A-Za-z/!]/.test(d || '')) {
      const m = /^<\/?([A-Za-z][\w.]*)/.exec(code.slice(i));
      if (m && (m[1][0] === m[1][0].toUpperCase() || HTML_TAGS.has(m[1]) || m[0][1] === '/')) {
        flush();
        push(m[0], 't');
        i += m[0].length;
        inTag = !/\/>$/.test(m[0]) && !m[0].endsWith('/');
        continue;
      }
    }
    if (inTag && c === '>') {
      flush();
      push('>', 't');
      i++;
      inTag = false;
      continue;
    }
    if (inTag && c === '/' && d === '>') {
      flush();
      push('/>', 't');
      i += 2;
      inTag = false;
      continue;
    }
    // identifiers: keyword, attribute (inside tags, before =), else plain
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdent(code[j])) j++;
      const word = code.slice(i, j);
      flush();
      if (!inTag && JS_KEYWORDS.has(word)) push(word, 'k');
      else if (inTag && /^\s*=/.test(code.slice(j))) push(word, 'a');
      else push(word, 'x');
      i = j;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  // merge runs later at render; keep token stream raw here
  return tokens;
}

function highlightCSS(code) {
  const tokens = [];
  let i = 0;
  const n = code.length;
  let buf = '';
  let depth = 0;
  const push = (t, c) => {
    if (t) tokens.push({ t, c });
  };
  const flush = () => {
    push(buf, 'x');
    buf = '';
  };
  while (i < n) {
    const c = code[i];
    const d = code[i + 1];
    if (c === '/' && d === '*') {
      flush();
      const j = code.indexOf('*/', i + 2);
      const end = j < 0 ? n : j + 2;
      push(code.slice(i, end), 'c');
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      flush();
      let j = i + 1;
      while (j < n && code[j] !== c) {
        if (code[j] === '\\') j++;
        j++;
      }
      push(code.slice(i, Math.min(n, j + 1)), 's');
      i = Math.min(n, j + 1);
      continue;
    }
    if (c === '{') {
      flush();
      push('{', 'p');
      depth++;
      i++;
      continue;
    }
    if (c === '}') {
      flush();
      push('}', 'p');
      depth = Math.max(0, depth - 1);
      i++;
      continue;
    }
    if (c === '@') {
      flush();
      const m = /^@[\w-]+/.exec(code.slice(i));
      push(m ? m[0] : '@', 'k');
      i += m ? m[0].length : 1;
      continue;
    }
    if (/[0-9]/.test(c) && (i === 0 || /[^A-Za-z0-9_$.#]/.test(code[i - 1]))) {
      flush();
      const m = /^[0-9][\w.%]*/.exec(code.slice(i));
      push(m[0], 'n');
      i += m[0].length;
      continue;
    }
    if ((c === '.' || c === '#') && /[A-Za-z_-]/.test(d || '') && depth === 0) {
      flush();
      const m = /^[.#][\w-]+/.exec(code.slice(i));
      push(m[0], 't');
      i += m[0].length;
      continue;
    }
    if (depth > 0 && /[A-Za-z-]/.test(c)) {
      const m = /^-?[A-Za-z][\w-]*/.exec(code.slice(i));
      const rest = code.slice(i + m[0].length);
      if (/^\s*:/.test(rest)) {
        flush();
        push(m[0], 'a');
        i += m[0].length;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return tokens;
}

export function highlightCode(code, filename) {
  const src = String(code || '');
  if (!src) return [];
  if (String(filename || '').endsWith('.css')) return highlightCSS(src);
  return highlightJS(src);
}
