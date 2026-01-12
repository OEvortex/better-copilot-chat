// This script exists so tests under src/test/ are compiled and runnable in dist as part of build/test flow.
import fs from 'node:fs';
import path from 'node:path';

(async function main() {
	const testDir = path.join(__dirname);
	const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js') || f.endsWith('.test.ts'));

	for (const f of files) {
		console.log(`Running ${f}...`);
		// Use require so both .ts (in dev) and compiled .js (in dist) can be executed
		require(path.join(testDir, f));
	}

	console.log('All src tests completed successfully');
})();