// Installs the pinned developer tools (uv, Python 3.12, gitleaks) under ./.tools and activates git hooks.
// Every download is verified against a SHA-256 pinned below (G3). Nothing outside the project is modified.
// Usage: node scripts/bootstrap_tools.mjs
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uvEnv } from './uv.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = join(ROOT, '.tools');
const BIN = join(TOOLS, 'bin');

// Pinned versions and checksums. A change here is a dependency change: record it in docs/DEPENDENCIES.md.
const PINS = JSON.parse(readFileSync(join(ROOT, 'docs', 'tool-pins.json'), 'utf8'));
const platform = `${process.platform}-${process.arch}`;
const exe = process.platform === 'win32' ? '.exe' : '';

async function download(url, sha256, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== sha256) throw new Error(`Checksum mismatch for ${url}\n expected ${sha256}\n got      ${got}`);
  writeFileSync(dest, buf);
}

async function install(name) {
  const pin = PINS[name].assets[platform];
  if (!pin) throw new Error(`No pinned ${name} asset for ${platform}`);
  const target = join(BIN, `${name}${exe}`);
  const stamp = join(TOOLS, `${name}.version`);
  if (existsSync(target) && existsSync(stamp) && readFileSync(stamp, 'utf8') === PINS[name].version) {
    console.log(`${name} ${PINS[name].version} already installed`);
    return target;
  }
  const work = join(TOOLS, `_dl_${name}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const archive = join(work, pin.file);
  await download(pin.url, pin.sha256, archive);
  // Windows ships bsdtar (extracts .zip); Git Bash's GNU tar would read "C:" as a remote host, so use it explicitly.
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  execFileSync(tar, ['-xf', archive, '-C', work]);
  mkdirSync(BIN, { recursive: true });
  const extracted = pin.inner ? join(work, pin.inner) : join(work, `${name}${exe}`);
  writeFileSync(target, readFileSync(extracted), { mode: 0o755 });
  if (name === 'uv') writeFileSync(join(BIN, `uvx${exe}`), readFileSync(join(dirname(extracted), `uvx${exe}`)), { mode: 0o755 });
  writeFileSync(stamp, PINS[name].version);
  rmSync(work, { recursive: true, force: true });
  console.log(`${name} ${PINS[name].version} installed (sha256 verified)`);
  return target;
}

mkdirSync(TOOLS, { recursive: true });
const uv = await install('uv');
await install('gitleaks');

// Python 3.12 lives inside the project; the system Python, ~/.local/bin and the registry are never touched.
execFileSync(uv, ['python', 'install', PINS.python.version], { stdio: 'inherit', env: uvEnv });

// Versioned hooks: the pre-commit guardrail (G1) runs for humans, agents and scripts alike.
execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: ROOT });
console.log('git core.hooksPath = .githooks');
