import { state } from '../state.js';
import { icon } from '../icons.js';
import { t, interfaceLangs } from '../i18n.js';
import { escapeHtml, renderMarkdown, renderMarkdownInline } from '../ui.js';
import { selectedCourse, selectedSubject, selectedUnit } from '../selectors.js';

function modalShell(iconName, title, desc, inner, maxW = 'max-w-lg') {
  return `<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
    <div class="absolute inset-0" data-action="close-modal"></div>
    <div class="relative w-full ${maxW} p-6 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-[90vh] overflow-y-auto">
      <div class="absolute top-0 right-0 pt-4 pr-4"><button type="button" data-action="close-modal" class="rounded-md bg-slate-800 text-slate-400 hover:text-slate-200 p-1">${icon('x', 'h-5 w-5')}</button></div>
      <div class="flex items-start">
        <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-cyan-500/10">${icon(iconName, 'h-6 w-6 text-cyan-400')}</div>
        <div class="ml-4 text-left pr-6"><h3 class="text-lg font-semibold leading-6 text-white">${escapeHtml(title)}</h3><p class="mt-2 text-sm text-slate-400">${escapeHtml(desc)}</p></div>
      </div>
      ${inner}
    </div>
  </div>`;
}

// Levels of auto-generated structure available below each entity kind, with
// slider range/default per level (counts agreed: 1-8 subjects/units, 1-10 explanations).
const STRUCTURE_LEVELS = {
  course: [
    { key: 'numSubjects', labelKey: 'slider_subjects', min: 1, max: 8, def: 3 },
    { key: 'numUnitsPerSubject', labelKey: 'slider_units_per_subject', min: 1, max: 8, def: 3 },
    { key: 'numExplanationsPerUnit', labelKey: 'slider_explanations_per_unit', min: 1, max: 10, def: 4 },
  ],
  subject: [
    { key: 'numUnits', labelKey: 'slider_units', min: 1, max: 8, def: 3 },
    { key: 'numExplanationsPerUnit', labelKey: 'slider_explanations_per_unit', min: 1, max: 10, def: 4 },
  ],
  unit: [
    { key: 'numExplanations', labelKey: 'slider_explanations', min: 1, max: 10, def: 5 },
  ],
};

function autogenSlider({ key, labelKey, min, max, def }, { name = key, maxLabel = false } = {}) {
  const label = maxLabel ? `${t(labelKey)} ${t('slider_max_suffix')}` : t(labelKey);
  return `<div>
    <label class="flex items-center justify-between text-xs font-medium text-slate-400 mb-1">
      <span>${label}</span><span data-slider-label="${name}">${def}</span>
    </label>
    <input type="range" name="${name}" min="${min}" max="${max}" value="${def}" data-action="autogen-slider" class="w-full accent-cyan-500" />
  </div>`;
}

// `gen.detail` names the specific document/explanation the folder-ingest
// pipeline is on right now (e.g. the file being digested) — absent from the
// plain AI-only autogen flow, which has no per-item granularity to report.
function progressDetail(gen) {
  if (!gen.detail) return '';
  return `<div class="mt-1 text-xs text-slate-500 truncate" title="${escapeHtml(gen.detail)}">${escapeHtml(gen.detail)}</div>`;
}

// Progress shown inside the course/subject/unit modal while structure is being
// generated. `gen.total` is only set by the folder-ingest flow (extract/upload/
// digest/plan/write phases) — the plain AI-only autogen flow never sets it, so
// this renders the exact same single spinner it always has (no regression).
function progressBlock(gen) {
  if (!gen.total || gen.total <= 1) {
    return `<div class="mt-4">
      <div class="flex items-center gap-2 text-sm text-cyan-400">${icon('loader', 'w-4 h-4 animate-spin')}${escapeHtml(gen.label || t('autogen_generating'))}</div>
      ${progressDetail(gen)}
    </div>`;
  }
  const pct = Math.round((gen.done / gen.total) * 100);
  return `<div class="mt-4 space-y-1.5">
    <div class="flex items-center justify-between text-xs text-cyan-400">
      <span class="flex items-center gap-1.5">${icon('loader', 'w-3.5 h-3.5 animate-spin')}${escapeHtml(gen.label || '')}</span>
      <span>${gen.done}/${gen.total}</span>
    </div>
    <div class="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden"><div class="h-full bg-cyan-500 transition-all" style="width:${pct}%"></div></div>
    ${progressDetail(gen)}
  </div>`;
}

// Course modal only — "Solo IA" vs "Documentación (carpeta)". A plain radio
// pair (not app state) so switching modes never rebuilds the form and loses
// whatever the user has already typed — see the "AI only must keep working
// exactly as before" requirement in docs/PROMPT_FOLDER_INGEST.md §7.
function sourceModeSelector() {
  const opt = (mode, labelKey) => `<label class="flex-1">
    <input type="radio" name="sourceMode" value="${mode}" data-action="course-source-mode" class="sr-only peer" ${mode === 'ai' ? 'checked' : ''} />
    <span class="block text-center text-sm font-medium px-3 py-2 rounded-md border border-slate-700 text-slate-300 cursor-pointer peer-checked:bg-cyan-600 peer-checked:text-white peer-checked:border-cyan-600 transition-colors">${t(labelKey)}</span>
  </label>`;
  return `<div class="flex gap-2 border-b border-slate-700 pb-4">${opt('ai', 'course_source_ai')}${opt('folder', 'course_source_folder')}</div>`;
}

// Course modal only, "Documentación (carpeta)" branch. The picked FileList
// lives in a module-scope variable in app.js (not app state — Files aren't
// serializable and any state change re-renders, which would drop it); this
// block only shows the folder picker + a summary patched in directly by
// app.js's handleFolderPick, plus the same sliders as reoriented maximums
// (the corpus always wins over these — see curriculumFromDocsPrompt).
function folderSourceBlock() {
  return `<div id="folder-source-block" class="hidden space-y-3">
    <label class="flex justify-center rounded-lg border border-dashed border-slate-700 px-6 py-8 cursor-pointer hover:border-cyan-500/50">
      <div class="text-center">
        ${icon('folderKanban', 'mx-auto h-10 w-10 text-slate-500')}
        <div class="mt-3 text-sm font-semibold text-cyan-400">${t('folder_pick_btn')}</div>
        <p class="mt-1 text-xs text-slate-500">${t('folder_pick_hint')}</p>
      </div>
      <input type="file" webkitdirectory multiple class="sr-only" data-action="pick-folder" />
    </label>
    <div id="folder-summary" class="text-xs text-slate-400"></div>
    <div class="space-y-3 pt-3 border-t border-slate-700">
      <p class="text-xs font-semibold text-slate-300">${t('folder_limits_label')}</p>
      ${STRUCTURE_LEVELS.course.map((s) => autogenSlider(s, { name: `${s.key}Max`, maxLabel: true })).join('')}
    </div>
  </div>`;
}

const LEVEL_OPTS = [['beginner', 'level_beginner'], ['intermediate', 'level_intermediate'], ['advanced', 'level_advanced']];
const FOCUS_OPTS = [['theoretical', 'focus_theoretical'], ['practical', 'focus_practical'], ['mixed', 'focus_mixed']];
const AUDIENCE_OPTS = [['student', 'audience_student'], ['professional', 'audience_professional'], ['selftaught', 'audience_selftaught']];

function objectivesSelect(name, opts) {
  return `<select name="${name}" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-2 text-sm">
    ${opts.map(([v, labelKey]) => `<option value="${v}">${t(labelKey)}</option>`).join('')}
  </select>`;
}

// Training-objectives step — course only. Wired up via direct DOM manipulation in
// app.js (not state-driven re-render), so an in-progress name/checkbox/sliders
// selection in the rest of the form is never reset mid-flow.
function objectivesBlock() {
  return `<div class="space-y-3 pb-3 mb-3 border-b border-slate-700">
    <p class="text-xs font-semibold text-slate-300">${t('objectives_section_label')}</p>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
      ${objectivesSelect('level', LEVEL_OPTS)}
      ${objectivesSelect('focus', FOCUS_OPTS)}
      ${objectivesSelect('audience', AUDIENCE_OPTS)}
    </div>
    <button type="button" data-action="generate-objectives" class="inline-flex items-center gap-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-md">
      ${icon('sparkles', 'w-4 h-4 text-cyan-400')}<span id="generate-objectives-label">${t('btn_generate_objectives')}</span>
    </button>
    <div id="objectives-status" class="hidden flex items-center gap-2 text-sm text-cyan-400">${icon('loader', 'w-4 h-4 animate-spin')}${t('objectives_generating')}</div>
    <p id="objectives-error" class="hidden text-sm text-red-400"></p>
    <div id="objectives-textarea-wrap" class="hidden">
      <label class="block text-xs font-medium text-slate-400 mb-1">${t('label_objectives_text')}</label>
      <textarea id="objectives-textarea" name="objectives" rows="5" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white sm:text-sm p-3 resize-y font-mono"></textarea>
      <p class="mt-1 text-xs text-slate-500">${t('objectives_hint')}</p>
    </div>
  </div>`;
}

function nameForm(kind, action, label, placeholder, submitLabel) {
  const gen = state.structureGen || {};
  const autogenBlock = `<div id="autogen-toggle-wrap" class="hidden pt-2 border-t border-slate-700">
    <label class="flex items-center gap-2 text-sm text-slate-300 mt-3">
      <input type="checkbox" name="autogen" data-action="toggle-autogen" class="rounded bg-slate-800 border-slate-700 text-cyan-600 focus:ring-cyan-500" />
      ${icon('sparkles', 'w-4 h-4 text-cyan-400')} ${t('autogen_label')}
    </label>
    <p class="mt-1 text-xs text-slate-500">${t('autogen_hint')}</p>
    <div id="autogen-options" class="hidden mt-3 space-y-3">
      ${kind === 'course' ? objectivesBlock() : ''}
      ${STRUCTURE_LEVELS[kind].map((s) => autogenSlider(s)).join('')}
    </div>
  </div>`;
  const statusBlock = gen.busy ? progressBlock(gen) : gen.error ? `<p class="mt-4 text-sm text-red-400">${escapeHtml(gen.error)}</p>` : '';

  return `<form data-action="${action}" class="mt-6 space-y-4">
    <div>
      <label class="block text-sm font-medium text-slate-300">${label}</label>
      <div class="mt-1"><input id="new-name-input" name="name" type="text" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm h-10 px-3" placeholder="${placeholder}" /></div>
    </div>
    ${kind === 'course' ? sourceModeSelector() : ''}
    <div id="ai-source-block">${autogenBlock}</div>
    ${kind === 'course' ? folderSourceBlock() : ''}
    ${statusBlock}
    <div class="pt-4 flex flex-row-reverse gap-3">
      <button type="submit" ${gen.busy ? 'disabled' : ''} class="inline-flex w-full justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 sm:w-auto disabled:opacity-50">${submitLabel}</button>
      <button type="button" data-action="close-modal" class="inline-flex w-full justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 sm:w-auto">${t('cancel')}</button>
    </div>
  </form>`;
}

function serverRow(s) {
  return `<div class="flex items-center gap-2 bg-slate-800/60 border ${s.isActive ? 'border-cyan-500/50' : 'border-slate-700'} rounded-md p-3">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="font-medium text-white truncate">${escapeHtml(s.name)}</span>
        <span class="text-[10px] uppercase tracking-wide bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">${escapeHtml(s.type)}</span>
        ${s.isActive ? `<span class="text-[10px] uppercase tracking-wide bg-cyan-600 text-white px-1.5 py-0.5 rounded">${t('server_active')}</span>` : ''}
      </div>
      <div class="text-xs text-slate-400 truncate">${escapeHtml(s.baseUrl)}${s.model ? ' · ' + escapeHtml(s.model) : ''}${s.hasKey ? ' · 🔑' : ''}</div>
    </div>
    ${s.isActive ? '' : `<button type="button" data-action="server-activate" data-id="${s.id}" class="text-xs px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-700 text-white">${t('server_use')}</button>`}
    <button type="button" data-action="server-test" data-id="${s.id}" title="${t('server_test')}" class="p-1.5 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-700">${icon('checkCircle', 'w-4 h-4')}</button>
    <button type="button" data-action="server-edit" data-id="${s.id}" title="${t('action_edit')}" class="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700">${icon('pencil', 'w-4 h-4')}</button>
    <button type="button" data-action="server-delete" data-id="${s.id}" title="${t('action_delete')}" class="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700">${icon('trash', 'w-4 h-4')}</button>
  </div>`;
}

function sttProviderRow(p) {
  return `<div class="flex items-center gap-2 bg-slate-800/60 border ${p.isActive ? 'border-cyan-500/50' : 'border-slate-700'} rounded-md p-3">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="font-medium text-white truncate">${escapeHtml(p.name)}</span>
        ${p.isActive ? `<span class="text-[10px] uppercase tracking-wide bg-cyan-600 text-white px-1.5 py-0.5 rounded">${t('server_active')}</span>` : ''}
      </div>
      <div class="text-xs text-slate-400 truncate">${escapeHtml(p.baseUrl)}${p.hasKey ? ' · 🔑' : ''}</div>
    </div>
    ${p.isActive ? '' : `<button type="button" data-action="stt-provider-activate" data-id="${p.id}" class="text-xs px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-700 text-white">${t('server_use')}</button>`}
    <button type="button" data-action="stt-provider-test" data-id="${p.id}" title="${t('server_test')}" class="p-1.5 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-700">${icon('checkCircle', 'w-4 h-4')}</button>
    <button type="button" data-action="stt-provider-edit" data-id="${p.id}" title="${t('action_edit')}" class="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700">${icon('pencil', 'w-4 h-4')}</button>
    <button type="button" data-action="stt-provider-delete" data-id="${p.id}" title="${t('action_delete')}" class="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700">${icon('trash', 'w-4 h-4')}</button>
  </div>`;
}

function sttProviderModal() {
  const f = state.sttProviderForm || {};
  const inner = `<form data-action="form-stt-provider" class="mt-6 space-y-3">
    <div><label class="block text-xs font-medium text-slate-400 mb-1">${t('label_name')}</label><input name="name" value="${escapeHtml(f.name || '')}" placeholder="${t('ph_name')}" required class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm" /></div>
    <div><label class="block text-xs font-medium text-slate-400 mb-1">${t('label_base_url')}</label><input name="baseUrl" value="${escapeHtml(f.baseUrl || '')}" placeholder="http://localhost:9000" required class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm" /></div>
    <div><label class="block text-xs font-medium text-slate-400 mb-1">${t('label_api_key')} ${f.id ? `<span class="text-slate-500">${t('api_key_keep')}</span>` : ''}</label><input name="apiKey" type="password" value="" placeholder="${f.hasKey ? t('api_key_stored') : t('api_key_ph')}" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm" /></div>
    <div class="pt-3 flex flex-row-reverse gap-3">
      <button type="submit" class="inline-flex justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">${f.id ? t('save') : t('add_stt_provider')}</button>
      <button type="button" data-action="open-modal" data-modal="settings" class="inline-flex justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700">${t('cancel')}</button>
    </div>
  </form>`;
  return modalShell('mic', f.id ? t('stt_provider_edit_title') : t('stt_provider_add_title'), t('stt_provider_desc'), inner);
}

function ttsProviderRow(p) {
  return `<div class="flex items-center gap-2 bg-slate-800/60 border ${p.isActive ? 'border-cyan-500/50' : 'border-slate-700'} rounded-md p-3">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="font-medium text-white truncate">${escapeHtml(p.name)}</span>
        ${p.isActive ? `<span class="text-[10px] uppercase tracking-wide bg-cyan-600 text-white px-1.5 py-0.5 rounded">${t('server_active')}</span>` : ''}
      </div>
      <div class="text-xs text-slate-400 truncate">${escapeHtml(p.baseUrl)}${p.hasKey ? ' · 🔑' : ''}</div>
    </div>
    ${p.isActive ? '' : `<button type="button" data-action="tts-provider-activate" data-id="${p.id}" class="text-xs px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-700 text-white">${t('server_use')}</button>`}
    <button type="button" data-action="tts-provider-test" data-id="${p.id}" title="${t('server_test')}" class="p-1.5 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-700">${icon('checkCircle', 'w-4 h-4')}</button>
    <button type="button" data-action="tts-provider-edit" data-id="${p.id}" title="${t('action_edit')}" class="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700">${icon('pencil', 'w-4 h-4')}</button>
    <button type="button" data-action="tts-provider-delete" data-id="${p.id}" title="${t('action_delete')}" class="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700">${icon('trash', 'w-4 h-4')}</button>
  </div>`;
}

function ttsProviderModal() {
  const f = state.ttsProviderForm || {};
  const inner = `<form data-action="form-tts-provider" class="mt-6 space-y-3">
    <div><label class="block text-xs font-medium text-slate-400 mb-1">${t('label_name')}</label><input name="name" value="${escapeHtml(f.name || '')}" placeholder="${t('ph_name')}" required class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm" /></div>
    <div><label class="block text-xs font-medium text-slate-400 mb-1">${t('label_base_url')}</label><input name="baseUrl" value="${escapeHtml(f.baseUrl || '')}" placeholder="http://localhost:5050" required class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm" /></div>
    <div><label class="block text-xs font-medium text-slate-400 mb-1">${t('label_api_key')} ${f.id ? `<span class="text-slate-500">${t('api_key_keep')}</span>` : ''}</label><input name="apiKey" type="password" value="" placeholder="${f.hasKey ? t('api_key_stored') : t('api_key_ph')}" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm" /></div>
    <div class="pt-3 flex flex-row-reverse gap-3">
      <button type="submit" class="inline-flex justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">${f.id ? t('save') : t('add_tts_provider')}</button>
      <button type="button" data-action="open-modal" data-modal="settings" class="inline-flex justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700">${t('cancel')}</button>
    </div>
  </form>`;
  return modalShell('volume2', f.id ? t('tts_provider_edit_title') : t('tts_provider_add_title'), t('tts_provider_desc'), inner);
}

function settingsTabBtn(key, label, iconName) {
  const active = (state.settingsTab || 'general') === key;
  const cls = active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/60';
  return `<button type="button" data-action="settings-tab" data-tab="${key}" class="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${cls}">${icon(iconName, 'w-4 h-4')}<span>${label}</span></button>`;
}

function generalSettingsPanel(f) {
  const langOpts = interfaceLangs.map(([v, l]) => `<option value="${v}" ${f.lang === v ? 'selected' : ''}>${l}</option>`).join('');
  return `<div>
    <label class="block text-sm font-medium text-slate-300">${t('language_label')}</label>
    <select name="lang" data-action="settings-lang" class="mt-1 block w-full rounded-md bg-slate-800 border border-slate-700 text-white sm:text-sm h-10 px-3">${langOpts}</select>
    <p class="mt-1 text-xs text-slate-500">${t('language_help')}</p>
  </div>`;
}

function aiServersSettingsPanel() {
  const servers = state.servers.length
    ? state.servers.map(serverRow).join('')
    : `<p class="text-sm text-slate-500">${t('no_servers')}</p>`;
  return `<div>
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-sm font-semibold text-white flex items-center gap-2">${icon('server', 'w-4 h-4 text-cyan-400')} ${t('settings_servers')}</h4>
      <button type="button" data-action="server-add" class="text-xs flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-md">${icon('plus', 'w-4 h-4')} ${t('add_server')}</button>
    </div>
    <div class="space-y-2 max-h-64 overflow-y-auto">${servers}</div>
    <p class="mt-3 text-xs text-slate-500">${t('servers_note')}</p>
  </div>`;
}

function speechSettingsPanel(f) {
  const sttProviders = state.sttProviders.length
    ? state.sttProviders.map(sttProviderRow).join('')
    : `<p class="text-sm text-slate-500">${t('no_stt_providers')}</p>`;
  return `<div>
    <label class="flex items-center gap-3 cursor-pointer select-none">
      <input type="checkbox" name="speechEnabled" data-action="settings-speech-toggle" ${f.speechEnabled ? 'checked' : ''} class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-600 focus:ring-cyan-500" />
      <span class="text-sm font-medium text-slate-300">${t('speech_enable_label')}</span>
    </label>
    <p class="mt-1 mb-4 text-xs text-slate-500">${t('speech_enable_hint')}</p>
    <div id="speech-provider-config" class="${f.speechEnabled ? '' : 'hidden'}">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-white flex items-center gap-2">${icon('mic', 'w-4 h-4 text-cyan-400')} ${t('settings_stt_providers')}</h4>
        <button type="button" data-action="stt-provider-add" class="text-xs flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-md">${icon('plus', 'w-4 h-4')} ${t('add_stt_provider')}</button>
      </div>
      <div class="space-y-2 max-h-64 overflow-y-auto">${sttProviders}</div>
      <p class="mt-3 text-xs text-slate-500">${t('stt_providers_note')}</p>
    </div>
  </div>`;
}

function ttsSettingsPanel(f) {
  const ttsProviders = state.ttsProviders.length
    ? state.ttsProviders.map(ttsProviderRow).join('')
    : `<p class="text-sm text-slate-500">${t('no_tts_providers')}</p>`;
  return `<div>
    <label class="flex items-center gap-3 cursor-pointer select-none">
      <input type="checkbox" name="ttsEnabled" data-action="settings-tts-toggle" ${f.ttsEnabled ? 'checked' : ''} class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-600 focus:ring-cyan-500" />
      <span class="text-sm font-medium text-slate-300">${t('tts_enable_label')}</span>
    </label>
    <p class="mt-1 mb-4 text-xs text-slate-500">${t('tts_enable_hint')}</p>
    <div id="tts-provider-config" class="${f.ttsEnabled ? '' : 'hidden'}">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-white flex items-center gap-2">${icon('volume2', 'w-4 h-4 text-cyan-400')} ${t('settings_tts_providers')}</h4>
        <button type="button" data-action="tts-provider-add" class="text-xs flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-md">${icon('plus', 'w-4 h-4')} ${t('add_tts_provider')}</button>
      </div>
      <div class="space-y-2 max-h-64 overflow-y-auto">${ttsProviders}</div>
      <p class="mt-3 text-xs text-slate-500">${t('tts_providers_note')}</p>
    </div>
  </div>`;
}

function settingsModal() {
  const f = state.settingsForm || { lang: state.lang, speechEnabled: state.speechEnabled, ttsEnabled: state.ttsEnabled };
  const tab = state.settingsTab || 'general';

  const tabs = `<div class="flex gap-1 border-b border-slate-700 pb-3 mb-4 flex-wrap">
    ${settingsTabBtn('general', t('settings_tab_general'), 'settings')}
    ${settingsTabBtn('servers', t('settings_tab_ai'), 'server')}
    ${settingsTabBtn('speech', t('settings_tab_speech'), 'mic')}
    ${settingsTabBtn('tts', t('settings_tab_tts'), 'volume2')}
  </div>`;

  const panel = tab === 'servers' ? aiServersSettingsPanel()
    : tab === 'speech' ? speechSettingsPanel(f)
    : tab === 'tts' ? ttsSettingsPanel(f)
    : generalSettingsPanel(f);

  const inner = `<form data-action="form-settings" class="mt-6">
    ${tabs}
    ${panel}
    <div class="pt-4 mt-4 border-t border-slate-700 flex flex-row-reverse gap-3">
      <button type="submit" class="inline-flex justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">${t('save')}</button>
    </div>
  </form>`;

  return modalShell('settings', t('language_settings'), t('settings_desc'), inner, 'max-w-2xl');
}

function serverModal() {
  const f = state.serverForm || {};
  const ms = state.serverModels || { generative: [], embedding: [] };
  const opt = (v, l) => `<option value="${v}" ${f.type === v ? 'selected' : ''}>${l}</option>`;
  const modelField = (name, value, items, label) => {
    value = value || '';
    if (items.length) {
      const opts = value && !items.includes(value) ? [value, ...items] : items;
      const optionsHtml = `<option value="">${t('model_none')}</option>` +
        opts.map((m) => `<option value="${escapeHtml(m)}" ${m === value ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');
      return `<div><label class="block text-xs font-medium text-slate-400 mb-1">${label}</label>
        <select name="${name}" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm">${optionsHtml}</select></div>`;
    }
    return `<div><label class="block text-xs font-medium text-slate-400 mb-1">${label}</label>
      <input name="${name}" value="${escapeHtml(value)}" placeholder="${t('models_hint_field')}" autocomplete="off" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm" /></div>`;
  };

  const inner = `<form data-action="form-server" class="mt-6 space-y-3">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div><label class="block text-xs font-medium text-slate-400 mb-1">${t('label_name')}</label><input name="name" value="${escapeHtml(f.name || '')}" placeholder="${t('ph_name')}" required class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm" /></div>
      <div><label class="block text-xs font-medium text-slate-400 mb-1">${t('label_type')}</label><select name="type" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm">${opt('openai', t('type_openai'))}${opt('gemini', t('type_gemini'))}</select></div>
    </div>
    <div><label class="block text-xs font-medium text-slate-400 mb-1">${t('label_base_url')}</label><input name="baseUrl" value="${escapeHtml(f.baseUrl || '')}" placeholder="http://localhost:11434/v1   or   https://api.openai.com/v1" required class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm" /></div>
    <div><label class="block text-xs font-medium text-slate-400 mb-1">${t('label_api_key')} ${f.id ? `<span class="text-slate-500">${t('api_key_keep')}</span>` : ''}</label><input name="apiKey" type="password" value="${escapeHtml(f._apiKeyTyped || '')}" placeholder="${f.hasKey ? t('api_key_stored') : t('api_key_ph')}" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm" /></div>

    <div class="pt-1 flex items-center justify-between">
      <span class="text-xs font-semibold text-slate-300">${t('models')}</span>
      <button type="button" data-action="server-load-models" class="text-xs flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-md">${icon('sparkles', 'w-4 h-4')} ${t('load_models')}</button>
    </div>
    ${state.serverModelsStatus ? `<p class="text-xs text-slate-400 -mt-1">${escapeHtml(state.serverModelsStatus)}</p>` : `<p class="text-xs text-slate-500 -mt-1">${t('models_hint_default')}</p>`}

    ${modelField('model', f.model, ms.generative, t('model_generative'))}
    ${modelField('multimodalModel', f.multimodalModel, ms.generative, t('model_multimodal'))}
    ${modelField('embeddingModel', f.embeddingModel, ms.embedding, t('model_embedding'))}

    <div class="pt-3 flex flex-row-reverse gap-3">
      <button type="submit" class="inline-flex justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">${f.id ? t('save') : t('add_server_btn')}</button>
      <button type="button" data-action="open-modal" data-modal="settings" class="inline-flex justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700">${t('cancel')}</button>
    </div>
  </form>`;
  return modalShell('server', f.id ? t('server_edit_title') : t('server_add_title'), t('server_desc'), inner);
}

function explanationEditModal() {
  const e = state.editingExplanation || {};
  const inner = `<form data-action="form-explanation-edit" class="mt-6 space-y-4">
    <div>
      <label class="block text-sm font-medium text-slate-300">${t('label_title')}</label>
      <input name="prompt" value="${escapeHtml(e.prompt || '')}" class="mt-1 block w-full rounded-md bg-slate-800 border border-slate-700 text-white sm:text-sm h-10 px-3" />
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-300">${t('label_content_md')}</label>
      <textarea name="content" rows="14" class="mt-1 block w-full rounded-md bg-slate-800 border border-slate-700 text-white sm:text-sm p-3 resize-y font-mono">${escapeHtml(e.content || '')}</textarea>
    </div>
    <div class="pt-2 flex flex-row-reverse gap-3">
      <button type="submit" class="inline-flex justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">${t('save')}</button>
      <button type="button" data-action="close-modal" class="inline-flex justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700">${t('cancel')}</button>
    </div>
  </form>`;
  return modalShell('pencil', t('expl_edit_title'), t('expl_edit_desc'), inner, 'max-w-2xl');
}

const NOTE_LABEL_OPTS = ['', 'important', 'doubt', 'review'];

function noteEditModal() {
  const n = state.editingNote || {};
  const anchorBlock = n.anchorText
    ? `<blockquote class="border-l-2 border-amber-500/50 pl-3 text-sm text-slate-400 italic">${escapeHtml(n.anchorText)}</blockquote>`
    : '';
  const labelOptions = NOTE_LABEL_OPTS.map((v) => `<option value="${v}" ${v === (n.label || '') ? 'selected' : ''}>${t(v ? `note_label_${v}` : 'note_label_general')}</option>`).join('');
  const inner = `<form data-action="form-note" class="mt-6 space-y-4">
    ${anchorBlock}
    <div>
      <label class="block text-sm font-medium text-slate-300">${t('note_content_label')}</label>
      <textarea name="content" rows="5" class="mt-1 block w-full rounded-md bg-slate-800 border border-slate-700 text-white sm:text-sm p-3 resize-y">${escapeHtml(n.content || '')}</textarea>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-300">${t('note_label_field')}</label>
      <select name="label" class="mt-1 block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm">${labelOptions}</select>
    </div>
    <div class="pt-2 flex flex-row-reverse gap-3">
      <button type="submit" class="inline-flex justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">${t('save')}</button>
      <button type="button" data-action="close-modal" class="inline-flex justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700">${t('cancel')}</button>
    </div>
  </form>`;
  return modalShell('stickyNote', n.id ? t('note_edit_title') : t('note_add_title'), t('note_edit_desc'), inner, 'max-w-lg');
}

function flashcardEditModal() {
  const c = state.editingFlashcard || {};
  const inner = `<form data-action="form-flashcard-edit" class="mt-6 space-y-4">
    <div>
      <label class="block text-sm font-medium text-slate-300">${t('label_front')}</label>
      <textarea name="front" rows="2" class="mt-1 block w-full rounded-md bg-slate-800 border border-slate-700 text-white sm:text-sm p-3 resize-y">${escapeHtml(c.front || '')}</textarea>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-300">${t('label_back_md')}</label>
      <textarea name="back" rows="6" class="mt-1 block w-full rounded-md bg-slate-800 border border-slate-700 text-white sm:text-sm p-3 resize-y">${escapeHtml(c.back || '')}</textarea>
    </div>
    <div class="pt-2 flex flex-row-reverse gap-3">
      <button type="submit" class="inline-flex justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">${t('save')}</button>
      <button type="button" data-action="close-modal" class="inline-flex justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700">${t('cancel')}</button>
    </div>
  </form>`;
  return modalShell('cards', t('fc_edit_title'), t('fc_edit_desc'), inner, 'max-w-lg');
}

function termExplainModal() {
  const te = state.termExplain || {};
  const inner = te.loading
    ? `<div class="mt-6 flex items-center gap-2 text-sm text-slate-400">${icon('loader', 'w-4 h-4 animate-spin')}${t('term_explaining')}</div>`
    : te.error
      ? `<p class="mt-6 text-sm text-red-400">${escapeHtml(te.error)}</p>`
      : `<div class="mt-6 prose prose-invert prose-sm max-w-none text-slate-300">${renderMarkdownInline(te.content)}</div>`;
  return modalShell('sparkles', te.term || '', t('term_modal_desc'), inner, 'max-w-md');
}

function termImageModal() {
  const ti = state.termImage || {};
  let inner;
  let desc = t('term_image_modal_desc');

  if (ti.mode === 'searching') {
    inner = `<div class="mt-6 flex items-center gap-2 text-sm text-slate-400">${icon('loader', 'w-4 h-4 animate-spin')}${t('term_illustrating')}</div>`;
  } else if (ti.mode === 'error') {
    inner = `<p class="mt-6 text-sm text-red-400">${escapeHtml(ti.error)}</p>`;
  } else if (ti.mode === 'browsing') {
    desc = t('term_image_modal_pick_desc');
    const c = ti.candidates[ti.index];
    const attribution = [c.attribution, c.license].filter(Boolean).join(' · ');
    inner = `<div class="mt-6 space-y-3">
      <div class="relative bg-slate-950 rounded-md overflow-hidden">
        <img src="${escapeHtml(c.previewUrl)}" alt="${escapeHtml(ti.term || '')}" class="w-full max-h-72 object-contain">
        <button type="button" data-action="term-image-prev" ${ti.index === 0 ? 'disabled' : ''} class="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-full p-1.5">${icon('chevronLeft', 'w-5 h-5')}</button>
        <button type="button" data-action="term-image-next" ${ti.index === ti.candidates.length - 1 ? 'disabled' : ''} class="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-full p-1.5">${icon('chevronRight', 'w-5 h-5')}</button>
      </div>
      <div class="flex items-center justify-between text-xs text-slate-500">
        <span>${t('term_image_counter', { n: ti.index + 1, total: ti.candidates.length })} · ${escapeHtml(c.provider)}</span>
        ${c.pageUrl ? `<a href="${escapeHtml(c.pageUrl)}" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:underline inline-flex items-center gap-1">${icon('link', 'w-3 h-3')}${t('term_image_source')}</a>` : ''}
      </div>
      ${c.caption ? `<p class="text-xs text-slate-400 italic">${escapeHtml(c.caption)}</p>` : ''}
      ${attribution ? `<p class="text-xs text-slate-500">${escapeHtml(attribution)}</p>` : ''}
      ${ti.error ? `<p class="text-xs text-red-400">${escapeHtml(ti.error)}</p>` : ''}
      <div class="pt-2 flex flex-row-reverse gap-3">
        <button type="button" data-action="term-image-use" ${ti.saving ? 'disabled' : ''} class="inline-flex items-center gap-2 justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">
          ${ti.saving ? `${icon('loader', 'w-4 h-4 animate-spin')}${t('term_image_saving')}` : t('term_image_use')}
        </button>
        <button type="button" data-action="close-modal" class="inline-flex justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700">${t('cancel')}</button>
      </div>
    </div>`;
  } else {
    const attribution = [ti.attribution, ti.license].filter(Boolean).join(' · ');
    inner = `<div class="mt-6 space-y-3">
      <img src="${escapeHtml(ti.url)}" alt="${escapeHtml(ti.caption || ti.term || '')}" class="w-full max-h-80 object-contain rounded-md bg-slate-950">
      ${ti.caption ? `<p class="text-xs text-slate-400 italic">${escapeHtml(ti.caption)}</p>` : ''}
      ${attribution ? `<p class="text-xs text-slate-500">${escapeHtml(attribution)}</p>` : ''}
      ${ti.pageUrl ? `<a href="${escapeHtml(ti.pageUrl)}" target="_blank" rel="noopener noreferrer" class="text-xs text-cyan-400 hover:underline inline-flex items-center gap-1">${icon('link', 'w-3 h-3')}${t('term_image_source')}</a>` : ''}
    </div>`;
  }
  return modalShell('image', ti.term || '', desc, inner, 'max-w-md');
}

// ---- U2: contextual help ----
function helpContext() {
  if (!selectedUnit()) return 'dashboard';
  const valid = ['explanations', 'generator', 'sources', 'flashcards', 'study', 'exam'];
  return valid.includes(state.unit.viewMode) ? state.unit.viewMode : 'dashboard';
}

function helpModal() {
  const ctx = helpContext();
  const inner = `<div class="mt-6 space-y-4">
    <div class="prose prose-invert prose-sm max-w-none text-slate-300">${renderMarkdown(t(`help_${ctx}_body`))}</div>
    <div class="pt-3 flex flex-row-reverse gap-3 border-t border-slate-700">
      <button type="button" data-action="close-modal" class="mt-3 inline-flex justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">${t('done')}</button>
      <button type="button" data-action="open-modal" data-modal="welcome" class="mt-3 inline-flex justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700">${t('help_show_workflow')}</button>
    </div>
  </div>`;
  return modalShell('help', t(`help_${ctx}_title`), t('help'), inner);
}

// ---- U3: onboarding / workflow overview ----
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function chip(label, iconName) {
  return `<span class="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-3 py-1.5 text-sm text-white">${iconName ? icon(iconName, 'w-4 h-4 text-cyan-400') : ''}${escapeHtml(label)}</span>`;
}
const arrow = () => `<span class="text-slate-500 flex-shrink-0">${icon('arrowRight', 'w-4 h-4')}</span>`;

function welcomeModal() {
  const structure = `<div class="flex items-center gap-2 flex-wrap">
    ${chip(cap(t('item_course')), 'bookCopy')}${arrow()}${chip(cap(t('item_subject')), 'folderKanban')}${arrow()}${chip(cap(t('item_unit')), 'notebookText')}
  </div>`;
  const tools = `<div class="flex items-center gap-2 flex-wrap">
    ${chip(t('tab_explanations'), 'notebookText')}
    ${chip(t('tab_sources'), 'messageSquare')}
    ${chip(t('tab_flashcards'), 'cards')}
    ${chip(t('tab_study'), 'bookOpen')}
    ${chip(t('tab_exam'), 'fileQuestion')}
  </div>`;
  const inner = `<div class="mt-6 space-y-5">
    <div>
      <div class="text-xs uppercase tracking-wide text-cyan-400 mb-2">${t('welcome_structure')}</div>
      ${structure}
      <p class="mt-2 text-sm text-slate-400">${t('welcome_structure_caption')}</p>
    </div>
    <div>
      <div class="text-xs uppercase tracking-wide text-cyan-400 mb-2">${t('welcome_tools')}</div>
      <p class="text-sm text-slate-400 mb-2">${t('welcome_tools_caption')}</p>
      ${tools}
    </div>
    <div class="pt-2 flex flex-row-reverse">
      <button type="button" data-action="close-modal" class="inline-flex justify-center rounded-md bg-cyan-600 px-5 py-2 text-sm font-semibold text-white hover:bg-cyan-700">${t('welcome_get_started')}</button>
    </div>
  </div>`;
  return modalShell('logo', t('welcome_title'), t('welcome_desc'), inner, 'max-w-2xl');
}

// ---- export / import (zip) ----
const EXPORT_FORMAT_OPTS = [
  ['sources', 'tab_sources', true],
  ['flashcards', 'tab_flashcards', true],
  ['exams', 'tab_exam', true],
  ['study', 'tab_study', true],
  ['chat', 'export_chat_history', false],
];

function exportModal() {
  const target = state.exportTarget || {};
  const checkboxes = EXPORT_FORMAT_OPTS.map(([key, labelKey, checkedByDefault]) => `
    <label class="flex items-center gap-2 text-sm text-slate-300">
      <input type="checkbox" name="formats" value="${key}" ${checkedByDefault ? 'checked' : ''} class="rounded bg-slate-800 border-slate-700 text-cyan-600 focus:ring-cyan-500" />
      ${t(labelKey)}
    </label>`).join('');

  const inner = `<form data-action="form-export" class="mt-6 space-y-4">
    <p class="text-sm text-slate-400">${t('export_always_included')}</p>
    <div class="space-y-2">${checkboxes}</div>
    <div class="pt-4 flex flex-row-reverse gap-3">
      <button type="submit" class="inline-flex items-center gap-2 justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">${icon('download', 'w-4 h-4')}${t('export_download_btn')}</button>
      <button type="button" data-action="close-modal" class="inline-flex justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700">${t('cancel')}</button>
    </div>
  </form>`;
  return modalShell('download', t('export_modal_title'), t('export_modal_desc', { name: target.name || '' }), inner);
}

function courseOptions(selectedId) {
  return state.tree.map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
}

function subjectOptions(selectedId) {
  const subjects = state.tree.flatMap((c) => c.subjects.map((s) => ({ id: s.id, label: `${c.name} / ${s.name}` })));
  return subjects.map((s) => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('');
}

function importTargetFields(p) {
  if (p.scope === 'course') return '';
  const courseField = `<div>
    <label class="block text-xs font-medium text-slate-400 mb-1">${t('import_target_course')}</label>
    <select name="targetCourseId" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm">
      <option value="">${t('import_target_new')}</option>
      ${courseOptions(p.targetCourseId)}
    </select>
  </div>
  <input name="newCourseName" placeholder="${t('import_new_course_ph')}" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm" />`;

  if (p.scope === 'subject') {
    return `<div class="pt-2 border-t border-slate-700 space-y-3">
      <p class="text-sm font-medium text-slate-300">${t('import_target_heading')}</p>
      ${courseField}
    </div>`;
  }
  return `<div class="pt-2 border-t border-slate-700 space-y-3">
    <p class="text-sm font-medium text-slate-300">${t('import_target_heading')}</p>
    <div>
      <label class="block text-xs font-medium text-slate-400 mb-1">${t('import_target_subject')}</label>
      <select name="targetSubjectId" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm">
        <option value="">${t('import_target_new')}</option>
        ${subjectOptions(p.targetSubjectId)}
      </select>
    </div>
    ${courseField}
    <input name="newSubjectName" placeholder="${t('import_new_subject_ph')}" class="block w-full rounded-md bg-slate-800 border border-slate-700 text-white h-10 px-3 text-sm" />
  </div>`;
}

function importPreviewModal() {
  const p = state.importPreview || {};
  const counts = p.counts || {};
  const countLine = (labelKey, n) => (n ? `<li>${n} ${t(labelKey)}</li>` : '');
  const countsList = `<ul class="mt-2 text-sm text-slate-400 list-disc list-inside space-y-0.5">
    ${countLine('word_subjects', counts.subjects)}${countLine('word_units', counts.units)}${countLine('word_explanations', counts.explanations)}
    ${countLine('notes_label', counts.notes)}
    ${countLine('tab_exam', counts.exams)}${countLine('tab_flashcards', counts.flashcards)}${countLine('tab_sources', counts.sources)}
    ${countLine('export_chat_history', counts.chatMessages)}${countLine('tab_study', counts.artifacts)}
  </ul>`;

  const conflictChoice = p.conflict ? `
    <div class="pt-2 border-t border-slate-700 space-y-2">
      <p class="text-sm text-amber-400">${t('import_conflict_warning', { name: p.conflict.existingName })}</p>
      <label class="flex items-center gap-2 text-sm text-slate-300">
        <input type="radio" name="mode" value="overwrite" data-action="import-mode" ${p.mode !== 'copy' ? 'checked' : ''} class="text-cyan-600 focus:ring-cyan-500" />
        ${t('import_mode_overwrite')}
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-300">
        <input type="radio" name="mode" value="copy" data-action="import-mode" ${p.mode === 'copy' ? 'checked' : ''} class="text-cyan-600 focus:ring-cyan-500" />
        ${t('import_mode_copy')}
      </label>
    </div>` : '<input type="hidden" name="mode" value="overwrite" />';

  const needsTarget = p.scope !== 'course' && (!p.conflict || p.mode === 'copy');

  const inner = `<form data-action="form-import-commit" class="mt-6 space-y-4">
    <p class="text-sm text-slate-300">${t(`import_scope_${p.scope}`)}: <span class="font-semibold text-white">${escapeHtml(p.name || '')}</span></p>
    ${countsList}
    ${conflictChoice}
    ${needsTarget ? importTargetFields(p) : ''}
    ${p.error ? `<p class="text-sm text-red-400">${escapeHtml(p.error)}</p>` : ''}
    <div class="pt-4 flex flex-row-reverse gap-3">
      <button type="submit" ${p.busy ? 'disabled' : ''} class="inline-flex justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50">${p.busy ? t('importing') : t('import_confirm_btn')}</button>
      <button type="button" data-action="close-modal" class="inline-flex justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700">${t('cancel')}</button>
    </div>
  </form>`;
  return modalShell('fileUp', t('import_modal_title'), t('import_modal_desc'), inner, 'max-w-lg');
}

// ---- folder ingest: plan preview (course creation from a documentation folder) ----
// Modeled on importPreviewModal() above, which solves the same "show the proposed
// tree, let the user confirm" problem. Minimum bar: unit/explanation checkboxes to
// exclude anything before commit — nothing is written to the database until then.

function ingestSkippedList(skippedDocs) {
  if (!skippedDocs?.length) return '';
  const items = skippedDocs.map((d) => {
    const reason = d.reason ? t(`ingest_skip_reason_${d.reason}`) : (d.error || '');
    return `<li class="truncate">${escapeHtml(d.path)} — ${escapeHtml(reason)}</li>`;
  }).join('');
  return `<div class="text-xs text-amber-400">
    <p class="font-medium mb-1">${t('ingest_skipped_title', { n: skippedDocs.length })}</p>
    <ul class="list-disc list-inside space-y-0.5 max-h-24 overflow-y-auto">${items}</ul>
  </div>`;
}

function ingestUnitRow(u, si, ui, excluded) {
  const uKey = `${si}:${ui}`;
  const uChecked = !excluded[uKey];
  const explanations = (u.explanations || []).map((e, ei) => {
    const eKey = `${si}:${ui}:${ei}`;
    const eChecked = uChecked && !excluded[eKey];
    return `<label class="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
      <input type="checkbox" data-action="toggle-ingest-item" data-key="${eKey}" ${eChecked ? 'checked' : ''} ${uChecked ? '' : 'disabled'} class="rounded bg-slate-800 border-slate-700 text-cyan-600 focus:ring-cyan-500" />
      <span>${escapeHtml(e.title)}</span>
    </label>`;
  }).join('');
  return `<div class="px-3 py-2">
    <label class="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
      <input type="checkbox" data-action="toggle-ingest-item" data-key="${uKey}" ${uChecked ? 'checked' : ''} class="rounded bg-slate-800 border-slate-700 text-cyan-600 focus:ring-cyan-500" />
      <span class="font-medium">${escapeHtml(u.name)}</span>
      <span class="text-xs text-slate-500">${t('ingest_docs_count', { n: (u.docIds || []).length })}</span>
    </label>
    <div class="mt-1.5 ml-6 space-y-1">${explanations}</div>
  </div>`;
}

function ingestPreviewModal() {
  const p = state.ingestPreview || {};
  const plan = p.plan || { subjects: [] };
  const excluded = p.excluded || {};

  const tree = (plan.subjects || []).map((s, si) => `
    <div class="border border-slate-700 rounded-md">
      <div class="px-3 py-2 bg-slate-800/40 text-sm font-semibold text-white">${escapeHtml(s.name)}</div>
      <div class="divide-y divide-slate-800">${(s.units || []).map((u, ui) => ingestUnitRow(u, si, ui, excluded)).join('')}</div>
    </div>`).join('');

  const objectivesHtml = plan.objectives
    ? `<div class="text-sm text-slate-400"><p class="font-medium text-slate-300 mb-1">${t('objectives_section_label')}</p><div class="prose prose-invert prose-sm max-w-none">${renderMarkdown(plan.objectives)}</div></div>`
    : '';

  const inner = `<div class="mt-6 space-y-4">
    ${objectivesHtml}
    <div class="space-y-2 max-h-80 overflow-y-auto">${tree}</div>
    ${ingestSkippedList(p.skippedDocs)}
    ${p.error ? `<p class="text-sm text-red-400">${escapeHtml(p.error)}</p>` : ''}
    <div class="pt-3 flex flex-row-reverse gap-3 border-t border-slate-700">
      <button type="button" data-action="ingest-confirm" ${p.busy ? 'disabled' : ''} class="inline-flex justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50">${p.busy ? t('ingest_committing') : t('ingest_confirm_btn')}</button>
      <button type="button" data-action="close-modal" class="inline-flex justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700">${t('cancel')}</button>
    </div>
  </div>`;
  return modalShell('sparkles', t('ingest_preview_title', { name: p.courseName || '' }), t('ingest_preview_desc'), inner, 'max-w-2xl');
}

export function renderModals() {
  switch (state.modal) {
    case 'export':
      return exportModal();
    case 'import-preview':
      return importPreviewModal();
    case 'ingest-preview':
      return ingestPreviewModal();
    case 'explanation-edit':
      return explanationEditModal();
    case 'flashcard-edit':
      return flashcardEditModal();
    case 'term-explain':
      return termExplainModal();
    case 'term-image':
      return termImageModal();
    case 'note-edit':
      return noteEditModal();
    case 'help':
      return helpModal();
    case 'welcome':
      return welcomeModal();
    case 'course':
      return modalShell('bookCopy', t('modal_course_title'), t('modal_course_desc'), nameForm('course', 'form-course', t('label_course_name'), t('ph_course_name'), t('btn_create_course')));
    case 'subject':
      return modalShell('folderKanban', t('modal_subject_title'), t('modal_subject_desc', { name: selectedCourse()?.name || '' }), nameForm('subject', 'form-subject', t('label_subject_name'), t('ph_subject_name'), t('btn_create_subject')));
    case 'unit':
      return modalShell('notebookText', t('modal_unit_title'), t('modal_unit_desc', { name: selectedSubject()?.name || '' }), nameForm('unit', 'form-unit', t('label_unit_name'), t('ph_unit_name'), t('btn_create_unit')));
    case 'settings':
      return settingsModal();
    case 'server':
      return serverModal();
    case 'stt-provider':
      return sttProviderModal();
    case 'tts-provider':
      return ttsProviderModal();
    default:
      return '';
  }
}
