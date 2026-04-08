import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const tsconfigPath = join(root, 'tsconfig.json');

if (!existsSync(tsconfigPath)) {
  throw new Error(`Missing tsconfig.json in ${root}`);
}

execSync('npx tsc -p tsconfig.json', {
  stdio: 'inherit',
  cwd: root,
});
