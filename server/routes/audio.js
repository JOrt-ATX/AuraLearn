// Audio narration for Explanations and Study guides: condense the source text to
// a short spoken-style recap (ttsSummaryPrompt — deliberately not a read-aloud of
// the full text, see that prompt's comment), synthesize it with the active TTS
// provider, and persist the WAV so it plays back without regenerating.
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { db, uid, DATA_PATH } from '../db.js';
import { generate } from '../services/llm/index.js';
import { ttsSummaryPrompt } from '../services/llm/prompts.js';
import { synthesize } from '../services/tts/index.js';

const router = Router();

async function generateAudio({ unitId, sourceType, sourceId, text, aiLanguage, language }, res) {
  if (!text || !text.trim()) return res.status(400).json({ error: 'Nothing to narrate yet.' });

  try {
    const { system, prompt } = ttsSummaryPrompt({ text, language: aiLanguage });
    const script = (await generate({ system, prompt })).trim();
    if (!script) throw new Error('The AI returned no summary.');
    const wavBuffer = await synthesize(script, { language });

    // Replace any previous audio for this source rather than accumulating files.
    const prior = db.prepare("SELECT id, file_path FROM audio WHERE kind = 'tts' AND source_type = ? AND source_id = ?")
      .get(sourceType, sourceId);
    if (prior) {
      if (prior.file_path && existsSync(prior.file_path)) unlinkSync(prior.file_path);
      db.prepare('DELETE FROM audio WHERE id = ?').run(prior.id);
    }

    const id = uid();
    const dir = join(DATA_PATH, 'audio', 'tts');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${id}.wav`);
    writeFileSync(filePath, wavBuffer);

    const provider = db.prepare('SELECT name FROM tts_providers WHERE is_active = 1 LIMIT 1').get();
    db.prepare(`INSERT INTO audio (id, unit_id, kind, script, file_path, provider, source_type, source_id)
                VALUES (?, ?, 'tts', ?, ?, ?, ?, ?)`)
      .run(id, unitId, script, filePath, provider?.name || null, sourceType, sourceId);

    res.json({ id, url: `/api/audio/${id}/file`, script });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

router.post('/explanations/:id/audio', async (req, res) => {
  const row = db.prepare('SELECT id, unit_id, content FROM explanations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const { aiLanguage, language } = req.body || {};
  await generateAudio({ unitId: row.unit_id, sourceType: 'explanation', sourceId: row.id, text: row.content, aiLanguage, language }, res);
});

router.post('/artifacts/:id/audio', async (req, res) => {
  const row = db.prepare("SELECT id, unit_id, content FROM artifacts WHERE id = ? AND kind = 'study_guide'").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const { aiLanguage, language } = req.body || {};
  await generateAudio({ unitId: row.unit_id, sourceType: 'study_guide', sourceId: row.id, text: row.content, aiLanguage, language }, res);
});

router.get('/audio/:id/file', (req, res) => {
  const row = db.prepare('SELECT file_path FROM audio WHERE id = ?').get(req.params.id);
  if (!row?.file_path || !existsSync(row.file_path)) return res.status(404).end();
  res.type('audio/wav').sendFile(row.file_path);
});

router.delete('/audio/:id', (req, res) => {
  const row = db.prepare("SELECT file_path FROM audio WHERE id = ? AND kind = 'tts'").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM audio WHERE id = ?').run(req.params.id);
  if (row.file_path) {
    try { if (existsSync(row.file_path)) unlinkSync(row.file_path); }
    catch (e) { console.warn('[audio] failed to remove audio file:', e.message); }
  }
  res.json({ ok: true });
});

export default router;
