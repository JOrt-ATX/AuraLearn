// Unit tests for the pure RAG logic (chunking + cosine). Run with:
//   node --disable-warning=ExperimentalWarning --test server/services/rag.test.js
// Uses a throwaway DB path so importing rag.js (→ db.js) never touches real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DB_PATH = join(tmpdir(), `aura-rag-test-${process.pid}.db`);
const { chunk, cosine } = await import('./rag.js');

test('chunk: empty / whitespace input yields no chunks', () => {
  assert.deepEqual(chunk(''), []);
  assert.deepEqual(chunk('   \n\n  '), []);
});

test('chunk: short text stays a single chunk', () => {
  const out = chunk('A short sentence about inertia.');
  assert.equal(out.length, 1);
  assert.match(out[0], /inertia/);
});

test('chunk: long text splits into multiple bounded chunks', () => {
  const para = 'Newton studied motion. '.repeat(120); // ~2760 chars
  const out = chunk(para);
  assert.ok(out.length > 1, 'should split into multiple chunks');
  // No chunk should be wildly over the target (allow slack for overlap seeding).
  for (const c of out) assert.ok(c.length <= 1000, `chunk too long: ${c.length}`);
});

test('chunk: consecutive chunks share overlap', () => {
  const out = chunk('Sentence number one. '.repeat(100));
  assert.ok(out.length >= 2);
  const tail = out[0].slice(-40);
  assert.ok(out[1].startsWith(tail.slice(0, 20)) || out[1].includes(tail.slice(0, 20)),
    'second chunk should begin with the tail of the first');
});

test('cosine: identical vectors → 1, orthogonal → 0, opposite → -1', () => {
  assert.equal(cosine([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([1, 0], [-1, 0]), -1);
});

test('cosine: handles zero vector and length drift without NaN', () => {
  assert.equal(cosine([0, 0], [1, 1]), 0);
  const v = cosine([1, 2, 3], [1, 2]); // mismatched lengths
  assert.ok(Number.isFinite(v));
});
