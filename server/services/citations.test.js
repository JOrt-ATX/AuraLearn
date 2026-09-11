// Unit tests for citation classification. Run with:
//   node --disable-warning=ExperimentalWarning --test server/services/citations.test.js
// Uses a throwaway DB path so importing citations.js (→ llm/index.js → db.js) never
// touches real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DB_PATH = join(tmpdir(), `aura-citations-test-${process.pid}.db`);
const { classify } = await import('./citations.js');

test('classify: recognises YouTube/Vimeo links as video', () => {
  assert.equal(classify('https://www.youtube.com/watch?v=abc'), 'video');
  assert.equal(classify('https://youtu.be/abc'), 'video');
  assert.equal(classify('https://vimeo.com/12345'), 'video');
});

test('classify: everything else is an article', () => {
  assert.equal(classify('https://en.wikipedia.org/wiki/Photosynthesis'), 'article');
  assert.equal(classify('https://example.com'), 'article');
});
