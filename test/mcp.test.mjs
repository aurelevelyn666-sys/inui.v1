import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../src/lib/mcp.js');

test('demo tools echo + placeholder + unknown', () => {
  assert.ok(M.executeDemoTool('demo.echo', { text: 'hi' }).includes('hi'));
  assert.ok(M.executeDemoTool('demo.placeholder-image', { topic: 'cat' }).includes('IMAGE_URL:'));
  assert.throws(() => M.executeDemoTool('nope', {}), /Unknown demo tool/);
});

test('callMcpTool: demo path + builtin unknown', async () => {
  assert.ok((await M.callMcpTool({ url: 'local://demo' }, 'demo.echo', { text: 'yo' })).includes('yo'));
  await assert.rejects(M.callMcpTool({ url: 'local://builtin' }, 'nope', {}), /Unknown builtin tool/);
});

test('callMcpTool maps MCP image parts to markdown', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    body: null,
    headers: { get: () => null },
    text: async () => JSON.stringify({ result: { content: [{ type: 'image', mimeType: 'image/png', data: 'QUJD' }] } })
  });
  const out = await M.callMcpTool({ url: 'https://mcp.test', mode: 'streamable' }, 'shot', {});
  assert.ok(out.includes('![mcp image](data:image/png;base64,QUJD)'));
  delete globalThis.fetch;
});
