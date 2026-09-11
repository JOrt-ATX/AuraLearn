// Export/import of courses, subjects or units to/from a single ZIP. Everything
// (text + small JSON fields) lives in one manifest.json; only source files that
// already have a file_path on disk are added under attachments/. IDs are kept
// as-is on export; import either upserts by those original IDs (mode: 'overwrite',
// the default when there's no conflict) or regenerates every ID and remaps the
// internal FKs (mode: 'copy', used when the user explicitly wants a duplicate).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';
import JSZip from 'jszip';
import { db, uid, DATA_PATH } from '../db.js';

const FORMAT_VERSION = 1;

// ---- row readers ----
const getCourseRow = (id) => db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
const getSubjectRow = (id) => db.prepare('SELECT * FROM subjects WHERE id = ?').get(id);
const getUnitRow = (id) => db.prepare('SELECT * FROM units WHERE id = ?').get(id);
const subjectsForCourse = (courseId) => db.prepare('SELECT * FROM subjects WHERE course_id = ? ORDER BY created_at').all(courseId);
const unitsForSubject = (subjectId) => db.prepare('SELECT * FROM units WHERE subject_id = ? ORDER BY created_at').all(subjectId);

export { getCourseRow, getSubjectRow, getUnitRow };

// ---- export: gather the bundle ----
function resolveAttachmentPath(filePath) {
  const abs = isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);
  return existsSync(abs) ? abs : null;
}

function addUnitContent(unitRow, formats, manifest, attachments) {
  manifest.units.push({ id: unitRow.id, subjectId: unitRow.subject_id, name: unitRow.name, createdAt: unitRow.created_at });

  for (const e of db.prepare('SELECT * FROM explanations WHERE unit_id = ? ORDER BY created_at').all(unitRow.id)) {
    manifest.explanations.push({ id: e.id, unitId: e.unit_id, prompt: e.prompt, content: e.content, createdAt: e.created_at });
    for (const n of db.prepare('SELECT * FROM notes WHERE explanation_id = ? ORDER BY created_at').all(e.id)) {
      manifest.notes.push({ id: n.id, explanationId: n.explanation_id, content: n.content, anchorText: n.anchor_text, label: n.label, createdAt: n.created_at });
    }
  }

  if (formats.has('exams')) {
    for (const x of db.prepare('SELECT * FROM exams WHERE unit_id = ? ORDER BY created_at').all(unitRow.id)) {
      manifest.exams.push({ id: x.id, unitId: x.unit_id, questions: JSON.parse(x.questions_json), createdAt: x.created_at });
      const r = db.prepare('SELECT * FROM exam_results WHERE exam_id = ?').get(x.id);
      if (r) manifest.examResults.push({
        id: r.id, examId: r.exam_id, unitId: r.unit_id,
        answers: JSON.parse(r.answers_json || '{}'), score: r.score,
        feedback: r.feedback_json ? JSON.parse(r.feedback_json) : null,
        writtenFeedback: r.written_feedback_json ? JSON.parse(r.written_feedback_json) : null,
        writtenScore: r.written_score, totalScore: r.total_score, submittedAt: r.submitted_at,
      });
    }
  }

  if (formats.has('flashcards')) {
    for (const c of db.prepare('SELECT * FROM flashcards WHERE unit_id = ? ORDER BY rowid').all(unitRow.id)) {
      manifest.flashcards.push({ id: c.id, unitId: c.unit_id, front: c.front, back: c.back, dueAt: c.due_at, interval: c.interval, ease: c.ease, reps: c.reps });
    }
  }

  if (formats.has('sources')) {
    for (const s of db.prepare('SELECT * FROM sources WHERE unit_id = ? ORDER BY created_at').all(unitRow.id)) {
      let attachment = null;
      const abs = s.file_path && resolveAttachmentPath(s.file_path);
      if (abs) {
        attachment = `${s.id}${extname(s.filename || '') || extname(abs)}`;
        attachments.push({ path: `attachments/${attachment}`, data: readFileSync(abs) });
      }
      manifest.sources.push({ id: s.id, unitId: s.unit_id, filename: s.filename, mime: s.mime, text: s.text, createdAt: s.created_at, attachment });
    }
  }

  if (formats.has('chat')) {
    for (const m of db.prepare('SELECT * FROM chat_messages WHERE unit_id = ? ORDER BY rowid').all(unitRow.id)) {
      manifest.chatMessages.push({ id: m.id, unitId: m.unit_id, role: m.role, content: m.content, citations: m.citations_json ? JSON.parse(m.citations_json) : [], createdAt: m.created_at });
    }
  }

  if (formats.has('study')) {
    for (const a of db.prepare('SELECT * FROM artifacts WHERE unit_id = ? ORDER BY created_at').all(unitRow.id)) {
      manifest.artifacts.push({ id: a.id, unitId: a.unit_id, kind: a.kind, title: a.title, content: a.content, createdAt: a.created_at });
    }
  }
}

function addSubjectContent(subjectRow, formats, manifest, attachments) {
  manifest.subjects.push({ id: subjectRow.id, courseId: subjectRow.course_id, name: subjectRow.name, createdAt: subjectRow.created_at });
  for (const u of unitsForSubject(subjectRow.id)) addUnitContent(u, formats, manifest, attachments);
}

// Builds the in-memory bundle (manifest + attachment buffers) for a course, subject or unit.
export function collectBundle(type, id, formats) {
  const manifest = {
    formatVersion: FORMAT_VERSION, scope: type, exportedAt: Math.floor(Date.now() / 1000), name: '',
    courses: [], subjects: [], units: [], explanations: [], notes: [], exams: [], examResults: [],
    flashcards: [], sources: [], chatMessages: [], artifacts: [],
  };
  const attachments = [];

  if (type === 'course') {
    const c = getCourseRow(id);
    if (!c) return null;
    manifest.name = c.name;
    manifest.courses.push({ id: c.id, name: c.name, createdAt: c.created_at });
    for (const s of subjectsForCourse(c.id)) addSubjectContent(s, formats, manifest, attachments);
  } else if (type === 'subject') {
    const s = getSubjectRow(id);
    if (!s) return null;
    manifest.name = s.name;
    addSubjectContent(s, formats, manifest, attachments);
  } else if (type === 'unit') {
    const u = getUnitRow(id);
    if (!u) return null;
    manifest.name = u.name;
    addUnitContent(u, formats, manifest, attachments);
  } else {
    return null;
  }
  return { manifest, attachments };
}

export async function buildZip(type, id, formats) {
  const bundle = collectBundle(type, id, formats);
  if (!bundle) return null;
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(bundle.manifest, null, 2));
  for (const a of bundle.attachments) zip.file(a.path, a.data);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, name: bundle.manifest.name };
}

// ---- import: parse + inspect ----
export async function parseImportZip(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Invalid file: manifest.json not found in the zip.');
  const manifest = JSON.parse(await manifestFile.async('string'));
  if (manifest.formatVersion !== FORMAT_VERSION) throw new Error('Unsupported export format version.');
  if (!['course', 'subject', 'unit'].includes(manifest.scope)) throw new Error('Invalid export scope.');

  const attachmentsMap = new Map();
  const folder = zip.folder('attachments');
  if (folder) {
    const entries = [];
    folder.forEach((relPath, file) => { if (!file.dir) entries.push([relPath, file]); });
    for (const [relPath, file] of entries) attachmentsMap.set(relPath, Buffer.from(await file.async('nodebuffer')));
  }
  return { manifest, attachmentsMap };
}

function rootRow(manifest) {
  if (manifest.scope === 'course') return getCourseRow(manifest.courses[0]?.id);
  if (manifest.scope === 'subject') return getSubjectRow(manifest.subjects[0]?.id);
  return getUnitRow(manifest.units[0]?.id);
}

export function detectConflict(manifest) {
  const existing = rootRow(manifest);
  if (!existing) return null;
  const id = manifest.scope === 'course' ? manifest.courses[0].id : manifest.scope === 'subject' ? manifest.subjects[0].id : manifest.units[0].id;
  return { level: manifest.scope, id, existingName: existing.name };
}

export function countManifest(manifest) {
  return {
    subjects: manifest.subjects.length, units: manifest.units.length, explanations: manifest.explanations.length,
    notes: manifest.notes.length,
    exams: manifest.exams.length, flashcards: manifest.flashcards.length, sources: manifest.sources.length,
    chatMessages: manifest.chatMessages.length, artifacts: manifest.artifacts.length,
  };
}

// ---- import: insert ----
function createCourse(name) {
  const id = uid();
  db.prepare('INSERT INTO courses (id, name) VALUES (?, ?)').run(id, name);
  return id;
}
function createSubject(courseId, name) {
  const id = uid();
  db.prepare('INSERT INTO subjects (id, course_id, name) VALUES (?, ?, ?)').run(id, courseId, name);
  return id;
}

function writeAttachment(sourceId, attachmentName, buffer) {
  const dir = join(DATA_PATH, 'sources');
  mkdirSync(dir, { recursive: true });
  const abs = join(dir, `${sourceId}${extname(attachmentName)}`);
  writeFileSync(abs, buffer);
  return abs;
}

// mode: 'copy' — regenerate every id, remap internal FKs, always needs a target
// (targetCourseId/targetSubjectId or newCourseName/newSubjectName) for subject/unit scope.
function insertCopy(manifest, attachmentsMap, target) {
  const courseIdMap = new Map();
  const subjectIdMap = new Map();
  const unitIdMap = new Map();
  const explanationIdMap = new Map();
  const examIdMap = new Map();

  let courseId, subjectId;
  if (manifest.scope === 'subject') {
    courseId = target.targetCourseId || createCourse(target.newCourseName || manifest.name);
  } else if (manifest.scope === 'unit') {
    subjectId = target.targetSubjectId;
    if (!subjectId) {
      const cId = target.targetCourseId || createCourse(target.newCourseName || manifest.name);
      subjectId = createSubject(cId, target.newSubjectName || manifest.name);
    }
  }

  for (const c of manifest.courses) {
    const newId = uid();
    courseIdMap.set(c.id, newId);
    db.prepare('INSERT INTO courses (id, name, created_at) VALUES (?, ?, ?)').run(newId, c.name, c.createdAt);
  }
  if (manifest.scope === 'course') courseId = courseIdMap.get(manifest.courses[0].id);

  for (const s of manifest.subjects) {
    const newId = uid();
    subjectIdMap.set(s.id, newId);
    const parentCourseId = manifest.scope === 'subject' && s.id === manifest.subjects[0].id ? courseId : courseIdMap.get(s.courseId);
    db.prepare('INSERT INTO subjects (id, course_id, name, created_at) VALUES (?, ?, ?, ?)').run(newId, parentCourseId, s.name, s.createdAt);
  }
  if (manifest.scope === 'subject') subjectId = subjectIdMap.get(manifest.subjects[0].id);

  for (const u of manifest.units) {
    const newId = uid();
    unitIdMap.set(u.id, newId);
    const parentSubjectId = manifest.scope === 'unit' && u.id === manifest.units[0].id ? subjectId : subjectIdMap.get(u.subjectId);
    db.prepare('INSERT INTO units (id, subject_id, name, created_at) VALUES (?, ?, ?, ?)').run(newId, parentSubjectId, u.name, u.createdAt);
  }
  const rootId = manifest.scope === 'course' ? courseId : manifest.scope === 'subject' ? subjectId : unitIdMap.get(manifest.units[0].id);

  for (const e of manifest.explanations) {
    const newId = uid();
    explanationIdMap.set(e.id, newId);
    db.prepare('INSERT INTO explanations (id, unit_id, prompt, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(newId, unitIdMap.get(e.unitId), e.prompt, e.content, e.createdAt);
  }

  for (const n of manifest.notes) {
    const explanationId = explanationIdMap.get(n.explanationId);
    if (!explanationId) continue; // note for an explanation that wasn't included in this export
    db.prepare('INSERT INTO notes (id, explanation_id, content, anchor_text, label, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uid(), explanationId, n.content, n.anchorText, n.label, n.createdAt);
  }

  for (const x of manifest.exams) {
    const newId = uid();
    examIdMap.set(x.id, newId);
    db.prepare('INSERT INTO exams (id, unit_id, questions_json, created_at) VALUES (?, ?, ?, ?)')
      .run(newId, unitIdMap.get(x.unitId), JSON.stringify(x.questions), x.createdAt);
  }
  for (const r of manifest.examResults) {
    const examId = examIdMap.get(r.examId);
    if (!examId) continue; // result for an exam that wasn't included in this export
    db.prepare(`INSERT INTO exam_results (id, exam_id, unit_id, answers_json, score, feedback_json, written_feedback_json, written_score, total_score, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uid(), examId, unitIdMap.get(r.unitId), JSON.stringify(r.answers || {}), r.score || 0,
        r.feedback ? JSON.stringify(r.feedback) : null, r.writtenFeedback ? JSON.stringify(r.writtenFeedback) : null,
        r.writtenScore, r.totalScore, r.submittedAt);
  }

  for (const c of manifest.flashcards) {
    db.prepare('INSERT INTO flashcards (id, unit_id, front, back, due_at, interval, ease, reps) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uid(), unitIdMap.get(c.unitId), c.front, c.back, c.dueAt, c.interval, c.ease, c.reps);
  }

  for (const s of manifest.sources) {
    const newId = uid();
    const filePath = s.attachment && attachmentsMap.has(s.attachment) ? writeAttachment(newId, s.attachment, attachmentsMap.get(s.attachment)) : null;
    db.prepare('INSERT INTO sources (id, unit_id, filename, mime, text, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(newId, unitIdMap.get(s.unitId), s.filename, s.mime, s.text, filePath, s.createdAt);
  }

  for (const m of manifest.chatMessages) {
    db.prepare('INSERT INTO chat_messages (id, unit_id, role, content, citations_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uid(), unitIdMap.get(m.unitId), m.role, m.content, m.citations?.length ? JSON.stringify(m.citations) : null, m.createdAt);
  }

  for (const a of manifest.artifacts) {
    db.prepare('INSERT INTO artifacts (id, unit_id, kind, title, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uid(), unitIdMap.get(a.unitId), a.kind, a.title, a.content, a.createdAt);
  }

  return rootId;
}

// mode: 'overwrite' — keep the original ids, upsert by id. If the root entity
// doesn't exist yet, a target is needed for subject/unit scope (same as copy);
// if it already exists, its current parent is left untouched.
function insertOverwrite(manifest, attachmentsMap, target) {
  const rootAlreadyExists = !!rootRow(manifest);
  let courseId, subjectId;
  if (!rootAlreadyExists) {
    if (manifest.scope === 'subject') {
      courseId = target.targetCourseId || createCourse(target.newCourseName || manifest.name);
    } else if (manifest.scope === 'unit') {
      subjectId = target.targetSubjectId;
      if (!subjectId) {
        const cId = target.targetCourseId || createCourse(target.newCourseName || manifest.name);
        subjectId = createSubject(cId, target.newSubjectName || manifest.name);
      }
    }
  }

  for (const c of manifest.courses) {
    db.prepare(`INSERT INTO courses (id, name, created_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name`).run(c.id, c.name, c.createdAt);
  }
  for (const s of manifest.subjects) {
    const parentCourseId = !rootAlreadyExists && manifest.scope === 'subject' && s.id === manifest.subjects[0].id ? courseId : s.courseId;
    db.prepare(`INSERT INTO subjects (id, course_id, name, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, course_id = excluded.course_id`).run(s.id, parentCourseId, s.name, s.createdAt);
  }
  for (const u of manifest.units) {
    const parentSubjectId = !rootAlreadyExists && manifest.scope === 'unit' && u.id === manifest.units[0].id ? subjectId : u.subjectId;
    db.prepare(`INSERT INTO units (id, subject_id, name, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, subject_id = excluded.subject_id`).run(u.id, parentSubjectId, u.name, u.createdAt);
  }

  for (const e of manifest.explanations) {
    db.prepare(`INSERT INTO explanations (id, unit_id, prompt, content, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET prompt = excluded.prompt, content = excluded.content, unit_id = excluded.unit_id`)
      .run(e.id, e.unitId, e.prompt, e.content, e.createdAt);
  }

  for (const n of manifest.notes) {
    db.prepare(`INSERT INTO notes (id, explanation_id, content, anchor_text, label, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET content = excluded.content, anchor_text = excluded.anchor_text, label = excluded.label, explanation_id = excluded.explanation_id`)
      .run(n.id, n.explanationId, n.content, n.anchorText, n.label, n.createdAt);
  }

  for (const x of manifest.exams) {
    db.prepare(`INSERT INTO exams (id, unit_id, questions_json, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET questions_json = excluded.questions_json, unit_id = excluded.unit_id`)
      .run(x.id, x.unitId, JSON.stringify(x.questions), x.createdAt);
  }
  for (const r of manifest.examResults) {
    db.prepare(`INSERT INTO exam_results (id, exam_id, unit_id, answers_json, score, feedback_json, written_feedback_json, written_score, total_score, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(exam_id) DO UPDATE SET answers_json = excluded.answers_json, score = excluded.score,
        feedback_json = excluded.feedback_json, written_feedback_json = excluded.written_feedback_json,
        written_score = excluded.written_score, total_score = excluded.total_score, submitted_at = excluded.submitted_at, unit_id = excluded.unit_id`)
      .run(r.id, r.examId, r.unitId, JSON.stringify(r.answers || {}), r.score || 0,
        r.feedback ? JSON.stringify(r.feedback) : null, r.writtenFeedback ? JSON.stringify(r.writtenFeedback) : null,
        r.writtenScore, r.totalScore, r.submittedAt);
  }

  for (const c of manifest.flashcards) {
    db.prepare(`INSERT INTO flashcards (id, unit_id, front, back, due_at, interval, ease, reps) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET front = excluded.front, back = excluded.back, due_at = excluded.due_at,
        interval = excluded.interval, ease = excluded.ease, reps = excluded.reps, unit_id = excluded.unit_id`)
      .run(c.id, c.unitId, c.front, c.back, c.dueAt, c.interval, c.ease, c.reps);
  }

  for (const s of manifest.sources) {
    const filePath = s.attachment && attachmentsMap.has(s.attachment) ? writeAttachment(s.id, s.attachment, attachmentsMap.get(s.attachment)) : null;
    db.prepare(`INSERT INTO sources (id, unit_id, filename, mime, text, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET filename = excluded.filename, mime = excluded.mime, text = excluded.text,
        file_path = excluded.file_path, unit_id = excluded.unit_id`)
      .run(s.id, s.unitId, s.filename, s.mime, s.text, filePath, s.createdAt);
  }

  for (const m of manifest.chatMessages) {
    db.prepare(`INSERT INTO chat_messages (id, unit_id, role, content, citations_json, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET content = excluded.content, citations_json = excluded.citations_json, role = excluded.role, unit_id = excluded.unit_id`)
      .run(m.id, m.unitId, m.role, m.content, m.citations?.length ? JSON.stringify(m.citations) : null, m.createdAt);
  }

  for (const a of manifest.artifacts) {
    db.prepare(`INSERT INTO artifacts (id, unit_id, kind, title, content, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title, content = excluded.content, unit_id = excluded.unit_id`)
      .run(a.id, a.unitId, a.kind, a.title, a.content, a.createdAt);
  }

  return manifest.scope === 'course' ? manifest.courses[0].id : manifest.scope === 'subject' ? manifest.subjects[0].id : manifest.units[0].id;
}

// Inserts a parsed bundle into the database. target: { targetCourseId, targetSubjectId, newCourseName, newSubjectName }.
export function insertBundle(manifest, attachmentsMap, mode, target = {}) {
  db.exec('BEGIN');
  try {
    const rootId = mode === 'copy' ? insertCopy(manifest, attachmentsMap, target) : insertOverwrite(manifest, attachmentsMap, target);
    db.exec('COMMIT');
    return rootId;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
