// Native Gemini adapter (generativelanguage REST API). Ports the @google/genai
// usage from the original UnitView.tsx but via fetch so base_url is configurable.
const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const trim = (u) => (u || DEFAULT_BASE).replace(/\/$/, '');

function toGemini(messages) {
  const contents = [];
  let systemInstruction;
  for (const m of messages) {
    if (m.role === 'system') {
      systemInstruction = { parts: [{ text: m.content }] };
      continue;
    }
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
  }
  return { contents, systemInstruction };
}

export async function geminiChat(server, { messages, json, temperature }) {
  const model = server.model || 'gemini-2.5-flash';
  const { contents, systemInstruction } = toGemini(messages);
  const body = { contents };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (json || temperature !== undefined) {
    body.generationConfig = {};
    if (json) body.generationConfig.responseMimeType = 'application/json';
    if (temperature !== undefined) body.generationConfig.temperature = temperature;
  }

  const url = `${trim(server.base_url)}/models/${model}:generateContent?key=${encodeURIComponent(server.api_key || '')}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
}

function splitDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Expected a base64 data URL for the image.');
  return { mime_type: m[1], data: m[2] };
}

// Single-turn vision call with inline image data, per Gemini's multimodal
// content format. Kept separate from geminiChat/generate() since that pipeline
// assumes plain-text message content.
export async function geminiVisionChat(server, { prompt, images }) {
  const model = server.multimodal_model || server.model || 'gemini-2.5-flash';
  const parts = [
    { text: prompt },
    ...(images || []).map((url) => ({ inline_data: splitDataUrl(url) })),
  ];
  const apiUrl = `${trim(server.base_url)}/models/${model}:generateContent?key=${encodeURIComponent(server.api_key || '')}`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
}

// Real, Google-verified links via native Search grounding — kept separate from
// geminiChat() since it returns groundingMetadata, not just plain text.
export async function geminiGroundedSearch(server, { query }) {
  const model = server.model || 'gemini-2.5-flash';
  const body = {
    contents: [{ role: 'user', parts: [{ text: query }] }],
    tools: [{ google_search: {} }],
  };
  const url = `${trim(server.base_url)}/models/${model}:generateContent?key=${encodeURIComponent(server.api_key || '')}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini grounded search ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return chunks
    .map((c) => c.web)
    .filter((w) => w?.uri)
    .map((w) => ({ url: w.uri, title: w.title || w.uri }));
}

export async function geminiListModels(server) {
  const url = `${trim(server.base_url)}/models?pageSize=1000&key=${encodeURIComponent(server.api_key || '')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gemini list models ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const models = data.models || [];
  const strip = (n) => n.replace(/^models\//, '');
  const has = (m, method) => (m.supportedGenerationMethods || []).includes(method);
  const all = models.map((m) => strip(m.name)).sort();
  const generative = models.filter((m) => has(m, 'generateContent')).map((m) => strip(m.name)).sort();
  const embedding = models.filter((m) => has(m, 'embedContent')).map((m) => strip(m.name)).sort();
  return {
    all,
    generative: generative.length ? generative : all,
    embedding: embedding.length ? embedding : all,
  };
}

export async function geminiEmbed(server, texts) {
  const model = server.embedding_model || 'text-embedding-004';
  const requests = texts.map((t) => ({ model: `models/${model}`, content: { parts: [{ text: t }] } }));
  const url = `${trim(server.base_url)}/models/${model}:batchEmbedContents?key=${encodeURIComponent(server.api_key || '')}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`Gemini embed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.embeddings.map((e) => e.values);
}
