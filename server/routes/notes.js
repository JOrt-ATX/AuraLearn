// User notes attached to an explanation — free-form annotations shown as chips
// at the end of the explanation, optionally anchored to a selected text fragment
// and tagged with a quick label. Indexed (lazily, like explanations) so chat RAG
// can cite them — see services/rag.js indexNote().
import { Router } from 'express';
import { db, uid } from '../db.js';
import { indexNote } from '../services/rag.js';

const router = Router();

const toPublic = (r) => ({ id: r.id, explanationId: r.explanation_id, content: r.content, anchorText: r.anchor_text, label: r.label, createdAt: r.created_at });

router.get('/explanations/:id/notes', (req, res) => {
  const rows = db.prepare('SELECT * FROM notes WHERE explanation_id = ? ORDER BY created_at').all(req.params.id);
  res.json(rows.map(toPublic));
});

router.post('/explanations/:id/notes', (req, res) => {
  const { id } = req.params;
  const content = (req.body.content || '').trim();
  const anchorText = req.body.anchorText || null;
  const label = req.body.label || null;
  if (!content) return res.status(400).json({ error: 'content required' });

  const explanation = db.prepare('SELECT id FROM explanations WHERE id = ?').get(id);
  if (!explanation) return res.status(404).json({ error: 'Explanation not found.' });

  const rowId = uid();
  db.prepare('INSERT INTO notes (id, explanation_id, content, anchor_text, label) VALUES (?, ?, ?, ?, ?)').run(rowId, id, content, anchorText, label);
  // Don't make the user wait on the embedding call — a note should feel instant,
  // unlike an explanation (which already takes seconds to generate). Index in
  // the background; backfillNoteIndex() catches it on the next server start if
  // this fails outright.
  indexNote(rowId, content, anchorText).catch((e) => console.error('[notes] indexing failed', e.message));
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(rowId);
  res.json(toPublic(row));
});

router.put('/notes/:id', (req, res) => {
  const { id } = req.params;
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Note not found.' });

  const content = req.body.content != null ? req.body.content.trim() : row.content;
  const anchorText = req.body.anchorText !== undefined ? req.body.anchorText : row.anchor_text;
  const label = req.body.label !== undefined ? req.body.label : row.label;
  if (!content) return res.status(400).json({ error: 'content required' });

  db.prepare('UPDATE notes SET content = ?, anchor_text = ?, label = ? WHERE id = ?').run(content, anchorText, label, id);
  indexNote(id, content, anchorText).catch((e) => console.error('[notes] re-indexing failed', e.message));
  const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  res.json(toPublic(updated));
});

router.delete('/notes/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
