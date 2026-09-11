// Folder ingest pipeline: turn a whole documentation folder into a curriculum
// that covers every document. A corpus is easily 10-100x larger than any
// single prompt (see docs/PROMPT_FOLDER_INGEST.md), so the whole pipeline
// leans on embeddings (fast, batchable, the same mechanism the "add source to
// a unit" flow already relies on) rather than generative calls, wherever a
// generative call isn't strictly needed:
//   map    — heuristicDigest()             heuristic label, no LLM call at all
//                                          (see heuristicDigest for why)
//   reduce — planCourse()                 digests -> curriculum shape (ONE
//                                          LLM call total), then
//                                          document-to-unit mapping by
//                                          embedding the FULL document text
//                                          in chunks and comparing to each
//                                          unit's topic vector
//                                          (assignDocsToUnits) — no LLM call,
//                                          and the LLM never references a
//                                          document by id
//   expand — generateGroundedExplanation() one explanation, grounded in its own unit's sources
import { db, uid } from '../db.js';
import { generate, generateJSON, getActiveProfile, describeImage, embed } from './llm/index.js';
import { curriculumFromDocsPrompt, groundedExplanationPrompt } from './llm/prompts.js';
import { chunk, retrieve, indexSource, embedAll, cosine } from './rag.js';

const SUMMARY_MAX = 600;
const TOPICS_MAX = 8;
// Corpus map competes with the rest of the prompt (instructions + JSON schema)
// for maxInputChars, so it only gets a share of the budget, not the whole thing.
const CORPUS_MAP_BUDGET_RATIO = 0.6;

// ---- pure helpers (unit-tested — see ingest.test.js) -----------------------

function corpusLine(doc) {
  const digest = doc.digest || {};
  const topics = (digest.topics || []).join(', ');
  const summary = digest.summary || '(no summary)';
  return `${doc.filename} — ${summary}${topics ? ` (topics: ${topics})` : ''}`;
}

// Stable "filename — summary (topics: …)" format, one line per doc — the
// compact index the reduce step designs a curriculum shape from (no document
// ids: the LLM never needs to reference a specific document, see planCourse).
// Truncated to maxChars by dropping whole trailing lines and noting how many
// documents were left out — those still get their curriculum spot via
// assignDocsToUnits, which doesn't depend on the corpus map at all.
export function buildCorpusMap(docs, maxChars = Infinity) {
  const lines = docs.map(corpusLine);
  const full = lines.join('\n');
  if (full.length <= maxChars) return full;

  const out = [];
  let len = 0;
  for (const line of lines) {
    const next = len + (out.length ? 1 : 0) + line.length;
    if (next > maxChars) break;
    out.push(line);
    len = next;
  }
  const omitted = lines.length - out.length;
  if (omitted > 0) out.push(`… and ${omitted} more document(s) not shown here (corpus too large for one prompt).`);
  return out.join('\n');
}

export function corpusMapBudget(maxInputChars) {
  return Math.floor(maxInputChars * CORPUS_MAP_BUDGET_RATIO);
}

// Mirrors the ~4MB batching public/js/app.js performs over browser-extracted
// docs before each POST /ingest/docs call. Kept here (and tested) because the
// browser bundle has no test runner in this repo — see ingest.test.js.
export function batchBySize(docs, maxBytes) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const doc of docs) {
    const docSize = (doc.text || doc.imageDataUrl || '').length;
    if (current.length && size + docSize > maxBytes) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(doc);
    size += docSize;
  }
  if (current.length) batches.push(current);
  return batches;
}

// Shape-only validator for the reduce step's response: names all the way
// down, no document ids (those are computed afterwards — see
// assignDocsToUnits). Coverage is guaranteed programmatically, not by
// validating what the LLM claims, so there's nothing to repair-loop on here
// beyond basic structure.
export function validateCurriculumShape(data) {
  if (!Array.isArray(data?.subjects) || !data.subjects.length) return 'missing subjects array';
  for (const s of data.subjects) {
    if (!s?.name) return 'subject missing name';
    if (!Array.isArray(s.units) || !s.units.length) return `subject "${s.name}" missing units array`;
    for (const u of s.units) {
      if (!u?.name) return `subject "${s.name}" has a unit missing a name`;
      if (!Array.isArray(u.explanations) || !u.explanations.length) return `unit "${u.name}" missing explanations array`;
      for (const e of u.explanations) {
        if (!e?.title) return `unit "${u.name}" has an explanation missing a title`;
      }
    }
  }
  return null;
}

const HEADING_RE = /^#{1,3}\s+(.+)$/gm;     // extracting all headings (matchAll)
const HEADING_LINE_RE = /^#{1,3}\s+.+$/;    // testing a single paragraph — no /g, so .test() stays stateless

// Fast, heuristic {title, summary, topics} label for a document's raw text —
// unit-tested (see ingest.test.js), no LLM call at all. Markdown/plain-text
// headings double as topics when present; the first non-empty paragraph
// (with any leading heading marker stripped) stands in for a summary.
//
// This document's digest used to be an LLM call — first one per ~800-char
// chunk (a real technical document is easily 50-100+ chunks, i.e. that many
// *sequential* generative calls against a local model — well over an hour),
// then one call per document over a truncated sample. Neither held up:
// measured against the same local model, one document's single-call digest
// took 2s and another's took 144s for a similarly-sized prompt — latency
// tracks document *content* (how much a reasoning model decides to "think"),
// not how much text is fed to it, so shrinking the prompt further wouldn't
// have fixed it either. The digest only has to label a document well enough
// for the curriculum-shape prompt (see buildCorpusMap); the actual
// document-to-unit coverage guarantee comes from embedding the complete
// document text in chunks (see assignDocsToUnits), which needs no LLM call.
export function heuristicDigest(doc) {
  const text = (doc.text || '').trim();
  if (!text) return { title: doc.filename, summary: '(empty document)', topics: [] };

  const headings = [...text.matchAll(HEADING_RE)].map((m) => m[1].trim()).filter(Boolean);
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  // Skip paragraphs that are just a heading line — a document that opens
  // with "# Title" on its own would otherwise summarize itself as its own
  // title instead of the content that actually follows it.
  const firstPara = paragraphs.find((p) => !HEADING_LINE_RE.test(p)) || paragraphs[0] || text;
  const summary = firstPara.replace(/^#{1,6}\s+/, '').slice(0, SUMMARY_MAX);
  return { title: headings[0] || doc.filename, summary, topics: headings.slice(0, TOPICS_MAX) };
}

// ---- map: insert + digest ---------------------------------------------------

// Inserts a batch of extracted docs into ingest_docs. Image docs are described
// via the active multimodal model first — from then on they're just another
// document (their description becomes their `text`). One doc's failure (no
// multimodal model configured, provider error, …) doesn't sink the batch.
export async function insertIngestDocs(courseId, docs, language) {
  const inserted = [];
  const failed = [];
  for (const doc of docs) {
    try {
      const text = doc.kind === 'image'
        ? await describeImage({ dataUrl: doc.imageDataUrl, mime: doc.mime, filename: doc.filename, language })
        : (doc.text || '');
      const id = uid();
      db.prepare('INSERT INTO ingest_docs (id, course_id, path, filename, mime, kind, text) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, courseId, doc.path, doc.filename, doc.mime || null, doc.kind || 'text', text);
      inserted.push({ id, path: doc.path });
    } catch (e) {
      failed.push({ path: doc.path, error: e.message });
    }
  }
  return { inserted, failed };
}

// ---- reduce: plan ------------------------------------------------------------

// A unit's "topic query" — its name plus its explanation titles — stands in
// for what it's about, to be compared against each document's content.
function unitQueryText(unit) {
  const titles = (unit.explanations || []).map((e) => e.title).join('; ');
  return titles ? `${unit.name}. ${titles}` : unit.name;
}

// One representative vector for a document's FULL text: chunk it exactly
// like indexSource() does for a regular source, embed every chunk (batched,
// no generative call), and average. This is what makes assignment coverage
// independent of the (possibly truncated) digest — even a huge document is
// embedded in its entirety, just cheaply.
export function meanVector(vectors) {
  if (!vectors.length) return null;
  const len = vectors[0].length;
  const sum = new Array(len).fill(0);
  for (const v of vectors) for (let i = 0; i < len; i++) sum[i] += v[i];
  return sum.map((x) => x / vectors.length);
}

async function embedDocument(doc) {
  const pieces = chunk(doc.text || '');
  if (!pieces.length) return null; // nothing to embed (empty/unreadable document)
  return meanVector(await embedAll(pieces));
}

const UNIT_ASSIGN_MARGIN = 0.08; // other units within this much of the top score also get the doc
const UNIT_ASSIGN_MAX = 3;       // cap so a very generic document doesn't flood every unit

// Pure assignment core, given precomputed vectors — no network call, fully
// unit-testable (see ingest.test.js). `unitsWithVec`/`docsWithVec` are
// [{ unit, vector }] / [{ id, vector }]; mutates unit.docIds in place.
// Two-way coverage: every document lands on at least its single best-matching
// unit (this is what makes "every document ends up somewhere" a guarantee
// instead of something an LLM has to get right), and any unit that won no
// document outright still gets its closest one so it always has something to
// ground its explanations in.
export function assignDocsByEmbedding(unitsWithVec, docsWithVec) {
  for (const { unit } of unitsWithVec) unit.docIds = [];
  for (const doc of docsWithVec) {
    const scored = unitsWithVec
      .map(({ unit, vector }) => ({ unit, score: cosine(vector, doc.vector) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0].score;
    for (const { unit, score } of scored.slice(0, UNIT_ASSIGN_MAX)) {
      if (score >= best - UNIT_ASSIGN_MARGIN) unit.docIds.push(doc.id);
    }
  }
  for (const { unit, vector } of unitsWithVec) {
    if (unit.docIds.length) continue;
    const closest = docsWithVec
      .map((d) => ({ id: d.id, score: cosine(vector, d.vector) }))
      .sort((a, b) => b.score - a.score)[0];
    if (closest) unit.docIds.push(closest.id);
  }
}

// Embeds every unit (one batched call) and every document's full text (one
// chunk-embed pass per document, in series — local backends choke on
// concurrent requests, same reasoning as the rest of this pipeline), then
// assigns via cosine similarity. Mutates each unit in `units` with a
// `docIds` array of real ingest_docs ids — replaces the old LLM-emitted
// docIds entirely.
async function assignDocsToUnits(units, docs) {
  if (!units.length || !docs.length) return;
  const unitVectors = await embed(units.map(unitQueryText));
  const unitsWithVec = units.map((unit, i) => ({ unit, vector: unitVectors[i] }));

  const docsWithVec = [];
  for (const doc of docs) {
    const vector = await embedDocument(doc);
    if (vector) docsWithVec.push({ id: doc.id, vector });
  }
  assignDocsByEmbedding(unitsWithVec, docsWithVec);
}

// Reduce step: the LLM designs the curriculum shape (subjects/units/
// explanation titles) from the corpus digests, then every digested document
// is assigned to its best-matching unit(s) by embedding similarity — see
// assignDocsToUnits. `limits` (maxSubjects/maxUnitsPerSubject/
// maxExplanationsPerUnit, all optional) are the course modal's sliders,
// passed through as a soft guideline.
export async function planCourse({ courseId, courseName, limits, language }) {
  const rows = db.prepare("SELECT id, filename, text, digest_json FROM ingest_docs WHERE course_id = ? AND status = 'digested'").all(courseId);
  if (!rows.length) throw new Error('No digested documents to plan from — digest the corpus first.');
  const docs = rows.map((r) => ({ id: r.id, filename: r.filename, text: r.text, digest: JSON.parse(r.digest_json) }));

  const { maxInputChars } = getActiveProfile();
  const corpusMap = buildCorpusMap(docs, corpusMapBudget(maxInputChars));
  const { system, prompt } = curriculumFromDocsPrompt({ courseName, corpusMap, limits, language });
  const data = await generateJSON({ system, prompt, validate: validateCurriculumShape, task: 'ingest-plan' });

  const units = data.subjects.flatMap((s) => s.units);
  await assignDocsToUnits(units, docs);
  return data;
}

// ---- commit: materialize the (possibly user-edited) plan --------------------

// Inserts the plan's subjects/units/explanations (content left empty, same as
// generate-structure) and one `sources` row per unit-docId mapping. Everything
// above runs in one transaction; embeddings are network calls, so indexing
// happens after COMMIT — a missing embedding model degrades to sourcesIndexed:
// false instead of failing the whole commit (the expand step has a fallback).
export async function commitPlan(courseId, plan) {
  const docs = db.prepare('SELECT id, path, filename, mime, text FROM ingest_docs WHERE course_id = ?').all(courseId);
  const docsById = new Map(docs.map((d) => [d.id, d]));

  const subjects = [];
  const explanationIds = [];
  const newSources = []; // [{ sourceId, text }] — indexed after COMMIT

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE courses SET objectives = ? WHERE id = ?').run(plan.objectives || '', courseId);
    for (const s of plan.subjects) {
      const subjectId = uid();
      db.prepare('INSERT INTO subjects (id, course_id, name) VALUES (?, ?, ?)').run(subjectId, courseId, s.name);
      const units = [];
      for (const u of s.units) {
        const unitId = uid();
        db.prepare('INSERT INTO units (id, subject_id, name) VALUES (?, ?, ?)').run(unitId, subjectId, u.name);

        // A document covering several units is duplicated as its own `sources`
        // row in each one (see docs/PROMPT_FOLDER_INGEST.md §3) — simplest option,
        // no schema change, and retrieve()/export/import keep working untouched.
        for (const docId of u.docIds || []) {
          const doc = docsById.get(docId);
          if (!doc) continue;
          const sourceId = uid();
          db.prepare('INSERT INTO sources (id, unit_id, filename, mime, text) VALUES (?, ?, ?, ?, ?)')
            .run(sourceId, unitId, doc.path, doc.mime, doc.text);
          newSources.push({ sourceId, text: doc.text });
        }

        const unitExplanationIds = [];
        for (const e of u.explanations || []) {
          const explanationId = uid();
          db.prepare('INSERT INTO explanations (id, unit_id, prompt, content) VALUES (?, ?, ?, ?)').run(explanationId, unitId, e.title, '');
          unitExplanationIds.push(explanationId);
          explanationIds.push(explanationId);
        }
        units.push({ id: unitId, name: u.name, explanationIds: unitExplanationIds });
      }
      subjects.push({ id: subjectId, name: s.name, units });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  let sourcesIndexed = true;
  let indexError;
  for (const { sourceId, text } of newSources) {
    try { await indexSource(sourceId, text); } catch (e) { sourcesIndexed = false; indexError = e.message; }
  }

  return { subjects, explanationIds, sourcesIndexed, indexError };
}

// ---- expand: one grounded explanation ---------------------------------------

// Writes one explanation strictly from its unit's own sources — retrieve()
// when embeddings are available, otherwise the unit's raw source text
// (truncated to the active model's maxInputChars) as a no-embeddings fallback.
export async function generateGroundedExplanation(explanationId, { language } = {}) {
  const exp = db.prepare(`
    SELECT e.id, e.prompt, e.unit_id, u.name AS unit_name, c.objectives AS course_objectives
    FROM explanations e
    JOIN units u ON u.id = e.unit_id
    JOIN subjects s ON s.id = u.subject_id
    JOIN courses c ON c.id = s.course_id
    WHERE e.id = ?
  `).get(explanationId);
  if (!exp) throw new Error('Explanation not found.');

  let sourceLines;
  const retrieved = await retrieve(exp.unit_id, exp.prompt, 8);
  if (retrieved.length) {
    sourceLines = retrieved.map((r, i) => `[${i + 1}] ${r.filename || 'source'}\n${r.text}`).join('\n\n---\n\n');
  } else {
    const rows = db.prepare('SELECT filename, text FROM sources WHERE unit_id = ?').all(exp.unit_id);
    if (!rows.length) throw new Error('This unit has no sources to ground the explanation in.');
    const { maxInputChars } = getActiveProfile();
    let combined = rows.map((r) => `[${r.filename}]\n${r.text}`).join('\n\n');
    if (combined.length > maxInputChars) combined = combined.slice(0, maxInputChars) + '\n\n[content truncated]';
    sourceLines = `[1] unit sources\n${combined}`;
  }

  const { system, prompt } = groundedExplanationPrompt({
    courseObjectives: exp.course_objectives || '',
    unitName: exp.unit_name,
    title: exp.prompt,
    sources: sourceLines,
    language,
  });
  return generate({ system, prompt });
}
