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

	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		const apiKey = await this.ensureApiKey(options.silent ?? true);

		let models: KiloModelItem[] = [];
		try {
			const result = await this.fetchModels(apiKey);
			models = result.models;
		} catch (err) {
			Logger.warn("[Kilo] Failed to fetch models during initialization, using cached config if available");
			if (this.providerConfig.models && this.providerConfig.models.length > 0) {
				return this.providerConfig.models.map(m => ({
					id: m.model || m.id,
					name: m.name || m.id,
					tooltip: m.tooltip || m.id,
					family: "kilo",
					version: "1.0.0",
					maxInputTokens: m.maxInputTokens || 128000,
					maxOutputTokens: m.maxOutputTokens || 16000,
					capabilities: m.capabilities || resolveGlobalCapabilities(m.model || m.id),
				} as LanguageModelChatInformation));
			}
			return [];
		}

		this.updateConfigFileAsync(models);

		const infos: LanguageModelChatInformation[] = models.map((m) => {
			const modalities = m.architecture?.input_modalities ?? [];
			const modelId = m.id;
			const detectedVision =
				Array.isArray(modalities) && modalities.includes("image");
			const capabilities = resolveGlobalCapabilities(modelId, {
				detectedImageInput: detectedVision,
			});

			const contextLen = m.context_length ?? DEFAULT_CONTEXT_LENGTH;
			const { maxInputTokens, maxOutputTokens } = resolveGlobalTokenLimits(
				modelId,
				contextLen,
				{
					defaultContextLength: DEFAULT_CONTEXT_LENGTH,
					defaultMaxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
				}
			);

			return {
				id: modelId,
				name: m.name || modelId,
				tooltip: m.description || `${m.name || modelId} by Kilo AI`,
				family: "kilo",
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
			throw new Error(`Failed to fetch Kilo models: ${resp.status} ${resp.statusText}
${text}`);
		}
		
		const parsed = (await resp.json()) as KiloModelsResponse;
		return { models: parsed.data ?? [] };
	}

	private updateConfigFileAsync(models: KiloModelItem[]): void {
		(async () => {
			try {
				if (!fs.existsSync(this.configFilePath)) {
					return;
				}

				const modelConfigs: ModelConfig[] = models.map((m) => {
					const modalities = m.architecture?.input_modalities ?? [];
					const modelId = m.id;
					const detectedVision =
						Array.isArray(modalities) && modalities.includes("image");
					const capabilities = resolveGlobalCapabilities(modelId, {
						detectedImageInput: detectedVision,
					});

					const contextLen = m.context_length ?? DEFAULT_CONTEXT_LENGTH;
					const { maxInputTokens, maxOutputTokens } = resolveGlobalTokenLimits(
						modelId,
						contextLen,
						{
							defaultContextLength: DEFAULT_CONTEXT_LENGTH,
							defaultMaxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
						}
					);

					const cleanId = m.id
						.replace(/[/]/g, "-")
						.replace(/[^a-zA-Z0-9-]/g, "-")
						.toLowerCase();

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

				let existingConfig: ProviderConfig;
				try {
					const configContent = fs.readFileSync(this.configFilePath, "utf8");
					existingConfig = JSON.parse(configContent);
				} catch {
					existingConfig = {
						displayName: "Kilo AI",
						baseUrl: BASE_URL,
						apiKeyTemplate: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
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
				Logger.info(`[Kilo] Auto-updated config file with ${modelConfigs.length} models`);
			} catch (err) {
				Logger.warn(`[Kilo] Background config update failed:`, err);
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
		await RateLimiter.getInstance(this.providerKey, 5, 1000).throttle(
			this.providerConfig.displayName,
		);

		try {
			const apiKey = await this.ensureApiKey(true);
			if (!apiKey) {
				throw new Error("Kilo API key not found");
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
