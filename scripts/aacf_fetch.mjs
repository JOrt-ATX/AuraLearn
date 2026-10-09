// Fetches content from the ATEXIS AI Framework (AACF) through the `aacf_fetch` MCP tool.
// Usage:  node scripts/aacf_fetch.mjs <path> [--list]
//         node scripts/aacf_fetch.mjs --sync        (refresh the local snapshot in ./aacf)
// Requires the AACF_KEY env var (Admin Console -> API Keys). Corporate network / VPN only.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ENDPOINT = process.env.AACF_URL || 'http://10.117.139.1:8200/mcp/';
const SNAPSHOT_DIR = 'aacf';
// Secrets that may appear inside framework docs must never land in this repo.
const SECRET_PATTERN = /\bsk-(?!\.\.\.)[A-Za-z0-9_-]{8,}/g;

async function aacfFetch(path, listDir = false) {
  if (!process.env.AACF_KEY) throw new Error('AACF_KEY is not set.');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'X-Api-Key': process.env.AACF_KEY, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'aacf_fetch', arguments: { path, list_dir: listDir } } }),
  });
  let body = await res.text();
  if (!res.ok) throw new Error(`AACF HTTP ${res.status}: ${body}`);
  if (body.includes('data:')) body = body.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('');
  const json = JSON.parse(body);
  if (json.error || json.result?.isError) throw new Error(`AACF error: ${JSON.stringify(json.error || json.result)}`);
  const text = json.result.content.map((c) => c.text).join('\n');
  return listDir ? JSON.parse(text).entries : text;
}

async function sync(dir = '') {
  for (const entry of await aacfFetch(dir, true)) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.type === 'dir') { await sync(path); continue; }
    const out = join(SNAPSHOT_DIR, path);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, (await aacfFetch(path)).replace(SECRET_PATTERN, 'sk-***REDACTED***'));
    console.log('synced', path);
  }
}

const [arg, flag] = process.argv.slice(2);
if (arg === '--sync') await sync();
else if (arg !== undefined) {
  const r = await aacfFetch(arg, flag === '--list');
  console.log(Array.isArray(r) ? r.map((e) => `${e.type === 'dir' ? '[d]' : '   '} ${e.name}`).join('\n') : r);
} else {
  console.error('Usage: node scripts/aacf_fetch.mjs <path> [--list] | --sync');
  process.exit(1);
}
