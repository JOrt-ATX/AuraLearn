// Pre-commit guardrail (G1): runs for humans, agents and scripts alike and can reject the commit.
// Checks only what is staged: secrets, Python (ruff, mypy, forbidden patterns), frontend (prettier,
// eslint, tsc) and, when dependency files change, the supply-chain gate (G3/G4).
// Usage: git commit  (installed by scripts/bootstrap_tools.mjs through core.hooksPath)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { uvEnv, uvPath } from './uv.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exe = process.platform === 'win32' ? '.exe' : '';
const failures = [];

function run(label, command, args, options = {}) {
  const started = Date.now();
  const res = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });
  const ok = res.status === 0;
  process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${label} (${Date.now() - started} ms)\n`);
  if (!ok) {
    process.stdout.write(`${res.stdout ?? ''}${res.stderr ?? ''}`);
    failures.push(label);
  }
  return ok;
}

const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout;
const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR')
  .split('\n')
  .filter(Boolean);
if (staged.length === 0) process.exit(0);

const under = (prefix, ...extensions) =>
  staged.filter((f) => f.startsWith(prefix) && extensions.some((e) => f.endsWith(e)));

// 1. Secrets (G1/G2): always.
const gitleaks = join(ROOT, '.tools', 'bin', `gitleaks${exe}`);
if (!existsSync(gitleaks)) {
  process.stdout.write('FAIL gitleaks is not installed: run `node scripts/bootstrap_tools.mjs`\n');
  process.exit(1);
}
run('gitleaks (staged)', gitleaks, ['git', '--staged', '--redact', '--no-banner']);

// 2. Python.
const python = [...under('backend/', '.py'), ...under('scripts/', '.py')];
// One Python configuration for the whole repo: backend/pyproject.toml (ruff, mypy, pytest).
// Run from backend/ so ruff's per-file ignores and mypy's file list resolve against that config.
const BACKEND = join(ROOT, 'backend');
const uv = (label, args) =>
  run(label, uvPath, ['run', '--project', BACKEND, '--frozen', ...args], { env: uvEnv, cwd: BACKEND });
if (python.length > 0) {
  const files = python.map((f) => relative(BACKEND, join(ROOT, f)));
  const config = ['--config', 'pyproject.toml'];
  uv('ruff check', ['ruff', 'check', ...config, ...files]);
  uv('ruff format', ['ruff', 'format', '--check', ...config, ...files]);
  uv('forbidden patterns (AST)', ['python', '../scripts/check_forbidden.py', ...files]);
  uv('mypy', ['mypy']);
}

// 3. Frontend.
const frontend = under('frontend/', '.ts', '.tsx', '.js', '.mjs', '.json', '.css', '.md');
if (frontend.length > 0) {
  const fe = (label, bin, args) =>
    run(label, process.execPath, [join(ROOT, 'frontend', 'node_modules', ...bin), ...args], {
      cwd: join(ROOT, 'frontend'),
    });
  const rel = (files) => files.map((f) => f.slice('frontend/'.length));
  const lockOnly = frontend.every((f) => f.endsWith('package-lock.json'));
  const formatable = rel(frontend).filter((f) => !f.endsWith('package-lock.json') && !f.endsWith('schema.d.ts'));
  if (formatable.length > 0) {
    fe('prettier', ['prettier', 'bin', 'prettier.cjs'], ['--check', '--ignore-unknown', ...formatable]);
  }
  const code = rel(under('frontend/', '.ts', '.tsx', '.js', '.mjs')).filter((f) => !f.endsWith('schema.d.ts'));
  if (code.length > 0) {
    fe('eslint', ['eslint', 'bin', 'eslint.js'], ['--max-warnings', '0', ...code]);
    fe('tsc', ['typescript', 'bin', 'tsc'], ['-b']);
  }
  if (!lockOnly && code.length === 0 && formatable.length === 0) process.stdout.write('ok   frontend: nothing to lint\n');
}

// 4. Supply chain (G3/G4): only when a manifest or lockfile changes.
const manifests = ['frontend/package.json', 'frontend/package-lock.json', 'backend/pyproject.toml', 'backend/uv.lock', 'docs/dependency-policy.json'];
if (staged.some((f) => manifests.includes(f))) {
  uv('dependency gate', ['python', '../scripts/check_deps.py']);
}

if (failures.length > 0) {
  process.stdout.write(`\nCommit rejected by: ${failures.join(', ')}\n`);
  process.exit(1);
}
