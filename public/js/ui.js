import { marked } from 'marked';
import DOMPurify from '/vendor/dompurify/purify.es.mjs';

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Limits style="" to color/background-color only so coloured spans from LLMs
// render, without letting through position/behavioural CSS.
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName !== 'style') return;
  data.attrValue = data.attrValue
    .split(';')
    .filter((p) => /^\s*(color|background-color)\s*:/i.test(p))
    .join(';');
});

// Sanitizes LLM-generated HTML with DOMPurify (a maintained parser-based sanitizer)
// instead of a hand-rolled regex — closes gaps regex can't catch (iframe/object/embed/
// form/base, javascript:/data: URIs in href/src) while still allowing the safe subset
// (headings, lists, tables, code, coloured spans) real markdown/LLM output produces.
function sanitizeHtml(html) {
  return DOMPurify.sanitize(html);
}

// Content is from the user's own LLM in a local single-user app (same trust model
// as the original, which rendered with dangerouslySetInnerHTML).
export function renderMarkdown(content) {
  try { return sanitizeHtml(marked.parse(content || '', { async: false })); }
  catch { return escapeHtml(content); }
}

// Renders inline markdown (bold, italic, code, colour spans) without a wrapping <p>.
// Use for short LLM-generated texts embedded inside an existing block element.
export function renderMarkdownInline(content) {
  try {
    const html = sanitizeHtml(marked.parse(content || '', { async: false })).trim();
    return html.startsWith('<p>') && html.endsWith('</p>') ? html.slice(3, -4) : html;
  } catch { return escapeHtml(content); }
}
