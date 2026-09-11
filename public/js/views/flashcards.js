// R2 — Flashcards tab: manage view (generate / list / add / edit / delete) and
// review mode (flip + SM-2 grade buttons). Review/scheduling state lives in
// state.unit.review; persistence + SM-2 happen on the backend.
import { state } from '../state.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { escapeHtml, renderMarkdown } from '../ui.js';

const nowSec = () => Math.floor(Date.now() / 1000);

export function dueCount(cards) {
  const now = nowSec();
  return cards.filter((c) => c.dueAt <= now).length;
}

function fmtDue(dueAt) {
  const diff = dueAt - nowSec();
  if (diff <= 0) return t('fc_due_now');
  if (diff < 86400) return t('fc_due_lt1d');
  return t('fc_due_in_n', { n: Math.round(diff / 86400) });
}

function gradeButtons() {
  const btn = (grade, label, cls) =>
    `<button data-action="grade-card" data-grade="${grade}" class="py-2.5 px-2 rounded-md text-sm font-semibold transition-colors ${cls}">${label}</button>`;
  return `<div class="grid grid-cols-4 gap-2 max-w-2xl mx-auto">
    ${btn('again', t('grade_again'), 'bg-red-600/90 hover:bg-red-600 text-white')}
    ${btn('hard', t('grade_hard'), 'bg-amber-600/90 hover:bg-amber-600 text-white')}
    ${btn('good', t('grade_good'), 'bg-green-600/90 hover:bg-green-600 text-white')}
    ${btn('easy', t('grade_easy'), 'bg-cyan-600/90 hover:bg-cyan-600 text-white')}
  </div>
  <p class="text-center text-[11px] text-slate-500 mt-2">${t('fc_kbd_hint')}</p>`;
}

function renderReview() {
  const u = state.unit;
  const r = u.review;
  const total = r.queue.length;

  if (r.pos >= total) {
    return `<div class="flex-1 flex flex-col items-center justify-center text-center gap-4 animate-fade-in">
      <div class="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">${icon('check', 'w-9 h-9 text-green-400')}</div>
      <h2 class="text-2xl font-bold text-white">${t('fc_review_done')}</h2>
      <p class="text-slate-400">${t('fc_reviewed_n', { n: r.graded })}</p>
      <button data-action="end-review" class="mt-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 px-5 rounded-md">${t('done')}</button>
    </div>`;
  }

  const card = u.flashcards.find((c) => c.id === r.queue[r.pos]);
  if (!card) {
    return `<div class="flex-1 flex flex-col items-center justify-center gap-4">
      <p class="text-slate-400">${t('fc_card_gone')}</p>
      <button data-action="end-review" class="bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded-md">${t('fc_end_review')}</button>
    </div>`;
  }

  const back = r.flipped
    ? `<hr class="my-5 border-slate-700" />
       <div class="text-xs uppercase tracking-wide text-cyan-400 mb-2">${t('label_back')}</div>
       <div class="prose prose-invert max-w-none text-slate-200">${renderMarkdown(card.back)}</div>`
    : `<div class="mt-auto pt-8 text-center text-sm text-slate-500">${icon('rotate', 'w-5 h-5 mx-auto mb-1')}${t('fc_reveal_hint')}</div>`;

  return `<div class="flex-1 min-h-0 flex flex-col animate-fade-in">
    <div class="flex items-center justify-between mb-4 flex-shrink-0">
      <span class="text-sm text-slate-400">${t('fc_card_x_of_y', { pos: r.pos + 1, total })}</span>
      <button data-action="end-review" class="text-xs text-slate-400 hover:text-white flex items-center gap-1">${icon('x', 'w-4 h-4')} ${t('fc_end_review')}</button>
    </div>
    <div class="flex-1 min-h-0 flex items-center justify-center overflow-y-auto">
      <div data-action="flip-card" class="w-full max-w-2xl cursor-pointer select-none bg-slate-800 border border-slate-700 rounded-xl p-8 min-h-[16rem] flex flex-col hover:border-slate-600 transition-colors">
        <div class="text-xs uppercase tracking-wide text-cyan-400 mb-2">${t('label_front')}</div>
        <div class="text-lg text-white font-medium whitespace-pre-wrap">${escapeHtml(card.front)}</div>
        ${back}
      </div>
    </div>
    <div class="mt-4 flex-shrink-0">
      ${r.flipped ? gradeButtons() : `<button data-action="flip-card" class="w-full max-w-2xl mx-auto block bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2.5 px-4 rounded-md transition-colors">${t('fc_show_answer')}</button>`}
    </div>
  </div>`;
}

function cardRow(c) {
  return `<div class="bg-slate-800/50 border border-slate-700 rounded-lg p-4 animate-fade-in">
    <div class="flex items-start gap-2">
      <div class="flex-1 min-w-0">
        <div class="text-white font-medium whitespace-pre-wrap">${escapeHtml(c.front)}</div>
        <div class="mt-1 prose prose-invert prose-sm max-w-none text-slate-300">${renderMarkdown(c.back)}</div>
        <div class="mt-2 text-[11px] text-slate-500 flex gap-3">
          <span>${fmtDue(c.dueAt)}</span><span>reps ${c.reps}</span><span>ease ${(c.ease ?? 2.5).toFixed(2)}</span>
        </div>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <button data-action="edit-card" data-id="${c.id}" title="${t('action_edit')}" class="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700">${icon('pencil', 'w-4 h-4')}</button>
        <button data-action="delete-card" data-id="${c.id}" title="${t('action_delete')}" class="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700">${icon('trash', 'w-4 h-4')}</button>
      </div>
    </div>
  </div>`;
}

function addCardForm() {
  return `<form data-action="form-add-card" class="flex-shrink-0 mt-4 bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-2">
    <div class="text-sm font-semibold text-slate-300">${t('fc_add_manual')}</div>
    <input name="front" placeholder="${t('fc_front_ph')}" class="w-full bg-slate-800 border border-slate-700 rounded-md h-10 px-3 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
    <textarea name="back" rows="2" placeholder="${t('fc_back_ph')}" class="w-full bg-slate-800 border border-slate-700 rounded-md p-2.5 text-sm resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none"></textarea>
    <div class="text-right"><button type="submit" class="inline-flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold py-2 px-4 rounded-md">${icon('plus', 'w-4 h-4')} ${t('fc_add_card')}</button></div>
  </form>`;
}

function explChecklist(unit, selIds, actionName, target, disabled) {
  if (!unit.explanations.length) return '';
  const items = unit.explanations.map((e) => `
    <label class="flex items-center gap-3 p-2 rounded-md hover:bg-slate-800/60 cursor-pointer select-none">
      <input type="checkbox" data-action="${actionName}" data-id="${e.id}" ${selIds.includes(e.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''} class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-600 focus:ring-cyan-500 flex-shrink-0" />
      <span class="text-sm text-white truncate">${escapeHtml(e.prompt)}</span>
    </label>`).join('');
  const badge = selIds.length
    ? `<span class="text-xs text-slate-400">${selIds.length}/${unit.explanations.length}</span>`
    : `<span class="text-xs text-slate-500">${t('gen_expls_all_hint')}</span>`;
  return `<div class="border border-slate-700 rounded-lg overflow-hidden mb-3 flex-shrink-0">
    <div class="px-3 py-2.5 bg-slate-800/40 flex items-center justify-between">
      <span class="text-sm font-medium text-slate-300">${t('gen_expls_section')}</span>
      <div class="flex items-center gap-2">
        ${badge}
        <button data-action="select-expls-all" data-target="${target}" class="text-xs text-cyan-400 hover:text-cyan-300">${t('gen_expls_select_all')}</button>
        <button data-action="select-expls-none" data-target="${target}" class="text-xs text-slate-400 hover:text-slate-200">${t('gen_expls_select_none')}</button>
      </div>
    </div>
    <div class="px-2 py-1.5 max-h-36 overflow-y-auto space-y-0.5">${items}</div>
  </div>`;
}

function renderManage(unit) {
  const u = state.unit;
  const due = dueCount(u.flashcards);
  const noExpl = unit.explanations.length === 0;
  const genBtn = `<button data-action="gen-cards" ${u.generatingCards || noExpl ? 'disabled' : ''} class="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
    ${u.generatingCards ? `${icon('loader', 'w-4 h-4 animate-spin')}<span>${t('generating')}</span>` : `${icon('sparkles', 'w-4 h-4')}<span>${t('generate_ai')}</span>`}
  </button>`;

  const header = `<div class="flex items-center justify-between gap-3 flex-wrap mb-3 flex-shrink-0">
    <div class="flex items-center gap-2">
      <h2 class="text-xl font-bold text-white">${t('flashcards_title')}</h2>
      ${due > 0 ? `<span class="text-xs bg-cyan-600 text-white rounded-full px-2 py-0.5">${t('fc_n_due', { n: due })}</span>`
        : u.flashcards.length ? `<span class="text-xs bg-slate-700 text-slate-300 rounded-full px-2 py-0.5">${t('fc_all_reviewed')}</span>` : ''}
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <button data-action="start-review" data-scope="due" ${due ? '' : 'disabled'} class="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed">${icon('rotate', 'w-4 h-4')} ${t('fc_review_n_due', { n: due })}</button>
      <button data-action="start-review" data-scope="all" ${u.flashcards.length ? '' : 'disabled'} class="text-sm text-slate-300 hover:text-white py-2 px-3 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">${t('fc_review_all')}</button>
      ${genBtn}
    </div>
  </div>
  ${explChecklist(unit, u.flashcardExplanationIds || [], 'toggle-fc-explanation', 'fc', u.generatingCards)}`;

  let body;
  if (!u.flashcards.length) {
    body = `<div class="flex-1 overflow-y-auto">
      <div class="text-center p-12 bg-slate-800/50 border border-dashed border-slate-700 rounded-lg">
        ${icon('cards', 'mx-auto h-12 w-12 text-slate-500')}
        <h2 class="mt-4 text-xl font-semibold text-white">${t('fc_empty_title')}</h2>
        <p class="mt-2 text-slate-400 max-w-md mx-auto">${t('fc_empty_hint')}</p>
        ${noExpl ? `<p class="mt-3 text-xs text-amber-400">${t('fc_need_expl')}</p>` : ''}
      </div>
      ${addCardForm()}
    </div>`;
  } else {
    body = `<div class="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
      ${u.flashcards.map(cardRow).join('')}
      ${addCardForm()}
    </div>`;
  }

  return `${header}${u.fcError ? `<p class="mb-3 text-sm text-red-400 flex-shrink-0">${escapeHtml(u.fcError)}</p>` : ''}${body}`;
}

export function renderFlashcards(unit) {
  const u = state.unit;
  if (!u.flashcardsLoaded) {
    return `<div class="flex-1 flex items-center justify-center text-slate-400 gap-2">${icon('loader', 'w-5 h-5 animate-spin')} ${t('loading_workspace')}</div>`;
  }
  return `<div class="flex-1 min-h-0 flex flex-col">${u.review.active ? renderReview() : renderManage(unit)}</div>`;
}
