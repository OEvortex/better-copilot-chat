/*---------------------------------------------------------------------------------------------
 *  Generic Provider Class
 *  Dynamically create provider implementation based on configuration file
 *--------------------------------------------------------------------------------------------*/

import type {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatMessage,
	LanguageModelChatProvider,
	Progress,
	ProvideLanguageModelChatResponseOptions,
} from "vscode";
import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { AccountManager } from "../../accounts";
import type { Account } from "../../accounts/types";
import type { ModelConfig, ProviderConfig } from "../../types/sharedTypes";
import {
	AnthropicHandler,
	ApiKeyManager,
	ConfigManager,
	Logger,
	ModelInfoCache,
	OpenAIHandler,
	TokenCounter,
} from "../../utils";
import { ProviderWizard } from "../../utils/providerWizard";
import { MoonshotWizard } from "../moonshot/moonshotWizard";

/**
 * Generic Model Provider Class
 * Dynamically create provider implementation based on configuration file
 */
export class GenericModelProvider implements LanguageModelChatProvider {
	protected openaiHandler!: OpenAIHandler;
	protected anthropicHandler!: AnthropicHandler;
	protected readonly providerKey: string;
	protected readonly context: vscode.ExtensionContext;
	protected baseProviderConfig: ProviderConfig; // protected to support subclass access
	protected cachedProviderConfig: ProviderConfig; // Cached configuration
	protected configListener?: vscode.Disposable; // Configuration listener
	protected modelInfoCache?: ModelInfoCache; // Model information cache
	protected readonly accountManager: AccountManager;
	protected readonly lastUsedAccountByModel = new Map<string, string>();

	// Cached chat endpoints for chat endpoint-aware providers (model id and max prompt tokens)
	protected _chatEndpoints?: { model: string; modelMaxPromptTokens: number }[];

	// Model information change event
	protected _onDidChangeLanguageModelChatInformation =
		new vscode.EventEmitter<void>();
	readonly onDidChangeLanguageModelChatInformation =
		this._onDidChangeLanguageModelChatInformation.event;

	constructor(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	) {
		this.context = context;
		this.providerKey = providerKey;
		this.accountManager = AccountManager.getInstance();
		// Save original configuration (overrides not applied)
		this.baseProviderConfig = providerConfig;
		// Initialize cached configuration (overrides applied)
		this.cachedProviderConfig = ConfigManager.applyProviderOverrides(
			this.providerKey,
			this.baseProviderConfig,
		);
		// Initialize model information cache
		this.modelInfoCache = new ModelInfoCache(context);

		// Listen for configuration changes
		this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
			// Check if it is a change in providerOverrides or baseUrl settings
			if (
				providerKey !== "compatible" &&
				(e.affectsConfiguration("chp.providerOverrides") ||
					e.affectsConfiguration(`chp.${providerKey}.baseUrl`))
			) {
				// Recalculate configuration
				this.cachedProviderConfig = ConfigManager.applyProviderOverrides(
					this.providerKey,
					this.baseProviderConfig,
				);
				this.refreshHandlers();
				// Clear cache
				this.modelInfoCache
					?.invalidateCache(this.providerKey)
					.catch((err) =>
						Logger.warn(`[${this.providerKey}] Failed to clear cache:`, err),
					);
				Logger.trace(`${this.providerKey} configuration updated`);
				this._onDidChangeLanguageModelChatInformation.fire();
			}
		});
		// Listen for chat endpoint changes
		this.accountManager.onAccountChange((e) => {
			if (e.provider === this.providerKey || e.provider === "all") {
				Logger.trace(
					`[${this.providerKey}] Account change detected: ${e.type}`,
				);
				// Invalidate cache
				this.modelInfoCache
					?.invalidateCache(this.providerKey)
					.catch((err) =>
						Logger.warn(`[${this.providerKey}] Failed to clear cache:`, err),
					);
				// Trigger model info change event to sync with VS Code LM selection
				this._onDidChangeLanguageModelChatInformation.fire();
			}
		});

		// Create SDK handlers (use overrides)
		this.refreshHandlers();
	}

	/**
	 * Refresh SDK handlers to apply baseUrl overrides
	 */
	protected refreshHandlers(): void {
		this.openaiHandler?.dispose();
		this.openaiHandler = new OpenAIHandler(
			this.providerKey,
			this.baseProviderConfig.displayName,
			this.cachedProviderConfig.baseUrl,
		);
		this.anthropicHandler = new AnthropicHandler(
			this.providerKey,
			this.baseProviderConfig.displayName,
			this.cachedProviderConfig.baseUrl,
		);
	}

	/**
	 * Deduplicate model info by id
	 */
	protected dedupeModelInfos(
		models: LanguageModelChatInformation[],
	): LanguageModelChatInformation[] {
		const seen = new Set<string>();
		const deduped: LanguageModelChatInformation[] = [];
		for (const model of models) {
			if (seen.has(model.id)) {
				Logger.warn(
					`[${this.providerKey}] Duplicate model id detected, skipping: ${model.id}`,
				);
				continue;
			}
			seen.add(model.id);
			deduped.push(model);
		}
		return deduped;
	}

	/**
	 * Release resources
	 */
	dispose(): void {
		// Release configuration listener
		this.configListener?.dispose();
		// Release event emitter
		this._onDidChangeLanguageModelChatInformation.dispose();
		// Release handler resources
		// this.anthropicHandler?.dispose();
		this.openaiHandler?.dispose();
		Logger.info(`${this.providerConfig.displayName}: Extension destroyed`);
	}

	/**
	 * Get current effective provider configuration
	 */
	get providerConfig(): ProviderConfig {
		return this.cachedProviderConfig;
	}

	/**
	 * Static factory method - Create and activate provider based on configuration
	 */
	static createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: GenericModelProvider; disposables: vscode.Disposable[] } {
		Logger.trace(`${providerConfig.displayName} model extension activated!`);
		// Create provider instance
		const provider = new GenericModelProvider(
			context,
			providerKey,
			providerConfig,
		);
		// Register language model chat provider
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			`chp.${providerKey}`,
			provider,
		);
		// Register command to configure provider
		const setApiKeyCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.setApiKey`,
			async () => {
				if (providerKey === "moonshot") {
					await MoonshotWizard.startWizard(
						providerConfig.displayName,
						providerConfig.apiKeyTemplate,
					);
				} else {
					await ProviderWizard.startWizard({
						providerKey,
						displayName: providerConfig.displayName,
						apiKeyTemplate: providerConfig.apiKeyTemplate,
						supportsApiKey: true,
						supportsBaseUrl: true
					});
				}
				// Clear cache after configuration change
				await provider.modelInfoCache?.invalidateCache(providerKey);
				// Trigger model information change event
				provider._onDidChangeLanguageModelChatInformation.fire();
			},
		);
		const disposables = [providerDisposable, setApiKeyCommand];
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}
		return { provider, disposables };
	}

	/**
	 * Convert ModelConfig to LanguageModelChatInformation
	 */
	protected modelConfigToInfo(
		model: ModelConfig,
	): LanguageModelChatInformation {
		const info: LanguageModelChatInformation = {
			id: model.id,
			name: model.name,
			detail: this.providerConfig.displayName,
			tooltip:
				model.tooltip || `${model.name} via ${this.providerConfig.displayName}`,
			family: model.family || this.providerKey,
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			version: model.id,
			capabilities: model.capabilities,
		};

		return info;
	}

	/**
	 * Fetch models dynamically from the provider's API endpoint
	 * Returns the fetched models or empty array if the request fails
	 */
	protected async fetchModelsFromApi(apiKey: string): Promise<LanguageModelChatInformation[]> {
		try {
			const baseUrl = this.providerConfig.baseUrl;
			const modelsUrl = `${baseUrl}/models`;
			Logger.debug(`[${this.providerKey}] Fetching models from: ${modelsUrl}`);

			const abortController = new AbortController();
			const timeoutId = setTimeout(() => abortController.abort(), 15000); // 15 second timeout

			const ext = vscode.extensions.getExtension("OEvortex.better-copilot-chat");
			const extVersion = ext?.packageJSON?.version ?? "unknown";
			const vscodeVersion = vscode.version;
			const userAgent = `better-copilot-chat/${extVersion} VSCode/${vscodeVersion}`;

			const resp = await fetch(modelsUrl, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"User-Agent": userAgent,
				},
				signal: abortController.signal,
			});

			clearTimeout(timeoutId);

			if (!resp.ok) {
				const text = await resp.text();
				Logger.warn(
					`[${this.providerKey}] Failed to fetch models: ${resp.status} ${resp.statusText}`,
				);
				return [];
			}

			const parsed = await resp.json();
			const models = this.parseApiModelsResponse(parsed);
			Logger.info(`[${this.providerKey}] Successfully fetched ${models.length} models from API`);
			return models;
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") {
				Logger.warn(`[${this.providerKey}] Model fetch timeout (15s). Using pre-configured models.`);
			} else {
				Logger.warn(
					`[${this.providerKey}] Error fetching models from API:`,
					err instanceof Error ? err.message : String(err),
				);
			}
			return [];
		}
	}

	/**
	 * Parse the API response and convert to LanguageModelChatInformation
	 * Subclasses can override this to handle provider-specific response formats
	 */
	protected parseApiModelsResponse(resp: unknown): LanguageModelChatInformation[] {
		// Default implementation for OpenAI-compatible /v1/models response
		// Format: { data: [{ id: string, ... }] }
		const data = resp as { data?: Array<{ id: string; object?: string }> };
		if (!data.data || !Array.isArray(data.data)) {
			Logger.warn(`[${this.providerKey}] Invalid API response format`);
			return [];
		}

		return data.data
			.filter((m) => m.object === "model") // Only include model objects, not deployments
			.map((m) => ({
				id: m.id,
				name: this.formatModelName(m.id),
				detail: this.providerConfig.displayName,
				tooltip: `${m.id} via ${this.providerConfig.displayName}`,
				family: this.providerKey,
				maxInputTokens: 128000, // Default, will be improved
				maxOutputTokens: 16384,
				version: "1.0",
				capabilities: {
					toolCalling: true,
					imageInput: false,
				},
			}));
	}

	/**
	 * Format model ID into a display name
	 */
	protected formatModelName(modelId: string): string {
		// Convert model IDs like "meta-llama/Llama-3.1-70B-Instruct" to "Llama 3.1 70B Instruct"
		return modelId
			.split(/[/:-]/)
			.map((part) => part.trim())
			.filter((part) => part.length > 0 && !part.match(/^v\d+$/))
			.join(" ");
	}

	/**
	 * Get the config file path for this provider
	 */
	protected getConfigFilePath(): string | undefined {
		// Look for the provider config file in the extension
		const configPath = path.join(
			this.context.extensionPath,
			"src",
			"providers",
			"config",
			`${this.providerKey}.json`,
		);
		try {
			// Use synchronous check for existence as it's faster for this use case
			const fsSync = require("fs");
			if (fsSync.existsSync(configPath)) {
				return configPath;
			}
		} catch {}
		return undefined;
	}

	/**
	 * Update the provider's config file with new models
	 * This allows automatic model list updates
	 */
	protected async updateConfigFileAsync(models: LanguageModelChatInformation[]): Promise<void> {
		const configPath = this.getConfigFilePath();
		if (!configPath) {
			Logger.debug(`[${this.providerKey}] No config file found to update`);
			return;
		}

		// Run in background using async fs
		this.writeConfigInBackground(configPath, models);
	}

	/**
	 * Write config file in background (non-blocking)
	 */
	private writeConfigInBackground(configPath: string, models: LanguageModelChatInformation[]): void {
		// Use async fs operations to avoid blocking
		(async () => {
			try {
				// Read existing config
				let existingConfig: ProviderConfig;
				try {
					const configContent = await fs.readFile(configPath, "utf8");
					existingConfig = JSON.parse(configContent);
				} catch {
					existingConfig = {
						displayName: this.providerConfig.displayName,
						baseUrl: this.providerConfig.baseUrl,
						apiKeyTemplate: this.providerConfig.apiKeyTemplate,
						models: [],
					};
				}

				// Merge with existing static models, avoiding duplicates
				const existingModelIds = new Set(existingConfig.models.map((m) => m.id));
				const newModels: ModelConfig[] = models.map((m) => ({
					id: m.id,
					name: m.name || m.id,
					tooltip: m.tooltip || m.id,
					maxInputTokens: m.maxInputTokens,
					maxOutputTokens: m.maxOutputTokens,
					capabilities: {
						toolCalling: Boolean(m.capabilities?.toolCalling ?? true),
						imageInput: Boolean(m.capabilities?.imageInput ?? false),
					},
				}));

				// Add new models that don't already exist
				for (const newModel of newModels) {
					if (!existingModelIds.has(newModel.id)) {
						existingConfig.models.push(newModel);
					}
				}

				// Write back to config file
				await fs.writeFile(
					configPath,
					JSON.stringify(existingConfig, null, 4),
					"utf8",
				);
				Logger.info(`[${this.providerKey}] Auto-updated config with ${newModels.length} new models`);
			} catch (err) {
				Logger.warn(`[${this.providerKey}] Background config update failed:`, err instanceof Error ? err.message : String(err));
			}
		})();
	}

	/**
	 * Check if dynamic model fetching is enabled for this provider
	 * Can be overridden by subclasses
	 */
	protected shouldFetchModelsFromApi(): boolean {
		// Only fetch if we have a valid baseUrl
		return !!this.providerConfig.baseUrl && this.providerConfig.baseUrl.startsWith("http");
	}

	/**
	 * Fetch models from API and update cache + config file asynchronously (non-blocking)
	 */
	protected fetchAndUpdateModelsAsync(apiKey: string): void {
		(async () => {
			try {
				const apiModels = await this.fetchModelsFromApi(apiKey);
				if (apiModels.length > 0) {
					Logger.debug(`[${this.providerKey}] Updating with ${apiModels.length} models from API`);
					// Update config file in background
					await this.updateConfigFileAsync(apiModels);
					// Fire event to notify VS Code that models are available
					this._onDidChangeLanguageModelChatInformation.fire();
				}
			} catch (err) {
				Logger.debug(`[${this.providerKey}] Background model fetch failed:`, err instanceof Error ? err.message : String(err));
			}
		})();
	}

	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		// Fast path: check cache
		try {
			const apiKeyHash = await this.getApiKeyHash();
			let cachedModels = await this.modelInfoCache?.getCachedModels(
				this.providerKey,
				apiKeyHash,
			);

			if (cachedModels) {
				Logger.trace(
					`[${this.providerKey}] Return model list from cache ` +
						`(${cachedModels.length} models)`,
				);

				// Read user's last selected model and mark as default (only if memory is enabled)
				const rememberLastModel = ConfigManager.getRememberLastModel();
				if (rememberLastModel) {
					const lastSelectedId = this.modelInfoCache?.getLastSelectedModel(
						this.providerKey,
					);
					if (lastSelectedId) {
						cachedModels = cachedModels.map((model) => ({
							...model,
							isDefault: model.id === lastSelectedId,
						}));
					}
				}

				// Background asynchronous cache update (non-blocking, do not await)
				this.updateModelCacheAsync(apiKeyHash);

				return this.dedupeModelInfos(cachedModels);
			}
		} catch (err) {
			Logger.warn(
				`[${this.providerKey}] Cache query failed, falling back to original logic:`,
				err instanceof Error ? err.message : String(err),
			);
		}

		// Original logic: check API key and build model list
		const apiKey = await ApiKeyManager.getApiKey(this.providerKey);
		if (!apiKey) {
			// If silent mode (e.g. extension startup), do not trigger user interaction, return empty list directly
			if (options.silent) {
				return [];
			}
			// In non-silent mode, trigger API key setup directly
			await vscode.commands.executeCommand(`chp.${this.providerKey}.setApiKey`);
			// Re-check API key
			const newApiKey = await ApiKeyManager.getApiKey(this.providerKey);
			if (!newApiKey) {
				// If user cancels setup or setup fails, return empty list
				return [];
			}
		}

		// Start with static config models
		let models = this.providerConfig.models.map((model) =>
			this.modelConfigToInfo(model),
		);

		// Try to fetch models from API dynamically in background (only in non-silent mode to avoid startup delays)
		// This updates the model list asynchronously without blocking the response
		if (!options.silent && this.shouldFetchModelsFromApi() && apiKey) {
			this.fetchAndUpdateModelsAsync(apiKey);
		}

		// Read user's last selected model and mark as default (only if memory is enabled and provider matches)
		const rememberLastModel = ConfigManager.getRememberLastModel();
		if (rememberLastModel) {
			const lastSelectedId = this.modelInfoCache?.getLastSelectedModel(
				this.providerKey,
			);
			if (lastSelectedId) {
				models = models.map((model) => ({
					...model,
					isDefault: model.id === lastSelectedId,
				}));
			}
		}

		// Asynchronously cache results (non-blocking)
		try {
			const apiKeyHash = await this.getApiKeyHash();
			this.updateModelCacheAsync(apiKeyHash, models);
		} catch (err) {
			Logger.warn(`[${this.providerKey}] Cache saving failed:`, err);
		}

		return this.dedupeModelInfos(models);
	}

	/**
	 * Update model cache asynchronously (non-blocking)
	 * @param apiKeyHash The API key hash for cache validation
	 * @param models Optional models to cache (defaults to static config models)
	 */
	protected updateModelCacheAsync(apiKeyHash: string, models?: LanguageModelChatInformation[]): void {
		// Use Promise to execute in background, do not wait for result
		(async () => {
			try {
				let modelsToCache = models;
				if (!modelsToCache) {
					modelsToCache = this.providerConfig.models.map((model) =>
						this.modelConfigToInfo(model),
					);
				}
				modelsToCache = this.dedupeModelInfos(modelsToCache);

				await this.modelInfoCache?.cacheModels(
					this.providerKey,
					modelsToCache,
					apiKeyHash,
				);
			} catch (err) {
				// Background update failure should not affect extension operation
				Logger.trace(
					`[${this.providerKey}] Background cache update failed:`,
					err instanceof Error ? err.message : String(err),
				);
			}
		})();
	}

	/**
	 * Compute API key hash (used for cache check)
	 */
	protected async getApiKeyHash(): Promise<string> {
		try {
			const apiKey = await ApiKeyManager.getApiKey(this.providerKey);
			if (!apiKey) {
				return "no-key";
			}
			return await ModelInfoCache.computeApiKeyHash(apiKey);
		} catch (err) {
			Logger.warn(
				`[${this.providerKey}] Failed to compute API key hash:`,
				err instanceof Error ? err.message : String(err),
			);
			return "hash-error";
		}
	}

	async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<vscode.LanguageModelResponsePart>,
		token: CancellationToken,
	): Promise<void> {
		// Save user's selected model and its provider (only if memory is enabled)
		const rememberLastModel = ConfigManager.getRememberLastModel();
		if (rememberLastModel) {
			this.modelInfoCache
				?.saveLastSelectedModel(this.providerKey, model.id)
				.catch((err) =>
					Logger.warn(
						`[${this.providerKey}] Failed to save model selection:`,
						err,
					),
				);
		}

		// Find corresponding model configuration
		const modelConfig = this.providerConfig.models.find(
			(m: ModelConfig) => m.id === model.id || m.model === model.id,
		);
		if (!modelConfig) {
			const errorMessage = `Model not found: ${model.id}`;
			Logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		// Determine actual provider based on provider field in model configuration
		const effectiveProviderKey = modelConfig.provider || this.providerKey;

		try {
			const accounts =
				this.accountManager.getAccountsByProvider(effectiveProviderKey);
			const loadBalanceEnabled =
				this.accountManager.getLoadBalanceEnabled(effectiveProviderKey);
			const assignedAccountId = this.accountManager.getAccountIdForModel(
				effectiveProviderKey,
				model.id,
			);

			// If no accounts managed by AccountManager, fall back to ApiKeyManager
			if (accounts.length === 0) {
				await ApiKeyManager.ensureApiKey(
					effectiveProviderKey,
					this.providerConfig.displayName,
				);

				const sdkMode = modelConfig.sdkMode || "openai";
				Logger.info(
					`${this.providerConfig.displayName} Provider starts processing request (fallback mode): ${modelConfig.name}`,
				);

				if (sdkMode === "anthropic") {
					await this.anthropicHandler.handleRequest(
						model,
						modelConfig,
						messages,
						options,
						progress,
						token,
					);
				} else {
					await this.openaiHandler.handleRequest(
						model,
						modelConfig,
						messages,
						options,
						progress,
						token,
					);
				}
				return;
			}

			// Use AccountManager for multi-account support
			const usableAccounts =
				accounts.filter((a) => a.status === "active").length > 0
					? accounts.filter((a) => a.status === "active")
					: accounts;

			const candidates = this.buildAccountCandidates(
				model.id,
				usableAccounts,
				assignedAccountId,
				loadBalanceEnabled,
				effectiveProviderKey,
			);

			const activeAccount =
				this.accountManager.getActiveAccount(effectiveProviderKey);

			const available = loadBalanceEnabled
				? candidates.filter(
						(a) => !this.accountManager.isAccountQuotaLimited(a.id),
					)
				: candidates;

			let accountsToTry: Account[];
			if (available.length > 0) {
				if (activeAccount && available.some((a) => a.id === activeAccount.id)) {
					accountsToTry = [
						activeAccount,
						...available.filter((a) => a.id !== activeAccount.id),
					];
				} else {
					accountsToTry = available;
				}
			} else {
				if (
					activeAccount &&
					candidates.some((a) => a.id === activeAccount.id)
				) {
					accountsToTry = [
						activeAccount,
						...candidates.filter((a) => a.id !== activeAccount.id),
					];
				} else {
					accountsToTry = candidates;
				}
			}

			Logger.debug(
				`[${effectiveProviderKey}] Active account: ${activeAccount?.displayName || "none"}, accountsToTry: ${accountsToTry.map((a) => a.displayName).join(", ")}`,
			);

			let lastError: unknown;
			let switchedAccount = false;

			for (const account of accountsToTry) {
				const credentials = await this.accountManager.getCredentials(
					account.id,
				);
				if (!credentials) {
					lastError = new Error(
						`Missing credentials for ${account.displayName}`,
					);
					continue;
				}

				// Prepare model config with account-specific credentials
				const configWithAuth: ModelConfig = {
					...modelConfig,
					apiKey: "apiKey" in credentials ? credentials.apiKey : undefined,
					baseUrl: "endpoint" in credentials ? credentials.endpoint : undefined,
					customHeader:
						"customHeaders" in credentials
							? credentials.customHeaders
							: undefined,
				};

				// Override baseUrl with language model configuration baseUrl if available (lower priority than account endpoint)
				const selectionsMetadata = (options as any)?.selectionsMetadata;
				if (!configWithAuth.baseUrl && selectionsMetadata?.baseUrl) {
					configWithAuth.baseUrl = selectionsMetadata.baseUrl;
				}

				// Handle OAuth tokens if needed
				if ("accessToken" in credentials) {
					// For OAuth accounts, we might need to refresh or pass the token differently
					// Currently most GenericModelProvider models use API Key
					(configWithAuth as any).accessToken = credentials.accessToken;
					configWithAuth.apiKey = credentials.accessToken; // Often used as bearer token
				}

				try {
					const sdkMode = modelConfig.sdkMode || "openai";
					Logger.info(
						`${this.providerConfig.displayName}: ${model.name} using account "${account.displayName}" (ID: ${account.id})`,
					);

					if (sdkMode === "anthropic") {
						await this.anthropicHandler.handleRequest(
							model,
							configWithAuth,
							messages,
							options,
							progress,
							token,
							account.id,
						);
					} else {
						await this.openaiHandler.handleRequest(
							model,
							configWithAuth,
							messages,
							options,
							progress,
							token,
							account.id,
						);
					}

					this.lastUsedAccountByModel.set(model.id, account.id);

					if (switchedAccount) {
						if (loadBalanceEnabled) {
							const switched = await this.accountManager.switchAccount(
								effectiveProviderKey,
								account.id,
							);
							if (!switched) {
								Logger.warn(
									`[${effectiveProviderKey}] Failed to persist automatic account switch to ${account.displayName}`,
								);
							}
						}
						Logger.info(
							`[${effectiveProviderKey}] Saving account "${account.displayName}" as preferred for model ${model.id}`,
						);
						await this.accountManager.setAccountForModel(
							effectiveProviderKey,
							model.id,
							account.id,
						);
					}
					return;
				} catch (error) {
					switchedAccount = true;
					if (this.isLongTermQuotaExhausted(error)) {
						if (loadBalanceEnabled) {
							Logger.warn(
								`[${effectiveProviderKey}] Account ${account.displayName} quota exhausted, switching...`,
							);
							lastError = error;
							continue;
						}
						throw error;
					}
					if (loadBalanceEnabled && this.isQuotaError(error)) {
						Logger.warn(
							`[${effectiveProviderKey}] Account ${account.displayName} rate limited, switching...`,
						);
						lastError = error;
						continue;
					}
					throw error;
				}
			}

			if (lastError) {
				throw lastError;
			}
			throw new Error(`No available accounts for ${effectiveProviderKey}`);
		} catch (error) {
			const errorMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
			Logger.error(errorMessage);
			throw error;
		} finally {
			Logger.info(
				`${this.providerConfig.displayName}: ${model.name} Request completed`,
			);
		}
	}

	protected buildAccountCandidates(
		modelId: string,
		accounts: Account[],
		assignedAccountId: string | undefined,
		loadBalanceEnabled: boolean,
		providerKey: string,
	): Account[] {
		if (accounts.length === 0) {
			return [];
		}
		const assignedAccount = assignedAccountId
			? accounts.find((a) => a.id === assignedAccountId)
			: undefined;
		const activeAccount = this.accountManager.getActiveAccount(providerKey);
		const defaultAccount =
			activeAccount || accounts.find((a) => a.isDefault) || accounts[0];

		if (!loadBalanceEnabled) {
			return assignedAccount
				? [assignedAccount]
				: defaultAccount
					? [defaultAccount]
					: [];
		}

		const ordered = [...accounts].sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		);
		const lastUsed = this.lastUsedAccountByModel.get(modelId);
		let rotatedOrder = ordered;
		if (lastUsed) {
			const index = ordered.findIndex((a) => a.id === lastUsed);
			if (index >= 0) {
				rotatedOrder = [
					...ordered.slice(index + 1),
					...ordered.slice(0, index + 1),
				];
			}
		}
		if (assignedAccount) {
			return [
				assignedAccount,
				...rotatedOrder.filter((a) => a.id !== assignedAccount.id),
			];
		}
		if (defaultAccount) {
			return [
				defaultAccount,
				...rotatedOrder.filter((a) => a.id !== defaultAccount.id),
			];
		}
		return rotatedOrder;
	}

	protected isQuotaError(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}
		const msg = error.message;
		return (
			msg.startsWith("Quota exceeded") ||
			msg.startsWith("Rate limited") ||
			msg.includes("HTTP 429") ||
			msg.includes('"code": 429') ||
			msg.includes('"code":429') ||
			msg.includes("RESOURCE_EXHAUSTED") ||
			(msg.includes("429") && msg.includes("Resource has been exhausted"))
		);
	}

	protected isLongTermQuotaExhausted(error: unknown): boolean {
		return (
			error instanceof Error &&
			error.message.startsWith("Account quota exhausted")
		);
	}

	async provideTokenCount(
		model: LanguageModelChatInformation,
		text: string | LanguageModelChatMessage,
		_token: CancellationToken,
	): Promise<number> {
		return TokenCounter.getInstance().countTokens(model, text);
	}

	/**
	 * Calculate total tokens for multiple messages
	 */
	protected async countMessagesTokens(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		modelConfig?: ModelConfig,
		options?: ProvideLanguageModelChatResponseOptions,
	): Promise<number> {
		return TokenCounter.getInstance().countMessagesTokens(
			model,
			messages,
			modelConfig,
			options,
		);
	}
}
