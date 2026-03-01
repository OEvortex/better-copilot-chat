/*---------------------------------------------------------------------------------------------
 *  Ollama Cloud Dedicated Provider
 *  Dynamically fetches models from https://ollama.com/v1/models
 *--------------------------------------------------------------------------------------------*/

import * as fs from "node:fs";
import * as path from "node:path";
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
import { getExtensionVersion } from "../../utils/userAgent";
import { GenericModelProvider } from "../common";
import type { OllamaModelItem, OllamaModelsResponse } from "./types";

const BASE_URL = "https://ollama.com";

export class OllamaProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	private readonly userAgent: string;
	private readonly extensionPath: string;
	private readonly configFilePath: string;

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

	private lastFetchTime = 0;
	private static readonly FETCH_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

	private resolveAnthropicBaseUrl(baseUrl?: string): string {
		const normalized = (baseUrl || BASE_URL).replace(/\/$/, "");
		if (normalized.endsWith("/v1")) {
			return normalized.slice(0, -3);
		}
		return normalized;
	}

	private getModelsEndpoint(baseUrl?: string): string {
		const rootBaseUrl = this.resolveAnthropicBaseUrl(baseUrl);
		return `${rootBaseUrl}/v1/models`;
	}

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

		const modelsEndpoint = this.getModelsEndpoint(
			this.providerConfig.baseUrl || BASE_URL,
		);
		const resp = await fetch(modelsEndpoint, {
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

			if (!modelConfig) {
				throw new Error(`Model not found: ${model.id}`);
			}

			const anthropicModelConfig: ModelConfig = {
				...modelConfig,
				baseUrl: this.resolveAnthropicBaseUrl(
					modelConfig.baseUrl || this.providerConfig.baseUrl || BASE_URL,
				),
				outputThinking: true,
			};

			await this.anthropicHandler.handleRequest(
				model,
				anthropicModelConfig,
				messages,
				options,
				progress,
				token,
			);
		} catch (error) {
			Logger.error(
				"[Ollama] Chat request failed",
				error instanceof Error ? error.message : String(error),
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
