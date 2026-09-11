// Term images — search returns candidates from Wikipedia + Openverse (no
// download); saving downloads only the one candidate the user picked from the
// carousel, cached per (explanation, term) same idiom as term_explanations.
import { existsSync, unlinkSync } from 'node:fs';
import { Router } from 'express';
import { db } from '../db.js';
import { searchImages, downloadImage } from '../services/images/index.js';

const router = Router();

const toPublic = (r) => ({
  id: r.id,
  explanationId: r.explanation_id,
  term: r.term,
  url: `/api/term-images/${r.id}/file`,
  pageUrl: r.page_url,
  attribution: r.attribution,
  license: r.license,
  caption: r.caption,
});

// A bare "fetch failed" from undici hides the actual cause (TLS, DNS, proxy…)
// inside e.cause — log it in full server-side and surface the cause code to
// the client too, so a network problem is self-diagnosable from the error
// message alone instead of needing server console access.
function describeError(e) {
  const causeCode = e.cause?.code;
  const hint = causeCode === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' || causeCode === 'SELF_SIGNED_CERT_IN_CHAIN'
    ? ' — TLS certificate not trusted. This usually means a corporate proxy/antivirus is intercepting HTTPS and Node does not trust its root certificate (see NODE_EXTRA_CA_CERTS).'
    : causeCode ? ` (${causeCode})` : '';
  return `${e.message}${hint}`;
}

router.get('/explanations/:id/term-images', (req, res) => {
  const rows = db.prepare('SELECT * FROM term_images WHERE explanation_id = ? ORDER BY created_at').all(req.params.id);
  res.json(rows.map(toPublic));
});

// Search only — returns candidates for the carousel, downloads nothing.
router.post('/explanations/:id/term-images/search', async (req, res) => {
  const term = (req.body.term || '').trim();
  const aiLanguage = req.body.aiLanguage;
  if (!term) return res.status(400).json({ error: 'term required' });
  try {
    const candidates = await searchImages(term, aiLanguage);
    res.json({ candidates });
  } catch (e) {
    console.error('[term-images] search failed:', e);
    res.status(500).json({ error: describeError(e) });
  }
});

// Downloads the chosen candidate and persists it, replacing any previous
// illustration for this term (the user is actively picking from a fresh
// search, not reusing a memoized answer) — same "replace, don't accumulate"
// idiom as audio.js's TTS narration.
router.post('/explanations/:id/term-images', async (req, res) => {
  const { id } = req.params;
  const term = (req.body.term || '').trim();
  const candidate = req.body.candidate;
  if (!term) return res.status(400).json({ error: 'term required' });
  if (!candidate?.fullUrl) return res.status(400).json({ error: 'candidate required' });

  const explanation = db.prepare('SELECT id FROM explanations WHERE id = ?').get(id);
  if (!explanation) return res.status(404).json({ error: 'Explanation not found.' });

  try {
    const { id: fileId, filePath } = await downloadImage(candidate);

    const existing = db.prepare('SELECT id, file_path FROM term_images WHERE explanation_id = ? AND term = ? COLLATE NOCASE').get(id, term);
    if (existing) {
      if (existing.file_path && existsSync(existing.file_path)) unlinkSync(existing.file_path);
      db.prepare(`UPDATE term_images SET id = ?, file_path = ?, page_url = ?, attribution = ?, license = ?, caption = ?, created_at = unixepoch()
                  WHERE explanation_id = ? AND term = ? COLLATE NOCASE`)
        .run(fileId, filePath, candidate.pageUrl || null, candidate.attribution || null, candidate.license || null, candidate.caption || null, id, term);
    } else {
      db.prepare(`INSERT INTO term_images (id, explanation_id, term, file_path, page_url, attribution, license, caption)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(fileId, id, term, filePath, candidate.pageUrl || null, candidate.attribution || null, candidate.license || null, candidate.caption || null);
    }
    res.json(toPublic({
      id: fileId, explanation_id: id, term,
      page_url: candidate.pageUrl, attribution: candidate.attribution, license: candidate.license, caption: candidate.caption,
    }));
  } catch (e) {
    console.error('[term-images] download failed:', e);
    res.status(500).json({ error: describeError(e) });
  }
});

router.get('/term-images/:id/file', (req, res) => {
  const row = db.prepare('SELECT file_path FROM term_images WHERE id = ?').get(req.params.id);
  if (!row?.file_path || !existsSync(row.file_path)) return res.status(404).end();
  res.sendFile(row.file_path);
});

router.delete('/term-images/:id', (req, res) => {
  const row = db.prepare('SELECT file_path FROM term_images WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM term_images WHERE id = ?').run(req.params.id);
  if (row.file_path) {
    try { if (existsSync(row.file_path)) unlinkSync(row.file_path); }
    catch (e) { console.warn('[term-images] failed to remove file:', e.message); }
  }
  res.json({ ok: true });
});

export default router;
