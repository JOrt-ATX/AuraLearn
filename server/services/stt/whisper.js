// Local Whisper HTTP adapter. Targets the native /inference contract exposed by
// whisper.cpp's bundled `whisper-server` (multipart "file" field, JSON response
// shaped { text: "..." } when response_format=json) — verified directly against
// a real whisper-server instance. The user runs this themselves and only
// supplies its base_url — no audio is sent anywhere else.
const trim = (u) => (u || '').replace(/\/$/, '');

export async function whisperTranscribe(provider, buffer, { mime, filename = 'audio' }) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), filename);
  form.append('response_format', 'json');

  const headers = provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {};
  const res = await fetch(`${trim(provider.base_url)}/inference`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper STT failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.text || '').trim();
}

// Lightweight connectivity check for the "Test" button. A bodyless POST to
// /inference hangs whisper-server (it waits for a multipart body that never
// arrives), so this just confirms the host answers HTTP at all — a transcribe
// call only ever happens from an explicit user action (record → submit).
export async function whisperTest(provider) {
  const res = await fetch(trim(provider.base_url) || '/', {
    headers: provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : {},
  });
  if (res.status >= 500) throw new Error(`Server error ${res.status}`);
  if (res.status === 401 || res.status === 403) throw new Error(`Auth rejected (${res.status})`);
  return true;
}
