import { state } from '../state.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { escapeHtml } from '../ui.js';
import { selectedCourse, selectedSubject, selectedUnit } from '../selectors.js';

export function renderSpinner() {
  return `<div class="flex items-center justify-center h-full">
    <div class="flex flex-col items-center">
      ${icon('loader', 'w-12 h-12 text-cyan-400 animate-spin')}
      <p class="mt-4 text-slate-400">${t('loading_workspace')}</p>
    </div>
  </div>`;
}

export function renderSidebar() {
  return `
    <div class="p-4 flex items-center gap-3 border-b border-slate-800 h-16">
      ${icon('logo', 'w-8 h-8 text-cyan-400')}
      <h1 class="text-lg font-bold text-white">Aura Learn</h1>
      <div class="flex-1 md:hidden flex justify-end">
        <button data-action="toggle-sidebar" data-open="false" class="p-1 text-slate-400 hover:text-white">${icon('x', 'w-6 h-6')}</button>
      </div>
    </div>
    <nav class="flex-1 p-2 space-y-1 overflow-y-auto">
      ${state.tree.map((c) => `
        <button data-action="nav-course" data-id="${c.id}" class="w-full text-left flex items-center px-4 py-2 text-sm font-medium rounded-md ${state.sel.courseId === c.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50'}">
          ${icon('bookCopy', 'w-5 h-5 mr-3')}<span class="truncate">${escapeHtml(c.name)}</span>
        </button>`).join('')}
      ${state.tree.length === 0 ? `<p class="px-4 py-2 text-xs text-slate-600">${t('no_courses_yet')}</p>` : ''}
    </nav>
    <div class="p-2 border-t border-slate-800 space-y-1">
      <button data-action="open-import" class="w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-200">
        ${icon('fileUp', 'w-5 h-5 mr-3')}<span>${t('import_btn')}</span>
      </button>
      <input type="file" id="import-file-input" data-action="import-file" accept=".zip" class="hidden" />
      <button data-action="open-modal" data-modal="settings" class="w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-200">
        ${icon('settings', 'w-5 h-5 mr-3')}<span>${t('settings')}</span>
      </button>
    </div>`;
}

function newButton(modal, label) {
  return `<button data-action="open-modal" data-modal="${modal}" class="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">${icon('plus', 'w-5 h-5')} ${label}</button>`;
}

export function renderHeader() {
  const c = selectedCourse(), s = selectedSubject(), u = selectedUnit();
  let title = t('dashboard');
  let crumbs = `<span class="hidden sm:inline">${t('dashboard_subtitle')}</span>`;
  const home = `<button data-action="crumb" data-level="courses" class="hover:underline">${t('courses')}</button>`;

  if (c) { title = c.name; crumbs = home; }
  if (s) { title = s.name; crumbs = `${home} &gt; <button data-action="crumb" data-level="course" class="hover:underline">${escapeHtml(c.name)}</button>`; }
  if (u) { title = u.name; crumbs = `${home} &gt; <button data-action="crumb" data-level="course" class="hover:underline">${escapeHtml(c.name)}</button> &gt; <button data-action="crumb" data-level="subject" class="hover:underline">${escapeHtml(s.name)}</button>`; }

  let action = '';
  if (!c) action = newButton('course', t('new_course'));
  else if (c && !s) action = newButton('subject', t('new_subject'));
  else if (s && !u) action = newButton('unit', t('new_unit'));

  return `<div class="border-b border-slate-800 h-16 flex items-center justify-between px-4 sm:px-8 flex-shrink-0">
    <div class="flex items-center gap-4 min-w-0">
      <button data-action="toggle-sidebar" data-open="true" class="md:hidden p-1 text-slate-400 hover:text-white">${icon('menu', 'w-6 h-6')}</button>
      <div class="min-w-0">
        <h1 class="text-xl font-bold text-white truncate">${escapeHtml(title)}</h1>
        <div class="text-sm text-slate-400 space-x-1 hidden sm:block">${crumbs}</div>
      </div>
    </div>
    <div class="flex items-center gap-2">
      ${u ? `<button data-action="export-item" data-type="unit" data-id="${u.id}" data-name="${escapeHtml(u.name)}" title="${t('action_export')}" aria-label="${t('action_export')}" class="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800">${icon('download', 'w-5 h-5')}</button>` : ''}
      <button data-action="open-modal" data-modal="help" title="${t('help')}" aria-label="${t('help')}" class="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800">${icon('help', 'w-5 h-5')}</button>
      <div class="hidden sm:block">${action}</div>
    </div>
  </div>`;
}

function card(item, type, iconName) {
  const count = type === 'course' ? item.subjects.length : type === 'subject' ? item.units.length : item.explanations.length;
  const label = type === 'course' ? t('word_subjects') : type === 'subject' ? t('word_units') : t('word_explanations');
  return `<div class="relative group">
    <div class="absolute top-3 right-3 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button data-action="export-item" data-type="${type}" data-id="${item.id}" data-name="${escapeHtml(item.name)}" title="${t('action_export')}" class="p-1.5 rounded-md text-slate-500 hover:text-cyan-400 hover:bg-slate-700/60">${icon('download', 'w-4 h-4')}</button>
      <button data-action="delete-item" data-type="${type}" data-id="${item.id}" title="${t('action_delete')}" class="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-700/60">${icon('trash', 'w-4 h-4')}</button>
    </div>
    <div data-action="select-item" data-type="${type}" data-id="${item.id}" class="bg-slate-800/50 border border-slate-700 rounded-lg p-6 flex flex-col hover:border-cyan-400/50 cursor-pointer transition-all duration-200 ease-in-out transform hover:-translate-y-1">
      <div class="flex-1 mb-4">
        <div class="w-12 h-12 flex items-center justify-center bg-slate-700/80 rounded-lg mb-4 group-hover:bg-cyan-500/10 transition-colors">${icon(iconName, 'w-6 h-6 text-cyan-400')}</div>
        <h3 class="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors pr-6">${escapeHtml(item.name)}</h3>
      </div>
      <div class="text-sm text-slate-400">${count} ${label}</div>
    </div>
  </div>`;
}

function emptyState(type, iconName) {
  return `<div class="text-center bg-slate-800/50 border border-dashed border-slate-700 rounded-lg p-12 animate-fade-in">
    ${icon(iconName, 'mx-auto h-12 w-12 text-slate-500')}
    <h2 class="mt-4 text-xl font-semibold text-white">${t(`empty_${type}_title`)}</h2>
    <p class="mt-2 text-slate-400">${t(`empty_${type}_hint`)}</p>
  </div>`;
}

export function renderGrid() {
  const c = selectedCourse(), s = selectedSubject();
  let items, type, iconName;
  if (s) { items = s.units; type = 'unit'; iconName = 'notebookText'; }
  else if (c) { items = c.subjects; type = 'subject'; iconName = 'folderKanban'; }
  else { items = state.tree; type = 'course'; iconName = 'bookCopy'; }

  if (!items.length) return emptyState(type, iconName);
  return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 animate-fade-in">
    ${items.map((it) => card(it, type, iconName)).join('')}
  </div>`;
}
