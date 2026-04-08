import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const child = spawn('node', [join(root, 'packages', 'cli', 'dist', 'index.js'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    CLI_VERSION: process.env.npm_package_version || 'dev',
    DEV: 'false',
  },
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
