/*---------------------------------------------------------------------------------------------
 *  Subagent Delegation Tool
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { Logger } from "../utils";

export interface DelegateToAgentRequest {
	agent_name: string;
	prompt: string;
}

/**
 * Tool that allows an agent to delegate a task to another agent.
 * This implementation routes the delegation through the VS Code Chat API.
 */
export class DelegateToAgentTool {
	/**
	 * Tool invocation handler
	 */
	async invoke(
		request: vscode.LanguageModelToolInvocationOptions<
			DelegateToAgentRequest,
			unknown
		>,
	): Promise<vscode.LanguageModelToolResult> {
		try {
			const { agent_name, prompt } = request.input;

			Logger.info(
				`[Tool Invocation] delegate_to_agent invoked: agent=${agent_name}, prompt="${prompt.substring(0, 50)}..."`,
			);

			if (!agent_name) {
				throw new Error("Missing required parameter: agent_name");
			}
			if (!prompt) {
				throw new Error("Missing required parameter: prompt");
			}

			// Route delegation using the chat API
			// We use the chp.geminicli.invoke command if the agent is gemini
			if (
				agent_name.toLowerCase() === "gemini" ||
				agent_name.toLowerCase() === "geminicli"
			) {
				await vscode.commands.executeCommand("chp.geminicli.invoke", prompt);
				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart(
						`Successfully delegated task to ${agent_name}.`,
					),
				]);
			}

			// For other agents, try to use the generic chat invocation if possible
			// In VS Code, we can try to focus the chat and insert the message
			const message = `@${agent_name} ${prompt}`;

			try {
				await vscode.commands.executeCommand(
					"workbench.panel.chat.view.copilot.focus",
				);
				await vscode.commands.executeCommand(
					"workbench.action.chat.insertIntoInput",
					message,
				);

				// Try to submit the message
				const sendCommands = [
					"workbench.action.chat.sendMessage",
					"workbench.action.chat.accept",
					"workbench.action.chat.submit",
				];

				let sent = false;
				for (const cmd of sendCommands) {
					try {
						await vscode.commands.executeCommand(cmd);
						sent = true;
						break;
					} catch {
						// ignore
					}
				}

				if (!sent) {
					await vscode.commands.executeCommand("type", { text: "\n" });
				}

				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart(
						`Successfully delegated task to ${agent_name}.`,
					),
				]);
			} catch (err) {
				Logger.warn(
					`[Delegate Tool] Failed to delegate to ${agent_name}:`,
					err,
				);
				throw new Error(
					`Failed to delegate to ${agent_name}. Make sure the agent is available.`,
				);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			Logger.error(
				"[Tool Invocation] delegate_to_agent failed",
				error instanceof Error ? error : undefined,
			);
			throw new vscode.LanguageModelError(`Delegation failed: ${errorMessage}`);
		}
	}
}
