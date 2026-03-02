/*---------------------------------------------------------------------------------------------
 *  Dynamic Model Provider
 *  Extends GenericModelProvider with auto-fetching model list from endpoint
 *--------------------------------------------------------------------------------------------*/

import type {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelResponsePart,
	Progress,
} from "vscode";
import * as vscode from "vscode";
import type { ModelConfig, ProviderConfig } from "../../types/sharedTypes";
import type { KnownProviderConfig } from "../../utils/knownProviders";
import { ApiKeyManager, ConfigManager, Logger } from "../../utils";
import {
	DEFAULT_CONTEXT_LENGTH,
	DEFAULT_MAX_OUTPUT_TOKENS,
	resolveGlobalCapabilities,
	resolveGlobalTokenLimits,
} from "../../utils/globalContextLengthManager";
import { ProviderWizard } from "../../utils/providerWizard";
import { GenericModelProvider } from "./genericModelProvider";
import * as fs from "node:fs";
import * as path from "node:path";

interface FetchedModel {
	id: string;
	name?: string;
	description?: string;
	context_length?: number;
	[maxOutputTokens: string]: unknown;
}

/**
 * Dynamic Model Provider Class
 * Auto-fetches and updates model list from provider's API endpoint
 */
export class DynamicModelProvider extends GenericModelProvider {
	private readonly knownConfig: KnownProviderConfig;
	private readonly configFilePath: string;
	private lastFetchTime = 0;
	private get fetchCooldownMs(): number {
		const cooldownMinutes = this.knownConfig.modelParser?.cooldownMinutes;
		return (cooldownMinutes ?? 10) * 60 * 1000;
	}

	constructor(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
		knownConfig: KnownProviderConfig,
	) {
		super(context, providerKey, providerConfig);
		this.knownConfig = knownConfig;
		this.configFilePath = path.join(
			context.extensionPath,
			"src",
			"providers",
			"config",
			`${providerKey}.json`,
		);
	}

	override async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		// Always return current models from config first
		const currentModels = this.providerConfig.models.map((m) => {
			const baseInfo = this.modelConfigToInfo(m);
			return {
				...baseInfo,
				family: this.knownConfig.family || this.providerKey,
			};
		});

		// Throttled background fetch and update
		const now = Date.now();
		if (now - this.lastFetchTime > this.fetchCooldownMs) {
			this.refreshModelsAsync(options.silent ?? true);
		}

		return this.dedupeModelInfos(currentModels);
	}

	private async refreshModelsAsync(silent: boolean): Promise<void> {
		this.lastFetchTime = Date.now();
		try {
			const apiKey = await this.ensureApiKey(silent);
			if (this.knownConfig.supportsApiKey !== false && !apiKey) {
				Logger.trace(`[${this.providerKey}] API key required for model fetch`);
				return;
			}

			const models = await this.fetchModels(apiKey);
			if (models.length > 0) {
				await this.updateModels(models);
			}
		} catch (err) {
			Logger.trace(
				`[${this.providerKey}] Background model refresh failed:`,
				err,
			);
		}
	}

	private async fetchModels(apiKey?: string): Promise<FetchedModel[]> {
		const endpoint = this.knownConfig.modelsEndpoint || "/models";
		const baseUrl = (
			this.knownConfig.openai?.baseUrl || this.providerConfig.baseUrl
		).replace(/\/$/, "");
		const url = endpoint.startsWith("http")
			? endpoint
			: `${baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

		const headers: Record<string, string> = {};
		if (apiKey) {
			headers["Authorization"] = `Bearer ${apiKey}`;
		}

		const resp = await fetch(url, { method: "GET", headers });

		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(
				`Failed to fetch models: ${resp.status} ${resp.statusText}\n${text}`,
			);
		}

		const parsed = (await resp.json()) as Record<string, unknown>;

		// Parse response using configured path
		const arrayPath = this.knownConfig.modelParser?.arrayPath || "data";
		let models: FetchedModel[] = [];

		if (arrayPath.includes(".")) {
			// Handle nested paths like "data.models"
			let current: unknown = parsed;
			for (const part of arrayPath.split(".")) {
				if (current && typeof current === "object") {
					current = (current as Record<string, unknown>)[part];
				}
			}
			if (Array.isArray(current)) {
				models = current as FetchedModel[];
			}
		} else {
			const data = parsed[arrayPath];
			if (Array.isArray(data)) {
				models = data as FetchedModel[];
			}
		}

		return models;
	}

	private async updateModels(models: FetchedModel[]): Promise<void> {
		try {
			const parser = this.knownConfig.modelParser || {};
			const idField = parser.idField || "id";
			const nameField = parser.nameField || "name";
			const descField = parser.descriptionField || "description";
			const contextField = parser.contextLengthField || "context_length";

			const modelConfigs: ModelConfig[] = models.map((m) => {
				const modelId = String(m[idField] || m.id);
				const contextLen = Number(m[contextField]) || 128000;
				const { maxInputTokens, maxOutputTokens } = resolveGlobalTokenLimits(
					modelId,
					contextLen,
					{
						defaultContextLength: DEFAULT_CONTEXT_LENGTH,
						defaultMaxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
					},
				);

				// Clean ID for use in VS Code
				const cleanId = modelId
					.replace(/[/]/g, "-")
					.replace(/[^a-zA-Z0-9-]/g, "-")
					.toLowerCase();

				return {
					id: cleanId,
					name: String(m[nameField] || modelId),
					tooltip: String(m[descField] || `${modelId}`),
					maxInputTokens,
					maxOutputTokens,
					model: modelId,
					capabilities: resolveGlobalCapabilities(modelId, {}),
				};
			});

			// Update in-memory configuration if changed
			const oldModelsJson = JSON.stringify(this.baseProviderConfig.models);
			const newModelsJson = JSON.stringify(modelConfigs);

			if (oldModelsJson !== newModelsJson) {
				this.baseProviderConfig.models = modelConfigs;
				this.cachedProviderConfig = ConfigManager.applyProviderOverrides(
					this.providerKey,
					this.baseProviderConfig,
				);
				this._onDidChangeLanguageModelChatInformation.fire();

				// Ensure directory exists
				const configDir = path.dirname(this.configFilePath);
				if (!fs.existsSync(configDir)) {
					try {
						fs.mkdirSync(configDir, { recursive: true });
					} catch (dirErr) {
						Logger.warn(
							`[${this.providerKey}] Failed to create config directory:`,
							dirErr,
						);
					}
				}

				// Write to file (create if not exists, update if exists)
				try {
					fs.writeFileSync(
						this.configFilePath,
						JSON.stringify(this.baseProviderConfig, null, 4),
						"utf8",
					);
					Logger.info(
						`[${this.providerKey}] Auto-updated config file with ${modelConfigs.length} models`,
					);
				} catch (fileErr) {
					Logger.warn(
						`[${this.providerKey}] Failed to write config file:`,
						fileErr,
					);
				}

				Logger.info(
					`[${this.providerKey}] Auto-updated in-memory with ${modelConfigs.length} models`,
				);
			}
		} catch (err) {
			Logger.warn(`[${this.providerKey}] Model update failed:`, err);
		}
	}

	private async ensureApiKey(silent: boolean): Promise<string | undefined> {
		let apiKey = await ApiKeyManager.getApiKey(this.providerKey);
		if (!apiKey && !silent) {
			await ApiKeyManager.promptAndSetApiKey(
				this.providerKey,
				this.providerConfig.displayName,
				this.providerConfig.apiKeyTemplate || "sk-xxxxxxxx",
			);
			apiKey = await ApiKeyManager.getApiKey(this.providerKey);
		}
		return apiKey;
	}

	/**
	 * Static factory method - Create and activate dynamic provider
	 */
	static createAndActivateDynamic(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
		knownConfig: KnownProviderConfig,
	): { provider: DynamicModelProvider; disposables: vscode.Disposable[] } {
		Logger.trace(
			`${providerConfig.displayName} dynamic provider extension activated!`,
		);

		const provider = new DynamicModelProvider(
			context,
			providerKey,
			providerConfig,
			knownConfig,
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
					supportsApiKey: knownConfig.supportsApiKey !== false,
					supportsBaseUrl: true,
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
