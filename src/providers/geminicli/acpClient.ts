/*---------------------------------------------------------------------------------------------
 *  ACP (Agent Communication Protocol) Client for Gemini CLI using official SDK
 *--------------------------------------------------------------------------------------------*/

import * as child_process from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import * as vscode from "vscode";
import { Logger } from "../../utils/logger";

interface ToolCallInfo {
	id: string;
	title: string;
	status: string;
	kind?: string;
	toolName?: string;
	inputParameters?: any;
	content?: string; // Summary of tool call content
	contentItems?: ToolCallContentItem[]; // Detailed content items
}

interface ToolCallContentItem {
	type: "terminal" | "diff" | "resource" | "text" | "image";
	data?: any; // Type-specific data
}

export class AcpClient implements acp.Client {
	private connection: acp.ClientSideConnection | null = null;
	private process: child_process.ChildProcess | null = null;
	private sessions: Map<string, string> = new Map(); // Map workspace path to session ID
	private isInitialized = false;
	private messageChunks: string[] = [];
	private thoughtChunks: string[] = [];
	private toolCalls: Map<string, ToolCallInfo> = new Map();
	private currentResponseCallback:
		| ((
				chunk: string,
				type: "text" | "thought" | "tool",
				metadata?: any,
		  ) => void)
		| null = null;

	constructor(
		private readonly command: string,
		private readonly args: string[] = [],
	) {}

	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		try {
			Logger.debug(
				`[ACP] Starting Gemini CLI: ${this.command} ${this.args.join(" ")}`,
			);

			// Get workspace path for proper context
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

			// Spawn Gemini CLI process with --experimental-acp flag
			// Set cwd to workspace path if available, so Gemini CLI operates in the correct directory
			this.process = child_process.spawn(this.command, this.args, {
				stdio: ["pipe", "pipe", "pipe"],
				shell: process.platform === "win32",
				cwd: workspacePath || process.cwd(), // Set working directory to workspace or fallback to current directory
			});

			// Handle stderr for debugging
			this.process.stderr?.on("data", (data: Buffer) => {
				const message = data.toString();
				Logger.debug(`[ACP] Gemini CLI stderr: ${message}`);
			});

			this.process.on("error", (error) => {
				Logger.error("[ACP] Gemini CLI process error:", error);
				throw error;
			});

			this.process.on("exit", (code, signal) => {
				Logger.debug(
					`[ACP] Gemini CLI process exited: code=${code}, signal=${signal}`,
				);
				this.isInitialized = false;
			});

			// Create streams for ACP communication
			const input = Writable.toWeb(this.process.stdin!);
			const output = Readable.toWeb(
				this.process.stdout!,
			) as ReadableStream<Uint8Array>;

			// Create ND-JSON stream for ACP
			const stream = acp.ndJsonStream(input, output);

			// Create client-side connection
			this.connection = new acp.ClientSideConnection((_agent) => this, stream);

			// Initialize the connection
			const initResult = await this.connection.initialize({
				protocolVersion: acp.PROTOCOL_VERSION,
				clientCapabilities: {
					fs: {
						readTextFile: false,
						writeTextFile: false,
					},
				},
			});

			Logger.debug(
				`[ACP] Initialized with protocol version: ${initResult.protocolVersion}`,
			);

			this.isInitialized = true;
			Logger.info("[ACP] Gemini CLI ACP client initialized successfully");
		} catch (error) {
			Logger.error("[ACP] Failed to initialize Gemini CLI:", error);
			this.dispose();
			throw error;
		}
	}

	async sendPrompt(
		prompt: string,
		workspacePath?: string,
		onChunk?: (
			chunk: string,
			type: "text" | "thought" | "tool",
			metadata?: any,
		) => void,
	): Promise<string> {
		if (!this.connection) {
			await this.initialize();
		}

		if (!this.connection) {
			throw new Error("ACP connection not initialized");
		}

		try {
			// Use workspace path or fallback to process.cwd()
			const cwd = workspacePath || process.cwd();

			// Get or create session for this workspace
			let sessionId = this.sessions.get(cwd);
			if (!sessionId) {
				Logger.debug(`[ACP] Creating new session for workspace: ${cwd}`);
				const sessionResult = await this.connection.newSession({
					cwd: cwd,
					mcpServers: [],
				});
				sessionId = sessionResult.sessionId || "";
				if (!sessionId) {
					throw new Error("Failed to create session: No session ID returned");
				}
				this.sessions.set(cwd, sessionId);
				Logger.debug(
					`[ACP] Created session: ${sessionId} for workspace: ${cwd}`,
				);
			} else {
				Logger.debug(
					`[ACP] Using existing session: ${sessionId} for workspace: ${cwd}`,
				);
			}

			// Clear previous chunks and set callback
			this.messageChunks = [];
			this.thoughtChunks = [];
			this.toolCalls.clear();
			this.currentResponseCallback = onChunk || null;

			// Send prompt to the agent
			const promptResult = await this.connection.prompt({
				sessionId: sessionId,
				prompt: [
					{
						type: "text",
						text: prompt,
					},
				],
			});

			Logger.debug(
				`[ACP] Prompt completed with stop reason: ${promptResult.stopReason}`,
			);

			// Clear callback
			this.currentResponseCallback = null;

			// Return collected chunks
			return this.messageChunks.join("");
		} catch (error) {
			Logger.error("[ACP] Failed to send prompt:", error);
			this.currentResponseCallback = null;
			throw error;
		}
	}

	// Implement acp.Client interface methods
	async requestPermission(
		params: acp.RequestPermissionRequest,
	): Promise<acp.RequestPermissionResponse> {
		Logger.debug(`[ACP] Permission requested: ${params.toolCall.title}`);

		// In VS Code Chat, we can't easily show a modal dialog from within the handler
		// but we can log it and maybe in the future use a custom UI.
		// For now, we still auto-approve but with a notification in the log.
		Logger.info(
			`[ACP] Auto-approving tool permission: ${params.toolCall.title}`,
		);

		return {
			outcome: {
				outcome: "selected",
				optionId: params.options[0]?.optionId || "allow_once",
			},
		};
	}

	async sessionUpdate(params: acp.SessionNotification): Promise<void> {
		const update = params.update;

		switch (update.sessionUpdate) {
			case "agent_message_chunk":
				if (
					update.content &&
					"type" in update.content &&
					update.content.type === "text"
				) {
					const text = update.content.text;
					this.messageChunks.push(text);
					// Stream chunk to callback if available
					if (this.currentResponseCallback) {
						this.currentResponseCallback(text, "text");
					}
					Logger.debug(
						`[ACP] Agent message chunk: ${text.substring(0, 50)}...`,
					);
				}
				break;
			case "agent_thought_chunk":
				if (
					update.content &&
					"type" in update.content &&
					update.content.type === "text"
				) {
					const text = update.content.text;
					this.thoughtChunks.push(text);
					// Thoughts can also be streamed with special formatting
					if (this.currentResponseCallback) {
						this.currentResponseCallback(text, "thought");
					}
				}
				break;
			case "tool_call":
				{
					// Access tool call properties safely (ACP SDK types may vary)
					const toolCallUpdate = update as any;
					const toolCallId =
						toolCallUpdate.toolCallId || toolCallUpdate.tool_call_id || "";
					const title = toolCallUpdate.title || "Unknown Tool";
					const status = toolCallUpdate.status || "pending";
					const kind = toolCallUpdate.kind || undefined;
					const toolName =
						toolCallUpdate.toolName || toolCallUpdate.tool_name || undefined;
					const inputParameters =
						toolCallUpdate.inputParameters ||
						toolCallUpdate.input_parameters ||
						undefined;

					const toolCall: ToolCallInfo = {
						id: toolCallId,
						title: title,
						status: status,
						kind: kind,
						toolName: toolName,
						inputParameters: inputParameters,
					};
					this.toolCalls.set(toolCallId, toolCall);

					Logger.debug(
						`[ACP] Tool call: ${toolCall.title} (${toolCall.status})`,
					);

					if (this.currentResponseCallback) {
						// Send tool call info to callback - will be handled by ChatParticipant using proper API
						this.currentResponseCallback("", "tool", { toolCall });
					}
				}
				break;
			case "tool_call_update":
				{
					// Access tool call update properties safely
					const toolCallUpdate = update as any;
					const toolCallId =
						toolCallUpdate.toolCallId || toolCallUpdate.tool_call_id || "";
					const existingToolCall = this.toolCalls.get(toolCallId);

					if (existingToolCall) {
						if (toolCallUpdate.status) {
							existingToolCall.status = toolCallUpdate.status;
						}
						if (toolCallUpdate.title) {
							existingToolCall.title = toolCallUpdate.title;
						}
						if (toolCallUpdate.kind) {
							existingToolCall.kind = toolCallUpdate.kind;
						}
						if (toolCallUpdate.content) {
							// Extract content summary and detailed items
							const contentSummary = this.extractContentSummary(
								toolCallUpdate.content,
							);
							if (contentSummary) {
								existingToolCall.content = contentSummary;
							}
							// Extract detailed content items for better UI rendering
							existingToolCall.contentItems = this.extractContentItems(
								toolCallUpdate.content,
							);
						}

						this.toolCalls.set(toolCallId, existingToolCall);
					}

					const updateStatus = toolCallUpdate.status || "updated";
					Logger.debug(
						`[ACP] Tool call update: ${toolCallId} - ${updateStatus}`,
					);

					if (this.currentResponseCallback && existingToolCall) {
						// Send tool call update info - ChatParticipant will handle display
						this.currentResponseCallback("", "tool", {
							toolCall: existingToolCall,
							isUpdate: true,
						});
					}
				}
				break;
			default:
				Logger.debug(`[ACP] Session update: ${update.sessionUpdate}`);
				break;
		}
	}

	private extractContentSummary(content: any[]): string | undefined {
		if (!content || content.length === 0) {
			return undefined;
		}

		const summaries: string[] = [];

		for (const item of content) {
			if (item.type === "content" && item.content) {
				if (item.content.type === "text") {
					const text = item.content.text || "";
					if (text.length > 100) {
						summaries.push(`${text.substring(0, 100)}...`);
					} else {
						summaries.push(text);
					}
				} else if (item.content.type === "resource_link") {
					summaries.push(`Resource: ${item.content.uri || "unknown"}`);
				} else if (item.content.type === "image") {
					summaries.push("Image content");
				}
			} else if (item.type === "diff") {
				summaries.push(`Diff: ${item.path || "unknown file"}`);
			} else if (item.type === "terminal") {
				const terminalId = item.terminal_id || item.terminalId || "unknown";
				const text = item.text || "";
				summaries.push(
					`Terminal (${terminalId}): ${text.substring(0, 50)}${text.length > 50 ? "..." : ""}`,
				);
			}
		}

		return summaries.length > 0 ? summaries.join("\n") : undefined;
	}

	private extractContentItems(content: any[]): ToolCallContentItem[] {
		if (!content || content.length === 0) {
			return [];
		}

		const items: ToolCallContentItem[] = [];

		for (const item of content) {
			if (item.type === "content" && item.content) {
				if (item.content.type === "text") {
					items.push({
						type: "text",
						data: { text: item.content.text },
					});
				} else if (item.content.type === "resource_link") {
					items.push({
						type: "resource",
						data: { uri: item.content.uri },
					});
				} else if (item.content.type === "image") {
					items.push({
						type: "image",
						data: item.content,
					});
				}
			} else if (item.type === "diff") {
				items.push({
					type: "diff",
					data: { path: item.path || "unknown file", diff: item.diff },
				});
			} else if (item.type === "terminal") {
				items.push({
					type: "terminal",
					data: {
						terminalId: item.terminal_id || item.terminalId || "unknown",
						text: item.text || "",
						exitCode: item.exit_code || item.exitCode,
					},
				});
			}
		}

		return items;
	}

	async writeTextFile(
		params: acp.WriteTextFileRequest,
	): Promise<acp.WriteTextFileResponse> {
		Logger.debug(`[ACP] Write text file requested: ${params.path}`);
		return {};
	}

	async readTextFile(
		params: acp.ReadTextFileRequest,
	): Promise<acp.ReadTextFileResponse> {
		Logger.debug(`[ACP] Read text file requested: ${params.path}`);
		return {
			content: "",
		};
	}

	dispose(): void {
		if (this.process) {
			this.process.kill();
			this.process = null;
		}
		this.connection = null;
		this.sessions.clear();
		this.isInitialized = false;
	}
}
