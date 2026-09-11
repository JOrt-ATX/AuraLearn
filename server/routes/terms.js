// Quick term explanations — caches "explain this selection" results per
// (explanation, term) so re-opening a previously asked term is instant and
// costs no further LLM calls.
import { Router } from 'express';
import { db, uid } from '../db.js';
import { generate, getActiveProfile } from '../services/llm/index.js';
import { quickExplainPrompt } from '../services/llm/prompts.js';

const router = Router();

const toPublic = (r) => ({ id: r.id, explanationId: r.explanation_id, term: r.term, content: r.content });

router.get('/explanations/:id/terms', (req, res) => {
  const rows = db.prepare('SELECT * FROM term_explanations WHERE explanation_id = ? ORDER BY created_at').all(req.params.id);
  res.json(rows.map(toPublic));
});

router.post('/explanations/:id/terms', async (req, res) => {
  const { id } = req.params;
  const term = (req.body.term || '').trim();
  const aiLanguage = req.body.aiLanguage;
  if (!term) return res.status(400).json({ error: 'term required' });

  const explanation = db.prepare('SELECT content FROM explanations WHERE id = ?').get(id);
  if (!explanation) return res.status(404).json({ error: 'Explanation not found.' });

  const cached = db.prepare('SELECT * FROM term_explanations WHERE explanation_id = ? AND term = ? COLLATE NOCASE').get(id, term);
  if (cached) return res.json(toPublic(cached));

  try {
    const { maxInputChars } = getActiveProfile();
    const context = explanation.content.length > maxInputChars ? explanation.content.slice(0, maxInputChars) : explanation.content;
    const { system, prompt } = quickExplainPrompt({ term, context, language: aiLanguage });
    const content = (await generate({ system, prompt })).trim();
    if (!content) throw new Error('The AI returned no content.');

    const rowId = uid();
    db.prepare('INSERT INTO term_explanations (id, explanation_id, term, content) VALUES (?, ?, ?, ?)').run(rowId, id, term, content);
    res.json({ id: rowId, explanationId: id, term, content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/terms/:id', (req, res) => {
  db.prepare('DELETE FROM term_explanations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
