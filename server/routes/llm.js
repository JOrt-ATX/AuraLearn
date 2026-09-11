// Generation endpoints used by the frontend. The browser sends prompts/messages;
// the active server (and its key) is resolved server-side.
import { Router } from 'express';
import { generate, generateJSON, embed, citationsSupported } from '../services/llm/index.js';
import { getCitations } from '../services/citations.js';
import { db } from '../db.js';

const router = Router();

router.post('/generate', async (req, res) => {
  try {
    const { prompt, messages, system, sourceIds, withCitations, citationTopic } = req.body;
    let finalPrompt = prompt;
    if (Array.isArray(sourceIds) && sourceIds.length) {
      const placeholders = sourceIds.map(() => '?').join(',');
      const rows = db.prepare(
        `SELECT filename, text FROM sources WHERE id IN (${placeholders})`
      ).all(...sourceIds);
      if (rows.length) {
        const ctx = rows.map((r, i) =>
          `[Source ${i + 1}: ${r.filename}]\n${r.text.slice(0, 4000)}`
        ).join('\n\n');
        finalPrompt = `Use the following sources as additional context:\n\n${ctx}\n\n---\n\n${prompt}`;
      }
    }
    const text = await generate({ prompt: finalPrompt, messages, system });

    let citations;
    if (withCitations && citationsSupported()) {
      // Search the bare topic, not the verbose instruction/context-stuffed prompt.
      try { citations = await getCitations(citationTopic || prompt); } catch { citations = []; }
    }
    res.json(citations !== undefined ? { text, citations } : { text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/json', async (req, res) => {
  try {
    const { prompt, messages, system } = req.body;
    const data = await generateJSON({ prompt, messages, system });
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/embed', async (req, res) => {
  try {
    res.json({ embeddings: await embed(req.body.texts) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── LLM call log ──────────────────────────────────────────────────────────────

// Aggregated stats: per model + task — success rate, avg attempts, avg latency.
router.get('/log', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      model,
      task,
      COUNT(*)                          AS calls,
      ROUND(AVG(ok) * 100)              AS success_pct,
      ROUND(AVG(attempts), 2)           AS avg_attempts,
      ROUND(AVG(latency_ms))            AS avg_latency_ms,
      MAX(created_at)                   AS last_call_at
    FROM llm_log
    GROUP BY model, task
    ORDER BY model, task
  `).all();
  res.json(rows);
});

// Last 200 raw entries for detailed inspection.
router.get('/log/recent', (_req, res) => {
  const rows = db.prepare(
    'SELECT * FROM llm_log ORDER BY created_at DESC, rowid DESC LIMIT 200'
  ).all();
  res.json(rows);
});

// Clear the log.
router.delete('/log', (_req, res) => {
  db.prepare('DELETE FROM llm_log').run();
  res.json({ ok: true });
});

export default router;
