// B1 — Teach-back tab: record a spoken explanation, transcribe it via a local
// Whisper server, then have the active LLM grade the transcript against the
// unit's source material (Feynman technique). Recording uses MediaRecorder/
// getUserMedia, wired up in app.js. The transcript is the student's own speech
// (escapeHtml only); AI-authored feedback goes through renderMarkdown(Inline).
import { state } from '../state.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { escapeHtml, renderMarkdownInline } from '../ui.js';

function explChecklist(unit, selIds, disabled) {
  if (!unit.explanations.length) return '';
  const items = unit.explanations.map((e) => `
    <label class="flex items-center gap-3 p-2 rounded-md hover:bg-slate-800/60 cursor-pointer select-none">
      <input type="checkbox" data-action="toggle-teachback-explanation" data-id="${e.id}" ${selIds.includes(e.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''} class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-600 focus:ring-cyan-500 flex-shrink-0" />
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
        <button data-action="select-expls-all" data-target="teachback" class="text-xs text-cyan-400 hover:text-cyan-300">${t('gen_expls_select_all')}</button>
        <button data-action="select-expls-none" data-target="teachback" class="text-xs text-slate-400 hover:text-slate-200">${t('gen_expls_select_none')}</button>
      </div>
    </div>
    <div class="px-2 py-1.5 max-h-36 overflow-y-auto space-y-0.5">${items}</div>
  </div>`;
}

const scoreColor = (pct) => (pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400');

// Shared markup for both the live result card and an expanded history item.
function feedbackBody(item) {
  const f = item.feedback || {};
  const gaps = f.gaps || [];
  const strengths = f.strengths || [];
  return `<div class="space-y-4">
    <div class="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
      <div class="text-center">
        <div class="text-xs uppercase tracking-wider text-slate-500 mb-0.5">${t('teachback_accuracy')}</div>
        <div class="text-2xl font-extrabold ${scoreColor(f.accuracy ?? 0)}">${f.accuracy ?? 0}%</div>
      </div>
      <div class="text-center">
        <div class="text-xs uppercase tracking-wider text-slate-500 mb-0.5">${t('teachback_completeness')}</div>
        <div class="text-2xl font-extrabold ${scoreColor(f.completeness ?? 0)}">${f.completeness ?? 0}%</div>
      </div>
      <div class="text-center">
        <div class="text-xs uppercase tracking-wider text-slate-500 mb-0.5">${t('teachback_score')}</div>
        <div class="text-3xl font-extrabold ${scoreColor(item.score ?? 0)}">${item.score ?? 0}%</div>
      </div>
    </div>
    ${strengths.length ? `<div class="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
      <h4 class="font-semibold text-green-400 mb-2">${t('teachback_strengths')}</h4>
      <ul class="list-disc list-inside text-sm text-slate-300 space-y-1">${strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
    </div>` : ''}
    ${gaps.length ? `<div class="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
      <h4 class="font-semibold text-amber-400 mb-2">${t('teachback_gaps')}</h4>
      <ul class="list-disc list-inside text-sm text-slate-300 space-y-1">${gaps.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>
    </div>` : ''}
    ${f.suggestion ? `<div class="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
      <div class="flex items-center gap-2 mb-2">${icon('lightbulb', 'w-5 h-5 text-amber-400 flex-shrink-0')}<h4 class="font-semibold text-amber-400">${t('teachback_suggestion')}</h4></div>
      <div class="prose prose-invert prose-sm max-w-none text-slate-300">${renderMarkdownInline(f.suggestion)}</div>
    </div>` : ''}
    <details>
      <summary class="cursor-pointer text-xs text-slate-400 hover:text-slate-200">${t('teachback_transcript')}</summary>
      <p class="mt-2 text-sm text-slate-300 whitespace-pre-wrap bg-slate-900/60 border border-slate-700 rounded-md p-3">${escapeHtml(item.transcript)}</p>
    </details>
  </div>`;
}

function resultCard(item) {
  return `<div class="bg-slate-900/40 border border-slate-700 rounded-lg p-5">${feedbackBody(item)}</div>`;
}

function historyItem(item) {
  const isOpen = !!state.unit.openTeachback[item.id];
  const dateStr = new Date(item.createdAt * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const header = `<button data-action="toggle-teachback-item" data-id="${item.id}" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/50 text-left transition-colors${isOpen ? ' bg-slate-700/30' : ''}">
    <span class="flex-shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}">${icon('chevronDown', 'w-4 h-4')}</span>
    <span class="text-xs text-slate-400">${dateStr}</span>
    <span class="ml-auto font-bold text-sm ${scoreColor(item.score ?? 0)}">${item.score ?? 0}%</span>
    <button data-action="delete-teachback" data-id="${item.id}" title="${t('action_delete')}" class="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 flex-shrink-0">${icon('trash', 'w-4 h-4')}</button>
  </button>`;
  return `<div class="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
    ${header}
    ${isOpen ? `<div class="border-t border-slate-700 p-4">${feedbackBody(item)}</div>` : ''}
  </div>`;
}

function recordingPanel(unit) {
  const u = state.unit;
  const busy = u.uploadingTeachback || u.gradingTeachback || u.convertingTeachback;

  let controls;
  if (u.recording) {
    const mm = String(Math.floor(u.recordSeconds / 60)).padStart(2, '0');
    const ss = String(u.recordSeconds % 60).padStart(2, '0');
    controls = `<button data-action="teachback-record-stop" class="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">
      <span class="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span><span>${t('teachback_stop')} (<span id="teachback-record-timer">${mm}:${ss}</span>)</span>
    </button>`;
  } else if (u.convertingTeachback) {
    controls = `<div class="flex items-center gap-2 text-sm text-slate-400">${icon('loader', 'w-4 h-4 animate-spin')}<span>${t('teachback_processing')}</span></div>`;
  } else if (u.recordedBlobUrl) {
    controls = `<div class="flex flex-wrap items-center gap-3">
      <audio controls src="${u.recordedBlobUrl}" class="h-10"></audio>
      <button data-action="teachback-record-start" ${busy ? 'disabled' : ''} class="text-sm text-slate-300 hover:text-white disabled:opacity-50">${t('teachback_rerecord')}</button>
      <button data-action="teachback-submit" ${busy ? 'disabled' : ''} class="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
        ${u.uploadingTeachback ? `${icon('loader', 'w-4 h-4 animate-spin')}<span>${t('teachback_uploading')}</span>`
          : u.gradingTeachback ? `${icon('loader', 'w-4 h-4 animate-spin')}<span>${t('teachback_grading')}</span>`
          : `${icon('mic', 'w-4 h-4')}<span>${t('teachback_submit')}</span>`}
      </button>
    </div>`;
  } else {
    controls = `<button data-action="teachback-record-start" class="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">${icon('mic', 'w-5 h-5')}<span>${t('teachback_record')}</span></button>`;
  }

  const checklist = explChecklist(unit, u.teachbackExplanationIds || [], u.recording || busy);
  return `<div class="bg-slate-800/50 border border-slate-700 rounded-lg p-5 mb-4">
    ${checklist}
    ${controls}
    ${u.teachbackError ? `<p class="mt-3 text-sm text-red-400">${escapeHtml(u.teachbackError)}</p>` : ''}
  </div>`;
}

export function renderTeachback(unit) {
  const u = state.unit;
  if (!u.teachbackLoaded) {
    return `<div class="flex-1 flex items-center justify-center text-slate-400 gap-2">${icon('loader', 'w-5 h-5 animate-spin')} ${t('loading_workspace')}</div>`;
  }

  const hasProvider = state.sttProviders.some((p) => p.isActive);
  if (!hasProvider) {
    return `<div class="text-center p-12 bg-slate-800/50 border border-dashed border-slate-700 rounded-lg">
      ${icon('mic', 'mx-auto h-12 w-12 text-slate-500')}
      <h2 class="mt-4 text-xl font-semibold text-white">${t('teachback_no_provider')}</h2>
      <button data-action="open-modal" data-modal="settings" class="mt-6 inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">${t('teachback_no_provider_cta')}</button>
    </div>`;
  }

  const result = u.teachbackResult ? resultCard(u.teachbackResult) : '';
  const history = u.teachbackHistory.length
    ? `<div class="space-y-2">${u.teachbackHistory.map(historyItem).join('')}</div>`
    : `<p class="text-sm text-slate-500">${t('teachback_history_empty')}</p>`;

  return `<div class="flex-1 overflow-y-auto pr-2 -mr-2 sm:pr-4 sm:-mr-4">
    ${recordingPanel(unit)}
    ${result}
    <h3 class="text-sm font-semibold text-slate-300 mt-6 mb-2">${t('teachback_history_title')}</h3>
    ${history}
  </div>`;
}
