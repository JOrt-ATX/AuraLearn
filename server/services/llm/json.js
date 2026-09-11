// Tolerant JSON parsing — strips <think> blocks (Qwen3/DeepSeek), ```json fences,
// leading/trailing prose, and trailing commas so loosely-formatted model output
// parses across providers.
export function parseLooseJSON(text) {
  let s = text || '';
  // Remove chain-of-thought blocks emitted by reasoning models before the answer.
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const fence = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(s);
  if (fence) s = fence[1];
  s = s.trim().replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(s);
  } catch {
    // Fallback: extract the first {...} or [...] block when the LLM wraps JSON in prose.
    const match = /(\{[\s\S]*\}|\[[\s\S]*\])/.exec(s);
    if (match) return JSON.parse(match[1].replace(/,\s*([}\]])/g, '$1'));
    throw new SyntaxError(`No valid JSON found in LLM response: ${s.slice(0, 120)}`);
  }
}
