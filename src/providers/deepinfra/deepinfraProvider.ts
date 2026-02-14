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
import type { ProviderConfig } from "../../types/sharedTypes";
import {
	ApiKeyManager,
	ConfigManager,
	Logger,
	RateLimiter,
	TokenCounter,
} from "../../utils";
import { ProviderWizard } from "../../utils/providerWizard";
import { GenericModelProvider } from "../common/genericModelProvider";
import type { DeepInfraModelItem, DeepInfraModelsResponse } from "./types";

const DEFAULT_CONTEXT_LENGTH = 128000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16000;
const HIGH_CONTEXT_THRESHOLD = 200000;
const HIGH_CONTEXT_MAX_OUTPUT_TOKENS = 32000;
const FIXED_256K_MAX_INPUT_TOKENS = 224000;
const FIXED_256K_MAX_OUTPUT_TOKENS = 32000;

function isMinimaxModel(modelId: string): boolean {
	return /minimax/i.test(modelId);
}

function isKimiModel(modelId: string): boolean {
	return /kimi/i.test(modelId);
}

function isKimiK25Model(modelId: string): boolean {
	return /kimi[-_\/]?k2(?:\.|-)5/i.test(modelId);
}

function resolveTokenLimits(
	modelId: string,
	contextLength: number,
): { maxInputTokens: number; maxOutputTokens: number } {
	if (isMinimaxModel(modelId) || isKimiModel(modelId)) {
		return {
			maxInputTokens: FIXED_256K_MAX_INPUT_TOKENS,
			maxOutputTokens: FIXED_256K_MAX_OUTPUT_TOKENS,
		};
	}

	const safeContextLength =
		typeof contextLength === "number" && contextLength > 1024
			? contextLength
			: DEFAULT_CONTEXT_LENGTH;

	let maxOutput =
		safeContextLength >= HIGH_CONTEXT_THRESHOLD
			? HIGH_CONTEXT_MAX_OUTPUT_TOKENS
			: DEFAULT_MAX_OUTPUT_TOKENS;
	maxOutput = Math.floor(Math.max(1, Math.min(maxOutput, safeContextLength - 1024)));

	return {
		maxInputTokens: Math.max(1, safeContextLength - maxOutput),
		maxOutputTokens: maxOutput,
	};
}

/**
 * DeepInfra dedicated model provider class
 * Uses OpenAI-compatible endpoints: https://api.deepinfra.com/v1/openai
 */
export class DeepInfraProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	private readonly userAgent: string;
	private clientCache = new Map<string, { client: OpenAI; lastUsed: number }>();

	constructor(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
		userAgent: string,
	) {
		super(context, providerKey, providerConfig);
		this.userAgent = userAgent;
	}

	/**
	 * Override refreshHandlers to also clear the OpenAI client cache
	 * This ensures that when baseUrl changes, new clients are created with the correct URL
	 */
	protected override refreshHandlers(): void {
		// Clear our client cache first - baseUrl may have changed
		// Only clear if the cache has already been initialized (might not be if called from constructor)
		if (this.clientCache && this.clientCache.size > 0) {
			Logger.debug(`[DeepInfra] Clearing ${this.clientCache.size} cached OpenAI clients due to config change`);
			this.clientCache.clear();
		}
		// Then call parent to refresh openaiHandler and anthropicHandler
		super.refreshHandlers();
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

	private async fetchModels(apiKey: string): Promise<DeepInfraModelItem[]> {
		try {
			const baseUrl =
				this.providerConfig.baseUrl ||
				"https://api.deepinfra.com/v1/openai";
			const modelsUrl = `${baseUrl}/models`;
			Logger.debug(`[DeepInfra] Fetching models from: ${modelsUrl}`);

			const abortController = new AbortController();
			const timeoutId = setTimeout(() => abortController.abort(), 10000); // 10 second timeout

			try {
				const resp = await fetch(modelsUrl, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"User-Agent": this.userAgent,
					},
					signal: abortController.signal,
				});

				clearTimeout(timeoutId);

				if (!resp.ok) {
					const text = await resp.text();
					Logger.warn(
						`[DeepInfra] Failed to fetch models: ${resp.status} ${resp.statusText}`,
					);
					if (resp.status === 429) {
						Logger.warn(
							"[DeepInfra] Rate limited (429). Will retry with pre-configured models.",
						);
					}
					return [];
				}

				const parsed = (await resp.json()) as DeepInfraModelsResponse;
				const models = parsed.data || [];
				Logger.info(`[DeepInfra] Successfully fetched ${models.length} models`);
				return models;
			} catch (fetchError) {
				clearTimeout(timeoutId);
				if (
					fetchError instanceof Error &&
					fetchError.name === "AbortError"
				) {
					Logger.warn(
						"[DeepInfra] Model fetch timeout (10s). Using pre-configured models.",
					);
				} else {
					Logger.warn(
						`[DeepInfra] Model fetch failed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}. Using pre-configured models.`,
					);
				}
				return [];
			}
		} catch (err) {
			Logger.warn(
				"[DeepInfra] Error in fetchModels:",
				err instanceof Error ? err.message : String(err),
			);
			return [];
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

		let models = await this.fetchModels(apiKey);

		// If API fetch fails or returns no models, fall back to pre-configured models
		if (!models || models.length === 0) {
			Logger.info(
				"[DeepInfra] No models from API, using pre-configured models from config",
			);
			// Convert pre-configured models to the same format
			const preConfiguredModels = this.providerConfig.models.map(
				(m) =>
					({
						id: m.id,
						object: "model",
						created: 0,
						owned_by: "deepinfra",
						metadata: {
							description: m.tooltip || "",
							context_length:
								(m.maxInputTokens || DEFAULT_CONTEXT_LENGTH) +
								(m.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS),
							max_tokens: m.maxOutputTokens || 16000,
						},
					}) as DeepInfraModelItem,
			);
			models = preConfiguredModels;
		}

		// Filter models: must have metadata, max_tokens, and context_length
		const filteredModels = models.filter(
			(m) =>
				m.metadata &&
				typeof m.metadata.max_tokens === "number" &&
				typeof m.metadata.context_length === "number",
		);

		const infos: LanguageModelChatInformation[] = filteredModels.map((m) => {
			const metadata = m.metadata!;
			const modelId = m.id;
			const detectedVision = metadata.tags?.includes("vision") ?? false;
			const vision = isKimiModel(modelId)
				? isKimiK25Model(modelId)
				: detectedVision;

			// All models support tools as per user request
			const capabilities = {
				toolCalling: true,
				imageInput: vision,
			};

			const contextLen = metadata.context_length ?? DEFAULT_CONTEXT_LENGTH;
			const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(
				modelId,
				contextLen,
			);

			return {
				id: modelId,
				name: modelId,
				tooltip: metadata.description || `DeepInfra model: ${modelId}`,
				family: "deepinfra",
				version: "1.0.0",
				maxInputTokens,
				maxOutputTokens,
				capabilities: capabilities,
			} as LanguageModelChatInformation;
		});

		const dedupedInfos = this.dedupeModelInfos(infos);

		this._chatEndpoints = dedupedInfos.map((info) => ({
			model: info.id,
			modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens,
		}));

		return dedupedInfos;
	}

	override async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		try {
			const apiKeyHash = await this.getApiKeyHash();
			const cachedModels = await this.modelInfoCache?.getCachedModels(
				this.providerKey,
				apiKeyHash,
			);

			if (cachedModels) {
				// Background update
				this.prepareLanguageModelChatInformation(options, _token)
					.then((models) => {
						this.modelInfoCache?.cacheModels(
							this.providerKey,
							models,
							apiKeyHash,
						);
					})
					.catch(() => {});
				return cachedModels;
			}

			const models = await this.prepareLanguageModelChatInformation(
				options,
				_token,
			);
			if (models.length > 0) {
				await this.modelInfoCache?.cacheModels(
					this.providerKey,
					models,
					apiKeyHash,
				);
			}
			return models;
		} catch (error) {
			Logger.error("[DeepInfra] Failed to provide model info", error);
			return [];
		}
	}

	static createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: DeepInfraProvider; disposables: vscode.Disposable[] } {
		Logger.trace(`${providerConfig.displayName} provider activated!`);
		const ext = vscode.extensions.getExtension("OEvortex.better-copilot-chat");
		const extVersion = ext?.packageJSON?.version ?? "unknown";
		const vscodeVersion = vscode.version;
		const ua = `better-copilot-chat/${extVersion} VSCode/${vscodeVersion}`;

		const provider = new DeepInfraProvider(
			context,
			providerKey,
			providerConfig,
			ua,
		);
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			`chp.${providerKey}`,
			provider,
		);

		// Register configuration command
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
				// Invalidate cache and trigger update
				await provider.modelInfoCache?.invalidateCache(providerKey);
				provider._onDidChangeLanguageModelChatInformation.fire();
			},
		);

		const disposables: vscode.Disposable[] = [
			providerDisposable,
			setApiKeyCommand,
		];
		for (const d of disposables) {
			context.subscriptions.push(d);
		}
		return { provider, disposables };
	}

	private async createOpenAIClient(apiKey: string): Promise<OpenAI> {
		// IMPORTANT: this.providerConfig uses the getter which returns cachedProviderConfig (with overrides applied)
		const baseURL =
			this.providerConfig.baseUrl ||
			"https://api.deepinfra.com/v1/openai";
		Logger.info(`[DeepInfra] Creating OpenAI client with baseURL: ${baseURL}`);
		// Include apiKey in cache key to differentiate clients for different accounts
		const cacheKey = `deepinfra:${apiKey}:${baseURL}`;
		const cached = this.clientCache.get(cacheKey);
		if (cached) {
			cached.lastUsed = Date.now();
			Logger.debug(`[DeepInfra] Using cached client for baseURL: ${baseURL}`);
			return cached.client;
		}

		const client = new OpenAI({
			apiKey: apiKey,
			baseURL: baseURL,
			defaultHeaders: {
				"User-Agent": this.userAgent,
			},
			maxRetries: 2,
			timeout: 60000,
		});

		this.clientCache.set(cacheKey, { client, lastUsed: Date.now() });
		Logger.info(`[DeepInfra] Created new OpenAI client for baseURL: ${baseURL}`);
		return client;
	}

	override async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: LanguageModelChatMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<LanguageModelResponsePart>,
		token: CancellationToken,
	): Promise<void> {
		// Apply rate limiting: 2 requests per 1 second
		await RateLimiter.getInstance(this.providerKey, 2, 1000).throttle(
			this.providerConfig.displayName,
		);

		try {
			Logger.info(`[DeepInfra] Starting request for model: ${model.name}`);

			const apiKey = await this.ensureApiKey(true);
			if (!apiKey) {
				throw new Error("DeepInfra API key not found");
			}

			const client = await this.createOpenAIClient(apiKey);
			const modelConfig = this.providerConfig.models.find(
				(m) => m.id === model.id,
			);

			const openaiMessages = this.openaiHandler.convertMessagesToOpenAI(
				messages,
				model.capabilities || undefined,
				modelConfig,
			);

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

			const abortController = new AbortController();
			token.onCancellationRequested(() => abortController.abort());

			const stream = client.chat.completions.stream(createParams, {
				signal: abortController.signal,
			});

			let currentThinkingId: string | null = null;
			let thinkingContentBuffer = "";
			let hasReceivedContent = false;
			let hasThinkingContent = false;

			// Store tool call IDs by index
			const toolCallIds = new Map<number, string>();

			stream.on("chunk", (chunk: OpenAI.Chat.ChatCompletionChunk) => {
				if (token.isCancellationRequested) {
					return;
				}

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
							| { reasoning_content?: string }
							| undefined;
						if (delta?.reasoning_content) {
							if (!currentThinkingId) {
								currentThinkingId = `di_thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
							}
							thinkingContentBuffer += delta.reasoning_content;
							progress.report(
								new vscode.LanguageModelThinkingPart(
									thinkingContentBuffer,
									currentThinkingId,
								) as unknown as vscode.LanguageModelResponsePart,
							);
							thinkingContentBuffer = "";
							hasThinkingContent = true;
						}
					}
				}
			});

			stream.on("content", (delta: string) => {
				if (token.isCancellationRequested) {
					return;
				}
				if (delta) {
					if (currentThinkingId) {
						progress.report(
							new vscode.LanguageModelThinkingPart(
								"",
								currentThinkingId,
							) as unknown as vscode.LanguageModelResponsePart,
						);
						currentThinkingId = null;
					}
					progress.report(new vscode.LanguageModelTextPart(delta));
					if (delta.trim().length > 0) {
						hasReceivedContent = true;
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
							) as unknown as vscode.LanguageModelResponsePart,
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
					hasReceivedContent = true;
				} catch (e) {
					Logger.warn(
						"[DeepInfra] Failed to report tool call",
						e instanceof Error ? e.message : String(e),
					);
				}
			});

			await stream.finalChatCompletion();

			if (currentThinkingId) {
				progress.report(
					new vscode.LanguageModelThinkingPart(
						"",
						currentThinkingId,
					) as unknown as vscode.LanguageModelResponsePart,
				);
			}

			// Only add <think/> placeholder if thinking content was output but no content was output
			if (hasThinkingContent && !hasReceivedContent) {
				progress.report(new vscode.LanguageModelTextPart("<think/>"));
				Logger.warn(
					"[DeepInfra] End of message stream has only thinking content and no text content, added <think/> placeholder as output",
				);
			}
		} catch (error) {
			Logger.error(
				`[DeepInfra] Request failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw error;
		}
	}

	async provideTokenCount(
		model: LanguageModelChatInformation,
		text: string | LanguageModelChatMessage,
		_token: CancellationToken,
	): Promise<number> {
		return TokenCounter.getInstance().countTokens(model, text);
	}
}
