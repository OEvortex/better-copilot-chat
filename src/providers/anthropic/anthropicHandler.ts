/*---------------------------------------------------------------------------------------------
 *  Anthropic SDK Handler
 *  Processes model requests using Anthropic SDK
 *--------------------------------------------------------------------------------------------*/

import Anthropic from "@anthropic-ai/sdk";
import * as vscode from "vscode";
import { AccountQuotaCache } from "../../accounts/accountQuotaCache";
import type { ModelConfig } from "../../types/sharedTypes";
import { ApiKeyManager } from "../../utils/apiKeyManager";
import { ConfigManager } from "../../utils/configManager";
import { Logger } from "../../utils/logger";
import { VersionManager } from "../../utils/versionManager";
import { OpenAIHandler } from "../openai/openaiHandler";
import {
	apiMessageToAnthropicMessage,
	convertToAnthropicTools,
} from "./anthropicConverter";

/**
 * Anthropic compatible handler class
 * Receives complete provider configuration, uses Anthropic SDK to handle streaming chat completion
 */
export class AnthropicHandler {
	private quotaCache: AccountQuotaCache;

	constructor(
		public readonly provider: string,
		public readonly displayName: string,
		private readonly baseURL?: string,
	) {
		// provider, displayName and baseURL are passed by the caller
		this.quotaCache = AccountQuotaCache.getInstance();
	}

	/**
	 * Create Anthropic client
	 * Create a new client instance every time, consistent with OpenAIHandler
	 */
	private async createAnthropicClient(
		modelConfig?: ModelConfig,
		accountId?: string,
	): Promise<Anthropic> {
		const providerKey = modelConfig?.provider || this.provider;
		const currentApiKey = await ApiKeyManager.getApiKey(providerKey);
		if (!currentApiKey) {
			throw new Error(`Missing ${this.displayName} API key`);
		}

		// Use model configuration baseUrl or provider's default baseURL
		let baseUrl = modelConfig?.baseUrl || this.baseURL;
		if (providerKey === "minimax-coding") {
			// Override baseUrl settings for MiniMax international site
			const endpoint = ConfigManager.getMinimaxEndpoint();
			if (baseUrl && endpoint === "minimax.io") {
				baseUrl = baseUrl.replace("api.minimaxi.com", "api.minimax.io");
			}
		}
		if (providerKey === "zhipu") {
			// Override baseUrl settings for Zhipu AI international site
			const endpoint = ConfigManager.getZhipuEndpoint();
			if (baseUrl && endpoint === "api.z.ai") {
				baseUrl = baseUrl.replace("open.bigmodel.cn", "api.z.ai");
			}
		}

		// Build default headers, including provider-level and model-level customHeader
		const defaultHeaders: Record<string, string> = {
			"User-Agent": VersionManager.getUserAgent(this.provider),
		};

		// Process model-level customHeader
		const processedCustomHeader = ApiKeyManager.processCustomHeader(
			modelConfig?.customHeader,
			currentApiKey,
		);
		if (Object.keys(processedCustomHeader).length > 0) {
			Object.assign(defaultHeaders, processedCustomHeader);
			Logger.debug(
				`${this.displayName} apply custom headers: ${JSON.stringify(modelConfig?.customHeader)}`,
			);
		}

		const client = new Anthropic({
			apiKey: currentApiKey,
			baseURL: baseUrl,
			authToken: currentApiKey, // Fix Minimax error: Please carry the API secret key in the 'Authorization' field of the request header
			defaultHeaders: defaultHeaders,
		});

		Logger.info(
			`${this.displayName} Anthropic compatible client created${accountId ? ` for account ${accountId}` : ""}`,
		);
		return client;
	}

	/**
	 * Process Anthropic SDK request
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
		try {
			const client = await this.createAnthropicClient(modelConfig, accountId);
			const { messages: anthropicMessages, system } =
				apiMessageToAnthropicMessage(modelConfig, messages);

			// Prepare tool definitions
			const tools: Anthropic.Messages.Tool[] = options.tools
				? convertToAnthropicTools([...options.tools])
				: [];

			// Use model field from model configuration, if none, use model.id
			const modelId = modelConfig.model || model.id;

			const createParams: Anthropic.MessageCreateParamsStreaming = {
				model: modelId,
				max_tokens: ConfigManager.getMaxTokensForModel(model.maxOutputTokens),
				messages: anthropicMessages,
				stream: true,
				temperature: ConfigManager.getTemperature(),
				top_p: ConfigManager.getTopP(),
			};

			// Merge extraBody parameters (if any)
			if (modelConfig.extraBody) {
				// Filter out core parameters that cannot be modified
				const filteredExtraBody = OpenAIHandler.filterExtraBodyParams(
					modelConfig.extraBody,
				);
				Object.assign(createParams, filteredExtraBody);
				if (Object.keys(filteredExtraBody).length > 0) {
					Logger.trace(
						`${model.name} merged extraBody parameters: ${JSON.stringify(filteredExtraBody)}`,
					);
				}
			}

			// Add system message (if any)
			if (system.text) {
				createParams.system = [system];
			}

			// Add tools (if any)
			if (tools.length > 0) {
				createParams.tools = tools;
			}

			Logger.debug(
				`[${model.name}] Send Anthropic API request, containing ${anthropicMessages.length} messages, using model: ${modelId}`,
			);

			const stream = await client.messages.create(createParams);

			// Use full stream processing function
			const result = await this.handleAnthropicStream(
				stream,
				progress,
				token,
				modelConfig,
			);
			if (accountId) {
				this.quotaCache.recordSuccess(accountId, this.provider).catch(() => {});
			}
			Logger.info(`[${model.name}] Anthropic request completed`, result.usage);
		} catch (error) {
			if (accountId && !(error instanceof vscode.CancellationError)) {
				if (this.isQuotaError(error)) {
					this.quotaCache
						.markQuotaExceeded(accountId, this.provider, {
							error: error instanceof Error ? error.message : String(error),
							affectedModel: model.id,
						})
						.catch(() => {});
				} else {
					this.quotaCache
						.recordFailure(
							accountId,
							this.provider,
							error instanceof Error ? error.message : String(error),
						)
						.catch(() => {});
				}
			}

			Logger.error(`[${model.name}] Anthropic SDK error:`, error);

			// Provide detailed error message
			let errorMessage = `[${model.name}] Anthropic API call failed`;
			if (error instanceof Error) {
				if (error.message.includes("401")) {
					errorMessage += ": Invalid API key, please check configuration";
				} else if (error.message.includes("429")) {
					errorMessage += ": Request rate limit, please try again later";
				} else if (error.message.includes("500")) {
					errorMessage += ": Server error, please try again later";
				} else {
					errorMessage += `: ${error.message}`;
				}
			}

			progress.report(new vscode.LanguageModelTextPart(errorMessage));
			throw error;
		}
	}

	/**
	 * Handle Anthropic streaming response
	 * Refer to official documentation: https://docs.anthropic.com/en/api/messages-streaming
	 * Refer to official implementation: https://github.com/microsoft/vscode-copilot-chat/blob/main/src/extension/byok/vscode-node/anthropicProvider.ts
	 */
	private async handleAnthropicStream(
		stream: AsyncIterable<Anthropic.Messages.MessageStreamEvent>,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		token: vscode.CancellationToken,
		modelConfig?: ModelConfig,
	): Promise<{
		usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
	}> {
		let pendingToolCall:
			| { toolId?: string; name?: string; jsonInput?: string }
			| undefined;
		// let pendingServerToolCall: { toolId?: string; name?: string; jsonInput?: string; type?: string } | undefined; // web_search not supported yet
		let pendingThinking: { thinking?: string; signature?: string } | undefined;
		let pendingRedactedThinking: { data: string } | undefined;
		let usage:
			| { inputTokens: number; outputTokens: number; totalTokens: number }
			| undefined;

		// Maximum length of thinking content cache, report when reached
		const MAX_THINKING_BUFFER_LENGTH = 20;
		// ID of the chain of thought currently being output
		let currentThinkingId: string | null = null;
		// Track whether valid text content has been output
		let hasOutputContent = false;
		// Mark whether thinking content was output
		let hasThinkingContent = false;
		// Text output buffer to avoid frequent progressive renders due to small fragments
		let pendingTextBuffer = "";
		let lastTextFlushTime = 0;
		const TEXT_BUFFER_WORD_THRESHOLD = 20;
		const TEXT_BUFFER_CHAR_THRESHOLD = 160;
		const TEXT_BUFFER_MAX_DELAY_MS = 200;

		const countWords = (text: string) => {
			const matches = text.trim().match(/\S+/g);
			return matches ? matches.length : 0;
		};

		const flushTextBuffer = (force: boolean) => {
			if (!pendingTextBuffer) {
				return;
			}
			const wordCount = countWords(pendingTextBuffer);
			const now = Date.now();
			const timeSinceFlush = now - lastTextFlushTime;

			if (
				force ||
				wordCount >= TEXT_BUFFER_WORD_THRESHOLD ||
				pendingTextBuffer.length >= TEXT_BUFFER_CHAR_THRESHOLD ||
				timeSinceFlush >= TEXT_BUFFER_MAX_DELAY_MS
			) {
				progress.report(new vscode.LanguageModelTextPart(pendingTextBuffer));
				pendingTextBuffer = "";
				lastTextFlushTime = now;
			}
		};

		Logger.debug("Start processing Anthropic streaming response");

		try {
			for await (const chunk of stream) {
				if (token.isCancellationRequested) {
					Logger.debug("Stream processing cancelled");
					flushTextBuffer(true);
					// Use unified method to handle remaining thinking content
					this.reportRemainingThinkingContent(
						progress,
						pendingThinking,
						currentThinkingId,
						"stream cancellation",
					);
					break;
				}

				// Process special type - web_search_tool_result (not supported yet)
				/*
                if (
                    chunk.type === 'content_block_start' &&
                    'content_block' in chunk &&
                    chunk.content_block.type === 'web_search_tool_result'
                ) {
                    if (!pendingServerToolCall || !pendingServerToolCall.toolId) {
                        Logger.warn('Received web_search_tool_result but no pending server tool call');
                        continue;
                    }

                    const resultBlock = chunk.content_block as Anthropic.Messages.WebSearchToolResultBlock;
                    // Handle potential errors in web search
                    if (!Array.isArray(resultBlock.content)) {
                        Logger.error(
                            `Web search error: ${(resultBlock.content as Anthropic.Messages.WebSearchToolResultError).error_code}`
                        );
                        continue;
                    }

                    const results = resultBlock.content.map((result: Anthropic.Messages.WebSearchResultBlock) => ({
                        type: 'web_search_result',
                        url: result.url,
                        title: result.title,
                        page_age: result.page_age,
                        encrypted_content: result.encrypted_content
                    }));

                    // Format according to Anthropic's web_search_tool_result specification
                    const toolResult = {
                        type: 'web_search_tool_result',
                        tool_use_id: pendingServerToolCall.toolId,
                        content: results
                    };

                    const searchResults = JSON.stringify(toolResult, null, 2);

                    // Report search results to user
                    progress.report(
                        new vscode.LanguageModelToolResultPart(pendingServerToolCall.toolId!, [
                            new vscode.LanguageModelTextPart(searchResults)
                        ])
                    );

                    pendingServerToolCall = undefined;
                    continue;
                }
                */

				// Handle different event types
				switch (chunk.type) {
					case "message_start":
						// Message start - collect initial usage statistics
						usage = {
							inputTokens:
								(chunk.message.usage.input_tokens ?? 0) +
								(chunk.message.usage.cache_creation_input_tokens ?? 0) +
								(chunk.message.usage.cache_read_input_tokens ?? 0),
							outputTokens: 1,
							totalTokens: -1,
						};
						Logger.trace(
							`Message stream start - initial input tokens: ${usage.inputTokens}`,
						);
						break;

					case "content_block_start":
						// Content block start
						if (chunk.content_block.type === "tool_use") {
							// Before tool call starts, use unified method to handle remaining thinking content
							this.reportRemainingThinkingContent(
								progress,
								pendingThinking,
								currentThinkingId,
								"tool call start",
							);
							// Clear pendingThinking content and ID to avoid duplicate processing
							if (pendingThinking) {
								pendingThinking.thinking = "";
							}
							currentThinkingId = null;

							pendingToolCall = {
								toolId: chunk.content_block.id,
								name: chunk.content_block.name,
								jsonInput: "",
							};
							Logger.trace(`Tool call start: ${chunk.content_block.name}`);
						} else if (chunk.content_block.type === "thinking") {
							// Mark thinking block start
							pendingThinking = {
								thinking: "",
								signature: "",
							};
							// Generate thinking block ID
							currentThinkingId = `thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
							// Mark whether thinking content was output
							hasThinkingContent = true;
							Logger.trace("Thinking block start (streaming output)");
						} else if (chunk.content_block.type === "text") {
							// Before text block starts, use unified method to handle remaining thinking content
							this.reportRemainingThinkingContent(
								progress,
								pendingThinking,
								currentThinkingId,
								"text block start",
							);
							// Clear pendingThinking content and ID to avoid duplicate processing
							if (pendingThinking) {
								pendingThinking.thinking = "";
							}
							currentThinkingId = null;
							Logger.trace("Text block start");
						} /* else if (chunk.content_block.type === 'server_tool_use') {
                            // Handle server-side tool use (e.g. web_search) (not supported yet)
                            pendingServerToolCall = {
                                toolId: chunk.content_block.id,
                                name: chunk.content_block.name,
                                jsonInput: '',
                                type: chunk.content_block.name
                            };
                            progress.report(new vscode.LanguageModelTextPart('\n'));
                            Logger.trace(`Server tool call start: ${chunk.content_block.name}`);
                        } */ else if (
							chunk.content_block.type === "redacted_thinking"
						) {
							const redactedBlock =
								chunk.content_block as Anthropic.Messages.RedactedThinkingBlock;
							pendingRedactedThinking = {
								data: redactedBlock.data,
							};
							Logger.trace("Encrypted thinking block start");
						}
						break;

					case "content_block_delta":
						// Content block incremental update
						if (chunk.delta.type === "text_delta") {
							// Text content delta
							pendingTextBuffer += chunk.delta.text;
							flushTextBuffer(false);
							// Mark existing output content
							hasOutputContent = true;
						} else if (
							chunk.delta.type === "input_json_delta" &&
							pendingToolCall
						) {
							// Tool call parameter delta
							pendingToolCall.jsonInput =
								(pendingToolCall.jsonInput || "") + chunk.delta.partial_json;
							// Try to parse accumulated JSON to see if it is complete
							try {
								const parsedJson = JSON.parse(pendingToolCall.jsonInput);
								progress.report(
									new vscode.LanguageModelToolCallPart(
										pendingToolCall.toolId ?? "",
										pendingToolCall.name ?? "",
										parsedJson,
									),
								);
								pendingToolCall = undefined;
							} catch {
								// JSON not complete yet, continuing to accumulate
							}
							// Tool call also counts as output content
							hasOutputContent = true;
						} /* else if (chunk.delta.type === 'input_json_delta' && pendingServerToolCall) {
                            // Server tool call parameter delta (not supported yet)
                            pendingServerToolCall.jsonInput =
                                (pendingServerToolCall.jsonInput || '') + chunk.delta.partial_json;
                        } */ else if (chunk.delta.type === "thinking_delta") {
							// Thinking content delta - only accumulate to pendingThinking, report using buffer mechanism
							const thinkingDelta = chunk.delta.thinking || "";

							if (pendingThinking) {
								// Accumulate to pendingThinking
								pendingThinking.thinking =
									(pendingThinking.thinking || "") + thinkingDelta;

								// Check outputThinking setting in model configuration
								const shouldOutputThinking =
									modelConfig?.outputThinking !== false; // default true
								if (shouldOutputThinking) {
									// Use pendingThinking's content as buffer for reporting
									const currentThinkingContent = pendingThinking.thinking || "";

									// Report when content reaches maximum length
									if (
										currentThinkingContent.length >= MAX_THINKING_BUFFER_LENGTH
									) {
										if (!currentThinkingId) {
											currentThinkingId = `thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
										}
										try {
											progress.report(
												new vscode.LanguageModelThinkingPart(
													currentThinkingContent,
													currentThinkingId,
												),
											);
											// Clear pendingThinking content to avoid duplicate reporting
											pendingThinking.thinking = "";
										} catch (e) {
											Logger.trace(
												`Failed to report thinking content: ${String(e)}`,
											);
										}
									}
								} else {
									Logger.trace(
										"⏭️ Skip thinking content output: configured not to output thinking",
									);
								}
							}
						} else if (chunk.delta.type === "signature_delta") {
							// Accumulate signature
							if (pendingThinking) {
								pendingThinking.signature =
									(pendingThinking.signature || "") +
									(chunk.delta.signature || "");
							}
						} /* else if (chunk.delta.type === 'citations_delta') {
                            // Handle citation delta
                            if ('citation' in chunk.delta) {
                                const citation = chunk.delta
                                    .citation as Anthropic.Messages.CitationsWebSearchResultLocation;
                                if (citation.type === 'web_search_result_location') {
                                    // Format citation according to Anthropic specification
                                    const citationData = {
                                        type: 'web_search_result_location',
                                        url: citation.url,
                                        title: citation.title,
                                        encrypted_index: citation.encrypted_index,
                                        cited_text: citation.cited_text
                                    };

                                    // Format citation as readable blockquote and source link
                                    const referenceText = `\n> "${citation.cited_text}" — [Source](${citation.url})\n\n`;

                                    // Report formatted citation text to user
                                    progress.report(new vscode.LanguageModelTextPart(referenceText));

                                    // Store citation data in correct format for multi-turn dialogue
                                    progress.report(
                                        new vscode.LanguageModelToolResultPart('citation', [
                                            new vscode.LanguageModelTextPart(JSON.stringify(citationData, null, 2))
                                        ])
                                    );
                                }
                            }
                        } */
						break;

					case "content_block_stop":
						// Content block stop
						if (pendingToolCall) {
							try {
								const parsedJson = JSON.parse(
									pendingToolCall.jsonInput || "{}",
								);
								progress.report(
									new vscode.LanguageModelToolCallPart(
										pendingToolCall.toolId ?? "",
										pendingToolCall.name ?? "",
										parsedJson,
									),
								);
								Logger.debug(`Tool call complete: ${pendingToolCall.name}`);
							} catch (e) {
								Logger.error(
									`Failed to parse tool call JSON (${pendingToolCall.name}):`,
									e,
								);
							}
							pendingToolCall = undefined;
						} else if (pendingThinking) {
							// Handle thinking block end - unified handling of thinking content and signature info
							let hasReportedContent = false;

							// If there is thinking content, report first and possibly add signature metadata
							const finalThinkingContent = pendingThinking.thinking || "";
							if (finalThinkingContent.length > 0 && currentThinkingId) {
								const finalThinkingPart = new vscode.LanguageModelThinkingPart(
									finalThinkingContent,
									currentThinkingId,
								);

								// If there is signature, add to metadata
								if (pendingThinking.signature) {
									finalThinkingPart.metadata = {
										signature: pendingThinking.signature,
										_completeThinking: finalThinkingContent,
									};
								}

								progress.report(finalThinkingPart);
								// End current chain of thought
								progress.report(
									new vscode.LanguageModelThinkingPart("", currentThinkingId),
								);
								hasReportedContent = true;
							}

							// If only signature but no thinking content, create an empty thinking part with signature metadata
							if (!hasReportedContent && pendingThinking.signature) {
								const signaturePart = new vscode.LanguageModelThinkingPart("");
								signaturePart.metadata = {
									signature: pendingThinking.signature,
									_completeThinking: finalThinkingContent,
								};
								progress.report(signaturePart);
							}

							pendingThinking = undefined;
							Logger.debug("Thinking block complete");
						} else if (pendingRedactedThinking) {
							pendingRedactedThinking = undefined;
							Logger.debug("Encrypted thinking block complete");
						}
						break;

					case "message_delta":
						// Message delta - update usage statistics
						if (usage && chunk.usage) {
							// Update input tokens (if updated)
							if (
								chunk.usage.input_tokens !== undefined &&
								chunk.usage.input_tokens !== null
							) {
								usage.inputTokens =
									chunk.usage.input_tokens +
									(chunk.usage.cache_creation_input_tokens ?? 0) +
									(chunk.usage.cache_read_input_tokens ?? 0);
							}
							// Update output tokens (if updated)
							if (
								chunk.usage.output_tokens !== undefined &&
								chunk.usage.output_tokens !== null
							) {
								usage.outputTokens = chunk.usage.output_tokens;
							}
							// Recalculate total
							usage.totalTokens = usage.inputTokens + usage.outputTokens;

							Logger.trace(
								`Token usage update - Input: ${usage.inputTokens}, Output: ${usage.outputTokens}, Total: ${usage.totalTokens}`,
							);
						}
						// Record stop reason
						if (chunk.delta.stop_reason) {
							Logger.trace(`Message stop reason: ${chunk.delta.stop_reason}`);
						}
						break;

					case "message_stop":
						// Message stop - use unified method to handle remaining thinking content
						flushTextBuffer(true);
						this.reportRemainingThinkingContent(
							progress,
							pendingThinking,
							currentThinkingId,
							"message stream end",
						);
						// Clear pendingThinking content and ID to avoid duplicate processing
						if (pendingThinking) {
							pendingThinking.thinking = "";
						}
						currentThinkingId = null;
						Logger.trace("Message stream complete");
						break;

					default:
						// Unknown event type - handle gracefully according to official suggestions
						// May include ping events or future new event types
						Logger.trace("Received other event types");
						break;
				}
			}
		} catch (error) {
			Logger.error("Error processing Anthropic stream:", error);
			// Error handling logic moved to finally block for unified handling
			throw error;
		} finally {
			flushTextBuffer(true);
			// Unified handling of unreported thinking content (including normal completion, error, cancellation, etc.)
			this.reportRemainingThinkingContent(
				progress,
				pendingThinking,
				currentThinkingId,
				"stream processing end",
			);
		}

		if (usage) {
			Logger.debug(
				`Stream processing complete - final usage statistics: Input=${usage.inputTokens}, Output=${usage.outputTokens}, Total=${usage.totalTokens}`,
			);
		} else {
			Logger.warn(
				"Stream processing complete but usage statistics not obtained",
			);
		}

		return { usage };
	}

	/**
	 * Unified handling of reporting remaining thinking content
	 */
	private reportRemainingThinkingContent(
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		pendingThinking: { thinking?: string; signature?: string } | undefined,
		currentThinkingId: string | null,
		context: string,
	): void {
		const thinkingContent = pendingThinking?.thinking || "";
		if (thinkingContent.length > 0 && currentThinkingId) {
			try {
				progress.report(
					new vscode.LanguageModelThinkingPart(
						thinkingContent,
						currentThinkingId,
					),
				);
				Logger.trace(
					`reporting remaining thinking content at ${context}: ${thinkingContent.length} characters`,
				);
				// End current chain of thought
				progress.report(
					new vscode.LanguageModelThinkingPart("", currentThinkingId),
				);
			} catch (e) {
				Logger.trace(
					`failed to report thinking content at ${context}: ${String(e)}`,
				);
			}
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
			msg.includes("HTTP 429") ||
			msg.includes('"code": 429') ||
			msg.includes('"code":429') ||
			msg.includes("RESOURCE_EXHAUSTED") ||
			(msg.includes("429") && msg.includes("Resource has been exhausted"))
		);
	}
}
