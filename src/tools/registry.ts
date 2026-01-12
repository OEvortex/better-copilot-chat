/*---------------------------------------------------------------------------------------------
 *  Tool Registry
 *  Manages registration and lifecycle of all tools
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { Logger } from "../utils";
import { DelegateToAgentTool } from "./delegateToAgent";
import { MiniMaxSearchTool } from "./minimaxSearch";
import { ZhipuSearchTool } from "./zhipuSearch";

// Global tool instance management
let zhipuSearchTool: ZhipuSearchTool | undefined;
let minimaxSearchTool: MiniMaxSearchTool | undefined;
let delegateToAgentTool: DelegateToAgentTool | undefined;

/**
 * Register all tools
 */
export function registerAllTools(context: vscode.ExtensionContext): void {
	try {
		// Register ZhipuAI web search tool
		zhipuSearchTool = new ZhipuSearchTool();
		const zhipuToolDisposable = vscode.lm.registerTool("chp_zhipuWebSearch", {
			invoke: zhipuSearchTool.invoke.bind(zhipuSearchTool),
		});
		context.subscriptions.push(zhipuToolDisposable);

		// Register MiniMax web search tool
		minimaxSearchTool = new MiniMaxSearchTool();
		const minimaxToolDisposable = vscode.lm.registerTool(
			"chp_minimaxWebSearch",
			{
				invoke: minimaxSearchTool.invoke.bind(minimaxSearchTool),
			},
		);
		context.subscriptions.push(minimaxToolDisposable);

		// Register Delegate to Agent tool
		delegateToAgentTool = new DelegateToAgentTool();
		const delegateToolDisposable = vscode.lm.registerTool(
			"chp_delegateToAgent",
			{
				invoke: delegateToAgentTool.invoke.bind(delegateToAgentTool),
			},
		);
		context.subscriptions.push(delegateToolDisposable);

		// Add cleanup logic to context
		context.subscriptions.push({
			dispose: async () => {
				await cleanupAllTools();
			},
		});

		Logger.info("Zhipu AI web search tool registered: chp_zhipuWebSearch");
		Logger.info("MiniMax web search tool registered: chp_minimaxWebSearch");
		Logger.info("Delegate to agent tool registered: chp_delegateToAgent");
	} catch (error) {
		Logger.error(
			"Tool registration failed",
			error instanceof Error ? error : undefined,
		);
		throw error;
	}
}

/**
 * Clean up all tool resources
 */
export async function cleanupAllTools(): Promise<void> {
	try {
		if (zhipuSearchTool) {
			await zhipuSearchTool.cleanup();
			zhipuSearchTool = undefined;
			Logger.info("ZhipuAI web search tool resources cleaned up");
		}

		if (minimaxSearchTool) {
			await minimaxSearchTool.cleanup();
			minimaxSearchTool = undefined;
			Logger.info("MiniMax web search tool resources cleaned up");
		}

		if (delegateToAgentTool) {
			delegateToAgentTool = undefined;
			Logger.info("Delegate to agent tool resources cleaned up");
		}
	} catch (error) {
		Logger.error(
			"Tool cleanup failed",
			error instanceof Error ? error : undefined,
		);
	}
}
