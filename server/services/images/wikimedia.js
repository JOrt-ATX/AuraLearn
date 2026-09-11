// Wikipedia term search — returns candidate illustrations (metadata + a still-
// remote preview URL) for a term, WITHOUT downloading anything. Only the single
// candidate the user picks from the carousel gets downloaded (see index.js).
//
// Batches every per-title lookup into a single request (Wikimedia's API accepts
// multiple pipe-separated titles per call) instead of one call per candidate —
// that cuts what used to be ~9 sequential requests per search down to ~3, which
// mattered in practice: that many rapid per-title calls was enough on its own
// to trip Wikipedia's rate limiting (429) after a few searches in a session.
import { fetchWithTimeout } from './http.js';

const USER_AGENT = 'AuraLearn/1.0 (self-hosted personal study app)';

// aiLanguage names (as used elsewhere in prompts, e.g. "Spanish") → Wikipedia subdomain.
const WIKI_LANG = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it',
  portuguese: 'pt', dutch: 'nl', russian: 'ru', japanese: 'ja', chinese: 'zh',
};

function wikiHost(language) {
  const code = WIKI_LANG[(language || '').toLowerCase()];
  return code ? `${code}.wikipedia.org` : 'en.wikipedia.org';
}

async function wikiApi(host, params) {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ format: 'json', ...params })}`;
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia API error: ${res.status}`);
  return res.json();
}

async function searchPageTitles(host, term, limit) {
  const data = await wikiApi(host, { action: 'query', list: 'search', srsearch: term, srlimit: limit });
  return (data?.query?.search || []).map((r) => r.title);
}

// One batched call for every title's main image (full + thumbnail) + its
// Commons file title, instead of one call per title.
async function findPageImages(host, titles) {
  const data = await wikiApi(host, {
    action: 'query', titles: titles.join('|'), prop: 'pageimages', piprop: 'original|thumbnail|name',
    pithumbsize: 400, redirects: 1,
  });
  const map = new Map();
  for (const page of Object.values(data?.query?.pages || {})) {
    if (!page?.original || !page?.title) continue;
    map.set(page.title, {
      fullUrl: page.original.source,
      previewUrl: page.thumbnail?.source || page.original.source,
      // Space-normalized to match the title MediaWiki echoes back from the
      // batched license lookup below — page.pageimage is the raw underscored
      // filename, and a mismatched form here means findLicenses()'s map key
      // never matches, silently losing license/attribution/caption for every
      // result (only invisible with a single title, where no key-matching is
      // needed at all).
      fileTitle: `File:${page.pageimage.replace(/_/g, ' ')}`,
    });
  }
  return map;
}

// Commons descriptions are often HTML with multi-language <div> blocks — strip
// tags and cap length. Returns null (no caption shown) if nothing usable comes
// out, rather than synthesizing one — the caption is only ever what the source
// already provides.
function cleanCaption(raw) {
  if (!raw) return null;
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

// One batched call for every file's license/attribution/caption, instead of
// one per file.
async function findLicenses(fileTitles) {
  if (!fileTitles.length) return new Map();
  const data = await wikiApi('commons.wikimedia.org', {
    action: 'query', titles: fileTitles.join('|'), prop: 'imageinfo', iiprop: 'extmetadata',
  });
  const map = new Map();
  for (const page of Object.values(data?.query?.pages || {})) {
    if (!page?.title) continue;
    const meta = page.imageinfo?.[0]?.extmetadata;
    map.set(page.title, {
      license: meta?.LicenseShortName?.value || null,
      attribution: meta?.Artist?.value?.replace(/<[^>]+>/g, '').trim() || null,
      caption: cleanCaption(meta?.ImageDescription?.value),
    });
  }
  return map;
}

// Searches Wikipedia for `term` (in the requested language, falling back to
// English if that language has no matching pages/images) and returns up to
// `limit` candidate illustrations — one per matching page that has a main image.
export async function searchWikipediaImages(term, language, limit = 4) {
  const primary = wikiHost(language);
  const hosts = primary === 'en.wikipedia.org' ? [primary] : [primary, 'en.wikipedia.org'];

  for (const host of hosts) {
    const titles = await searchPageTitles(host, term, limit);
    if (!titles.length) continue;

    const imagesByTitle = await findPageImages(host, titles);
    if (!imagesByTitle.size) continue;

    const fileTitles = [...new Set([...imagesByTitle.values()].map((img) => img.fileTitle))];
    const licensesByFile = await findLicenses(fileTitles);

    const candidates = [];
    for (const title of titles) {
      const image = imagesByTitle.get(title);
      if (!image) continue;
      const lic = licensesByFile.get(image.fileTitle) || {};
      candidates.push({
        provider: 'wikipedia',
        fullUrl: image.fullUrl,
        previewUrl: image.previewUrl,
        pageUrl: `https://${host}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        attribution: lic.attribution || null,
        license: lic.license || null,
        caption: lic.caption || null,
      });
    }
    if (candidates.length) return candidates; // found results in this language — don't also pull English duplicates
  }
  return [];
}
