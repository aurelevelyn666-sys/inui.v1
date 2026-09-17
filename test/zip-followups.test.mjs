import { test } from 'node:test';
import assert from 'node:assert/strict';

const Z = await import('../src/lib/zip.js');
const F = await import('../src/lib/followups.js');

test('buildZip: honest count + traversal contained + caps', () => {
  const z = Z.buildZip({ '/App.jsx': 'a', '/c.jsx': 'b' });
  assert.equal(z.fileCount, 2);
  assert.ok(z.blob.size > 0);
  const big = {};
  for (let i = 0; i < 500; i++) big['/f' + i + '.jsx'] = 'x';
  assert.equal(Z.buildZip(big).fileCount, 200);
  // traversal must not escape: entry names carry no ..
  const evil = Z.buildZip({ '/../../evil.sh': 'x' });
  assert.equal(evil.fileCount, 1);
});

test('exportProjectZip: runnable index.html or honest error', () => {
  const ok = Z.exportProjectZip({
    files: { '/App.jsx': 'a' },
    overrides: {},
    entry: '/App.jsx',
    buildSrcDoc: () => ({ srcDoc: '<html></html>', entry: '/App.jsx' })
  });
  assert.equal(ok.error, null);
  assert.ok(ok.fileCount >= 2);
  const bad = Z.exportProjectZip({
    files: { '/App.jsx': 'a' },
    overrides: {},
    entry: '/App.jsx',
    buildSrcDoc: () => ({ error: 'boom' })
  });
  assert.ok(bad.error && bad.fileCount >= 1);
});

test('suggestFollowUps: contextual, max 3', () => {
  assert.deepEqual(F.suggestFollowUps({}), []);
  const single = F.suggestFollowUps({ '/App.jsx': 'hero', '/index.css': 'x' });
  assert.ok(single.some((s) => s.id === 'split'));
  assert.ok(single.length <= 3);
  const full = F.suggestFollowUps({
    '/App.jsx': 'pricing testimonials faq footer contact',
    '/components/A.jsx': 'x',
    '/index.css': 'x'
  });
  assert.ok(full.every((s) => s.id !== 'split'));
  assert.ok(full.some((s) => s.id === 'mobile'));
  assert.ok(full.length <= 3);
  const labels = F.suggestFollowUps({ '/App.jsx': 'nothing here', '/index.css': 'x' }).map((s) => s.label);
  assert.ok(labels.includes('Add a pricing section'));
});
