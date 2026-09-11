// Source management for source-grounded chat (R1 / RAG). A source is pasted/
// extracted text, a fetched URL, or a PDF's extracted text (parsed in the
// browser). On add, the text is chunked + embedded into the `chunks` table.
import { Router } from 'express';
import { db, uid } from '../db.js';
import { indexSource } from '../services/rag.js';
import { fetchUrlText } from '../services/extract.js';

const router = Router();

const toPublic = (s) => ({
  id: s.id,
  unitId: s.unit_id,
  filename: s.filename,
  mime: s.mime,
  chunkCount: s.chunk_count,
  createdAt: s.created_at,
});

// List a unit's sources (metadata + chunk count; no chunk text).
router.get('/units/:unitId/sources', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.unit_id, s.filename, s.mime, s.created_at,
           (SELECT COUNT(*) FROM chunks c WHERE c.source_id = s.id) AS chunk_count
    FROM sources s WHERE s.unit_id = ? ORDER BY s.created_at
  `).all(req.params.unitId);
  res.json(rows.map(toPublic));
});

// Add a source: pasted/extracted text, or a URL to fetch. Stores the row, then
// chunks + embeds it. Embedding needs an active server with an embedding model.
router.post('/units/:unitId/sources', async (req, res) => {
  const { unitId } = req.params;
  let { filename, mime, text, url } = req.body;
  try {
    if (url) {
      const { text: fetched, title } = await fetchUrlText(url);
      text = fetched;
      filename = filename || title || url;
      mime = mime || 'text/html';
    }
    if (!text || !text.trim()) return res.status(400).json({ error: 'No text content to index.' });
    filename = filename || 'Untitled source';
    mime = mime || 'text/plain';

    const id = uid();
    db.prepare('INSERT INTO sources (id, unit_id, filename, mime, text) VALUES (?, ?, ?, ?, ?)')
      .run(id, unitId, filename, mime, text);

    let chunkCount;
    try {
      chunkCount = await indexSource(id, text);
    } catch (e) {
      // Roll back the orphan source so the user can fix embeddings and retry.
      db.prepare('DELETE FROM sources WHERE id = ?').run(id);
      return res.status(500).json({ error: `Indexing failed: ${e.message}` });
    }
    res.json({ id, unitId, filename, mime, chunkCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a source (its chunks cascade via the FK).
router.delete('/sources/:id', (req, res) => {
  db.prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
