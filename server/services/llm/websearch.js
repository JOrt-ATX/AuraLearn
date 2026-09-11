// Google Custom Search JSON API — used to back citations for "reliable" providers
// that have no native grounding (e.g. Mistral cloud). Never throws: callers treat
// an empty array as "no citations available" rather than an error.
import { extractOgImage } from '../extract.js';

const CSE_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';

export async function searchWeb(query, { num = 6 } = {}) {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx || !query) return [];

  try {
    const params = new URLSearchParams({ key, cx, q: query, num: String(num) });
    const res = await fetch(`${CSE_ENDPOINT}?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((it) => ({ url: it.link, title: it.title, snippet: it.snippet }));
  } catch {
    return [];
  }
}

// HEAD first (cheap); some servers reject HEAD, so fall back to a ranged GET.
export async function verifyUrl(url, { timeoutMs = 5000 } = {}) {
  const tryFetch = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: method === 'GET' ? { Range: 'bytes=0-0' } : undefined,
      });
      return res.ok || res.status === 206;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  if (await tryFetch('HEAD')) return true;
  return tryFetch('GET');
}

export async function verifyUrls(list) {
  const results = await Promise.allSettled(list.map((item) => verifyUrl(item.url)));
  return list.filter((_, i) => results[i].status === 'fulfilled' && results[i].value === true);
}

// Best-effort thumbnail for a citation: fetch the page and read its og:image/
// twitter:image meta tag. Returns null on any failure — a citation with no
// image just renders as a text-only card, never blocks the citation itself.
export async function fetchOgImage(url, { timeoutMs = 4000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuraLearn/1.0)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const image = extractOgImage(html, res.url || url);
    return image && /^https?:\/\//i.test(image) ? image : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
