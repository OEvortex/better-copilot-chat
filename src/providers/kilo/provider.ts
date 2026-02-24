/*---------------------------------------------------------------------------------------------
 *  Kilo AI Provider
 *  Dynamically fetches models from Kilo AI API and auto-updates config
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
	resolveGlobalCapabilities,
	resolveGlobalTokenLimits,
} from "../../utils/globalContextLengthManager";
import { Logger } from "../../utils/logger";
import { RateLimiter } from "../../utils/rateLimiter";
import { ProviderWizard } from "../../utils/providerWizard";
import { GenericModelProvider } from "../common/genericModelProvider";
import type { KiloModelItem, KiloModelsResponse } from "./types";

const BASE_URL = "https://api.kilo.ai/api/gateway";
const DEFAULT_MAX_OUTPUT_TOKENS = 16384;
const DEFAULT_CONTEXT_LENGTH = 128000;

export class KiloProvider
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
			"kilo.json",
		);
	}

	protected override refreshHandlers(): void {
		if (this.clientCache && this.clientCache.size > 0) {
			this.clientCache.clear();
		}
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
			const info = this.modelConfigToInfo(m);
			
			// Use the same family logic as GenericModelProvider
			const editToolMode = vscode.workspace
				.getConfiguration("chp")
				.get("editToolMode", "claude") as string;

			let family: string;
			if (editToolMode && editToolMode !== "none") {
				family = editToolMode.startsWith("claude")
					? "claude-sonnet-4-5"
					: editToolMode;
			} else {
				family = "kilo";
			}
			
			info.family = family;
			return info;
		});

		// Throttled background fetch and update
		const now = Date.now();
		if (now - this.lastFetchTime > KiloProvider.FETCH_COOLDOWN_MS) {
			this.refreshModelsAsync(apiKey);
		}

		return this.dedupeModelInfos(currentModels);
	}

	private async refreshModelsAsync(apiKey?: string): Promise<void> {
		this.lastFetchTime = Date.now();
		try {
			const result = await this.fetchModels(apiKey);
			if (result.models && result.models.length > 0) {
				await this.updateConfigFileAsync(result.models);
			}
		} catch (err) {
			Logger.trace("[Kilo] Background model refresh failed:", err);
		}
	}

	private async fetchModels(
		apiKey?: string,
	): Promise<{ models: KiloModelItem[] }> {
		const headers: Record<string, string> = {
			"User-Agent": this.userAgent,
		};
		if (apiKey) {
			headers["Authorization"] = `Bearer ${apiKey}`;
		}

		const baseUrl = this.providerConfig.baseUrl || BASE_URL;
		const resp = await fetch(`${baseUrl}/models`, {
			method: "GET",
			headers,
		});
		
		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(`Failed to fetch Kilo models: ${resp.status} ${resp.statusText}\n${text}`);
		}
		
		const parsed = (await resp.json()) as KiloModelsResponse;
		return { models: parsed.data ?? [] };
	}

	private async updateConfigFileAsync(models: KiloModelItem[]): Promise<void> {
		try {
			const modelConfigs: ModelConfig[] = models.map((m) => {
				const modalities = m.architecture?.input_modalities ?? [];
				const modelId = m.id;
				const detectedVision = Array.isArray(modalities) && modalities.includes("image");
				const capabilities = resolveGlobalCapabilities(modelId, { detectedImageInput: detectedVision });
				const contextLen = m.context_length ?? DEFAULT_CONTEXT_LENGTH;
				const { maxInputTokens, maxOutputTokens } = resolveGlobalTokenLimits(modelId, contextLen, {
					defaultContextLength: DEFAULT_CONTEXT_LENGTH,
					defaultMaxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
				});
				const cleanId = m.id.replace(/[/]/g, "-").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
				return {
					id: cleanId,
					name: m.name || modelId,
					tooltip: m.description || `${m.name || modelId} by Kilo AI`,
					maxInputTokens,
					maxOutputTokens,
					model: modelId,
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
					Logger.info(`[Kilo] Auto-updated config with ${modelConfigs.length} models`);
				}
			}
		} catch (err) {
			Logger.warn(`[Kilo] Config update failed:`, err);
		}
	}

	override async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: readonly LanguageModelChatMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<LanguageModelResponsePart>,
		token: CancellationToken,
	): Promise<void> {
		await RateLimiter.getInstance(this.providerKey, 5, 1000).throttle(
			this.providerConfig.displayName,
		);

		try {
			const apiKey = await this.ensureApiKey(true);
			if (!apiKey) {
				throw new Error("Kilo AI API key not found");
			}

			// Use GenericModelProvider's implementation for OpenAI-compatible providers
			return super.provideLanguageModelChatResponse(model, messages as any, options, progress, token);
		} catch (err) {
			Logger.error("[Kilo AI Provider] Chat request failed", err);
			throw err;
		}
	}

	private async ensureApiKey(silent: boolean): Promise<string | undefined> {
		let apiKey = await ApiKeyManager.getApiKey(this.providerKey);
		if (!apiKey && !silent) {
			await ApiKeyManager.promptAndSetApiKey(
				this.providerKey,
				"Kilo AI",
				"sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			);
			apiKey = await ApiKeyManager.getApiKey(this.providerKey);
		}
		return apiKey;
	}

	static createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: KiloProvider; disposables: vscode.Disposable[] } {
		Logger.trace(`${providerConfig.displayName} provider activated!`);
		const ext = vscode.extensions.getExtension("OEvortex.better-copilot-chat");
		const extVersion = ext?.packageJSON?.version ?? "unknown";
		const vscodeVersion = vscode.version;
		const ua = `better-copilot-chat/${extVersion} VSCode/${vscodeVersion}`;

		const extensionPath = context.extensionPath;
		const provider = new KiloProvider(
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
		for (const d of disposables) {
			context.subscriptions.push(d);
		}
		return { provider, disposables };
	}
}
