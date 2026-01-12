/*---------------------------------------------------------------------------------------------
 *  Gemini CLI Chat Participant using ACP
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { Logger } from "../../utils/logger";
import { AcpClient } from "./acpClient";

export class GeminiCliChatParticipant {
	private participant: vscode.ChatParticipant | null = null;
	private acpClient: AcpClient | null = null;

	constructor(readonly _context: vscode.ExtensionContext) {}

	async initialize(): Promise<void> {
		try {
			// Create chat participant first (so it appears in the menu)
			// The ID must match the one in package.json chatParticipants contribution
			// Properties like name, fullName, description, icon are defined in package.json
			this.participant = vscode.chat.createChatParticipant(
				"geminicli",
				async (request, context, response, token) => {
					return await this.handleChatRequest(
						request,
						context,
						response,
						token,
					);
				},
			);

			// Set additional properties that can be set programmatically
			if (this.participant) {
				this.participant.additionalWelcomeMessage = new vscode.MarkdownString(
					"I'm Gemini CLI, powered by Google's Gemini models. I can help you with code generation, refactoring, and debugging",
				);
			}

			// Try to find and initialize Gemini CLI (but don't fail if not found)
			const geminiCliPath = await this.findGeminiCli();
			if (geminiCliPath) {
				Logger.info(`[Gemini CLI Chat] Found Gemini CLI at: ${geminiCliPath}`);
				try {
					// Initialize ACP client with --experimental-acp flag
					// If using npx, we need to pass the package name as well
					if (geminiCliPath === "npx") {
						Logger.debug("[Gemini CLI Chat] Using npx to run Gemini CLI");
						this.acpClient = new AcpClient("npx", [
							"@google/gemini-cli",
							"--experimental-acp",
						]);
					} else {
						Logger.debug(
							`[Gemini CLI Chat] Using Gemini CLI at: ${geminiCliPath}`,
						);
						this.acpClient = new AcpClient(geminiCliPath, [
							"--experimental-acp",
						]);
					}
					await this.acpClient.initialize();
					Logger.info("[Gemini CLI Chat] ACP client initialized successfully");
				} catch (error) {
					Logger.error(
						"[Gemini CLI Chat] Failed to initialize ACP client:",
						error,
					);
					// Continue without ACP client - will show error when user tries to use it
					this.acpClient = null;
				}
			} else {
				Logger.warn(
					"[Gemini CLI Chat] Gemini CLI not found. Please install it: npm install -g @google/gemini-cli",
				);
			}

			Logger.info("[Gemini CLI Chat] Chat participant initialized");
		} catch (error) {
			Logger.error("[Gemini CLI Chat] Failed to initialize:", error);
			throw error;
		}
	}

	private async findGeminiCli(): Promise<string | null> {
		const isWindows = process.platform === "win32";
		const findCommand = isWindows ? "where.exe" : "which";

		// First, try to find gemini using which/where
		try {
			const geminiPath = await new Promise<string | null>((resolve) => {
				const proc = require("node:child_process").spawn(
					findCommand,
					["gemini"],
					{
						shell: true,
						stdio: ["ignore", "pipe", "ignore"],
					},
				);
				let output = "";
				proc.stdout?.on("data", (data: Buffer) => {
					output += data.toString();
				});
				proc.on("close", (code: number | null) => {
					if (code === 0 && output.trim()) {
						// On Windows, where.exe can return multiple paths, take the first one
						const path = output.trim().split("\n")[0].trim();
						resolve(path || null);
					} else {
						resolve(null);
					}
				});
				proc.on("error", () => resolve(null));
			});

			if (geminiPath) {
				Logger.debug(`[Gemini CLI] Found at: ${geminiPath}`);
				return geminiPath;
			}
		} catch {
			// Continue to try other methods
		}

		// If not found with which/where, try running gemini directly
		try {
			const result = await new Promise<string>((resolve, reject) => {
				const proc = require("node:child_process").spawn(
					"gemini",
					["--version"],
					{
						shell: true,
						stdio: ["ignore", "pipe", "ignore"],
					},
				);
				let output = "";
				proc.stdout?.on("data", (data: Buffer) => {
					output += data.toString();
				});
				proc.on("close", (code: number | null) => {
					if (code === 0) {
						resolve(output);
					} else {
						reject(new Error(`Exit code: ${code}`));
					}
				});
				proc.on("error", reject);
			});

			if (result?.includes("gemini")) {
				Logger.debug("[Gemini CLI] Found via direct execution");
				return "gemini";
			}
		} catch {
			// Continue to try npx
		}

		// Finally, try npx as fallback
		try {
			const result = await new Promise<string>((resolve, reject) => {
				const proc = require("node:child_process").spawn(
					"npx",
					["@google/gemini-cli", "--version"],
					{
						shell: true,
						stdio: ["ignore", "pipe", "ignore"],
					},
				);
				let output = "";
				proc.stdout?.on("data", (data: Buffer) => {
					output += data.toString();
				});
				proc.on("close", (code: number | null) => {
					if (code === 0) {
						resolve(output);
					} else {
						reject(new Error(`Exit code: ${code}`));
					}
				});
				proc.on("error", reject);
			});

			if (result) {
				Logger.debug("[Gemini CLI] Found via npx");
				return "npx";
			}
		} catch {
			// Not found
		}

		Logger.warn("[Gemini CLI] Not found using which/where or direct execution");
		return null;
	}

	private async handleChatRequest(
		request: vscode.ChatRequest,
		_context: vscode.ChatContext,
		response: vscode.ChatResponseStream,
		_token: vscode.CancellationToken,
	): Promise<vscode.ChatResult | undefined> {
		if (!this.acpClient) {
			response.markdown(
				"Gemini CLI is not available. Please ensure it is installed: `npm install -g @google/gemini-cli`",
			);
			return;
		}

		try {
			// Extract prompt from request
			const prompt = this.extractPrompt(request);

			if (!prompt) {
				response.markdown("Please provide a prompt or question.");
				return;
			}

			// Show progress
			response.progress("Connecting to Gemini CLI via ACP...");

			// Get workspace path for proper context
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

			// Track different types of content - match Copilot's style
			let messageBuffer = "";
			let thoughtBuffer = "";
			let currentThinkingId: string | undefined;
			let lastThoughtUpdate = Date.now();
			const THOUGHT_DEBOUNCE_MS = 200; // Debounce thought updates

			// Stream response chunks as they arrive
			const activeToolCalls = new Map<string, vscode.ChatToolInvocationPart>();

			const result = await this.acpClient.sendPrompt(
				prompt,
				workspacePath,
				(chunk: string, type: "text" | "thought" | "tool", metadata?: any) => {
					switch (type) {
						case "text":
							messageBuffer += chunk;
							// End thinking when regular content starts
							if (currentThinkingId) {
								response.thinkingProgress({ text: "", id: currentThinkingId });
								currentThinkingId = undefined;
								thoughtBuffer = "";
							}
							response.markdown(chunk);
							break;
						case "thought": {
							thoughtBuffer += chunk;
							if (!currentThinkingId) {
								currentThinkingId = `gemini_thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
							}
							const now = Date.now();
							if (now - lastThoughtUpdate > THOUGHT_DEBOUNCE_MS) {
								lastThoughtUpdate = now;
								response.thinkingProgress({
									text: thoughtBuffer,
									id: currentThinkingId,
								});
							}
							break;
						}
						case "tool":
							if (metadata?.toolCall) {
								const toolCall = metadata.toolCall;
								const toolCallId = toolCall.id || `tool_${Date.now()}`;
								const toolName = toolCall.title || "Tool";
								const toolNameLower = (
									toolCall.toolName ||
									toolCall.title ||
									""
								).toLowerCase();
								const params = toolCall.inputParameters || {};

								// Detect delegation requests from Gemini that specify an agent_name
								// and route the delegation using the chat API
								if (
									toolNameLower === "delegate_to_agent" ||
									toolNameLower === "chp_delegatetoagent" ||
									toolNameLower === "runsubagent"
								) {
									const agentName = params.agent_name || params.agentName;
									const prompt = params.prompt || params.message || params.text;
									if (agentName && prompt) {
										Logger.info(
											`[Gemini CLI Chat] Intercepted delegation to ${agentName}`,
										);
										// Route delegation using the chat API
										if (
											agentName.toLowerCase() === "gemini" ||
											agentName.toLowerCase() === "geminicli"
										) {
											vscode.commands.executeCommand(
												"chp.geminicli.invoke",
												prompt,
											);
										} else {
											const message = `@${agentName} ${prompt}`;
											vscode.commands
												.executeCommand(
													"workbench.panel.chat.view.copilot.focus",
												)
												.then(() => {
													vscode.commands
														.executeCommand(
															"workbench.action.chat.insertIntoInput",
															message,
														)
														.then(() => {
															// Try to submit
															const sendCommands = [
																"workbench.action.chat.sendMessage",
																"workbench.action.chat.accept",
																"workbench.action.chat.submit",
															];
															let sent = false;
															const trySend = (idx: number) => {
																if (idx >= sendCommands.length) {
																	if (!sent)
																		vscode.commands.executeCommand("type", {
																			text: "\n",
																		});
																	return;
																}
																vscode.commands
																	.executeCommand(sendCommands[idx])
																	.then(
																		() => {
																			sent = true;
																		},
																		() => {
																			trySend(idx + 1);
																		},
																	);
															};
															trySend(0);
														});
												});
										}
										// We still show the tool call in UI but it's handled
									}
								}

								// End thinking before tool calls
								if (currentThinkingId) {
									response.thinkingProgress({
										text: "",
										id: currentThinkingId,
									});
									currentThinkingId = undefined;
									thoughtBuffer = "";
								}

								let toolPart = activeToolCalls.get(toolCallId);
								if (!toolPart) {
									// First time seeing this tool call
									response.prepareToolInvocation(toolName);
									toolPart = new vscode.ChatToolInvocationPart(
										toolName,
										toolCallId,
										toolCall.status === "failed" ||
											toolCall.status === "rejected",
									);
									activeToolCalls.set(toolCallId, toolPart);
									response.push(toolPart);
								}

								// Update tool part properties
								toolPart.invocationMessage =
									this.formatToolInvocationMessage(toolCall);
								toolPart.isError =
									toolCall.status === "failed" ||
									toolCall.status === "rejected";

								if (toolCall.status === "completed") {
									toolPart.isComplete = true;
									if (
										toolNameLower === "run_shell_command" ||
										toolNameLower === "bash"
									) {
										toolPart.pastTenseMessage = new vscode.MarkdownString(
											`Ran command`,
										);
									} else if (
										toolNameLower === "read_file" ||
										toolNameLower === "read"
									) {
										toolPart.pastTenseMessage = new vscode.MarkdownString(
											`Read file`,
										);
									} else if (
										toolNameLower === "write_file" ||
										toolNameLower === "write"
									) {
										toolPart.pastTenseMessage = new vscode.MarkdownString(
											`Wrote file`,
										);
									} else if (
										toolNameLower === "replace" ||
										toolNameLower === "edit"
									) {
										toolPart.pastTenseMessage = new vscode.MarkdownString(
											`Edited file`,
										);
									} else {
										toolPart.pastTenseMessage = new vscode.MarkdownString(
											`Executed ${toolName}`,
										);
									}
								}

								// Handle terminal specific data
								const terminalItem = toolCall.contentItems?.find(
									(item: any) => item.type === "terminal",
								);
								if (
									terminalItem ||
									toolNameLower === "run_shell_command" ||
									toolNameLower === "bash"
								) {
									toolPart.toolSpecificData = {
										commandLine: {
											original: params.command || toolCall.title || "",
										},
										language: "shell",
									};
								}

								// If it's an update and has content, we might want to show it
								if (metadata.isUpdate && toolCall.contentItems) {
									const contentMarkdown = this.formatToolCallContent(
										toolCall.contentItems,
									);
									if (contentMarkdown) {
										// For terminal tools, we might want to avoid double printing if VS Code handles it
										if (!terminalItem) {
											response.markdown(contentMarkdown);
										}
									}
								}
							}
							break;
					}
				},
			);

			// Finalize thinking if still active
			if (currentThinkingId) {
				response.thinkingProgress({ text: "", id: currentThinkingId });
			}

			// If no chunks were streamed, use the full result
			if (!messageBuffer && !thoughtBuffer && result) {
				response.markdown(result);
			} else if (!messageBuffer && !thoughtBuffer && !result) {
				response.markdown("No response received from Gemini CLI.");
			}
		} catch (error) {
			Logger.error("[Gemini CLI Chat] Request failed:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			response.markdown(
				`**Error:** ${errorMessage}\n\nPlease ensure Gemini CLI is installed and authenticated. Run \`gemini auth login\` in your terminal first.`,
			);
		}
	}

	private formatToolInvocationMessage(toolCall: any): string {
		// Format invocation message based on tool type and kind
		// Similar to how Copilot Chat formats tool invocations
		const toolName = toolCall.toolName || toolCall.title || "Tool";
		const kind = toolCall.kind || "";
		const params = toolCall.inputParameters || {};

		const nameLower = toolName.toLowerCase();

		if (
			nameLower === "run_shell_command" ||
			nameLower === "bash" ||
			kind === "execute"
		) {
			const cmd = params.command || toolCall.title || "";
			return `Running command: \`${cmd}\``;
		} else if (nameLower === "read_file" || nameLower === "read") {
			return `Reading file: \`${params.file_path || params.filePath || toolCall.title}\``;
		} else if (nameLower === "write_file" || nameLower === "write") {
			return `Writing file: \`${params.file_path || params.filePath || toolCall.title}\``;
		} else if (
			nameLower === "replace" ||
			nameLower === "edit" ||
			kind === "edit"
		) {
			return `Editing file: \`${params.file_path || params.filePath || toolCall.title}\``;
		} else if (nameLower === "list_directory" || nameLower === "ls") {
			return `Listing directory: \`${params.dir_path || params.dirPath || params.directory || toolCall.title}\``;
		} else if (nameLower === "search_file_content" || nameLower === "grep") {
			return `Searching for: \`${params.pattern || toolCall.title}\``;
		} else if (
			nameLower === "google_web_search" ||
			nameLower === "web_search"
		) {
			return `Searching Google for: "${params.query || params.q || toolCall.title}"`;
		} else if (nameLower === "web_fetch") {
			return `Fetching URL: ${params.url || toolCall.title}`;
		} else if (
			nameLower === "delegate_to_agent" ||
			nameLower === "chp_delegatetoagent"
		) {
			return `Delegating to agent: ${params.agent_name || "sub-agent"}`;
		} else if (nameLower === "runsubagent") {
			return `Running subagent: ${params.agent_name || "sub-agent"}`;
		} else if (nameLower === "save_memory") {
			return `Saving memory: ${params.fact?.substring(0, 30) || "fact"}...`;
		} else {
			// Generic tool
			return `Using ${toolName}`;
		}
	}

	private formatToolCallContent(contentItems: any[]): string {
		if (!contentItems || contentItems.length === 0) {
			return "";
		}

		const parts: string[] = [];

		for (const item of contentItems) {
			switch (item.type) {
				case "terminal":
					if (item.data?.text) {
						parts.push(`\n\`\`\`shell\n${item.data.text}\n\`\`\`\n`);
					}
					break;
				case "diff":
					if (item.data?.diff) {
						parts.push(
							`\n**Changes in ${item.data.path}:**\n\`\`\`diff\n${item.data.diff}\n\`\`\`\n`,
						);
					} else {
						parts.push(
							`\n**File Changes:** ${item.data?.path || "Unknown file"}\n`,
						);
					}
					break;
				case "resource":
					parts.push(
						`\n**Resource:** ${item.data?.uri || "Unknown resource"}\n`,
					);
					break;
				case "text":
					if (item.data?.text) {
						parts.push(`\n${item.data.text}\n`);
					}
					break;
				case "image":
					parts.push(`\n**Image Content**\n`);
					break;
			}
		}

		return parts.join("\n");
	}

	private extractPrompt(request: vscode.ChatRequest): string {
		// Extract prompt from the request
		// ChatRequest may have different structures depending on VS Code version
		const req = request as any;

		// Try prompt property first
		if (req.prompt && typeof req.prompt === "string") {
			return req.prompt;
		}

		// Try command property
		if (req.command && typeof req.command === "string") {
			return req.command;
		}

		// Try text property
		if (req.text && typeof req.text === "string") {
			return req.text;
		}

		// Try message property
		if (req.message && typeof req.message === "string") {
			return req.message;
		}

		// Try to get from variables
		const variables = req.variables;
		if (variables && typeof variables === "object") {
			for (const [key, value] of Object.entries(variables)) {
				if (key === "prompt" || key === "message" || key === "text") {
					const varValue = value as any;
					if (varValue && typeof varValue === "object" && "value" in varValue) {
						const val = varValue.value;
						if (typeof val === "string") {
							return val;
						}
						if (val instanceof vscode.Uri) {
							// If it's a URI, we might need to read the file
							return val.fsPath;
						}
					}
					if (typeof varValue === "string") {
						return varValue;
					}
				}
			}
		}

		// Try to get from prompt references
		const promptReferences = req.promptReferences;
		if (Array.isArray(promptReferences) && promptReferences.length > 0) {
			// Get text from first reference if available
			const firstRef = promptReferences[0];
			if (firstRef && typeof firstRef === "object" && "value" in firstRef) {
				return String(firstRef.value);
			}
		}

		// Fallback: try to stringify the whole request (for debugging)
		Logger.warn(
			"[Gemini CLI Chat] Could not extract prompt from request:",
			JSON.stringify(req, null, 2),
		);
		return "Hello";
	}

	dispose(): void {
		if (this.acpClient) {
			this.acpClient.dispose();
			this.acpClient = null;
		}
		if (this.participant) {
			// Chat participants are automatically disposed by VS Code
			this.participant = null;
		}
	}

	static async createAndActivate(context: vscode.ExtensionContext): Promise<{
		participant: GeminiCliChatParticipant;
		disposables: vscode.Disposable[];
	}> {
		const chatParticipant = new GeminiCliChatParticipant(context);
		await chatParticipant.initialize();

		const disposables: vscode.Disposable[] = [
			{
				dispose: () => chatParticipant.dispose(),
			},
		];

		return { participant: chatParticipant, disposables };
	}
}
