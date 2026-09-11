// R3 — Study materials. Generates a structured study guide (Markdown), a mind
// map (nested Markdown outline, rendered with markmap on the client), or an
// infographic (self-contained HTML fragment, rendered in a sandboxed iframe)
// from a unit's explanations (or its sources, if there are no explanations yet).
import { Router } from 'express';
import { db, uid } from '../db.js';
import { generate, getActiveProfile } from '../services/llm/index.js';
import { studyGuidePrompt, mindmapPrompt, infographicPrompt, diagramPrompt } from '../services/llm/prompts.js';

const router = Router();

const toPublic = (a) => ({
  id: a.id,
  unitId: a.unit_id,
  kind: a.kind,
  title: a.title,
  content: a.content,
  createdAt: a.created_at,
  audioId: a.audio_id,
});

// Gather a unit's text: selected (or all) explanations first, falling back to source text.
// Optional explanationIds filters which explanations to include; omit/empty for all.
// Exported so other routes (e.g. teachback.js) can reuse it instead of duplicating the logic.
export function gatherMaterial(unitId, explanationIds) {
  let expl;
  if (Array.isArray(explanationIds) && explanationIds.length) {
    const ph = explanationIds.map(() => '?').join(',');
    expl = db.prepare(
      `SELECT prompt, content FROM explanations WHERE unit_id = ? AND id IN (${ph}) ORDER BY created_at`
    ).all(unitId, ...explanationIds);
  } else {
    expl = db.prepare('SELECT prompt, content FROM explanations WHERE unit_id = ? ORDER BY created_at').all(unitId);
  }
  let parts = expl.map((e) => `## ${e.prompt}\n${e.content}`);
  if (!parts.length) {
    const srcs = db.prepare('SELECT filename, text FROM sources WHERE unit_id = ? ORDER BY created_at').all(unitId);
    parts = srcs.map((s) => `## ${s.filename}\n${s.text}`);
  }
  const material = parts.join('\n\n---\n\n');
  const cap = getActiveProfile().maxInputChars;
  return material.length > cap ? material.slice(0, cap) : material;
}

// Unwrap a whole-output ```markdown/```html fence if the model added one anyway.
function stripFence(s) {
  const m = /^```(?:markdown|md|html|svg|xml|mermaid)?\s*([\s\S]*?)\s*```$/i.exec((s || '').trim());
  return (m ? m[1] : s || '').trim();
}

// Pulls the "TITLE: ...\n<<<BODY>>>\n..." header the prompts ask the model to lead
// with (see TITLE_LINE_INSTRUCTION in prompts.js) off the front of the raw response.
// Falls back to no title if the model didn't comply, so generation still succeeds.
function extractTitle(raw) {
  const m = /^TITLE:\s*(.+?)\s*\r?\n<<<BODY>>>\r?\n?([\s\S]*)$/.exec((raw || '').trim());
  return m ? { title: m[1].trim(), rest: m[2] } : { title: null, rest: raw };
}

router.get('/units/:unitId/artifacts', (req, res) => {
  const rows = db.prepare(`SELECT artifacts.*,
      (SELECT id FROM audio WHERE kind = 'tts' AND source_type = 'study_guide' AND source_id = artifacts.id) AS audio_id
    FROM artifacts WHERE unit_id = ? ORDER BY created_at`).all(req.params.unitId);
  res.json(rows.map(toPublic));
});

async function createArtifact(req, res, kind) {
  const { unitId } = req.params;
  const unit = db.prepare('SELECT name FROM units WHERE id = ?').get(unitId);
  if (!unit) return res.status(404).json({ error: 'unit not found' });

  const { aiLanguage, explanationIds } = req.body;
  const material = gatherMaterial(unitId, explanationIds);
  if (!material.trim()) return res.status(400).json({ error: 'Add an explanation or a source first.' });

  let fallbackTitle;
  let promptData;
  if (kind === 'mindmap') {
    fallbackTitle = `${unit.name} — Mind map`;
    promptData = mindmapPrompt({ unitName: unit.name, material, language: aiLanguage });
  } else if (kind === 'infographic') {
    fallbackTitle = `${unit.name} — Infographic`;
    promptData = infographicPrompt({ unitName: unit.name, material, language: aiLanguage });
  } else if (kind === 'diagram') {
    fallbackTitle = `${unit.name} — Diagram`;
    promptData = diagramPrompt({ unitName: unit.name, material, language: aiLanguage });
  } else {
    fallbackTitle = `${unit.name} — Study guide`;
    promptData = studyGuidePrompt({ unitName: unit.name, material, language: aiLanguage });
  }

  try {
    const { title: aiTitle, rest } = extractTitle(await generate(promptData));
    const content = stripFence(rest);
    if (!content) throw new Error('The AI returned no content.');
    const title = aiTitle || fallbackTitle;
    const id = uid();
    db.prepare('INSERT INTO artifacts (id, unit_id, kind, title, content) VALUES (?, ?, ?, ?, ?)')
      .run(id, unitId, kind, title, content);
    res.json(toPublic(db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

router.post('/units/:unitId/study-guide', (req, res) => createArtifact(req, res, 'study_guide'));
router.post('/units/:unitId/mindmap', (req, res) => createArtifact(req, res, 'mindmap'));
router.post('/units/:unitId/infographic', (req, res) => createArtifact(req, res, 'infographic'));
router.post('/units/:unitId/diagram', (req, res) => createArtifact(req, res, 'diagram'));

router.delete('/artifacts/:id', (req, res) => {
  db.prepare('DELETE FROM artifacts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
