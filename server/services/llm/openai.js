// OpenAI-compatible adapter. Works with OpenAI, Ollama, LM Studio, vLLM,
// OpenRouter, Groq, LocalAI, etc. base_url should include the version path,
// e.g. https://api.openai.com/v1 or http://localhost:11434/v1
const trim = (u) => (u || '').replace(/\/$/, '');

function authHeaders(server) {
  return server.api_key ? { Authorization: `Bearer ${server.api_key}` } : {};
}

export async function openaiChat(server, { messages, json, temperature }) {
  const body = { model: server.model, messages };
  if (json) body.response_format = { type: 'json_object' };
  if (temperature !== undefined) body.temperature = temperature;

  const doFetch = (b) =>
    fetch(`${trim(server.base_url)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(server) },
      body: JSON.stringify(b),
    });

  let res = await doFetch(body);

  // Some local models (e.g. certain Ollama builds) advertise OpenAI compatibility
  // but reject response_format with 400. Retry once without it.
  if (!res.ok && json && res.status === 400) {
    delete body.response_format;
    res = await doFetch(body);
  }

  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// Single-turn vision call: content is an array of parts (text + image_url)
// instead of a plain string, per the OpenAI vision message format. Kept
// separate from openaiChat/generate() since the profile pipeline (system-role
// merging, /no_think, …) assumes string content.
export async function openaiVisionChat(server, { prompt, images }) {
  const content = [
    { type: 'text', text: prompt },
    ...(images || []).map((url) => ({ type: 'image_url', image_url: { url } })),
  ];
  const res = await fetch(`${trim(server.base_url)}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(server) },
    body: JSON.stringify({ model: server.multimodal_model || server.model, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export async function openaiListModels(server) {
  const res = await fetch(`${trim(server.base_url)}/models`, { headers: authHeaders(server) });
  if (!res.ok) throw new Error(`List models ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const ids = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean).sort();
  // OpenAI-compatible /models has no capability metadata, so categorize heuristically.
  const embedding = ids.filter((id) => /embed/i.test(id));
  const generative = ids.filter((id) => !/embed|whisper|tts|dall-e|dalle|stable-diffusion|moderation|rerank|guard/i.test(id));
  return {
    all: ids,
    generative: generative.length ? generative : ids,
    embedding: embedding.length ? embedding : ids,
  };
}

export async function openaiEmbed(server, texts) {
  const res = await fetch(`${trim(server.base_url)}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(server) },
    body: JSON.stringify({ model: server.embedding_model || server.model, input: texts }),
  });
  if (!res.ok) throw new Error(`Embeddings API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}
