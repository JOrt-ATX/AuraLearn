// Source-grounded chat (R1 / RAG). Retrieves the most relevant chunks for the
// user's message, asks the active LLM to answer ONLY from those sources with
// inline [n] citations, and persists the conversation. Messages are ordered by
// rowid (insertion order) since several can share the same unixepoch() second.
import { Router } from 'express';
import { db, uid } from '../db.js';
import { retrieve } from '../services/rag.js';
import { generate } from '../services/llm/index.js';
import { chatSystem } from '../services/llm/prompts.js';

const router = Router();

const toPublic = (m) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  citations: m.citations_json ? JSON.parse(m.citations_json) : [],
  createdAt: m.created_at,
});

router.get('/units/:unitId/chat', (req, res) => {
  const rows = db.prepare('SELECT * FROM chat_messages WHERE unit_id = ? ORDER BY rowid').all(req.params.unitId);
  res.json(rows.map(toPublic));
});

router.delete('/units/:unitId/chat', (req, res) => {
  db.prepare('DELETE FROM chat_messages WHERE unit_id = ?').run(req.params.unitId);
  res.json({ ok: true });
});

router.post('/units/:unitId/chat', async (req, res) => {
  const { unitId } = req.params;
  const message = (req.body.message || '').trim();
  const aiLanguage = req.body.aiLanguage; // optional, mirrors the UI's AI-language setting
  if (!message) return res.status(400).json({ error: 'message required' });

  const hasSource = db.prepare('SELECT 1 FROM sources WHERE unit_id = ? LIMIT 1').get(unitId)
    || db.prepare("SELECT 1 FROM explanations WHERE unit_id = ? AND trim(content) <> '' LIMIT 1").get(unitId);
  if (!hasSource) return res.status(400).json({ error: 'Add a source or generate at least one explanation before chatting.' });

  try {
    const hits = await retrieve(unitId, message, 6);
    const kindLabel = { explanation: 'explanation', note: 'note', source: 'source' };
    const context = hits
      .map((h, i) => `[${i + 1}] (${kindLabel[h.kind] || 'source'}: ${h.filename})\n${h.text}`)
      .join('\n\n');
    // Recent history for conversational follow-ups (last few turns, chronological).
    const history = db.prepare('SELECT role, content FROM chat_messages WHERE unit_id = ? ORDER BY rowid DESC LIMIT 6')
      .all(unitId).reverse();
    const messages = [
      { role: 'system', content: chatSystem({ context, language: aiLanguage }) },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const answer = await generate({ messages });

    // Citations: those referenced in the answer, or all retrieved hits as a fallback.
    const referenced = new Set((answer.match(/\[(\d+)\]/g) || []).map((m) => Number(m.replace(/\D/g, ''))));
    const citations = hits
      .map((h, i) => ({
        n: i + 1,
        sourceId: h.sourceId,
        filename: h.filename,
        kind: h.kind,
        snippet: h.text.slice(0, 400),
        score: Number(h.score.toFixed(4)),
      }))
      .filter((c) => referenced.size === 0 || referenced.has(c.n));

    db.prepare('INSERT INTO chat_messages (id, unit_id, role, content) VALUES (?, ?, ?, ?)')
      .run(uid(), unitId, 'user', message);
    db.prepare('INSERT INTO chat_messages (id, unit_id, role, content, citations_json) VALUES (?, ?, ?, ?, ?)')
      .run(uid(), unitId, 'assistant', answer, JSON.stringify(citations));

    res.json({ answer, citations });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
