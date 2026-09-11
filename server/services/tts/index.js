// Text-to-speech facade — mirrors services/stt/index.js's single-active-provider
// shape. Today there is exactly one backend (local Chatterbox); the api_key (if
// any) lives only in SQLite and is never sent to the browser.
import { db } from '../../db.js';
import { chatterboxSynthesize, chatterboxTest } from './chatterbox.js';
import { decryptSecret } from '../crypto.js';

export function getActiveTtsProvider() {
  const provider = db.prepare('SELECT * FROM tts_providers WHERE is_active = 1 LIMIT 1').get();
  return provider ? { ...provider, api_key: decryptSecret(provider.api_key) } : provider;
}

export async function synthesize(text, { language } = {}) {
  const provider = getActiveTtsProvider();
  if (!provider) throw new Error('No active text-to-speech provider. Add one in Settings → Text-to-speech.');
  return chatterboxSynthesize(provider, text, { language });
}

export async function testTtsProvider(provider) {
  return chatterboxTest(provider);
}
