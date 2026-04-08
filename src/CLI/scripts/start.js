import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const buildEntry = join(root, 'packages', 'cli', 'dist', 'CLI', 'packages', 'cli', 'index.js');

if (!existsSync(buildEntry)) {
  throw new Error(
    `Missing built CLI entrypoint at ${buildEntry}. Run npm run build in src/CLI first.`,
  );
}

const child = spawn('node', [buildEntry, ...process.argv.slice(2)], {
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
