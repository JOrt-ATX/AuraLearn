// Retrieval-augmented generation helpers: split source text into chunks, embed +
// store them, and retrieve the most relevant chunks for a query via brute-force
// cosine similarity. Brute force is fine at single-user/personal scale — swap to
// sqlite-vec later if a corpus ever grows large.
import { db, uid } from '../db.js';
import { embed } from './llm/index.js';

const CHUNK_SIZE = 800; // target characters per chunk
const OVERLAP = 100;     // characters carried between consecutive chunks

// Split text into ~CHUNK_SIZE-char chunks, preferring paragraph then sentence
// boundaries, carrying ~OVERLAP chars between chunks so context isn't cut mid-thought.
export function chunk(text) {
  const clean = (text || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];

  // Break into atomic pieces on paragraphs, then sentences, then a hard cut.
  const pieces = [];
  for (const para of clean.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= CHUNK_SIZE) { pieces.push(p); continue; }
    for (const sent of p.split(/(?<=[.!?])\s+/)) {
      const s = sent.trim();
      if (!s) continue;
      if (s.length <= CHUNK_SIZE) pieces.push(s);
      else for (let i = 0; i < s.length; i += CHUNK_SIZE - OVERLAP) pieces.push(s.slice(i, i + CHUNK_SIZE));
    }
  }

  // Greedily pack pieces into chunks; seed each new chunk with the tail of the
  // previous one for overlap.
  const chunks = [];
  let buf = '';
  for (const piece of pieces) {
    if (buf && buf.length + 1 + piece.length > CHUNK_SIZE) {
      chunks.push(buf);
      buf = buf.slice(-OVERLAP);
    }
    buf = buf ? `${buf} ${piece}` : piece;
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

// Cosine similarity over two equal-length vectors (guards against length drift
// if the embedding model changed between indexing and querying).
export function cosine(a, b) {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

// Embed in batches so large documents don't blow past provider payload limits.
export async function embedAll(texts, batchSize = 64) {
  const out = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const vecs = await embed(texts.slice(i, i + batchSize));
    out.push(...vecs);
  }
  return out;
}

// Chunk + embed source text and store the chunks. Returns the chunk count.
export async function indexSource(sourceId, text) {
  const parts = chunk(text);
  if (!parts.length) return 0;
  const vectors = await embedAll(parts);
  const insert = db.prepare('INSERT INTO chunks (id, source_id, ord, text, embedding_json) VALUES (?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    parts.forEach((t, i) => insert.run(uid(), sourceId, i, t, JSON.stringify(vectors[i])));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return parts.length;
}

// Chunk + embed an explanation's content so chat (RAG) can retrieve and cite it,
// same as a manually added source. Replaces any previously indexed chunks for
// this explanation (called again on every content edit/regenerate).
export async function indexExplanation(explanationId, text) {
  db.prepare('DELETE FROM explanation_chunks WHERE explanation_id = ?').run(explanationId);
  const parts = chunk(text);
  if (!parts.length) return 0;
  const vectors = await embedAll(parts);
  const insert = db.prepare('INSERT INTO explanation_chunks (id, explanation_id, ord, text, embedding_json) VALUES (?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    parts.forEach((t, i) => insert.run(uid(), explanationId, i, t, JSON.stringify(vectors[i])));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return parts.length;
}

// One-time-per-explanation backfill: index any explanation that has content but
// isn't indexed yet — e.g. created before chat-RAG covered explanations, or
// whose indexing failed at creation time (no embedding model configured then).
// Safe to call on every server start: the NOT EXISTS check makes it a no-op
// once everything is caught up.
export async function backfillExplanationIndex() {
  const rows = db.prepare(`
    SELECT e.id, e.content FROM explanations e
    WHERE trim(e.content) <> ''
      AND NOT EXISTS (SELECT 1 FROM explanation_chunks ec WHERE ec.explanation_id = e.id)
  `).all();
  if (!rows.length) return;
  console.log(`[rag] backfilling ${rows.length} unindexed explanation(s) for chat...`);
  for (const row of rows) {
    try {
      await indexExplanation(row.id, row.content);
    } catch (e) {
      console.error(`[rag] backfill failed for explanation ${row.id}:`, e.message);
    }
  }
  console.log('[rag] explanation backfill complete.');
}

// Embed a note's text (anchor fragment + content, when anchored) and store the
// embedding directly on its row — notes are short, so unlike sources/explanations
// they aren't split into chunks. Called after every create/edit.
export async function indexNote(noteId, content, anchorText) {
  const text = anchorText ? `${anchorText}\n\n${content}` : content;
  const [vector] = await embedAll([text]);
  db.prepare('UPDATE notes SET embedding_json = ? WHERE id = ?').run(JSON.stringify(vector), noteId);
}

// Same idea as backfillExplanationIndex, but for notes (covers ones imported
// from a zip, which keep embedding_json NULL — see exportImport.js).
export async function backfillNoteIndex() {
  const rows = db.prepare("SELECT id, content, anchor_text FROM notes WHERE embedding_json IS NULL AND trim(content) <> ''").all();
  if (!rows.length) return;
  console.log(`[rag] backfilling ${rows.length} unindexed note(s) for chat...`);
  for (const row of rows) {
    try {
      await indexNote(row.id, row.content, row.anchor_text);
    } catch (e) {
      console.error(`[rag] backfill failed for note ${row.id}:`, e.message);
    }
  }
  console.log('[rag] note backfill complete.');
}

// Embed the query and return the top-k most similar chunks across all of a unit's
// sources, its own explanations, AND its notes: [{ text, ord, sourceId, filename, kind, score }].
export async function retrieve(unitId, query, k = 6) {
  const sourceRows = db.prepare(`
    SELECT c.text AS text, c.ord AS ord, c.embedding_json AS embedding_json,
           s.id AS ref_id, s.filename AS filename
    FROM chunks c JOIN sources s ON s.id = c.source_id
    WHERE s.unit_id = ?
  `).all(unitId);
  const explanationRows = db.prepare(`
    SELECT ec.text AS text, ec.ord AS ord, ec.embedding_json AS embedding_json,
           e.id AS ref_id, e.prompt AS filename
    FROM explanation_chunks ec JOIN explanations e ON e.id = ec.explanation_id
    WHERE e.unit_id = ?
  `).all(unitId);
  const noteRows = db.prepare(`
    SELECT n.content AS text, 0 AS ord, n.embedding_json AS embedding_json,
           n.id AS ref_id, e.prompt AS filename
    FROM notes n JOIN explanations e ON e.id = n.explanation_id
    WHERE e.unit_id = ? AND n.embedding_json IS NOT NULL
  `).all(unitId);
  const rows = [
    ...sourceRows.map((r) => ({ ...r, kind: 'source' })),
    ...explanationRows.map((r) => ({ ...r, kind: 'explanation' })),
    ...noteRows.map((r) => ({ ...r, kind: 'note' })),
  ];
  if (!rows.length) return [];

  const [qv] = await embed([query]);
  const scored = rows.map((r) => ({
    text: r.text,
    ord: r.ord,
    sourceId: r.ref_id,
    filename: r.filename,
    kind: r.kind,
    score: cosine(qv, JSON.parse(r.embedding_json)),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
