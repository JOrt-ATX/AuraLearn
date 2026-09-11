// Local Chatterbox HTTP adapter. Targets the /tts and /health contract exposed
// by C:\AI\Chatterbox\server.py (POST /tts {text, language} -> audio/wav bytes;
// GET /health -> {ok:true}). The user runs this themselves and only supplies its
// base_url — no text/audio is sent anywhere else.
const trim = (u) => (u || '').replace(/\/$/, '');

export async function chatterboxSynthesize(provider, text, { language } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (provider.api_key) headers.Authorization = `Bearer ${provider.api_key}`;

  const res = await fetch(`${trim(provider.base_url)}/tts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text, language }),
  });
  if (!res.ok) throw new Error(`Chatterbox TTS failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function chatterboxTest(provider) {
  const res = await fetch(`${trim(provider.base_url)}/health`, {
    headers: provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {},
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return true;
}
