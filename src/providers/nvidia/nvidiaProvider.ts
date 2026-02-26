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
 * Endpoints:
 *  - Chat Completions: https://integrate.api.nvidia.com/v1/chat/completions
 *  - Models: https://integrate.api.nvidia.com/v1/models
 */
export class NvidiaProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	private readonly usageTracker = new NvidiaUsageTracker();

	/**
	 * Override: Add explicit family property for NVIDIA models
	 */
	protected override modelConfigToInfo(
		model: ModelConfig,
	): LanguageModelChatInformation {
		const baseInfo = super.modelConfigToInfo(model);
		return {
			...baseInfo,
			family: "Nvidia",
		};
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

	private syncProviderModels(models: NvidiaModelItem[]): void {
		if (!models || models.length === 0) {
			return;
		}
		const mappedModels = models.map((m) => this.mapModelToConfig(m));
		this.cachedProviderConfig = {
			...this.cachedProviderConfig,
			models: mappedModels,
		};
	}

	override async provideLanguageModelChatInformation(
		options: { silent: boolean },
		token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		const apiKey = await this.getDiscoveryApiKey(options.silent ?? true);
		if (!apiKey) {
			if (this.providerConfig.models && this.providerConfig.models.length > 0) {
				return this.providerConfig.models.map((m) => this.modelConfigToInfo(m));
			}
			return [];
		}

		try {
			const models = await this.fetchModels(apiKey);
			if (models.length > 0) {
				this.syncProviderModels(models);
			}

			const infos = this.providerConfig.models.map((m) =>
				this.modelConfigToInfo(m),
			);
			const dedupedInfos = this.dedupeModelInfos(infos);
			this._chatEndpoints = dedupedInfos.map((info) => ({
				model: info.id,
				modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens,
			}));
			return dedupedInfos;
		} catch (error) {
			Logger.error(
				`[NVIDIA] Failed to provide model information: ${error instanceof Error ? error.message : String(error)}`,
			);
			return this.providerConfig.models.map((m) => this.modelConfigToInfo(m));
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
		const provider = new NvidiaProvider(context, providerKey, providerConfig);

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
