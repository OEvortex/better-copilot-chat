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
import { AccountManager } from "../../accounts";
import type { ModelConfig, ProviderConfig } from "../../types/sharedTypes";
import {
	ApiKeyManager,
	ConfigManager,
	Logger,
	RateLimiter,
	RetryManager,
	TokenCounter,
	resolveGlobalCapabilities,
	resolveGlobalTokenLimits,
} from "../../utils";
import { ProviderWizard } from "../../utils/providerWizard";
import { GenericModelProvider } from "../common/genericModelProvider";
import type { NvidiaModelItem, NvidiaModelsResponse } from "./types";

const BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_CONTEXT_LENGTH = 128 * 1024; // 131072
const DEFAULT_MAX_OUTPUT_TOKENS = 16 * 1024; // 16384
const NVIDIA_RATE_LIMIT_REQUESTS = 40;
const NVIDIA_RATE_LIMIT_WINDOW_MS = 60000;

function resolveTokenLimits(
	modelId: string,
	contextLength: number,
): { maxInputTokens: number; maxOutputTokens: number } {
	return resolveGlobalTokenLimits(modelId, contextLength, {
		defaultContextLength: DEFAULT_CONTEXT_LENGTH,
		defaultMaxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
	});
}

class NvidiaUsageTracker {
	private readonly timestamps: number[] = [];

	private prune(now: number): void {
		const windowStart = now - NVIDIA_RATE_LIMIT_WINDOW_MS;
		while (this.timestamps.length > 0 && this.timestamps[0] < windowStart) {
			this.timestamps.shift();
		}
	}

	recordRequest(): { used: number; remaining: number } {
		const now = Date.now();
		this.prune(now);
		this.timestamps.push(now);
		const used = this.timestamps.length;
		const remaining = Math.max(0, NVIDIA_RATE_LIMIT_REQUESTS - used);
		return { used, remaining };
	}
}

/**
 * NVIDIA NIM provider (OpenAI-compatible)
 * Dynamically fetches models from NVIDIA API and auto-updates config
 * Endpoints:
 *  - Chat Completions: https://integrate.api.nvidia.com/v1/chat/completions
 *  - Models: https://integrate.api.nvidia.com/v1/models
 */
export class NvidiaProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	private readonly usageTracker = new NvidiaUsageTracker();
	private readonly extensionPath: string;
	private readonly configFilePath: string;
	private lastFetchTime = 0;
	private static readonly FETCH_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

	constructor(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
		extensionPath: string,
	) {
		super(context, providerKey, providerConfig);
		this.extensionPath = extensionPath;
		this.configFilePath = path.join(
			this.extensionPath,
			"src",
			"providers",
			"config",
			"nvidia.json",
		);
	}

	protected override parseApiModelsResponse(resp: unknown): LanguageModelChatInformation[] {
		const parsed = resp as NvidiaModelsResponse;
		const models = parsed.data || parsed.models || [];

		return models.map((model) => {
			const metadata = model.metadata || {};
			const modalities =
				model.input_modalities ||
				metadata.input_modalities ||
				metadata.modalities ||
				[];

			const detectedVision = Array.isArray(modalities)
				? modalities.includes("image")
				: false;

			const contextLength =
				model.context_length ||
				metadata.context_length ||
				DEFAULT_CONTEXT_LENGTH;

			const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(
				model.id,
				contextLength,
			);

			return {
				id: model.id,
				name: model.id,
				tooltip: `${model.id} by NVIDIA NIM`,
				family: "Nvidia",
				version: "1.0",
				maxInputTokens,
				maxOutputTokens,
				capabilities: resolveGlobalCapabilities(model.id, {
					detectedImageInput: detectedVision,
				}),
			} as LanguageModelChatInformation;
		});
	}

	private async getDiscoveryApiKey(
		silent: boolean,
	): Promise<string | undefined> {
		let apiKey = await ApiKeyManager.getApiKey(this.providerKey);
		if (apiKey) {
			return apiKey;
		}

		// Fallback to managed account credentials when API key manager is empty
		try {
			const accountManager = AccountManager.getInstance();
			const accounts = accountManager.getAccountsByProvider(this.providerKey);
			const active = accountManager.getActiveAccount(this.providerKey);
			const preferred = active || accounts.find((a) => a.isDefault) || accounts[0];
			if (preferred) {
				const credentials = await accountManager.getCredentials(preferred.id);
				if (credentials && "apiKey" in credentials) {
					return credentials.apiKey;
				}
			}
		} catch {
			// AccountManager may not be initialized yet - ignore and continue
		}

		if (!silent) {
			await ApiKeyManager.promptAndSetApiKey(
				this.providerKey,
				this.providerConfig.displayName,
				this.providerConfig.apiKeyTemplate,
			);
			apiKey = await ApiKeyManager.getApiKey(this.providerKey);
		}

		return apiKey;
	}

	private getModelsEndpoint(): string {
		const baseUrl = this.providerConfig.baseUrl || BASE_URL;
		return `${baseUrl}/models`;
	}

	private async fetchModels(apiKey: string): Promise<NvidiaModelItem[]> {
		const modelsUrl = this.getModelsEndpoint();
		Logger.debug(`[NVIDIA] Fetching models from: ${modelsUrl}`);

		const abortController = new AbortController();
		const timeoutId = setTimeout(() => abortController.abort(), 10000);

		try {
			const response = await fetch(modelsUrl, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				signal: abortController.signal,
			});

			if (!response.ok) {
				const body = await response.text();
				Logger.warn(
					`[NVIDIA] Model fetch failed: ${response.status} ${response.statusText} - ${body}`,
				);
				return [];
			}

			const parsed = (await response.json()) as NvidiaModelsResponse;
			const models = parsed.data || parsed.models || [];
			Logger.info(`[NVIDIA] Fetched ${models.length} models`);
			return models;
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				Logger.warn("[NVIDIA] Model fetch timed out after 10 seconds");
			} else {
				Logger.warn(
					`[NVIDIA] Model fetch failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			return [];
		} finally {
			clearTimeout(timeoutId);
		}
	}

	override async provideLanguageModelChatInformation(
		options: { silent: boolean },
		token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		const apiKey = await this.getDiscoveryApiKey(options.silent ?? true);

		// Always return current models from config first
		const currentModels = this.providerConfig.models.map(m => {
			const baseInfo = this.modelConfigToInfo(m);
			return {
				...baseInfo,
				family: "Nvidia",
			};
		});

		// Throttled background fetch and update
		const now = Date.now();
		if (now - this.lastFetchTime > NvidiaProvider.FETCH_COOLDOWN_MS) {
			this.refreshModelsAsync(apiKey);
		}

		return this.dedupeModelInfos(currentModels);
	}

	private async refreshModelsAsync(apiKey?: string): Promise<void> {
		this.lastFetchTime = Date.now();
		try {
			const models = await this.fetchModels(apiKey ?? "");
			if (models.length > 0) {
				await this.updateNvidiaConfigFile(models);
			}
		} catch (err) {
			Logger.trace("[NVIDIA] Background model refresh failed:", err);
		}
	}

	private async updateNvidiaConfigFile(models: NvidiaModelItem[]): Promise<void> {
		try {
			const modelConfigs: ModelConfig[] = models.map((m) => {
				const metadata = m.metadata || {};
				const modalities =
					m.input_modalities ||
					metadata.input_modalities ||
					metadata.modalities ||
					[];

				const detectedVision = Array.isArray(modalities)
					? modalities.includes("image")
					: false;

				const contextLength =
					m.context_length ||
					metadata.context_length ||
					DEFAULT_CONTEXT_LENGTH;

				const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(
					m.id,
					contextLength,
				);

				const capabilities = resolveGlobalCapabilities(m.id, {
					detectedImageInput: detectedVision,
				});

				const cleanId = m.id
					.replace(/[/]/g, "-")
					.replace(/[^a-zA-Z0-9-]/g, "-")
					.toLowerCase();

				return {
					id: cleanId,
					name: m.id,
					tooltip: `${m.id} by NVIDIA NIM`,
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
					Logger.info(`[NVIDIA] Auto-updated config with ${modelConfigs.length} models`);
				}
			}
		} catch (err) {
			Logger.warn(`[NVIDIA] Config update failed:`, err);
		}
	}

	override async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<LanguageModelResponsePart>,
		token: CancellationToken,
	): Promise<void> {
		// NVIDIA limit is 40 req/min. Throttle globally to avoid burst 429 errors.
		await RateLimiter.getInstance(
			`${this.providerKey}:rpm`,
			NVIDIA_RATE_LIMIT_REQUESTS,
			NVIDIA_RATE_LIMIT_WINDOW_MS,
		).throttle(this.providerConfig.displayName);

		const usage = this.usageTracker.recordRequest();
		Logger.debug(
			`[NVIDIA] Usage window: ${usage.used}/${NVIDIA_RATE_LIMIT_REQUESTS} requests (remaining ${usage.remaining})`,
		);

		const retryManager = new RetryManager({
			maxAttempts: 2,
			initialDelayMs: 1000,
			maxDelayMs: 8000,
			backoffMultiplier: 2,
			jitterEnabled: true,
		});

		await retryManager.executeWithRetry(
			() =>
				super.provideLanguageModelChatResponse(
					model,
					messages,
					options,
					progress,
					token,
				),
			(error) => {
				const message = error.message || "";
				return (
					RetryManager.isRateLimitError(error) ||
					message.includes("429") ||
					message.includes("503") ||
					message.includes("504") ||
					message.includes("ECONNRESET") ||
					message.includes("ETIMEDOUT")
				);
			},
			"NVIDIA",
		);
	}

	static createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: NvidiaProvider; disposables: vscode.Disposable[] } {
		Logger.trace(`${providerConfig.displayName} provider activated!`);
		const provider = new NvidiaProvider(context, providerKey, providerConfig, context.extensionPath);

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
					supportsBaseUrl: true,
				});
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

	async provideTokenCount(
		model: LanguageModelChatInformation,
		text: string | LanguageModelChatMessage,
		_token: CancellationToken,
	): Promise<number> {
		return TokenCounter.getInstance().countTokens(model, text);
	}
}
