import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};
const L = await import('../src/lib/llm.js');

test('loadSettings validates corrupt shapes', () => {
  store['inui.settings.v1'] = '"justastring"';
  let s = L.loadSettings();
  assert.ok(Array.isArray(s.mcpUrls) && s.modelId === 'gpt-4o-mini');
  store['inui.settings.v1'] = '[1,2]';
  s = L.loadSettings();
  assert.ok(Array.isArray(s.skills) && Array.isArray(s.disabledSkills));
  store['inui.settings.v1'] = JSON.stringify({ modelId: 'x', mcpUrls: 'nope', apiKey: 42 });
  s = L.loadSettings();
  assert.equal(s.modelId, 'x');
  assert.deepEqual(s.mcpUrls, []);
  assert.equal(s.apiKey, '');
});

test('saveSettings never throws, reports quota', () => {
  assert.equal(L.saveSettings({}), true);
  const orig = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try {
    assert.equal(L.saveSettings({ a: 1 }), false);
  } finally {
    globalThis.localStorage.setItem = orig;
  }
});

test('skill injection keeps whole distill + budgets hold', () => {
  const content = 'x'.repeat(3000);
  const sys = L.buildSystemPrompt({ files: { '/App.jsx': 'x' }, mcpTools: [], overrides: {}, skills: [{ name: 't', content }] });
  assert.ok(sys.includes('USER SKILLS') && sys.includes(content));
  const huge = Array.from({ length: 200 }, (_, i) => ({ name: 'tool' + i, description: 'd'.repeat(5000) }));
  const sys2 = L.buildSystemPrompt({ files: {}, mcpTools: huge, overrides: {}, skills: [] });
  assert.ok(sys2.length < 60000);
  const many = {};
  for (let i = 0; i < 200; i++) many['/c' + i + '.jsx'] = 'x';
  assert.ok(L.buildSystemPrompt({ files: many, mcpTools: [], overrides: {}, skills: [] }).includes('more)'));
});

// ---- retry + fallback (fetch stubbed) ----
const calls = [];
function stubFetch(handler) {
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body.model);
    return handler(body.model, body);
  };
}
const okRes = (text) => ({ ok: true, body: null, json: async () => ({ choices: [{ message: { content: text } }] }) });
const errRes = (status) => ({ ok: false, status, text: async () => '' });

test('retry then success without fallback', async () => {
  calls.length = 0;
  let n = 0;
  stubFetch(() => (++n < 3 ? errRes(500) : okRes('hi')));
  const out = await L.sendChatCompletionRetry(
    { baseUrl: 'http://x', model: 'a', messages: [] },
    { retries: 3, baseDelayMs: 1 }
  );
  assert.equal(out, 'hi');
  assert.deepEqual(calls, ['a', 'a', 'a']);
});

test('fallback answers after primary exhausts, notice fired', async () => {
  calls.length = 0;
  let noticed = null;
  stubFetch((m) => (m === 'a' ? errRes(500) : okRes('from-b')));
  const out = await L.sendChatCompletionRetry(
    { baseUrl: 'http://x', model: 'a', fallbackModel: 'b', messages: [], onFallbackModel: (m) => { noticed = m; } },
    { retries: 1, baseDelayMs: 1 }
  );
  assert.equal(out, 'from-b');
  assert.equal(noticed, 'b');
  assert.ok(calls.includes('a') && calls.includes('b'));
});

test('auth failure never touches fallback', async () => {
  calls.length = 0;
  stubFetch(() => errRes(401));
  await assert.rejects(
    L.sendChatCompletionRetry({ baseUrl: 'http://x', model: 'a', fallbackModel: 'b', messages: [] }, { retries: 1, baseDelayMs: 1 }),
    /API key/
  );
  assert.ok(!calls.includes('b'));
});

test('no fallback configured -> terminal error', async () => {
  calls.length = 0;
  stubFetch(() => errRes(500));
  await assert.rejects(
    L.sendChatCompletionRetry({ baseUrl: 'http://x', model: 'a', messages: [] }, { retries: 1, baseDelayMs: 1 }),
    /HTTP 500/
  );
});
