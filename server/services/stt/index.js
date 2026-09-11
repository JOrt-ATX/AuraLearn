// Speech-to-text facade — mirrors services/llm/index.js's single-active-provider
// shape. Today there is exactly one backend (local Whisper); the api_key (if any)
// lives only in SQLite and is never sent to the browser.
import { db } from '../../db.js';
import { whisperTranscribe, whisperTest } from './whisper.js';
import { decryptSecret } from '../crypto.js';

export function getActiveSttProvider() {
  const provider = db.prepare('SELECT * FROM stt_providers WHERE is_active = 1 LIMIT 1').get();
  return provider ? { ...provider, api_key: decryptSecret(provider.api_key) } : provider;
}

export async function transcribe(buffer, { mime, filename }) {
  const provider = getActiveSttProvider();
  if (!provider) throw new Error('No active speech-to-text provider. Add one in Settings → Speech-to-text.');
  return whisperTranscribe(provider, buffer, { mime, filename });
}

export async function testSttProvider(provider) {
  return whisperTest(provider);
}
