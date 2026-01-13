/*---------------------------------------------------------------------------------------------
 *  Mistral AI SDK Handler
 *  Implements streaming chat completion using Mistral AI format
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { AccountQuotaCache } from "../../accounts/accountQuotaCache";
import type { ModelConfig } from "../../types/sharedTypes";
import { ApiKeyManager } from "../../utils/apiKeyManager";
import { ConfigManager } from "../../utils/configManager";
import { Logger } from "../../utils/logger";
import { VersionManager } from "../../utils/versionManager";

/**
 * Mistral Message types
 */
export type MistralRole = "system" | "user" | "assistant" | "tool";

export interface MistralToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface MistralMessage {
	role: MistralRole;
	content: string | null;
	tool_calls?: MistralToolCall[];
	tool_call_id?: string;
	name?: string;
}

/**
 * Mistral Stream types
 */
export interface MistralStreamDelta {
	role?: MistralRole;
	content?: string | null;
	tool_calls?: Array<{
		index?: number;
		id?: string;
		type?: "function";
		function?: {
			name?: string;
			arguments?: string;
		};
	}>;
}

export interface MistralStreamChoice {
	index: number;
	delta: MistralStreamDelta;
	finish_reason: string | null;
}

export interface MistralStreamChunk {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: MistralStreamChoice[];
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/**
 * Mistral AI Handler
 * Implements streaming chat completion using Mistral AI API format
 */
export class MistralHandler {
	private toolCallIdMapping = new Map<string, string>();
	private reverseToolCallIdMapping = new Map<string, string>();
	private quotaCache: AccountQuotaCache;

	constructor(
		private provider: string,
		private displayName: string,
		private baseURL: string = "https://api.mistral.ai/v1",
	) {
		this.quotaCache = AccountQuotaCache.getInstance();
	}

	/**
	 * Generate a valid VS Code tool call ID (alphanumeric, exactly 9 characters)
	 */
	private generateToolCallId(): string {
		const chars =
			"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
		let id = "";
		for (let i = 0; i < 9; i++) {
			id += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return id;
	}

	/**
	 * Get or create a VS Code-compatible tool call ID from a Mistral tool call ID
	 */
	private getOrCreateVsCodeToolCallId(mistralId: string): string {
		if (this.reverseToolCallIdMapping.has(mistralId)) {
			return this.reverseToolCallIdMapping.get(mistralId)!;
		}
		const vsCodeId = this.generateToolCallId();
		this.toolCallIdMapping.set(vsCodeId, mistralId);
		this.reverseToolCallIdMapping.set(mistralId, vsCodeId);
		return vsCodeId;
	}

	/**
	 * Get the original Mistral tool call ID from a VS Code tool call ID
	 */
	private getMistralToolCallId(vsCodeId: string): string | undefined {
		return this.toolCallIdMapping.get(vsCodeId);
	}

	/**
	 * Clear tool call ID mappings
	 */
	private clearToolCallIdMappings(): void {
		this.toolCallIdMapping.clear();
		this.reverseToolCallIdMapping.clear();
	}

	/**
	 * Handle chat completion request
	 */
	async handleRequest(
		model: vscode.LanguageModelChatInformation,
		modelConfig: ModelConfig,
		messages: readonly vscode.LanguageModelChatMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		token: vscode.CancellationToken,
		accountId?: string,
	): Promise<void> {
		this.clearToolCallIdMappings();
		Logger.debug(
			`${model.name} starting to process Mistral request${accountId ? ` (Account ID: ${accountId})` : ""}`,
		);

		try {
			// Check if API key is provided in modelConfig (e.g. for Managed accounts)
			let apiKey = modelConfig.apiKey;
			if (!apiKey) {
				apiKey = await ApiKeyManager.getApiKey(this.provider);
			}

			if (!apiKey) {
				throw new Error(`Missing ${this.displayName} API key`);
			}

			const baseURL = modelConfig.baseUrl || this.baseURL;
			const requestModel = modelConfig.model || model.id;

			const mistralMessages = this.convertMessagesToMistral(messages);
			const mistralTools =
				options.tools && options.tools.length > 0
					? this.convertToolsToMistral([...options.tools])
					: undefined;

			const body = {
				model: requestModel,
				messages: mistralMessages,
				tools: mistralTools,
				tool_choice: mistralTools
					? options.toolMode === vscode.LanguageModelChatToolMode.Required
						? "any"
						: "auto"
					: undefined,
				max_tokens: ConfigManager.getMaxTokensForModel(model.maxOutputTokens),
				temperature: ConfigManager.getTemperature(),
				top_p: ConfigManager.getTopP(),
				stream: true,
			};

			const response = await fetch(`${baseURL}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
					"User-Agent": VersionManager.getUserAgent("Mistral"),
				},
				body: JSON.stringify(body),
				signal: this.createAbortSignal(token),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Mistral API error: ${response.status} ${response.statusText} - ${errorText}`,
				);
			}

			if (!response.body) {
				throw new Error("Mistral response body is empty");
			}

			await this.processStream(response.body, progress, token, model.name);

			// Record success if accountId provided
			if (accountId) {
				await this.quotaCache.recordSuccess(accountId, this.provider);
			}
		} catch (error) {
			// Record failure if accountId provided
			if (accountId && !(error instanceof vscode.CancellationError)) {
				if (this.isQuotaError(error)) {
					await this.quotaCache.markQuotaExceeded(accountId, this.provider, {
						error: error instanceof Error ? error.message : String(error),
						affectedModel: model.id,
					});
				} else {
					await this.quotaCache.recordFailure(
						accountId,
						this.provider,
						error instanceof Error ? error.message : String(error),
					);
				}
			}

			if (error instanceof vscode.CancellationError) {
				Logger.info(`${model.name} request cancelled by user`);
				throw error;
			}
			Logger.error(`${model.name} Mistral request failed: ${error}`);
			throw error;
		}
	}

	private createAbortSignal(token: vscode.CancellationToken): AbortSignal {
		const controller = new AbortController();
		token.onCancellationRequested(() => controller.abort());
		return controller.signal;
	}

	private async processStream(
		body: ReadableStream<Uint8Array>,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		token: vscode.CancellationToken,
		modelName: string,
	): Promise<void> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		const toolCallBuffers = new Map<
			string,
			{ name?: string; argsText: string }
		>();
		const emittedToolCalls = new Set<string>();
		let hasReceivedContent = false;
		let hasThinkingContent = false;

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done || token.isCancellationRequested) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmedLine = line.trim();
					if (!trimmedLine || !trimmedLine.startsWith("data:")) {
						continue;
					}

					const data = trimmedLine.slice(5).trim();
					if (data === "[DONE]") {
						break;
					}

					try {
						const chunk: MistralStreamChunk = JSON.parse(data);
						if (chunk.choices && chunk.choices.length > 0) {
							const choice = chunk.choices[0];
							const delta = choice.delta;

							// Handle text content
							if (delta.content) {
								progress.report(
									new vscode.LanguageModelTextPart(delta.content),
								);
								if (delta.content.trim().length > 0) {
									hasReceivedContent = true;
								}
							}

							// Handle tool calls
							if (delta.tool_calls) {
								for (const toolCall of delta.tool_calls) {
									const mistralId = toolCall.id;
									if (!mistralId) {
										continue;
									}

									const vsCodeId = this.getOrCreateVsCodeToolCallId(mistralId);
									const buf = toolCallBuffers.get(vsCodeId) ?? { argsText: "" };

									if (toolCall.function?.name) {
										buf.name = toolCall.function.name;
									}
									if (toolCall.function?.arguments) {
										buf.argsText += toolCall.function.arguments;
									}

									toolCallBuffers.set(vsCodeId, buf);

									// Try to emit tool call if we have name and valid JSON args
									if (
										!emittedToolCalls.has(vsCodeId) &&
										buf.name &&
										buf.argsText
									) {
										try {
											const parsedArgs = JSON.parse(buf.argsText);
											progress.report(
												new vscode.LanguageModelToolCallPart(
													vsCodeId,
													buf.name,
													parsedArgs,
												),
											);
											emittedToolCalls.add(vsCodeId);
											hasReceivedContent = true;
										} catch {
											// Buffer more
										}
									}
								}
							}

							// Handle finish reason
							if (
								choice.finish_reason === "tool_calls" ||
								choice.finish_reason === "stop"
							) {
								for (const [vsCodeId, buf] of toolCallBuffers) {
									if (!emittedToolCalls.has(vsCodeId) && buf.name) {
										let parsedArgs = {};
										try {
											parsedArgs = buf.argsText ? JSON.parse(buf.argsText) : {};
										} catch {
											parsedArgs = { raw: buf.argsText };
										}
										progress.report(
											new vscode.LanguageModelToolCallPart(
												vsCodeId,
												buf.name,
												parsedArgs,
											),
										);
										emittedToolCalls.add(vsCodeId);
										hasReceivedContent = true;
									}
								}
							}
						}

						if (chunk.usage) {
							Logger.info(
								`${modelName} Token usage: ${chunk.usage.prompt_tokens}+${chunk.usage.completion_tokens}=${chunk.usage.total_tokens}`,
							);
						}
					} catch (e) {
						Logger.trace(`Failed to parse Mistral chunk: ${e}`);
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		// Only add <think/> placeholder if thinking content was output but no content was output
		if (hasThinkingContent && !hasReceivedContent) {
			progress.report(new vscode.LanguageModelTextPart("<think/>"));
			Logger.warn(
				`${modelName} end of message stream has only thinking content and no text content, added <think/> placeholder as output`,
			);
		}
	}

	private convertMessagesToMistral(
		messages: readonly vscode.LanguageModelChatMessage[],
	): MistralMessage[] {
		const result: MistralMessage[] = [];
		for (const msg of messages) {
			const role = this.toMistralRole(msg.role);
			const content = this.extractTextContent(msg.content);

			const mistralMsg: MistralMessage = {
				role,
				content: content || null,
			};

			// Handle tool calls in assistant message
			if (msg.role === vscode.LanguageModelChatMessageRole.Assistant) {
				const toolCalls: MistralToolCall[] = [];
				for (const part of msg.content) {
					if (part instanceof vscode.LanguageModelToolCallPart) {
						let mistralId = this.getMistralToolCallId(part.callId);
						if (!mistralId) {
							mistralId = this.generateToolCallId();
							this.toolCallIdMapping.set(part.callId, mistralId);
							this.reverseToolCallIdMapping.set(mistralId, part.callId);
						}
						toolCalls.push({
							id: mistralId,
							type: "function",
							function: {
								name: part.name,
								arguments: JSON.stringify(part.input),
							},
						});
					}
				}
				if (toolCalls.length > 0) {
					mistralMsg.tool_calls = toolCalls;
				}
			}

			// Handle tool results
			if (msg.role === vscode.LanguageModelChatMessageRole.User) {
				for (const part of msg.content) {
					if (part instanceof vscode.LanguageModelToolResultPart) {
						let mistralId = this.getMistralToolCallId(part.callId);
						if (!mistralId) {
							mistralId = this.generateToolCallId();
							this.toolCallIdMapping.set(part.callId, mistralId);
							this.reverseToolCallIdMapping.set(mistralId, part.callId);
						}
						const toolResultContent = this.extractTextContent(part.content);
						result.push({
							role: "tool",
							content: toolResultContent || "",
							tool_call_id: mistralId,
							name: undefined, // Mistral doesn't strictly require name here if tool_call_id is present
						});
					}
				}
			}

			// Only add the message if it has content or tool calls (except for tool role which is handled above)
			if (
				mistralMsg.role !== "tool" &&
				(mistralMsg.content ||
					(mistralMsg.tool_calls && mistralMsg.tool_calls.length > 0))
			) {
				result.push(mistralMsg);
			}
		}
		return result;
	}

	private toMistralRole(
		role: vscode.LanguageModelChatMessageRole,
	): MistralRole {
		switch (role) {
			case vscode.LanguageModelChatMessageRole.System:
				return "system";
			case vscode.LanguageModelChatMessageRole.User:
				return "user";
			case vscode.LanguageModelChatMessageRole.Assistant:
				return "assistant";
			default:
				return "user";
		}
	}

	private isQuotaError(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}
		const msg = error.message;
		return (
			msg.startsWith("Quota exceeded") ||
			msg.startsWith("Rate limited") ||
			msg.includes("429")
		);
	}

	private extractTextContent(content: readonly any[]): string | null {
		const textParts = content
			.filter((part) => part instanceof vscode.LanguageModelTextPart)
			.map((part) => (part as vscode.LanguageModelTextPart).value);
		return textParts.length > 0 ? textParts.join("\n") : null;
	}

	private convertToolsToMistral(tools: vscode.LanguageModelChatTool[]): any[] {
		return tools.map((tool) => ({
			type: "function",
			function: {
				name: tool.name,
				description: tool.description || "",
				parameters: tool.inputSchema || { type: "object", properties: {} },
			},
		}));
	}
}
