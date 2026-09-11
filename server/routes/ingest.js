// Folder ingest: builds a whole course from a documentation folder via a
// resumable, granular map-reduce-expand pipeline (see
// docs/PROMPT_FOLDER_INGEST.md). The client orchestrates the loops — one call
// per document/explanation — so progress is visible and one failure doesn't
// sink the rest; no background jobs, SSE or websockets involved.
import { Router } from 'express';
import { db } from '../db.js';
import { indexExplanation } from '../services/rag.js';
import { insertIngestDocs, heuristicDigest, planCourse, commitPlan, generateGroundedExplanation } from '../services/ingest.js';

const router = Router();

router.post('/courses/:id/ingest/docs', async (req, res) => {
  const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'course not found' });
  const { docs, aiLanguage } = req.body;
  if (!Array.isArray(docs) || !docs.length) return res.status(400).json({ error: 'docs array required' });
  try {
    res.json(await insertIngestDocs(req.params.id, docs, aiLanguage));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Digests one document. Idempotent — a doc already `digested` short-circuits.
// No LLM call involved (see heuristicDigest), so this is effectively
// instantaneous, but the endpoint stays granular/per-document like the rest
// of the pipeline for consistency with the client's resumable loop.
router.post('/ingest/docs/:docId/digest', (req, res) => {
  const doc = db.prepare('SELECT * FROM ingest_docs WHERE id = ?').get(req.params.docId);
  if (!doc) return res.status(404).json({ error: 'document not found' });
  if (doc.status === 'digested') return res.json({ ok: true, digest: JSON.parse(doc.digest_json) });
  try {
    const digest = heuristicDigest(doc);
    db.prepare("UPDATE ingest_docs SET digest_json = ?, status = 'digested', error = NULL WHERE id = ?").run(JSON.stringify(digest), doc.id);
    res.json({ ok: true, digest });
  } catch (e) {
    db.prepare("UPDATE ingest_docs SET status = 'failed', error = ? WHERE id = ?").run(e.message, doc.id);
    res.json({ ok: false, error: e.message }); // 200 — a bad doc must not stop the client's digest loop
  }
});

// Reduce step. Persists nothing — the client shows this as a preview the user
// can edit (uncheck units/explanations) before commit.
router.post('/courses/:id/ingest/plan', async (req, res) => {
  const course = db.prepare('SELECT id, name FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'course not found' });
  try {
    res.json(await planCourse({ courseId: req.params.id, courseName: course.name, limits: req.body.limits, language: req.body.aiLanguage }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/courses/:id/ingest/commit', async (req, res) => {
  const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'course not found' });
  const { plan } = req.body;
  if (!plan || !Array.isArray(plan.subjects) || !plan.subjects.length) return res.status(400).json({ error: 'plan with subjects required' });
  try {
    res.json(await commitPlan(req.params.id, plan));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Expand step for one explanation. Also used outside the folder-ingest flow —
// see the "Regenerate" button in app.js, which prefers this endpoint whenever
// the unit already has sources.
router.post('/explanations/:id/generate-grounded', async (req, res) => {
  const exp = db.prepare('SELECT id FROM explanations WHERE id = ?').get(req.params.id);
  if (!exp) return res.status(404).json({ error: 'explanation not found' });
  try {
    const content = await generateGroundedExplanation(req.params.id, { language: req.body.aiLanguage });
    db.prepare('UPDATE explanations SET content = ? WHERE id = ?').run(content, req.params.id);
    try { await indexExplanation(req.params.id, content); } catch (e) { console.error('[ingest] indexing failed', e.message); }
    res.json({ ok: true, content });
  } catch (e) {
    res.json({ ok: false, error: e.message }); // 200 — keeps the client's per-explanation loop going
  }
});

export default router;
