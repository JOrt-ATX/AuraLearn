import { state, setState, setUnit, subscribe, emit, defaultUnitState, applySettings } from './state.js';
import { api } from './api.js';
import { t, aiLangFor } from './i18n.js';
import { extractText, isSupportedDocument, extractFolder } from './extractors.js';
import { selectedCourse, selectedSubject, selectedUnit } from './selectors.js';
import { renderSidebar, renderHeader, renderGrid, renderSpinner } from './views/dashboard.js';
import { renderUnit, renderSelectionTrigger, canGenerate, canAddSource, hasChatContext } from './views/unitView.js';
import { renderModals } from './views/modals.js';
import { escapeHtml } from './ui.js';

// ---------- render ----------
function render() {
  const app = document.getElementById('app');
  const content = state.loading ? renderSpinner()
    : selectedUnit() ? renderUnit(selectedUnit())
    : renderGrid();

  // innerHTML replacement destroys and recreates every scrollable container,
  // which would otherwise snap scroll position back to the top on each
  // re-render (e.g. on every text selection inside an explanation). Capture
  // and restore scrollTop for any element that opts in via data-scroll-id.
  const scrollPositions = new Map();
  app.querySelectorAll('[data-scroll-id]').forEach((el) => scrollPositions.set(el.dataset.scrollId, el.scrollTop));

  app.innerHTML = `
    <div class="flex h-screen bg-slate-900 font-sans">
      ${state.sidebarOpen ? `
        <div class="fixed inset-0 z-40 flex md:hidden">
          <div class="fixed inset-0 bg-black/60" data-action="toggle-sidebar" data-open="false"></div>
          <div class="relative flex-1 flex flex-col max-w-xs w-full bg-slate-950 border-r border-slate-800">${renderSidebar()}</div>
        </div>` : ''}
      <div class="w-64 bg-slate-950/70 border-r border-slate-800 flex-col hidden md:flex">${renderSidebar()}</div>
      <main class="flex-1 flex flex-col overflow-hidden">
        ${renderHeader()}
        <div data-scroll-id="main" class="flex-1 p-4 sm:p-8 lg:p-12 overflow-y-auto">${content}</div>
      </main>
      ${renderModals()}
    </div>`;

  app.querySelectorAll('[data-scroll-id]').forEach((el) => {
    const top = scrollPositions.get(el.dataset.scrollId);
    if (top) el.scrollTop = top;
  });

  // Autofocus the first input of create/server dialogs (innerHTML ignores the
  // autofocus attribute, so do it explicitly).
  if (['course', 'subject', 'unit', 'server', 'stt-provider', 'explanation-edit'].includes(state.modal)) {
    document.querySelector('[role=dialog] input')?.focus();
  }

  // Draw any open mind maps into their freshly-rendered SVGs (no-op elsewhere).
  renderMarkmaps();
  // Draw any open diagrams into their freshly-rendered <pre class="mermaid"> (no-op elsewhere).
  renderMermaids();
  // Mark every occurrence of a cached term with a clickable [n] reference.
  injectTermMarkers();
  // Draw a floated thumbnail next to the first occurrence of each illustrated term.
  injectTermImageThumbnails();
  // Highlight each note's anchored fragment (first occurrence) in its explanation.
  markNoteAnchors();
  // Re-sync the floating Explain/Add-note trigger (lives outside #app, untouched
  // by the innerHTML replacement above — see syncSelectionTrigger).
  syncSelectionTrigger();
}

// The Explain/Add-note trigger is kept out of the normal render() innerHTML
// replacement and updated by patching its own tiny root instead: replacing
// #app wholesale (as render() does on every state change) would destroy the
// DOM nodes the browser's native Selection points into, collapsing it the
// instant the user releases the mouse — before they get a chance to Ctrl+C or
// right-click "Copy" the text they just selected.
function selectionTriggerRoot() {
  let el = document.getElementById('selection-trigger-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'selection-trigger-root';
    document.body.appendChild(el);
  }
  return el;
}
function syncSelectionTrigger() { selectionTriggerRoot().innerHTML = renderSelectionTrigger(); }

// ---------- data loaders ----------
async function loadTree() { state.tree = await api.getTree(); }
async function loadServers() { state.servers = await api.getServers(); }
async function loadSttProviders() { state.sttProviders = await api.getSttProviders(); }
async function loadTtsProviders() { state.ttsProviders = await api.getTtsProviders(); }

// Generates the training-objectives draft shown in the course modal, before the
// structure step. Done via direct DOM manipulation (not setState/emit) so the
// in-progress name/checkbox/sliders selection elsewhere in the form is preserved.
async function handleGenerateObjectives(btn) {
  const form = btn.closest('form');
  const name = (form.querySelector('#new-name-input')?.value || '').trim();
  if (!name) return;
  const level = form.querySelector('select[name="level"]')?.value;
  const focus = form.querySelector('select[name="focus"]')?.value;
  const audience = form.querySelector('select[name="audience"]')?.value;
  const statusEl = form.querySelector('#objectives-status');
  const errorEl = form.querySelector('#objectives-error');
  const wrapEl = form.querySelector('#objectives-textarea-wrap');
  const textarea = form.querySelector('#objectives-textarea');
  const submitBtn = form.querySelector('button[type="submit"]');
  const label = form.querySelector('#generate-objectives-label');

  btn.disabled = true;
  errorEl?.classList.add('hidden');
  statusEl?.classList.remove('hidden');
  try {
    const { objectives } = await api.generateCourseObjectives({ name, level, focus, audience, aiLanguage: state.aiLanguage });
    if (textarea) textarea.value = objectives;
    wrapEl?.classList.remove('hidden');
    if (label) label.textContent = t('btn_regenerate_objectives');
    if (submitBtn) submitBtn.disabled = !objectives.trim();
  } catch (e) {
    if (errorEl) { errorEl.textContent = e.message || 'Could not generate objectives.'; errorEl.classList.remove('hidden'); }
  } finally {
    statusEl?.classList.add('hidden');
    btn.disabled = false;
  }
}

// After creating a course/subject/unit, optionally fill in everything below it
// with AI-generated titles (subjects/units/explanation titles) — the base entity
// is already created and visible in the tree either way.
async function maybeGenerateStructure(fd, generate) {
  if (fd.get('autogen') !== 'on') { setState({ modal: null }); return; }
  setState({ structureGen: { busy: true } });
  try {
    await generate();
    await loadTree();
    setState({ modal: null, structureGen: null });
  } catch (e) {
    setState({ structureGen: { busy: false, error: e.message || 'Could not generate structure.' } });
  }
}

// ---------- folder ingest (build a whole course from a documentation folder) ----------
// The FileList from <input webkitdirectory> is not serializable and any state
// change re-renders the whole app, so it's kept in a module-scope variable
// instead of `state` — same pattern as `recordTimer` below.
let pickedFolderFiles = null;

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Patches the folder-summary node directly (no setState) — picking a folder
// must not re-render the form and drop whatever the user already typed.
function handleFolderPick(fileList) {
  pickedFolderFiles = fileList;
  const el = document.getElementById('folder-summary');
  if (!el) return;
  if (!fileList || !fileList.length) { el.textContent = ''; return; }

  const supported = Array.from(fileList).filter((f) => isSupportedDocument(f));
  const totalBytes = supported.reduce((sum, f) => sum + f.size, 0);
  const byExt = {};
  for (const f of supported) {
    const ext = f.name.split('.').pop().toLowerCase();
    byExt[ext] = (byExt[ext] || 0) + 1;
  }
  const breakdown = Object.entries(byExt).sort((a, b) => b[1] - a[1]).map(([ext, n]) => `${ext.toUpperCase()} ×${n}`).join(', ');
  el.innerHTML = `<span class="text-slate-300">${t('folder_summary_count', { n: supported.length })}</span> · ${formatBytes(totalBytes)}${breakdown ? ` · ${escapeHtml(breakdown)}` : ''}`;
}

// Mirrors server/services/ingest.js's batchBySize (~4MB per batch — express.json's
// limit is 25mb) so a folder with hundreds of files doesn't blow one request.
function batchDocsBySize(docs, maxBytes) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const doc of docs) {
    const docSize = (doc.text || doc.imageDataUrl || '').length;
    if (current.length && size + docSize > maxBytes) { batches.push(current); current = []; size = 0; }
    current.push(doc);
    size += docSize;
  }
  if (current.length) batches.push(current);
  return batches;
}

// Drops any unit/explanation the user unchecked in the plan preview. A unit
// left with no explanations (or a subject left with no units) is dropped
// entirely rather than committed empty.
function filterIngestPlan(plan, excluded) {
  const subjects = (plan.subjects || []).map((s, si) => {
    const units = (s.units || [])
      .map((u, ui) => {
        if (excluded[`${si}:${ui}`]) return null;
        const explanations = (u.explanations || []).filter((e, ei) => !excluded[`${si}:${ui}:${ei}`]);
        return explanations.length ? { ...u, explanations } : null;
      })
      .filter(Boolean);
    return units.length ? { ...s, units } : null;
  }).filter(Boolean);
  return { objectives: plan.objectives, subjects };
}

// Orchestrates extract -> upload -> digest -> plan, entirely client-driven (one
// call per document, in series) so progress is visible and one bad document
// never sinks the rest. Ends by opening the plan preview for confirmation —
// nothing is written to the database (beyond the empty course + staging docs)
// until the user confirms there.
async function handleCreateCourseFromFolder(name, fd) {
  if (!pickedFolderFiles || !pickedFolderFiles.length) {
    setState({ structureGen: { busy: false, error: t('err_no_folder_selected') } });
    return;
  }
  const files = Array.from(pickedFolderFiles);
  pickedFolderFiles = null;
  const aiLanguage = state.aiLanguage;
  const limits = {
    maxSubjects: Number(fd.get('numSubjectsMax')) || undefined,
    maxUnitsPerSubject: Number(fd.get('numUnitsPerSubjectMax')) || undefined,
    maxExplanationsPerUnit: Number(fd.get('numExplanationsPerUnitMax')) || undefined,
  };

  const created = await api.addCourse(name);
  await loadTree();

  setState({ structureGen: { busy: true, phase: 'extract', done: 0, total: files.length, label: t('ingest_phase_extract') } });
  let extracted;
  try {
    extracted = await extractFolder(files, ({ done, total, filename }) => {
      setState({ structureGen: { busy: true, phase: 'extract', done, total, label: t('ingest_phase_extract'), detail: filename } });
    });
  } catch (e) {
    setState({ structureGen: { busy: false, error: e.message || 'Could not read the folder.' } });
    return;
  }
  if (!extracted.docs.length) {
    setState({ structureGen: { busy: false, error: t('err_folder_no_supported_files') } });
    return;
  }

  const failedDocs = [...extracted.skipped];
  const batches = batchDocsBySize(extracted.docs, 4 * 1024 * 1024);
  const insertedDocs = [];
  setState({ structureGen: { busy: true, phase: 'upload', done: 0, total: batches.length, label: t('ingest_phase_upload') } });
  for (let i = 0; i < batches.length; i++) {
    const detail = batches[i][0].filename + (batches[i].length > 1 ? ` (+${batches[i].length - 1})` : '');
    setState({ structureGen: { busy: true, phase: 'upload', done: i, total: batches.length, label: t('ingest_phase_upload'), detail } });
    try {
      const res = await api.ingestDocs(created.id, batches[i], aiLanguage);
      insertedDocs.push(...res.inserted);
      failedDocs.push(...res.failed.map((f) => ({ path: f.path, error: f.error })));
    } catch (e) {
      failedDocs.push({ path: `(batch ${i + 1})`, error: e.message });
    }
    setState({ structureGen: { busy: true, phase: 'upload', done: i + 1, total: batches.length, label: t('ingest_phase_upload'), detail } });
  }
  if (!insertedDocs.length) {
    setState({ structureGen: { busy: false, error: t('err_folder_ingest_all_failed') } });
    return;
  }

  setState({ structureGen: { busy: true, phase: 'digest', done: 0, total: insertedDocs.length, label: t('ingest_phase_digest') } });
  for (let i = 0; i < insertedDocs.length; i++) {
    setState({ structureGen: { busy: true, phase: 'digest', done: i, total: insertedDocs.length, label: t('ingest_phase_digest'), detail: insertedDocs[i].path } });
    try {
      const r = await api.ingestDigest(insertedDocs[i].id, aiLanguage);
      if (!r.ok) failedDocs.push({ path: insertedDocs[i].path, error: r.error });
    } catch (e) {
      failedDocs.push({ path: insertedDocs[i].path, error: e.message });
    }
    setState({ structureGen: { busy: true, phase: 'digest', done: i + 1, total: insertedDocs.length, label: t('ingest_phase_digest'), detail: insertedDocs[i].path } });
  }

  setState({ structureGen: { busy: true, phase: 'plan', done: 0, total: 1, label: t('ingest_phase_plan'), detail: t('ingest_plan_detail', { n: insertedDocs.length }) } });
  let plan;
  try {
    plan = await api.ingestPlan(created.id, { limits, aiLanguage });
  } catch (e) {
    setState({ structureGen: { busy: false, error: e.message || 'Could not design the curriculum.' } });
    return;
  }

  setState({
    structureGen: null,
    modal: 'ingest-preview',
    ingestPreview: { courseId: created.id, courseName: name, plan, skippedDocs: failedDocs, excluded: {}, busy: false, error: '' },
  });
}

// Commits the (possibly user-edited) plan, then writes every explanation in
// series — one call each, so a local backend doesn't get hit with concurrent
// requests and a single failure doesn't stop the rest.
async function submitIngestCommit() {
  const p = state.ingestPreview;
  if (!p || p.busy) return;
  const filteredPlan = filterIngestPlan(p.plan, p.excluded);
  if (!filteredPlan.subjects.length) {
    state.ingestPreview.error = t('err_ingest_preview_empty');
    emit();
    return;
  }

  state.ingestPreview.busy = true;
  state.ingestPreview.error = '';
  emit();

  let commitResult;
  try {
    commitResult = await api.ingestCommit(p.courseId, filteredPlan);
  } catch (e) {
    state.ingestPreview.busy = false;
    state.ingestPreview.error = e.message || 'Could not create the course structure.';
    emit();
    return;
  }

  const aiLanguage = state.aiLanguage;
  const explanationIds = commitResult.explanationIds || [];
  // Same subjects -> units -> explanations order commitPlan() uses to build
  // explanationIds server-side, so index i here names the same explanation.
  const explanationTitles = filteredPlan.subjects.flatMap((s) => s.units.flatMap((u) => u.explanations.map((e) => e.title)));
  const failedExplanations = [];
  setState({
    modal: 'course', ingestPreview: null,
    structureGen: { busy: true, phase: 'write', done: 0, total: explanationIds.length, label: t('ingest_phase_write'), detail: explanationTitles[0] },
  });

  for (let i = 0; i < explanationIds.length; i++) {
    try {
      const r = await api.generateGrounded(explanationIds[i], { aiLanguage });
      if (!r.ok) failedExplanations.push(r.error);
    } catch (e) {
      failedExplanations.push(e.message);
    }
    setState({ structureGen: { busy: true, phase: 'write', done: i + 1, total: explanationIds.length, label: t('ingest_phase_write'), detail: explanationTitles[i + 1] } });
  }

  await loadTree();
  setState({ modal: null, structureGen: null });

  const skippedCount = (p.skippedDocs || []).length;
  if (skippedCount || failedExplanations.length) {
    alert(t('ingest_summary_issues', { skipped: skippedCount, failed: failedExplanations.length }));
  }
}

// ---------- navigation ----------
function selectUnit(id) {
  state.sel.unitId = id;
  const unit = selectedUnit();
  Object.assign(state.unit, defaultUnitState(), {
    viewMode: unit?.explanations.length ? 'explanations' : 'generator',
  });
  emit();
}

function drill(type, id) {
  if (type === 'course') { state.sel = { courseId: id, subjectId: null, unitId: null }; emit(); }
  else if (type === 'subject') { state.sel.subjectId = id; state.sel.unitId = null; emit(); }
  else if (type === 'unit') { selectUnit(id); }
}

function resetTo(level) {
  if (level === 'courses') state.sel = { courseId: null, subjectId: null, unitId: null };
  else if (level === 'course') { state.sel.subjectId = null; state.sel.unitId = null; }
  else if (level === 'subject') { state.sel.unitId = null; }
  emit();
}

async function deleteItem(type, id) {
  if (!confirm(t('confirm_delete_item', { item: t(`item_${type}`) }))) return;
  if (type === 'course') await api.deleteCourse(id);
  else if (type === 'subject') await api.deleteSubject(id);
  else if (type === 'unit') await api.deleteUnit(id);
  if (state.sel.unitId === id) state.sel.unitId = null;
  if (state.sel.subjectId === id) { state.sel.subjectId = null; state.sel.unitId = null; }
  if (state.sel.courseId === id) state.sel = { courseId: null, subjectId: null, unitId: null };
  await loadTree();
  emit();
}

// ---------- generator input capture ----------
// We don't re-render on keystroke, so pull the latest textarea values into state
// before any action that triggers a re-render (tab switch / generate).
function captureInputs() {
  const p = document.getElementById('prompt'); if (p) state.unit.prompt = p.value;
  const c = document.getElementById('context'); if (c) state.unit.contextText = c.value;
}

// Keep the Generate button's enabled state in sync as the user types, without a
// full re-render (which would lose textarea focus).
function updateGenerateButton() {
  const btn = document.querySelector('[data-action="generate"]');
  if (btn) btn.disabled = state.unit.generating || !canGenerate(state.unit);
}

// Course-level training objectives (set during AI auto-generation), prepended to
// explanation generation/regeneration prompts so content stays aligned with them.
function objectivesContext() {
  const objectives = (selectedCourse()?.objectives || '').trim();
  return objectives
    ? `This unit belongs to a course with the following training objectives:\n${objectives}\n\nKeep the explanation aligned with these objectives where relevant.\n\n`
    : '';
}

// ---------- AI flows (ported from the original UnitView.tsx) ----------
async function handleGenerate() {
  const u = state.unit;
  const unit = selectedUnit();
  const prompt = (u.prompt || '').trim();
  let ok = false;
  if (u.inputMode === 'simple' && prompt) ok = true;
  if (u.inputMode === 'context' && prompt && (u.contextText || '').trim()) ok = true;
  if (u.inputMode === 'pdf' && prompt && (u.pdfText || '').trim()) ok = true;
  if (!ok || u.generating) return;

  setUnit({ generating: true, error: '' });
  const lang = `Provide the response in ${state.aiLanguage}.`;
  const md = 'Format the response using Markdown. Use headers, bold text, and lists where appropriate to structure the information.';
  let displayPrompt = prompt;
  let content;
  const objCtx = objectivesContext();
  if (u.inputMode === 'context') {
    displayPrompt = `Explain: "${prompt}" based on the provided text.`;
    content = `${objCtx}Based on the following context, create a clear explanation of "${prompt}". ${lang} ${md}\n\n${u.contextText}`;
  } else if (u.inputMode === 'pdf') {
    displayPrompt = `Explain: "${prompt}" based on the PDF: ${u.pdfName}`;
    content = `${objCtx}Based on the content of the provided document, create a clear explanation of "${prompt}". ${lang} ${md}\n\n${u.pdfText}`;
  } else {
    content = `${objCtx}Explain the following concept for a course on "${unit.name}". ${lang} ${md} Keep the explanation clear, concise, and educational. Concept: ${prompt}`;
  }

  const sourceIds = (u.selectedSourceIds || []).length ? u.selectedSourceIds : undefined;
  try {
    const { text, citations } = await api.generate({ prompt: content, sourceIds, withCitations: true, citationTopic: prompt });
    const newExp = await api.addExplanation(unit.id, displayPrompt, text, citations);
    await loadTree();
    // Reset the generator and open the newly created explanation in the accordion.
    Object.assign(state.unit, defaultUnitState(), {
      viewMode: 'explanations',
      openExplanations: newExp?.id ? { [newExp.id]: true } : {},
    });
    emit();
  } catch (e) {
    console.error('Generate error:', e);
    setUnit({ generating: false, error: e.message || 'Failed to generate explanation.' });
  }
}

async function handleGenerateExam() {
  const u = state.unit;
  const unit = selectedUnit();
  if (u.generatingExam || unit.explanations.length === 0) return;
  setUnit({ generatingExam: true, error: '' });
  try {
    const newExam = await api.generateExam(unit.id, { aiLanguage: state.aiLanguage });
    await loadTree();
    // Auto-open the newly generated exam for taking.
    setUnit({ generatingExam: false, answers: {}, activeExamId: newExam.id });
  } catch (e) {
    console.error('Exam error:', e);
    setUnit({ generatingExam: false, error: 'Failed to generate exam. The AI may have returned an unexpected format. Please try again.' });
  }
}

async function handleSubmitExam() {
  const unit = selectedUnit();
  const examId = state.unit.activeExamId;
  const exam = unit?.exams?.find((x) => x.id === examId);
  if (!exam) return;

  // Capture latest written textarea values before reading answers.
  document.querySelectorAll('textarea[data-action="written-answer"]').forEach((ta) => {
    state.unit.answers[Number(ta.dataset.index)] = ta.value;
  });

  const answers = state.unit.answers;
  const questions = exam.questions;

  let mcqScore = 0;
  const incorrectMCQ = [];
  const writtenQs = [];
  questions.forEach((q, i) => {
    if (q.type === 'written') { writtenQs.push({ q, i }); return; }
    const a = answers[i];
    if (a === q.correctAnswer) mcqScore++;
    else if (a) incorrectMCQ.push({ q, i, a });
  });

  const submission = { answers: { ...answers }, score: mcqScore, isSubmitted: true };
  await api.saveExamResult(examId, submission);
  await loadTree();
  emit();

  if (!incorrectMCQ.length && !writtenQs.length) return;

  if (writtenQs.length) setUnit({ writtenGrading: true });
  if (incorrectMCQ.length) setUnit({ generatingFeedback: true });

  const [mcqResult, writtenResult] = await Promise.allSettled([
    incorrectMCQ.length
      ? Promise.all(incorrectMCQ.map(async ({ q, i, a }) => {
          const prompt = `You are a helpful tutor. A student was asked: "${q.questionText}". The options were: ${q.options.join(', ')}. The correct answer is "${q.correctAnswer}". The student answered "${a}". Provide a brief, encouraging 1–2 sentence explanation. Provide the response in ${state.aiLanguage}.`;
          const { text } = await api.generate({ prompt });
          return [i, text];
        })).then((pairs) => Object.fromEntries(pairs))
      : Promise.resolve({}),
    writtenQs.length
      ? (() => {
          const writtenAnswers = {};
          writtenQs.forEach(({ q, i }) => { writtenAnswers[q.id || String(i)] = String(answers[i] || ''); });
          return api.gradeWritten(examId, writtenAnswers, state.aiLanguage);
        })()
      : Promise.resolve(null),
  ]);

  if (mcqResult.status === 'fulfilled' && Object.keys(mcqResult.value).length) {
    await api.saveExamResult(examId, { ...submission, feedback: mcqResult.value });
  }
  await loadTree();

  const errors = [mcqResult, writtenResult]
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason?.message || 'Unknown error');
  setUnit({ generatingFeedback: false, writtenGrading: false, error: errors.join(' · ') });
}

async function handleRetakeExam(examId) {
  if (!confirm(t('confirm_retake_exam'))) return;
  await api.deleteExamResult(examId);
  await loadTree();
  setUnit({ answers: {}, activeExamId: examId }); // keep exam open in taking mode
}

function openExam(examId) {
  if (state.unit.activeExamId === examId) {
    setUnit({ activeExamId: null, answers: {}, generatingFeedback: false, writtenGrading: false });
    return;
  }
  const exam = selectedUnit()?.exams?.find((x) => x.id === examId);
  setUnit({
    activeExamId: examId,
    answers: exam?.result ? { ...exam.result.answers } : {},
    generatingFeedback: false,
    writtenGrading: false,
    error: '',
  });
}

// ---- explanation edit / delete / regenerate ----
function openExplanationEdit(id) {
  const exp = selectedUnit()?.explanations.find((e) => e.id === id);
  if (!exp) return;
  setState({ editingExplanation: { id: exp.id, prompt: exp.prompt, content: exp.content }, modal: 'explanation-edit' });
}

async function deleteExplanation(id) {
  if (!confirm(t('confirm_delete_explanation'))) return;
  await api.deleteExplanation(id);
  delete state.unit.openExplanations[id];
  await loadTree();
  emit();
}

async function regenerateExplanation(id) {
  const unit = selectedUnit();
  const exp = unit?.explanations.find((e) => e.id === id);
  if (!exp) return;
  if (!confirm(t('confirm_regenerate'))) return;

  // Sources may not be loaded yet if the user never opened the Sources tab —
  // load them first so this check is reliable either way.
  await ensureRagLoaded();
  const hasSources = (state.unit.sources || []).length > 0;

  state.unit.regeneratingId = id;
  emit();
  try {
    if (hasSources) {
      const { ok, content, error } = await api.generateGrounded(id, { aiLanguage: state.aiLanguage });
      if (!ok) throw new Error(error || 'Failed to regenerate.');
      await loadTree();
    } else {
      const lang = `Provide the response in ${state.aiLanguage}.`;
      const md = 'Format the response using Markdown. Use headers, bold text, and lists where appropriate to structure the information.';
      const prompt = `${objectivesContext()}Explain the following for a course on "${unit.name}". ${lang} ${md} Keep the explanation clear, concise, and educational. Topic: ${exp.prompt}`;
      const { text, citations } = await api.generate({ prompt, withCitations: true, citationTopic: exp.prompt });
      await api.updateExplanation(id, { content: text, citations });
      await loadTree();
    }
    state.unit.regeneratingId = null;
    state.unit.openExplanations[id] = true; // reveal the new content
    emit();
  } catch (e) {
    console.error('Regenerate error:', e);
    state.unit.regeneratingId = null;
    emit();
    alert(t('alert_regen_fail', { err: e.message }));
  }
}

// ---- quick term explanations (select text in an explanation → ask "what's this?") ----
async function ensureTermsLoaded(explanationId) {
  if (state.unit.termExplanationsLoaded[explanationId]) return;
  try {
    const terms = await api.getTermExplanations(explanationId);
    state.unit.termExplanations[explanationId] = terms;
    state.unit.termExplanationsLoaded[explanationId] = true;
    emit();
  } catch (e) {
    console.error('Load term explanations failed:', e);
    state.unit.termExplanationsLoaded[explanationId] = true; // avoid retrying every toggle
  }
}

async function explainSelection() {
  const sel = state.unit.selection;
  if (!sel) return;
  const unit = selectedUnit();
  const exp = unit?.explanations.find((x) => x.id === sel.explanationId);
  if (!exp) return;
  const term = sel.text;
  state.unit.selection = null;
  state.termExplain = { explanationId: exp.id, term, loading: true, error: '', content: '' };
  state.modal = 'term-explain';
  emit();
  try {
    const result = await api.explainTerm(exp.id, term, state.aiLanguage);
    const list = (state.unit.termExplanations[exp.id] || []).filter((te) => te.id !== result.id);
    state.unit.termExplanations[exp.id] = [...list, result];
    if (state.termExplain?.explanationId === exp.id && state.termExplain.term === term) {
      Object.assign(state.termExplain, { id: result.id, loading: false, content: result.content });
    }
  } catch (e) {
    if (state.termExplain?.explanationId === exp.id && state.termExplain.term === term) {
      Object.assign(state.termExplain, { loading: false, error: e.message || 'Failed.' });
    }
  }
  emit();
}

function openTermChip(explanationId, termId) {
  const te = (state.unit.termExplanations[explanationId] || []).find((x) => x.id === termId);
  if (!te) return;
  state.unit.selection = null;
  state.termExplain = { id: te.id, explanationId, term: te.term, content: te.content, loading: false, error: '' };
  state.modal = 'term-explain';
  emit();
}

async function deleteTermChip(explanationId, termId) {
  try {
    await api.deleteTermExplanation(termId);
    state.unit.termExplanations[explanationId] = (state.unit.termExplanations[explanationId] || []).filter((te) => te.id !== termId);
    if (state.termExplain?.id === termId) { state.termExplain = null; state.modal = null; }
    emit();
  } catch (e) { console.error('Delete term explanation failed:', e); }
}

// ---- term illustrations (select text in an explanation → "illustrate this") ----
async function ensureTermImagesLoaded(explanationId) {
  if (state.unit.termImagesLoaded[explanationId]) return;
  try {
    const images = await api.getTermImages(explanationId);
    state.unit.termImages[explanationId] = images;
    state.unit.termImagesLoaded[explanationId] = true;
    emit();
  } catch (e) {
    console.error('Load term images failed:', e);
    state.unit.termImagesLoaded[explanationId] = true; // avoid retrying every toggle
  }
}

// Searches candidates (no download yet) and opens the carousel. The user then
// browses with the arrows and picks one via useTermImageCandidate(), which is
// the only step that actually downloads/persists an image.
async function illustrateSelection() {
  const sel = state.unit.selection;
  if (!sel) return;
  const unit = selectedUnit();
  const exp = unit?.explanations.find((x) => x.id === sel.explanationId);
  if (!exp) return;
  const term = sel.text;
  state.unit.selection = null;
  state.termImage = { mode: 'searching', explanationId: exp.id, term };
  state.modal = 'term-image';
  emit();
  try {
    const { candidates } = await api.searchTermImages(exp.id, term, state.aiLanguage);
    if (state.termImage?.explanationId !== exp.id || state.termImage.term !== term) return; // modal moved on meanwhile
    state.termImage = candidates?.length
      ? { mode: 'browsing', explanationId: exp.id, term, candidates, index: 0, saving: false, error: '' }
      : { mode: 'error', explanationId: exp.id, term, error: t('term_image_not_found') };
  } catch (e) {
    if (state.termImage?.explanationId === exp.id && state.termImage.term === term) {
      state.termImage = { mode: 'error', explanationId: exp.id, term, error: e.message || 'Failed.' };
    }
  }
  emit();
}

function moveTermImageCandidate(delta) {
  const ti = state.termImage;
  if (!ti || ti.mode !== 'browsing') return;
  const next = ti.index + delta;
  if (next < 0 || next >= ti.candidates.length) return;
  ti.index = next;
  emit();
}

async function useTermImageCandidate() {
  const ti = state.termImage;
  if (!ti || ti.mode !== 'browsing' || ti.saving) return;
  const candidate = ti.candidates[ti.index];
  ti.saving = true;
  ti.error = '';
  emit();
  try {
    const result = await api.illustrateTerm(ti.explanationId, ti.term, candidate);
    const list = (state.unit.termImages[ti.explanationId] || []).filter((x) => x.term.toLowerCase() !== ti.term.toLowerCase());
    state.unit.termImages[ti.explanationId] = [...list, result];
    if (state.termImage === ti) state.termImage = { mode: 'viewing', explanationId: ti.explanationId, ...result };
  } catch (e) {
    if (state.termImage === ti) { ti.saving = false; ti.error = e.message || 'Failed.'; }
  }
  emit();
}

function openTermImageChip(explanationId, imageId) {
  const ti = (state.unit.termImages[explanationId] || []).find((x) => x.id === imageId);
  if (!ti) return;
  state.unit.selection = null;
  state.termImage = { mode: 'viewing', explanationId, ...ti };
  state.modal = 'term-image';
  emit();
}

async function deleteTermImageChip(explanationId, imageId) {
  try {
    await api.deleteTermImage(imageId);
    state.unit.termImages[explanationId] = (state.unit.termImages[explanationId] || []).filter((ti) => ti.id !== imageId);
    if (state.termImage?.id === imageId) { state.termImage = null; state.modal = null; }
    emit();
  } catch (e) { console.error('Delete term image failed:', e); }
}

// ---- notes (free-form annotations, optionally anchored to a text selection) ----
async function ensureNotesLoaded(explanationId) {
  if (state.unit.notesLoaded[explanationId]) return;
  try {
    state.unit.notes[explanationId] = await api.getNotes(explanationId);
    state.unit.notesLoaded[explanationId] = true;
    emit();
  } catch (e) {
    console.error('Load notes failed:', e);
    state.unit.notesLoaded[explanationId] = true; // avoid retrying every toggle
  }
}

// Opens the note modal pre-filled with the current text selection as the anchor.
function addNoteFromSelection() {
  const sel = state.unit.selection;
  if (!sel) return;
  state.unit.selection = null;
  state.editingNote = { id: null, explanationId: sel.explanationId, content: '', anchorText: sel.text, label: '' };
  state.modal = 'note-edit';
  emit();
}

function openNoteChip(explanationId, noteId) {
  const note = (state.unit.notes[explanationId] || []).find((x) => x.id === noteId);
  if (!note) return;
  state.editingNote = { ...note, explanationId };
  state.modal = 'note-edit';
  emit();
}

async function deleteNoteChip(explanationId, noteId) {
  try {
    await api.deleteNote(noteId);
    state.unit.notes[explanationId] = (state.unit.notes[explanationId] || []).filter((n) => n.id !== noteId);
    emit();
  } catch (e) { console.error('Delete note failed:', e); }
}

// Detects a text selection made inside an open explanation's rendered content
// and shows a floating "Explain" trigger near the cursor. A plain click (no
// drag) collapses the selection, which clears the trigger.
function onTextSelection(e) {
  if (e.target.closest('[data-action="explain-selection"], [data-action="illustrate-selection"], [data-action="add-note-selection"]')) return;
  const container = e.target.closest('[data-expl-content]');
  const text = (window.getSelection()?.toString() || '').trim();
  if (!container || !text || text.length > 150) {
    if (state.unit.selection) { state.unit.selection = null; syncSelectionTrigger(); }
    return;
  }
  state.unit.selection = { explanationId: container.dataset.explId, text, x: e.clientX, y: e.clientY };
  // Patch the floating trigger directly instead of emit()'s full re-render —
  // that would replace the DOM nodes the just-made Selection points into,
  // collapsing it before the user can copy what they selected.
  syncSelectionTrigger();
}

// Marks every occurrence of each cached term within its explanation's rendered
// content with a clickable [n] reference (paper-citation style), matching the
// numbering of the chip list below. Runs after every render — cheap for the
// content sizes here, and self-correcting if a term no longer matches (edited
// explanation) since the whole subtree is rebuilt fresh each time anyway.
function injectTermMarkers() {
  document.querySelectorAll('[data-expl-content]').forEach((container) => {
    const explanationId = container.dataset.explId;
    const terms = state.unit.termExplanations[explanationId] || [];
    if (!terms.length) return;
    // Longest term first, so a multi-word phrase is claimed before a shorter
    // term that happens to be one of its words.
    [...terms].sort((a, b) => b.term.length - a.term.length)
      .forEach((te) => markAllOccurrences(container, te, terms.indexOf(te) + 1));
  });
}

function markAllOccurrences(container, te, n) {
  const term = (te.term || '').trim();
  if (!term) return;
  const lower = term.toLowerCase();
  const textNodes = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  for (const textNode of textNodes) {
    if (textNode.parentElement?.closest('[data-term-marker], [data-note-marker], [data-image-thumb]')) continue; // don't re-match inside an already-inserted marker/caption
    const text = textNode.textContent;
    const lowerText = text.toLowerCase();
    let idx = lowerText.indexOf(lower);
    if (idx === -1) continue;

    const frag = document.createDocumentFragment();
    let cursor = 0;
    while (idx !== -1) {
      frag.appendChild(document.createTextNode(text.slice(cursor, idx + term.length)));
      const marker = document.createElement('sup');
      marker.dataset.termMarker = '1';
      marker.dataset.action = 'open-term-chip';
      marker.dataset.id = te.explanationId;
      marker.dataset.termId = te.id;
      marker.title = t('term_chip_hint');
      marker.className = 'ml-0.5 cursor-pointer text-violet-400 hover:text-violet-300 font-semibold';
      marker.textContent = `[${n}]`;
      frag.appendChild(marker);
      cursor = idx + term.length;
      idx = lowerText.indexOf(lower, cursor);
    }
    frag.appendChild(document.createTextNode(text.slice(cursor)));
    textNode.replaceWith(frag);
  }
}

// Shows a Wikipedia-style floated thumbnail (image + caption, only if the
// source itself provided one — never synthesized) beside the FIRST occurrence
// of each illustrated term, instead of highlighting every occurrence: a common
// word (e.g. "cocoa") can appear a dozen times across headings/paragraphs/list
// items, and marking all of them made the text unreadable. Only paragraphs and
// list items are considered as anchor points (not headings — floating inside a
// short heading line looks broken).
function injectTermImageThumbnails() {
  document.querySelectorAll('[data-expl-content]').forEach((container) => {
    const explanationId = container.dataset.explId;
    const images = state.unit.termImages[explanationId] || [];
    if (!images.length) return;
    [...images].sort((a, b) => b.term.length - a.term.length)
      .forEach((ti) => insertTermImageThumbnail(container, ti));
  });
}

function insertTermImageThumbnail(container, ti) {
  const term = (ti.term || '').trim();
  if (!term) return;
  const lower = term.toLowerCase();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const block = node.parentElement?.closest('p, li');
    if (!block || block.closest('[data-image-thumb]')) continue;
    if (!node.textContent.toLowerCase().includes(lower)) continue;

    const figure = document.createElement('figure');
    figure.dataset.imageThumb = '1';
    figure.dataset.action = 'open-term-image-chip';
    figure.dataset.id = ti.explanationId;
    figure.dataset.imageId = ti.id;
    figure.title = t('term_image_chip_hint');
    figure.className = 'float-right ml-4 mb-2 w-28 sm:w-36 cursor-pointer';
    figure.innerHTML = `<img src="${escapeHtml(ti.url)}" alt="${escapeHtml(ti.caption || ti.term)}" class="w-full rounded border border-slate-700 object-cover">
      ${ti.caption ? `<figcaption class="text-[11px] text-slate-500 mt-1 leading-snug">${escapeHtml(ti.caption)}</figcaption>` : ''}`;
    block.parentNode.insertBefore(figure, block);
    return; // only the first occurrence across the whole explanation
  }
}

// Highlights the first occurrence of each note's anchored fragment (the text
// the user had selected when creating the note) within its explanation's
// rendered content — a colored <mark> instead of injectTermMarkers' trailing
// [n], since here we want to show *which* passage the note refers to, not a
// numbered footnote. Only the first occurrence is wrapped: unlike short terms,
// an anchor is usually a unique selected sentence.
function markNoteAnchors() {
  document.querySelectorAll('[data-expl-content]').forEach((container) => {
    const explanationId = container.dataset.explId;
    const notes = (state.unit.notes[explanationId] || []).filter((n) => (n.anchorText || '').trim());
    // Longest anchor first, so an overlapping shorter anchor doesn't claim text
    // that belongs to a longer one.
    [...notes].sort((a, b) => b.anchorText.length - a.anchorText.length)
      .forEach((n) => markFirstOccurrence(container, n));
  });
}

function markFirstOccurrence(container, note) {
  const needle = note.anchorText.trim();
  const lower = needle.toLowerCase();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('[data-note-marker], [data-term-marker], [data-image-thumb]')) continue;
    const text = node.textContent;
    const idx = text.toLowerCase().indexOf(lower);
    if (idx === -1) continue;

    const mark = document.createElement('mark');
    mark.dataset.noteMarker = '1';
    mark.dataset.action = 'open-note-chip';
    mark.dataset.id = note.explanationId;
    mark.dataset.noteId = note.id;
    mark.title = t('note_chip_hint');
    mark.className = 'cursor-pointer bg-amber-500/20 text-amber-200 rounded px-0.5 hover:bg-amber-500/30';
    mark.textContent = text.slice(idx, idx + needle.length);

    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode(text.slice(0, idx)));
    frag.appendChild(mark);
    frag.appendChild(document.createTextNode(text.slice(idx + needle.length)));
    node.replaceWith(frag);
    return;
  }
}

async function handlePdf(file) {
  if (!file) return;
  if (!isSupportedDocument(file)) { setUnit({ error: t('err_unsupported_doc'), pdfName: '', pdfText: '' }); return; }
  setUnit({ pdfName: file.name, error: '', parsingPdf: true, pdfText: '' });
  try {
    setUnit({ pdfText: await extractText(file), parsingPdf: false });
  } catch (e) {
    console.error('Document parse error:', e);
    const msg = e.message === 'no_text' ? t('err_doc_no_text') : t('err_doc_parse_fail');
    setUnit({ error: msg, parsingPdf: false });
  }
}

// ---------- R1: Sources & Chat (RAG) ----------
// Pull the live source text/url fields into state before a re-render (mirrors
// captureInputs for the generator).
function captureSourceInputs() {
  const t = document.getElementById('source-text'); if (t) state.unit.sourceText = t.value;
  const url = document.getElementById('source-url'); if (url) state.unit.sourceUrl = url.value;
}

function updateAddSourceButton() {
  const btn = document.querySelector('[data-action="add-source"]');
  if (btn) btn.disabled = state.unit.addingSource || !canAddSource(state.unit);
}

function updateChatSendButton() {
  const btn = document.querySelector('[data-action="send-chat"]');
  if (btn) btn.disabled = state.unit.chatBusy || !(state.unit.chatInput || '').trim() || !hasChatContext(selectedUnit());
}

// Lazy-load a unit's sources + chat history the first time the tab is opened.
async function ensureRagLoaded() {
  const unit = selectedUnit();
  if (!unit || state.unit.ragLoaded) return;
  const unitId = unit.id;
  try {
    const [sources, chatMessages] = await Promise.all([api.getSources(unitId), api.getChat(unitId)]);
    if (state.sel.unitId !== unitId) return; // user navigated away while loading
    Object.assign(state.unit, { sources, chatMessages, ragLoaded: true });
  } catch (e) {
    if (state.sel.unitId !== unitId) return;
    Object.assign(state.unit, { ragError: e.message || 'Could not load sources.', ragLoaded: true });
  }
  emit();
}

async function handleSourcePdf(file) {
  if (!file) return;
  if (!isSupportedDocument(file)) { setUnit({ ragError: t('err_unsupported_doc') }); return; }
  setUnit({ sourcePdfName: file.name, sourcePdfMime: file.type, ragError: '', parsingSourcePdf: true, sourcePdfText: '' });
  try {
    setUnit({ sourcePdfText: await extractText(file), parsingSourcePdf: false });
  } catch (e) {
    console.error('Document parse error:', e);
    const msg = e.message === 'no_text' ? t('err_doc_no_text') : t('err_doc_parse_fail');
    setUnit({ ragError: msg, parsingSourcePdf: false });
  }
}

async function handleAddSource() {
  captureSourceInputs();
  const u = state.unit;
  const unit = selectedUnit();
  if (!unit || u.addingSource || !canAddSource(u)) return;

  let payload;
  if (u.sourceMode === 'url') {
    payload = { url: u.sourceUrl.trim() };
  } else if (u.sourceMode === 'pdf') {
    payload = { filename: u.sourcePdfName || 'document', mime: u.sourcePdfMime || 'application/octet-stream', text: (u.sourcePdfText || '').trim() };
  } else {
    payload = { filename: `Pasted text — ${new Date().toLocaleString()}`, mime: 'text/plain', text: u.sourceText.trim() };
  }

  setUnit({ addingSource: true, ragError: '' });
  try {
    const src = await api.addSource(unit.id, payload);
    if (state.sel.unitId !== unit.id) return;
    state.unit.sources = [...state.unit.sources, src];
    Object.assign(state.unit, { addingSource: false, sourceText: '', sourceUrl: '', sourcePdfName: '', sourcePdfText: '' });
    emit();
  } catch (e) {
    setUnit({ addingSource: false, ragError: e.message || 'Could not add source.' });
  }
}

async function deleteSource(id) {
  if (!confirm(t('confirm_delete_source'))) return;
  try {
    await api.deleteSource(id);
    state.unit.sources = state.unit.sources.filter((s) => s.id !== id);
    emit();
  } catch (e) { alert(t('alert_remove_source_fail', { err: e.message })); }
}

async function handleSendChat() {
  const u = state.unit;
  const unit = selectedUnit();
  const inputEl = document.getElementById('chat-input');
  const message = ((inputEl?.value ?? u.chatInput) || '').trim();
  if (!unit || u.chatBusy || !message) return;
  if (!hasChatContext(unit)) { setUnit({ ragError: 'Add a source or generate at least one explanation before chatting.' }); return; }

  // Optimistically show the user's message, then await the grounded answer.
  state.unit.chatMessages = [...u.chatMessages, { role: 'user', content: message, citations: [] }];
  Object.assign(state.unit, { chatInput: '', chatBusy: true, ragError: '' });
  emit();
  try {
    const { answer, citations } = await api.sendChat(unit.id, message, state.aiLanguage);
    if (state.sel.unitId !== unit.id) return;
    state.unit.chatMessages = [...state.unit.chatMessages, { role: 'assistant', content: answer, citations: citations || [] }];
    setUnit({ chatBusy: false });
  } catch (e) {
    if (state.sel.unitId !== unit.id) return;
    setUnit({ chatBusy: false, ragError: e.message || 'Chat failed.' });
  }
}

async function clearChat() {
  const unit = selectedUnit();
  if (!unit || !confirm(t('confirm_clear_chat'))) return;
  try {
    await api.clearChat(unit.id);
    state.unit.chatMessages = [];
    emit();
  } catch (e) { alert(t('alert_clear_chat_fail', { err: e.message })); }
}

// ---------- R2: Flashcards (SRS) ----------
async function ensureFlashcardsLoaded() {
  const unit = selectedUnit();
  if (!unit || state.unit.flashcardsLoaded) return;
  const unitId = unit.id;
  try {
    const flashcards = await api.getFlashcards(unitId);
    if (state.sel.unitId !== unitId) return;
    Object.assign(state.unit, { flashcards, flashcardsLoaded: true });
  } catch (e) {
    if (state.sel.unitId !== unitId) return;
    Object.assign(state.unit, { fcError: e.message || 'Could not load flashcards.', flashcardsLoaded: true });
  }
  emit();
}

async function handleGenerateCards() {
  const u = state.unit;
  const unit = selectedUnit();
  if (!unit || u.generatingCards) return;
  if (!unit.explanations.length) { setUnit({ fcError: 'Create at least one explanation first.' }); return; }
  setUnit({ generatingCards: true, fcError: '' });
  const fcExplIds = (u.flashcardExplanationIds || []).length ? u.flashcardExplanationIds : undefined;
  try {
    const created = await api.generateFlashcards(unit.id, { aiLanguage: state.aiLanguage, explanationIds: fcExplIds });
    if (state.sel.unitId !== unit.id) return;
    state.unit.flashcards = [...state.unit.flashcards, ...created];
    setUnit({ generatingCards: false });
  } catch (e) {
    setUnit({ generatingCards: false, fcError: e.message || 'Could not generate flashcards.' });
  }
}

function startReview(scope) {
  const now = Math.floor(Date.now() / 1000);
  const cards = state.unit.flashcards;
  const pool = scope === 'all' ? cards : cards.filter((c) => c.dueAt <= now);
  if (!pool.length) {
    setUnit({ fcError: scope === 'all' ? 'No flashcards yet — generate or add some first.' : 'Nothing due right now. Use “Review all” to study ahead.' });
    return;
  }
  state.unit.review = { active: true, queue: pool.map((c) => c.id), pos: 0, flipped: false, graded: 0 };
  state.unit.fcError = '';
  emit();
}

// Optimistically advance the review UI, then persist the SM-2 update.
function gradeCard(grade) {
  const r = state.unit.review;
  if (!r.active || r.pos >= r.queue.length) return;
  const cardId = r.queue[r.pos];

  r.graded += 1;
  if (grade === 'again') r.queue.push(cardId); // re-study later this session
  r.pos += 1;
  r.flipped = false;
  emit();

  api.reviewFlashcard(cardId, grade)
    .then((updated) => {
      const idx = state.unit.flashcards.findIndex((c) => c.id === cardId);
      if (idx >= 0) state.unit.flashcards[idx] = updated; // refresh schedule silently
    })
    .catch((e) => setUnit({ fcError: 'Could not save review: ' + e.message }));
}

function endReview() {
  state.unit.review = { active: false, queue: [], pos: 0, flipped: false, graded: 0 };
  emit();
}

function openFlashcardEdit(id) {
  const c = state.unit.flashcards.find((x) => x.id === id);
  if (!c) return;
  setState({ editingFlashcard: { id: c.id, front: c.front, back: c.back }, modal: 'flashcard-edit' });
}

async function deleteCard(id) {
  if (!confirm(t('confirm_delete_card'))) return;
  try {
    await api.deleteFlashcard(id);
    state.unit.flashcards = state.unit.flashcards.filter((c) => c.id !== id);
    emit();
  } catch (e) { alert(t('alert_delete_card_fail', { err: e.message })); }
}

// ---------- R3: Study materials (guides + mind maps) ----------
async function ensureStudyLoaded() {
  const unit = selectedUnit();
  if (!unit || state.unit.studyLoaded) return;
  const unitId = unit.id;
  try {
    const artifacts = await api.getArtifacts(unitId);
    if (state.sel.unitId !== unitId) return;
    Object.assign(state.unit, { artifacts, studyLoaded: true });
  } catch (e) {
    if (state.sel.unitId !== unitId) return;
    Object.assign(state.unit, { studyError: e.message || 'Could not load study materials.', studyLoaded: true });
  }
  emit();
}

// ---------- B1: Teach-back ----------
async function ensureTeachbackLoaded() {
  const unit = selectedUnit();
  if (!unit || state.unit.teachbackLoaded) return;
  const unitId = unit.id;
  try {
    const teachbackHistory = await api.getTeachback(unitId);
    if (state.sel.unitId !== unitId) return;
    Object.assign(state.unit, { teachbackHistory, teachbackLoaded: true });
  } catch (e) {
    if (state.sel.unitId !== unitId) return;
    Object.assign(state.unit, { teachbackError: e.message || 'Could not load teach-back history.', teachbackLoaded: true });
  }
  emit();
}

// MediaRecorder instance/stream are not serializable — kept as module state,
// not in the observable `state` object (mirrors how scroll/selection-trigger
// state is also kept outside the render-on-state-change model).
let mediaRecorder = null;
let recordedChunks = [];
let recordTimer = null;

function pickAudioMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

// Encodes mono Float32 PCM samples (range -1..1) as a 16-bit WAV Blob.
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// MediaRecorder only produces webm/ogg containers, which whisper.cpp's server
// can't decode natively (no ffmpeg dependency wanted) — decode via Web Audio
// API and re-encode as 16kHz mono WAV, which every local Whisper backend reads.
async function convertRecordingToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let decoded;
  try { decoded = await ctx.decodeAudioData(arrayBuffer); }
  finally { ctx.close(); }
  const targetRate = 16000;
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * targetRate)), targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), targetRate);
}

async function startTeachbackRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickAudioMimeType();
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      clearInterval(recordTimer);
      const rawBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      setUnit({ recording: false, convertingTeachback: true });
      try {
        const wavBlob = await convertRecordingToWav(rawBlob);
        if (state.unit.recordedBlobUrl) URL.revokeObjectURL(state.unit.recordedBlobUrl);
        setUnit({ convertingTeachback: false, recordedBlob: wavBlob, recordedBlobUrl: URL.createObjectURL(wavBlob) });
      } catch (e) {
        setUnit({ convertingTeachback: false, teachbackError: t('alert_teachback_convert_fail', { err: e.message }) });
      }
    };
    mediaRecorder.start();
    setUnit({ recording: true, recordSeconds: 0, recordedBlob: null, recordedBlobUrl: '', convertingTeachback: false, teachbackError: '' });
    // Patch the timer text directly every second instead of calling setUnit —
    // a full re-render here would rebuild the whole #app tree and restart
    // every .animate-fade-in animation on screen, causing a visible flicker.
    recordTimer = setInterval(() => {
      state.unit.recordSeconds += 1;
      const el = document.getElementById('teachback-record-timer');
      if (el) {
        const s = state.unit.recordSeconds;
        el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      }
    }, 1000);
  } catch (e) {
    setUnit({ teachbackError: t('alert_teachback_mic_fail', { err: e.message }) });
  }
}

function stopTeachbackRecording() {
  mediaRecorder?.stop();
}

async function submitTeachback() {
  const unit = selectedUnit();
  const u = state.unit;
  if (!unit || !u.recordedBlob || u.uploadingTeachback || u.gradingTeachback) return;
  setUnit({ uploadingTeachback: true, teachbackError: '' });
  try {
    const { id, transcript } = await api.uploadTeachbackAudio(unit.id, u.recordedBlob, u.teachbackExplanationIds);
    if (state.sel.unitId !== unit.id) return;
    setUnit({ uploadingTeachback: false, gradingTeachback: true, teachbackPendingId: id });
    const result = await api.gradeTeachback(id, state.aiLanguage);
    if (state.sel.unitId !== unit.id) return;
    if (state.unit.recordedBlobUrl) URL.revokeObjectURL(state.unit.recordedBlobUrl);
    setUnit({
      gradingTeachback: false, teachbackResult: result,
      teachbackHistory: [result, ...state.unit.teachbackHistory],
      recordedBlob: null, recordedBlobUrl: '', teachbackPendingId: null,
    });
  } catch (e) {
    setUnit({ uploadingTeachback: false, gradingTeachback: false, teachbackError: e.message || 'Could not submit recording.' });
  }
}

async function deleteTeachbackItem(id) {
  if (!confirm(t('confirm_delete_teachback'))) return;
  try {
    await api.deleteTeachback(id);
    state.unit.teachbackHistory = state.unit.teachbackHistory.filter((x) => x.id !== id);
    if (state.unit.teachbackResult?.id === id) state.unit.teachbackResult = null;
    emit();
  } catch (e) { alert(t('alert_teachback_grade_fail', { err: e.message })); }
}

// ---------- B1: Speech-to-text provider settings ----------
function openSttProviderForm(id) {
  const existing = id ? state.sttProviders.find((p) => p.id === id) : null;
  state.sttProviderForm = existing ? { ...existing } : { name: '', baseUrl: '' };
  state.modal = 'stt-provider';
  emit();
}

async function saveSttProvider(fd) {
  const payload = {
    name: (fd.get('name') || '').trim(),
    baseUrl: (fd.get('baseUrl') || '').trim(),
    apiKey: fd.get('apiKey'), // '' keeps the existing key on update
  };
  if (!payload.name || !payload.baseUrl) return;
  const id = state.sttProviderForm?.id;
  try {
    if (id) await api.updateSttProvider(id, payload); else await api.addSttProvider(payload);
    await loadSttProviders();
    state.sttProviderForm = null;
    state.modal = 'settings';
    emit();
  } catch (e) { alert(t('alert_save_stt_provider_fail', { err: e.message })); }
}

async function testSttProviderAction(id) {
  try {
    const r = await api.testSttProvider(id);
    alert(r.ok ? t('test_connected', { text: 'OK' }) : t('test_failed', { err: r.error }));
  } catch (e) { alert(t('test_failed', { err: e.message })); }
}

// ---------- Text-to-speech provider settings (audio narration) ----------
function openTtsProviderForm(id) {
  const existing = id ? state.ttsProviders.find((p) => p.id === id) : null;
  state.ttsProviderForm = existing ? { ...existing } : { name: '', baseUrl: '' };
  state.modal = 'tts-provider';
  emit();
}

async function saveTtsProvider(fd) {
  const payload = {
    name: (fd.get('name') || '').trim(),
    baseUrl: (fd.get('baseUrl') || '').trim(),
    apiKey: fd.get('apiKey'), // '' keeps the existing key on update
  };
  if (!payload.name || !payload.baseUrl) return;
  const id = state.ttsProviderForm?.id;
  try {
    if (id) await api.updateTtsProvider(id, payload); else await api.addTtsProvider(payload);
    await loadTtsProviders();
    state.ttsProviderForm = null;
    state.modal = 'settings';
    emit();
  } catch (e) { alert(t('alert_save_tts_provider_fail', { err: e.message })); }
}

async function testTtsProviderAction(id) {
  try {
    const r = await api.testTtsProvider(id);
    alert(r.ok ? t('test_connected', { text: 'OK' }) : t('test_failed', { err: r.error }));
  } catch (e) { alert(t('test_failed', { err: e.message })); }
}

// ---------- Audio narration (Explanations & Study guides) ----------
async function handleGenerateAudio(sourceType, id) {
  const unit = selectedUnit();
  if (!unit || state.unit.generatingAudioIds[id]) return;
  state.unit.generatingAudioIds[id] = true;
  emit();
  try {
    const payload = { aiLanguage: state.aiLanguage, language: state.lang };
    if (sourceType === 'explanation') {
      await api.generateExplanationAudio(id, payload);
      await loadTree();
      state.unit.openExplanations[id] = true; // reveal the new player
    } else {
      const result = await api.generateArtifactAudio(id, payload);
      state.unit.artifacts = state.unit.artifacts.map((a) => (a.id === id ? { ...a, audioId: result.id } : a));
      state.unit.openArtifacts[id] = true;
    }
    delete state.unit.generatingAudioIds[id];
    emit();
  } catch (e) {
    delete state.unit.generatingAudioIds[id];
    emit();
    alert(t('alert_generate_audio_fail', { err: e.message }));
  }
}

const ARTIFACT_BUSY_KEYS = {
  mindmap: 'generatingMindmap',
  infographic: 'generatingInfographic',
  study_guide: 'generatingGuide',
  diagram: 'generatingDiagram',
};
const ARTIFACT_GENERATORS = {
  mindmap: api.generateMindmap,
  infographic: api.generateInfographic,
  study_guide: api.generateStudyGuide,
  diagram: api.generateDiagram,
};

async function handleGenerateArtifact(kind) {
  const u = state.unit;
  const unit = selectedUnit();
  if (!unit) return;
  const busyKey = ARTIFACT_BUSY_KEYS[kind];
  if (u[busyKey]) return;
  setUnit({ [busyKey]: true, studyError: '' });
  const studyExplIds = (u.studyExplanationIds || []).length ? u.studyExplanationIds : undefined;
  try {
    const art = await ARTIFACT_GENERATORS[kind](unit.id, { aiLanguage: state.aiLanguage, explanationIds: studyExplIds });
    if (state.sel.unitId !== unit.id) return;
    state.unit.artifacts = [...state.unit.artifacts, art];
    state.unit.openArtifacts[art.id] = true; // reveal (and draw the markmap) on creation
    setUnit({ [busyKey]: false });
  } catch (e) {
    setUnit({ [busyKey]: false, studyError: e.message || 'Could not generate.' });
  }
}

async function deleteArtifact(id) {
  if (!confirm(t('confirm_delete_artifact'))) return;
  try {
    await api.deleteArtifact(id);
    state.unit.artifacts = state.unit.artifacts.filter((a) => a.id !== id);
    delete state.unit.openArtifacts[id];
    emit();
  } catch (e) { alert(t('alert_delete_artifact_fail', { err: e.message })); }
}

// markmap is loaded on demand from the CDN (same no-build pattern as pdfjs) and
// cached. Mind-map artifacts store a nested Markdown outline; we draw each open
// one into its SVG after every render (innerHTML is rebuilt each time).
let _markmap;
async function loadMarkmap() {
  if (_markmap) return _markmap;
  const [lib, view] = await Promise.all([
    import('https://esm.run/markmap-lib'),
    import('https://esm.run/markmap-view'),
  ]);
  _markmap = { Transformer: lib.Transformer, Markmap: view.Markmap };
  return _markmap;
}

async function renderMarkmaps() {
  const svgs = document.querySelectorAll('svg[data-markmap-id]:not([data-rendered])');
  if (!svgs.length) return;
  try {
    const { Transformer, Markmap } = await loadMarkmap();
    const transformer = new Transformer();
    for (const svg of svgs) {
      const art = state.unit.artifacts.find((a) => a.id === svg.dataset.markmapId);
      if (!art) continue;
      svg.dataset.rendered = '1'; // guard against double-draw on this DOM node
      const { root } = transformer.transform(art.content);
      Markmap.create(svg, null, root);
    }
  } catch (e) {
    console.error('Mind map render failed:', e);
  }
}

// mermaid is loaded on demand from the CDN (same no-build pattern as markmap).
// Diagram artifacts store raw Mermaid syntax; we render each open one into its
// <pre class="mermaid"> placeholder after every render (innerHTML is rebuilt
// each time, so re-render manually instead of relying on mermaid's autostart).
let _mermaid;
async function loadMermaid() {
  if (_mermaid) return _mermaid;
  const mod = await import('https://esm.run/mermaid');
  _mermaid = mod.default;
  _mermaid.initialize({ startOnLoad: false, theme: 'default' });
  return _mermaid;
}

async function renderMermaids() {
  const nodes = document.querySelectorAll('[data-mermaid-id]:not([data-rendered])');
  if (!nodes.length) return;
  try {
    const mermaid = await loadMermaid();
    for (const node of nodes) {
      node.dataset.rendered = '1'; // guard against double-draw on this DOM node
      const art = state.unit.artifacts.find((a) => a.id === node.dataset.mermaidId);
      if (!art) continue;
      try {
        const { svg } = await mermaid.render(`mermaid-svg-${art.id}`, art.content);
        node.innerHTML = svg;
      } catch (e) {
        node.innerHTML = `<p class="text-red-500 text-xs p-3">${escapeHtml(t('diagram_render_fail', { err: e.message }))}</p>`;
      }
    }
  } catch (e) {
    console.error('Diagram render failed:', e);
  }
}

// ---------- mindmap fullscreen overlay ----------
async function openMinimapFullscreen(artifactId) {
  const art = state.unit.artifacts.find((a) => a.id === artifactId);
  if (!art) return;

  const overlay = document.createElement('div');
  overlay.id = 'mindmap-fs-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;display:flex;flex-direction:column;';

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#1e293b;flex-shrink:0;';
  toolbar.innerHTML = `<span style="color:#f1f5f9;font-weight:600;font-size:15px;">${art.title}</span>`;

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.title = 'Cerrar';
  closeBtn.style.cssText = 'color:#94a3b8;background:none;border:none;font-size:24px;line-height:1;cursor:pointer;padding:0 4px;';
  closeBtn.addEventListener('click', () => overlay.remove());
  toolbar.appendChild(closeBtn);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'flex:1;width:100%;display:block;';

  overlay.appendChild(toolbar);
  overlay.appendChild(svg);
  document.body.appendChild(overlay);

  const onKey = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('remove', () => document.removeEventListener('keydown', onKey));

  try {
    const { Transformer, Markmap } = await loadMarkmap();
    const { root } = new Transformer().transform(art.content);
    Markmap.create(svg, null, root);
  } catch (e) {
    console.error('Fullscreen mind map render failed:', e);
  }
}

// ---------- infographic fullscreen overlay ----------
// Infographics are arbitrary LLM-authored HTML/CSS; an iframe (no allow-scripts)
// keeps that markup fully isolated from the app's DOM and Tailwind styles.
function openInfographicFullscreen(artifactId) {
  const art = state.unit.artifacts.find((a) => a.id === artifactId);
  if (!art) return;

  const overlay = document.createElement('div');
  overlay.id = 'infographic-fs-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;display:flex;flex-direction:column;';

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#1e293b;flex-shrink:0;';
  toolbar.innerHTML = `<span style="color:#f1f5f9;font-weight:600;font-size:15px;">${escapeHtml(art.title)}</span>`;

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.title = 'Cerrar';
  closeBtn.style.cssText = 'color:#94a3b8;background:none;border:none;font-size:24px;line-height:1;cursor:pointer;padding:0 4px;';
  closeBtn.addEventListener('click', close);
  toolbar.appendChild(closeBtn);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', '');
  iframe.style.cssText = 'flex:1;width:100%;border:0;display:block;';
  iframe.srcdoc = `<!doctype html><html><body style="margin:0;display:flex;justify-content:center;">${art.content}</body></html>`;

  overlay.appendChild(toolbar);
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);
}

// ---------- diagram fullscreen overlay ----------
async function openDiagramFullscreen(artifactId) {
  const art = state.unit.artifacts.find((a) => a.id === artifactId);
  if (!art) return;

  const overlay = document.createElement('div');
  overlay.id = 'diagram-fs-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;display:flex;flex-direction:column;';

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#1e293b;flex-shrink:0;';
  toolbar.innerHTML = `<span style="color:#f1f5f9;font-weight:600;font-size:15px;">${escapeHtml(art.title)}</span>`;

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.title = 'Cerrar';
  closeBtn.style.cssText = 'color:#94a3b8;background:none;border:none;font-size:24px;line-height:1;cursor:pointer;padding:0 4px;';
  closeBtn.addEventListener('click', close);
  toolbar.appendChild(closeBtn);

  const container = document.createElement('div');
  container.style.cssText = 'flex:1;width:100%;overflow:auto;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;';

  overlay.appendChild(toolbar);
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  try {
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render(`mermaid-svg-fs-${art.id}`, art.content);
    container.innerHTML = svg;
  } catch (e) {
    container.innerHTML = `<p style="color:#dc2626;font-size:13px;">${escapeHtml(t('diagram_render_fail', { err: e.message }))}</p>`;
  }
}

// ---------- server manager ----------
function openServerForm(id) {
  const existing = id ? state.servers.find((s) => s.id === id) : null;
  state.serverForm = existing
    ? { ...existing }
    : { name: '', type: 'openai', baseUrl: '', model: '', multimodalModel: '', embeddingModel: '' };
  state.serverModels = { generative: [], embedding: [] };
  state.serverModelsStatus = '';
  state.modal = 'server';
  emit();
  // Editing an existing server: auto-fetch its models so the dropdowns are ready.
  if (existing && existing.baseUrl) loadServerModels();
}

// Pull the current server-form field values into state.serverForm so they
// survive the re-render triggered by "Load models".
function captureServerForm() {
  const form = document.querySelector('form[data-action="form-server"]');
  if (!form) return;
  const fd = new FormData(form);
  state.serverForm = {
    ...state.serverForm,
    name: fd.get('name') || '',
    type: fd.get('type'),
    baseUrl: (fd.get('baseUrl') || '').trim(),
    model: fd.get('model') || '',
    multimodalModel: fd.get('multimodalModel') || '',
    embeddingModel: fd.get('embeddingModel') || '',
    _apiKeyTyped: fd.get('apiKey') || '',
  };
}

async function loadServerModels() {
  captureServerForm();
  const f = state.serverForm;
  if (!f.baseUrl) { state.serverModelsStatus = t('status_need_base_url'); emit(); return; }
  state.serverModelsStatus = t('status_loading_models');
  emit();
  try {
    const out = await api.listModels({ type: f.type, baseUrl: f.baseUrl, apiKey: f._apiKeyTyped || '', id: f.id });
    if (out.error) {
      state.serverModels = { generative: [], embedding: [] };
      state.serverModelsStatus = t('status_models_error', { err: out.error });
    } else {
      state.serverModels = { generative: out.generative || [], embedding: out.embedding || [] };
      const n = (out.all || out.generative || []).length;
      state.serverModelsStatus = t('status_models_loaded', { n });
    }
  } catch (e) {
    state.serverModelsStatus = t('status_models_error', { err: e.message });
  }
  emit();
}

async function saveServer(fd) {
  const payload = {
    name: (fd.get('name') || '').trim(),
    type: fd.get('type'),
    baseUrl: (fd.get('baseUrl') || '').trim(),
    model: (fd.get('model') || '').trim(),
    multimodalModel: (fd.get('multimodalModel') || '').trim(),
    embeddingModel: (fd.get('embeddingModel') || '').trim(),
    apiKey: fd.get('apiKey'), // '' keeps the existing key on update
  };
  if (!payload.name || !payload.baseUrl) return;
  const id = state.serverForm?.id;
  try {
    if (id) await api.updateServer(id, payload); else await api.addServer(payload);
    await loadServers();
    state.serverForm = null;
    state.modal = 'settings';
    emit();
  } catch (e) { alert(t('alert_save_server_fail', { err: e.message })); }
}

async function testServer(id) {
  try {
    const r = await api.testServer(id);
    alert(r.ok ? t('test_connected', { text: (r.text || '').slice(0, 120) }) : t('test_failed', { err: r.error }));
  } catch (e) { alert(t('test_failed', { err: e.message })); }
}

// ---------- export / import (zip) ----------
function openExportModal(type, id, name) {
  setState({ modal: 'export', exportTarget: { type, id, name } });
}

function submitExport(fd) {
  const target = state.exportTarget;
  if (!target) return;
  const formats = fd.getAll('formats');
  window.location.href = api.exportUrl(target.type, target.id, formats);
  setState({ modal: null, exportTarget: null });
}

async function handleImportFile(file) {
  if (!file) return;
  try {
    const result = await api.importAnalyze(file);
    setState({ modal: 'import-preview', importPreview: { ...result, mode: 'overwrite', busy: false, error: '' } });
  } catch (e) {
    alert(t('alert_import_analyze_fail', { err: e.message }));
  }
}

async function submitImportCommit(fd) {
  const p = state.importPreview;
  if (!p || p.busy) return;
  const payload = {
    mode: fd.get('mode') || 'overwrite',
    targetCourseId: fd.get('targetCourseId') || undefined,
    targetSubjectId: fd.get('targetSubjectId') || undefined,
    newCourseName: (fd.get('newCourseName') || '').trim() || undefined,
    newSubjectName: (fd.get('newSubjectName') || '').trim() || undefined,
  };
  state.importPreview.busy = true;
  state.importPreview.error = '';
  emit();
  try {
    await api.importCommit(p.token, payload);
    await loadTree();
    setState({ modal: null, importPreview: null });
  } catch (e) {
    state.importPreview.busy = false;
    state.importPreview.error = e.message || 'Import failed.';
    emit();
  }
}

// ---------- event delegation ----------
async function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, type, level, mode, modal, open } = el.dataset;
  switch (action) {
    case 'toggle-sidebar': setState({ sidebarOpen: open === 'true' }); break;
    case 'nav-course': state.sel = { courseId: id, subjectId: null, unitId: null }; state.sidebarOpen = false; emit(); break;
    case 'select-item': drill(type, id); break;
    case 'crumb': resetTo(level); break;
    case 'delete-item': deleteItem(type, id); break;
    case 'open-modal':
      pickedFolderFiles = null;
      setState({
        modal, serverForm: null, sttProviderForm: null, structureGen: null,
        settingsTab: 'general', settingsForm: { lang: state.lang, speechEnabled: state.speechEnabled, ttsEnabled: state.ttsEnabled },
      });
      break;
    case 'close-modal': setState({ modal: null, serverForm: null, sttProviderForm: null, settingsForm: null, editingExplanation: null, editingFlashcard: null, termExplain: null, termImage: null, exportTarget: null, importPreview: null, ingestPreview: null, structureGen: null }); break;
    case 'ingest-confirm': submitIngestCommit(); break;
    case 'generate-objectives': handleGenerateObjectives(el); break;
    case 'server-load-models': loadServerModels(); break;
    case 'unit-tab': captureInputs(); captureSourceInputs(); state.unit.selection = null; setUnit({ viewMode: mode }); if (mode === 'sources' || mode === 'generator') ensureRagLoaded(); else if (mode === 'flashcards') ensureFlashcardsLoaded(); else if (mode === 'study') ensureStudyLoaded(); else if (mode === 'teachback') ensureTeachbackLoaded(); break;
    case 'source-mode': captureSourceInputs(); setUnit({ sourceMode: mode, ragError: '' }); break;
    case 'add-source': handleAddSource(); break;
    case 'delete-source': deleteSource(id); break;
    case 'clear-chat': clearChat(); break;
    case 'select-expls-all': {
      const ids = selectedUnit()?.explanations.map((e) => e.id) || [];
      if (el.dataset.target === 'fc') setUnit({ flashcardExplanationIds: ids });
      else if (el.dataset.target === 'teachback') setUnit({ teachbackExplanationIds: ids });
      else setUnit({ studyExplanationIds: ids });
      break;
    }
    case 'select-expls-none':
      if (el.dataset.target === 'fc') setUnit({ flashcardExplanationIds: [] });
      else if (el.dataset.target === 'teachback') setUnit({ teachbackExplanationIds: [] });
      else setUnit({ studyExplanationIds: [] });
      break;
    case 'teachback-record-start': startTeachbackRecording(); break;
    case 'teachback-record-stop': stopTeachbackRecording(); break;
    case 'teachback-submit': submitTeachback(); break;
    case 'delete-teachback': deleteTeachbackItem(id); break;
    case 'toggle-teachback-item': state.unit.openTeachback[id] = !state.unit.openTeachback[id]; emit(); break;
    case 'stt-provider-add': openSttProviderForm(null); break;
    case 'stt-provider-edit': openSttProviderForm(id); break;
    case 'stt-provider-activate': await api.activateSttProvider(id); await loadSttProviders(); emit(); break;
    case 'stt-provider-delete': if (confirm(t('confirm_delete_stt_provider'))) { await api.deleteSttProvider(id); await loadSttProviders(); emit(); } break;
    case 'stt-provider-test': testSttProviderAction(id); break;
    case 'tts-provider-add': openTtsProviderForm(null); break;
    case 'tts-provider-edit': openTtsProviderForm(id); break;
    case 'tts-provider-activate': await api.activateTtsProvider(id); await loadTtsProviders(); emit(); break;
    case 'tts-provider-delete': if (confirm(t('confirm_delete_tts_provider'))) { await api.deleteTtsProvider(id); await loadTtsProviders(); emit(); } break;
    case 'tts-provider-test': testTtsProviderAction(id); break;
    case 'explanation-audio': handleGenerateAudio('explanation', id); break;
    case 'artifact-audio': handleGenerateAudio('study_guide', id); break;
    case 'gen-cards': handleGenerateCards(); break;
    case 'start-review': startReview(el.dataset.scope); break;
    case 'flip-card': state.unit.review.flipped = !state.unit.review.flipped; emit(); break;
    case 'grade-card': gradeCard(el.dataset.grade); break;
    case 'end-review': endReview(); break;
    case 'edit-card': openFlashcardEdit(id); break;
    case 'delete-card': deleteCard(id); break;
    case 'gen-guide': handleGenerateArtifact('study_guide'); break;
    case 'gen-mindmap': handleGenerateArtifact('mindmap'); break;
    case 'gen-infographic': handleGenerateArtifact('infographic'); break;
    case 'gen-diagram': handleGenerateArtifact('diagram'); break;
    case 'toggle-artifact': state.unit.openArtifacts[id] = !state.unit.openArtifacts[id]; emit(); break;
    case 'delete-artifact': deleteArtifact(id); break;
    case 'fullscreen-mindmap': openMinimapFullscreen(id); break;
    case 'fullscreen-infographic': openInfographicFullscreen(id); break;
    case 'fullscreen-diagram': openDiagramFullscreen(id); break;
    case 'toggle-explanation': {
      const willOpen = !state.unit.openExplanations[id];
      state.unit.openExplanations[id] = willOpen;
      emit();
      if (willOpen) { ensureTermsLoaded(id); ensureTermImagesLoaded(id); ensureNotesLoaded(id); }
      break;
    }
    case 'edit-explanation': openExplanationEdit(id); break;
    case 'delete-explanation': deleteExplanation(id); break;
    case 'regenerate-explanation': regenerateExplanation(id); break;
    case 'explain-selection': explainSelection(); break;
    case 'open-term-chip': openTermChip(id, el.dataset.termId); break;
    case 'delete-term-chip': deleteTermChip(id, el.dataset.termId); break;
    case 'illustrate-selection': illustrateSelection(); break;
    case 'open-term-image-chip': openTermImageChip(id, el.dataset.imageId); break;
    case 'delete-term-image-chip': deleteTermImageChip(id, el.dataset.imageId); break;
    case 'term-image-prev': moveTermImageCandidate(-1); break;
    case 'term-image-next': moveTermImageCandidate(1); break;
    case 'term-image-use': useTermImageCandidate(); break;
    case 'add-note-selection': addNoteFromSelection(); break;
    case 'open-note-chip': openNoteChip(id, el.dataset.noteId); break;
    case 'delete-note-chip': if (confirm(t('confirm_delete_note'))) deleteNoteChip(id, el.dataset.noteId); break;
    case 'gen-tab': captureInputs(); setUnit({ inputMode: mode, error: '' }); break;
    case 'generate': captureInputs(); handleGenerate(); break;
    case 'gen-exam': handleGenerateExam(); break;
    case 'submit-exam': handleSubmitExam(); break;
    case 'open-exam': openExam(id); break;
    case 'retake-exam': handleRetakeExam(id); break;
    case 'settings-tab': setState({ settingsTab: el.dataset.tab }); break;
    case 'server-add': openServerForm(null); break;
    case 'server-edit': openServerForm(id); break;
    case 'server-activate': await api.activateServer(id); await loadServers(); emit(); break;
    case 'server-delete': if (confirm(t('confirm_delete_server'))) { await api.deleteServer(id); await loadServers(); emit(); } break;
    case 'server-test': testServer(id); break;
    case 'export-item': openExportModal(type, id, el.dataset.name); break;
    case 'open-import': document.getElementById('import-file-input')?.click(); break;
  }
}

function onChange(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'answer') {
    const index = Number(el.dataset.index);
    state.unit.answers[index] = el.value;
    // Patch label styles in-place — no re-render so scroll position is preserved.
    document.querySelectorAll(`input[name="${el.name}"]`).forEach((radio) => {
      const lbl = radio.closest('label');
      if (!lbl) return;
      const sel = radio.value === el.value;
      lbl.classList.toggle('bg-cyan-500/10', sel);
      lbl.classList.toggle('border-cyan-500/50', sel);
      lbl.classList.toggle('bg-slate-700/50', !sel);
      lbl.classList.toggle('border-slate-700', !sel);
      lbl.classList.toggle('hover:bg-slate-700', !sel);
    });
    // Re-evaluate submit button enabled state.
    const examId = state.unit.activeExamId;
    const exam = selectedUnit()?.exams?.find((x) => x.id === examId);
    if (exam) {
      const mcqIndices = exam.questions.reduce((acc, q, i) => (q.type !== 'written' ? [...acc, i] : acc), []);
      const btn = document.querySelector('[data-action="submit-exam"]');
      if (btn) btn.disabled = !mcqIndices.every((i) => !!state.unit.answers[i]);
    }
  } else if (el.dataset.action === 'pdf') { handlePdf(e.target.files?.[0]); }
  else if (el.dataset.action === 'source-pdf') { handleSourcePdf(e.target.files?.[0]); }
  else if (el.dataset.action === 'toggle-gen-source') {
    captureInputs();
    const { id } = el.dataset;
    state.unit.selectedSourceIds = el.checked
      ? [...(state.unit.selectedSourceIds || []), id]
      : (state.unit.selectedSourceIds || []).filter((sid) => sid !== id);
    emit();
  }
  else if (el.dataset.action === 'toggle-fc-explanation') {
    const { id } = el.dataset;
    state.unit.flashcardExplanationIds = el.checked
      ? [...(state.unit.flashcardExplanationIds || []), id]
      : (state.unit.flashcardExplanationIds || []).filter((eid) => eid !== id);
    emit();
  }
  else if (el.dataset.action === 'toggle-study-explanation') {
    const { id } = el.dataset;
    state.unit.studyExplanationIds = el.checked
      ? [...(state.unit.studyExplanationIds || []), id]
      : (state.unit.studyExplanationIds || []).filter((eid) => eid !== id);
    emit();
  }
  else if (el.dataset.action === 'toggle-teachback-explanation') {
    const { id } = el.dataset;
    state.unit.teachbackExplanationIds = el.checked
      ? [...(state.unit.teachbackExplanationIds || []), id]
      : (state.unit.teachbackExplanationIds || []).filter((eid) => eid !== id);
    emit();
  }
  else if (el.dataset.action === 'import-file') { handleImportFile(e.target.files?.[0]); }
  else if (el.dataset.action === 'import-mode') { state.importPreview.mode = el.value; emit(); }
  else if (el.dataset.action === 'course-source-mode') {
    const folder = el.value === 'folder';
    document.getElementById('ai-source-block')?.classList.toggle('hidden', folder);
    document.getElementById('folder-source-block')?.classList.toggle('hidden', !folder);
  }
  else if (el.dataset.action === 'pick-folder') { handleFolderPick(e.target.files); }
  else if (el.dataset.action === 'toggle-ingest-item') {
    const excluded = { ...state.ingestPreview.excluded };
    if (el.checked) delete excluded[el.dataset.key]; else excluded[el.dataset.key] = true;
    state.ingestPreview.excluded = excluded;
    emit();
  }
  else if (el.dataset.action === 'toggle-autogen') {
    document.getElementById('autogen-options')?.classList.toggle('hidden', !el.checked);
    // Course modal only: block submit until objectives have been generated.
    const form = el.closest('form');
    const objWrap = form?.querySelector('#objectives-textarea-wrap');
    const submitBtn = form?.querySelector('button[type="submit"]');
    if (submitBtn && objWrap) {
      const hasObjectives = !objWrap.classList.contains('hidden') && !!form.querySelector('#objectives-textarea')?.value.trim();
      submitBtn.disabled = el.checked && !hasObjectives;
    }
  }
  else if (el.dataset.action === 'settings-lang') {
    state.settingsForm = { ...state.settingsForm, lang: el.value };
  }
  else if (el.dataset.action === 'settings-speech-toggle') {
    state.settingsForm = { ...state.settingsForm, speechEnabled: el.checked };
    document.getElementById('speech-provider-config')?.classList.toggle('hidden', !el.checked);
  }
  else if (el.dataset.action === 'settings-tts-toggle') {
    state.settingsForm = { ...state.settingsForm, ttsEnabled: el.checked };
    document.getElementById('tts-provider-config')?.classList.toggle('hidden', !el.checked);
  }
}

// Live-sync the generator textareas into state and toggle the Generate button,
// without re-rendering (so focus/caret are preserved while typing).
function onInput(e) {
  if (e.target.id === 'prompt') { state.unit.prompt = e.target.value; updateGenerateButton(); }
  else if (e.target.id === 'context') { state.unit.contextText = e.target.value; updateGenerateButton(); }
  else if (e.target.id === 'source-text') { state.unit.sourceText = e.target.value; updateAddSourceButton(); }
  else if (e.target.id === 'source-url') { state.unit.sourceUrl = e.target.value; updateAddSourceButton(); }
  else if (e.target.id === 'chat-input') { state.unit.chatInput = e.target.value; updateChatSendButton(); }
  else if (e.target.dataset?.action === 'written-answer') {
    // Store written answer in state without re-rendering (preserves caret).
    state.unit.answers[Number(e.target.dataset.index)] = e.target.value;
  }
  else if (e.target.id === 'new-name-input') {
    const show = e.target.value.trim().length > 5;
    const wrap = document.getElementById('autogen-toggle-wrap');
    wrap?.classList.toggle('hidden', !show);
    if (!show) {
      const cb = wrap?.querySelector('input[name="autogen"]');
      if (cb) cb.checked = false;
      document.getElementById('autogen-options')?.classList.add('hidden');
    }
  }
  else if (e.target.dataset?.action === 'autogen-slider') {
    const lbl = document.querySelector(`[data-slider-label="${e.target.name}"]`);
    if (lbl) lbl.textContent = e.target.value;
  }
  else if (e.target.id === 'objectives-textarea') {
    const submitBtn = e.target.closest('form')?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = !e.target.value.trim();
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && state.unit.selection) {
    state.unit.selection = null;
    emit();
    return;
  }
  // Enter sends the chat message; Shift+Enter inserts a newline.
  if (e.target.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendChat();
    return;
  }
  // Flashcard review shortcuts (ignore while typing in a field).
  const r = state.unit.review;
  if (r?.active && state.unit.viewMode === 'flashcards' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    if ((e.key === ' ' || e.key === 'Enter') && !r.flipped && r.pos < r.queue.length) {
      e.preventDefault(); state.unit.review.flipped = true; emit(); return;
    }
    if (r.flipped) {
      const map = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };
      if (map[e.key]) { e.preventDefault(); gradeCard(map[e.key]); }
    }
  }
}

async function onSubmit(e) {
  const form = e.target.closest('form[data-action]');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  switch (form.dataset.action) {
    case 'form-course': {
      const name = (fd.get('name') || '').trim();
      if (!name) return;
      if ((fd.get('sourceMode') || 'ai') === 'folder') {
        await handleCreateCourseFromFolder(name, fd);
        break;
      }
      const created = await api.addCourse(name);
      await loadTree();
      await maybeGenerateStructure(fd, () => api.generateCourseStructure(created.id, {
        numSubjects: fd.get('numSubjects'), numUnitsPerSubject: fd.get('numUnitsPerSubject'), numExplanationsPerUnit: fd.get('numExplanationsPerUnit'),
        aiLanguage: state.aiLanguage, objectives: (fd.get('objectives') || '').trim(),
      }));
      break;
    }
    case 'form-subject': {
      const name = (fd.get('name') || '').trim();
      if (!name || !state.sel.courseId) return;
      const created = await api.addSubject(state.sel.courseId, name);
      await loadTree();
      await maybeGenerateStructure(fd, () => api.generateSubjectStructure(created.id, {
        numUnits: fd.get('numUnits'), numExplanationsPerUnit: fd.get('numExplanationsPerUnit'),
        aiLanguage: state.aiLanguage,
      }));
      break;
    }
    case 'form-unit': {
      const name = (fd.get('name') || '').trim();
      if (!name || !state.sel.subjectId) return;
      const created = await api.addUnit(state.sel.subjectId, name);
      await loadTree();
      await maybeGenerateStructure(fd, () => api.generateUnitStructure(created.id, {
        numExplanations: fd.get('numExplanations'),
        aiLanguage: state.aiLanguage,
      }));
      break;
    }
    case 'form-settings': {
      const sf = state.settingsForm || {};
      state.lang = sf.lang || state.lang;
      state.aiLanguage = aiLangFor(state.lang); // one picker drives UI + AI output
      state.speechEnabled = !!sf.speechEnabled;
      state.ttsEnabled = !!sf.ttsEnabled;
      // Don't leave the Teach-back tab "open" behind a now-hidden tab.
      if (!state.speechEnabled && state.unit.viewMode === 'teachback') state.unit.viewMode = 'explanations';
      setState({ modal: null, settingsForm: null, settingsTab: 'general' });
      api.updateSettings({ lang: state.lang, speechEnabled: state.speechEnabled ? '1' : '0', ttsEnabled: state.ttsEnabled ? '1' : '0' })
        .catch((e) => console.error('Could not save settings:', e.message));
      break;
    }
    case 'form-server': await saveServer(fd); break;
    case 'form-stt-provider': await saveSttProvider(fd); break;
    case 'form-tts-provider': await saveTtsProvider(fd); break;
    case 'form-chat': handleSendChat(); break;
    case 'form-add-card': {
      const unit = selectedUnit();
      const front = (fd.get('front') || '').trim();
      const back = (fd.get('back') || '').trim();
      if (!unit || !front || !back) return;
      try {
        const card = await api.addFlashcard(unit.id, { front, back });
        state.unit.flashcards = [...state.unit.flashcards, card];
        setUnit({ fcError: '' });
      } catch (e) { setUnit({ fcError: e.message || 'Could not add card.' }); }
      break;
    }
    case 'form-flashcard-edit': {
      const id = state.editingFlashcard?.id;
      if (!id) return;
      const updated = await api.updateFlashcard(id, { front: (fd.get('front') || '').trim(), back: (fd.get('back') || '').trim() });
      const idx = state.unit.flashcards.findIndex((c) => c.id === id);
      if (idx >= 0) state.unit.flashcards[idx] = updated;
      setState({ modal: null, editingFlashcard: null });
      break;
    }
    case 'form-explanation-edit': {
      const id = state.editingExplanation?.id;
      if (!id) return;
      await api.updateExplanation(id, { prompt: (fd.get('prompt') || '').trim(), content: fd.get('content') || '' });
      await loadTree();
      setState({ modal: null, editingExplanation: null });
      break;
    }
    case 'form-note': {
      const n = state.editingNote;
      if (!n?.explanationId) return;
      const content = (fd.get('content') || '').trim();
      const label = fd.get('label') || null;
      if (!content) return;
      const data = { content, label, anchorText: n.anchorText || null };
      const saved = n.id ? await api.updateNote(n.id, data) : await api.addNote(n.explanationId, data);
      const list = (state.unit.notes[n.explanationId] || []).filter((x) => x.id !== saved.id);
      state.unit.notes[n.explanationId] = [...list, saved];
      setState({ modal: null, editingNote: null });
      break;
    }
    case 'form-export': submitExport(fd); break;
    case 'form-import-commit': await submitImportCommit(fd); break;
  }
}

// ---------- boot ----------
subscribe(render);
document.addEventListener('click', onClick);
document.addEventListener('mouseup', onTextSelection);
document.addEventListener('change', onChange);
document.addEventListener('input', onInput);
document.addEventListener('keydown', onKeydown);
document.addEventListener('submit', onSubmit);

(async function init() {
  render();
  let settings = {};
  try {
    [, , , , settings] = await Promise.all([loadTree(), loadServers(), loadSttProviders(), loadTtsProviders(), api.getSettings()]);
  } catch (e) { console.error('Init load failed:', e); }
  applySettings(settings);
  state.aiLanguage = aiLangFor(state.lang);

  // Migration: the Speech master switch defaults to off (opt-in), but a user
  // who never touched it and already has a speech-to-text provider configured
  // (from before this toggle existed) should keep seeing the Teach-back tab —
  // flip the default on, once, and remember the choice from then on.
  const settingsPatch = {};
  if (settings.speechEnabled === undefined && state.sttProviders.length) {
    state.speechEnabled = true;
    settingsPatch.speechEnabled = '1';
  }
  // First-run onboarding: show the workflow overview once (U3).
  const firstRun = !state.welcomed;
  if (firstRun) settingsPatch.welcomed = '1';
  if (Object.keys(settingsPatch).length) {
    api.updateSettings(settingsPatch).catch((e) => console.error('Could not save settings:', e.message));
  }
  setState({ loading: false, modal: firstRun ? 'welcome' : state.modal });
})();
