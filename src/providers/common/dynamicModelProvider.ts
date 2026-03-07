/*---------------------------------------------------------------------------------------------
 *  Dynamic Model Provider
 *  Extends GenericModelProvider with auto-fetching model list from endpoint
 *--------------------------------------------------------------------------------------------*/

import * as fs from "node:fs";
import * as path from "node:path";
import type {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelResponsePart,
	Progress,
} from "vscode";
import * as vscode from "vscode";
import type { ModelConfig, ProviderConfig } from "../../types/sharedTypes";
import {
	ApiKeyManager,
	ConfigManager,
	getUserAgent,
	Logger,
} from "../../utils";
import {
	DEFAULT_CONTEXT_LENGTH,
	DEFAULT_MAX_OUTPUT_TOKENS,
	resolveGlobalCapabilities,
	resolveGlobalTokenLimits,
} from "../../utils/globalContextLengthManager";
import type { KnownProviderConfig } from "../../utils/knownProviders";
import { ProviderWizard } from "../../utils/providerWizard";
import { GenericModelProvider } from "./genericModelProvider";

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
	private isRefreshing = false;
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
			"dist",
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
			this.scheduleModelRefresh(options.silent ?? true);
		}

		return this.dedupeModelInfos(currentModels);
	}

	private scheduleModelRefresh(silent: boolean, force = false): void {
		if (!force) {
			const now = Date.now();
			if (now - this.lastFetchTime <= this.fetchCooldownMs) {
				return;
			}
		}
		void this.refreshModelsAsync(silent);
	}

	private async refreshModelsAsync(silent: boolean): Promise<void> {
		if (this.isRefreshing) {
			return;
		}

		this.isRefreshing = true;
		this.lastFetchTime = Date.now();
		try {
			let apiKey = await this.ensureApiKey(silent);
			if (!apiKey && this.knownConfig.openModelEndpoint) {
				// Open model endpoint - proceed without API key (or use defaultApiKey)
				apiKey = this.knownConfig.defaultApiKey;
			} else if (this.knownConfig.supportsApiKey !== false && !apiKey) {
				Logger.trace(`[${this.providerKey}] API key required for model fetch`);
				return;
			}

			Logger.debug(
				`[${this.providerKey}] Starting background model refresh...`,
			);
			const models = await this.fetchModels(apiKey);
			if (models.length > 0) {
				await this.updateModels(models);
			} else {
				Logger.warn(`[${this.providerKey}] No models returned from API`);
			}
		} catch (err) {
			Logger.error(
				`[${this.providerKey}] Background model refresh failed:`,
				err,
			);
		} finally {
			this.isRefreshing = false;
		}
	}

	private async fetchModels(apiKey?: string): Promise<FetchedModel[]> {
		const endpoint = this.knownConfig.modelsEndpoint || "/models";
		let baseUrl = (
			this.knownConfig.openai?.baseUrl ||
			this.knownConfig.baseUrl ||
			this.providerConfig.baseUrl
		).replace(/\/$/, "");

		// Avoid double /v1 if both baseUrl and endpoint contain it
		if (baseUrl.endsWith("/v1") && endpoint.startsWith("/v1/")) {
			baseUrl = baseUrl.slice(0, -3);
		}

		const url = endpoint.startsWith("http")
			? endpoint
			: `${baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

		Logger.debug(`[${this.providerKey}] Fetching models from: ${url}`);

		const headers: Record<string, string> = {
			"User-Agent": getUserAgent(),
			Accept: "application/json",
			...(this.knownConfig.customHeader || {}),
			...(this.knownConfig.openai?.customHeader || {}),
		};
		if (apiKey) {
			headers.Authorization = `Bearer ${apiKey}`;
		}

		Logger.debug(
			`[${this.providerKey}] Request headers: ${JSON.stringify({ ...headers, Authorization: "Bearer ***" })}`,
		);
		const resp = await fetch(url, { method: "GET", headers });

		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(
				`Failed to fetch models: ${resp.status} ${resp.statusText}\n${text}`,
			);
		}

		const parsed = (await resp.json()) as Record<string, unknown>;
		Logger.trace(
			`[${this.providerKey}] API response:`,
			JSON.stringify(parsed).substring(0, 500),
		);

			// Parse response using configured path
			const parser = this.knownConfig.modelParser || {};
			const arrayPath = parser.arrayPath || "data";
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

			const filterField = parser.filterField;
			const filterValue = parser.filterValue;
			if (filterField && filterValue !== undefined) {
				models = models.filter(
					(model) => String(model[filterField]) === filterValue,
				);
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

			const modelConfigs: ModelConfig[] = [];
			const seenIds = new Set<string>();

			for (const m of models) {
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

				if (seenIds.has(cleanId)) {
					continue;
				}
				seenIds.add(cleanId);

				modelConfigs.push({
					id: cleanId,
					name: String(m[nameField] || modelId),
					tooltip: String(m[descField] || `${modelId}`),
					maxInputTokens,
					maxOutputTokens,
					model: modelId,
					capabilities: resolveGlobalCapabilities(modelId, {}),
				});
			}

			Logger.debug(
				`[${this.providerKey}] Parsed ${modelConfigs.length} unique models`,
			);

			// Update in-memory configuration if changed
			const oldModelsJson = JSON.stringify(this.baseProviderConfig.models);
			const newModelsJson = JSON.stringify(modelConfigs);

			if (oldModelsJson !== newModelsJson) {
				Logger.info(`[${this.providerKey}] Model list changed, updating...`);
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
			} else {
				Logger.debug(`[${this.providerKey}] Model list unchanged`);
			}
		} catch (err) {
			Logger.error(`[${this.providerKey}] Model update failed:`, err);
		}
	}

	private async ensureApiKey(silent: boolean): Promise<string | undefined> {
		let apiKey = await ApiKeyManager.getApiKey(this.providerKey);
		if (!apiKey && this.knownConfig.defaultApiKey) {
			return this.knownConfig.defaultApiKey;
		}
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
				provider.scheduleModelRefresh(true, true);
				provider._onDidChangeLanguageModelChatInformation.fire(undefined);
			},
		);

		const refreshModelsCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.refreshModels`,
			async () => {
				await provider.modelInfoCache?.invalidateCache(providerKey);
				provider.scheduleModelRefresh(true, true);
				provider._onDidChangeLanguageModelChatInformation.fire(undefined);
			},
		);

		const disposables = [
			providerDisposable,
			setApiKeyCommand,
			refreshModelsCommand,
		];
		for (const d of disposables) {
			context.subscriptions.push(d);
		}

		// Warm-up fetch once during activation when key already exists
		provider.scheduleModelRefresh(true, true);

		return { provider, disposables };
	}
}
