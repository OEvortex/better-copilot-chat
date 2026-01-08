/*---------------------------------------------------------------------------------------------
 *  Generic Provider Class
 *  Dynamically create provider implementation based on configuration file
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
    CancellationToken,
    LanguageModelChatInformation,
    LanguageModelChatMessage,
    LanguageModelChatProvider,
    Progress,
    ProvideLanguageModelChatResponseOptions
} from 'vscode';
import { ProviderConfig, ModelConfig } from '../../types/sharedTypes';
import {
    ApiKeyManager,
    ConfigManager,
    Logger,
    OpenAIHandler,
    AnthropicHandler,
    ModelInfoCache,
    TokenCounter
} from '../../utils';
import { TokenUsageStatusBar } from '../../status/tokenUsageStatusBar';

/**
 * Generic Model Provider Class
 * Dynamically create provider implementation based on configuration file
 */
export class GenericModelProvider implements LanguageModelChatProvider {
    protected readonly openaiHandler: OpenAIHandler;
    protected readonly anthropicHandler: AnthropicHandler;
    protected readonly providerKey: string;
    protected readonly context: vscode.ExtensionContext;
    protected baseProviderConfig: ProviderConfig; // protected to support subclass access
    protected cachedProviderConfig: ProviderConfig; // Cached configuration
    protected configListener?: vscode.Disposable; // Configuration listener
    protected modelInfoCache?: ModelInfoCache; // Model information cache

    // Model information change event
    protected _onDidChangeLanguageModelChatInformation = new vscode.EventEmitter<void>();
    readonly onDidChangeLanguageModelChatInformation = this._onDidChangeLanguageModelChatInformation.event;

    constructor(context: vscode.ExtensionContext, providerKey: string, providerConfig: ProviderConfig) {
        this.context = context;
        this.providerKey = providerKey;
        // Save original configuration (overrides not applied)
        this.baseProviderConfig = providerConfig;
        // Initialize cached configuration (overrides applied)
        this.cachedProviderConfig = ConfigManager.applyProviderOverrides(this.providerKey, this.baseProviderConfig);
        // Initialize model information cache
        this.modelInfoCache = new ModelInfoCache(context);

        // Listen for configuration changes
        this.configListener = vscode.workspace.onDidChangeConfiguration(e => {
            // Check if it is a change in providerOverrides
            if (e.affectsConfiguration('chp.providerOverrides') && providerKey !== 'compatible') {
                // Recalculate configuration
                this.cachedProviderConfig = ConfigManager.applyProviderOverrides(
                    this.providerKey,
                    this.baseProviderConfig
                );
                // Clear cache
                this.modelInfoCache
                    ?.invalidateCache(this.providerKey)
                    .catch(err => Logger.warn(`[${this.providerKey}] Failed to clear cache:`, err));
                Logger.trace(`${this.providerKey} configuration updated`);
                this._onDidChangeLanguageModelChatInformation.fire();
            }
            if (e.affectsConfiguration('chp.editToolMode')) {
                Logger.trace(`${this.providerKey} detected editToolMode change`);
                // Clear cache
                this.modelInfoCache
                    ?.invalidateCache(this.providerKey)
                    .catch(err => Logger.warn(`[${this.providerKey}] Failed to clear cache:`, err));
                this._onDidChangeLanguageModelChatInformation.fire();
            }
        });

        // Create OpenAI SDK handler
        this.openaiHandler = new OpenAIHandler(providerKey, providerConfig.displayName, providerConfig.baseUrl);
        // Create Anthropic SDK handler
        this.anthropicHandler = new AnthropicHandler(providerKey, providerConfig.displayName, providerConfig.baseUrl);
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
        providerConfig: ProviderConfig
    ): { provider: GenericModelProvider; disposables: vscode.Disposable[] } {
        Logger.trace(`${providerConfig.displayName} model extension activated!`);
        // Create provider instance
        const provider = new GenericModelProvider(context, providerKey, providerConfig);
        // Register language model chat provider
        const providerDisposable = vscode.lm.registerLanguageModelChatProvider(`chp.${providerKey}`, provider);
        // Register command to set API key
        const setApiKeyCommand = vscode.commands.registerCommand(`chp.${providerKey}.setApiKey`, async () => {
            await ApiKeyManager.promptAndSetApiKey(
                providerKey,
                providerConfig.displayName,
                providerConfig.apiKeyTemplate
            );
            // Clear cache after API key change
            await provider.modelInfoCache?.invalidateCache(providerKey);
            // Trigger model information change event
            provider._onDidChangeLanguageModelChatInformation.fire();
        });
        const disposables = [providerDisposable, setApiKeyCommand];
        disposables.forEach(disposable => context.subscriptions.push(disposable));
        return { provider, disposables };
    }

    /**
     * Convert ModelConfig to LanguageModelChatInformation
     */
    protected modelConfigToInfo(model: ModelConfig): LanguageModelChatInformation {
        // Read edit tool mode setting
        const editToolMode = vscode.workspace.getConfiguration('chp').get('editToolMode', 'claude') as string;

        let family: string;
        if (editToolMode && editToolMode !== 'none') {
            family = editToolMode.startsWith('claude') ? 'claude-sonnet-4.5' : editToolMode;
        } else if (editToolMode === 'none') {
            family = model.id;
        } else {
            family = model.id; // Fall back to using model ID
        }

        const info: LanguageModelChatInformation = {
            id: model.id,
            name: model.name,
            detail: this.providerConfig.displayName,
            tooltip: model.tooltip,
            family: family,
            maxInputTokens: model.maxInputTokens,
            maxOutputTokens: model.maxOutputTokens,
            version: model.id,
            capabilities: model.capabilities
        };

        return info;
    }

    async provideLanguageModelChatInformation(
        options: { silent: boolean },
        _token: CancellationToken
    ): Promise<LanguageModelChatInformation[]> {
        // Fast path: check cache
        try {
            const apiKeyHash = await this.getApiKeyHash();
            let cachedModels = await this.modelInfoCache?.getCachedModels(this.providerKey, apiKeyHash);

            if (cachedModels) {
                Logger.trace(`[${this.providerKey}] Return model list from cache ` + `(${cachedModels.length} models)`);

                // Read user's last selected model and mark as default (only if memory is enabled)
                const rememberLastModel = ConfigManager.getRememberLastModel();
                if (rememberLastModel) {
                    const lastSelectedId = this.modelInfoCache?.getLastSelectedModel(this.providerKey);
                    if (lastSelectedId) {
                        cachedModels = cachedModels.map(model => ({
                            ...model,
                            isDefault: model.id === lastSelectedId
                        }));
                    }
                }

                // Background asynchronous cache update (non-blocking, do not await)
                this.updateModelCacheAsync(apiKeyHash);

                return cachedModels;
            }
        } catch (err) {
            Logger.warn(
                `[${this.providerKey}] Cache query failed, falling back to original logic:`,
                err instanceof Error ? err.message : String(err)
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
            const hasApiKeyAfterSet = await ApiKeyManager.hasValidApiKey(this.providerKey);
            if (!hasApiKeyAfterSet) {
                // If user cancels setup or setup fails, return empty list
                return [];
            }
        }
        // Convert models in configuration to VS Code format
        let models = this.providerConfig.models.map(model => this.modelConfigToInfo(model));

        // Read user's last selected model and mark as default (only if memory is enabled and provider matches)
        const rememberLastModel = ConfigManager.getRememberLastModel();
        if (rememberLastModel) {
            const lastSelectedId = this.modelInfoCache?.getLastSelectedModel(this.providerKey);
            if (lastSelectedId) {
                models = models.map(model => ({
                    ...model,
                    isDefault: model.id === lastSelectedId
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

        return models;
    }

    /**
     * Update model cache asynchronously (non-blocking)
     */
    protected updateModelCacheAsync(apiKeyHash: string): void {
        // Use Promise to execute in background, do not wait for result
        (async () => {
            try {
                const models = this.providerConfig.models.map(model => this.modelConfigToInfo(model));

                await this.modelInfoCache?.cacheModels(this.providerKey, models, apiKeyHash);
            } catch (err) {
                // Background update failure should not affect extension operation
                Logger.trace(
                    `[${this.providerKey}] Background cache update failed:`,
                    err instanceof Error ? err.message : String(err)
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
                return 'no-key';
            }
            return await ModelInfoCache.computeApiKeyHash(apiKey);
        } catch (err) {
            Logger.warn(
                `[${this.providerKey}] Failed to compute API key hash:`,
                err instanceof Error ? err.message : String(err)
            );
            return 'hash-error';
        }
    }

    async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<vscode.LanguageModelResponsePart>,
        token: CancellationToken
    ): Promise<void> {
        // Save user's selected model and its provider (only if memory is enabled)
        const rememberLastModel = ConfigManager.getRememberLastModel();
        if (rememberLastModel) {
            this.modelInfoCache
                ?.saveLastSelectedModel(this.providerKey, model.id)
                .catch(err => Logger.warn(`[${this.providerKey}] Failed to save model selection:`, err));
        }

        // Find corresponding model configuration
        const modelConfig = this.providerConfig.models.find((m: ModelConfig) => m.id === model.id);
        if (!modelConfig) {
            const errorMessage = `Model not found: ${model.id}`;
            Logger.error(errorMessage);
            throw new Error(errorMessage);
        }

        // Calculate input token count and update status bar
        await this.updateTokenUsageStatusBar(model, messages, modelConfig, options);

        // Determine actual provider based on provider field in model configuration
        // This correctly handles cases where different models under the same provider use different keys
        const effectiveProviderKey = modelConfig.provider || this.providerKey;

        // Ensure API key for corresponding provider exists
        await ApiKeyManager.ensureApiKey(effectiveProviderKey, this.providerConfig.displayName);

        // Select handler based on model's sdkMode
        const sdkMode = modelConfig.sdkMode || 'openai';
        const sdkName = sdkMode === 'anthropic' ? 'Anthropic SDK' : 'OpenAI SDK';
        Logger.info(`${this.providerConfig.displayName} Provider starts processing request (${sdkName}): ${modelConfig.name}`);

        try {
            if (sdkMode === 'anthropic') {
                await this.anthropicHandler.handleRequest(model, modelConfig, messages, options, progress, token);
            } else {
                await this.openaiHandler.handleRequest(model, modelConfig, messages, options, progress, token);
            }
        } catch (error) {
            const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            Logger.error(errorMessage);
            // Throw error directly, let VS Code handle retry
            throw error;
        } finally {
            Logger.info(`${this.providerConfig.displayName}: ${model.name} Request completed`);
        }
    }

    async provideTokenCount(
        model: LanguageModelChatInformation,
        text: string | LanguageModelChatMessage,
        _token: CancellationToken
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
        options?: ProvideLanguageModelChatResponseOptions
    ): Promise<number> {
        return TokenCounter.getInstance().countMessagesTokens(model, messages, modelConfig, options);
    }

    /**
     * Update token usage status bar
     * Calculate input token count and usage percentage, update status bar display
     * For subclass reuse
     */
    protected async updateTokenUsageStatusBar(
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        modelConfig: ModelConfig,
        options?: ProvideLanguageModelChatResponseOptions
    ): Promise<void> {
        try {
            // Calculate usage percentage
            const totalInputTokens = await this.countMessagesTokens(model, messages, modelConfig, options);
            const maxInputTokens = model.maxInputTokens || modelConfig.maxInputTokens;
            const percentage = (totalInputTokens / maxInputTokens) * 100;

            // Update token usage status bar
            const tokenUsageStatusBar = TokenUsageStatusBar.getInstance();
            if (tokenUsageStatusBar) {
                tokenUsageStatusBar.updateTokenUsage({
                    modelId: model.id,
                    modelName: model.name || modelConfig.name,
                    inputTokens: totalInputTokens,
                    maxInputTokens: maxInputTokens,
                    percentage: percentage,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            // Token calculation failure should not block request, only log warning
            Logger.warn(`[${this.providerKey}] Token calculation failed:`, error);
        }
    }
}
