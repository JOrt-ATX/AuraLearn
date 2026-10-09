// Pre-push guardrail (G5): nothing is pushed to main. Work goes through branches and reviewed PRs.
// git feeds one line per ref on stdin: "<local ref> <local sha> <remote ref> <remote sha>".
import { readFileSync } from 'node:fs';

const PROTECTED = ['refs/heads/main', 'refs/heads/master'];
const lines = readFileSync(0, 'utf8').split('\n').filter(Boolean);
const blocked = lines
  .map((line) => line.split(' ')[2])
  .filter((remoteRef) => remoteRef !== undefined && PROTECTED.includes(remoteRef));

if (blocked.length > 0) {
  process.stderr.write(`Push rejected (G5): ${blocked.join(', ')} is protected. Open a pull request from a branch.\n`);
  process.exit(1);
}
