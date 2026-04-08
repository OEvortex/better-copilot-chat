import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outFile = join(root, 'packages', 'cli', 'src', 'generated', 'git-commit.ts');

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', {
    cwd: root,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString().trim();
} catch {
  // Leave the placeholder value in place if git is unavailable.
}

writeFileSync(
  outFile,
  `export const GIT_COMMIT_INFO = '${commit}';\n`,
  'utf8',
);
