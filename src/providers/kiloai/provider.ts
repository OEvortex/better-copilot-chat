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
import { TokenCounter } from "../../utils/tokenCounter";
import { GenericModelProvider } from "../common/genericModelProvider";
import type { KiloModelItem, KiloModelsResponse } from "./types";
import { validateRequest } from "./utils";

const BASE_URL = "https://api.kilo.ai/api/openrouter";
const DEFAULT_MAX_OUTPUT_TOKENS = 16000;
const DEFAULT_CONTEXT_LENGTH = 131072;

export class KiloAIProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
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

		const infos: LanguageModelChatInformation[] = models.map((m) => {
			// Accurate context length fetching: prefer model's context_length, then top_provider's, then default
			const contextLen =
				m.context_length ??
				m.top_provider?.context_length ??
				DEFAULT_CONTEXT_LENGTH;

			// Prefer max_completion_tokens from API, fall back to DEFAULT_MAX_OUTPUT_TOKENS
			let maxOutput =
				m.top_provider?.max_completion_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

			// Safety check: If maxOutput is suspiciously large (e.g. >= contextLen), use a safer default
			// to ensure there's enough room for input tokens.
			if (maxOutput >= contextLen) {
				maxOutput = Math.min(contextLen / 2, DEFAULT_MAX_OUTPUT_TOKENS);
			}

			// Ensure maxOutput is at least 1 and leave at least some room for input
			maxOutput = Math.floor(
				Math.max(1, Math.min(maxOutput, contextLen - 1024)),
			);

			// Input is the remaining context
			const maxInput = Math.max(1, contextLen - maxOutput);

			const modalities = m.architecture?.input_modalities ?? [];
			const vision = Array.isArray(modalities) && modalities.includes("image");

			return {
				id: m.id,
				name: m.name,
				tooltip: m.description || "Kilo AI Model",
				family: "kiloai",
				version: "1.0.0",
				maxInputTokens: maxInput,
				maxOutputTokens: maxOutput,
				capabilities: {
					toolCalling: m.supported_parameters?.includes("tools") ?? true,
					imageInput: vision,
				},
			} as LanguageModelChatInformation;
		});

		this._chatEndpoints = infos.map((info) => ({
			model: info.id,
			modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens,
		}));

		return infos;
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
	): Promise<{ models: KiloModelItem[] }> {
		try {
			const resp = await fetch(`${BASE_URL}/models`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"User-Agent": "Kilo-Code/4.140.2",
					"X-KiloCode-Version": "4.140.2",
					"HTTP-Referer": "https://kilocode.ai",
					"X-Title": "Kilo Code",
				},
			});
			if (!resp.ok) {
				let text = "";
				try {
					text = await resp.text();
				} catch (error) {
					Logger.error(
						"[Kilo AI Model Provider] Failed to read response text",
						error,
					);
				}
				const err = new Error(
					`Failed to fetch Kilo AI models: ${resp.status} ${resp.statusText}${text ? `\n${text}` : ""}`,
				);
				Logger.error(
					"[Kilo AI Model Provider] Failed to fetch Kilo AI models",
					err,
				);
				throw err;
			}
			const parsed = (await resp.json()) as KiloModelsResponse;
			return { models: parsed.data ?? [] };
		} catch (err) {
			Logger.error(
				"[Kilo AI Model Provider] Failed to fetch Kilo AI models",
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
		try {
			const apiKey = await this.ensureApiKey(true);
			if (!apiKey) {
				throw new Error("Kilo AI API key not found");
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
				Logger.error("[Kilo AI Model Provider] Message exceeds token limit", {
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

			// Handle chunks for reasoning_content
			stream.on("chunk", (chunk: OpenAI.Chat.ChatCompletionChunk) => {
				if (token.isCancellationRequested) {
					return;
				}

				// Process reasoning/reasoning_content from chunk choices
				if (chunk.choices && chunk.choices.length > 0) {
					for (const choice of chunk.choices) {
						const delta = choice.delta as
							| { reasoning?: string; reasoning_content?: string }
							| undefined;
						const reasoningContent =
							delta?.reasoning ?? delta?.reasoning_content;

						if (reasoningContent && typeof reasoningContent === "string") {
							if (!currentThinkingId) {
								currentThinkingId = `kilo_thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
							} catch (e) {
								Logger.warn(
									"[Kilo AI] Failed to report thinking",
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
					} catch (e) {
						Logger.warn(
							"[Kilo AI] Failed to report content",
							e instanceof Error ? e.message : String(e),
						);
					}
				}
			});

			// Handle tool calls
			stream.on("tool_calls.function.arguments.done", () => {
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
			Logger.error("[Kilo AI Model Provider] Chat request failed", {
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
	 * Create OpenAI client for Kilo AI API
	 */
	private async createOpenAIClient(apiKey: string): Promise<OpenAI> {
		const cacheKey = `kiloai:${BASE_URL}`;
		const cached = this.clientCache.get(cacheKey);
		if (cached) {
			cached.lastUsed = Date.now();
			return cached.client;
		}

		const client = new OpenAI({
			apiKey: apiKey,
			baseURL: BASE_URL,
			defaultHeaders: {
				"User-Agent": "Kilo-Code/4.140.2",
				"X-KiloCode-Version": "4.140.2",
				"HTTP-Referer": "https://kilocode.ai",
				"X-Title": "Kilo Code",
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
		let apiKey = await ApiKeyManager.getApiKey("kiloai");
		if (!apiKey && !silent) {
			await ApiKeyManager.promptAndSetApiKey(
				"kiloai",
				"Kilo AI",
				"sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			);
			apiKey = await ApiKeyManager.getApiKey("kiloai");
		}
		return apiKey;
	}

	static createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: KiloAIProvider; disposables: vscode.Disposable[] } {
		Logger.trace(`${providerConfig.displayName} provider activated!`);
		const ext = vscode.extensions.getExtension("OEvortex.better-copilot-chat");
		const extVersion = ext?.packageJSON?.version ?? "unknown";
		const vscodeVersion = vscode.version;
		const ua = `better-copilot-chat/${extVersion} VSCode/${vscodeVersion}`;

		const provider = new KiloAIProvider(
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
				await ApiKeyManager.promptAndSetApiKey(
					providerKey,
					providerConfig.displayName,
					providerConfig.apiKeyTemplate,
				);
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
