import { test } from 'node:test';
import assert from 'node:assert/strict';

const F = await import('../src/lib/files.js');
const L = await import('../src/lib/llm.js');

const SEL_A = 'body > div:nth-of-type(1)';
const SEL_B = 'body > div:nth-of-type(2)';

test('patch array parses to {patches} (fenced + raw)', () => {
  const arr = JSON.stringify([
    { selector: SEL_A, css: { color: 'red' } },
    { selector: SEL_B, text: 'hi' }
  ]);
  const fenced = F.parsePatchFromText('Brightened.\n```patch\n' + arr + '\n```');
  assert.ok(Array.isArray(fenced.patches) && fenced.patches.length === 2);
  assert.equal(fenced.patches[0].selector, SEL_A);
  const raw = F.parsePatchFromText('note ' + arr + ' end');
  assert.ok(Array.isArray(raw.patches) && raw.patches.length === 2);
});

test('patch single object still returns {css,text}', () => {
  const p = F.parsePatchFromText('```patch\n{"css": {"color": "red"}}\n```');
  assert.deepEqual(p.css, { color: 'red' });
  assert.ok(!('patches' in p));
});

test('patch array capped at MAX_PATCHES', () => {
  const arr = JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ selector: SEL_A, css: { zIndex: i } })));
  const p = F.parsePatchFromText('```patch\n' + arr + '\n```');
  assert.equal(p.patches.length, F.MAX_PATCHES);
});

test('matchPatches: unknown/empty/over-cap skipped, rest applied', () => {
  const { apply, skipped } = F.matchPatches(
    [
      { selector: SEL_A, css: { color: 'red' } },
      { selector: 'body > nope', css: { color: 'blue' } },
      { css: null, text: null },
      { selector: null, text: 'pinned text' }
    ],
    [SEL_A]
  );
  assert.equal(apply.length, 2);
  assert.ok(apply[1].selector === null);
  assert.equal(skipped.length, 2);
  assert.ok(skipped.some((s) => s.reason === 'unknown selector'));
  assert.ok(skipped.some((s) => s.reason.startsWith('empty')));
  const many = Array.from({ length: 20 }, () => ({ selector: SEL_A, css: { a: 'b' } }));
  const m2 = F.matchPatches(many, [SEL_A]);
  assert.equal(m2.apply.length, F.MAX_PATCHES);
  assert.ok(m2.skipped.some((s) => s.reason.startsWith('over cap')));
});

test('condenseLayers caps nodes and chars, collects selectors', () => {
  const mk = (i) => ({ tag: 'div', text: 'text number ' + i, selector: 'body > div:nth-of-type(' + i + ')', kids: [] });
  const tree = Array.from({ length: 100 }, (_, i) => mk(i + 1));
  const { text, selectors, count } = F.condenseLayers(tree, 3000, 40);
  assert.ok(count <= 40);
  assert.ok(text.length <= 3000);
  assert.ok(selectors.length === count && selectors[0].includes('nth-of-type(1)'));
  assert.deepEqual(F.condenseLayers([], 10, 10), { text: '', selectors: [], count: 0 });
  const nested = [{ tag: 'main', text: '', selector: 'body > main', kids: [mk(1)] }];
  assert.equal(F.condenseLayers(nested).count, 2);
});

test('patch prompt carries layer context + array rules', () => {
  const sys = L.buildPatchSystemPrompt({
    selection: { tag: 'div', text: 'x', className: '' },
    files: {},
    skills: [],
    layersText: 'div | "hi" | ' + SEL_A
  });
  assert.ok(sys.includes('VISIBLE LAYERS (tag'));
  assert.ok(sys.includes(SEL_A));
  assert.ok(sys.includes('ARRAY'));
  const plain = L.buildPatchSystemPrompt({ selection: { tag: 'div' }, files: {}, skills: [] });
  assert.ok(!plain.includes('VISIBLE LAYERS (tag'));
});
