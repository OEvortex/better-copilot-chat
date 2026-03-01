/*---------------------------------------------------------------------------------------------
 *  Independent Compatible Provider
 *  Inherits GenericModelProvider, overriding necessary methods to support full user configuration
 *--------------------------------------------------------------------------------------------*/

import type {
	LanguageModelChatInformation,
	LanguageModelChatMessage,
	Progress,
	ProvideLanguageModelChatResponseOptions,
} from "vscode";
import * as vscode from "vscode";
import type {
	ModelConfig,
	ModelOverride,
	ProviderConfig,
} from "../../types/sharedTypes";
import {
	ApiKeyManager,
	CompatibleModelManager,
	ConfigManager,
	KnownProviders,
	Logger,
	RetryManager,
} from "../../utils";
import { GenericModelProvider } from "../common/genericModelProvider";
import { configProviders } from "../config";

/**
 * Independent Compatible Model Provider Class
 * Inherits GenericModelProvider, overriding model configuration retrieval methods
 */
export class CompatibleProvider extends GenericModelProvider {
	private static readonly PROVIDER_KEY = "compatible";
	private modelsChangeListener?: vscode.Disposable;
	private retryManager: RetryManager;

	constructor(context: vscode.ExtensionContext) {
		// Create a virtual ProviderConfig, actual model configurations are retrieved from CompatibleModelManager
		const virtualConfig: ProviderConfig = {
			displayName: "Compatible",
			baseUrl: "https://api.openai.com/v1", // Default value, will be overridden during actual use
			apiKeyTemplate: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			models: [], // Empty model list, actual retrieved from CompatibleModelManager
		};
		super(context, CompatibleProvider.PROVIDER_KEY, virtualConfig);

		// Configure specific retry parameters for Compatible
		this.retryManager = new RetryManager({
			maxAttempts: 3,
			initialDelayMs: 1000,
			maxDelayMs: 30000,
			backoffMultiplier: 2,
			jitterEnabled: true,
		});

		this.getProviderConfig(); // Initialize configuration cache
		// Listen for CompatibleModelManager change events
		this.modelsChangeListener = CompatibleModelManager.onDidChangeModels(() => {
			Logger.debug(
				"[compatible] Received model change event, refreshing configuration and cache",
			);
			this.getProviderConfig(); // Refresh configuration cache
			// Clear model cache
			this.modelInfoCache
				?.invalidateCache(CompatibleProvider.PROVIDER_KEY)
				.catch((err) =>
					Logger.warn("[compatible] Failed to clear cache:", err),
				);
			this._onDidChangeLanguageModelChatInformation.fire();
			Logger.debug(
				"[compatible] Triggered language model information change event",
			);
		});
	}

	override dispose(): void {
		this.modelsChangeListener?.dispose();
		super.dispose();
	}

	/**
	 * Override: Get dynamic provider configuration
	 * Retrieve user-configured models from CompatibleModelManager
	 */
	getProviderConfig(): ProviderConfig {
		try {
			const models = CompatibleModelManager.getModels();
			// Convert CompatibleModelManager models to ModelConfig format
			const modelConfigs: ModelConfig[] = models.map((model) => {
				let customHeader = model.customHeader;
				if (model.provider) {
					const provider = KnownProviders[model.provider];
					if (provider?.customHeader) {
						const existingHeaders = model.customHeader || {};
						customHeader = { ...existingHeaders, ...provider.customHeader };
					}

					let knownOverride: Omit<ModelOverride, "id"> | undefined;
					if (model.sdkMode === "anthropic" && provider?.anthropic) {
						knownOverride = provider.anthropic;
					} else if (model.sdkMode !== "anthropic" && provider?.openai) {
						knownOverride = provider.openai.extraBody;
					}

					if (knownOverride) {
						const extraBody = knownOverride.extraBody || {};
						const modelBody = model.extraBody || {};
						model.extraBody = { ...extraBody, ...modelBody };
					}
				}
				return {
					id: model.id,
					name: model.name,
					provider: model.provider,
					tooltip: model.tooltip || `${model.name} (${model.sdkMode})`,
					maxInputTokens: model.maxInputTokens,
					maxOutputTokens: model.maxOutputTokens,
					sdkMode: model.sdkMode,
					capabilities: model.capabilities,
					...(model.baseUrl && { baseUrl: model.baseUrl }),
					...(model.model && { model: model.model }),
					...(customHeader && { customHeader: customHeader }),
					...(model.extraBody && { extraBody: model.extraBody }),
					...(model.outputThinking !== undefined && {
						outputThinking: model.outputThinking,
					}),
					...(model.includeThinking !== undefined && {
						includeThinking: model.includeThinking,
					}),
				};
			});

			Logger.debug(
				`Compatible Provider loaded ${modelConfigs.length} user-configured models`,
			);

			this.cachedProviderConfig = {
				displayName: "Compatible",
				baseUrl: "https://api.openai.com/v1", // Default value, model-level configuration will override
				apiKeyTemplate: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
				models: modelConfigs,
			};
		} catch (error) {
			Logger.error("Failed to get Compatible Provider configuration:", error);
			// Return basic configuration as backup
			this.cachedProviderConfig = {
				displayName: "Compatible",
				baseUrl: "https://api.openai.com/v1",
				apiKeyTemplate: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
				models: [],
			};
		}
		return this.cachedProviderConfig;
	}

	/**
	 * Override: Provide language model chat information
	 * Get the latest dynamic configuration directly, not relying on configuration at construction time
	 * Check API Keys for providers involved in all models
	 * Integrate model caching mechanism to improve performance
	 */
	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: vscode.CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		try {
			// Get API key hash for cache validation
			const apiKeyHash = await this.getApiKeyHash();

			// Fast path: check cache
			let cachedModels = await this.modelInfoCache?.getCachedModels(
				CompatibleProvider.PROVIDER_KEY,
				apiKeyHash,
			);
			if (cachedModels) {
				Logger.trace(
					`Compatible Provider cache hit: ${cachedModels.length} models`,
				);

				// Read user's last selected model and mark as default (only if memory is enabled)
				const rememberLastModel = ConfigManager.getRememberLastModel();
				if (rememberLastModel) {
					const lastSelectedId = this.modelInfoCache?.getLastSelectedModel(
						CompatibleProvider.PROVIDER_KEY,
					);
					if (lastSelectedId) {
						cachedModels = cachedModels.map((model) => ({
							...model,
							isDefault: model.id === lastSelectedId,
						}));
					}
				}

				// Background asynchronous cache update
				this.updateModelCacheAsync(apiKeyHash);
				return cachedModels;
			}

			// Get latest dynamic configuration
			const currentConfig = this.providerConfig;
			// If no models, return empty list directly
			if (currentConfig.models.length === 0) {
				// Trigger new model addition process asynchronously, but do not block configuration retrieval
				if (!options.silent) {
					setImmediate(async () => {
						try {
							await CompatibleModelManager.configureModelOrUpdateAPIKey();
						} catch {
							Logger.debug(
								"Automatically triggering new model addition failed or was cancelled by user",
							);
						}
					});
				}
				return [];
			}

			// Get providers involved in all models (deduplicate)
			const providers = new Set<string>();
			for (const model of currentConfig.models) {
				if (model.provider) {
					providers.add(model.provider);
				}
			}
			// Check API Key for each provider
			for (const provider of providers) {
				if (!options.silent) {
					// In non-silent mode, use ensureApiKey to confirm and set one by one
					const hasValidKey = await ApiKeyManager.ensureApiKey(
						provider,
						provider,
						false,
					);
					if (!hasValidKey) {
						Logger.warn(
							`Compatible Provider: user has not set API key for provider "${provider}"`,
						);
						return [];
					}
				}
			}

			let modelInfos = currentConfig.models.map((model) => {
				const info = this.modelConfigToInfo(model);
				const sdkModeDisplay =
					model.sdkMode === "anthropic" ? "Anthropic" : "OpenAI";

				if (model.provider) {
					const knownProvider = KnownProviders[model.provider];
					if (knownProvider?.displayName) {
						return {
							...info,
							detail: knownProvider.displayName,
							family: "compatible",
						};
					}
					const provider =
						configProviders[model.provider as keyof typeof configProviders];
					if (provider?.displayName) {
						return {
							...info,
							detail: provider.displayName,
							family: "compatible",
						};
					}
				}

				return {
					...info,
					detail: `${sdkModeDisplay} Compatible`,
					family: "compatible",
				};
			});

			// Read user's last selected model and mark as default (only if memory is enabled)
			const rememberLastModel = ConfigManager.getRememberLastModel();
			if (rememberLastModel) {
				const lastSelectedId = this.modelInfoCache?.getLastSelectedModel(
					CompatibleProvider.PROVIDER_KEY,
				);
				if (lastSelectedId) {
					modelInfos = modelInfos.map((model) => ({
						...model,
						isDefault: model.id === lastSelectedId,
					}));
				}
			}

			Logger.debug(
				`Compatible Provider provided ${modelInfos.length} model information`,
			); // Background asynchronous cache update
			this.updateModelCacheAsync(apiKeyHash);

			return modelInfos;
		} catch (error) {
			Logger.error(
				"Failed to get Compatible Provider model information:",
				error,
			);
			return [];
		}
	}

	/**
	 * Override: Update model cache asynchronously
	 * Need to correctly set detail field to display SDK mode
	 */
	protected override updateModelCacheAsync(
		apiKeyHash: string,
		models?: LanguageModelChatInformation[],
	): void {
		(async () => {
			try {
				const currentConfig = this.providerConfig;

				const models = currentConfig.models.map((model) => {
					const info = this.modelConfigToInfo(model);
					const sdkModeDisplay =
						model.sdkMode === "anthropic" ? "Anthropic" : "OpenAI";

					if (model.provider) {
						const knownProvider = KnownProviders[model.provider];
						if (knownProvider?.displayName) {
							return {
								...info,
								detail: knownProvider.displayName,
								family: "compatible",
							};
						}
						const provider =
							configProviders[model.provider as keyof typeof configProviders];
						if (provider?.displayName) {
							return {
								...info,
								detail: provider.displayName,
								family: "compatible",
							};
						}
					}

					return {
						...info,
						detail: `${sdkModeDisplay} Compatible`,
						family: "compatible",
					};
				});

				await this.modelInfoCache?.cacheModels(
					CompatibleProvider.PROVIDER_KEY,
					models,
					apiKeyHash,
				);
			} catch (err) {
				Logger.trace(
					"[compatible] Background cache update failed:",
					err instanceof Error ? err.message : String(err),
				);
			}
		})();
	}

	/**
	 * Override: Provide language model chat response
	 * Process request using latest dynamic configuration and add failure retry mechanism
	 */
	async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		// Save user's selected model and its provider (only if memory is enabled)
		const rememberLastModel = ConfigManager.getRememberLastModel();
		if (rememberLastModel) {
			this.modelInfoCache
				?.saveLastSelectedModel(CompatibleProvider.PROVIDER_KEY, model.id)
				.catch((err) =>
					Logger.warn("[compatible] Failed to save model selection:", err),
				);
		}

		try {
			// Get latest dynamic configuration
			const currentConfig = this.providerConfig;

			// Find corresponding model configuration
			const modelConfig = currentConfig.models.find((m) => m.id === model.id);
			if (!modelConfig) {
				const errorMessage = `Compatible Provider could not find model: ${model.id}`;
				Logger.error(errorMessage);
				throw new Error(errorMessage);
			}

			// Check API key (use throwError: false to allow silent failure)
			const hasValidKey = await ApiKeyManager.ensureApiKey(
				modelConfig.provider!,
				currentConfig.displayName,
				false,
			);
			if (!hasValidKey) {
				throw new Error(
					`API key for model ${modelConfig.name} has not been set yet`,
				);
			}

			// Select handler based on model's sdkMode
			const sdkMode = modelConfig.sdkMode || "openai";
			let sdkName = "OpenAI SDK";
			if (sdkMode === "anthropic") {
				sdkName = "Anthropic SDK";
			}

			Logger.info(
				`Compatible Provider starts processing request (${sdkName}): ${modelConfig.name}`,
			);

			try {
				// Execute request using retry mechanism
				await this.retryManager.executeWithRetry(
					async () => {
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
					},
					(error) => RetryManager.isRateLimitError(error),
					this.providerConfig.displayName,
				);
			} catch (error) {
				const errorMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
				Logger.error(errorMessage);
				throw error;
			} finally {
				Logger.info(`Compatible Provider: ${model.name} Request completed`);
			}
		} catch (error) {
			Logger.error("Compatible Provider failed to process request:", error);
			throw error;
		}
	}

	/**
	 * Register commands
	 */
	private static registerCommands(
		context: vscode.ExtensionContext,
	): vscode.Disposable[] {
		const disposables: vscode.Disposable[] = [];
		// Register manageModels command
		disposables.push(
			vscode.commands.registerCommand(
				"chp.compatible.manageModels",
				async () => {
					try {
						await CompatibleModelManager.configureModelOrUpdateAPIKey();
					} catch (error) {
						Logger.error("Failed to manage Compatible models:", error);
						vscode.window.showErrorMessage(
							`Failed to manage models: ${error instanceof Error ? error.message : "Unknown error"}`,
						);
					}
				},
			),
		);
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}
		Logger.debug("Compatible Provider commands registered");
		return disposables;
	}

	/**
	 * Static factory method - Create and activate provider
	 */
	static createAndActivate(context: vscode.ExtensionContext): {
		provider: CompatibleProvider;
		disposables: vscode.Disposable[];
	} {
		Logger.trace("Compatible Provider activated!");
		// Create provider instance
		const provider = new CompatibleProvider(context);
		// Register language model chat provider
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			"chp.compatible",
			provider,
		);
		// Register commands
		const commandDisposables = CompatibleProvider.registerCommands(context);
		const disposables = [providerDisposable, ...commandDisposables];
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}
		return { provider, disposables };
	}
}
