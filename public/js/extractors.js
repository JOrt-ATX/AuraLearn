// Document text extraction — all processing runs in the browser.
// New formats can be added here without touching app.js or the backend.

export const ACCEPTED_EXTENSIONS = '.pdf,.docx,.pptx,.xlsx,.md,.html,.xml,.txt,.csv,.json,.png,.jpg,.jpeg,.webp,.gif';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

// Derive a canonical MIME type from the file extension because browsers
// often report .md as "text/plain" and .xml as "application/octet-stream".
function resolveType(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return ({
    pdf:  'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    md:   'text/markdown',
    html: 'text/html',
    htm:  'text/html',
    xml:  'text/xml',
    txt:  'text/plain',
    csv:  'text/csv',
    json: 'application/json',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif:  'image/gif',
  })[ext] || file.type;
}

export function isSupportedDocument(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return ['pdf', 'docx', 'pptx', 'xlsx', 'md', 'html', 'htm', 'xml', 'txt', 'csv', 'json', ...IMAGE_EXTENSIONS].includes(ext);
}

export function isImage(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

// ---- per-format extractors (libraries loaded on demand via CDN) ----

async function extractPdf(buf) {
  const pdfjs = await import('https://esm.run/pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://esm.run/pdfjs-dist/build/pdf.worker.mjs';
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    out += tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  const trimmed = out.trim();
  if (!trimmed) throw new Error('no_text');
  return trimmed;
}

// JSZip is shared by both DOCX and PPTX (both are ZIP archives of XML files).
async function loadZip(buf) {
  const mod = await import('https://esm.sh/jszip');
  const JSZip = mod.default || mod;
  return JSZip.loadAsync(buf);
}

async function extractDocx(buf) {
  const zip = await loadZip(buf);
  const xml = await zip.files['word/document.xml'].async('string');
  // Insert newlines at paragraph boundaries, then collect <w:t> text runs.
  const withBreaks = xml.replace(/<\/w:p>/g, '\n');
  return (withBreaks.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
    .map(m => m.replace(/<[^>]+>/g, ''))
    .join(' ')
    .replace(/ +\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

async function extractPptx(buf) {
  const zip = await loadZip(buf);
  const slideKeys = Object.keys(zip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  const pages = await Promise.all(slideKeys.map(async k => {
    const xml = await zip.files[k].async('string');
    return (xml.match(/<a:t[^>]*>[^<]*<\/a:t>/g) || [])
      .map(m => m.replace(/<[^>]+>/g, '')).join(' ');
  }));
  return pages.filter(Boolean).join('\n');
}

async function extractXlsx(buf) {
  const mod = await import('https://esm.sh/xlsx');
  const XLSX = mod.default || mod;
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  return wb.SheetNames
    .map(name => `[${name}]\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`)
    .join('\n\n');
}

function stripHtml(raw) {
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  // Remove elements whose content should not appear as text.
  // textContent is used instead of innerText — innerText triggers a full
  // synchronous layout on DOMParser documents, which blocks the main thread
  // on large HTML files and makes the UI appear to hang.
  doc.querySelectorAll('script, style, noscript, head').forEach(el => el.remove());
  return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
}

function stripXml(raw) {
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extract plain text from any supported document File.
 * Throws on failure — callers should catch and surface the error to the user.
 */
export async function extractText(file) {
  const type = resolveType(file);
  const buf = await file.arrayBuffer();

  if (type === 'application/pdf')
    return extractPdf(buf);
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    return extractDocx(buf);
  if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    return extractXlsx(buf);
  if (type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    return extractPptx(buf);
  const text = new TextDecoder().decode(buf);
  if (type === 'text/html') return stripHtml(text);
  if (type === 'text/xml' || type === 'application/xml') return stripXml(text);
  return text; // markdown, plain text, csv and json all read fine as-is
}

/** Reads a File as a base64 data URL, for handing an image to a vision model. */
export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

const MAX_FOLDER_FILE_BYTES = 20 * 1024 * 1024;
const IGNORED_DIR_NAMES = new Set(['node_modules', 'dist', 'build', '__MACOSX', 'venv', '.git']);

// A dotfile/dotdir anywhere in the path (incl. .git, already listed above for
// clarity) or a known build/vendor directory disqualifies the whole file.
function isIgnoredPath(relativePath) {
  return relativePath.split('/').some((seg) => seg.startsWith('.') || IGNORED_DIR_NAMES.has(seg));
}

/**
 * Extracts every supported document (and image) out of a folder picked via
 * <input webkitdirectory>. A per-file failure (corrupt docx, scanned PDF with
 * no extractable text, …) is recorded in `skipped` instead of throwing, so one
 * bad file never sinks the whole corpus. Runs entirely in the browser.
 */
export async function extractFolder(files, onProgress) {
  const docs = [];
  const skipped = [];
  const total = files.length;
  let done = 0;

  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const report = () => { done += 1; onProgress?.({ done, total, filename: path }); };

    // Office lock files (~$Document.docx) appear alongside the real file when
    // it's open elsewhere — never worth ingesting.
    if (isIgnoredPath(path) || file.name.startsWith('~$')) { report(); continue; }
    if (!isSupportedDocument(file)) { skipped.push({ path, reason: 'unsupported_type' }); report(); continue; }
    if (file.size > MAX_FOLDER_FILE_BYTES) { skipped.push({ path, reason: 'too_large' }); report(); continue; }

    const mime = resolveType(file);
    try {
      if (isImage(file)) docs.push({ path, filename: file.name, mime, kind: 'image', imageDataUrl: await fileToDataUrl(file) });
      else docs.push({ path, filename: file.name, mime, kind: 'text', text: await extractText(file) });
    } catch (e) {
      skipped.push({ path, reason: e.message === 'no_text' ? 'no_text' : 'parse_error' });
    }
    report();
  }

  return { docs, skipped };
}
