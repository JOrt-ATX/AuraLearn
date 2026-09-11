// Export a course, subject or unit (plus whichever optional content types the
// user selected) to a downloadable .zip. See server/services/exportImport.js.
import { Router } from 'express';
import { buildZip, getCourseRow, getSubjectRow, getUnitRow } from '../services/exportImport.js';

const router = Router();

const ROW_GETTERS = { course: getCourseRow, subject: getSubjectRow, unit: getUnitRow };
const ALLOWED_FORMATS = ['exams', 'flashcards', 'sources', 'study', 'chat'];

function slugify(name) {
  return (name || 'export').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
}

router.get('/export/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const getRow = ROW_GETTERS[type];
  if (!getRow) return res.status(400).json({ error: 'type must be course, subject or unit' });
  if (!getRow(id)) return res.status(404).json({ error: 'Not found.' });

  const requested = (req.query.formats || '').split(',').map((f) => f.trim()).filter(Boolean);
  const formats = new Set(requested.filter((f) => ALLOWED_FORMATS.includes(f)));

  try {
    const { buffer, name } = await buildZip(type, id, formats);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${slugify(name)}.zip"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
