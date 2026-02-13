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
			if (e.affectsConfiguration("chp.editToolMode")) {
				Logger.trace(`${this.providerKey} detected editToolMode change`);
				// Clear cache
				this.modelInfoCache
					?.invalidateCache(this.providerKey)
					.catch((err) =>
						Logger.warn(`[${this.providerKey}] Failed to clear cache:`, err),
					);
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
		// Read edit tool mode setting
		const editToolMode = vscode.workspace
			.getConfiguration("chp")
			.get("editToolMode", "claude") as string;

		let family: string;
		if (editToolMode && editToolMode !== "none") {
			family = editToolMode.startsWith("claude")
				? "claude-sonnet-4.5"
				: editToolMode;
		} else if (editToolMode === "none") {
			family = model.id;
		} else {
			family = model.id; // Fall back to using model ID
		}

		const info: LanguageModelChatInformation = {
			id: model.id,
			name: model.name,
			detail: this.providerConfig.displayName,
			tooltip:
				model.tooltip || `${model.name} via ${this.providerConfig.displayName}`,
			family: family,
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			version: model.id,
			capabilities: model.capabilities,
		};

		return info;
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
		const hasApiKey = await ApiKeyManager.hasValidApiKey(this.providerKey);
		if (!hasApiKey) {
			// If silent mode (e.g. extension startup), do not trigger user interaction, return empty list directly
			if (options.silent) {
				return [];
			}
			// In non-silent mode, trigger API key setup directly
			await vscode.commands.executeCommand(`chp.${this.providerKey}.setApiKey`);
			// Re-check API key
			const hasApiKeyAfterSet = await ApiKeyManager.hasValidApiKey(
				this.providerKey,
			);
			if (!hasApiKeyAfterSet) {
				// If user cancels setup or setup fails, return empty list
				return [];
			}
		}
		// Convert models in configuration to VS Code format
		let models = this.providerConfig.models.map((model) =>
			this.modelConfigToInfo(model),
		);

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
			this.updateModelCacheAsync(apiKeyHash);
		} catch (err) {
			Logger.warn(`[${this.providerKey}] Cache saving failed:`, err);
		}

		return this.dedupeModelInfos(models);
	}

	/**
	 * Update model cache asynchronously (non-blocking)
	 */
	protected updateModelCacheAsync(apiKeyHash: string): void {
		// Use Promise to execute in background, do not wait for result
		(async () => {
			try {
				let models = this.providerConfig.models.map((model) =>
					this.modelConfigToInfo(model),
				);
				models = this.dedupeModelInfos(models);

				await this.modelInfoCache?.cacheModels(
					this.providerKey,
					models,
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
			(m: ModelConfig) => m.id === model.id,
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
