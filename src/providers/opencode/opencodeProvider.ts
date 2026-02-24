/*---------------------------------------------------------------------------------------------
 *  OpenCode Dedicated Provider
 *  Handles OpenCode specific logic, optimizations, and robust tool calling
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
import { Logger } from "../../utils/logger";
import { RateLimiter } from "../../utils/rateLimiter";
import { TokenCounter } from "../../utils/tokenCounter";
import { ProviderWizard } from "../../utils/providerWizard";
import { GenericModelProvider } from "../common/genericModelProvider";
import { validateRequest } from "./utils";

const BASE_URL = "https://opencode.ai/zen/v1";
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

interface OpenCodeModelItem {
	id: string;
	object: string;
	created: number;
	owned_by: string;
	context_length?: number;
	input_modalities?: string[];
	max_output_length?: number;
}

interface OpenCodeModelsResponse {
	object: string;
	data: OpenCodeModelItem[];
}

/**
 * OpenCode dedicated model provider class
 * Implements robust tool calling and dynamic model fetching
 */
export class OpenCodeProvider
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
		// Path to opencode.json config file
		this.configFilePath = path.join(
			this.extensionPath,
			"src",
			"providers",
			"config",
			"opencode.json",
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
			Logger.debug(`[OpenCode] Clearing ${this.clientCache.size} cached OpenAI clients due to config change`);
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
			// If no API key, return static config models if available
			if (this.providerConfig.models && this.providerConfig.models.length > 0) {
				return this.providerConfig.models.map(m => this.modelConfigToInfo(m));
			}
			return [];
		}

		let models: OpenCodeModelItem[] = [];
		try {
			models = await this.fetchModels(apiKey);
			// Auto-update config file in background (non-blocking)
			this.updateConfigFileAsync(models);
		} catch (err) {
			Logger.warn("[OpenCode] Failed to fetch models, using cached config");
			return this.providerConfig.models.map(m => this.modelConfigToInfo(m));
		}

		const infos: LanguageModelChatInformation[] = models.map((m) => {
			const modalities = m.input_modalities ?? [];
			const modelId = m.id;
			const detectedVision =
				Array.isArray(modalities) && modalities.includes("image");
			const capabilities = resolveGlobalCapabilities(modelId, {
				detectedImageInput: detectedVision,
			});

			const contextLen = m.context_length ?? DEFAULT_CONTEXT_LENGTH;
			const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(
				modelId,
				contextLen,
			);

			return {
				id: modelId,
				name: m.name || modelId,
				tooltip: m.description || `${modelId} by OpenCode`,
				family: "opencode",
				version: "1.0.0",
				maxInputTokens,
				maxOutputTokens,
				capabilities,
			} as LanguageModelChatInformation;
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
	): Promise<OpenCodeModelItem[]> {
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
			} catch {}
			throw new Error(`Failed to fetch OpenCode models: ${resp.status} ${text}`);
		}

		const parsed = (await resp.json()) as OpenCodeModelsResponse;
		return parsed.data ?? [];
	}

	/**
	 * Update config file asynchronously in background
	 */
	private updateConfigFileAsync(models: OpenCodeModelItem[]): void {
		(async () => {
			try {
				if (!fs.existsSync(this.configFilePath)) {
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
					const contextLen = m.context_length ?? DEFAULT_CONTEXT_LENGTH;
					const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(
						modelId,
						contextLen,
					);

					return {
						id: modelId,
						name: modelId,
						tooltip: `${modelId} by OpenCode`,
						maxInputTokens,
						maxOutputTokens,
						model: modelId,
						capabilities,
					} as ModelConfig;
				});

				let existingConfig: ProviderConfig;
				try {
					const configContent = fs.readFileSync(this.configFilePath, "utf8");
					existingConfig = JSON.parse(configContent);
				} catch {
					existingConfig = {
						displayName: "OpenCode",
						baseUrl: BASE_URL,
						apiKeyTemplate: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
						models: [],
					};
				}

				const updatedConfig: ProviderConfig = {
					...existingConfig,
					models: modelConfigs,
				};

				fs.writeFileSync(
					this.configFilePath,
					JSON.stringify(updatedConfig, null, 4),
					"utf8",
				);
				Logger.info(`[OpenCode] Auto-updated config with ${modelConfigs.length} models`);
			} catch (err) {
				Logger.warn(`[OpenCode] Background config update failed:`, err);
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
				throw new Error("OpenCode API key not found");
			}

			validateRequest(
				messages as readonly vscode.LanguageModelChatRequestMessage[],
			);

			if (options.tools && options.tools.length > 128) {
				throw new Error('Cannot have more than 128 tools per request.');
			}

			// Token check
			const inputTokenCount = this.estimateMessagesTokens(messages);
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
				throw new Error("Message exceeds token limit.");
			}

			// Create OpenAI client
			const client = await this.createOpenAIClient(apiKey);

			// Find model config
			const modelConfig = this.providerConfig.models.find(
				(m) => m.model === model.id || m.id === model.id,
			);

			// Convert messages
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
				temperature: options.modelOptions?.temperature ?? ConfigManager.getTemperature(),
				top_p: ConfigManager.getTopP(),
			};

			// Add model options (match Chutes behavior)
			if (options.modelOptions) {
				const mo = options.modelOptions as Record<string, unknown>;
				if (typeof mo.stop === 'string' || Array.isArray(mo.stop)) {
					createParams.stop = mo.stop;
				}
				if (typeof mo.frequency_penalty === 'number') {
					createParams.frequency_penalty = mo.frequency_penalty;
				}
				if (typeof mo.presence_penalty === 'number') {
					createParams.presence_penalty = mo.presence_penalty;
				}
			}

			// Tools
			if (options.tools && options.tools.length > 0 && model.capabilities?.toolCalling) {
				createParams.tools = this.openaiHandler.convertToolsToOpenAI([...options.tools]);
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
			const toolCallIds = new Map<number, string>();
			const seenToolCalls = new Set<string>();
			const toolCallBuffers = new Map<number, { id?: string; name?: string; arguments: string }>();
			let legacyFunctionCallBuffer: { name?: string; arguments: string } | undefined;

			const reportToolCall = (callId: string, name: string, args: object): void => {
				const isSyntheticId =
					callId.startsWith('tool_call_') || callId.startsWith('tool_call_legacy_');
				let argsKey = '';
				if (isSyntheticId) {
					try {
						argsKey = JSON.stringify(args);
					} catch {
						argsKey = '';
					}
				}
				const dedupeKey = isSyntheticId ? `${name}:${argsKey}` : `${callId}:${name}`;
				if (seenToolCalls.has(dedupeKey)) {
					return;
				}
				seenToolCalls.add(dedupeKey);

				if (currentThinkingId) {
					try {
						progress.report(new vscode.LanguageModelThinkingPart('', currentThinkingId) as any);
					} catch {
						// ignore
					}
					currentThinkingId = null;
				}

				try {
					progress.report(new vscode.LanguageModelToolCallPart(callId, name, args));
					_hasReceivedContent = true;
				} catch (e) {
					Logger.warn(
						'[OpenCode] Failed to report tool call',
						e instanceof Error ? e.message : String(e),
					);
				}
			};

			const flushBufferedToolCalls = (): void => {
				for (const [idx, buf] of toolCallBuffers.entries()) {
					if (!buf.name) {
						continue;
					}
					const callId = buf.id || toolCallIds.get(idx) || `tool_call_${idx}_${Date.now()}`;
					let parsedArgs: object = {};
					try {
						parsedArgs = JSON.parse(buf.arguments || '{}');
					} catch {
						parsedArgs = { value: buf.arguments };
					}
					reportToolCall(callId, buf.name, parsedArgs);
				}
			};

			// Handle chunks
			stream.on("chunk", (chunk: OpenAI.Chat.ChatCompletionChunk) => {
				if (token.isCancellationRequested) return;

				if (chunk.choices && chunk.choices.length > 0) {
					for (const choice of chunk.choices) {
						// Capture tool call IDs
						if (choice.delta?.tool_calls) {
							for (const toolCall of choice.delta.tool_calls) {
								if (toolCall.id && toolCall.index !== undefined) {
									toolCallIds.set(toolCall.index, toolCall.id);
								}

								// Robust fallback: buffer tool call name/args from raw deltas
								const idx = toolCall.index ?? 0;
								const existing = toolCallBuffers.get(idx) ?? { arguments: '' };
								if (toolCall.id) {
									existing.id = toolCall.id;
								}
								const fn = toolCall.function as { name?: string; arguments?: string } | undefined;
								if (fn?.name) {
									existing.name = fn.name;
								}
								if (typeof fn?.arguments === 'string' && fn.arguments.length > 0) {
									existing.arguments += fn.arguments;
								}
								toolCallBuffers.set(idx, existing);
							}
						}

						// Extra fallback: legacy function_call streaming (some OpenAI-compatible servers)
						const legacy = (choice.delta as any)?.function_call as
							| { name?: string; arguments?: string }
							| undefined;
						if (legacy) {
							legacyFunctionCallBuffer = legacyFunctionCallBuffer ?? { arguments: '' };
							if (legacy.name) {
								legacyFunctionCallBuffer.name = legacy.name;
							}
							if (typeof legacy.arguments === 'string' && legacy.arguments.length > 0) {
								legacyFunctionCallBuffer.arguments += legacy.arguments;
							}
						}

						// Handle thinking
						const delta = choice.delta as { reasoning?: string; reasoning_content?: string } | undefined;
						const reasoningContent = delta?.reasoning ?? delta?.reasoning_content;

						if (reasoningContent && typeof reasoningContent === "string") {
							if (!currentThinkingId) {
								currentThinkingId = `opencode_thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
							}
							thinkingContentBuffer += reasoningContent;
							try {
								progress.report(
									new vscode.LanguageModelThinkingPart(
										thinkingContentBuffer,
										currentThinkingId,
									) as any,
								);
								thinkingContentBuffer = "";
								hasThinkingContent = true;
							} catch {}
						}

						// If the provider doesn't trigger SDK tool events, flush on finish_reason
						const finishReason = (choice as any)?.finish_reason as string | null | undefined;
						if (finishReason === 'tool_calls') {
							flushBufferedToolCalls();
						}
						if (finishReason === 'function_call' && legacyFunctionCallBuffer?.name) {
							let parsedArgs: object = {};
							try {
								parsedArgs = JSON.parse(legacyFunctionCallBuffer.arguments || '{}');
							} catch {
								parsedArgs = { value: legacyFunctionCallBuffer.arguments };
							}
							const callId = `tool_call_legacy_${Date.now()}`;
							reportToolCall(callId, legacyFunctionCallBuffer.name, parsedArgs);
						}
					}
				}
			});

			// Handle content
			stream.on("content", (delta: string) => {
				if (token.isCancellationRequested) return;

				if (delta && typeof delta === "string" && delta.trim().length > 0) {
					if (currentThinkingId) {
						try {
							progress.report(new vscode.LanguageModelThinkingPart("", currentThinkingId) as any);
						} catch {}
						currentThinkingId = null;
					}

					try {
						progress.report(new vscode.LanguageModelTextPart(delta));
						_hasReceivedContent = true;
					} catch {}
				}
			});

			// Handle tool calls
			stream.on("tool_calls.function.arguments.done", (event) => {
				if (token.isCancellationRequested) return;

				const toolCallId =
					toolCallIds.get(event.index) || `tool_call_${event.index}_${Date.now()}`;

				let parsedArgs: object = {};
				if ((event as any).parsed_arguments) {
					const result = (event as any).parsed_arguments as unknown;
					parsedArgs =
						typeof result === 'object' && result !== null ? (result as object) : {};
				} else {
					try {
						parsedArgs = JSON.parse(event.arguments || '{}');
					} catch {
						parsedArgs = { value: event.arguments };
					}
				}

				reportToolCall(toolCallId, event.name, parsedArgs);
			});

			// CRITICAL: Wait for the SDK to fully complete the chat completion
			// This ensures the request doesn't end before all events are processed
			await stream.finalChatCompletion();

			// If tool calls were only streamed as deltas and never flushed, flush them now
			flushBufferedToolCalls();

			if (currentThinkingId) {
				try {
					progress.report(new vscode.LanguageModelThinkingPart("", currentThinkingId) as any);
				} catch {}
			}

			if (hasThinkingContent && !_hasReceivedContent) {
				progress.report(new vscode.LanguageModelTextPart("<think/>"));
			}

		} catch (err) {
			const isAbort =
				token.isCancellationRequested ||
				(err instanceof Error && err.name === 'AbortError');
			if (!isAbort) {
				Logger.error(
					'[OpenCode] Chat request failed',
					err instanceof Error ? err.message : String(err),
				);
			}
			throw err;
		} finally {
			this.incrementRequestCount();
		}
	}

	/**
	 * Increment global request count and update status bar
	 */
	private incrementRequestCount(): void {
		const today = new Date().toDateString();
		const prefix = this.providerKey;

		let count = this.context?.globalState.get<number>(`${prefix}.requestCount`) || 0;
		const lastReset = this.context?.globalState.get<string>(`${prefix}.lastResetDate`);

		if (lastReset !== today) {
			count = 1;
			this.context?.globalState.update(`${prefix}.lastResetDate`, today);
		} else {
			count++;
		}

		this.context?.globalState.update(`${prefix}.requestCount`, count);
		Logger.debug(`[OpenCode] Global request count: ${count}`);
	}

	private async createOpenAIClient(apiKey: string): Promise<OpenAI> {
		const baseUrl = this.providerConfig.baseUrl || BASE_URL;
		const cacheKey = `opencode:${baseUrl}`;
		const cached = this.clientCache.get(cacheKey);
		if (cached) {
			cached.lastUsed = Date.now();
			return cached.client;
		}

		const client = new OpenAI({
			apiKey: apiKey,
			baseURL: baseUrl,
			defaultHeaders: { "User-Agent": this.userAgent },
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

	static override createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: OpenCodeProvider; disposables: vscode.Disposable[] } {
		Logger.trace(`${providerConfig.displayName} provider activated!`);
		const ext = vscode.extensions.getExtension("OEvortex.better-copilot-chat");
		const extVersion = ext?.packageJSON?.version ?? "unknown";
		const vscodeVersion = vscode.version;
		const ua = `better-copilot-chat/${extVersion} VSCode/${vscodeVersion}`;

		const provider = new OpenCodeProvider(
			context,
			providerKey,
			providerConfig,
			ua,
			context.extensionPath,
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
		for (const d of disposables) {
			context.subscriptions.push(d);
		}
		return { provider, disposables };
	}
}
