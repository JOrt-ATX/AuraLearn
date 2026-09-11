// Openverse — aggregated search across openly-licensed image sources (Wikimedia
// Commons, Flickr Commons, museums, etc.). No API key needed for personal-use
// volumes (unauthenticated requests are rate-limited but that's fine for
// occasional "illustrate this term" clicks); a registered key could be added
// later if that ever becomes a real constraint.
import { fetchWithTimeout } from './http.js';

const USER_AGENT = 'AuraLearn/1.0 (self-hosted personal study app)';

export async function searchOpenverseImages(term, limit = 6) {
  const url = `https://api.openverse.org/v1/images/?${new URLSearchParams({
    q: term, page_size: String(limit),
  })}`;
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } }, 5000);
  if (!res.ok) throw new Error(`Openverse API error: ${res.status}`);
  const data = await res.json();
  return (data?.results || []).map((r) => ({
    provider: r.source || r.provider || 'openverse',
    fullUrl: r.url,
    previewUrl: r.thumbnail || r.url,
    pageUrl: r.foreign_landing_url || null,
    attribution: r.attribution || r.creator || null,
    license: r.license ? `${r.license.toUpperCase()}${r.license_version ? ' ' + r.license_version : ''}` : null,
    caption: r.title || null,
  }));
}
