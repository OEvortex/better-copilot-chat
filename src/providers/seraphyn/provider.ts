/*---------------------------------------------------------------------------------------------
 *  Seraphyn Provider
 *  Dedicated fetch-based provider with custom SSE parser and handler
 *--------------------------------------------------------------------------------------------*/

import type {
    CancellationToken,
    LanguageModelChatInformation,
    LanguageModelChatMessage,
    LanguageModelChatProvider,
    Progress,
    ProvideLanguageModelChatResponseOptions
} from 'vscode';
import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { AccountManager } from '../../accounts/accountManager';
import type {
    AccountCredentials,
    ApiKeyCredentials
} from '../../accounts/types';
import type { ModelConfig, ProviderConfig } from '../../types/sharedTypes';
import { ApiKeyManager, Logger, RateLimiter, RetryManager } from '../../utils';
import { ProviderWizard } from '../../utils/providerWizard';
import { getProviderRateLimit } from '../../utils/knownProviders';
import {
    DEFAULT_CONTEXT_LENGTH,
    DEFAULT_MAX_OUTPUT_TOKENS,
    resolveGlobalCapabilities,
    resolveGlobalTokenLimits
} from '../../utils/globalContextLengthManager';
import { TokenCounter } from '../../utils/tokenCounter';
import { SeraphynHandler } from './handler';

function hashValue(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export class SeraphynProvider implements LanguageModelChatProvider {
    private readonly accountManager = AccountManager.getInstance();
    private readonly handler = new SeraphynHandler();
    private readonly _onDidChangeLanguageModelChatInformation =
        new vscode.EventEmitter<void>();
    readonly onDidChangeLanguageModelChatInformation =
        this._onDidChangeLanguageModelChatInformation.event;

    private cachedModels: ModelConfig[] = [];
    private cachedSignature = '';
    private cachedAt = 0;
    private accountListener?: vscode.Disposable;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly providerKey: string,
        private readonly cachedProviderConfig: ProviderConfig
    ) {
        this.accountListener = this.accountManager.onAccountChange((event) => {
            if (
                event.provider === this.providerKey ||
                event.provider === 'all'
            ) {
                this.invalidateCache();
                this._onDidChangeLanguageModelChatInformation.fire();
            }
        });
    }

    private invalidateCache(): void {
        this.cachedSignature = '';
        this.cachedAt = 0;
        this.cachedModels = [];
    }

    dispose(): void {
        this.accountListener?.dispose();
        this._onDidChangeLanguageModelChatInformation.dispose();
    }

    get providerConfig(): ProviderConfig {
        return this.cachedProviderConfig;
    }

    private modelConfigToInfo(
        model: ModelConfig
    ): LanguageModelChatInformation {
        const contextLength = model.maxInputTokens + model.maxOutputTokens;
        const { maxInputTokens, maxOutputTokens } = resolveGlobalTokenLimits(
            model.id,
            contextLength,
            {
                defaultContextLength: contextLength || DEFAULT_CONTEXT_LENGTH,
                defaultMaxOutputTokens:
                    model.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS
            }
        );

        const capabilities = resolveGlobalCapabilities(model.id, {
            detectedToolCalling: model.capabilities?.toolCalling,
            detectedImageInput: model.capabilities?.imageInput
        });

        return {
            id: model.id,
            name: model.name,
            detail: this.providerConfig.displayName,
            tooltip:
                model.tooltip ||
                `${model.name} via ${this.providerConfig.displayName}`,
            family:
                model.family || this.providerConfig.family || this.providerKey,
            maxInputTokens,
            maxOutputTokens,
            version: model.model || model.id,
            capabilities
        };
    }

    private async resolveCredentials(): Promise<{
        apiKey?: string;
        baseUrl: string;
        customHeaders?: Record<string, string>;
        accountId?: string;
    }> {
        const activeAccount = this.accountManager.getActiveAccount(
            this.providerKey
        );

        if (activeAccount) {
            const credentials = (await this.accountManager.getCredentials(
                activeAccount.id
            )) as AccountCredentials | undefined;

            if (credentials && 'apiKey' in credentials) {
                const apiKeyCredentials = credentials as ApiKeyCredentials;
                return {
                    apiKey: apiKeyCredentials.apiKey,
                    baseUrl:
                        apiKeyCredentials.endpoint ||
                        this.providerConfig.baseUrl,
                    customHeaders: apiKeyCredentials.customHeaders,
                    accountId: activeAccount.id
                };
            }
        }

        const apiKey = await ApiKeyManager.getApiKey(this.providerKey);
        return {
            apiKey,
            baseUrl: this.providerConfig.baseUrl
        };
    }

    private mergeModelConfigs(
        staticModels: ModelConfig[],
        fetchedModels: ModelConfig[]
    ): ModelConfig[] {
        if (fetchedModels.length > 0) {
            return fetchedModels;
        }

        const seen = new Set<string>();
        const merged: ModelConfig[] = [];

        for (const model of fetchedModels) {
            if (!seen.has(model.id)) {
                seen.add(model.id);
                merged.push(model);
            }
        }

        for (const model of staticModels) {
            if (!seen.has(model.id)) {
                seen.add(model.id);
                merged.push(model);
            }
        }

        return merged;
    }

    private async getModelConfigs(): Promise<ModelConfig[]> {
        const staticModels = [...(this.providerConfig.models || [])];
        const credentials = await this.resolveCredentials();

        if (!credentials.apiKey) {
            return staticModels;
        }

        if (!this.providerConfig.fetchModels) {
            return staticModels;
        }

        const parserCooldownMinutes =
            this.providerConfig.modelParser?.cooldownMinutes ?? 10;
        const cooldownMs = parserCooldownMinutes * 60 * 1000;
        const signature = hashValue(
            `${credentials.baseUrl}|${credentials.apiKey}|${credentials.accountId || 'secret'}`
        );

        if (
            this.cachedSignature === signature &&
            this.cachedModels.length > 0 &&
            Date.now() - this.cachedAt < cooldownMs
        ) {
            return this.cachedModels;
        }

        try {
            const fetched = await this.handler.fetchModels(
                credentials.apiKey,
                credentials.baseUrl,
                this.providerConfig,
                credentials.customHeaders
            );

            const merged = this.mergeModelConfigs(staticModels, fetched);
            this.cachedModels = merged;
            this.cachedSignature = signature;
            this.cachedAt = Date.now();

            return merged;
        } catch (error) {
            Logger.warn(
                `[Seraphyn] Failed to fetch remote models, using static fallback: ${error instanceof Error ? error.message : String(error)}`
            );
            return staticModels;
        }
    }

    static createAndActivate(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig
    ): { provider: SeraphynProvider; disposables: vscode.Disposable[] } {
        Logger.trace(`${providerConfig.displayName} provider activated!`);

        const provider = new SeraphynProvider(
            context,
            providerKey,
            providerConfig
        );

        const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
            `chp.${providerKey}`,
            provider
        );

        const setApiKeyCommand = vscode.commands.registerCommand(
            `chp.${providerKey}.setApiKey`,
            async () => {
                await ProviderWizard.startWizard({
                    providerKey,
                    displayName: providerConfig.displayName,
                    apiKeyTemplate: providerConfig.apiKeyTemplate,
                    supportsApiKey: true
                });
                provider.invalidateCache();
                provider._onDidChangeLanguageModelChatInformation.fire();
            }
        );

        const refreshModelsCommand = vscode.commands.registerCommand(
            `chp.${providerKey}.refreshModels`,
            async () => {
                provider.invalidateCache();
                provider._onDidChangeLanguageModelChatInformation.fire();
            }
        );

        const configWizardCommand = vscode.commands.registerCommand(
            `chp.${providerKey}.configWizard`,
            async () => {
                await ProviderWizard.startWizard({
                    providerKey,
                    displayName: providerConfig.displayName,
                    apiKeyTemplate: providerConfig.apiKeyTemplate,
                    supportsApiKey: true
                });
            }
        );

        const disposables = [
            providerDisposable,
            setApiKeyCommand,
            refreshModelsCommand,
            configWizardCommand
        ];

        for (const disposable of disposables) {
            context.subscriptions.push(disposable);
        }

        return { provider, disposables };
    }

    async provideLanguageModelChatInformation(
        _options: { silent: boolean },
        _token: CancellationToken
    ): Promise<LanguageModelChatInformation[]> {
        const modelConfigs = await this.getModelConfigs();
        if (modelConfigs.length === 0) {
            return [];
        }

        const infos = modelConfigs.map((model) =>
            this.modelConfigToInfo(model)
        );
        this.cachedModels = modelConfigs;
        return infos;
    }

    private async resolveApiKeyOrPrompt(): Promise<{
        apiKey: string;
        baseUrl: string;
        customHeaders?: Record<string, string>;
    }> {
        const resolved = await this.resolveCredentials();
        if (resolved.apiKey) {
            return {
                apiKey: resolved.apiKey,
                baseUrl: resolved.baseUrl,
                customHeaders: resolved.customHeaders
            };
        }

        await ApiKeyManager.ensureApiKey(
            this.providerKey,
            this.providerConfig.displayName
        );

        const prompted = await this.resolveCredentials();
        if (!prompted.apiKey) {
            throw new Error(
                `Missing ${this.providerConfig.displayName} API key`
            );
        }

        return {
            apiKey: prompted.apiKey,
            baseUrl: prompted.baseUrl,
            customHeaders: prompted.customHeaders
        };
    }

    async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<vscode.LanguageModelResponsePart2>,
        token: CancellationToken
    ): Promise<void> {
        const rateLimit = getProviderRateLimit(this.providerKey, 'openai');
        const requestsPerSecond = rateLimit?.requestsPerSecond ?? 1;
        const windowMs = rateLimit?.windowMs ?? 1000;

        const rateLimiter = RateLimiter.getInstance(
            `${this.providerKey}:openai:${requestsPerSecond}:${windowMs}`,
            requestsPerSecond,
            windowMs
        );

        // Execute with automatic rate limiting and retry on 429 errors
        await rateLimiter.executeWithRetry(async () => {
            await this.executeSeraphynRequest(
                model,
                messages,
                options,
                progress,
                token
            );
        }, this.providerConfig.displayName);
    }

    /**
     * Execute the actual Seraphyn API request (extracted for retry support)
     */
    private async executeSeraphynRequest(
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<vscode.LanguageModelResponsePart2>,
        token: CancellationToken
    ): Promise<void> {
        const modelConfig = this.cachedModels.find(
            (candidate) => candidate.id === model.id
        ) ||
            this.providerConfig.models?.find(
                (candidate) => candidate.id === model.id
            ) || {
                id: model.id,
                name: model.name,
                tooltip: model.tooltip || model.name,
                maxInputTokens: model.maxInputTokens,
                maxOutputTokens: model.maxOutputTokens,
                model: model.id,
                sdkMode: 'openai' as const,
                capabilities: {
                    toolCalling: true,
                    imageInput: !!model.capabilities?.imageInput
                }
            };

        const { apiKey, baseUrl, customHeaders } =
            await this.resolveApiKeyOrPrompt();

        Logger.info(
            `${model.name} sending Seraphyn request${baseUrl ? ` to ${baseUrl}` : ''}`
        );

        await this.handler.sendChatCompletion({
            providerKey: this.providerKey,
            displayName: this.providerConfig.displayName,
            providerConfig: this.providerConfig,
            modelConfig,
            messages,
            options,
            progress,
            token,
            apiKey,
            baseUrl,
            customHeaders
        });
    }

    async provideTokenCount(
        model: LanguageModelChatInformation,
        text: string | LanguageModelChatMessage,
        _token: CancellationToken
    ): Promise<number> {
        return TokenCounter.getInstance().countTokens(model, text);
    }
}
