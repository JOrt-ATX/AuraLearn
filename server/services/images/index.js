// Multi-provider image search: aggregates candidates from every source without
// downloading anything (browsing a carousel should cost no disk I/O). Only
// downloadImage() — called once, for whichever candidate the user picks —
// actually writes a file, keeping the app's "download only what you keep"
// self-hosted principle from the single-provider version of this feature.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { DATA_PATH, uid } from '../../db.js';
import { searchWikipediaImages } from './wikimedia.js';
import { searchOpenverseImages } from './openverse.js';
import { fetchWithTimeout } from './http.js';

const USER_AGENT = 'AuraLearn/1.0 (self-hosted personal study app)';

// Wikipedia first (usually the most topically precise match for a specific
// term) then Openverse (broader photographic/illustration coverage). One
// provider failing (network, rate limit) doesn't sink the whole search.
export async function searchImages(term, language) {
  const [wiki, openverse] = await Promise.all([
    searchWikipediaImages(term, language).catch((e) => { console.error('[images] Wikipedia search failed:', e); return []; }),
    searchOpenverseImages(term).catch((e) => { console.error('[images] Openverse search failed:', e); return []; }),
  ]);
  return [...wiki, ...openverse];
}

export async function downloadImage(candidate) {
  const res = await fetchWithTimeout(candidate.fullUrl, { headers: { 'User-Agent': USER_AGENT } }, 15000);
  if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const id = uid();
  const ext = extname(new URL(candidate.fullUrl).pathname) || '.jpg';
  const dir = join(DATA_PATH, 'images', 'terms');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${id}${ext}`);
  writeFileSync(filePath, buffer);

  return { id, filePath };
}
