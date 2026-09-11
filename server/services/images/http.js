// Fetch with a timeout — a slow/hanging provider (Openverse has been seen
// taking 30s+ before answering with its own 504) must not block the whole
// multi-provider search; AbortController bounds every outbound call so one
// bad provider can't leave the "Ilustrar" modal stuck on "Searching…".
export async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
