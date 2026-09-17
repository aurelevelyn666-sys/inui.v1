import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
globalThis.window = { Babel: require('@babel/standalone') };
const F = await import('../src/lib/files.js');

test('fenced single {path,code} parses + chat stays clean', () => {
  const code = 'export default function App() { return <main>hi</main>; }';
  const r = F.parseAssistantOutput('Intro line.\n```files\n' + JSON.stringify({ path: '/App.jsx', code }) + '\n```');
  assert.equal(r.files['/App.jsx'], code);
  assert.ok(!r.chatText.includes('export default'));
});

test('unfenced single object + map + array shapes all parse', () => {
  const code = 'export default function App(){return <main>hi</main>}';
  assert.ok(F.extractJsonFiles(JSON.stringify({ path: '/App.jsx', code }))['/App.jsx']);
  const map = F.extractJsonFiles('```files\n' + JSON.stringify({ '/App.jsx': code, '/index.css': '.a{}' }) + '\n```');
  assert.ok(map['/App.jsx'] && map['/index.css']);
  const arr = F.extractJsonFiles('```files\n' + JSON.stringify([{ path: 'App.jsx', code }]) + '\n```');
  assert.ok(arr['/App.jsx']);
});

test('truncated + unicode escapes salvage', () => {
  const t = F.extractJsonFiles('Here.\n{"path": "/App.jsx", "code": "export default function App() { return <main>hi');
  assert.ok(t['/App.jsx']?.includes('export default'));
  const u = F.extractJsonFiles('{"path": "/App.jsx", "code": "caf\\u00e9 \\u0041 export default x"}');
  assert.ok(u['/App.jsx']?.includes('caf\u00e9 A'));
});

test('evil filenames rejected, legit kept', () => {
  assert.equal(Object.keys(F.extractJsonFiles(JSON.stringify([{ path: '</script><script>alert(1)//', code: 'x' }]))).length, 0);
  assert.equal(Object.keys(F.extractJsonFiles(JSON.stringify({ path: '/x"><script>', code: 'x' }))).length, 0);
  const g = F.extractJsonFiles('```files\n' + JSON.stringify({ '/App.jsx': 'a', '/components/H.jsx': 'b' }) + '\n```');
  assert.ok(g['/App.jsx'] && g['/components/H.jsx']);
});

test('overridesToCss keeps legit, drops tag breakouts', () => {
  assert.ok(F.overridesToCss({ 'body > div': { color: 'red' } }).includes('color: red'));
  const evil = F.overridesToCss({ x: { color: 'red;} </style><script>alert(1)//' }, 'y</style>': { color: 'b' } });
  assert.ok(!evil.includes('</style') && !evil.includes('<script'));
});

test('buildSrcDoc neutralizes style breakout', () => {
  const doc = F.buildSrcDoc({
    files: { '/App.jsx': 'export default function App(){return <main>hi</main>}', '/index.css': '</style><img src=x onerror=alert(1)>' },
    overrides: {}, editable: false, entry: '/App.jsx'
  });
  assert.ok(doc.srcDoc && !doc.srcDoc.includes('</style><img'));
});

test('verifyProject: clean, comments ignored, export-from + dynamic import', () => {
  const proj = {
    '/App.jsx': 'import Hero from "./components/Hero.jsx";\n// import "./ghost.jsx";\nexport default function App(){ return <Hero/>; }',
    '/components/Hero.jsx': 'export * from "./base.js";\nconst L = import("./lazy.js");\nexport default function Hero(){ return <div/>; }',
    '/components/base.js': 'export const a = 1;',
    '/components/lazy.js': 'export default 1;',
    '/index.css': '.a{}'
  };
  assert.deepEqual(F.verifyProject(proj), []);
});

test('verifyProject: cycles + root escape diagnosed', () => {
  const cyc = {
    '/App.jsx': 'import A from "./a.jsx";\nexport default function App(){ return <A/>; }',
    '/a.jsx': 'import B from "./b.jsx";\nexport default function A(){ return <B/>; }',
    '/b.jsx': 'import A from "./a.jsx";\nexport default function B(){ return <A/>; }'
  };
  assert.ok(F.verifyProject(cyc).some((p) => /Circular/.test(p.error)));
  const esc = { '/App.jsx': 'import X from "../../x.jsx";\nexport default function App(){ return <X/>; }' };
  assert.ok(F.verifyProject(esc).some((p) => /Cannot resolve/.test(p.error)));
});

test('splitComponentsFromText: prose rejected, dup names suffixed', () => {
  assert.equal(Object.keys(F.splitComponentsFromText('I think <div> is fine, export default nothing')).length, 0);
  const a = 'export default function Card(){ const items=[1,2,3]; return <div className="c"><h2>Alpha card with a longer body text</h2></div>; }';
  const b = 'export default function Card(){ const items=[4,5,6]; return <div className="c"><h2>Beta card with a longer body text</h2></div>; }';
  const keys = Object.keys(F.splitComponentsFromText(a + '\n\nSome words between.\n\n' + b));
  assert.equal(keys.length, 2);
  assert.ok(keys.some((k) => /2\.jsx$/.test(k)));
});

test('extractImages: remote + data urls', () => {
  const imgs = F.extractImages('see ![a](https://x.test/i.png) and ![b](data:image/png;base64,iVBORw0KGgo=) end');
  assert.equal(imgs.length, 2);
});

test('debounce keeps this + cancel works', async () => {
  let got = null;
  const o = { v: 7, fn: F.debounce(function () { got = this && this.v; }, 5) };
  o.fn();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(got, 7);
  let ran = false;
  const d = F.debounce(() => { ran = true; }, 30);
  d();
  d.cancel();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(ran, false);
});
