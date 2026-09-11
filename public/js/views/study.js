// R3 — Study tab: generate + view structured study guides (Markdown), mind maps
// (nested Markdown outline rendered with markmap), and infographics (self-
// contained HTML rendered in a sandboxed iframe). The markmap itself is drawn
// after render by app.js (renderMarkmaps) into the SVG below, keyed by id.
import { state } from '../state.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { escapeHtml, renderMarkdown } from '../ui.js';

function explChecklist(unit, selIds, disabled) {
  if (!unit.explanations.length) return '';
  const items = unit.explanations.map((e) => `
    <label class="flex items-center gap-3 p-2 rounded-md hover:bg-slate-800/60 cursor-pointer select-none">
      <input type="checkbox" data-action="toggle-study-explanation" data-id="${e.id}" ${selIds.includes(e.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''} class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-600 focus:ring-cyan-500 flex-shrink-0" />
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
        <button data-action="select-expls-all" data-target="study" class="text-xs text-cyan-400 hover:text-cyan-300">${t('gen_expls_select_all')}</button>
        <button data-action="select-expls-none" data-target="study" class="text-xs text-slate-400 hover:text-slate-200">${t('gen_expls_select_none')}</button>
      </div>
    </div>
    <div class="px-2 py-1.5 max-h-36 overflow-y-auto space-y-0.5">${items}</div>
  </div>`;
}

function artifactCard(a) {
  const isOpen = !!state.unit.openArtifacts[a.id];
  const isMind = a.kind === 'mindmap';
  const isInfographic = a.kind === 'infographic';
  const isDiagram = a.kind === 'diagram';
  const kindLabel = isMind ? t('mind_map') : isInfographic ? t('infographic') : isDiagram ? t('diagram') : t('study_guide');
  const kindIcon = isMind ? 'mindmap' : isInfographic ? 'image' : isDiagram ? 'workflow' : 'bookOpen';
  const fullscreenAction = isMind ? 'fullscreen-mindmap' : isInfographic ? 'fullscreen-infographic' : isDiagram ? 'fullscreen-diagram' : null;
  const isStudyGuide = a.kind === 'study_guide';
  const isGeneratingAudio = !!state.unit.generatingAudioIds[a.id];

  let body = '';
  if (isOpen) {
    if (isMind) {
      body = `<div class="px-4 pb-4 border-t border-slate-700/60 pt-3">
          <div class="bg-white rounded-lg overflow-hidden border border-slate-700">
            <svg data-markmap-id="${a.id}" class="w-full h-[28rem] block"></svg>
          </div>
          <details class="mt-2">
            <summary class="cursor-pointer text-xs text-slate-400 hover:text-slate-200">${t('study_show_outline')}</summary>
            <pre class="mt-1 text-xs text-slate-300 whitespace-pre-wrap bg-slate-900/60 rounded p-2 overflow-x-auto">${escapeHtml(a.content)}</pre>
          </details>
        </div>`;
    } else if (isDiagram) {
      body = `<div class="px-4 pb-4 border-t border-slate-700/60 pt-3">
          <div class="bg-white rounded-lg overflow-hidden border border-slate-700 p-4 overflow-x-auto flex justify-center">
            <pre data-mermaid-id="${a.id}" class="mermaid">${escapeHtml(a.content)}</pre>
          </div>
          <details class="mt-2">
            <summary class="cursor-pointer text-xs text-slate-400 hover:text-slate-200">${t('study_show_outline')}</summary>
            <pre class="mt-1 text-xs text-slate-300 whitespace-pre-wrap bg-slate-900/60 rounded p-2 overflow-x-auto">${escapeHtml(a.content)}</pre>
          </details>
        </div>`;
    } else if (isInfographic) {
      // Arbitrary LLM-authored HTML/CSS: rendered in a sandboxed iframe (no
      // allow-scripts) so its markup/styles stay fully isolated from the app.
      const srcdoc = `<!doctype html><html><body style="margin:0;display:flex;justify-content:center;">${a.content}</body></html>`;
      body = `<div class="px-4 pb-4 border-t border-slate-700/60 pt-3">
          <div class="bg-white rounded-lg overflow-hidden border border-slate-700">
            <iframe sandbox class="w-full h-[32rem] block border-0" srcdoc="${escapeHtml(srcdoc)}"></iframe>
          </div>
        </div>`;
    } else {
      body = `<div class="px-4 pb-5 pt-3 border-t border-slate-700/60">
          ${a.audioId ? `<audio controls preload="none" src="/api/audio/${a.audioId}/file" class="w-full h-9 mb-3"></audio>` : ''}
          <div class="prose prose-invert prose-sm max-w-none text-slate-300">${renderMarkdown(a.content)}</div></div>`;
    }
  }

  const audioBtn = (isStudyGuide && state.ttsEnabled)
    ? `<button data-action="artifact-audio" data-id="${a.id}" ${isGeneratingAudio ? 'disabled' : ''} title="${a.audioId ? t('action_regenerate_audio') : t('action_generate_audio')}" class="p-1.5 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-700 flex-shrink-0 disabled:opacity-50">${icon(isGeneratingAudio ? 'loader' : 'volume2', `w-4 h-4 ${isGeneratingAudio ? 'animate-spin' : ''}`)}</button>`
    : '';

  return `<div class="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden animate-fade-in">
    <div class="flex items-center gap-2 p-4">
      <button data-action="toggle-artifact" data-id="${a.id}" aria-expanded="${isOpen}" class="flex-1 min-w-0 flex items-center gap-3 text-left">
        <span class="flex-shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}">${icon('chevronDown', 'w-5 h-5')}</span>
        <span class="flex-shrink-0 text-cyan-400">${icon(kindIcon, 'w-5 h-5')}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-white font-medium truncate">${escapeHtml(a.title)}</span>
          <span class="text-[11px] uppercase tracking-wide text-slate-500">${kindLabel}</span>
        </span>
      </button>
      ${fullscreenAction ? `<button data-action="${fullscreenAction}" data-id="${a.id}" title="${t('mindmap_fullscreen')}" class="p-1.5 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-700 flex-shrink-0">${icon('expand', 'w-4 h-4')}</button>` : ''}
      ${audioBtn}
      <button data-action="delete-artifact" data-id="${a.id}" title="${t('action_delete')}" class="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 flex-shrink-0">${icon('trash', 'w-4 h-4')}</button>
    </div>
    ${body}
  </div>`;
}

export function renderStudy(unit) {
  const u = state.unit;
  if (!u.studyLoaded) {
    return `<div class="flex-1 flex items-center justify-center text-slate-400 gap-2">${icon('loader', 'w-5 h-5 animate-spin')} ${t('loading_workspace')}</div>`;
  }
  const noMaterial = unit.explanations.length === 0; // sources may still exist; backend validates

  const genBtn = (action, busy, iconName, label, primary) =>
    `<button data-action="${action}" ${busy ? 'disabled' : ''} class="flex items-center gap-2 ${primary ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-slate-700 hover:bg-slate-600'} text-white text-sm font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
      ${busy ? `${icon('loader', 'w-4 h-4 animate-spin')}<span>${t('generating')}</span>` : `${icon(iconName, 'w-4 h-4')}<span>${label}</span>`}
    </button>`;

  const header = `<div class="flex items-center justify-between gap-3 flex-wrap mb-4 flex-shrink-0">
    <h2 class="text-xl font-bold text-white">${t('study_title')}</h2>
    <div class="flex items-center gap-2">
      ${genBtn('gen-guide', u.generatingGuide, 'bookOpen', t('study_guide'), true)}
      ${genBtn('gen-mindmap', u.generatingMindmap, 'mindmap', t('mind_map'), false)}
      ${genBtn('gen-diagram', u.generatingDiagram, 'workflow', t('diagram'), false)}
      ${genBtn('gen-infographic', u.generatingInfographic, 'image', t('infographic'), false)}
    </div>
  </div>`;

  let list;
  if (!u.artifacts.length) {
    list = `<div class="flex-1 overflow-y-auto">
      <div class="text-center p-12 bg-slate-800/50 border border-dashed border-slate-700 rounded-lg">
        ${icon('bookOpen', 'mx-auto h-12 w-12 text-slate-500')}
        <h2 class="mt-4 text-xl font-semibold text-white">${t('study_empty_title')}</h2>
        <p class="mt-2 text-slate-400 max-w-md mx-auto">${t('study_empty_hint')}</p>
        ${noMaterial ? `<p class="mt-3 text-xs text-amber-400">${t('study_need_material')}</p>` : ''}
      </div>
    </div>`;
  } else {
    list = `<div class="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">${u.artifacts.map(artifactCard).join('')}</div>`;
  }

  const checklist = explChecklist(unit, u.studyExplanationIds || [], u.generatingGuide || u.generatingMindmap || u.generatingInfographic || u.generatingDiagram);
  return `<div class="flex-1 min-h-0 flex flex-col">${header}${checklist}${u.studyError ? `<p class="mb-3 text-sm text-red-400 flex-shrink-0">${escapeHtml(u.studyError)}</p>` : ''}${list}</div>`;
}
