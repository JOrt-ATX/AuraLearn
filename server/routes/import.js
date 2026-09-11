// Two-step ZIP import: analyze (parse + detect conflict, stash the parsed
// bundle under a short-lived token) then commit (insert it). Splitting it this
// way avoids re-uploading the file once the user has picked overwrite/copy and
// a target. The server is local + single-user, so an in-memory Map is fine —
// just bounded and self-expiring so an abandoned flow can't leak forever.
import express, { Router } from 'express';
import crypto from 'node:crypto';
import { countManifest, detectConflict, insertBundle, parseImportZip } from '../services/exportImport.js';

const router = Router();

const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 10;
const pending = new Map(); // token -> { manifest, attachmentsMap, timer }
const rawZip = express.raw({ type: 'application/zip', limit: '100mb' });

function stash(manifest, attachmentsMap) {
  if (pending.size >= MAX_PENDING) {
    const oldestKey = pending.keys().next().value;
    clearTimeout(pending.get(oldestKey).timer);
    pending.delete(oldestKey);
  }
  const token = crypto.randomUUID();
  const timer = setTimeout(() => pending.delete(token), TOKEN_TTL_MS);
  pending.set(token, { manifest, attachmentsMap, timer });
  return token;
}

router.post('/import/analyze', rawZip, async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const { manifest, attachmentsMap } = await parseImportZip(req.body);
    const token = stash(manifest, attachmentsMap);
    res.json({ token, scope: manifest.scope, name: manifest.name, counts: countManifest(manifest), conflict: detectConflict(manifest) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/import/commit/:token', (req, res) => {
  const entry = pending.get(req.params.token);
  if (!entry) return res.status(410).json({ error: 'This import has expired or was already used — please upload the file again.' });
  clearTimeout(entry.timer);
  pending.delete(req.params.token);

  const { mode = 'overwrite', targetCourseId, targetSubjectId, newCourseName, newSubjectName } = req.body || {};
  if (!['overwrite', 'copy'].includes(mode)) return res.status(400).json({ error: 'mode must be overwrite or copy' });

  try {
    const rootId = insertBundle(entry.manifest, entry.attachmentsMap, mode, { targetCourseId, targetSubjectId, newCourseName, newSubjectName });
    res.json({ ok: true, scope: entry.manifest.scope, id: rootId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
