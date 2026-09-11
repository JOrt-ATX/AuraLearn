// Provider-agnostic LLM facade. Routes generate()/generateJSON()/embed() to the
// active server's adapter by type. API keys live only here (in SQLite) — never
// sent to the browser.
import { db } from '../../db.js';
import { openaiChat, openaiEmbed, openaiListModels, openaiVisionChat } from './openai.js';
import { geminiChat, geminiEmbed, geminiListModels, geminiVisionChat } from './gemini.js';
import { parseLooseJSON } from './json.js';
import { getProfile, DEFAULT_PROFILE } from './profiles.js';
import { imageDescriptionPrompt } from './prompts.js';
import { decryptSecret } from '../crypto.js';

export function getActiveServer() {
  const server = db.prepare('SELECT * FROM servers WHERE is_active = 1 LIMIT 1').get();
  return server ? { ...server, api_key: decryptSecret(server.api_key) } : server;
}

// Returns the behaviour profile for the currently active server's model.
// Useful for routes that need maxInputChars before calling generate/generateJSON.
export function getActiveProfile() {
  const server = getActiveServer();
  return server ? getProfile(server.model) : DEFAULT_PROFILE;
}

// Gemini gets citations via native Google Search grounding; other providers
// only get them if their model profile is explicitly marked as reliable enough.
export function citationsSupported() {
  const server = getActiveServer();
  if (!server) return false;
  return server.type === 'gemini' || getProfile(server.model).supportsCitations === true;
}

function normalize({ messages, prompt, system }) {
  if (messages && messages.length) return messages;
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  msgs.push({ role: 'user', content: prompt ?? '' });
  return msgs;
}

// Applies model-specific transforms to a normalised message array.
function applyProfile(messages, profile) {
  let msgs = [...messages];

  // Models that ignore system role: prepend the system content into the first user turn.
  if (profile.systemRole === 'merge') {
    const sysIdx = msgs.findIndex((m) => m.role === 'system');
    if (sysIdx !== -1) {
      const sysContent = msgs[sysIdx].content;
      msgs.splice(sysIdx, 1);
      const firstUser = msgs.findIndex((m) => m.role === 'user');
      if (firstUser !== -1) {
        msgs[firstUser] = { ...msgs[firstUser], content: `${sysContent}\n\n${msgs[firstUser].content}` };
      }
    }
  }

  // Qwen3 reasoning models: disable chain-of-thought via /no_think token.
  if (profile.noThink) {
    const lastUser = msgs.reduce((acc, m, i) => (m.role === 'user' ? i : acc), -1);
    if (lastUser !== -1 && !msgs[lastUser].content.includes('/no_think')) {
      msgs[lastUser] = { ...msgs[lastUser], content: `${msgs[lastUser].content} /no_think` };
    }
  }

  return msgs;
}

function chat(server, opts) {
  return server.type === 'gemini' ? geminiChat(server, opts) : openaiChat(server, opts);
}

function logCall({ model, task, attempts, ok, latency }) {
  try {
    db.prepare(
      'INSERT INTO llm_log (id, model, task, attempts, ok, latency_ms) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(globalThis.crypto.randomUUID(), model, task, attempts, ok ? 1 : 0, latency);
  } catch (_) { /* never let logging break the main flow */ }
}

export async function generate({ messages, prompt, system, json } = {}) {
  const server = getActiveServer();
  if (!server) throw new Error('No active LLM server. Add one in Settings → Servers.');
  const profile = getProfile(server.model);
  const msgs = applyProfile(normalize({ messages, prompt, system }), profile);
  const useJson = json && profile.jsonMode === 'response_format';
  return chat(server, { messages: msgs, json: useJson, temperature: profile.temperature });
}

// Cap on how much of a failed response gets echoed back into the repair
// retry. Reasoning models (qwen3, …) occasionally ignore /no_think and emit
// a runaway <think> trace instead of a short JSON reply; echoing that back
// verbatim can by itself exceed a small local model's context window on the
// very next attempt, turning one bad response into a hard failure instead of
// a self-correcting retry.
const REPAIR_ECHO_MAX = 6000;

export function echoForRepair(raw) {
  return raw.length > REPAIR_ECHO_MAX ? `${raw.slice(0, REPAIR_ECHO_MAX)}…[truncated]` : raw;
}

// Generates a JSON response with tolerant parsing, optional schema validation,
// and automatic repair retries on parse/validation failure.
// validate(data) should return null on success or an error string on failure.
// task is a short label stored in llm_log for per-task benchmarking.
export async function generateJSON({ messages, prompt, system, validate, maxRetries = 2, task = 'json' } = {}) {
  const server = getActiveServer();
  if (!server) throw new Error('No active LLM server. Add one in Settings → Servers.');
  const profile = getProfile(server.model);

  let lastError;
  const baseMessages = applyProfile(normalize({ messages, prompt, system }), profile);
  let currentMessages = baseMessages;
  let temperature = profile.temperature; // profile default on first attempt
  const useJson = profile.jsonMode === 'response_format';
  const t0 = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const raw = await chat(server, { messages: currentMessages, json: useJson, temperature });

    let data;
    try {
      data = parseLooseJSON(raw);
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) {
        temperature = 0.1;
        currentMessages = [
          ...baseMessages,
          { role: 'assistant', content: echoForRepair(raw) },
          { role: 'user', content: `The response failed JSON parsing: ${e.message}. Return ONLY valid JSON with no prose, no fences, no explanation.` },
        ];
        continue;
      }
      break;
    }

    if (validate) {
      const err = validate(data);
      if (err) {
        lastError = new Error(err);
        if (attempt < maxRetries) {
          temperature = 0.1;
          currentMessages = [
            ...baseMessages,
            { role: 'assistant', content: echoForRepair(raw) },
            { role: 'user', content: `The response failed validation: ${err}. Return ONLY the corrected JSON.` },
          ];
          continue;
        }
        break;
      }
    }

    logCall({ model: server.model, task, attempts: attempt + 1, ok: true, latency: Date.now() - t0 });
    return data;
  }

  logCall({ model: server.model, task, attempts: maxRetries + 1, ok: false, latency: Date.now() - t0 });
  throw lastError;
}

export async function embed(texts) {
  const server = getActiveServer();
  if (!server) throw new Error('No active LLM server. Add one in Settings → Servers.');
  return server.type === 'gemini' ? geminiEmbed(server, texts) : openaiEmbed(server, texts);
}

// Transcribes/describes an image via the active server's multimodal model
// (falls back to its general model if none is set — some general models are
// multimodal too, and if not the provider will fail with its own message).
export async function describeImage({ dataUrl, mime, filename, language }) {
  const server = getActiveServer();
  if (!server) throw new Error('No active LLM server. Add one in Settings → Servers.');
  const { system, prompt } = imageDescriptionPrompt({ filename, language });
  const fullPrompt = `${system}\n\n${prompt}`;
  return server.type === 'gemini'
    ? geminiVisionChat(server, { prompt: fullPrompt, images: [dataUrl] })
    : openaiVisionChat(server, { prompt: fullPrompt, images: [dataUrl] });
}

// Lists models available on a server. Returns { all, generative, embedding }.
export async function listModels(server) {
  return server.type === 'gemini' ? geminiListModels(server) : openaiListModels(server);
}

// Lightweight connectivity check used by the "Test" button in the server manager.
export async function testServer(server) {
  const messages = [{ role: 'user', content: 'Reply with the single word: OK' }];
  return server.type === 'gemini'
    ? geminiChat(server, { messages })
    : openaiChat(server, { messages });
}
