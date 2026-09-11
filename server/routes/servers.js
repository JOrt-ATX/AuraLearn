// LLM server (provider endpoint) management. The api_key is stored but never
// returned to the browser — only a `hasKey` flag is exposed.
import { Router } from 'express';
import { db, uid } from '../db.js';
import { testServer, listModels } from '../services/llm/index.js';
import { encryptSecret, decryptSecret } from '../services/crypto.js';

const router = Router();

const toPublic = (s) => ({
  id: s.id,
  name: s.name,
  type: s.type,
  baseUrl: s.base_url,
  model: s.model,
  multimodalModel: s.multimodal_model,
  embeddingModel: s.embedding_model,
  isActive: !!s.is_active,
  hasKey: !!s.api_key,
});

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM servers ORDER BY created_at').all();
  res.json(rows.map(toPublic));
});

router.post('/', (req, res) => {
  const { name, type, baseUrl, apiKey, model, multimodalModel, embeddingModel } = req.body;
  if (!name || !type || !baseUrl) return res.status(400).json({ error: 'name, type and baseUrl are required' });
  if (!['openai', 'gemini'].includes(type)) return res.status(400).json({ error: 'type must be openai or gemini' });
  const id = uid();
  const isFirst = db.prepare('SELECT COUNT(*) AS c FROM servers').get().c === 0;
  db.prepare(`INSERT INTO servers (id, name, type, base_url, api_key, model, multimodal_model, embedding_model, is_active)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, name, type, baseUrl, encryptSecret(apiKey), model || null, multimodalModel || null, embeddingModel || null, isFirst ? 1 : 0);
  res.json(toPublic(db.prepare('SELECT * FROM servers WHERE id = ?').get(id)));
});

// List models available on a server (for the "Load models" button). Uses the
// posted apiKey, or falls back to the stored key when editing (id given, blank key).
router.post('/models', async (req, res) => {
  const { type, baseUrl, apiKey, id } = req.body;
  if (!type || !baseUrl) return res.status(400).json({ error: 'type and baseUrl are required' });
  let key = apiKey;
  if (!key && id) key = decryptSecret(db.prepare('SELECT api_key FROM servers WHERE id = ?').get(id)?.api_key);
  try {
    res.json(await listModels({ type, base_url: baseUrl, api_key: key || null }));
  } catch (e) {
    res.json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { name, type, baseUrl, apiKey, model, multimodalModel, embeddingModel } = req.body;
  // Blank/undefined apiKey keeps the stored (already-encrypted) key (so the UI never needs the real value).
  const key = apiKey === undefined || apiKey === '' ? existing.api_key : encryptSecret(apiKey);
  db.prepare(`UPDATE servers SET name = ?, type = ?, base_url = ?, api_key = ?, model = ?, multimodal_model = ?, embedding_model = ? WHERE id = ?`)
    .run(name ?? existing.name, type ?? existing.type, baseUrl ?? existing.base_url, key,
         model ?? existing.model, multimodalModel ?? existing.multimodal_model, embeddingModel ?? existing.embedding_model, req.params.id);
  res.json(toPublic(db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/activate', (req, res) => {
  const s = db.prepare('SELECT id FROM servers WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE servers SET is_active = 0').run();
  db.prepare('UPDATE servers SET is_active = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/test', async (req, res) => {
  const s = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  try {
    const text = await testServer({ ...s, api_key: decryptSecret(s.api_key) });
    res.json({ ok: true, text });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

export default router;
