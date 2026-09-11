import { state } from '../state.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { escapeHtml, renderMarkdown, renderMarkdownInline } from '../ui.js';
import { renderFlashcards, dueCount } from './flashcards.js';
import { renderStudy } from './study.js';
import { renderTeachback } from './teachback.js';

const TAB_COLORS = {
  generator:    { active: 'bg-cyan-500/20 text-cyan-300 border-b-2 border-cyan-500',    inactive: 'text-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-300' },
  explanations: { active: 'bg-violet-500/20 text-violet-300 border-b-2 border-violet-500', inactive: 'text-violet-500/50 hover:bg-violet-500/10 hover:text-violet-300' },
  sources:      { active: 'bg-emerald-500/20 text-emerald-300 border-b-2 border-emerald-500', inactive: 'text-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300' },
  flashcards:   { active: 'bg-amber-500/20 text-amber-300 border-b-2 border-amber-500',  inactive: 'text-amber-500/50 hover:bg-amber-500/10 hover:text-amber-300' },
  study:        { active: 'bg-blue-500/20 text-blue-300 border-b-2 border-blue-500',     inactive: 'text-blue-500/50 hover:bg-blue-500/10 hover:text-blue-300' },
  exam:         { active: 'bg-rose-500/20 text-rose-300 border-b-2 border-rose-500',     inactive: 'text-rose-500/50 hover:bg-rose-500/10 hover:text-rose-300' },
  teachback:    { active: 'bg-pink-500/20 text-pink-300 border-b-2 border-pink-500',     inactive: 'text-pink-500/50 hover:bg-pink-500/10 hover:text-pink-300' },
};

function viewTab(iconName, label, mode, count) {
  const active = state.unit.viewMode === mode;
  const colors = TAB_COLORS[mode] || { active: 'bg-slate-800/80 text-white', inactive: 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200' };
  const cls = active ? colors.active : colors.inactive;
  const badge = count != null ? `<span class="ml-1 text-xs bg-slate-700 rounded-full px-2 py-0.5">${count}</span>` : '';
  return `<button data-action="unit-tab" data-mode="${mode}" class="flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-md transition-colors ${cls}">${icon(iconName, 'w-5 h-5')}<span>${label}</span>${badge}</button>`;
}

// Chips are numbered to match the inline [n] markers injected (in app.js) at every
// occurrence of the same term within the rendered content — a paper-citation feel.
function renderTermChips(exp) {
  const terms = state.unit.termExplanations[exp.id] || [];
  if (!terms.length) return '';
  return `<div class="mt-3 pt-3 border-t border-slate-700/60 flex flex-wrap gap-1.5">
    ${terms.map((te, i) => `<span class="inline-flex items-center text-xs bg-violet-500/10 text-violet-300 border border-violet-500/30 rounded-full">
      <button type="button" data-action="open-term-chip" data-id="${exp.id}" data-term-id="${te.id}" title="${t('term_chip_hint')}" class="pl-2.5 pr-1 py-1 hover:underline">[${i + 1}] ${escapeHtml(te.term)}</button>
      <button type="button" data-action="delete-term-chip" data-id="${exp.id}" data-term-id="${te.id}" title="${t('action_delete')}" class="pr-1.5 py-1 hover:text-red-400">${icon('x', 'w-3 h-3')}</button>
    </span>`).join('')}
  </div>`;
}

// Term illustrations — same numbered-chip layout as term explanations, but a
// thumbnail instead of a text preview; attribution/license live in the modal.
function renderTermImageChips(exp) {
  const images = state.unit.termImages[exp.id] || [];
  if (!images.length) return '';
  return `<div class="mt-3 pt-3 border-t border-slate-700/60 flex flex-wrap gap-1.5">
    ${images.map((ti) => `<span class="inline-flex items-center text-xs bg-teal-500/10 text-teal-300 border border-teal-500/30 rounded-full">
      <button type="button" data-action="open-term-image-chip" data-id="${exp.id}" data-image-id="${ti.id}" title="${t('term_image_chip_hint')}" class="pl-1 pr-1 py-1 hover:underline flex items-center gap-1">
        <img src="${escapeHtml(ti.url)}" alt="" class="w-4 h-4 rounded-full object-cover flex-shrink-0">${escapeHtml(ti.term)}
      </button>
      <button type="button" data-action="delete-term-image-chip" data-id="${exp.id}" data-image-id="${ti.id}" title="${t('action_delete')}" class="pr-1.5 py-1 hover:text-red-400">${icon('x', 'w-3 h-3')}</button>
    </span>`).join('')}
  </div>`;
}

// Chip color by quick label — keeps "important" notes visually distinct from
// plain ones when scanning a long explanation.
const NOTE_LABEL_COLORS = {
  important: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  doubt: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  review: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
};
const noteColor = (label) => NOTE_LABEL_COLORS[label] || 'bg-slate-700/50 text-slate-300 border-slate-600';

// User notes — same chip layout as term explanations, but free-form content
// (so the chip shows a short preview rather than the full text) and colored by
// the note's quick label instead of being numbered.
function renderNoteChips(exp) {
  const notes = state.unit.notes[exp.id] || [];
  if (!notes.length) return '';
  return `<div class="mt-3 pt-3 border-t border-slate-700/60 flex flex-wrap gap-1.5">
    ${notes.map((n) => {
      const text = n.content || '';
      const preview = text.length > 40 ? `${text.slice(0, 40)}…` : text;
      return `<span class="inline-flex items-center text-xs ${noteColor(n.label)} border rounded-full">
        <button type="button" data-action="open-note-chip" data-id="${exp.id}" data-note-id="${n.id}" title="${t('note_chip_hint')}" class="pl-2.5 pr-1 py-1 hover:underline flex items-center gap-1">${icon('stickyNote', 'w-3 h-3')}${escapeHtml(preview)}</button>
        <button type="button" data-action="delete-note-chip" data-id="${exp.id}" data-note-id="${n.id}" title="${t('action_delete')}" class="pr-1.5 py-1 hover:text-red-400">${icon('x', 'w-3 h-3')}</button>
      </span>`;
    }).join('')}
  </div>`;
}

// Verified real-world links (article/video) attached server-side when the active
// LLM is "reliable" enough for citations — see server/services/citations.js.
function renderCitations(exp) {
  const cites = exp.citations || [];
  if (!cites.length) return '';
  return `<div class="mt-3 pt-3 border-t border-slate-700/60">
    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">${t('further_reading')}</p>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      ${cites.map((c) => `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer"
        class="block rounded-md bg-slate-900/40 border border-slate-700 hover:border-violet-500/50 hover:bg-slate-900/60 transition-colors overflow-hidden">
        ${c.imageUrl
          ? `<img src="${escapeHtml(c.imageUrl)}" alt="" loading="lazy" class="w-full h-20 object-cover">`
          : `<div class="w-full h-20 flex items-center justify-center text-violet-400">${icon(c.type === 'video' ? 'play' : 'link', 'w-6 h-6')}</div>`}
        <span class="flex items-center gap-1 p-1.5 text-xs text-slate-300 truncate">${icon(c.type === 'video' ? 'play' : 'link', 'w-3 h-3 flex-shrink-0 text-violet-400')} <span class="truncate">${escapeHtml(c.title || c.url)}</span></span>
      </a>`).join('')}
    </div>
  </div>`;
}

// Floating "Explain"/"Add note" trigger shown next to an active text selection
// (fixed-position, rendered above everything). Kept OUT of renderUnit's own
// template and updated imperatively instead (see app.js syncSelectionTrigger) —
// going through the normal full re-render on every text selection would replace
// the DOM nodes the browser's native Selection points into, collapsing it
// before the user can Ctrl+C/right-click-copy what they just selected.
export function renderSelectionTrigger() {
  const sel = state.unit.selection;
  if (!sel || state.unit.viewMode !== 'explanations') return '';
  return `<div style="position:fixed;left:${sel.x}px;top:${sel.y}px;transform:translate(-50%,-110%);" class="z-50 flex items-center gap-1.5 animate-fade-in">
    <button type="button" data-action="explain-selection" class="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">${icon('sparkles', 'w-3.5 h-3.5')}${t('term_explain_btn')}</button>
    <button type="button" data-action="illustrate-selection" class="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">${icon('image', 'w-3.5 h-3.5')}${t('term_illustrate_btn')}</button>
    <button type="button" data-action="add-note-selection" class="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">${icon('stickyNote', 'w-3.5 h-3.5')}${t('add_note')}</button>
  </div>`;
}

function renderExplanations(unit) {
  if (!unit.explanations.length) {
    return `<div class="text-center p-12 bg-slate-800/50 border border-dashed border-slate-700 rounded-lg">
      ${icon('notebookText', 'mx-auto h-12 w-12 text-slate-500')}
      <h2 class="mt-4 text-xl font-semibold text-white">${t('expl_empty_title')}</h2>
      <p class="mt-2 text-slate-400">${t('expl_empty_hint')}</p>
    </div>`;
  }
  const open = state.unit.openExplanations || {};
  return `<div data-scroll-id="explanations" class="flex-1 overflow-y-auto space-y-3 pr-2 -mr-2 sm:pr-4 sm:-mr-4">
    ${unit.explanations.map((exp) => {
      const isOpen = !!open[exp.id];
      const isRegen = state.unit.regeneratingId === exp.id;
      const isGeneratingAudio = !!state.unit.generatingAudioIds[exp.id];
      const audioBtn = state.ttsEnabled
        ? `<button data-action="explanation-audio" data-id="${exp.id}" ${isGeneratingAudio ? 'disabled' : ''} title="${exp.audioId ? t('action_regenerate_audio') : t('action_generate_audio')}" class="p-1.5 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-700 disabled:opacity-50">${icon(isGeneratingAudio ? 'loader' : 'volume2', `w-4 h-4 ${isGeneratingAudio ? 'animate-spin' : ''}`)}</button>`
        : '';
      const actions = isRegen
        ? `<span class="flex items-center gap-1.5 text-xs text-cyan-400 px-2">${icon('loader', 'w-4 h-4 animate-spin')} ${t('regenerating')}</span>`
        : `${audioBtn}
           <button data-action="edit-explanation" data-id="${exp.id}" title="${t('action_edit')}" class="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700">${icon('pencil', 'w-4 h-4')}</button>
           <button data-action="regenerate-explanation" data-id="${exp.id}" title="${t('action_regenerate')}" class="p-1.5 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-700">${icon('refresh', 'w-4 h-4')}</button>
           <button data-action="delete-explanation" data-id="${exp.id}" title="${t('action_delete')}" class="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700">${icon('trash', 'w-4 h-4')}</button>`;
      return `<div class="bg-slate-800/50 border border-slate-700 rounded-lg animate-fade-in overflow-hidden">
        <div class="flex items-center gap-2 p-4 sm:p-5">
          <button data-action="toggle-explanation" data-id="${exp.id}" aria-expanded="${isOpen}" class="flex-1 min-w-0 flex items-center gap-3 text-left">
            <span class="flex-shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}">${icon('chevronDown', 'w-5 h-5')}</span>
            <span class="flex-1 min-w-0">
              <span class="text-xs font-semibold text-cyan-400 uppercase tracking-wider">${t('label_prompt')}</span>
              <span class="block text-white font-medium truncate">${escapeHtml(exp.prompt)}</span>
            </span>
          </button>
          <div class="flex items-center gap-1 flex-shrink-0">${actions}</div>
        </div>
        ${isOpen ? `<div class="px-4 pb-5 sm:px-5 pt-4 border-t border-slate-700/60">
          ${exp.audioId ? `<audio controls preload="none" src="/api/audio/${exp.audioId}/file" class="w-full h-9 mb-3"></audio>` : ''}
          <div class="prose prose-invert prose-sm max-w-none text-slate-300" data-expl-content data-expl-id="${exp.id}">${renderMarkdown(exp.content)}</div>
          ${renderTermChips(exp)}
          ${renderTermImageChips(exp)}
          ${renderCitations(exp)}
          ${renderNoteChips(exp)}
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

// Whether the Generate button should be enabled for the current unit state.
// Exported so app.js can toggle the button live as the user types (no re-render).
export function canGenerate(u) {
  const prompt = (u.prompt || '').trim();
  if (u.inputMode === 'simple') return !!prompt;
  if (u.inputMode === 'context') return !!(prompt && (u.contextText || '').trim());
  if (u.inputMode === 'pdf') return !!(prompt && (u.pdfText || '').trim() && !u.parsingPdf);
  return false;
}

function renderGenerator(unit) {
  const u = state.unit;
  const genTab = (iconName, label, mode) => {
    const a = u.inputMode === mode;
    return `<button data-action="gen-tab" data-mode="${mode}" class="flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium transition-colors ${a ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-white hover:border-slate-500'}">${icon(iconName, 'w-5 h-5')}<span>${label}</span></button>`;
  };

  const ok = canGenerate(u);

  const contextBlock = u.inputMode === 'context' ? `
    <div>
      <label class="block text-sm font-medium text-slate-400 mb-2">${t('gen_paste_label')}</label>
      <textarea id="context" rows="8" ${u.generating ? 'disabled' : ''} placeholder="${t('gen_paste_ph')}" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-4 resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none">${escapeHtml(u.contextText)}</textarea>
    </div>` : '';

  const pdfBlock = u.inputMode === 'pdf' ? `
    <div>
      <label class="block text-sm font-medium text-slate-400 mb-2">${t('gen_pdf_label')}</label>
      <label class="mt-2 flex justify-center rounded-lg border border-dashed border-slate-700 px-6 py-10 cursor-pointer hover:border-cyan-500/50">
        <div class="text-center">
          ${icon('fileUp', 'mx-auto h-12 w-12 text-slate-500')}
          <div class="mt-4 flex text-sm leading-6 text-slate-400 justify-center"><span class="font-semibold text-cyan-400">${t('gen_upload')}</span><p class="pl-1">${t('gen_drag')}</p></div>
          <p class="text-xs leading-5 text-slate-500">${t('gen_pdf_limit')}</p>
          <input type="file" class="sr-only" accept=".pdf,.docx,.pptx,.xlsx,.md,.html,.xml" data-action="pdf" ${u.parsingPdf || u.generating ? 'disabled' : ''} />
        </div>
      </label>
      ${u.parsingPdf ? `<div class="mt-3 flex items-center gap-2 text-sm text-slate-400">${icon('loader', 'w-4 h-4 animate-spin')} ${t('gen_extracting')}</div>` : ''}
      ${u.pdfName && !u.parsingPdf && !u.error ? `<div class="mt-3 flex items-center gap-2 text-sm text-green-400">${icon('file', 'w-4 h-4')} ${t('gen_ready', { name: escapeHtml(u.pdfName) })}</div>` : ''}
      ${u.pdfName && u.error && !u.parsingPdf ? `<div class="mt-3 flex items-center gap-2 text-sm text-red-400">${icon('file', 'w-4 h-4')} ${escapeHtml(u.pdfName)} — ${escapeHtml(u.error)}</div>` : ''}
    </div>` : '';

  const promptLabel = u.inputMode === 'context' ? t('gen_q_text')
    : u.inputMode === 'pdf' ? t('gen_q_pdf')
    : t('gen_q_simple');
  const promptPh = u.inputMode === 'context' ? t('gen_ph_text')
    : u.inputMode === 'pdf' ? t('gen_ph_pdf')
    : t('gen_ph_simple');

  // "Ground in sources" panel — shows available unit sources as a checklist.
  const selIds = u.selectedSourceIds || [];
  let sourcesBody;
  if (!u.ragLoaded) {
    sourcesBody = `<div class="flex items-center gap-2 text-xs text-slate-400 px-1 py-2">${icon('loader', 'w-3.5 h-3.5 animate-spin')} ${t('gen_no_sources')}</div>`;
  } else if (!u.sources.length) {
    sourcesBody = `<p class="text-xs text-slate-500 px-1 py-2">${t('gen_no_sources')}</p>`;
  } else {
    const items = u.sources.map((s) => {
      const srcIcon = s.mime === 'text/html' ? 'link' : s.mime === 'application/pdf' ? 'fileUp' : 'clipboard';
      const checked = selIds.includes(s.id);
      return `<label class="flex items-center gap-3 p-2 rounded-md hover:bg-slate-800/60 cursor-pointer select-none">
        <input type="checkbox" data-action="toggle-gen-source" data-id="${s.id}" ${checked ? 'checked' : ''} ${u.generating ? 'disabled' : ''} class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-600 focus:ring-cyan-500 flex-shrink-0" />
        <span class="text-slate-400 flex-shrink-0">${icon(srcIcon, 'w-4 h-4')}</span>
        <div class="flex-1 min-w-0">
          <div class="text-sm text-white truncate">${escapeHtml(s.filename)}</div>
          <div class="text-[11px] text-slate-500">${s.chunkCount ?? 0} chunk${s.chunkCount === 1 ? '' : 's'}</div>
        </div>
      </label>`;
    }).join('');
    sourcesBody = `<div class="space-y-0.5">${items}</div>`;
  }
  const selBadge = selIds.length
    ? `<span class="text-xs bg-cyan-600 text-white rounded-full px-2 py-0.5">${t('gen_sources_selected', { n: selIds.length })}</span>`
    : '';
  const sourcesPanel = `<div class="border border-slate-700 rounded-lg overflow-hidden">
    <div class="px-3 py-2.5 bg-slate-800/40 flex items-center justify-between">
      <span class="text-sm font-medium text-slate-300 flex items-center gap-2">${icon('layers', 'w-4 h-4 text-cyan-400')} ${t('gen_ground_sources')}</span>
      ${selBadge}
    </div>
    <div class="px-2 py-1.5 max-h-40 overflow-y-auto">${sourcesBody}</div>
  </div>`;

  return `<div class="pt-2">
    <div class="mb-4"><div class="flex border-b border-slate-700 flex-wrap">
      ${genTab('sparkles', t('gen_simple'), 'simple')}
      ${genTab('clipboard', t('gen_text'), 'context')}
      ${genTab('fileUp', t('gen_pdf'), 'pdf')}
    </div></div>
    <div class="space-y-4">
      ${contextBlock}
      ${pdfBlock}
      ${sourcesPanel}
      <div class="relative">
        <label class="block text-sm font-medium text-slate-400 mb-2">${promptLabel}</label>
        <textarea id="prompt" rows="3" ${u.generating ? 'disabled' : ''} placeholder="${promptPh}" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-4 pr-4 sm:pr-48 resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none">${escapeHtml(u.prompt)}</textarea>
        <button data-action="generate" ${u.generating || !ok ? 'disabled' : ''} class="w-full mt-4 sm:mt-0 sm:w-auto sm:absolute sm:right-4 sm:bottom-4 flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
          ${u.generating ? `${icon('loader', 'w-5 h-5 animate-spin')}<span>${t('generating')}</span>` : `${icon('sparkles', 'w-5 h-5')}<span>${t('generate')}</span>`}
        </button>
      </div>
    </div>
    ${u.error ? `<p class="mt-2 text-sm text-red-400">${escapeHtml(u.error)}</p>` : ''}
  </div>`;
}

function renderExam(unit) {
  const u = state.unit;
  const canGenerate = !u.generatingExam && unit.explanations.length > 0;

  // ---- Empty state ----
  if (!unit.exams?.length) {
    return `<div class="text-center p-12 bg-slate-800/50 border border-dashed border-slate-700 rounded-lg animate-fade-in">
      ${icon('fileQuestion', 'mx-auto h-12 w-12 text-slate-500')}
      <h2 class="mt-4 text-xl font-semibold text-white">${t('exam_empty_title')}</h2>
      <p class="mt-2 text-slate-400 max-w-md mx-auto">${t('exam_empty_hint')}</p>
      <button data-action="gen-exam" ${canGenerate ? '' : 'disabled'} class="mt-6 flex mx-auto items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
        ${u.generatingExam ? `${icon('loader', 'w-5 h-5 animate-spin')}<span>${t('exam_generating')}</span>` : `${icon('sparkles', 'w-5 h-5')}<span>${t('exam_generate')}</span>`}
      </button>
      ${unit.explanations.length === 0 ? `<p class="mt-3 text-xs text-amber-400">${t('exam_need_expl')}</p>` : ''}
      ${u.error ? `<p class="mt-3 text-sm text-red-400">${escapeHtml(u.error)}</p>` : ''}
    </div>`;
  }

  // ---- Accordion (newest first) ----
  const sorted = [...unit.exams].reverse();

  const items = sorted.map((exam, idx) => {
    const examNumber = unit.exams.length - idx;
    const isOpen = u.activeExamId === exam.id;
    const mcqCount = exam.questions.filter((q) => q.type !== 'written').length;
    const writtenCount = exam.questions.length - mcqCount;
    const typeSummary = writtenCount > 0
      ? `${mcqCount} MCQ · ${writtenCount} ${t('exam_written_badge')}`
      : `${mcqCount} MCQ`;
    const dateStr = new Date(exam.createdAt * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

    let scoreBadge = '';
    if (exam.result) {
      const pct = exam.result.totalScore ?? (mcqCount > 0 ? Math.round((exam.result.score / mcqCount) * 100) : 0);
      const color = pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400';
      scoreBadge = `<span class="ml-auto font-bold text-sm ${color}">${pct}%</span>`;
    }

    const header = `<button data-action="open-exam" data-id="${exam.id}" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/50 text-left transition-colors${isOpen ? ' bg-slate-700/30' : ''}">
      <span class="text-slate-400 flex-shrink-0" style="transition:transform 0.2s;${isOpen ? 'transform:rotate(90deg)' : ''}">${icon('chevronRight', 'w-4 h-4')}</span>
      <span class="font-semibold text-white text-sm">${t('exam_label')} #${examNumber}</span>
      <span class="text-xs text-slate-400 ml-1">${dateStr}</span>
      <span class="text-xs text-slate-500 ml-1">· ${typeSummary}</span>
      ${scoreBadge}
    </button>`;

    if (!isOpen) {
      return `<div class="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">${header}</div>`;
    }

    // ---- Taking view (no result yet) ----
    if (!exam.result) {
      const hasWritten = writtenCount > 0;
      const mcqIndices = exam.questions.reduce((acc, q, i) => (q.type !== 'written' ? [...acc, i] : acc), []);
      const allMCQAnswered = mcqIndices.every((i) => !!u.answers[i]);

      const questions = exam.questions.map((q, index) => {
        if (q.type === 'written') {
          return `<div class="bg-slate-900/40 border border-slate-700 rounded-lg p-5">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-xs font-semibold uppercase tracking-wider text-rose-400/70 bg-rose-500/10 px-2 py-0.5 rounded-full">${t('exam_written_badge')}</span>
            </div>
            <p class="font-semibold text-white mb-4">${index + 1}. ${renderMarkdownInline(q.questionText)}</p>
            <textarea data-action="written-answer" data-index="${index}" rows="4" placeholder="${t('exam_written_ph')}" class="w-full bg-slate-900/50 border border-slate-700 rounded-md p-3 text-sm resize-none focus:ring-2 focus:ring-rose-500/50 focus:outline-none text-slate-200">${escapeHtml(u.answers[index] || '')}</textarea>
          </div>`;
        }
        const options = (q.options || []).map((option) => {
          const checked = u.answers[index] === option;
          return `<label class="p-3 rounded-md border text-sm flex items-center gap-3 cursor-pointer transition-colors ${checked ? 'bg-cyan-500/10 border-cyan-500/50' : 'bg-slate-700/50 border-slate-700 hover:bg-slate-700'}">
            <input type="radio" name="q-${exam.id}-${index}" data-action="answer" data-index="${index}" value="${escapeHtml(option)}" ${checked ? 'checked' : ''} class="w-4 h-4 text-cyan-600 bg-slate-800 border-slate-600 focus:ring-cyan-500" />
            <span>${escapeHtml(option)}</span>
          </label>`;
        }).join('');
        return `<div class="bg-slate-900/40 border border-slate-700 rounded-lg p-5">
          <p class="font-semibold text-white mb-4">${index + 1}. ${renderMarkdownInline(q.questionText)}</p>
          <div class="space-y-3">${options}</div>
        </div>`;
      }).join('');

      const body = `<div class="border-t border-slate-700 p-4 space-y-4">
        ${questions}
        <div class="pt-2">
          <button data-action="submit-exam" ${allMCQAnswered ? '' : 'disabled'} class="w-full flex justify-center items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-3 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">${t('exam_submit')}</button>
          ${!allMCQAnswered ? `<p class="text-center text-sm text-slate-400 mt-2">${hasWritten ? t('exam_answer_mcq') : t('exam_answer_all')}</p>` : ''}
        </div>
      </div>`;
      return `<div class="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">${header}${body}</div>`;
    }

    // ---- Results view ----
    const writtenFeedback = exam.result.writtenFeedback;
    const hasWritten = writtenCount > 0;
    const isBusy = u.generatingFeedback || u.writtenGrading;

    const scoreBlock = hasWritten
      ? `<div class="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 my-3">
          <div class="text-center">
            <div class="text-xs uppercase tracking-wider text-slate-500 mb-0.5">MCQ</div>
            <div class="text-2xl font-extrabold text-cyan-400">${exam.result.score} / ${mcqCount}</div>
          </div>
          ${writtenFeedback ? `
          <div class="text-center">
            <div class="text-xs uppercase tracking-wider text-slate-500 mb-0.5">${t('exam_written_badge')}</div>
            <div class="text-2xl font-extrabold text-amber-400">${exam.result.writtenScore ?? 0}%</div>
          </div>
          <div class="text-center">
            <div class="text-xs uppercase tracking-wider text-slate-500 mb-0.5">Total</div>
            <div class="text-3xl font-extrabold text-white">${exam.result.totalScore ?? 0}%</div>
          </div>` : ''}
        </div>`
      : `<p class="text-4xl font-extrabold text-cyan-400 my-2">${exam.result.score} / ${exam.questions.length}</p>`;

    const resultQuestions = exam.questions.map((q, index) => {
      const studentAnswer = exam.result.answers[index];

      if (q.type === 'written') {
        const wf = writtenFeedback?.find((x) => x.id === q.id);
        return `<div class="bg-slate-900/40 border border-slate-700 rounded-lg p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-xs font-semibold uppercase tracking-wider text-rose-400/70 bg-rose-500/10 px-2 py-0.5 rounded-full">${t('exam_written_badge')}</span>
            ${wf ? `<span class="ml-auto text-sm font-bold ${wf.score >= 7 ? 'text-green-400' : wf.score >= 4 ? 'text-amber-400' : 'text-red-400'}">${wf.score}/10</span>` : ''}
          </div>
          <p class="font-semibold text-white mb-4">${index + 1}. ${renderMarkdownInline(q.questionText)}</p>
          <div class="bg-slate-900/60 border border-slate-700 rounded-md p-3 mb-3">
            <p class="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">${t('exam_your_answer')}</p>
            <p class="text-sm text-slate-200 whitespace-pre-wrap">${escapeHtml(studentAnswer || '(no answer)')}</p>
          </div>
          ${wf ? `<div class="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
            <div class="flex items-center gap-2 mb-2">${icon('lightbulb', 'w-5 h-5 text-amber-400 flex-shrink-0')}<h4 class="font-semibold text-amber-400">${t('exam_ai_feedback')}</h4></div>
            <div class="prose prose-invert prose-sm max-w-none text-slate-300">${renderMarkdown(wf.feedback)}</div>
          </div>` : ''}
        </div>`;
      }

      const isCorrect = studentAnswer === q.correctAnswer;
      const feedbackText = exam.result.feedback?.[index];
      const options = (q.options || []).map((option) => {
        let cls = 'p-3 rounded-md border text-sm flex items-center gap-3';
        let mark = '';
        if (option === q.correctAnswer) { cls += ' bg-green-500/10 border-green-500/30 text-green-300'; mark = icon('checkCircle', 'w-5 h-5 flex-shrink-0'); }
        else if (option === studentAnswer) { cls += ' bg-red-500/10 border-red-500/30 text-red-300'; mark = icon('xCircle', 'w-5 h-5 flex-shrink-0'); }
        else { cls += ' bg-slate-700/50 border-slate-700'; }
        return `<div class="${cls}">${mark}<span>${escapeHtml(option)}</span></div>`;
      }).join('');
      const feedback = (!isCorrect && feedbackText)
        ? `<div class="mt-4 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
            <div class="flex items-center gap-2 mb-2">${icon('lightbulb', 'w-5 h-5 text-amber-400 flex-shrink-0')}<h4 class="font-semibold text-amber-400">${t('exam_ai_feedback')}</h4></div>
            <div class="prose prose-invert prose-sm max-w-none text-slate-300">${renderMarkdown(feedbackText)}</div>
          </div>` : '';

      return `<div class="bg-slate-900/40 border border-slate-700 rounded-lg p-5">
        <p class="font-semibold text-white mb-4">${index + 1}. ${renderMarkdownInline(q.questionText)}</p>
        <div class="space-y-3">${options}</div>${feedback}
      </div>`;
    }).join('');

    const body = `<div class="border-t border-slate-700 p-4 space-y-4">
      <div class="bg-slate-900/40 border border-slate-700 rounded-lg p-5 text-center">
        <h3 class="text-lg font-bold text-white">${t('exam_results')}</h3>
        ${scoreBlock}
        <p class="text-slate-400 text-sm">${t('exam_completed')}</p>
        ${u.generatingFeedback ? `<div class="mt-3 flex items-center justify-center gap-2 text-sm text-slate-400">${icon('loader', 'w-4 h-4 animate-spin')}<span>${t('exam_feedback_gen')}</span></div>` : ''}
        ${u.writtenGrading ? `<div class="mt-3 flex items-center justify-center gap-2 text-sm text-slate-400">${icon('loader', 'w-4 h-4 animate-spin')}<span>${t('exam_grading_written')}</span></div>` : ''}
        <button data-action="retake-exam" data-id="${exam.id}" ${isBusy ? 'disabled' : ''} class="mt-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed">${t('exam_retake')}</button>
      </div>
      ${resultQuestions}
    </div>`;

    return `<div class="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">${header}${body}</div>`;
  }).join('');

  return `<div class="flex-1 overflow-y-auto pr-2 -mr-2 sm:pr-4 sm:-mr-4 animate-fade-in">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-2xl font-bold text-white">${t('exam_title')}</h2>
      <div class="flex items-center gap-2 flex-shrink-0">
        ${u.error ? `<p class="text-sm text-red-400 mr-2">${escapeHtml(u.error)}</p>` : ''}
        <button data-action="gen-exam" ${canGenerate ? '' : 'disabled'} class="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-1.5 px-3 rounded-md text-sm transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
          ${u.generatingExam ? `${icon('loader', 'w-4 h-4 animate-spin')}<span>${t('exam_generating')}</span>` : `${icon('sparkles', 'w-4 h-4')}<span>${t('exam_new')}</span>`}
        </button>
      </div>
    </div>
    ${unit.explanations.length === 0 ? `<p class="mb-3 text-xs text-amber-400">${t('exam_need_expl')}</p>` : ''}
    <div class="space-y-2">
      ${items}
    </div>
  </div>`;
}

// ---- R1: Sources & Chat (RAG) ----

const sourceIconFor = (mime) =>
  mime === 'text/html' ? 'link' : mime === 'application/pdf' ? 'fileUp' : 'clipboard';

// Whether the "Add source" button should be enabled for the current input mode.
// Exported so app.js can toggle it live while typing (no re-render).
export function canAddSource(u) {
  if (u.sourceMode === 'text') return !!(u.sourceText || '').trim();
  if (u.sourceMode === 'url') return !!(u.sourceUrl || '').trim();
  if (u.sourceMode === 'pdf') return !!((u.sourcePdfText || '').trim() && !u.parsingSourcePdf);
  return false;
}

function renderSourcesPanel() {
  const u = state.unit;
  const sourceTab = (iconName, label, mode) => {
    const a = u.sourceMode === mode;
    return `<button data-action="source-mode" data-mode="${mode}" class="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-md transition-colors ${a ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">${icon(iconName, 'w-4 h-4')}<span>${label}</span></button>`;
  };

  const list = u.sources.length
    ? u.sources.map((s) => `<div class="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-md p-2.5">
        <span class="text-slate-400 flex-shrink-0">${icon(sourceIconFor(s.mime), 'w-4 h-4')}</span>
        <div class="flex-1 min-w-0">
          <div class="text-sm text-white truncate" title="${escapeHtml(s.filename)}">${escapeHtml(s.filename)}</div>
          <div class="text-[11px] text-slate-500">${s.chunkCount ?? 0} chunk${s.chunkCount === 1 ? '' : 's'}</div>
        </div>
        <button data-action="delete-source" data-id="${s.id}" title="${t('action_delete')}" class="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 flex-shrink-0">${icon('trash', 'w-4 h-4')}</button>
      </div>`).join('')
    : `<p class="text-xs text-slate-500 px-1 py-2">${t('sources_empty')}</p>`;

  let inputBlock;
  if (u.sourceMode === 'url') {
    inputBlock = `<input id="source-url" type="url" ${u.addingSource ? 'disabled' : ''} value="${escapeHtml(u.sourceUrl)}" placeholder="https://example.com/article" class="w-full bg-slate-800 border border-slate-700 rounded-md h-10 px-3 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />`;
  } else if (u.sourceMode === 'pdf') {
    inputBlock = `<label class="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-700 px-3 py-5 cursor-pointer hover:border-cyan-500/50 text-center">
        ${icon('fileUp', 'h-7 w-7 text-slate-500')}
        <span class="mt-2 text-xs text-slate-400"><span class="font-semibold text-cyan-400">${t('src_pdf_choose')}</span> ${t('src_pdf_extract')}</span>
        <input type="file" class="sr-only" accept=".pdf,.docx,.pptx,.xlsx,.md,.html,.xml" data-action="source-pdf" ${u.parsingSourcePdf || u.addingSource ? 'disabled' : ''} />
      </label>
      ${u.parsingSourcePdf ? `<div class="mt-2 flex items-center gap-2 text-xs text-slate-400">${icon('loader', 'w-4 h-4 animate-spin')} ${t('extracting')}</div>` : ''}
      ${u.sourcePdfName && !u.parsingSourcePdf && !u.ragError ? `<div class="mt-2 flex items-center gap-2 text-xs text-green-400">${icon('file', 'w-4 h-4')} ${escapeHtml(u.sourcePdfName)}</div>` : ''}
      ${u.sourcePdfName && u.ragError && !u.parsingSourcePdf ? `<div class="mt-2 flex items-center gap-2 text-xs text-red-400">${icon('file', 'w-4 h-4')} ${escapeHtml(u.sourcePdfName)} — ${escapeHtml(u.ragError)}</div>` : ''}`;
  } else {
    inputBlock = `<textarea id="source-text" rows="4" ${u.addingSource ? 'disabled' : ''} placeholder="${t('src_text_ph')}" class="w-full bg-slate-800 border border-slate-700 rounded-md p-2.5 text-sm resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none">${escapeHtml(u.sourceText)}</textarea>`;
  }

  const canAdd = canAddSource(u);
  return `<aside class="lg:w-72 flex-shrink-0 flex flex-col min-h-0 gap-3">
    <h3 class="text-sm font-semibold text-white flex items-center gap-2 flex-shrink-0">${icon('layers', 'w-4 h-4 text-cyan-400')} ${t('sources_title')} <span class="text-xs bg-slate-700 rounded-full px-2 py-0.5">${u.sources.length}</span></h3>
    <div class="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">${list}</div>
    <div class="flex-shrink-0 border-t border-slate-700 pt-3 space-y-2">
      <div class="flex gap-1 bg-slate-900/60 p-1 rounded-lg">
        ${sourceTab('clipboard', t('src_text'), 'text')}
        ${sourceTab('link', t('src_url'), 'url')}
        ${sourceTab('fileUp', t('src_pdf'), 'pdf')}
      </div>
      ${inputBlock}
      <button data-action="add-source" ${!canAdd || u.addingSource ? 'disabled' : ''} class="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold py-2 px-3 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
        ${u.addingSource ? `${icon('loader', 'w-4 h-4 animate-spin')}<span>${t('indexing')}</span>` : `${icon('plus', 'w-4 h-4')}<span>${t('add_source')}</span>`}
      </button>
      ${u.ragError ? `<p class="text-xs text-red-400">${escapeHtml(u.ragError)}</p>` : ''}
    </div>
  </aside>`;
}

function renderChatMessage(m) {
  if (m.role === 'user') {
    return `<div class="flex justify-end"><div class="max-w-[85%] bg-cyan-600/90 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm whitespace-pre-wrap">${escapeHtml(m.content)}</div></div>`;
  }
  const cites = (m.citations || []).length
    ? `<div class="mt-2 flex flex-wrap gap-1.5">${m.citations.map((c) => `
        <details class="group">
          <summary class="cursor-pointer list-none inline-flex items-center gap-1 text-[11px] ${c.kind === 'explanation' ? 'bg-violet-700/40 hover:bg-violet-600/50 text-violet-300' : c.kind === 'note' ? 'bg-amber-700/40 hover:bg-amber-600/50 text-amber-300' : 'bg-slate-700/70 hover:bg-slate-600 text-cyan-300'} rounded-full px-2 py-0.5">[${c.n}] ${escapeHtml(c.filename)}</summary>
          <div class="mt-1 text-xs text-slate-400 bg-slate-900/70 border border-slate-700 rounded-md p-2 max-w-md whitespace-pre-wrap">${escapeHtml(c.snippet)}${(c.snippet || '').length >= 400 ? '…' : ''}</div>
        </details>`).join('')}</div>`
    : '';
  return `<div class="flex justify-start"><div class="max-w-[85%] min-w-0">
    <div class="bg-slate-800 border border-slate-700 text-slate-200 rounded-2xl rounded-bl-sm px-4 py-2.5"><div class="prose prose-invert prose-sm max-w-none">${renderMarkdown(m.content)}</div></div>
    ${cites}
  </div></div>`;
}

// A unit can be chatted about once it has either a manually added source or at
// least one explanation with content — explanations count as grounding too.
export function hasChatContext(unit) {
  const u = state.unit;
  return u.sources.length > 0 || (unit?.explanations || []).some((e) => (e.content || '').trim());
}

function renderChatPanel(unit) {
  const u = state.unit;
  const hasContext = hasChatContext(unit);
  const messages = u.chatMessages.length
    ? u.chatMessages.map(renderChatMessage).join('')
    : `<div class="text-center text-slate-500 text-sm mt-10">${icon('messageSquare', 'mx-auto h-10 w-10 text-slate-600 mb-3')}<p class="max-w-sm mx-auto">${t('chat_empty')}</p></div>`;

  return `<section class="flex-1 flex flex-col min-h-0">
    <div class="flex items-center justify-between mb-2 flex-shrink-0">
      <h3 class="text-sm font-semibold text-white flex items-center gap-2">${icon('messageSquare', 'w-4 h-4 text-cyan-400')} ${t('chat_title')}</h3>
      ${u.chatMessages.length ? `<button data-action="clear-chat" class="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1">${icon('trash', 'w-3.5 h-3.5')} ${t('clear')}</button>` : ''}
    </div>
    <div class="flex-1 overflow-y-auto space-y-4 pr-2 -mr-2 min-h-0">${messages}
      ${u.chatBusy ? `<div class="flex items-center gap-2 text-sm text-slate-400">${icon('loader', 'w-4 h-4 animate-spin')} ${t('thinking')}</div>` : ''}
    </div>
    ${u.ragError && hasContext ? `<p class="mt-2 text-xs text-red-400 flex-shrink-0">${escapeHtml(u.ragError)}</p>` : ''}
    <form data-action="form-chat" class="flex-shrink-0 mt-3 flex items-end gap-2">
      <textarea id="chat-input" rows="1" ${!hasContext || u.chatBusy ? 'disabled' : ''} placeholder="${hasContext ? t('chat_ph') : t('chat_ph_nosrc')}" class="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none disabled:opacity-60">${escapeHtml(u.chatInput)}</textarea>
      <button type="submit" data-action="send-chat" ${!hasContext || u.chatBusy || !(u.chatInput || '').trim() ? 'disabled' : ''} class="flex-shrink-0 flex items-center justify-center bg-cyan-600 hover:bg-cyan-700 text-white h-11 w-11 rounded-lg transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">${icon('send', 'w-5 h-5')}</button>
    </form>
  </section>`;
}

function renderSourcesChat(unit) {
  const u = state.unit;
  if (!u.ragLoaded) {
    return `<div class="flex-1 flex items-center justify-center text-slate-400 gap-2">${icon('loader', 'w-5 h-5 animate-spin')} Loading sources…</div>`;
  }
  return `<div class="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">${renderSourcesPanel()}${renderChatPanel(unit)}</div>`;
}

export function renderUnit(unit) {
  const u = state.unit;
  const tabs = `<div class="flex border-b border-slate-800 mb-6 flex-wrap">
    ${viewTab('sparkles', t('tab_generator'), 'generator')}
    ${viewTab('notebookText', t('tab_explanations'), 'explanations', unit.explanations.length)}
    ${viewTab('messageSquare', t('tab_sources'), 'sources', u.ragLoaded ? u.sources.length : null)}
    ${viewTab('cards', t('tab_flashcards'), 'flashcards', u.flashcardsLoaded && u.flashcards.length ? dueCount(u.flashcards) : null)}
    ${viewTab('bookOpen', t('tab_study'), 'study', u.studyLoaded ? u.artifacts.length : null)}
    ${viewTab('fileQuestion', t('tab_exam'), 'exam', unit.exams?.length || null)}
    ${state.speechEnabled ? viewTab('mic', t('tab_teachback'), 'teachback', u.teachbackLoaded ? u.teachbackHistory.length : null) : ''}
  </div>`;
  let body;
  if (u.viewMode === 'explanations') body = renderExplanations(unit);
  else if (u.viewMode === 'generator') body = renderGenerator(unit);
  else if (u.viewMode === 'sources') body = renderSourcesChat(unit);
  else if (u.viewMode === 'flashcards') body = renderFlashcards(unit);
  else if (u.viewMode === 'study') body = renderStudy(unit);
  else if (u.viewMode === 'teachback' && state.speechEnabled) body = renderTeachback(unit);
  else body = renderExam(unit);
  // Teach-back chains several automatic state transitions within seconds
  // (recording → converting → uploading → grading → result); replaying the
  // 0.3s fade-in on every one of those full-page re-renders reads as constant
  // flicker, so skip the entrance animation for this tab specifically.
  const fadeIn = u.viewMode === 'teachback' ? '' : 'animate-fade-in';
  return `<div class="flex flex-col h-full ${fadeIn}">${tabs}${body}</div>`;
}
