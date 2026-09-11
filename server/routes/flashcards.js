// Flashcards + spaced repetition (R2). Cards are auto-generated from a unit's
// explanations (or added manually) and reviewed on an SM-2 schedule.
import { Router } from 'express';
import { db, uid } from '../db.js';
import { generateJSON, getActiveProfile } from '../services/llm/index.js';
import { flashcardsPrompt } from '../services/llm/prompts.js';
import { review, GRADES } from '../services/srs.js';

const router = Router();

const toPublic = (c) => ({
  id: c.id,
  unitId: c.unit_id,
  front: c.front,
  back: c.back,
  dueAt: c.due_at,
  interval: c.interval,
  ease: c.ease,
  reps: c.reps,
});

// List all cards for a unit.
router.get('/units/:unitId/flashcards', (req, res) => {
  const rows = db.prepare('SELECT * FROM flashcards WHERE unit_id = ? ORDER BY rowid').all(req.params.unitId);
  res.json(rows.map(toPublic));
});

// List only the cards due now (due_at <= now).
router.get('/units/:unitId/flashcards/due', (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const rows = db.prepare('SELECT * FROM flashcards WHERE unit_id = ? AND due_at <= ? ORDER BY due_at, rowid')
    .all(req.params.unitId, now);
  res.json(rows.map(toPublic));
});

// Generate cards from the unit's explanations via the active LLM.
// Optional body.explanationIds filters which explanations to use; omit (or send empty) for all.
router.post('/units/:unitId/flashcards/generate', async (req, res) => {
  const { unitId } = req.params;
  const count = Math.min(Math.max(Number(req.body.count) || 10, 1), 30);
  const { aiLanguage, explanationIds } = req.body;

  let explanations;
  if (Array.isArray(explanationIds) && explanationIds.length) {
    const ph = explanationIds.map(() => '?').join(',');
    explanations = db.prepare(
      `SELECT prompt, content FROM explanations WHERE unit_id = ? AND id IN (${ph}) ORDER BY created_at`
    ).all(unitId, ...explanationIds);
  } else {
    explanations = db.prepare('SELECT prompt, content FROM explanations WHERE unit_id = ? ORDER BY created_at').all(unitId);
  }
  if (!explanations.length) return res.status(400).json({ error: 'Add at least one explanation before generating flashcards.' });

  const rawMaterial = explanations.map((e) => `## ${e.prompt}\n${e.content}`).join('\n\n---\n\n');
  const { maxInputChars } = getActiveProfile();
  const material = rawMaterial.length > maxInputChars
    ? rawMaterial.slice(0, maxInputChars) + '\n\n[content truncated]'
    : rawMaterial;
  const { system, prompt } = flashcardsPrompt({ material, count, language: aiLanguage });

  try {
    const data = await generateJSON({ system, prompt, validate: (d) => (Array.isArray(d?.cards) && d.cards.length ? null : 'missing cards array'), task: 'flashcards' });
    const cards = (data?.cards || [])
      .filter((c) => c && c.front && c.back)
      .map((c) => ({ front: String(c.front).trim(), back: String(c.back).trim() }));
    if (!cards.length) throw new Error('The AI returned no cards.');

    const insert = db.prepare('INSERT INTO flashcards (id, unit_id, front, back) VALUES (?, ?, ?, ?)');
    const ids = [];
    db.exec('BEGIN');
    try {
      for (const c of cards) { const id = uid(); insert.run(id, unitId, c.front, c.back); ids.push(id); }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }

    const rows = db.prepare(`SELECT * FROM flashcards WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    const byId = new Map(rows.map((r) => [r.id, r]));
    res.json(ids.map((id) => toPublic(byId.get(id))));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Manual add.
router.post('/units/:unitId/flashcards', (req, res) => {
  const front = (req.body.front || '').trim();
  const back = (req.body.back || '').trim();
  if (!front || !back) return res.status(400).json({ error: 'front and back are required' });
  const id = uid();
  db.prepare('INSERT INTO flashcards (id, unit_id, front, back) VALUES (?, ?, ?, ?)').run(id, req.params.unitId, front, back);
  res.json(toPublic(db.prepare('SELECT * FROM flashcards WHERE id = ?').get(id)));
});

// Review a card: applies SM-2 and reschedules.
router.post('/flashcards/:id/review', (req, res) => {
  const card = db.prepare('SELECT * FROM flashcards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'not found' });
  if (!GRADES.includes(req.body.grade)) return res.status(400).json({ error: `grade must be one of ${GRADES.join(', ')}` });

  const next = review({ ease: card.ease, interval: card.interval, reps: card.reps }, req.body.grade);
  db.prepare('UPDATE flashcards SET ease = ?, interval = ?, reps = ?, due_at = ? WHERE id = ?')
    .run(next.ease, next.interval, next.reps, next.dueAt, card.id);
  res.json(toPublic(db.prepare('SELECT * FROM flashcards WHERE id = ?').get(card.id)));
});

// Manual edit.
router.put('/flashcards/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM flashcards WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const front = req.body.front != null ? String(req.body.front).trim() : cur.front;
  const back = req.body.back != null ? String(req.body.back).trim() : cur.back;
  db.prepare('UPDATE flashcards SET front = ?, back = ? WHERE id = ?').run(front, back, req.params.id);
  res.json(toPublic(db.prepare('SELECT * FROM flashcards WHERE id = ?').get(req.params.id)));
});

router.delete('/flashcards/:id', (req, res) => {
  db.prepare('DELETE FROM flashcards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
