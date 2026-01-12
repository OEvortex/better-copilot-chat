import * as vscode from "vscode";
import { AcpClient } from "./acpClient";

export type AcpClientLike = {
	sendPrompt(
		prompt: string,
		workspacePath?: string,
		onChunk?: (
			chunk: string,
			type: "text" | "thought" | "tool",
			metadata?: unknown,
		) => void,
	): Promise<string>;
	dispose?: () => void;
};

/**
 * Invoke the existing chp.geminicli.invoke command programmatically.
 * Accepts an optional executor for dependency injection/testing.
 */
export async function invokeViaCommand(
	prompt?: string,
	executor?: (command: string, ...args: unknown[]) => Thenable<unknown>,
): Promise<void> {
	const exec =
		executor || vscode.commands?.executeCommand.bind(vscode.commands);
	if (!exec) {
		throw new Error(
			"No command executor available to invoke chp.geminicli.invoke",
		);
	}
	await exec("chp.geminicli.invoke", prompt);
}

export interface InvokeDirectOptions {
	command?: string; // Path to gemini executable (defaults to 'gemini')
	args?: string[]; // Extra args passed to gemini CLI (default: ['--experimental-acp'])
	workspacePath?: string;
	onChunk?: (
		chunk: string,
		type: "text" | "thought" | "tool",
		metadata?: any,
	) => void;
	acpClientFactory?: (command: string, args: string[]) => AcpClientLike;
}

/**
 * Invoke Gemini CLI directly via ACP (no UI involved) and return the response text.
 * Accepts an optional acpClientFactory for dependency injection/testing.
 */
export async function invokeDirect(
	prompt: string,
	opts: InvokeDirectOptions = {},
): Promise<string> {
	const command = opts.command || "gemini";
	const args = opts.args || ["--experimental-acp"];
	const workspacePath = opts.workspacePath;
	const factory =
		opts.acpClientFactory ||
		((cmd: string, a: string[]) => new AcpClient(cmd, a));

	const client = factory(command, args);
	try {
		const result = await client.sendPrompt(prompt, workspacePath, opts.onChunk);
		return result;
	} finally {
		try {
			if (typeof client.dispose === "function") client.dispose();
		} catch {
			// ignore dispose errors
		}
	}
}
