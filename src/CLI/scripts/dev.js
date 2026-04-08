import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const child = spawn('npx', ['tsx', join(root, 'packages', 'cli', 'index.ts'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    CLI_VERSION: 'dev',
    DEV: 'true',
  },
  shell: process.platform === 'win32',
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
