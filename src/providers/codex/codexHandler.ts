/*---------------------------------------------------------------------------------------------
 *  Codex Handler
 *  Handles Codex (OpenAI) streaming requests and response parsing.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from "node:crypto";
import * as https from "node:https";
import * as vscode from "vscode";
import { AccountManager } from "../../accounts";
import { AccountQuotaCache } from "../../accounts/accountQuotaCache";
import {
	loadCodexDefaultInstructions,
	loadCodexInstructions,
	loadCodexVscodeToolsInstructions,
	loadGpt52Instructions,
} from "../../prompt/promptLoader";
import type { RateLimitSnapshot } from "../../types/rateLimitTypes";
import type { ModelConfig } from "../../types/sharedTypes";
import { Logger } from "../../utils/logger";
import {
	formatRateLimitSummary,
	parseRateLimitFromHeaders,
} from "../../utils/rateLimitParser";
import type { UsageLimitError } from "./codexTypes";

const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const CODEX_USER_AGENT =
	"codex_cli_rs/1.104.1 (Mac OS 26.0.1; arm64) Apple_Terminal/464";

// Sandbox configuration for FULL ACCESS mode (danger-full-access + never approval)
// This tells the model it has unrestricted access to filesystem, network, and commands
const CODEX_SANDBOX_CONFIG = {
	sandbox_mode: "danger-full-access", // No filesystem sandboxing - all commands permitted
	network_access: "enabled", // No approval needed for network access
	approval_policy: "never", // Never ask for approval - execute autonomously
};

// Developer message to inject sandbox configuration into the conversation
const CODEX_DEVELOPER_MESSAGE = `Current sandbox configuration:
- sandbox_mode: ${CODEX_SANDBOX_CONFIG.sandbox_mode}
- network_access: ${CODEX_SANDBOX_CONFIG.network_access}
- approval_policy: ${CODEX_SANDBOX_CONFIG.approval_policy}

You are running in FULL ACCESS mode with NO RESTRICTIONS. All filesystem operations, network access, and shell commands are permitted without approval. Execute tasks autonomously and efficiently. You MUST do your utmost best to finish the task and validate your work before yielding. Take advantage of full access to deliver the best outcome for the user.

IMPORTANT COMMUNICATION RULE:
Before making ANY changes to files, running commands, or executing tools, you MUST:
1. Clearly explain WHAT you are about to do
2. Explain WHY you are doing it
3. Describe the EXPECTED outcome
4. Only THEN proceed with the actual execution

Example:
"I'm going to modify the file 'app.ts' to add error handling because the current code doesn't handle network failures. This will make the application more robust. Let me apply this change now..."
[Then execute the tool]

This ensures the user understands your actions before they happen.

`;

// Tool definitions for Codex CLI - These MUST be sent to the API for tool calling to work
// Note: Using non-strict mode to allow optional parameters
const CODEX_TOOLS = [
	{
		type: "function",
		name: "shell",
		description:
			"Runs a shell command in the user's terminal. Use this for executing commands, running scripts, installing packages, etc.",
		parameters: {
			type: "object",
			properties: {
				command: {
					type: "array",
					items: { type: "string" },
					description:
						'The command and its arguments to run as an array, e.g., ["ls", "-la"]',
				},
				workdir: {
					type: "string",
					description: "Working directory for the command (optional)",
				},
				timeout: {
					type: "integer",
					description: "Timeout in milliseconds (optional)",
				},
			},
			required: ["command"],
		},
	},
	{
		type: "function",
		name: "apply_patch",
		description:
			"Applies a patch to a file. The patch should be in a unified diff-like format with *** Begin Patch *** markers. Use this for editing files.",
		parameters: {
			type: "object",
			properties: {
				patch: {
					type: "string",
					description:
						"The patch content to apply, using the Codex patch format with *** Begin Patch *** / *** End Patch *** markers",
				},
			},
			required: ["patch"],
		},
	},
	{
		type: "function",
		name: "manage_todo_list",
		description:
			"Manage a structured todo list to track progress and plan tasks. Use this to create, update, and track todos throughout your work session.",
		parameters: {
			type: "object",
			properties: {
				todoList: {
					type: "array",
					items: {
						type: "object",
						properties: {
							id: {
								type: "number",
								description:
									"Unique identifier for the todo. Use sequential numbers starting from 1.",
							},
							title: {
								type: "string",
								description: "Concise action-oriented todo label (3-7 words).",
							},
							description: {
								type: "string",
								description:
									"Detailed context, requirements, or implementation notes.",
							},
							status: {
								type: "string",
								enum: ["not-started", "in-progress", "completed"],
								description:
									"not-started: Not begun | in-progress: Currently working (max 1) | completed: Fully finished",
							},
						},
						required: ["id", "title", "description", "status"],
					},
					description:
						"Complete array of all todo items. Must include ALL items - both existing and new.",
				},
			},
			required: ["todoList"],
		},
	},
	{
		name: "file_search",
		description:
			"Search for files in the workspace by glob pattern. This only returns the paths of matching files. Use this tool when you know the exact filename pattern of the files you're searching for. Glob patterns match from the root of the workspace folder. Examples:\n- **/*.{js,ts} to match all js/ts files in the workspace.\n- src/** to match all files under the top-level src folder.\n- **/foo/**/*.js to match all js files under any foo folder in the workspace.",
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description:
						"Search for files with names or paths matching this glob pattern.",
				},
				maxResults: {
					type: "number",
					description:
						"The maximum number of results to return. Do not use this unless necessary, it can slow things down. By default, only some matches are returned. If you use this and don't see what you're looking for, you can try again with a more specific query or a larger maxResults.",
				},
			},
			required: ["query"],
		},
		type: "function",
		strict: false,
	},
	{
		name: "grep_search",
		description:
			"Do a fast text search in the workspace. Use this tool when you want to search with an exact string or regex. If you are not sure what words will appear in the workspace, prefer using regex patterns with alternation (|) or character classes to search for multiple potential words at once instead of making separate searches. For example, use 'function|method|procedure' to look for all of those words at once. Use includePattern to search within files matching a specific pattern, or in a specific file, using a relative path. Use 'includeIgnoredFiles' to include files normally ignored by .gitignore, other ignore files, and `files.exclude` and `search.exclude` settings. Warning: using this may cause the search to be slower, only set it when you want to search in ignored folders like node_modules or build outputs. Use this tool when you want to see an overview of a particular file, instead of using read_file many times to look for code within a file.",
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description:
						"The pattern to search for in files in the workspace. Use regex with alternation (e.g., 'word1|word2|word3') or character classes to find multiple potential words in a single search. Be sure to set the isRegexp property properly to declare whether it's a regex or plain text pattern. Is case-insensitive.",
				},
				isRegexp: {
					type: "boolean",
					description: "Whether the pattern is a regex.",
				},
				includePattern: {
					type: "string",
					description:
						'Search files matching this glob pattern. Will be applied to the relative path of files within the workspace. To search recursively inside a folder, use a proper glob pattern like "src/folder/**". Do not use | in includePattern.',
				},
				maxResults: {
					type: "number",
					description:
						"The maximum number of results to return. Do not use this unless necessary, it can slow things down. By default, only some matches are returned. If you use this and don't see what you're looking for, you can try again with a more specific query or a larger maxResults.",
				},
				includeIgnoredFiles: {
					type: "boolean",
					description:
						"Whether to include files that would normally be ignored according to .gitignore, other ignore files and `files.exclude` and `search.exclude` settings. Warning: using this may cause the search to be slower. Only set it when you want to search in ignored folders like node_modules or build outputs.",
				},
			},
			required: ["query", "isRegexp"],
		},
		type: "function",
		strict: false,
	},
	{
		name: "get_changed_files",
		description:
			"Get git diffs of current file changes in a git repository. Don't forget that you can use run_in_terminal to run git commands in a terminal as well.",
		parameters: {
			type: "object",
			properties: {
				repositoryPath: {
					type: "string",
					description:
						"The absolute path to the git repository to look for changes in. If not provided, the active git repository will be used.",
				},
				sourceControlState: {
					type: "array",
					items: {
						type: "string",
						enum: ["staged", "unstaged", "merge-conflicts"],
					},
					description:
						"The kinds of git state to filter by. Allowed values are: 'staged', 'unstaged', and 'merge-conflicts'. If not provided, all states will be included.",
				},
			},
		},
		type: "function",
		strict: false,
	},
	{
		name: "get_errors",
		description:
			"Get any compile or lint errors in a specific file or across all files. If the user mentions errors or problems in a file, they may be referring to these. Use the tool to see the same errors that the user is seeing. If the user asks you to analyze all errors, or does not specify a file, use this tool to gather errors for all files. Also use this tool after editing a file to validate the change.",
		parameters: {
			type: "object",
			properties: {
				filePaths: {
					description:
						"The absolute paths to the files or folders to check for errors. Omit 'filePaths' when retrieving all errors.",
					type: "array",
					items: {
						type: "string",
					},
				},
			},
		},
		type: "function",
		strict: false,
	},
];

/**
 * Generate developer message with optional VS Code tools instructions
 * @param useVSCodeTools Whether VS Code tools are being used
 * @returns The complete developer message
 */
function getCodexDeveloperMessage(useVSCodeTools: boolean): string {
	if (useVSCodeTools) {
		// When using VS Code tools, append the VS Code tools instructions
		const vscodeToolsInstructions = loadCodexVscodeToolsInstructions();
		return `${CODEX_DEVELOPER_MESSAGE}

# VS Code Tools Integration
You are running inside VS Code through GitHub Copilot Chat. You MUST use VS Code's native tools instead of Codex CLI tools.

${vscodeToolsInstructions}`;
	}
	return CODEX_DEVELOPER_MESSAGE;
}

/**
 * Usage limit error response from Codex API
 */
// UsageLimitError imported from ./codexTypes

/**
 * Parse usage limit error from API response body
 */
function parseUsageLimitError(body: string): UsageLimitError | null {
	try {
		const parsed = JSON.parse(body);
		if (parsed?.error?.type === "usage_limit_reached") {
			return parsed.error as UsageLimitError;
		}
	} catch {
		// Not JSON or invalid format
	}
	return null;
}

/**
 * Format reset time for display
 */
function formatResetTime(resetsAt: number): string {
	const resetDate = new Date(resetsAt * 1000);
	const now = new Date();
	const diffMs = resetDate.getTime() - now.getTime();

	if (diffMs <= 0) {
		return "now";
	}

	const hours = Math.floor(diffMs / (1000 * 60 * 60));
	const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

export class CodexHandler {
	private currentModelId: string = "";
	private lastRateLimitSnapshot: RateLimitSnapshot | null = null;
    providerName: string;
	private quotaCache: AccountQuotaCache;

	constructor(providerName: string) {
		this.providerName = providerName;
		this.quotaCache = AccountQuotaCache.getInstance();
	}

	public getRateLimitSnapshot(): RateLimitSnapshot | null {
		return this.lastRateLimitSnapshot;
	}

	public getRateLimitSummary(): string {
		return formatRateLimitSummary(this.lastRateLimitSnapshot);
	}

	/**
	 * Handle usage limit reached error (429)
	 * Shows popup notification and auto-switches account if enabled
	 */
	private async handleUsageLimitError(
		error: UsageLimitError,
		currentAccountId?: string,
	): Promise<void> {
		const resetTimeStr = formatResetTime(error.resets_at);
		const planType = error.plan_type || "unknown";

		Logger.warn(
			`[codex] Usage limit reached for plan: ${planType}, resets in: ${resetTimeStr}`,
		);

		try {
			const accountManager = AccountManager.getInstance();
			const isLoadBalanceEnabled =
				accountManager.getLoadBalanceEnabled("codex");
			const accounts = accountManager.getAccountsByProvider("codex");

			// Mark current account as having an error (quota exceeded)
			if (currentAccountId) {
				const currentAccount = accountManager.getAccount(currentAccountId);
				if (currentAccount) {
					// Also update legacy metadata for backward compatibility
					await accountManager.updateAccount(currentAccountId, {
						metadata: {
							...currentAccount.metadata,
							quotaExceeded: true,
							quotaResetsAt: error.resets_at,
							lastQuotaError: new Date().toISOString(),
						},
					});

					// Update new QuotaCache
					await this.quotaCache.markQuotaExceeded(currentAccountId, "codex", {
						resetDelayMs: (error.resets_at - Date.now() / 1000) * 1000,
						error: `Usage limit reached (${planType})`,
					});
				}
			}

			// Find other available accounts (not the current one)
			const otherAccounts = accounts.filter(
				(acc) => acc.id !== currentAccountId && acc.status === "active",
			);

			// Auto-switch if load balance is enabled and there are other accounts
			if (isLoadBalanceEnabled && otherAccounts.length > 0) {
				const nextAccount = otherAccounts[0];
				await accountManager.switchAccount("codex", nextAccount.id);

				Logger.info(
					`[codex] Auto-switched to account: ${nextAccount.displayName}`,
				);

				// Show notification about auto-switch
				vscode.window
					.showWarningMessage(
						`Codex quota exceeded (${planType}). Resets in ${resetTimeStr}. Auto-switched to: ${nextAccount.displayName}`,
						"OK",
						"Manage Accounts",
					)
					.then((selection) => {
						if (selection === "Manage Accounts") {
							vscode.commands.executeCommand("chp.accounts.openManager");
						}
					});
			} else if (otherAccounts.length > 0) {
				// Load balance disabled but other accounts available
				vscode.window
					.showWarningMessage(
						`Codex quota exceeded (${planType}). Resets in ${resetTimeStr}. You have ${otherAccounts.length} other account(s) available.`,
						"Switch Account",
						"Enable Auto-Switch",
						"Dismiss",
					)
					.then(async (selection) => {
						if (selection === "Switch Account") {
							vscode.commands.executeCommand("chp.accounts.openManager");
						} else if (selection === "Enable Auto-Switch") {
							await accountManager.setLoadBalanceEnabled("codex", true);
							vscode.window.showInformationMessage(
								"Auto-switch enabled for Codex accounts.",
							);
						}
					});
			} else {
				// No other accounts available
				vscode.window
					.showErrorMessage(
						`Codex quota exceeded (${planType}). Resets in ${resetTimeStr}. No other accounts available.`,
						"Add Account",
						"Dismiss",
					)
					.then((selection) => {
						if (selection === "Add Account") {
							vscode.commands.executeCommand("chp.codex.login");
						}
					});
			}
		} catch (err) {
			// AccountManager might not be initialized, just show basic notification
			Logger.warn(
				`[codex] Failed to handle usage limit with account manager: ${err}`,
			);
			vscode.window.showErrorMessage(
				`Codex quota exceeded (${planType}). Resets in ${resetTimeStr}.`,
				"OK",
			);
		}
	}

	/**
	 * Check if the model is a GPT 5.2 model
	 */
	private isGpt52Model(modelId: string): boolean {
		return (
			modelId.toLowerCase().includes("gpt-5.2") ||
			modelId.toLowerCase().includes("gpt5.2")
		);
	}

	/**
	 * Check if the model is a Codex model (GPT-5 based)
	 */
	private isCodexModel(modelId: string): boolean {
		const lowerModelId = modelId.toLowerCase();
		// Match patterns like: codex, gpt-5-codex, codex-mini, etc.
		return (
			lowerModelId.includes("codex") ||
			(lowerModelId.includes("gpt-5") && !lowerModelId.includes("gpt-5.2"))
		);
	}

	/**
	 * Convert VS Code tool call ID to Codex format
	 * Codex API requires IDs to start with 'fc_' prefix
	 * VS Code uses 'call_' prefix
	 */
	private toCodexCallId(vsCodeCallId: string): string {
		if (vsCodeCallId.startsWith("fc_")) {
			return vsCodeCallId; // Already in Codex format
		}
		if (vsCodeCallId.startsWith("call_")) {
			return `fc_${vsCodeCallId.substring(5)}`; // Replace 'call_' with 'fc_'
		}
		// For other formats, just prepend 'fc_'
		return `fc_${vsCodeCallId}`;
	}

	/**
	 * Convert Codex tool call ID to VS Code format
	 * VS Code expects 'call_' prefix
	 */
	private toVSCodeCallId(codexCallId: string): string {
		if (codexCallId.startsWith("call_")) {
			return codexCallId; // Already in VS Code format
		}
		if (codexCallId.startsWith("fc_")) {
			return `call_${codexCallId.substring(3)}`; // Replace 'fc_' with 'call_'
		}
		// For other formats, just prepend 'call_'
		return `call_${codexCallId}`;
	}

	/**
	 * Extract reasoning effort and base model from model ID
	 * e.g., "gpt-5.2-low" -> { baseModel: "gpt-5.2", reasoningEffort: "low" }
	 * e.g., "gpt-5.2-codex-medium" -> { baseModel: "gpt-5.2-codex", reasoningEffort: "medium" }
	 */
	private parseModelReasoningEffort(modelId: string): {
		baseModel: string;
		reasoningEffort?: string;
	} {
		const effortLevels = ["low", "medium", "high"];
		const lowerModelId = modelId.toLowerCase();

		for (const effort of effortLevels) {
			if (lowerModelId.endsWith(`-${effort}`)) {
				// Remove the effort suffix to get base model
				const baseModel = modelId.slice(0, -(effort.length + 1));
				return { baseModel, reasoningEffort: effort };
			}
		}

		return { baseModel: modelId };
	}

	async handleRequest(
		model: vscode.LanguageModelChatInformation,
		config: ModelConfig,
		messages: vscode.LanguageModelChatMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		token: vscode.CancellationToken,
		accessToken: string,
		accountId?: string,
		organizationId?: string,
		projectId?: string,
	): Promise<void> {
		// Store current model ID for instruction selection
		this.currentModelId = config.model || model.id;

		// Parse model ID to extract base model and reasoning effort
		const { baseModel, reasoningEffort } = this.parseModelReasoningEffort(
			this.currentModelId,
		);

		const url = `${CODEX_BASE_URL}/responses`;
		const promptCacheKey = crypto.randomUUID();
		const sessionId = crypto.randomUUID();

		// Determine if using VS Code tools (needed for developer message injection)
		const useVSCodeTools = !!(
			options.tools &&
			options.tools.length > 0 &&
			model.capabilities?.toolCalling
		);

		// Convert messages to Responses API format
		const { instructions, input } = await this.convertToResponsesAPI(
			messages,
			true,
			model.capabilities?.imageInput === true,
			useVSCodeTools,
		);

		const finalInstructions =
			instructions && instructions.trim().length > 0
				? instructions
				: this.getDefaultInstructions();

		// Build payload matching llm-mux Responses API format
		const payload: Record<string, unknown> = {
			model: baseModel, // Use base model (e.g., "gpt-5.2" instead of "gpt-5.2-low")
			instructions: finalInstructions,
			input: input,
			stream: true,
			prompt_cache_key: promptCacheKey,
			store: false,
		};

		// Convert VS Code tools to Codex format if available, otherwise use default CODEX_TOOLS
		if (useVSCodeTools) {
			const vsCodeTools = this.convertVSCodeToolsToCodex(options.tools);
			// Check if manage_todo_list is already in VS Code tools
			const hasManageTodoList = vsCodeTools.some((t: unknown) => {
				const tool = t as { name?: string };
				return tool.name === "manage_todo_list";
			});
			// Add manage_todo_list from CODEX_TOOLS if not present (for task planning)
			if (!hasManageTodoList) {
				const manageTodoListTool = CODEX_TOOLS.find(
					(t) => t.name === "manage_todo_list",
				);
				if (manageTodoListTool) {
					vsCodeTools.push(manageTodoListTool);
					Logger.info("[codex] Added manage_todo_list tool for task planning");
				}
			}
			payload.tools = vsCodeTools;
		} else {
			payload.tools = CODEX_TOOLS;
		}

		// Add reasoning.effort if specified in model name
		if (reasoningEffort) {
			payload.reasoning = { effort: reasoningEffort };
		}

		// Log the request payload for debugging

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
			Version: "0.21.0",
			"Openai-Beta": "responses=experimental",
			Session_id: sessionId,
			Conversation_id: sessionId,
			"User-Agent": CODEX_USER_AGENT,
			Accept: "text/event-stream",
			Connection: "Keep-Alive",
			Originator: "codex_cli_rs",
		};

		if (accountId) {
			headers["Chatgpt-Account-Id"] = accountId;
		}

		// Add organization header for Business workspace
		if (organizationId) {
			headers["OpenAI-Organization"] = organizationId;
		}

		// Add project header if available
		if (projectId) {
			headers["OpenAI-Project"] = projectId;
		}

		// Log all headers being sent

		const payloadStr = JSON.stringify(payload);
		const maxRetries = 2;
		const baseDelayMs = 500;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				await this.executeRequest(
					url,
					headers,
					payloadStr,
					progress,
					token,
					!!useVSCodeTools,
					accountId,
					organizationId,
					projectId,
				);
				return;
			} catch (err) {
				if (
					token.isCancellationRequested ||
					!this.isRetryableError(err) ||
					attempt === maxRetries
				) {
					throw err;
				}

				const delayMs = baseDelayMs * 2 ** attempt;
				const message = err instanceof Error ? err.message : String(err);
				Logger.warn(
					`[codex] Request failed (${message}). Retrying in ${delayMs}ms... (${attempt + 1}/${maxRetries})`,
				);
				await this.sleep(delayMs);
			}
		}
	}

	private async executeRequest(
		url: string,
		headers: Record<string, string>,
		payloadStr: string,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		token: vscode.CancellationToken,
		useVSCodeTools: boolean,
		accountId?: string,
		_organizationId?: string,
		_projectId?: string,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const req = https.request(
				url,
				{
					method: "POST",
					headers: headers,
				},
				(res) => {
					const rateLimitSnapshot = parseRateLimitFromHeaders(
						res.headers as Record<string, string | string[] | undefined>,
					);
					if (rateLimitSnapshot) {
						this.lastRateLimitSnapshot = rateLimitSnapshot;
					}

					if (
						res.statusCode &&
						(res.statusCode < 200 || res.statusCode >= 300)
					) {
						let body = "";
						res.on("data", (chunk) => {
							body += chunk;
						});
						res.on("end", async () => {
							Logger.error(`[codex] Error ${res.statusCode}: ${body}`);

							// Handle 429 usage limit reached error
							if (res.statusCode === 429) {
								const usageLimitError = parseUsageLimitError(body);
								if (usageLimitError) {
									await this.handleUsageLimitError(usageLimitError, accountId);
								}
							}

							reject(new Error(`Codex API error: ${res.statusCode} - ${body}`));
						});
						return;
					}

					let buffer = "";
					let currentEventType = "";

					let _hasResponse = false; // Track if we received any content

					let currentFunctionName = ""; // Track current function call name
					let currentFunctionArgs = ""; // Accumulate function arguments
					let currentFunctionCallId = ""; // Track function call ID
					let toolCallCounter = 0; // Counter for generating unique tool call IDs

					// Track reported tool calls to avoid duplicates
					const reportedToolCalls = new Set<string>();

					// Track if using VS Code tools (for LanguageModelToolCallPart) or Codex native tools (for text display)
					const usingVSCodeTools = useVSCodeTools;

					// Thinking/Reasoning support
					let currentThinkingId: string | null = null;
					let thinkingContentBuffer = "";
					const MAX_THINKING_BUFFER_LENGTH = 500; // Buffer size before flushing thinking content

					res.on("data", (chunk: Buffer) => {
						if (token.isCancellationRequested) {
							req.destroy();
							return;
						}

						const text = chunk.toString();
						buffer += text;

						const lines = buffer.split("\n");
						buffer = lines.pop() || "";

						for (const line of lines) {
							const trimmedLine = line.trim();
							if (!trimmedLine) {
								continue;
							}

							// Handle SSE event type line (Responses API format)
							if (trimmedLine.startsWith("event:")) {
								currentEventType = trimmedLine.substring(6).trim();
								continue;
							}

							if (trimmedLine.startsWith("data:")) {
								const dataStr = trimmedLine.substring(5).trim();
								if (dataStr === "[DONE]") {
									Logger.debug("[codex] Received [DONE]");
									continue;
								}

								try {
									const data = JSON.parse(dataStr);

									// Get event type from data if not from SSE line
									const eventType = currentEventType || data.type || "";

									// Log all events for debugging

									// Handle Codex Responses API events
									switch (eventType) {
										case "response.output_text.delta": {
											// Text content delta - main response text
											const delta = data.delta;
											if (delta) {
												// Close any open thinking block before outputting text
												if (currentThinkingId) {
													// Flush remaining thinking buffer
													if (thinkingContentBuffer.length > 0) {
														try {
															progress.report(
																new vscode.LanguageModelThinkingPart(
																	thinkingContentBuffer,
																	currentThinkingId,
																),
															);
															thinkingContentBuffer = "";
														} catch (e) {
															Logger.warn(
																`[codex] Failed to flush thinking before text: ${e}`,
															);
														}
													}
													// Close thinking block
													try {
														progress.report(
															new vscode.LanguageModelThinkingPart(
																"",
																currentThinkingId,
															),
														);
														Logger.debug(
															`[codex] Closed thinking block before text output: ${currentThinkingId}`,
														);
													} catch (e) {
														Logger.warn(
															`[codex] Failed to close thinking block: ${e}`,
														);
													}
													currentThinkingId = null;
												}

												_hasResponse = true;
												progress.report(
													new vscode.LanguageModelTextPart(delta),
												);
											}
											break;
										}
										case "response.reasoning_summary_text.delta": {
											// Reasoning/thinking summary delta - display as thinking part
											const delta = data.delta;
											if (delta) {
												_hasResponse = true;

												// Initialize thinking ID if not set
												if (!currentThinkingId) {
													currentThinkingId = `thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
													Logger.debug(
														`[codex] Started thinking block with id: ${currentThinkingId}`,
													);
												}

												// Accumulate thinking content
												thinkingContentBuffer += delta;

												// Flush buffer if it exceeds threshold
												if (
													thinkingContentBuffer.length >=
													MAX_THINKING_BUFFER_LENGTH
												) {
													try {
														progress.report(
															new vscode.LanguageModelThinkingPart(
																thinkingContentBuffer,
																currentThinkingId,
															),
														);
														Logger.trace(
															`[codex] Flushed thinking buffer: ${thinkingContentBuffer.length} chars`,
														);
														thinkingContentBuffer = "";
													} catch (e) {
														Logger.warn(
															`[codex] Failed to report thinking part: ${e}`,
														);
													}
												}
											}
											break;
										}
										case "response.reasoning_summary_text.done": {
											// Reasoning/thinking summary complete - flush remaining buffer and close thinking block
											if (
												thinkingContentBuffer.length > 0 &&
												currentThinkingId
											) {
												try {
													progress.report(
														new vscode.LanguageModelThinkingPart(
															thinkingContentBuffer,
															currentThinkingId,
														),
													);
													Logger.debug(
														`[codex] Final thinking flush: ${thinkingContentBuffer.length} chars`,
													);
													thinkingContentBuffer = "";
												} catch (e) {
													Logger.warn(
														`[codex] Failed to report final thinking part: ${e}`,
													);
												}
											}

											// Close the thinking block
											if (currentThinkingId) {
												try {
													progress.report(
														new vscode.LanguageModelThinkingPart(
															"",
															currentThinkingId,
														),
													);
													Logger.debug(
														`[codex] Closed thinking block: ${currentThinkingId}`,
													);
												} catch (e) {
													Logger.warn(
														`[codex] Failed to close thinking block: ${e}`,
													);
												}
												currentThinkingId = null;
											}
											break;
										}
										case "response.reasoning_text.delta":
										case "response.reasoning.delta": {
											// Reasoning/thinking delta (official event is response.reasoning_text.delta)
											const delta = data.delta?.text || data.delta || data.text;
											if (delta && typeof delta === "string") {
												_hasResponse = true;

												if (!currentThinkingId) {
													currentThinkingId = `thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
													Logger.debug(
														`[codex] Started thinking block (reasoning_text.delta) with id: ${currentThinkingId}`,
													);
												}

												thinkingContentBuffer += delta;

												if (
													thinkingContentBuffer.length >=
													MAX_THINKING_BUFFER_LENGTH
												) {
													try {
														progress.report(
															new vscode.LanguageModelThinkingPart(
																thinkingContentBuffer,
																currentThinkingId,
															),
														);
														thinkingContentBuffer = "";
													} catch (e) {
														Logger.warn(
															`[codex] Failed to report reasoning_text.delta: ${e}`,
														);
													}
												}
											}
											break;
										}
										case "response.reasoning_text.done":
										case "response.reasoning.done": {
											// Reasoning/thinking done (official event is response.reasoning_text.done)
											if (
												thinkingContentBuffer.length === 0 &&
												typeof data.text === "string" &&
												data.text.length > 0
											) {
												thinkingContentBuffer = data.text;
											}
											if (
												thinkingContentBuffer.length > 0 &&
												currentThinkingId
											) {
												try {
													progress.report(
														new vscode.LanguageModelThinkingPart(
															thinkingContentBuffer,
															currentThinkingId,
														),
													);
													thinkingContentBuffer = "";
												} catch (e) {
													Logger.warn(
														`[codex] Failed to flush reasoning_text.done: ${e}`,
													);
												}
											}
											if (currentThinkingId) {
												try {
													progress.report(
														new vscode.LanguageModelThinkingPart(
															"",
															currentThinkingId,
														),
													);
													Logger.debug(
														`[codex] Closed thinking block (reasoning_text.done): ${currentThinkingId}`,
													);
												} catch (e) {
													Logger.warn(
														`[codex] Failed to close reasoning block: ${e}`,
													);
												}
												currentThinkingId = null;
											}
											break;
										}
										case "response.content_part.delta": {
											// Handle content_part.delta events
											const delta = data.delta?.text || data.delta;
											if (delta && typeof delta === "string") {
												_hasResponse = true;
												progress.report(
													new vscode.LanguageModelTextPart(delta),
												);
											}
											break;
										}
										case "response.content_part.added":
										case "response.content_part.done":
										case "response.output_item.added": {
											// Check if this is a function call item being added
											const itemType = data.item?.type || data.type || "";
											if (
												itemType === "function_call" ||
												data.item?.type === "function_call"
											) {
												currentFunctionName =
													data.item?.name || data.name || "";
												currentFunctionCallId =
													data.item?.call_id ||
													data.item?.id ||
													data.call_id ||
													`call_${++toolCallCounter}`;
												currentFunctionArgs = data.item?.arguments || "";
												Logger.info(
													`[codex] Function call started: ${currentFunctionName} (id: ${currentFunctionCallId})`,
												);

												// If arguments are already complete, process immediately
												if (
													currentFunctionArgs &&
													currentFunctionArgs.length > 0
												) {
													Logger.info(
														`[codex] Function call has immediate args: ${currentFunctionArgs.substring(0, 100)}...`,
													);
												}
											}
											Logger.debug(
												`[codex] Lifecycle event: ${eventType}, item type: ${itemType}, data: ${JSON.stringify(data).substring(0, 300)}`,
											);
											break;
										}
										case "response.output_item.done": {
											// Check if this is a completed function call
											const itemType = data.item?.type || data.type || "";
											if (
												itemType === "function_call" ||
												data.item?.type === "function_call"
											) {
												const funcItem = data.item || data;
												const name = funcItem.name || currentFunctionName || "";
												const args =
													funcItem.arguments || currentFunctionArgs || "";
												const callId =
													funcItem.call_id ||
													funcItem.id ||
													currentFunctionCallId ||
													`fc_${++toolCallCounter}`;

												// Check for duplicate - skip if already reported
												const toolCallKey = `${callId}_${name}`;
												if (reportedToolCalls.has(toolCallKey)) {
													Logger.debug(
														`[codex] Skipping duplicate tool call: ${name} (id: ${callId})`,
													);
												} else {
													reportedToolCalls.add(toolCallKey);
													Logger.info(
														`[codex] Function call completed via output_item.done: ${name} (id: ${callId})`,
													);
													_hasResponse = true;

													if (name && args) {
														// Convert Codex call ID (fc_) to VS Code format (call_)
														const vsCodeCallId = this.toVSCodeCallId(callId);
														try {
															const parsedArgs = JSON.parse(args);
															if (usingVSCodeTools) {
																const normalizedArgs =
																	typeof parsedArgs === "object" &&
																	parsedArgs !== null
																		? parsedArgs
																		: { value: parsedArgs };
																progress.report(
																	new vscode.LanguageModelToolCallPart(
																		vsCodeCallId,
																		name,
																		normalizedArgs,
																	),
																);
																Logger.info(
																	`[codex] Reported tool call to VS Code via output_item.done: ${name} (id: ${callId} -> ${vsCodeCallId})`,
																);
															} else {
																// Format manage_todo_list nicely when not using VS Code tools
																if (
																	name === "manage_todo_list" &&
																	parsedArgs.todoList
																) {
																	let todoText = "\n**Todo List:**\n";
																	for (const item of parsedArgs.todoList) {
																		const icon =
																			item.status === "completed"
																				? "OK"
																				: item.status === "in-progress"
																					? "IN-PROG"
																					: "PENDING";
																		todoText += `${icon} **${item.title}**`;
																		if (item.description) {
																			todoText += ` - ${item.description}`;
																		}
																		todoText += "\n";
																	}
																	progress.report(
																		new vscode.LanguageModelTextPart(todoText),
																	);
																} else {
																	const argsPreview = JSON.stringify(
																		parsedArgs,
																		null,
																		2,
																	);
																	const truncated =
																		argsPreview.length > 500
																			? `${argsPreview.substring(0, 500)}\n...`
																			: argsPreview;
																	progress.report(
																		new vscode.LanguageModelTextPart(
																			`\n**Tool: ${name}**\n\`\`\`json\n${truncated}\n\`\`\`\n`,
																		),
																	);
																}
															}
														} catch (parseErr) {
															Logger.warn(
																`[codex] Failed to parse function args in output_item.done: ${parseErr}`,
															);
															if (usingVSCodeTools) {
																progress.report(
																	new vscode.LanguageModelToolCallPart(
																		vsCodeCallId,
																		name,
																		{ raw: args },
																	),
																);
															}
														}
													}
												}

												// Reset for next function call
												currentFunctionName = "";
												currentFunctionArgs = "";
												currentFunctionCallId = "";
											}
											break;
										}
										case "response.created":
										case "response.in_progress":
											// These are lifecycle events, just log them
											Logger.debug(`[codex] Lifecycle event: ${eventType}`);
											break;
										// Handle function/tool call events
										case "response.function_call_arguments.delta": {
											// Tool call argument delta - accumulate
											const delta = data.delta;
											if (delta) {
												currentFunctionArgs += delta;
												_hasResponse = true;
											}
											break;
										}
										case "response.function_call_arguments.done": {
											// Tool call complete
											const args = currentFunctionArgs || data.arguments || "";
											const name = currentFunctionName || data.name || "";
											const callId =
												currentFunctionCallId ||
												data.call_id ||
												`fc_${++toolCallCounter}`;

											// Check for duplicate - skip if already reported
											const toolCallKey = `${callId}_${name}`;
											if (reportedToolCalls.has(toolCallKey)) {
												Logger.debug(
													`[codex] Skipping duplicate tool call in function_call_arguments.done: ${name} (id: ${callId})`,
												);
												// Reset for next function call
												currentFunctionName = "";
												currentFunctionArgs = "";
												currentFunctionCallId = "";
												break;
											}
											reportedToolCalls.add(toolCallKey);

											Logger.info(
												`[codex] Function call done: ${name}(${args.substring(0, 200)}...) [id: ${callId}]`,
											);
											_hasResponse = true;

											// Convert Codex call ID (fc_) to VS Code format (call_)
											const vsCodeCallId = this.toVSCodeCallId(callId);

											try {
												const parsedArgs = JSON.parse(args);

												// If using VS Code tools, report as LanguageModelToolCallPart for VS Code to execute
												if (usingVSCodeTools) {
													const normalizedArgs =
														typeof parsedArgs === "object" &&
														parsedArgs !== null
															? parsedArgs
															: { value: parsedArgs };
													progress.report(
														new vscode.LanguageModelToolCallPart(
															vsCodeCallId,
															name,
															normalizedArgs,
														),
													);
													Logger.info(
														`[codex] Reported tool call to VS Code: ${name} (id: ${callId} -> ${vsCodeCallId})`,
													);
												} else {
													// Using Codex native tools - display as formatted text
													if (name === "update_plan" && parsedArgs.steps) {
														// Format plan nicely
														let planText = "\n**Plan:**\n";
														for (const step of parsedArgs.steps) {
															const icon =
																step.status === "completed"
																	? "OK"
																	: step.status === "in_progress"
																		? "IN-PROG"
																		: "PENDING";
															planText += `${icon} ${step.description}\n`;
														}
														if (parsedArgs.explanation) {
															planText += `\n_${parsedArgs.explanation}_\n`;
														}
														progress.report(
															new vscode.LanguageModelTextPart(planText),
														);
													} else if (name === "shell" && parsedArgs.command) {
														const cmd = Array.isArray(parsedArgs.command)
															? parsedArgs.command.join(" ")
															: parsedArgs.command;
														let shellText = `\n🖥️ **Running command:**\n\`\`\`bash\n${cmd}\n\`\`\`\n`;
														if (parsedArgs.workdir) {
															shellText += `Working directory: \`${parsedArgs.workdir}\`\n`;
														}
														progress.report(
															new vscode.LanguageModelTextPart(shellText),
														);
													} else if (
														name === "apply_patch" &&
														parsedArgs.patch
													) {
														const patchPreview =
															parsedArgs.patch.length > 1000
																? parsedArgs.patch.substring(0, 1000) +
																	"\n... (truncated)"
																: parsedArgs.patch;
														progress.report(
															new vscode.LanguageModelTextPart(
																`\n**Applying patch:**\n\`\`\`diff\n${patchPreview}\n\`\`\`\n`,
															),
														);
													} else if (
														name === "manage_todo_list" &&
														parsedArgs.todoList
													) {
														// Format todo list nicely (similar to update_plan)
														let todoText = "\n📋 **Todo List:**\n";
														for (const item of parsedArgs.todoList) {
															const icon =
																item.status === "completed"
																	? "OK"
																	: item.status === "in-progress"
																		? "IN-PROG"
																		: "PENDING";
															todoText += `${icon} **${item.title}**`;
															if (item.description) {
																todoText += ` - ${item.description}`;
															}
															todoText += "\n";
														}
														progress.report(
															new vscode.LanguageModelTextPart(todoText),
														);
													} else {
														// Generic tool call display
														const argsPreview = JSON.stringify(
															parsedArgs,
															null,
															2,
														);
														const truncated =
															argsPreview.length > 500
																? `${argsPreview.substring(0, 500)}\n...`
																: argsPreview;
														progress.report(
															new vscode.LanguageModelTextPart(
																`\n**Tool: ${name}**\n\`\`\`json\n${truncated}\n\`\`\`\n`,
															),
														);
													}
													Logger.info(
														`[codex] Displayed tool call as text: ${name}`,
													);
												}
											} catch (parseError) {
												// If parsing fails
												Logger.warn(
													`[codex] Failed to parse function args: ${parseError}`,
												);
												if (usingVSCodeTools) {
													progress.report(
														new vscode.LanguageModelToolCallPart(
															vsCodeCallId,
															name,
															{ raw: args },
														),
													);
												} else {
													progress.report(
														new vscode.LanguageModelTextPart(
															`\n**Tool: ${name || "unknown"}**\n\`\`\`\n${args.substring(0, 500)}\n\`\`\`\n`,
														),
													);
												}
											}

											// Reset for next function call
											currentFunctionName = "";
											currentFunctionArgs = "";
											currentFunctionCallId = "";
											break;
										}
										case "response.output_item.function_call": {
											// Function call output item (alternative format)
											const funcCall = data.function_call || data.item || data;
											const name = funcCall.name || "";
											const args = funcCall.arguments || "";
											const callId =
												funcCall.call_id ||
												funcCall.id ||
												`fc_${++toolCallCounter}`;

											// Check for duplicate - skip if already reported
											const toolCallKey = `${callId}_${name}`;
											if (reportedToolCalls.has(toolCallKey)) {
												Logger.debug(
													`[codex] Skipping duplicate tool call in output_item.function_call: ${name} (id: ${callId})`,
												);
												break;
											}
											reportedToolCalls.add(toolCallKey);

											Logger.info(
												`[codex] Function call output: ${name} (id: ${callId})`,
											);
											_hasResponse = true;

											// Convert Codex call ID (fc_) to VS Code format (call_)
											const vsCodeCallId = this.toVSCodeCallId(callId);

											if (name && args) {
												try {
													const parsedArgs = JSON.parse(args);
													if (usingVSCodeTools) {
														const normalizedArgs =
															typeof parsedArgs === "object" &&
															parsedArgs !== null
																? parsedArgs
																: { value: parsedArgs };
														progress.report(
															new vscode.LanguageModelToolCallPart(
																vsCodeCallId,
																name,
																normalizedArgs,
															),
														);
														Logger.info(
															`[codex] Reported tool call to VS Code: ${name} (id: ${callId} -> ${vsCodeCallId})`,
														);
													} else {
														// Format manage_todo_list nicely when not using VS Code tools
														if (
															name === "manage_todo_list" &&
															parsedArgs.todoList
														) {
															let todoText = "\n📋 **Todo List:**\n";
															for (const item of parsedArgs.todoList) {
																const icon =
																	item.status === "completed"
																		? "OK"
																		: item.status === "in-progress"
																			? "IN-PROG"
																			: "PENDING";
																todoText += `${icon} **${item.title}**`;
																if (item.description) {
																	todoText += ` - ${item.description}`;
																}
																todoText += "\n";
															}
															progress.report(
																new vscode.LanguageModelTextPart(todoText),
															);
														} else {
															const argsPreview = JSON.stringify(
																parsedArgs,
																null,
																2,
															);
															const truncated =
																argsPreview.length > 500
																	? `${argsPreview.substring(0, 500)}\n...`
																	: argsPreview;
															progress.report(
																new vscode.LanguageModelTextPart(
																	`\n**Tool: ${name}**\n\`\`\`json\n${truncated}\n\`\`\`\n`,
																),
															);
														}
													}
												} catch {
													if (usingVSCodeTools) {
														progress.report(
															new vscode.LanguageModelToolCallPart(
																vsCodeCallId,
																name,
																{ raw: args },
															),
														);
													} else {
														progress.report(
															new vscode.LanguageModelTextPart(
																`\n**Tool: ${name}**\n\`\`\`\n${args.substring(0, 500)}\n\`\`\`\n`,
															),
														);
													}
												}
											}
											break;
										}
										case "response.completed": {
											// Response completed
											break;
										}
										case "error": {
											const errorMsg =
												data.message ||
												data.error?.message ||
												data.error ||
												"Unknown error";
											Logger.error(`[codex] API Error: ${errorMsg}`);
											Logger.error(
												`[codex] Full error data: ${JSON.stringify(data)}`,
											);
											break;
										}
										default: {
											// Handle legacy OpenAI Chat format (fallback)
											if (data.choices && data.choices.length > 0) {
												const delta = data.choices[0].delta;
												if (delta?.content) {
													_hasResponse = true;
													progress.report(
														new vscode.LanguageModelTextPart(delta.content),
													);
												}
											} else if (eventType) {
												Logger.debug(
													`[codex] Unhandled event type: ${eventType}`,
												);
											}
											break;
										}
									}

									// Reset event type after processing
									currentEventType = "";
								} catch (e) {
									// Log parse errors
									Logger.debug(
										`[codex] Parse error: ${e}, line: ${trimmedLine.substring(0, 200)}`,
									);
								}
							}
						}
					});

					res.on("end", () => {
						// Flush any remaining thinking content
						if (thinkingContentBuffer.length > 0 && currentThinkingId) {
							try {
								progress.report(
									new vscode.LanguageModelThinkingPart(
										thinkingContentBuffer,
										currentThinkingId,
									),
								);
								Logger.debug(
									`[codex] Flushed remaining thinking on stream end: ${thinkingContentBuffer.length} chars`,
								);
							} catch (e) {
								Logger.warn(
									`[codex] Failed to flush thinking on stream end: ${e}`,
								);
							}
						}

						// Close thinking block if still open
						if (currentThinkingId) {
							try {
								progress.report(
									new vscode.LanguageModelThinkingPart("", currentThinkingId),
								);
								Logger.debug(
									`[codex] Closed thinking block on stream end: ${currentThinkingId}`,
								);
							} catch (e) {
								Logger.warn(
									`[codex] Failed to close thinking block on stream end: ${e}`,
								);
							}
						}

						resolve();
					});

					res.on("error", (err) => {
						Logger.error(`[codex] Response stream error: ${err}`);
						reject(err);
					});
				},
			);

			req.on("error", (err) => {
				Logger.error(`[codex] Request error: ${err}`);
				reject(err);
			});

			req.write(payloadStr);
			req.end();
		});
	}

	private isRetryableError(err: unknown): boolean {
		const message = err instanceof Error ? err.message : String(err);
		const lowerMessage = message.toLowerCase();
		const code = (err as NodeJS.ErrnoException | undefined)?.code;
		const retryableCodes = new Set([
			"ECONNRESET",
			"ETIMEDOUT",
			"EPIPE",
			"ERR_STREAM_PREMATURE_CLOSE",
			"ECONNABORTED",
		]);

		if (code && retryableCodes.has(code)) {
			return true;
		}

		return (
			lowerMessage.includes("aborted") ||
			lowerMessage.includes("socket hang up") ||
			lowerMessage.includes("econnreset") ||
			lowerMessage.includes("etimedout") ||
			lowerMessage.includes("econnaborted")
		);
	}

	private async sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private async convertToResponsesAPI(
		messages: vscode.LanguageModelChatMessage[],
		includeSystemInInput: boolean = false,
		includeImageInput: boolean = false,
		useVSCodeTools: boolean = false,
	): Promise<{ instructions: string; input: unknown[] }> {
		const systemParts: string[] = [];
		const input: unknown[] = [];

		for (const msg of messages) {
			// Collect text content
			const textParts: string[] = [];
			const imageParts: vscode.LanguageModelDataPart[] = [];
			// Collect tool calls from assistant messages
			const toolCalls: Array<{ id: string; name: string; arguments: string }> =
				[];
			// Collect tool results from user messages
			const toolResults: Array<{ call_id: string; output: string }> = [];

			if (msg.content) {
				for (const part of msg.content) {
					if (part instanceof vscode.LanguageModelTextPart) {
						textParts.push(part.value);
					} else if (part instanceof vscode.LanguageModelToolCallPart) {
						// Tool call from assistant
						toolCalls.push({
							id: part.callId,
							name: part.name,
							arguments:
								typeof part.input === "string"
									? part.input
									: JSON.stringify(part.input),
						});
						Logger.debug(
							`[codex] Found tool call in message: ${part.name} (id: ${part.callId})`,
						);
					} else if (part instanceof vscode.LanguageModelToolResultPart) {
						// Tool result from user
						let resultContent = "";
						if (typeof part.content === "string") {
							resultContent = part.content;
						} else if (Array.isArray(part.content)) {
							// Handle array of content parts
							resultContent = part.content
								.map((c) => {
									if (typeof c === "string") {
										return c;
									}
									if (c && typeof c === "object" && "value" in c) {
										return String(c.value);
									}
									return JSON.stringify(c);
								})
								.join("\n");
						} else {
							resultContent = JSON.stringify(part.content);
						}
						toolResults.push({
							call_id: part.callId,
							output: resultContent,
						});
						Logger.debug(
							`[codex] Found tool result in message: callId=${part.callId}, content length=${resultContent.length}`,
						);
					} else if (
						includeImageInput &&
						(part as unknown) instanceof vscode.LanguageModelDataPart
					) {
						// Cast to unknown first to avoid TypeScript narrowing issues with LanguageModelDataPart
						const dataPart = part as vscode.LanguageModelDataPart;
						if (this.isImageMimeType(dataPart.mimeType)) {
							imageParts.push(dataPart);
						} else if (dataPart.mimeType.startsWith("image/")) {
							Logger.warn(
								`[codex] Unsupported image MIME type: ${dataPart.mimeType}`,
							);
						}
					}
				}
			}

			const content = textParts.join("\n");

			if (msg.role === vscode.LanguageModelChatMessageRole.System) {
				if (includeSystemInInput) {
					input.push({
						type: "message",
						role: "developer",
						content: [{ type: "input_text", text: content }],
					});
				} else {
					systemParts.push(content);
				}
			} else if (msg.role === vscode.LanguageModelChatMessageRole.User) {
				// Handle tool results first (they need to be sent as function_call_output)
				if (toolResults.length > 0) {
					for (const result of toolResults) {
						// Convert VS Code call_id to Codex format (fc_ prefix)
						const codexCallId = this.toCodexCallId(result.call_id);
						input.push({
							type: "function_call_output",
							call_id: codexCallId,
							output: result.output,
						});
						Logger.debug(
							`[codex] Added function_call_output for call_id: ${result.call_id} -> ${codexCallId}`,
						);
					}
				}

				const contentParts: Array<Record<string, unknown>> = [];
				if (content.trim().length > 0) {
					contentParts.push({ type: "input_text", text: content });
				}

				if (includeImageInput && imageParts.length > 0) {
					for (const imagePart of imageParts) {
						const dataUrl = this.createDataUrl(imagePart);
						contentParts.push({
							type: "input_image",
							image_url: dataUrl,
						});
					}
				}

				if (contentParts.length > 0) {
					input.push({
						type: "message",
						role: "user",
						content: contentParts,
					});
				}
			} else if (msg.role === vscode.LanguageModelChatMessageRole.Assistant) {
				// Handle assistant messages with potential tool calls
				if (toolCalls.length > 0) {
					// Add text content first if present
					if (content.trim().length > 0) {
						input.push({
							type: "message",
							role: "assistant",
							content: [{ type: "output_text", text: content }],
						});
					}

					// Add each tool call as a function_call item
					for (const toolCall of toolCalls) {
						// Convert VS Code call_id to Codex format (fc_ prefix)
						const codexCallId = this.toCodexCallId(toolCall.id);
						input.push({
							type: "function_call",
							id: codexCallId,
							call_id: codexCallId,
							name: toolCall.name,
							arguments: toolCall.arguments,
						});
						Logger.debug(
							`[codex] Added function_call for: ${toolCall.name} (id: ${toolCall.id} -> ${codexCallId})`,
						);
					}
				} else if (content.trim().length > 0) {
					input.push({
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: content }],
					});
				}
			}
		}

		// Inject sandbox configuration as the FIRST developer message
		// This tells the model it's running in full access mode with no restrictions
		// When using VS Code tools, also inject VS Code tools instructions
		const developerMessage = getCodexDeveloperMessage(useVSCodeTools);
		const sandboxMessage = {
			type: "message",
			role: "developer",
			content: [{ type: "input_text", text: developerMessage }],
		};

		// Insert sandbox config at the beginning of input array
		input.unshift(sandboxMessage);
		Logger.info(
			`[codex] Injected sandbox config: ${CODEX_SANDBOX_CONFIG.sandbox_mode}, ${CODEX_SANDBOX_CONFIG.network_access}, ${CODEX_SANDBOX_CONFIG.approval_policy}`,
		);

		const instructions = includeSystemInInput
			? this.getDefaultInstructions()
			: systemParts.length > 0
				? systemParts.join("\n\n")
				: this.getDefaultInstructions();

		return { instructions, input };
	}

	private getDefaultInstructions(): string {
		// Check for Codex model first (GPT-5 based, not GPT-5.2)
		if (this.isCodexModel(this.currentModelId)) {
			Logger.debug(
				`[codex] Using Codex (GPT-5) instructions for model: ${this.currentModelId}`,
			);
			return loadCodexInstructions();
		}
		// Use GPT 5.2 specific instructions for gpt-5.2 models
		if (this.isGpt52Model(this.currentModelId)) {
			Logger.debug(
				`[codex] Using GPT 5.2 instructions for model: ${this.currentModelId}`,
			);
			return loadGpt52Instructions();
		}
		// Default fallback
		return loadCodexDefaultInstructions();
	}

	/**
	 * Convert VS Code tools (LanguageModelChatTool) to Codex/OpenAI function format
	 * Follows OpenAI Responses API format for tools
	 */
	private convertVSCodeToolsToCodex(
		tools: readonly vscode.LanguageModelChatTool[],
	): unknown[] {
		return tools.map((tool) => {
			const toolDef: Record<string, unknown> = {
				type: "function",
				name: tool.name,
				description: tool.description || "",
			};

			// Process parameters schema
			if (tool.inputSchema && typeof tool.inputSchema === "object") {
				toolDef.parameters = this.sanitizeToolSchema(tool.inputSchema);
			} else {
				// Default empty schema
				toolDef.parameters = {
					type: "object",
					properties: {},
					required: [],
				};
			}

			Logger.trace(
				`[codex] Converted tool: ${tool.name}, params: ${JSON.stringify(toolDef.parameters).substring(0, 200)}`,
			);
			return toolDef;
		});
	}

	/**
	 * Sanitize tool schema for Codex API compatibility
	 * Handles nested objects, arrays, and ensures proper JSON Schema format
	 */
	private sanitizeToolSchema(schema: unknown): Record<string, unknown> {
		if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
			return { type: "object", properties: {}, required: [] };
		}

		let sanitized: Record<string, unknown>;
		try {
			sanitized = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
		} catch {
			return { type: "object", properties: {}, required: [] };
		}

		// Ensure type is valid
		const typeVal = sanitized.type;
		if (
			typeof typeVal !== "string" ||
			typeVal.trim() === "" ||
			typeVal === "None"
		) {
			sanitized.type = "object";
		} else {
			sanitized.type = typeVal.toLowerCase();
		}

		// Ensure properties exists for object type
		if (sanitized.type === "object" && !sanitized.properties) {
			sanitized.properties = {};
		}

		// Ensure required is an array
		if (
			sanitized.required !== undefined &&
			!Array.isArray(sanitized.required)
		) {
			sanitized.required = [];
		}

		// Remove additionalProperties if it's causing issues (some APIs don't support it)
		// Keep it only if explicitly set to false
		if (sanitized.additionalProperties !== false) {
			delete sanitized.additionalProperties;
		}

		// Recursively sanitize nested properties
		if (sanitized.properties && typeof sanitized.properties === "object") {
			const props = sanitized.properties as Record<string, unknown>;
			for (const key of Object.keys(props)) {
				const prop = props[key];
				if (prop && typeof prop === "object") {
					props[key] = this.sanitizeNestedSchema(
						prop as Record<string, unknown>,
					);
				}
			}
		}

		// Handle items for array type
		if (
			sanitized.type === "array" &&
			sanitized.items &&
			typeof sanitized.items === "object"
		) {
			sanitized.items = this.sanitizeNestedSchema(
				sanitized.items as Record<string, unknown>,
			);
		}

		return sanitized;
	}

	/**
	 * Sanitize nested schema properties
	 */
	private sanitizeNestedSchema(
		schema: Record<string, unknown>,
	): Record<string, unknown> {
		const sanitized = { ...schema };

		// Fix type if invalid
		const typeVal = sanitized.type;
		if (typeof typeVal === "string") {
			sanitized.type = typeVal.toLowerCase();
			if (sanitized.type === "none" || sanitized.type === "") {
				sanitized.type = "string";
			}
		}

		// Remove additionalProperties unless explicitly false
		if (sanitized.additionalProperties !== false) {
			delete sanitized.additionalProperties;
		}

		// Recursively handle nested properties
		if (sanitized.properties && typeof sanitized.properties === "object") {
			const props = sanitized.properties as Record<string, unknown>;
			for (const key of Object.keys(props)) {
				const prop = props[key];
				if (prop && typeof prop === "object") {
					props[key] = this.sanitizeNestedSchema(
						prop as Record<string, unknown>,
					);
				}
			}
		}

		// Handle array items
		if (sanitized.items && typeof sanitized.items === "object") {
			sanitized.items = this.sanitizeNestedSchema(
				sanitized.items as Record<string, unknown>,
			);
		}

		return sanitized;
	}

	/**
	 * Check if the MIME type is a supported image type
	 */
	private isImageMimeType(mimeType: string): boolean {
		// Normalize MIME type
		const normalizedMime = mimeType.toLowerCase().trim();
		// Supported image types
		const supportedTypes = [
			"image/jpeg",
			"image/jpg",
			"image/png",
			"image/gif",
			"image/webp",
			"image/bmp",
			"image/svg+xml",
		];
		const isImageCategory = normalizedMime.startsWith("image/");
		const isSupported = supportedTypes.includes(normalizedMime);
		// Debug logging
		if (isImageCategory && !isSupported) {
			Logger.warn(
				`[codex] Unsupported image type: ${mimeType}, supported types: ${supportedTypes.join(", ")}`,
			);
		}
		return isImageCategory && isSupported;
	}

	/**
	 * Create a data URL from a LanguageModelDataPart
	 */
	private createDataUrl(dataPart: vscode.LanguageModelDataPart): string {
		try {
			const base64Data = Buffer.from(dataPart.data).toString("base64");
			const dataUrl = `data:${dataPart.mimeType};base64,${base64Data}`;
			Logger.debug(
				`[codex] Created image DataURL: MIME=${dataPart.mimeType}, original size=${dataPart.data.length} bytes, Base64 size=${base64Data.length} chars`,
			);
			return dataUrl;
		} catch (error) {
			Logger.error(`[codex] Failed to create image DataURL: ${error}`);
			throw error;
		}
	}
}
