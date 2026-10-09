// Runs the project-local uv with every location pinned inside ./.tools (nothing is written outside the project).
// Usage: node scripts/uv.mjs <uv args...>
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = join(ROOT, '.tools');

export const uvEnv = {
  ...process.env,
  UV_PYTHON_INSTALL_DIR: join(TOOLS, 'python'),
  UV_PYTHON_BIN_DIR: join(TOOLS, 'bin'),
  UV_PYTHON_INSTALL_REGISTRY: '0',
  UV_CACHE_DIR: join(TOOLS, 'uv-cache'),
  UV_MANAGED_PYTHON: '1',
};
export const uvPath = join(TOOLS, 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = spawnSync(uvPath, process.argv.slice(2), { stdio: 'inherit', env: uvEnv, cwd: process.cwd() });
  process.exit(res.status ?? 1);
}
