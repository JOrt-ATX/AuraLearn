// Lightweight source extraction. PDFs are parsed in the browser (reusing the
// existing pdfjs flow) and POSTed as text, so the backend stays dependency-free.
// URLs are fetched here and reduced to readable text with a small tag-stripping
// pass — good enough for articles/docs at personal scale.

export async function fetchUrlText(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuraLearn/1.0)' },
      redirect: 'follow',
    });
  } catch (e) {
    throw new Error(`Could not fetch URL: ${e.message}`);
  }
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  const html = await res.text();
  return { text: htmlToText(html), title: extractTitle(html) };
}

// Strip scripts/styles/markup and collapse whitespace into readable plain text.
export function htmlToText(html) {
  let s = html || '';
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|svg|head|template)[\s\S]*?<\/\1>/gi, ' ');
  // Turn block-level closings into line breaks so structure survives.
  s = s.replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|table|header|footer|nav)>/gi, '\n');
  s = s.replace(/<br\s*\/?>(?=)/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/[ \t\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

function extractTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '');
  return m ? decodeEntities(m[1]).trim().slice(0, 200) : '';
}

// Pulls a representative illustration out of <head> meta tags (og:image, falling
// back to twitter:image) — run on raw HTML, since htmlToText() strips <head> first.
export function extractOgImage(html, baseUrl) {
  const metaRe = /<meta\s+[^>]*>/gi;
  const props = ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'];
  const tags = (html || '').match(metaRe) || [];
  for (const prop of props) {
    for (const tag of tags) {
      const nameMatch = new RegExp(`(?:property|name)\\s*=\\s*["']${prop}["']`, 'i').test(tag);
      if (!nameMatch) continue;
      const contentMatch = /content\s*=\s*["']([^"']+)["']/i.exec(tag);
      if (!contentMatch) continue;
      try {
        return new URL(decodeEntities(contentMatch[1]), baseUrl).toString();
      } catch {
        continue;
      }
    }
  }
  return null;
}

function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
  return (s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

function safeCodePoint(n) {
  try { return String.fromCodePoint(n); } catch { return ''; }
}
