// Unit tests for the pure folder-ingest logic (no LLM calls). Run with:
//   node --disable-warning=ExperimentalWarning --test server/services/ingest.test.js
// Uses a throwaway DB path so importing ingest.js (→ db.js) never touches real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DB_PATH = join(tmpdir(), `aura-ingest-test-${process.pid}.db`);
const { validateCurriculumShape, buildCorpusMap, batchBySize, assignDocsByEmbedding, meanVector, heuristicDigest } = await import('./ingest.js');

// ---- heuristicDigest ------------------------------------------------------------
// No LLM call: a fast {title, summary, topics} label derived straight from a
// document's raw text (see ingest.js for why the old LLM-based digest got
// dropped — its latency tracked content, not size, and could take minutes).

test('heuristicDigest: pulls headings as topics and the first paragraph as summary', () => {
  const doc = {
    filename: 'guide.md',
    text: '# Getting Started\n\nThis guide covers installation and setup.\n\n## Installation\n\nRun npm install.',
  };
  const d = heuristicDigest(doc);
  assert.equal(d.title, 'Getting Started'); // first heading wins as title
  assert.equal(d.summary, 'This guide covers installation and setup.');
  assert.deepEqual(d.topics, ['Getting Started', 'Installation']);
});

test('heuristicDigest: falls back to filename + first paragraph when there are no headings', () => {
  const doc = { filename: 'notes.txt', text: 'Plain notes with no markdown structure at all.' };
  const d = heuristicDigest(doc);
  assert.equal(d.title, 'notes.txt');
  assert.equal(d.summary, 'Plain notes with no markdown structure at all.');
  assert.deepEqual(d.topics, []);
});

test('heuristicDigest: truncates an overlong first paragraph to 600 chars', () => {
  const doc = { filename: 'wall.txt', text: 'A'.repeat(1000) };
  assert.equal(heuristicDigest(doc).summary.length, 600);
});

test('heuristicDigest: caps topics at 8 even with many headings', () => {
  const text = Array.from({ length: 20 }, (_, i) => `# Heading ${i}`).join('\n\n');
  assert.equal(heuristicDigest({ filename: 'many.md', text }).topics.length, 8);
});

test('heuristicDigest: empty document gets a placeholder summary', () => {
  const d = heuristicDigest({ filename: 'blank.txt', text: '   ' });
  assert.equal(d.title, 'blank.txt');
  assert.equal(d.summary, '(empty document)');
  assert.deepEqual(d.topics, []);
});

// ---- validateCurriculumShape ---------------------------------------------------
// The reduce step's response is names all the way down — no document ids to
// validate (those are computed afterwards by embedding similarity), so this
// only has to check basic structure.

const goodShape = {
  subjects: [{
    name: 'Subject 1',
    units: [{ name: 'Unit 1', explanations: [{ title: 'Topic A' }, { title: 'Topic B' }] }],
  }],
};

test('validateCurriculumShape: accepts a well-formed shape', () => {
  assert.equal(validateCurriculumShape(goodShape), null);
});

test('validateCurriculumShape: rejects malformed shapes', () => {
  assert.match(validateCurriculumShape({}), /missing subjects array/);
  assert.match(validateCurriculumShape({ subjects: [{ units: [] }] }), /subject missing name/);
  assert.match(validateCurriculumShape({ subjects: [{ name: 'S', units: [] }] }), /missing units array/);
  assert.match(validateCurriculumShape({ subjects: [{ name: 'S', units: [{ name: 'U', explanations: [] }] }] }), /missing explanations array/);
  assert.match(validateCurriculumShape({ subjects: [{ name: 'S', units: [{ name: 'U', explanations: [{}] }] }] }), /missing a title/);
});

// ---- meanVector -----------------------------------------------------------------
// Turns a document's per-chunk embeddings into one representative vector for
// assignDocsToUnits — element-wise mean.

test('meanVector: averages equal-length vectors element-wise', () => {
  assert.deepEqual(meanVector([[1, 0], [0, 1], [2, 2]]), [1, 1]);
});

test('meanVector: a single vector passes through unchanged', () => {
  assert.deepEqual(meanVector([[3, 4]]), [3, 4]);
});

test('meanVector: empty input yields null (nothing to embed)', () => {
  assert.equal(meanVector([]), null);
});

// ---- buildCorpusMap -----------------------------------------------------------

function doc(id, filename, summary, topics = []) {
  return { id, filename, digest: { summary, topics } };
}

test('buildCorpusMap: stable one-line-per-document format', () => {
  const map = buildCorpusMap([doc('d1', 'a.pdf', 'Covers inertia.', ['physics', 'motion'])]);
  assert.equal(map, 'a.pdf — Covers inertia. (topics: physics, motion)');
});

test('buildCorpusMap: omits the topics parenthetical when there are none', () => {
  const map = buildCorpusMap([doc('d1', 'a.pdf', 'Covers inertia.')]);
  assert.equal(map, 'a.pdf — Covers inertia.');
});

test('buildCorpusMap: fits fully under a generous budget, no truncation note', () => {
  const docs = [doc('d1', 'a.pdf', 'Summary A'), doc('d2', 'b.pdf', 'Summary B')];
  const map = buildCorpusMap(docs, 10_000);
  assert.equal(map.split('\n').length, 2);
  assert.doesNotMatch(map, /more document/);
});

test('buildCorpusMap: truncates whole trailing lines (never mid-line) once over budget', () => {
  const docs = Array.from({ length: 20 }, (_, i) => doc(`d${i}`, `file${i}.pdf`, 'A reasonably long summary line for budgeting purposes.'));
  const full = buildCorpusMap(docs, Infinity);
  const truncated = buildCorpusMap(docs, 300);
  assert.ok(truncated.length <= 300 + 100, 'truncated map should stay close to the requested budget');
  assert.ok(truncated.length < full.length, 'truncated map must be shorter than the full map');
  assert.match(truncated, /more document\(s\) not shown here/);
  // Every kept line must be one of the original, untouched lines — no mid-line cuts.
  const keptLines = truncated.split('\n').slice(0, -1);
  const fullLines = full.split('\n');
  for (const line of keptLines) assert.ok(fullLines.includes(line), `unexpected/truncated line: ${line}`);
});

// ---- assignDocsByEmbedding ------------------------------------------------------
// Replaces the old LLM-emitted docIds entirely: given precomputed unit/doc
// vectors, assigns each document to its best-matching unit(s) by cosine
// similarity. Pure — no embed() call — so it's testable with plain 2D vectors
// standing in for real embeddings (orthogonal axes = "unrelated topics").

function withVec(unit, vector) { return { unit, vector }; }

test('assignDocsByEmbedding: assigns each document to its single closest unit', () => {
  const unitA = { name: 'A', docIds: [] };
  const unitB = { name: 'B', docIds: [] };
  const units = [withVec(unitA, [1, 0]), withVec(unitB, [0, 1])];
  const docs = [{ id: 'docA', vector: [1, 0] }, { id: 'docB', vector: [0, 1] }];
  assignDocsByEmbedding(units, docs);
  assert.deepEqual(unitA.docIds, ['docA']);
  assert.deepEqual(unitB.docIds, ['docB']);
});

test('assignDocsByEmbedding: a document within the margin of two units is assigned to both', () => {
  const unitA = { name: 'A', docIds: [] };
  const unitB = { name: 'B', docIds: [] };
  // ~0.05 apart in cosine space — inside the 0.08 margin, so both should win.
  const units = [withVec(unitA, [1, 0]), withVec(unitB, [0.99, 0.14])];
  const docs = [{ id: 'docA', vector: [1, 0] }];
  assignDocsByEmbedding(units, docs);
  assert.deepEqual(unitA.docIds, ['docA']);
  assert.deepEqual(unitB.docIds, ['docA']);
});

test('assignDocsByEmbedding: every document ends up assigned somewhere (full coverage)', () => {
  const unitA = { name: 'A', docIds: [] };
  const units = [withVec(unitA, [1, 0])];
  const docs = [{ id: 'd1', vector: [1, 0] }, { id: 'd2', vector: [0, 1] }, { id: 'd3', vector: [-1, 0] }];
  assignDocsByEmbedding(units, docs);
  // Only one unit exists, so every document — however unrelated — lands on it.
  assert.deepEqual(unitA.docIds.sort(), ['d1', 'd2', 'd3']);
});

test('assignDocsByEmbedding: a unit that wins no document outright still gets its closest one', () => {
  const unitA = { name: 'A', docIds: [] };
  const unitB = { name: 'B (niche)', docIds: [] };
  // Every document is closer to A than to B, so B would otherwise end up empty.
  const units = [withVec(unitA, [1, 0]), withVec(unitB, [0, 1])];
  const docs = [{ id: 'd1', vector: [0.9, 0.1] }, { id: 'd2', vector: [0.8, 0.2] }];
  assignDocsByEmbedding(units, docs);
  assert.ok(unitB.docIds.length > 0, 'every unit must ground at least one document');
});

// ---- batchBySize --------------------------------------------------------------

test('batchBySize: groups docs into batches under the byte cap', () => {
  const docs = [
    { path: 'a', text: 'x'.repeat(40) },
    { path: 'b', text: 'x'.repeat(40) },
    { path: 'c', text: 'x'.repeat(40) },
  ];
  const batches = batchBySize(docs, 50);
  // Each doc alone (40) fits under 50, but two together (80) don't.
  assert.deepEqual(batches.map((b) => b.length), [1, 1, 1]);
});

test('batchBySize: packs multiple small docs into one batch when they fit', () => {
  const docs = Array.from({ length: 5 }, (_, i) => ({ path: `d${i}`, text: 'x'.repeat(10) }));
  const batches = batchBySize(docs, 1000);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 5);
});

test('batchBySize: a single oversized doc still gets its own batch (never dropped)', () => {
  const docs = [{ path: 'huge', text: 'x'.repeat(1000) }, { path: 'small', text: 'x'.repeat(10) }];
  const batches = batchBySize(docs, 50);
  assert.equal(batches.length, 2);
  assert.equal(batches[0][0].path, 'huge');
});

test('batchBySize: uses imageDataUrl length when a doc has no text', () => {
  const docs = [{ path: 'img', imageDataUrl: 'x'.repeat(100) }];
  const batches = batchBySize(docs, 1000);
  assert.equal(batches.length, 1);
});

test('batchBySize: empty input yields no batches', () => {
  assert.deepEqual(batchBySize([], 1000), []);
});
