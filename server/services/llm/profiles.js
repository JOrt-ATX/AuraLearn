// Model-specific behaviour profiles. Matched against server.model at call time.
// Unrecognised models fall through to DEFAULT_PROFILE.
//
// Fields:
//   noThink      – append "/no_think" to the last user message (Qwen3 reasoning models)
//   systemRole   – 'native' keeps the system role; 'merge' prepends it into the first user turn
//   jsonMode     – 'response_format' sends { response_format: { type: 'json_object' } };
//                  'prompt-only' relies on the prompt instruction only (e.g. Gemma)
//   temperature  – default generation temperature (undefined = let the server decide)
//   maxInputChars – max content chars to include in structured prompts; protects against
//                   silent truncation when Ollama's default context window is small

export const DEFAULT_PROFILE = {
  noThink: false,
  systemRole: 'native',
  jsonMode: 'response_format',
  temperature: undefined,
  maxInputChars: 16000,
  supportsCitations: false,
};

const PROFILES = [
  {
    // Qwen3 family (qwen3:8b, qwen3:14b, qwen3.6:27b, …) — reasoning models that
    // emit <think> blocks by default. /no_think disables CoT without a separate flag.
    match: /qwen3/i,
    noThink: true,
    systemRole: 'native',
    jsonMode: 'response_format',
    temperature: 0.3,
    maxInputChars: 8000,
  },
  {
    // Gemma — Ollama treats system as an extra user turn; response_format not supported.
    match: /gemma/i,
    noThink: false,
    systemRole: 'merge',
    jsonMode: 'prompt-only',
    temperature: 0.4,
    maxInputChars: 8000,
  },
  {
    // Mistral cloud (mistral-medium-latest, mistral-large-*, …) — full OpenAI compat.
    // Reliable enough to trust with web-search-backed citations (see citations.js).
    match: /mistral/i,
    noThink: false,
    systemRole: 'native',
    jsonMode: 'response_format',
    temperature: 0.2,
    maxInputChars: 20000,
    supportsCitations: true,
  },
];

export function getProfile(modelName) {
  const name = modelName || '';
  return PROFILES.find((p) => p.match.test(name)) ?? DEFAULT_PROFILE;
}
