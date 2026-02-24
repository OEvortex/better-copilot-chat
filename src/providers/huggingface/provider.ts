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
import { ApiKeyManager } from "../../utils/apiKeyManager";
import { ConfigManager } from "../../utils/configManager";
import { Logger } from "../../utils/logger";
import { RateLimiter } from "../../utils/rateLimiter";
import { TokenCounter } from "../../utils/tokenCounter";
import { ProviderWizard } from "../../utils/providerWizard";
import { GenericModelProvider } from "../common/genericModelProvider";
import type { HFModelItem, HFModelsResponse } from "./types";
import { validateRequest } from "./utils";

const BASE_URL = "https://router.huggingface.co/v1";
const DEFAULT_MAX_OUTPUT_TOKENS = 16 * 1024; // 16384
const DEFAULT_CONTEXT_LENGTH = 128 * 1024; // 131072

import {
	resolveGlobalCapabilities,
	resolveGlobalTokenLimits,
} from "../../utils";

function resolveTokenLimits(
	modelId: string,
	contextLength: number,
): { maxInputTokens: number; maxOutputTokens: number } {
	return resolveGlobalTokenLimits(modelId, contextLength, {
		defaultContextLength: DEFAULT_CONTEXT_LENGTH,
		defaultMaxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
	});
} 

export class HuggingfaceProvider
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
			Logger.debug(`[HuggingFace] Clearing ${this.clientCache.size} cached OpenAI clients due to config change`);
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

		const infos: LanguageModelChatInformation[] = models.flatMap((m) => {
			const providers = m?.providers ?? [];
			const modalities = m.architecture?.input_modalities ?? [];
			const baseModelId = m.id;
			const detectedVision =
				Array.isArray(modalities) && modalities.includes("image");
			const capabilities = resolveGlobalCapabilities(baseModelId, {
				detectedImageInput: detectedVision,
			});

			const toolProviders = providers;
			const entries: LanguageModelChatInformation[] = [];

			if (toolProviders.length > 0) {
				const contextLengths = toolProviders
					.map((p) =>
						typeof p?.context_length === "number" && p.context_length > 0
							? p.context_length
							: undefined,
					)
					.filter((len): len is number => typeof len === "number");
				const aggregateContextLen =
					contextLengths.length > 0
						? Math.min(...contextLengths)
						: DEFAULT_CONTEXT_LENGTH;

				const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(
					baseModelId,
					aggregateContextLen,
				);

				const aggregateCapabilities = capabilities;
				entries.push({
					id: `${m.id}:cheapest`,
					name: `${m.id} (cheapest)`,
					tooltip: "Hugging Face via the cheapest provider",
					family: "huggingface",
					version: "1.0.0",
					maxInputTokens,
					maxOutputTokens,
					capabilities: aggregateCapabilities,
				} as LanguageModelChatInformation);
				entries.push({
					id: `${m.id}:fastest`,
					name: `${m.id} (fastest)`,
					tooltip: "Hugging Face via the fastest provider",
					family: "huggingface",
					version: "1.0.0",
					maxInputTokens,
					maxOutputTokens,
					capabilities: aggregateCapabilities,
				} as LanguageModelChatInformation);
			}

			for (const p of toolProviders) {
				const contextLen = p?.context_length ?? DEFAULT_CONTEXT_LENGTH;

				const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(
					baseModelId,
					contextLen,
				);

				entries.push({
					id: `${m.id}:${p.provider}`,
					name: `${m.id} via ${p.provider}`,
					tooltip: `Hugging Face via ${p.provider}`,
					family: "huggingface",
					version: "1.0.0",
					maxInputTokens,
					maxOutputTokens,
					capabilities: {
						toolCalling: capabilities.toolCalling,
						imageInput: capabilities.imageInput,
					},
				} as LanguageModelChatInformation);
			}

			if (toolProviders.length === 0 && providers.length > 0) {
				const base = providers[0];
				const contextLen = base?.context_length ?? DEFAULT_CONTEXT_LENGTH;

				const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(
					baseModelId,
					contextLen,
				);

				entries.push({
					id: m.id,
					name: m.id,
					tooltip: "Hugging Face",
					family: "huggingface",
					version: "1.0.0",
					maxInputTokens,
					maxOutputTokens,
					capabilities: {
						toolCalling: capabilities.toolCalling,
						imageInput: capabilities.imageInput,
					},
				} as LanguageModelChatInformation);
			}

			return entries;
		});

		const dedupedInfos = this.dedupeModelInfos(infos);

		this._chatEndpoints = dedupedInfos.map((info) => ({
			model: info.id,
			modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens,
		}));

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
	): Promise<{ models: HFModelItem[] }> {
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
						"[Hugging Face Model Provider] Failed to read response text",
						error,
					);
				}
				const err = new Error(
					`Failed to fetch Hugging Face models: ${resp.status} ${resp.statusText}${text ? `\n${text}` : ""}`,
				);
				Logger.error(
					"[Hugging Face Model Provider] Failed to fetch Hugging Face models",
					err,
				);
				throw err;
			}
			const parsed = (await resp.json()) as HFModelsResponse;
			return parsed.data ?? [];
		})();

		try {
			const models = await modelsList;
			return { models };
		} catch (err) {
			Logger.error(
				"[Hugging Face Model Provider] Failed to fetch Hugging Face models",
				err,
			);
			throw err;
		}
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
				throw new Error("Hugging Face API key not found");
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
				Logger.error(
					"[Hugging Face Model Provider] Message exceeds token limit",
					{
						total: inputTokenCount + toolTokenCount,
						tokenLimit,
					},
				);
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
								currentThinkingId = `hf_thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
									"[Hugging Face] Failed to report thinking",
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
							"[Hugging Face] Failed to report content",
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
						"[Hugging Face] Failed to report tool call",
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

			// Only add <think/> placeholder if thinking content was output but no content was output
			if (hasThinkingContent && !_hasReceivedContent) {
				progress.report(new vscode.LanguageModelTextPart("<think/>"));
				Logger.warn(
					"[Hugging Face] End of message stream has only thinking content and no text content, added <think/> placeholder as output",
				);
			}
		} catch (err) {
			Logger.error("[Hugging Face Model Provider] Chat request failed", {
				modelId: model.id,
				messageCount: messages.length,
				error:
					err instanceof Error
						? { name: err.name, message: err.message }
						: String(err),
			});
			throw err;
		}
	}

	/**
	 * Create OpenAI client for HuggingFace API
	 */
	private async createOpenAIClient(apiKey: string): Promise<OpenAI> {
		const baseUrl = this.providerConfig.baseUrl || BASE_URL;
		const cacheKey = `huggingface:${baseUrl}`;
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
		let apiKey = await ApiKeyManager.getApiKey("huggingface");
		if (!apiKey && !silent) {
			await ApiKeyManager.promptAndSetApiKey(
				"huggingface",
				"Hugging Face",
				"hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			);
			apiKey = await ApiKeyManager.getApiKey("huggingface");
		}
		return apiKey;
	}

	static createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: HuggingfaceProvider; disposables: vscode.Disposable[] } {
		Logger.trace(`${providerConfig.displayName} provider activated!`);
		const ext = vscode.extensions.getExtension("OEvortex.better-copilot-chat");
		const extVersion = ext?.packageJSON?.version ?? "unknown";
		const vscodeVersion = vscode.version;
		const ua = `better-copilot-chat/${extVersion} VSCode/${vscodeVersion}`;

		const provider = new HuggingfaceProvider(
			context,
			providerKey,
			providerConfig,
			ua,
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
