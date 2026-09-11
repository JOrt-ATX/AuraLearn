// Encrypts LLM/STT provider API keys at rest (AES-256-GCM) so a copy or
// backup of data/aura.db doesn't also hand over live, billable credentials
// in plaintext. The key is a random 32-byte value generated on first run and
// kept outside git, next to the DB (DATA_DIR/.secret.key, 0600 where the
// platform supports POSIX permissions).
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { db, DATA_PATH } from '../db.js';

const KEY_PATH = join(DATA_PATH, '.secret.key');
const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

function loadOrCreateKey() {
  if (existsSync(KEY_PATH)) return Buffer.from(readFileSync(KEY_PATH, 'utf8').trim(), 'hex');
  const key = randomBytes(32);
  writeFileSync(KEY_PATH, key.toString('hex'), { mode: 0o600 });
  try { chmodSync(KEY_PATH, 0o600); } catch (_) { /* best-effort on platforms without POSIX perms */ }
  return key;
}

const KEY = loadOrCreateKey();

export function encryptSecret(plain) {
  if (!plain) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

// Transparently passes through values that predate encryption (plain-text
// keys already sitting in an existing user's DB) so upgrading never breaks
// an active server/provider. migrateProviderSecrets() re-saves them encrypted.
export function decryptSecret(value) {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// One-time, idempotent upgrade of any pre-existing plaintext api_key values
// (from before encryption-at-rest existed) to the encrypted format. Safe to
// call on every boot — already-encrypted or empty keys are left untouched.
export function migrateProviderSecrets() {
  for (const table of ['servers', 'stt_providers', 'tts_providers']) {
    const rows = db.prepare(`SELECT id, api_key FROM ${table} WHERE api_key IS NOT NULL AND api_key != ''`).all();
    for (const row of rows) {
      if (row.api_key.startsWith(PREFIX)) continue;
      db.prepare(`UPDATE ${table} SET api_key = ? WHERE id = ?`).run(encryptSecret(row.api_key), row.id);
    }
  }
}
