/*---------------------------------------------------------------------------------------------
 *  Independent Compatible Provider
 *  Inherits GenericModelProvider, overriding necessary methods to support full user configuration
 *--------------------------------------------------------------------------------------------*/

import type OpenAI from "openai";
import type {
	LanguageModelChatInformation,
	LanguageModelChatMessage,
	Progress,
	ProvideLanguageModelChatResponseOptions,
} from "vscode";
import * as vscode from "vscode";
import type {
	ModelConfig,
	ModelOverride,
	ProviderConfig,
} from "../../types/sharedTypes";
import {
	ApiKeyManager,
	CompatibleModelManager,
	ConfigManager,
	KnownProviders,
	Logger,
	RetryManager,
	TokenCounter,
	TokenTelemetryTracker,
} from "../../utils";
import { GenericModelProvider } from "../common/genericModelProvider";
import { configProviders } from "../config";
import type { ExtendedDelta } from "../openai/openaiTypes";
import type { ToolCallBuffer } from "./compatibleTypes";

/**
 * Independent Compatible Model Provider Class
 * Inherits GenericModelProvider, overriding model configuration retrieval methods
 */
export class CompatibleProvider extends GenericModelProvider {
	private static readonly PROVIDER_KEY = "compatible";
	private modelsChangeListener?: vscode.Disposable;
	private retryManager: RetryManager;

	constructor(context: vscode.ExtensionContext) {
		// Create a virtual ProviderConfig, actual model configurations are retrieved from CompatibleModelManager
		const virtualConfig: ProviderConfig = {
			displayName: "Compatible",
			baseUrl: "https://api.openai.com/v1", // Default value, will be overridden during actual use
			apiKeyTemplate: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			models: [], // Empty model list, actual retrieved from CompatibleModelManager
		};
		super(context, CompatibleProvider.PROVIDER_KEY, virtualConfig);

		// Configure specific retry parameters for Compatible
		this.retryManager = new RetryManager({
			maxAttempts: 3,
			initialDelayMs: 1000,
			maxDelayMs: 30000,
			backoffMultiplier: 2,
			jitterEnabled: true,
		});

		this.getProviderConfig(); // Initialize configuration cache
		// Listen for CompatibleModelManager change events
		this.modelsChangeListener = CompatibleModelManager.onDidChangeModels(() => {
			Logger.debug(
				"[compatible] Received model change event, refreshing configuration and cache",
			);
			this.getProviderConfig(); // Refresh configuration cache
			// Clear model cache
			this.modelInfoCache
				?.invalidateCache(CompatibleProvider.PROVIDER_KEY)
				.catch((err) =>
					Logger.warn("[compatible] Failed to clear cache:", err),
				);
			this._onDidChangeLanguageModelChatInformation.fire();
			Logger.debug(
				"[compatible] Triggered language model information change event",
			);
		});
	}

	override dispose(): void {
		this.modelsChangeListener?.dispose();
		super.dispose();
	}

	/**
	 * Override: Get dynamic provider configuration
	 * Retrieve user-configured models from CompatibleModelManager
	 */
	getProviderConfig(): ProviderConfig {
		try {
			const models = CompatibleModelManager.getModels();
			// Convert CompatibleModelManager models to ModelConfig format
			const modelConfigs: ModelConfig[] = models.map((model) => {
				let customHeader = model.customHeader;
				if (model.provider) {
					const provider = KnownProviders[model.provider];
					if (provider?.customHeader) {
						const existingHeaders = model.customHeader || {};
						customHeader = { ...existingHeaders, ...provider.customHeader };
					}

					let knownOverride: Omit<ModelOverride, "id"> | undefined;
					if (model.sdkMode === "anthropic" && provider?.anthropic) {
						knownOverride = provider.anthropic;
					} else if (model.sdkMode !== "anthropic" && provider?.openai) {
						knownOverride = provider.openai.extraBody;
					}

					if (knownOverride) {
						const extraBody = knownOverride.extraBody || {};
						const modelBody = model.extraBody || {};
						model.extraBody = { ...extraBody, ...modelBody };
					}
				}
				return {
					id: model.id,
					name: model.name,
					provider: model.provider,
					tooltip: model.tooltip || `${model.name} (${model.sdkMode})`,
					maxInputTokens: model.maxInputTokens,
					maxOutputTokens: model.maxOutputTokens,
					sdkMode: model.sdkMode,
					capabilities: model.capabilities,
					...(model.baseUrl && { baseUrl: model.baseUrl }),
					...(model.model && { model: model.model }),
					...(customHeader && { customHeader: customHeader }),
					...(model.extraBody && { extraBody: model.extraBody }),
					...(model.outputThinking !== undefined && {
						outputThinking: model.outputThinking,
					}),
					...(model.includeThinking !== undefined && {
						includeThinking: model.includeThinking,
					}),
				};
			});

			Logger.debug(
				`Compatible Provider loaded ${modelConfigs.length} user-configured models`,
			);

			this.cachedProviderConfig = {
				displayName: "Compatible",
				baseUrl: "https://api.openai.com/v1", // Default value, model-level configuration will override
				apiKeyTemplate: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
				models: modelConfigs,
			};
		} catch (error) {
			Logger.error("Failed to get Compatible Provider configuration:", error);
			// Return basic configuration as backup
			this.cachedProviderConfig = {
				displayName: "Compatible",
				baseUrl: "https://api.openai.com/v1",
				apiKeyTemplate: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
				models: [],
			};
		}
		return this.cachedProviderConfig;
	}

	/**
	 * Override: Provide language model chat information
	 * Get the latest dynamic configuration directly, not relying on configuration at construction time
	 * Check API Keys for providers involved in all models
	 * Integrate model caching mechanism to improve performance
	 */
	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: vscode.CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		try {
			// Get API key hash for cache validation
			const apiKeyHash = await this.getApiKeyHash();

			// Fast path: check cache
			let cachedModels = await this.modelInfoCache?.getCachedModels(
				CompatibleProvider.PROVIDER_KEY,
				apiKeyHash,
			);
			if (cachedModels) {
				Logger.trace(
					`Compatible Provider cache hit: ${cachedModels.length} models`,
				);

				// Read user's last selected model and mark as default (only if memory is enabled)
				const rememberLastModel = ConfigManager.getRememberLastModel();
				if (rememberLastModel) {
					const lastSelectedId = this.modelInfoCache?.getLastSelectedModel(
						CompatibleProvider.PROVIDER_KEY,
					);
					if (lastSelectedId) {
						cachedModels = cachedModels.map((model) => ({
							...model,
							isDefault: model.id === lastSelectedId,
						}));
					}
				}

				// Background asynchronous cache update
				this.updateModelCacheAsync(apiKeyHash);
				return cachedModels;
			}

			// Get latest dynamic configuration
			const currentConfig = this.providerConfig;
			// If no models, return empty list directly
			if (currentConfig.models.length === 0) {
				// Trigger new model addition process asynchronously, but do not block configuration retrieval
				if (!options.silent) {
					setImmediate(async () => {
						try {
							await CompatibleModelManager.configureModelOrUpdateAPIKey();
						} catch {
							Logger.debug(
								"Automatically triggering new model addition failed or was cancelled by user",
							);
						}
					});
				}
				return [];
			}

			// Get providers involved in all models (deduplicate)
			const providers = new Set<string>();
			for (const model of currentConfig.models) {
				if (model.provider) {
					providers.add(model.provider);
				}
			}
			// Check API Key for each provider
			for (const provider of providers) {
				if (!options.silent) {
					// In non-silent mode, use ensureApiKey to confirm and set one by one
					const hasValidKey = await ApiKeyManager.ensureApiKey(
						provider,
						provider,
						false,
					);
					if (!hasValidKey) {
						Logger.warn(
							`Compatible Provider: user has not set API key for provider "${provider}"`,
						);
						return [];
					}
				}
			}

			// Convert models from the latest configuration to VS Code format
			let modelInfos = currentConfig.models.map((model) => {
				const info = this.modelConfigToInfo(model);
				const sdkModeDisplay =
					model.sdkMode === "anthropic" ? "Anthropic" : "OpenAI";

				if (model.provider) {
					const knownProvider = KnownProviders[model.provider];
					if (knownProvider?.displayName) {
						return { ...info, detail: knownProvider.displayName };
					}
					const provider =
						configProviders[model.provider as keyof typeof configProviders];
					if (provider?.displayName) {
						return { ...info, detail: provider.displayName };
					}
				}

				return { ...info, detail: `${sdkModeDisplay} Compatible` };
			});

			// Read user's last selected model and mark as default (only if memory is enabled)
			const rememberLastModel = ConfigManager.getRememberLastModel();
			if (rememberLastModel) {
				const lastSelectedId = this.modelInfoCache?.getLastSelectedModel(
					CompatibleProvider.PROVIDER_KEY,
				);
				if (lastSelectedId) {
					modelInfos = modelInfos.map((model) => ({
						...model,
						isDefault: model.id === lastSelectedId,
					}));
				}
			}

			Logger.debug(
				`Compatible Provider provided ${modelInfos.length} model information`,
			); // Background asynchronous cache update
			this.updateModelCacheAsync(apiKeyHash);

			return modelInfos;
		} catch (error) {
			Logger.error(
				"Failed to get Compatible Provider model information:",
				error,
			);
			return [];
		}
	}

	/**
	 * Override: Update model cache asynchronously
	 * Need to correctly set detail field to display SDK mode
	 */
	protected override updateModelCacheAsync(apiKeyHash: string): void {
		(async () => {
			try {
				const currentConfig = this.providerConfig;

				const models = currentConfig.models.map((model) => {
					const info = this.modelConfigToInfo(model);
					const sdkModeDisplay =
						model.sdkMode === "anthropic" ? "Anthropic" : "OpenAI";

					if (model.provider) {
						const knownProvider = KnownProviders[model.provider];
						if (knownProvider?.displayName) {
							return { ...info, detail: knownProvider.displayName };
						}
						const provider =
							configProviders[model.provider as keyof typeof configProviders];
						if (provider?.displayName) {
							return { ...info, detail: provider.displayName };
						}
					}

					return { ...info, detail: `${sdkModeDisplay} Compatible` };
				});

				await this.modelInfoCache?.cacheModels(
					CompatibleProvider.PROVIDER_KEY,
					models,
					apiKeyHash,
				);
			} catch (err) {
				Logger.trace(
					"[compatible] Background cache update failed:",
					err instanceof Error ? err.message : String(err),
				);
			}
		})();
	}

	/**
	 * Override: Provide language model chat response
	 * Process request using latest dynamic configuration and add failure retry mechanism
	 */
	async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		// Save user's selected model and its provider (only if memory is enabled)
		const rememberLastModel = ConfigManager.getRememberLastModel();
		if (rememberLastModel) {
			this.modelInfoCache
				?.saveLastSelectedModel(CompatibleProvider.PROVIDER_KEY, model.id)
				.catch((err) =>
					Logger.warn("[compatible] Failed to save model selection:", err),
				);
		}

		try {
			// Get latest dynamic configuration
			const currentConfig = this.providerConfig;

			// Find corresponding model configuration
			const modelConfig = currentConfig.models.find((m) => m.id === model.id);
			if (!modelConfig) {
				const errorMessage = `Compatible Provider could not find model: ${model.id}`;
				Logger.error(errorMessage);
				throw new Error(errorMessage);
			}

			// Check API key (use throwError: false to allow silent failure)
			const hasValidKey = await ApiKeyManager.ensureApiKey(
				modelConfig.provider!,
				currentConfig.displayName,
				false,
			);
			if (!hasValidKey) {
				throw new Error(
					`API key for model ${modelConfig.name} has not been set yet`,
				);
			}

			// Select handler based on model's sdkMode
			const sdkMode = modelConfig.sdkMode || "openai";
			let sdkName = "OpenAI SDK";
			if (sdkMode === "anthropic") {
				sdkName = "Anthropic SDK";
			} else if (sdkMode === "openai-sse") {
				sdkName = "OpenAI SSE";
			}

			Logger.info(
				`Compatible Provider starts processing request (${sdkName}): ${modelConfig.name}`,
			);

			try {
				// Execute request using retry mechanism
				await this.retryManager.executeWithRetry(
					async () => {
						if (sdkMode === "anthropic") {
							await this.anthropicHandler.handleRequest(
								model,
								modelConfig,
								messages,
								options,
								progress,
								token,
							);
						} else if (sdkMode === "openai-sse") {
							// OpenAI mode: use custom SSE stream processing
							await this.handleRequestWithCustomSSE(
								model,
								modelConfig,
								messages,
								options,
								progress,
								token,
							);
						} else {
							await this.openaiHandler.handleRequest(
								model,
								modelConfig,
								messages,
								options,
								progress,
								token,
							);
						}
					},
					(error) => RetryManager.isRateLimitError(error),
					this.providerConfig.displayName,
				);
			} catch (error) {
				const errorMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
				Logger.error(errorMessage);
				throw error;
			} finally {
				Logger.info(`Compatible Provider: ${model.name} Request completed`);
			}
		} catch (error) {
			Logger.error("Compatible Provider failed to process request:", error);
			throw error;
		}
	}

	/**
	 * Parse <thinking>...</thinking> tags in content
	 * Return parsing result, including separation of thinking content and normal content
	 */
	private parseThinkingTags(
		content: string,
		isInsideThinkingTag: boolean,
		tagBuffer: string,
	): {
		thinkingParts: string[];
		contentParts: string[];
		isInsideThinkingTag: boolean;
		remainingTagBuffer: string;
	} {
		const thinkingParts: string[] = [];
		const contentParts: string[] = [];
		let currentBuffer = tagBuffer + content;
		let insideTag = isInsideThinkingTag;
		let remainingBuffer = "";

		while (currentBuffer.length > 0) {
			if (insideTag) {
				// Inside thinking tag, search for end tag
				const endIndex = currentBuffer.indexOf("</thinking>");
				if (endIndex !== -1) {
					// End tag found
					const thinkingContent = currentBuffer.substring(0, endIndex);
					if (thinkingContent.length > 0) {
						thinkingParts.push(thinkingContent);
					}
					currentBuffer = currentBuffer.substring(
						endIndex + "</thinking>".length,
					);
					insideTag = false;
				} else {
					// End tag not found, check if there is a partial end tag
					const partialEndMatch = this.findPartialTag(
						currentBuffer,
						"</thinking>",
					);
					if (partialEndMatch.found) {
						// Partial end tag found, keeping for next processing
						const thinkingContent = currentBuffer.substring(
							0,
							partialEndMatch.index,
						);
						if (thinkingContent.length > 0) {
							thinkingParts.push(thinkingContent);
						}
						remainingBuffer = currentBuffer.substring(partialEndMatch.index);
						currentBuffer = "";
					} else {
						// No partial end tag, all is thinking content
						thinkingParts.push(currentBuffer);
						currentBuffer = "";
					}
				}
			} else {
				// Not inside thinking tag, search for start tag
				const startIndex = currentBuffer.indexOf("<thinking>");
				if (startIndex !== -1) {
					// Start tag found
					const beforeThinking = currentBuffer.substring(0, startIndex);
					if (beforeThinking.length > 0) {
						contentParts.push(beforeThinking);
					}
					currentBuffer = currentBuffer.substring(
						startIndex + "<thinking>".length,
					);
					insideTag = true;
				} else {
					// Start tag not found, check if there is a partial start tag
					const partialStartMatch = this.findPartialTag(
						currentBuffer,
						"<thinking>",
					);
					if (partialStartMatch.found) {
						// Partial start tag found, keeping for next processing
						const normalContent = currentBuffer.substring(
							0,
							partialStartMatch.index,
						);
						if (normalContent.length > 0) {
							contentParts.push(normalContent);
						}
						remainingBuffer = currentBuffer.substring(partialStartMatch.index);
						currentBuffer = "";
					} else {
						// No partial start tag, all is normal content
						contentParts.push(currentBuffer);
						currentBuffer = "";
					}
				}
			}
		}

		return {
			thinkingParts,
			contentParts,
			isInsideThinkingTag: insideTag,
			remainingTagBuffer: remainingBuffer,
		};
	}

	/**
	 * Find partial tags (used for tags across chunks)
	 */
	private findPartialTag(
		content: string,
		tag: string,
	): { found: boolean; index: number } {
		// From end of content, check if there is a tag prefix
		for (let i = 1; i < tag.length; i++) {
			const suffix = content.substring(content.length - i);
			const prefix = tag.substring(0, i);
			if (suffix === prefix) {
				return { found: true, index: content.length - i };
			}
		}
		return { found: false, index: -1 };
	}

	/**
	 * Request method using custom SSE stream processing
	 */
	private async handleRequestWithCustomSSE(
		model: vscode.LanguageModelChatInformation,
		modelConfig: ModelConfig,
		messages: readonly vscode.LanguageModelChatMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const provider = modelConfig.provider || this.providerKey;
		const apiKey = await ApiKeyManager.getApiKey(provider);
		if (!apiKey) {
			throw new Error(`Missing ${provider} API key`);
		}

		const baseURL = modelConfig.baseUrl || "https://api.openai.com/v1";
		const url = `${baseURL}/chat/completions`;

		Logger.info(
			`[${model.name}] Process ${messages.length} messages using custom SSE processing`,
		);

		// Build request parameters
		const requestBody: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
			model: modelConfig.model || model.id,
			messages: this.openaiHandler.convertMessagesToOpenAI(
				messages,
				model.capabilities || undefined,
				modelConfig,
			),
			max_tokens: ConfigManager.getMaxTokensForModel(model.maxOutputTokens),
			stream: true,
			temperature: ConfigManager.getTemperature(),
			top_p: ConfigManager.getTopP(),
		};

		const reasoningEffort = (
			options.modelOptions as
				| { reasoning_effort?: string; reasoningEffort?: string }
				| undefined
		)?.reasoning_effort ??
			(
				options.modelOptions as
					| { reasoning_effort?: string; reasoningEffort?: string }
					| undefined
			)?.reasoningEffort;
		((requestBody as unknown) as Record<string, unknown>).reasoning_effort =
			typeof reasoningEffort === "string" && reasoningEffort.length > 0
				? reasoningEffort
				: "medium";

		// Add tool support (if any)
		if (
			options.tools &&
			options.tools.length > 0 &&
			model.capabilities?.toolCalling
		) {
			requestBody.tools = this.openaiHandler.convertToolsToOpenAI([
				...options.tools,
			]);
			requestBody.tool_choice = "auto";
		}

		// Merge extraBody parameters (if any)
		if (modelConfig.extraBody) {
			const filteredExtraBody = modelConfig.extraBody;
			Object.assign(requestBody, filteredExtraBody);
			Logger.trace(
				`${model.name} merged extraBody parameters: ${JSON.stringify(filteredExtraBody)}`,
			);
		}

		Logger.debug(`[${model.name}] Send API request`);

		const abortController = new AbortController();
		const cancellationListener = token.onCancellationRequested(() =>
			abortController.abort(),
		);

		try {
			// Handle API key replacement in customHeader
			const processedCustomHeader = ApiKeyManager.processCustomHeader(
				modelConfig?.customHeader,
				apiKey,
			);

			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
					...processedCustomHeader,
				},
				body: JSON.stringify(requestBody),
				signal: abortController.signal,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`API request failed: ${response.status} ${response.statusText} - ${errorText}`,
				);
			}

			if (!response.body) {
				throw new Error("Response body is empty");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let finalUsage:
				| {
						prompt_tokens?: number;
						completion_tokens?: number;
						total_tokens?: number;
				  }
				| undefined;
			let hasReceivedContent = false;
			let hasThinkingContent = false; // Mark whether thinking content was output
			let chunkCount = 0;
			const toolCallsBuffer = new Map<number, ToolCallBuffer>();
			let currentThinkingId: string | null = null; // Chain of thought tracking
			let thinkingContentBuffer: string = ""; // Thinking content cache
			const MAX_THINKING_BUFFER_LENGTH = 10; // Maximum length of thinking content cache

			// State for parsing <thinking>...</thinking> tags
			let isInsideThinkingTag = false; // Whether inside <thinking> tag
			let thinkingTagBuffer: string = ""; // Used to accumulate possible tag fragments
			const _pendingContentBuffer: string = ""; // Used to accumulate normal content to be output

			try {
				while (true) {
					if (token.isCancellationRequested) {
						Logger.warn(`[${model.name}] User cancelled request`);
						break;
					}

					const { done, value } = await reader.read();
					if (done) {
						break;
					}

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() || "";

					for (const line of lines) {
						if (!line.trim() || line.trim() === "") {
							continue;
						}

						// Process SSE data line
						if (line.startsWith("data:")) {
							const data = line.substring(5).trim();

							if (data === "[DONE]") {
								Logger.debug(`[${model.name}] Received end of stream marker`);
								continue;
							}

							try {
								const chunk = JSON.parse(data);
								chunkCount++;
								// Output full chunk to trace log
								// Logger.trace(`[${model.name}] Chunk #${chunkCount}: ${JSON.stringify(chunk)}`);

								let hasContent = false;

								// Check if it is the final chunk containing usage information
								if (
									chunk.usage &&
									(!chunk.choices || chunk.choices.length === 0)
								) {
									finalUsage = chunk.usage as {
										prompt_tokens?: number;
										completion_tokens?: number;
										total_tokens?: number;
									};
									Logger.debug(
										`[${model.name}] Received usage statistics: ${JSON.stringify(chunk.usage)}`,
									);
									// Continue to next chunk, do not set hasReceivedContent
								} else {
									// Process normal choices
									for (const choice of chunk.choices || []) {
										const delta = choice.delta as ExtendedDelta | undefined;

										// Process thinking content (reasoning_content) - use buffer accumulation strategy
										if (
											delta?.reasoning_content &&
											typeof delta.reasoning_content === "string"
										) {
											Logger.trace(
												`[${model.name}] Received thinking content: ${delta.reasoning_content.length} characters, content="${delta.reasoning_content}"`,
											);
											// If currently no active id, generate one for this chain of thought
											if (!currentThinkingId) {
												currentThinkingId = `thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
												Logger.trace(
													`[${model.name}] Create new chain of thought ID: ${currentThinkingId}`,
												);
											}

											// Add thinking content to buffer
											thinkingContentBuffer += delta.reasoning_content;

											// Check if report condition is met
											if (
												thinkingContentBuffer.length >=
												MAX_THINKING_BUFFER_LENGTH
											) {
												// Reached maximum length, report immediately
												try {
													progress.report(
														new vscode.LanguageModelThinkingPart(
															thinkingContentBuffer,
															currentThinkingId,
														),
													);
													thinkingContentBuffer = ""; // Clear buffer
													hasThinkingContent = true; // Mark thinking content was output
												} catch (e) {
													Logger.trace(
														`[${model.name}] Failed to report thinking content: ${String(e)}`,
													);
												}
											} else {
												// Mark thinking content present even if not reported immediately
												hasThinkingContent = true;
											}
										}

										// Process text content (even if delta exists but may be an empty object)
										// Support parsing <thinking>...</thinking> tags
										if (delta?.content && typeof delta.content === "string") {
											Logger.trace(
												`[${model.name}] Output text content: ${delta.content.length} characters, preview=${delta.content}`,
											);

											// Parse <thinking>...</thinking> tags
											const parseResult = this.parseThinkingTags(
												delta.content,
												isInsideThinkingTag,
												thinkingTagBuffer,
											);

											// Update state
											isInsideThinkingTag = parseResult.isInsideThinkingTag;
											thinkingTagBuffer = parseResult.remainingTagBuffer;

											// Process thinking content
											for (const thinkingPart of parseResult.thinkingParts) {
												if (thinkingPart.length > 0) {
													// If currently no active id, generate one for this chain of thought
													if (!currentThinkingId) {
														currentThinkingId = `thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
														Logger.trace(
															`[${model.name}] Create new chain of thought ID (from tag): ${currentThinkingId}`,
														);
													}

													// Add thinking content to buffer
													thinkingContentBuffer += thinkingPart;

													// Check if report condition is met
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
															thinkingContentBuffer = ""; // Clear buffer
															hasThinkingContent = true;
														} catch (e) {
															Logger.trace(
																`[${model.name}] Failed to report thinking content (from tag): ${String(e)}`,
															);
														}
													} else {
														hasThinkingContent = true;
													}
												}
											}

											// Process normal content
											for (const contentPart of parseResult.contentParts) {
												if (contentPart.length > 0) {
													// Before meeting visible content, if there is cached thinking content, report it first
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
															thinkingContentBuffer = ""; // Clear buffer
															hasThinkingContent = true;
														} catch (e) {
															Logger.trace(
																`[${model.name}] Failed to report remaining thinking content: ${String(e)}`,
															);
														}
													}

													// Then end current chain of thought
													if (currentThinkingId && !isInsideThinkingTag) {
														try {
															Logger.trace(
																`[${model.name}] End chain of thought before outputting content ID: ${currentThinkingId}`,
															);
															progress.report(
																new vscode.LanguageModelThinkingPart(
																	"",
																	currentThinkingId,
																),
															);
														} catch (e) {
															Logger.trace(
																`[${model.name}] Failed to send thinking done(id=${currentThinkingId}) failure: ${String(e)}`,
															);
														}
														currentThinkingId = null;
													}

													progress.report(
														new vscode.LanguageModelTextPart(contentPart),
													);
													hasContent = true;
												}
											}
										}

										// Process tool calls - support cumulative processing of chunked data
										if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
											for (const toolCall of delta.tool_calls) {
												const toolIndex = toolCall.index ?? 0;

												// Check if a tool call starts (tool_calls exists but no arguments yet)
												if (
													toolIndex !== undefined &&
													!toolCall.function?.arguments
												) {
													// At tool call start, if there is cached thinking content, report it first
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
															// End current chain of thought
															progress.report(
																new vscode.LanguageModelThinkingPart(
																	"",
																	currentThinkingId,
																),
															);
															thinkingContentBuffer = ""; // Clear buffer
															hasThinkingContent = true; // Mark thinking content was output
														} catch (e) {
															Logger.trace(
																`[${model.name}] Failed to report remaining thinking content: ${String(e)}`,
															);
														}
													}
													Logger.trace(
														`[${model.name}] Tool call start: ${toolCall.function?.name || "unknown"} (index: ${toolIndex})`,
													);
												}

												// Get or create tool call cache
												let bufferedTool = toolCallsBuffer.get(toolIndex);
												if (!bufferedTool) {
													bufferedTool = { arguments: "" };
													toolCallsBuffer.set(toolIndex, bufferedTool);
												}

												// Accumulate tool call data
												if (toolCall.id) {
													bufferedTool.id = toolCall.id;
												}
												if (toolCall.function?.name) {
													bufferedTool.name = toolCall.function.name;
												}
												if (toolCall.function?.arguments) {
													const newArgs = toolCall.function.arguments;
													// Check if duplicate data: whether new data is already included in current cumulative string
													// Some APIs (e.g. DeepSeek) may repeatedly send previous arguments fragments
													if (bufferedTool.arguments.endsWith(newArgs)) {
														// Complete duplicate, skip
														Logger.trace(
															`[${model.name}] Skip duplicate tool call parameters [${toolIndex}]: "${newArgs}"`,
														);
													} else if (
														bufferedTool.arguments.length > 0 &&
														newArgs.startsWith(bufferedTool.arguments)
													) {
														// New data includes old data (full duplicate + new), only take new part
														const incrementalArgs = newArgs.substring(
															bufferedTool.arguments.length,
														);
														bufferedTool.arguments += incrementalArgs;
														Logger.trace(
															`[${model.name}] Partial duplication detected, extract incremental part [${toolIndex}]: "${incrementalArgs}"`,
														);
													} else {
														// Normal accumulation
														bufferedTool.arguments += newArgs;
													}
												}

												Logger.trace(
													`[${model.name}] Accumulate tool call data [${toolIndex}]: name=${bufferedTool.name}, args_length=${bufferedTool.arguments.length}`,
												);
											}
										}

										// Check if complete
										if (choice.finish_reason) {
											Logger.debug(
												`[${model.name}] Stream ended, reason: ${choice.finish_reason}`,
											);

											// If there is cached thinking content, report it first
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
													thinkingContentBuffer = ""; // Clear buffer
													hasThinkingContent = true; // Mark thinking content was output
												} catch (e) {
													Logger.trace(
														`[${model.name}] Failed to report remaining thinking content: ${String(e)}`,
													);
												}
											}

											// If there is an unended chain of thought, end it at finish_reason
											if (
												currentThinkingId &&
												choice.finish_reason !== "length"
											) {
												try {
													Logger.trace(
														`[${model.name}] End chain of thought before stream ends ID: ${currentThinkingId}`,
													);
													progress.report(
														new vscode.LanguageModelThinkingPart(
															"",
															currentThinkingId,
														),
													);
												} catch (e) {
													Logger.warn(
														`[${model.name}] Failed to end chain of thought: ${String(e)}`,
													);
												}
												currentThinkingId = null;
											}

											// If it is end of tool calls, process tool calls in cache
											if (choice.finish_reason === "tool_calls") {
												let toolProcessed = false;
												for (const [
													toolIndex,
													bufferedTool,
												] of toolCallsBuffer.entries()) {
													if (bufferedTool.name && bufferedTool.arguments) {
														try {
															const args = JSON.parse(bufferedTool.arguments);
															const toolCallId =
																bufferedTool.id ||
																`tool_${Date.now()}_${toolIndex}`;

															progress.report(
																new vscode.LanguageModelToolCallPart(
																	toolCallId,
																	bufferedTool.name,
																	args,
																),
															);

															Logger.info(
																`[${model.name}] Successfully processed tool call: ${bufferedTool.name}, args: ${bufferedTool.arguments}`,
															);
															toolProcessed = true;
														} catch (error) {
															Logger.error(
																`[${model.name}] Unable to parse tool call parameters: ${bufferedTool.name}, args: ${bufferedTool.arguments}, error: ${error}`,
															);
														}
													} else {
														Logger.warn(
															`[${model.name}] Incomplete tool call [${toolIndex}]: name=${bufferedTool.name}, args_length=${bufferedTool.arguments.length}`,
														);
													}
												}

												if (toolProcessed) {
													hasContent = true;
													Logger.trace(
														`[${model.name}] Tool call processed, marked as content received`,
													);
												}
											} else if (choice.finish_reason === "stop") {
												// For stop, only mark when content is actually received (excluding only thinking content cases)
												if (!hasContent) {
													Logger.trace(
														`[${model.name}] finish_reason=stop, no text content received`,
													);
												}
												// Note: no longer forcibly set hasContent = true
												// Only when text or tool call was actually received earlier will hasContent be true
											}
										}
									}
								}

								if (hasContent) {
									hasReceivedContent = true;
								}
							} catch (error) {
								Logger.error(
									`[${model.name}] Failed to parse JSON: ${data}`,
									error,
								);
							}
						}
					}
				}
			} finally {
				reader.releaseLock();
			}

			Logger.trace(
				`[${model.name}] SSE stream processing statistics: ${chunkCount} chunks, hasReceivedContent=${hasReceivedContent}`,
			);

			Logger.debug(`[${model.name}] Stream processing complete`);

			let promptTokens = finalUsage?.prompt_tokens;
			let completionTokens = finalUsage?.completion_tokens;
			let totalTokens = finalUsage?.total_tokens;
			let estimatedPromptTokens = false;
			if (promptTokens === undefined) {
				try {
					promptTokens = await TokenCounter.getInstance().countMessagesTokens(
						model,
						[...messages],
						{ sdkMode: modelConfig.sdkMode || "openai" },
						options,
					);
					completionTokens = 0;
					totalTokens = promptTokens;
					estimatedPromptTokens = true;
				} catch (e) {
					Logger.trace(
						`[${model.name}] Failed to estimate prompt tokens in custom SSE mode: ${String(e)}`,
					);
				}
			}
			if (promptTokens !== undefined && completionTokens !== undefined) {
				TokenTelemetryTracker.getInstance().recordSuccess({
					modelId: model.id,
					modelName: model.name,
					providerId: this.providerKey,
					promptTokens,
					completionTokens,
					totalTokens,
					maxInputTokens: model.maxInputTokens,
					maxOutputTokens: model.maxOutputTokens,
					estimatedPromptTokens,
				});
			}

			// Only add <think/> placeholder if thinking content was output but no content was output
			if (hasThinkingContent && !hasReceivedContent) {
				progress.report(new vscode.LanguageModelTextPart("<think/>"));
				Logger.warn(
					`[${model.name}] End of message stream has only thinking content and no text content, added <think/> placeholder as output`,
				);
			}

			Logger.debug(`[${model.name}] API request complete`);
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				Logger.warn(`[${model.name}] User cancelled request`);
				throw new vscode.CancellationError();
			}
			throw error;
		} finally {
			cancellationListener.dispose();
		}
	}

	/**
	 * Register commands
	 */
	private static registerCommands(
		context: vscode.ExtensionContext,
	): vscode.Disposable[] {
		const disposables: vscode.Disposable[] = [];
		// Register manageModels command
		disposables.push(
			vscode.commands.registerCommand(
				"chp.compatible.manageModels",
				async () => {
					try {
						await CompatibleModelManager.configureModelOrUpdateAPIKey();
					} catch (error) {
						Logger.error("Failed to manage Compatible models:", error);
						vscode.window.showErrorMessage(
							`Failed to manage models: ${error instanceof Error ? error.message : "Unknown error"}`,
						);
					}
				},
			),
		);
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}
		Logger.debug("Compatible Provider commands registered");
		return disposables;
	}

	/**
	 * Static factory method - Create and activate provider
	 */
	static createAndActivate(context: vscode.ExtensionContext): {
		provider: CompatibleProvider;
		disposables: vscode.Disposable[];
	} {
		Logger.trace("Compatible Provider activated!");
		// Create provider instance
		const provider = new CompatibleProvider(context);
		// Register language model chat provider
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			"chp.compatible",
			provider,
		);
		// Register commands
		const commandDisposables = CompatibleProvider.registerCommands(context);
		const disposables = [providerDisposable, ...commandDisposables];
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}
		return { provider, disposables };
	}
}
