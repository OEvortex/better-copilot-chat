import assert from 'node:assert';
import { invokeViaCommand, invokeDirect } from '../providers/geminicli/api';

export async function run() {
	let called = false;
	const executor = (command: string, ...args: unknown[]) => {
		called = true;
		assert.strictEqual(command, 'chp.geminicli.invoke');
		assert.strictEqual(args[0], 'hello-src');
		return Promise.resolve();
	};
	await invokeViaCommand('hello-src', executor);
	assert.ok(called, 'Executor should have been called');

	let disposed = false;
	const factory = (command: string, args: string[]) => ({
		sendPrompt: (prompt: string) => {
			assert.strictEqual(prompt, 'src-prompt');
			return Promise.resolve('src-response');
		},
		dispose: () => {
			disposed = true;
		}
	});

	const res = await invokeDirect('src-prompt', { acpClientFactory: factory });
	assert.strictEqual(res, 'src-response');
	assert.ok(disposed, 'dispose should have been called');

	console.log('src geminicli.api tests passed');
}

run().catch(err => {
	console.error(err);
	process.exit(1);
});