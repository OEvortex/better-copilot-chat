import { execSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const buildEntry = join(root, 'packages', 'cli', 'dist', 'CLI', 'packages', 'cli', 'index.js');

execSync('npm run build', {
  stdio: 'inherit',
  cwd: root,
});

const child = spawn('node', [buildEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    CLI_VERSION: 'dev',
    DEV: 'true',
  },
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
