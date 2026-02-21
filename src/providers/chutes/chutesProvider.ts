/*---------------------------------------------------------------------------------------------
 *  Chutes Provider
 *  Dynamically fetches models from Chutes API and auto-updates config
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
	getDefaultMaxOutputTokensForContext,
	resolveGlobalCapabilities,
} from "../../utils/globalContextLengthManager";
import { Logger } from "../../utils/logger";
import { RateLimiter } from "../../utils/rateLimiter";
import { TokenCounter } from "../../utils/tokenCounter";
import { ProviderWizard } from "../../utils/providerWizard";
import { GenericModelProvider } from "../common/genericModelProvider";
import type { ChutesModelItem, ChutesModelsResponse } from "./types";
import { validateRequest } from "./utils";

const BASE_URL = "https://llm.chutes.ai/v1";
const DEFAULT_MAX_OUTPUT_TOKENS = 16000;
const DEFAULT_CONTEXT_LENGTH = 131072;

// Output token constants based on context length thresholds
const HIGH_CONTEXT_OUTPUT_TOKENS = 32000;   // >= 200K context -> 32K output
const MEDIUM_CONTEXT_OUTPUT_TOKENS = 16000;  // >= 128K context -> 16K output
const LOW_CONTEXT_OUTPUT_TOKENS = 8000;       // < 128K context -> 8K output

/**
 * Calculate token limits based on the API's context_length
 * - context_length >= 200K: output = 32K, input = context - 32K
 * - context_length >= 128K: output = 16K, input = context - 16K
 * - context_length < 128K: output = 8K, input = context - 8K
 */
function resolveTokenLimits(
	modelId: string,
	contextLength: number,
): { maxInputTokens: number; maxOutputTokens: number } {
	// Determine output tokens based on context length thresholds
	let maxOutputTokens: number;
	if (contextLength >= 200000) {
		maxOutputTokens = HIGH_CONTEXT_OUTPUT_TOKENS;
	} else if (contextLength >= 128000) {
		maxOutputTokens = MEDIUM_CONTEXT_OUTPUT_TOKENS;
	} else {
		maxOutputTokens = LOW_CONTEXT_OUTPUT_TOKENS;
	}

	// Calculate input tokens: context_length - output
	const maxInputTokens = Math.max(1, contextLength - maxOutputTokens);

	return {
		maxInputTokens,
		maxOutputTokens,
	};
}

/**
 * Chutes dedicated model provider class
 * Dynamically fetches models from API and auto-updates config file
 */
export class ChutesProvider
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
		// Path to chutes.json config file
		this.configFilePath = path.join(
			this.extensionPath,
			"src",
			"providers",
			"config",
			"chutes.json",
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
			Logger.debug(`[Chutes] Clearing ${this.clientCache.size} cached OpenAI clients due to config change`);
			this.clientCache.clear();
		}
		// Then call parent to refresh openaiHandler and anthropicHandler
		super.refreshHandlers();
	}

	private estimateMessagesTokens(
		msgs: readonly vscode.LanguageModelChatMessage[],
	): number {
		let total = 0;
		for (const m of msgs) {
			for (const part of m.content) {
				if (part instanceof vscode.LanguageModelTextPart) {
					total += Math.ceil(part.value.length / 4);
				}
			}
		}
		return total;
	}

	private estimateToolTokens(
		tools:
			| {
					type: string;
					function: { name: string; description?: string; parameters?: object };
			  }[]
			| undefined,
	): number {
		if (!tools || tools.length === 0) {
			return 0;
		}
		try {
			const json = JSON.stringify(tools);
			return Math.ceil(json.length / 4);
		} catch {
			return 0;
		}
	}

	async prepareLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		const apiKey = await this.ensureApiKey(options.silent ?? true);
		if (!apiKey) {
			return [];
		}

		const { models } = await this.fetchModels(apiKey);

		// Auto-update config file in background (non-blocking)
		this.updateConfigFileAsync(models);

		const infos: LanguageModelChatInformation[] = models.map((m) => {
			const modalities = m.input_modalities ?? [];
			const modelId = m.id;
			const detectedVision =
				Array.isArray(modalities) && modalities.includes("image");
			const capabilities = resolveGlobalCapabilities(modelId, {
				detectedImageInput: detectedVision,
			});

			const contextLen =
				m.context_length ?? m.max_model_len ?? DEFAULT_CONTEXT_LENGTH;
			const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(
				modelId,
				contextLen,
			);

			return {
				id: modelId,
				name: modelId,
				tooltip: `${modelId} by Chutes`,
				family: "chutes",
				version: "1.0.0",
				maxInputTokens,
				maxOutputTokens,
				capabilities,
			} as LanguageModelChatInformation;
		});

		this._chatEndpoints = infos.map((info) => ({
			model: info.id,
			modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens,
		}));

		const dedupedInfos = this.dedupeModelInfos(infos);

		return dedupedInfos;
	}

	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		return this.prepareLanguageModelChatInformation(
			{ silent: options.silent ?? false },
			_token,
		);
	}

	private async fetchModels(
		apiKey: string,
	): Promise<{ models: ChutesModelItem[] }> {
		const modelsList = (async () => {
			const baseUrl = this.providerConfig.baseUrl || BASE_URL;
			const resp = await fetch(`${baseUrl}/models`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"User-Agent": this.userAgent,
				},
			});
			if (!resp.ok) {
				let text = "";
				try {
					text = await resp.text();
				} catch (error) {
					Logger.error(
						"[Chutes Model Provider] Failed to read response text",
						error,
					);
				}
				const err = new Error(
					`Failed to fetch Chutes models: ${resp.status} ${resp.statusText}${text ? `\n${text}` : ""}`,
				);
				Logger.error(
					"[Chutes Model Provider] Failed to fetch Chutes models",
					err,
				);
				throw err;
			}
			const parsed = (await resp.json()) as ChutesModelsResponse;
			return parsed.data ?? [];
		})();

		try {
			const models = await modelsList;
			return { models };
		} catch (err) {
			Logger.error(
				"[Chutes Model Provider] Failed to fetch Chutes models",
				err,
			);
			throw err;
		}
	}

	/**
	 * Update config file asynchronously in background
	 */
	private updateConfigFileAsync(models: ChutesModelItem[]): void {
		// Execute in background, do not wait for result
		(async () => {
			try {
				// Check if config file exists (might not exist in packaged extension)
				if (!fs.existsSync(this.configFilePath)) {
					Logger.debug(
						`[Chutes] Config file not found at ${this.configFilePath}, skipping auto-update`,
					);
					return;
				}

				const modelConfigs: ModelConfig[] = models.map((m) => {
					const modalities = m.input_modalities ?? [];
					const modelId = m.id;
					const detectedVision =
						Array.isArray(modalities) && modalities.includes("image");
					const capabilities = resolveGlobalCapabilities(modelId, {
						detectedImageInput: detectedVision,
					});

					const contextLen =
						m.context_length ?? m.max_model_len ?? DEFAULT_CONTEXT_LENGTH;
					const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(
						modelId,
						contextLen,
					);

					// Generate a clean ID from model ID (remove special characters, keep slashes as hyphens)
					const cleanId = m.id
						.replace(/[/]/g, "-")
						.replace(/[^a-zA-Z0-9-]/g, "-")
						.toLowerCase();

					return {
						id: cleanId,
						name: modelId,
						tooltip: `${modelId} by Chutes`,
						maxInputTokens,
						maxOutputTokens,
						model: modelId,
						capabilities,
					} as ModelConfig;
				});

				// Read existing config to preserve baseUrl and apiKeyTemplate
				let existingConfig: ProviderConfig;
				try {
					const configContent = fs.readFileSync(this.configFilePath, "utf8");
					existingConfig = JSON.parse(configContent);
				} catch (err) {
					Logger.warn(
						`[Chutes] Failed to read existing config, using defaults:`,
						err instanceof Error ? err.message : String(err),
					);
					// If file doesn't exist or is invalid, use defaults
					existingConfig = {
						displayName: "Chutes",
						baseUrl: BASE_URL,
						apiKeyTemplate:
							"cpk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
						models: [],
					};
				}

				// Update config with new models
				const updatedConfig: ProviderConfig = {
					displayName: existingConfig.displayName || "Chutes",
					baseUrl: existingConfig.baseUrl || BASE_URL,
					apiKeyTemplate:
						existingConfig.apiKeyTemplate ||
						"cpk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
					models: modelConfigs,
				};

				// Write updated config to file
				fs.writeFileSync(
					this.configFilePath,
					JSON.stringify(updatedConfig, null, 4),
					"utf8",
				);
				Logger.info(
					`[Chutes] Auto-updated config file with ${modelConfigs.length} models`,
				);
			} catch (err) {
				// Background update failure should not affect extension operation
				Logger.warn(
					`[Chutes] Background config update failed:`,
					err instanceof Error ? err.message : String(err),
				);
			}
		})();
	}

	override async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: readonly LanguageModelChatMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<LanguageModelResponsePart>,
		token: CancellationToken,
	): Promise<void> {
		// Apply rate limiting: 2 requests per 1 second
		await RateLimiter.getInstance(this.providerKey, 2, 1000).throttle(
			this.providerConfig.displayName,
		);

		try {
			const apiKey = await this.ensureApiKey(true);
			if (!apiKey) {
				throw new Error("Chutes API key not found");
			}

			validateRequest(
				messages as readonly vscode.LanguageModelChatRequestMessage[],
			);

			if (options.tools && options.tools.length > 128) {
				throw new Error("Cannot have more than 128 tools per request.");
			}

			const inputTokenCount = this.estimateMessagesTokens(
				messages as readonly vscode.LanguageModelChatMessage[],
			);
			const toolTokenCount = options.tools
				? this.estimateToolTokens(
						this.openaiHandler.convertToolsToOpenAI([...options.tools]) as
							| {
									type: string;
									function: {
										name: string;
										description?: string;
										parameters?: object;
									};
							  }[]
							| undefined,
					)
				: 0;
			const tokenLimit = Math.max(1, model.maxInputTokens);
			if (inputTokenCount + toolTokenCount > tokenLimit) {
				Logger.error("[Chutes Model Provider] Message exceeds token limit", {
					total: inputTokenCount + toolTokenCount,
					tokenLimit,
				});
				throw new Error("Message exceeds token limit.");
			}

			// Create OpenAI client
			const client = await this.createOpenAIClient(apiKey);

			// Get model config for conversion
			const modelConfig = this.providerConfig.models.find(
				(m) => m.id === model.id,
			);

			// Convert messages using OpenAIHandler
			const openaiMessages = this.openaiHandler.convertMessagesToOpenAI(
				messages,
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
			((createParams as unknown) as Record<string, unknown>).reasoning_effort =
				typeof reasoningEffort === "string" && reasoningEffort.length > 0
					? reasoningEffort
					: "medium";

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

			// Add tools using OpenAIHandler
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
								currentThinkingId = `chutes_thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
									"[Chutes] Failed to report thinking",
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
							"[Chutes] Failed to report content",
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
						"[Chutes] Failed to report tool call",
						e instanceof Error ? e.message : String(e),
					);
				}
			});

			// Wait for stream to complete
			await stream.finalChatCompletion();

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
		} catch (err) {
			Logger.error("[Chutes Model Provider] Chat request failed", {
				modelId: model.id,
				messageCount: messages.length,
				error:
					err instanceof Error
						? { name: err.name, message: err.message }
						: String(err),
			});
			throw err;
		} finally {
			// Track global request count
			this.incrementRequestCount();
		}
	}

	/**
	 * Create OpenAI client for Chutes API
	 */
	private async createOpenAIClient(apiKey: string): Promise<OpenAI> {
		const baseUrl = this.providerConfig.baseUrl || BASE_URL;
		const cacheKey = `chutes:${baseUrl}`;
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
		let apiKey = await ApiKeyManager.getApiKey("chutes");
		if (!apiKey && !silent) {
			await ApiKeyManager.promptAndSetApiKey(
				"chutes",
				"Chutes",
				"cpk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			);
			apiKey = await ApiKeyManager.getApiKey("chutes");
		}
		return apiKey;
	}

	/**
	 * Increment global request count and update status bar
	 */
	private incrementRequestCount(): void {
		const today = new Date().toDateString();

		let count =
			this.context?.globalState.get<number>("chutes.requestCount") || 0;
		const lastReset = this.context?.globalState.get<string>(
			"chutes.lastResetDate",
		);

		if (lastReset !== today) {
			count = 1;
			this.context?.globalState.update("chutes.lastResetDate", today);
		} else {
			count++;
		}

		this.context?.globalState.update("chutes.requestCount", count);
		Logger.debug(`[Chutes] Global request count: ${count}/5000`);
	}

	static createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: ChutesProvider; disposables: vscode.Disposable[] } {
		Logger.trace(`${providerConfig.displayName} provider activated!`);
		const ext = vscode.extensions.getExtension("OEvortex.better-copilot-chat");
		const extVersion = ext?.packageJSON?.version ?? "unknown";
		const vscodeVersion = vscode.version;
		const ua = `better-copilot-chat/${extVersion} VSCode/${vscodeVersion}`;

		const extensionPath = context.extensionPath;
		const provider = new ChutesProvider(
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
				// Clear cached models and notify VS Code the available models may have changed
				await provider.modelInfoCache?.invalidateCache(providerKey);
				provider._onDidChangeLanguageModelChatInformation.fire(undefined);
			},
		);

		const disposables = [providerDisposable, setApiKeyCommand];
		for (const d of disposables) {
			context.subscriptions.push(d);
		}
		return { provider, disposables };
	}
}
