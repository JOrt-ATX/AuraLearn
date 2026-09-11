// Content CRUD — replaces the Firestore operations in the old lib/database.ts.
import { Router } from 'express';
import { db, uid } from '../db.js';
import { generate, generateJSON, getActiveProfile } from '../services/llm/index.js';
import { examPrompt, gradeWrittenPrompt, structurePrompt, objectivesPrompt } from '../services/llm/prompts.js';
import { indexExplanation } from '../services/rag.js';

const router = Router();

function validateExam(data) {
  if (!Array.isArray(data?.questions) || !data.questions.length) return 'missing questions array';
  for (const q of data.questions) {
    if (q.type === 'mcq') {
      if (!Array.isArray(q.options) || q.options.length !== 4) return `question ${q.id}: mcq must have exactly 4 options`;
      if (!q.options.includes(q.correctAnswer)) return `question ${q.id}: correctAnswer must match one option verbatim`;
    }
  }
  return null;
}

function validateGrading(data) {
  if (!Array.isArray(data?.gradedAnswers)) return 'missing gradedAnswers array';
  for (const a of data.gradedAnswers) {
    if (typeof a.score !== 'number' || a.score < 0 || a.score > 10) return `answer ${a.id}: score must be 0–10`;
  }
  return null;
}

// Validates only the shape of an auto-generated curriculum structure (not the
// exact requested counts — the route slices arrays down if the LLM overshoots).
function validateStructure(kind) {
  return (data) => {
    if (kind === 'unit') {
      if (!Array.isArray(data?.explanations) || !data.explanations.length) return 'missing explanations array';
      return null;
    }
    const units = (u) => {
      if (!Array.isArray(u)) return 'missing units array';
      for (const unit of u) {
        if (!unit?.name) return 'unit missing name';
        if (!Array.isArray(unit.explanations)) return 'unit missing explanations array';
      }
      return null;
    };
    if (kind === 'subject') return units(data?.units);
    // course
    if (!Array.isArray(data?.subjects) || !data.subjects.length) return 'missing subjects array';
    for (const s of data.subjects) {
      if (!s?.name) return 'subject missing name';
      const err = units(s.units);
      if (err) return err;
    }
    return null;
  };
}

const clamp = (n, def, min, max) => Math.min(Math.max(Number(n) || def, min), max);

// Full nested tree (courses → subjects → units{explanations, exams[]}).
router.get('/tree', (req, res) => {
  const courses = db.prepare('SELECT id, name, objectives FROM courses ORDER BY created_at').all();
  const subjects = db.prepare('SELECT id, course_id, name FROM subjects ORDER BY created_at').all();
  const units = db.prepare('SELECT id, subject_id, name FROM units ORDER BY created_at').all();
  const explanations = db.prepare(`SELECT id, unit_id, prompt, content, citations_json,
      (SELECT id FROM audio WHERE kind = 'tts' AND source_type = 'explanation' AND source_id = explanations.id) AS audio_id
    FROM explanations ORDER BY created_at`).all();
  const exams = db.prepare('SELECT id, unit_id, questions_json, created_at FROM exams ORDER BY created_at ASC').all();
  const results = db.prepare('SELECT * FROM exam_results').all();

  const resultMap = new Map(results.map((r) => [r.exam_id, r]));

  const courseMap = new Map(courses.map((c) => [c.id, { id: c.id, name: c.name, objectives: c.objectives || '', subjects: [] }]));
  const subjectMap = new Map(subjects.map((s) => [s.id, { id: s.id, name: s.name, courseId: s.course_id, units: [] }]));
  const unitMap = new Map(units.map((u) => [u.id, { id: u.id, name: u.name, subjectId: u.subject_id, explanations: [], exams: [] }]));

  for (const e of explanations) unitMap.get(e.unit_id)?.explanations.push({
    id: e.id,
    unitId: e.unit_id,
    prompt: e.prompt,
    content: e.content,
    citations: e.citations_json ? JSON.parse(e.citations_json) : [],
    audioId: e.audio_id,
  });

  for (const x of exams) {
    const u = unitMap.get(x.unit_id);
    if (!u) continue;
    const r = resultMap.get(x.id);
    u.exams.push({
      id: x.id,
      unitId: x.unit_id,
      createdAt: x.created_at,
      questions: JSON.parse(x.questions_json),
      result: r ? {
        id: r.id,
        answers: JSON.parse(r.answers_json || '{}'),
        score: r.score,
        isSubmitted: true,
        feedback: r.feedback_json ? JSON.parse(r.feedback_json) : undefined,
        writtenFeedback: r.written_feedback_json ? JSON.parse(r.written_feedback_json) : undefined,
        writtenScore: r.written_score,
        totalScore: r.total_score,
      } : null,
    });
  }

  for (const u of units) subjectMap.get(u.subject_id)?.units.push(unitMap.get(u.id));
  for (const s of subjects) courseMap.get(s.course_id)?.subjects.push(subjectMap.get(s.id));

  res.json(Array.from(courseMap.values()));
});

// ---- create ----
router.post('/courses', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uid();
  db.prepare('INSERT INTO courses (id, name) VALUES (?, ?)').run(id, name);
  res.json({ id, name, subjects: [] });
});

router.post('/subjects', (req, res) => {
  const { courseId, name } = req.body;
  if (!courseId || !name) return res.status(400).json({ error: 'courseId and name required' });
  const id = uid();
  db.prepare('INSERT INTO subjects (id, course_id, name) VALUES (?, ?, ?)').run(id, courseId, name);
  res.json({ id, name, courseId, units: [] });
});

router.post('/units', (req, res) => {
  const { subjectId, name } = req.body;
  if (!subjectId || !name) return res.status(400).json({ error: 'subjectId and name required' });
  const id = uid();
  db.prepare('INSERT INTO units (id, subject_id, name) VALUES (?, ?, ?)').run(id, subjectId, name);
  res.json({ id, name, subjectId, explanations: [], exams: [] });
});

// ---- AI-generated training objectives (course creation, before structure) ----

// Unwrap a whole-output ```markdown fence if the model added one anyway (same as study.js).
function stripFence(s) {
  const m = /^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i.exec((s || '').trim());
  return (m ? m[1] : s || '').trim();
}

router.post('/courses/generate-objectives', async (req, res) => {
  const { name, level, focus, audience, aiLanguage } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { system, prompt } = objectivesPrompt({ name, level, focus, audience, language: aiLanguage });
    const objectives = stripFence(await generate({ system, prompt }));
    if (!objectives) throw new Error('The AI returned no objectives.');
    res.json({ objectives });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- AI-generated curriculum structure (titles only — no explanation content) ----

router.post('/courses/:id/generate-structure', async (req, res) => {
  const course = db.prepare('SELECT name FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'course not found' });
  const counts = {
    numSubjects: clamp(req.body.numSubjects, 3, 1, 8),
    numUnitsPerSubject: clamp(req.body.numUnitsPerSubject, 3, 1, 8),
    numExplanationsPerUnit: clamp(req.body.numExplanationsPerUnit, 4, 1, 10),
  };
  const objectives = (req.body.objectives || '').trim();
  try {
    if (objectives) db.prepare('UPDATE courses SET objectives = ? WHERE id = ?').run(objectives, req.params.id);
    const { system, prompt } = structurePrompt({ kind: 'course', name: course.name, counts, language: req.body.aiLanguage, objectives });
    const data = await generateJSON({ system, prompt, validate: validateStructure('course'), task: 'structure' });
    for (const s of data.subjects.slice(0, counts.numSubjects)) {
      const subjectId = uid();
      db.prepare('INSERT INTO subjects (id, course_id, name) VALUES (?, ?, ?)').run(subjectId, req.params.id, s.name);
      for (const u of (s.units || []).slice(0, counts.numUnitsPerSubject)) {
        const unitId = uid();
        db.prepare('INSERT INTO units (id, subject_id, name) VALUES (?, ?, ?)').run(unitId, subjectId, u.name);
        for (const title of (u.explanations || []).slice(0, counts.numExplanationsPerUnit)) {
          db.prepare('INSERT INTO explanations (id, unit_id, prompt, content) VALUES (?, ?, ?, ?)').run(uid(), unitId, title, '');
        }
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/subjects/:id/generate-structure', async (req, res) => {
  const subject = db.prepare('SELECT name FROM subjects WHERE id = ?').get(req.params.id);
  if (!subject) return res.status(404).json({ error: 'subject not found' });
  const counts = {
    numUnits: clamp(req.body.numUnits, 3, 1, 8),
    numExplanationsPerUnit: clamp(req.body.numExplanationsPerUnit, 4, 1, 10),
  };
  try {
    const { system, prompt } = structurePrompt({ kind: 'subject', name: subject.name, counts, language: req.body.aiLanguage });
    const data = await generateJSON({ system, prompt, validate: validateStructure('subject'), task: 'structure' });
    for (const u of data.units.slice(0, counts.numUnits)) {
      const unitId = uid();
      db.prepare('INSERT INTO units (id, subject_id, name) VALUES (?, ?, ?)').run(unitId, req.params.id, u.name);
      for (const title of (u.explanations || []).slice(0, counts.numExplanationsPerUnit)) {
        db.prepare('INSERT INTO explanations (id, unit_id, prompt, content) VALUES (?, ?, ?, ?)').run(uid(), unitId, title, '');
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/units/:id/generate-structure', async (req, res) => {
  const unit = db.prepare('SELECT name FROM units WHERE id = ?').get(req.params.id);
  if (!unit) return res.status(404).json({ error: 'unit not found' });
  const counts = { numExplanations: clamp(req.body.numExplanations, 5, 1, 10) };
  try {
    const { system, prompt } = structurePrompt({ kind: 'unit', name: unit.name, counts, language: req.body.aiLanguage });
    const data = await generateJSON({ system, prompt, validate: validateStructure('unit'), task: 'structure' });
    for (const title of data.explanations.slice(0, counts.numExplanations)) {
      db.prepare('INSERT INTO explanations (id, unit_id, prompt, content) VALUES (?, ?, ?, ?)').run(uid(), req.params.id, title, '');
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/units/:unitId/explanations', async (req, res) => {
  const { prompt, content, citations } = req.body;
  const id = uid();
  db.prepare('INSERT INTO explanations (id, unit_id, prompt, content, citations_json) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.unitId, prompt ?? '', content ?? '', JSON.stringify(citations ?? []));
  if ((content ?? '').trim()) {
    try { await indexExplanation(id, content); } catch (e) { console.error('[explanations] indexing failed', e.message); }
  }
  res.json({ id, unitId: req.params.unitId, prompt, content, citations: citations ?? [] });
});

// Generate a new exam (server-side). Multiple exams per unit are allowed.
router.post('/units/:unitId/exam', async (req, res) => {
  const { aiLanguage = 'English' } = req.body;
  const { unitId } = req.params;
  try {
    const explanations = db.prepare('SELECT content FROM explanations WHERE unit_id = ? ORDER BY created_at').all(unitId);
    if (!explanations.length) return res.status(400).json({ error: 'No explanations found for this unit.' });

    let allContent = explanations.map((e) => e.content).join('\n\n---\n\n');
    const { maxInputChars } = getActiveProfile();
    if (allContent.length > maxInputChars) allContent = allContent.slice(0, maxInputChars) + '\n\n[content truncated]';

    const { system, prompt } = examPrompt({ content: allContent, language: aiLanguage });
    const data = await generateJSON({ system, prompt, validate: validateExam, task: 'exam' });
    if (!data?.questions?.length) throw new Error('The AI returned no questions.');

    const id = uid();
    db.prepare('INSERT INTO exams (id, unit_id, questions_json) VALUES (?, ?, ?)').run(id, unitId, JSON.stringify(data.questions));
    res.json({ id, unitId, questions: data.questions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- exam results (one per exam) ----

router.put('/exams/:examId/result', (req, res) => {
  const { submission } = req.body;
  const { examId } = req.params;
  if (submission == null) {
    db.prepare('DELETE FROM exam_results WHERE exam_id = ?').run(examId);
    return res.json({ ok: true });
  }
  const exam = db.prepare('SELECT unit_id FROM exams WHERE id = ?').get(examId);
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });
  const { answers, score, feedback } = submission;
  const existing = db.prepare('SELECT id FROM exam_results WHERE exam_id = ?').get(examId);
  if (existing) {
    db.prepare('UPDATE exam_results SET answers_json = ?, score = ?, feedback_json = ? WHERE exam_id = ?')
      .run(JSON.stringify(answers ?? {}), score ?? 0, feedback ? JSON.stringify(feedback) : null, examId);
  } else {
    db.prepare('INSERT INTO exam_results (id, exam_id, unit_id, answers_json, score, feedback_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uid(), examId, exam.unit_id, JSON.stringify(answers ?? {}), score ?? 0, feedback ? JSON.stringify(feedback) : null);
  }
  res.json({ ok: true });
});

router.delete('/exams/:examId/result', (req, res) => {
  db.prepare('DELETE FROM exam_results WHERE exam_id = ?').run(req.params.examId);
  res.json({ ok: true });
});

// Grade written answers; updates the exam_results row with written scores.
router.post('/exams/:examId/grade-written', async (req, res) => {
  const { writtenAnswers = {}, aiLanguage = 'English' } = req.body;
  const { examId } = req.params;
  try {
    const examRow = db.prepare('SELECT questions_json FROM exams WHERE id = ?').get(examId);
    if (!examRow) return res.status(404).json({ error: 'No exam found.' });
    const resultRow = db.prepare('SELECT score FROM exam_results WHERE exam_id = ?').get(examId);
    if (!resultRow) return res.status(404).json({ error: 'No result found.' });

    const questions = JSON.parse(examRow.questions_json);
    const writtenQs = questions.filter((q) => q.type === 'written');
    if (!writtenQs.length) return res.json({ gradedAnswers: [], overallFeedback: '', totalScore: 100 });

    const qLines = writtenQs.map((q) => {
      const ans = writtenAnswers[q.id] || '';
      return `Question (id: ${q.id}): ${q.questionText}\nModel answer/rubric: ${q.correctAnswer}\nStudent answer: ${ans || '(no answer)'}`;
    }).join('\n\n');

    const { system, prompt } = gradeWrittenPrompt({ qLines, language: aiLanguage });
    const result = await generateJSON({ system, prompt, validate: validateGrading, task: 'grading' });
    if (!result?.gradedAnswers) throw new Error('The AI returned an unexpected format.');

    const mcqCount = questions.filter((q) => q.type !== 'written').length;
    const mcqPct = mcqCount > 0 ? (resultRow.score / mcqCount) * 100 : 0;
    const gradedScores = result.gradedAnswers.map((a) => a.score ?? 0);
    const writtenPct = gradedScores.length > 0
      ? (gradedScores.reduce((s, v) => s + v, 0) / (gradedScores.length * 10)) * 100
      : 0;
    const totalQuestions = mcqCount + writtenQs.length;
    const totalScore = totalQuestions > 0
      ? Math.round(mcqPct * (mcqCount / totalQuestions) + writtenPct * (writtenQs.length / totalQuestions))
      : Math.round(writtenPct);

    db.prepare('UPDATE exam_results SET written_feedback_json = ?, written_score = ?, total_score = ? WHERE exam_id = ?')
      .run(JSON.stringify(result.gradedAnswers), Math.round(writtenPct), totalScore, examId);

    res.json({ gradedAnswers: result.gradedAnswers, overallFeedback: result.overallFeedback, totalScore });
  } catch (e) {
    console.error('[grade-written]', e);
    res.status(500).json({ error: e.message });
  }
});

// ---- update / delete a single explanation ----
router.put('/explanations/:id', async (req, res) => {
  const cur = db.prepare('SELECT prompt, content, citations_json FROM explanations WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const { prompt, content, citations } = req.body;
  // citations is only sent by the regenerate flow; a plain text/prompt edit must
  // leave any previously-fetched citations untouched.
  const citationsJson = citations !== undefined ? JSON.stringify(citations) : cur.citations_json;
  const finalContent = content ?? cur.content;
  db.prepare('UPDATE explanations SET prompt = ?, content = ?, citations_json = ? WHERE id = ?')
    .run(prompt ?? cur.prompt, finalContent, citationsJson, req.params.id);
  // Re-index for chat whenever the content actually changed, so the chat's RAG
  // context never drifts from what's shown in the Explanations tab.
  if (content !== undefined && content !== cur.content) {
    try { await indexExplanation(req.params.id, finalContent); } catch (e) { console.error('[explanations] re-indexing failed', e.message); }
  }
  res.json({
    id: req.params.id,
    prompt: prompt ?? cur.prompt,
    content: finalContent,
    citations: citationsJson ? JSON.parse(citationsJson) : [],
  });
});

router.delete('/explanations/:id', (req, res) => {
  db.prepare('DELETE FROM explanations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- delete (cascades via FK) ----
router.delete('/courses/:id', (req, res) => { db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id); res.json({ ok: true }); });
router.delete('/subjects/:id', (req, res) => { db.prepare('DELETE FROM subjects WHERE id = ?').run(req.params.id); res.json({ ok: true }); });
router.delete('/units/:id', (req, res) => { db.prepare('DELETE FROM units WHERE id = ?').run(req.params.id); res.json({ ok: true }); });

export default router;
