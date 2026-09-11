// Text-to-speech provider (local Chatterbox) management. Mirrors sttProviders.js:
// the api_key is stored but never returned to the browser — only a `hasKey` flag.
import { Router } from 'express';
import { db, uid } from '../db.js';
import { testTtsProvider } from '../services/tts/index.js';
import { encryptSecret, decryptSecret } from '../services/crypto.js';

const router = Router();

const toPublic = (p) => ({
  id: p.id,
  name: p.name,
  type: p.type,
  baseUrl: p.base_url,
  isActive: !!p.is_active,
  hasKey: !!p.api_key,
});

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM tts_providers ORDER BY created_at').all();
  res.json(rows.map(toPublic));
});

router.post('/', (req, res) => {
  const { name, baseUrl, apiKey } = req.body;
  if (!name || !baseUrl) return res.status(400).json({ error: 'name and baseUrl are required' });
  const id = uid();
  const isFirst = db.prepare('SELECT COUNT(*) AS c FROM tts_providers').get().c === 0;
  db.prepare(`INSERT INTO tts_providers (id, name, type, base_url, api_key, is_active)
              VALUES (?, ?, 'chatterbox', ?, ?, ?)`)
    .run(id, name, baseUrl, encryptSecret(apiKey), isFirst ? 1 : 0);
  res.json(toPublic(db.prepare('SELECT * FROM tts_providers WHERE id = ?').get(id)));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tts_providers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { name, baseUrl, apiKey } = req.body;
  // Blank/undefined apiKey keeps the stored (already-encrypted) key (so the UI never needs the real value).
  const key = apiKey === undefined || apiKey === '' ? existing.api_key : encryptSecret(apiKey);
  db.prepare('UPDATE tts_providers SET name = ?, base_url = ?, api_key = ? WHERE id = ?')
    .run(name ?? existing.name, baseUrl ?? existing.base_url, key, req.params.id);
  res.json(toPublic(db.prepare('SELECT * FROM tts_providers WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tts_providers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/activate', (req, res) => {
  const p = db.prepare('SELECT id FROM tts_providers WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE tts_providers SET is_active = 0').run();
  db.prepare('UPDATE tts_providers SET is_active = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/test', async (req, res) => {
  const p = db.prepare('SELECT * FROM tts_providers WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  try {
    await testTtsProvider({ ...p, api_key: decryptSecret(p.api_key) });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

export default router;
