/*---------------------------------------------------------------------------------------------
 *  Ollama Cloud Dedicated Provider
 *  Dynamically fetches models from https://ollama.com/v1/models
 *--------------------------------------------------------------------------------------------*/

import * as fs from "node:fs";
import * as path from "node:path";
import OpenAI from "openai";
import type {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatMessage,
	LanguageModelChatProvider,
	LanguageModelResponsePart,
	Progress,
	ProvideLanguageModelChatResponseOptions,
} from "vscode";
import * as vscode from "vscode";
import type { ModelConfig, ProviderConfig } from "../../types/sharedTypes";
import { ApiKeyManager } from "../../utils/apiKeyManager";
import { ConfigManager } from "../../utils/configManager";
import {
	DEFAULT_CONTEXT_LENGTH,
	DEFAULT_MAX_OUTPUT_TOKENS,
	resolveGlobalCapabilities,
	resolveGlobalTokenLimits,
} from "../../utils/globalContextLengthManager";
import { Logger } from "../../utils/logger";
import { RateLimiter } from "../../utils/rateLimiter";
import { TokenCounter } from "../../utils/tokenCounter";
import { ProviderWizard } from "../../utils/providerWizard";
import { getExtensionVersion, getUserAgent } from "../../utils/userAgent";
import { GenericModelProvider } from "../common";
import type { OllamaModelItem, OllamaModelsResponse } from "./types";

const BASE_URL = "https://ollama.com/v1";

export class OllamaProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	private readonly userAgent: string;
	private readonly extensionPath: string;
	private readonly configFilePath: string;
	private clientCache = new Map<string, { client: OpenAI; lastUsed: number }>();

	constructor(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
		userAgent: string,
		extensionPath: string,
	) {
		super(context, providerKey, providerConfig);
		this.userAgent = userAgent;
		this.extensionPath = extensionPath;
		this.configFilePath = path.join(
			this.extensionPath,
			"src",
			"providers",
			"config",
			"ollama.json",
		);
	}

	/**
	 * Override refreshHandlers to also clear the OpenAI client cache
	 * This ensures that when baseUrl changes, new clients are created with the correct URL
	 */
	protected override refreshHandlers(): void {
		// Clear our client cache first - baseUrl may have changed
		// Only clear if the cache has already been initialized (might not be if called from constructor)
		if (this.clientCache && this.clientCache.size > 0) {
			Logger.debug(`[Ollama] Clearing ${this.clientCache.size} cached OpenAI clients due to config change`);
			this.clientCache.clear();
		}
		// Then call parent to refresh openaiHandler and anthropicHandler
		super.refreshHandlers();
	}

	private lastFetchTime = 0;
	private static readonly FETCH_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		const apiKey = await this.ensureApiKey(options.silent ?? true);

		// Always return current models from config first
		const currentModels = this.providerConfig.models.map(m => {
			const baseInfo = this.modelConfigToInfo(m);
			return {
				...baseInfo,
				family: "Ollama Cloud",
			};
		});

		// Throttled background fetch and update
		const now = Date.now();
		if (now - this.lastFetchTime > OllamaProvider.FETCH_COOLDOWN_MS) {
			this.refreshModelsAsync(apiKey);
		}

		return this.dedupeModelInfos(currentModels);
	}

	private async refreshModelsAsync(apiKey?: string): Promise<void> {
		this.lastFetchTime = Date.now();
		try {
			const result = await this.fetchModels(apiKey);
			if (result.models && result.models.length > 0) {
				await this.updateOllamaConfigFile(result.models);
			}
		} catch (err) {
			Logger.trace("[Ollama] Background model refresh failed:", err);
		}
	}

	private async fetchModels(
		apiKey?: string,
	): Promise<{ models: OllamaModelItem[] }> {
		const headers: Record<string, string> = {
			"User-Agent": this.userAgent,
		};
		if (apiKey) {
			headers["Authorization"] = `Bearer ${apiKey}`;
		}

		const baseUrl = (this.providerConfig.baseUrl || BASE_URL).replace(/\/$/, "");
		const resp = await fetch(`${baseUrl}/models`, {
			method: "GET",
			headers,
		});

		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(`Failed to fetch Ollama models: ${resp.status} ${resp.statusText}\n${text}`);
		}

		const parsed = (await resp.json()) as OllamaModelsResponse;
		return { models: parsed.data ?? [] };
	}

	private async updateOllamaConfigFile(models: OllamaModelItem[]): Promise<void> {
		try {
			const modelConfigs: ModelConfig[] = models.map((m) => {
				const modelId = m.id;
				// Detect vision support based on model name patterns
				const detectedVision =
					/vl|vision/i.test(modelId) ||
					/gemini|claude|gpt-4|kimi-k2\.5/i.test(modelId);
				const capabilities = resolveGlobalCapabilities(modelId, {
					detectedImageInput: detectedVision,
				});
				const contextLen = DEFAULT_CONTEXT_LENGTH;
				const { maxInputTokens, maxOutputTokens } = resolveGlobalTokenLimits(
					modelId,
					contextLen,
					{
						defaultContextLength: DEFAULT_CONTEXT_LENGTH,
						defaultMaxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
					},
				);
				const cleanId = m.id.replace(/[/]/g, "-").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
				return {
					id: cleanId,
					name: m.id,
					tooltip: `${m.id} by Ollama Cloud`,
					maxInputTokens,
					maxOutputTokens,
					model: m.id,
					capabilities,
				} as ModelConfig;
			});

			// Update in-memory configurations synchronously
			let configChanged = false;
			if (this.baseProviderConfig) {
				const oldModelsJson = JSON.stringify(this.baseProviderConfig.models);
				const newModelsJson = JSON.stringify(modelConfigs);
				if (oldModelsJson !== newModelsJson) {
					this.baseProviderConfig.models = modelConfigs;
					configChanged = true;
				}
			}

			if (configChanged) {
				this.cachedProviderConfig = ConfigManager.applyProviderOverrides(
					this.providerKey,
					this.baseProviderConfig,
				);

				// Only write to file if it exists (for dev environment)
				if (fs.existsSync(this.configFilePath)) {
					fs.writeFileSync(
						this.configFilePath,
						JSON.stringify(this.baseProviderConfig, null, 4),
						"utf8",
					);
					Logger.info(`[Ollama] Auto-updated config with ${modelConfigs.length} models`);
				}
			}
		} catch (err) {
			Logger.warn(`[Ollama] Config update failed:`, err);
		}
	}

	override async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: readonly LanguageModelChatMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<LanguageModelResponsePart>,
		token: CancellationToken,
	): Promise<void> {
		await RateLimiter.getInstance(this.providerKey, 2, 1000).throttle(
			this.providerConfig.displayName,
		);

		try {
			const rememberLastModel = ConfigManager.getRememberLastModel();
			if (rememberLastModel) {
				this.modelInfoCache
					?.saveLastSelectedModel(this.providerKey, model.id)
					.catch((err) =>
						Logger.warn(
							"[Ollama] Failed to save model selection",
							err instanceof Error ? err.message : String(err),
						),
					);
			}

			const apiKey = await this.ensureApiKey(false);
			if (!apiKey) {
				throw new Error("Ollama API key not found");
			}

			if (options.tools && options.tools.length > 128) {
				throw new Error("Cannot have more than 128 tools per request.");
			}

			// Get model config
			const modelConfig = this.providerConfig.models.find(
				(m) => m.id === model.id,
			);

			// Create OpenAI client
			const client = await this.createOpenAIClient(apiKey, modelConfig);

			// Convert messages using OpenAIHandler
			const openaiMessages = this.openaiHandler.convertMessagesToOpenAI(
				messages as any,
				model.capabilities || undefined,
				modelConfig,
			);

			// Create stream parameters
			const createParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
				model: model.id,
				messages: openaiMessages,
				stream: true,
				stream_options: { include_usage: true },
				max_tokens: Math.min(
					options.modelOptions?.max_tokens || 4096,
					model.maxOutputTokens,
				),
				temperature:
					options.modelOptions?.temperature ?? ConfigManager.getTemperature(),
				top_p: ConfigManager.getTopP(),
			};

			// Add model options
			if (options.modelOptions) {
				const mo = options.modelOptions as Record<string, unknown>;
				if (typeof mo.stop === "string" || Array.isArray(mo.stop)) {
					createParams.stop = mo.stop;
				}
				if (typeof mo.frequency_penalty === "number") {
					createParams.frequency_penalty = mo.frequency_penalty;
				}
				if (typeof mo.presence_penalty === "number") {
					createParams.presence_penalty = mo.presence_penalty;
				}
			}

			// Add tools if supported
			if (
				options.tools &&
				options.tools.length > 0 &&
				model.capabilities?.toolCalling
			) {
				createParams.tools = this.openaiHandler.convertToolsToOpenAI([
					...options.tools,
				]);
				createParams.tool_choice = "auto";
			}

			// Use OpenAI SDK streaming
			const abortController = new AbortController();
			token.onCancellationRequested(() => abortController.abort());

			const stream = client.chat.completions.stream(createParams, {
				signal: abortController.signal,
			});

			let currentThinkingId: string | null = null;
			let thinkingContentBuffer = "";
			let _hasReceivedContent = false;
			let hasThinkingContent = false;

			// Store tool call IDs by index
			const toolCallIds = new Map<number, string>();
			const processedToolCallEvents = new Set<string>();

			// Handle chunks for reasoning_content
			stream.on("chunk", (chunk: OpenAI.Chat.ChatCompletionChunk) => {
				if (token.isCancellationRequested) {
					return;
				}

				// Capture tool call IDs
				if (chunk.choices && chunk.choices.length > 0) {
					for (const choice of chunk.choices) {
						if (choice.delta?.tool_calls) {
							for (const toolCall of choice.delta.tool_calls) {
								if (toolCall.id && toolCall.index !== undefined) {
									toolCallIds.set(toolCall.index, toolCall.id);
								}
							}
						}

						const delta = choice.delta as
							| { reasoning?: string; reasoning_content?: string }
							| undefined;
						const reasoningContent =
							delta?.reasoning ?? delta?.reasoning_content;

						if (reasoningContent && typeof reasoningContent === "string") {
							if (!currentThinkingId) {
								currentThinkingId = `ollama_thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
							}
							thinkingContentBuffer += reasoningContent;
							try {
								progress.report(
									new vscode.LanguageModelThinkingPart(
										thinkingContentBuffer,
										currentThinkingId,
									) as unknown as LanguageModelResponsePart,
								);
								thinkingContentBuffer = "";
								hasThinkingContent = true;
							} catch (e) {
								Logger.warn(
									"[Ollama] Failed to report thinking",
									e instanceof Error ? e.message : String(e),
								);
							}
						}
					}
				}
			});

			// Handle content stream
			stream.on("content", (delta: string) => {
				if (token.isCancellationRequested) {
					return;
				}

				// Handle regular content
				if (delta && typeof delta === "string" && delta.trim().length > 0) {
					// End thinking if we're starting to output regular content
					if (currentThinkingId) {
						try {
							progress.report(
								new vscode.LanguageModelThinkingPart(
									"",
									currentThinkingId,
								) as unknown as LanguageModelResponsePart,
							);
						} catch {
							// ignore
						}
						currentThinkingId = null;
					}

					try {
						progress.report(new vscode.LanguageModelTextPart(delta));
						_hasReceivedContent = true;
					} catch (e) {
						Logger.warn(
							"[Ollama] Failed to report content",
							e instanceof Error ? e.message : String(e),
						);
					}
				}
			});

			// Handle tool calls
			stream.on("tool_calls.function.arguments.done", (event) => {
				if (token.isCancellationRequested) {
					return;
				}

				const eventKey = `tool_call_${event.name}_${event.index}_${event.arguments?.length ?? 0}`;
				if (processedToolCallEvents.has(eventKey)) {
					Logger.trace(
						`[Ollama] Skip duplicate tool call event: ${event.name} (index: ${event.index})`,
					);
					return;
				}
				processedToolCallEvents.add(eventKey);
				// Finalize thinking before tool calls
				if (currentThinkingId) {
					try {
						progress.report(
							new vscode.LanguageModelThinkingPart(
								"",
								currentThinkingId,
							) as unknown as LanguageModelResponsePart,
						);
					} catch {
						// ignore
					}
					currentThinkingId = null;
				}

				// Report tool call to VS Code
				const toolCallId =
					toolCallIds.get(event.index) ||
					`tool_call_${event.index}_${Date.now()}`;

				// Use parameters parsed by SDK (priority) or manually parse arguments string
				let parsedArgs: object = {};
				if (event.parsed_arguments) {
					const result = event.parsed_arguments;
					parsedArgs =
						typeof result === "object" && result !== null ? result : {};
				} else {
					try {
						parsedArgs = JSON.parse(event.arguments || "{}");
					} catch {
						parsedArgs = { value: event.arguments };
					}
				}

				try {
					progress.report(
						new vscode.LanguageModelToolCallPart(
							toolCallId,
							event.name,
							parsedArgs,
						),
					);
					_hasReceivedContent = true;
				} catch (e) {
					Logger.warn(
						"[Ollama] Failed to report tool call",
						e instanceof Error ? e.message : String(e),
					);
				}
			});

			// Wait for stream to complete
			try {
				await stream.finalChatCompletion();
			} catch (err) {
				// Handle case where stream ends without finish_reason
				// Some providers (like Ollama) don't send a final chunk with finish_reason
				if (
					err instanceof Error &&
					err.message.includes("missing finish_reason")
				) {
					Logger.debug(
						"[Ollama] Stream completed without finish_reason, ignoring error",
					);
				} else {
					throw err;
				}
			}

			// Finalize thinking if still active
			if (currentThinkingId) {
				try {
					progress.report(
						new vscode.LanguageModelThinkingPart(
							"",
							currentThinkingId,
						) as unknown as LanguageModelResponsePart,
					);
				} catch {
					// ignore
				}
			}

			// Only add <think/> placeholder if thinking content was output but no content was output
			if (hasThinkingContent && !_hasReceivedContent) {
				progress.report(new vscode.LanguageModelTextPart("<think/>"));
				Logger.warn(
					"[Ollama] End of message stream has only thinking content and no text content, added <think/> placeholder as output",
				);
			}
		} catch (error) {
			Logger.error(
				"[Ollama] Chat request failed",
				error instanceof Error ? error.message : String(error),
			);
			throw error;
		}
	}

	/**
	 * Create OpenAI client for Ollama API
	 */
	private async createOpenAIClient(
		apiKey: string,
		modelConfig: any,
	): Promise<OpenAI> {
		const baseUrl =
			modelConfig?.baseUrl ||
			this.providerConfig.baseUrl ||
			"http://localhost:11434/v1";
		const cacheKey = `ollama:${baseUrl}`;
		const cached = this.clientCache.get(cacheKey);
		if (cached) {
			cached.lastUsed = Date.now();
			return cached.client;
		}

		const client = new OpenAI({
			apiKey: apiKey,
			baseURL: baseUrl,
			defaultHeaders: {
				"User-Agent": this.userAgent,
			},
			maxRetries: 2,
			timeout: 60000,
		});

		this.clientCache.set(cacheKey, { client, lastUsed: Date.now() });
		return client;
	}

	async provideTokenCount(
		model: LanguageModelChatInformation,
		text: string | LanguageModelChatMessage,
		_token: CancellationToken,
	): Promise<number> {
		return TokenCounter.getInstance().countTokens(model, text);
	}

	private async ensureApiKey(silent: boolean): Promise<string | undefined> {
		let apiKey = await ApiKeyManager.getApiKey(this.providerKey);
		if (!apiKey && !silent) {
			await ApiKeyManager.promptAndSetApiKey(
				this.providerKey,
				this.providerConfig.displayName,
				this.providerConfig.apiKeyTemplate,
			);
			apiKey = await ApiKeyManager.getApiKey(this.providerKey);
		}
		return apiKey;
	}

	static createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: OllamaProvider; disposables: vscode.Disposable[] } {
		Logger.trace(`${providerConfig.displayName} provider activated!`);
		const extVersion = getExtensionVersion();
		const vscodeVersion = vscode.version;
		const ua = `better-copilot-chat/${extVersion} VSCode/${vscodeVersion}`;

		const extensionPath = context.extensionPath;
		const provider = new OllamaProvider(
			context,
			providerKey,
			providerConfig,
			ua,
			extensionPath,
		);
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			`chp.${providerKey}`,
			provider,
		);

		const setApiKeyCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.setApiKey`,
			async () => {
				await ProviderWizard.startWizard({
					providerKey,
					displayName: providerConfig.displayName,
					apiKeyTemplate: providerConfig.apiKeyTemplate,
					supportsApiKey: true,
					supportsBaseUrl: true
				});
				await provider.modelInfoCache?.invalidateCache(providerKey);
				provider._onDidChangeLanguageModelChatInformation.fire(undefined);
			},
		);

		const disposables = [providerDisposable, setApiKeyCommand];
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}
		return { provider, disposables };
	}
}
