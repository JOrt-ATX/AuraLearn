// "Further reading" links attached to a generated explanation. Real links only:
// Gemini uses native Search grounding, other reliable profiles use Google CSE —
// never the model's own (hallucination-prone) text. Verified before being returned.
import { getActiveServer, citationsSupported } from './llm/index.js';
import { geminiGroundedSearch } from './llm/gemini.js';
import { searchWeb, verifyUrls, verifyUrl, fetchOgImage } from './llm/websearch.js';

const VIDEO_HOSTS = /youtube\.com|youtu\.be|vimeo\.com/i;
const MAX_CITATIONS = 4;

export function classify(url) {
  return VIDEO_HOSTS.test(url) ? 'video' : 'article';
}

// Best-effort thumbnails (og:image), each independently verified — a failed/
// missing image just means that citation renders without one, never drops it.
async function attachThumbnails(citations) {
  const images = await Promise.all(
    citations.map(async (c) => {
      const image = await fetchOgImage(c.url);
      return image && (await verifyUrl(image)) ? image : null;
    })
  );
  return citations.map((c, i) => ({ ...c, imageUrl: images[i] }));
}

export async function getCitations(topic) {
  if (!citationsSupported() || !topic) return [];

  try {
    const server = getActiveServer();
    const candidates = server.type === 'gemini'
      ? await geminiGroundedSearch(server, { query: topic })
      : await searchWeb(topic, { num: 6 });

    const verified = await verifyUrls(candidates);
    const top = verified.slice(0, MAX_CITATIONS).map((c) => ({
      url: c.url,
      title: c.title || c.url,
      type: classify(c.url),
    }));
    return await attachThumbnails(top);
  } catch {
    return [];
  }
}
