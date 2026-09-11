// B1 — Teach-back (Feynman technique): record a spoken explanation, transcribe
// it via a local Whisper server, then grade the transcript against the unit's
// source material. Two-step flow (upload+transcribe, then grade) so a failed
// grading call is retryable without re-recording, and the student can review
// the transcript before it's judged.
import express, { Router } from 'express';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, uid, DATA_PATH } from '../db.js';
import { generateJSON } from '../services/llm/index.js';
import { teachbackPrompt } from '../services/llm/prompts.js';
import { transcribe } from '../services/stt/index.js';
import { gatherMaterial } from './study.js';

const router = Router();

// Only these mime types are accepted; the file extension on disk is always
// derived from this fixed map — never from a client-supplied filename (none is
// even sent: this route's body is the raw audio bytes, metadata travels via
// the query string).
const MIME_EXT = {
  'audio/webm': 'webm',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
};
const rawAudio = express.raw({ type: Object.keys(MIME_EXT), limit: '20mb' });

function validateTeachback(data) {
  if (typeof data?.accuracy !== 'number' || data.accuracy < 0 || data.accuracy > 100) return 'accuracy must be 0-100';
  if (typeof data?.completeness !== 'number' || data.completeness < 0 || data.completeness > 100) return 'completeness must be 0-100';
  if (!Array.isArray(data?.gaps)) return 'missing gaps array';
  if (typeof data?.suggestion !== 'string' || !data.suggestion.trim()) return 'missing suggestion';
  return null;
}

const toPublic = (row) => ({
  id: row.id,
  unitId: row.unit_id,
  transcript: row.transcript,
  score: row.score,
  feedback: row.feedback_json ? JSON.parse(row.feedback_json) : null,
  explanationIds: row.explanation_ids ? JSON.parse(row.explanation_ids) : [],
  provider: row.provider,
  createdAt: row.created_at,
});

router.get('/units/:unitId/teachback', (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM audio WHERE unit_id = ? AND kind = 'teachback' ORDER BY created_at DESC"
  ).all(req.params.unitId);
  res.json(rows.map(toPublic));
});

router.post('/units/:unitId/teachback/audio', rawAudio, async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: 'No audio uploaded or unsupported audio format.' });
  }
  const { unitId } = req.params;
  const unit = db.prepare('SELECT id FROM units WHERE id = ?').get(unitId);
  if (!unit) return res.status(404).json({ error: 'unit not found' });

  const mime = (req.headers['content-type'] || '').split(';')[0].trim();
  const ext = MIME_EXT[mime];
  if (!ext) return res.status(400).json({ error: 'Unsupported audio format.' });

  // Defense in depth: only keep explanationIds that actually belong to this unit.
  const requestedIds = (req.query.explanationIds || '').split(',').map((s) => s.trim()).filter(Boolean);
  let validatedIds = [];
  if (requestedIds.length) {
    const ph = requestedIds.map(() => '?').join(',');
    validatedIds = db.prepare(`SELECT id FROM explanations WHERE unit_id = ? AND id IN (${ph})`)
      .all(unitId, ...requestedIds).map((r) => r.id);
  }

  const sttProvider = db.prepare('SELECT name FROM stt_providers WHERE is_active = 1 LIMIT 1').get();

  try {
    // Transcribe before writing anything to disk — a failed STT call must never
    // leave an orphan audio file behind.
    const transcript = await transcribe(req.body, { mime, filename: `recording.${ext}` });

    const id = uid();
    const dir = join(DATA_PATH, 'audio', 'teachback');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${id}.${ext}`);
    writeFileSync(filePath, req.body);

    db.prepare(`INSERT INTO audio (id, unit_id, kind, file_path, provider, explanation_ids, transcript)
                VALUES (?, ?, 'teachback', ?, ?, ?, ?)`)
      .run(id, unitId, filePath, sttProvider?.name || null,
        validatedIds.length ? JSON.stringify(validatedIds) : null, transcript);

    res.json({ id, unitId, transcript, explanationIds: validatedIds });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/teachback/:id/grade', async (req, res) => {
  const row = db.prepare("SELECT * FROM audio WHERE id = ? AND kind = 'teachback'").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });

  const { aiLanguage = 'English' } = req.body || {};
  const explanationIds = row.explanation_ids ? JSON.parse(row.explanation_ids) : [];
  const sourceContent = gatherMaterial(row.unit_id, explanationIds);
  if (!sourceContent.trim()) return res.status(400).json({ error: 'No source material found for this unit.' });

  try {
    const { system, prompt } = teachbackPrompt({ sourceContent, transcript: row.transcript, language: aiLanguage });
    const data = await generateJSON({ system, prompt, validate: validateTeachback, task: 'teachback' });
    const score = Math.round((data.accuracy + data.completeness) / 2);
    const feedbackJson = JSON.stringify({
      accuracy: data.accuracy, completeness: data.completeness,
      gaps: data.gaps, suggestion: data.suggestion, strengths: data.strengths || [],
    });
    db.prepare('UPDATE audio SET score = ?, feedback_json = ?, file_path = NULL WHERE id = ?').run(score, feedbackJson, row.id);
    // The transcript (already persisted) is all grading ever needed from the
    // recording — there's no playback feature, so drop the audio file now
    // rather than keep accumulating disk usage forever.
    if (row.file_path) {
      try { if (existsSync(row.file_path)) unlinkSync(row.file_path); }
      catch (e) { console.warn('[teachback] failed to remove audio file after grading:', e.message); }
    }
    res.json(toPublic(db.prepare('SELECT * FROM audio WHERE id = ?').get(row.id)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/teachback/:id', (req, res) => {
  const row = db.prepare("SELECT file_path FROM audio WHERE id = ? AND kind = 'teachback'").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM audio WHERE id = ?').run(req.params.id);
  if (row.file_path) {
    try { if (existsSync(row.file_path)) unlinkSync(row.file_path); }
    catch (e) { console.warn('[teachback] failed to remove audio file:', e.message); }
  }
  res.json({ ok: true });
});

export default router;
