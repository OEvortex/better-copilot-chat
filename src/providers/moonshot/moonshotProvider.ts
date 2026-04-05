/*---------------------------------------------------------------------------------------------
 *  Moonshot AI Dedicated Provider
 *  Dynamically fetches models from Moonshot/Kimi API with coding/normal plan support
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    CancellationToken,
    LanguageModelChatInformation,
    LanguageModelChatMessage,
    LanguageModelChatProvider,
    Progress,
    ProvideLanguageModelChatResponseOptions
} from 'vscode';
import * as vscode from 'vscode';
import { ApiKeyManager } from '../../utils/apiKeyManager';
import { ConfigManager } from '../../utils/configManager';
import { Logger } from '../../utils/logger';
import { RateLimiter } from '../../utils/rateLimiter';
import {
    resolveGlobalCapabilities,
    resolveGlobalTokenLimits
} from '../../utils/globalContextLengthManager';
import { getProviderRateLimit } from '../../utils/knownProviders';
import { GenericModelProvider } from '../common/genericModelProvider';
import { MoonshotWizard } from './moonshotWizard';
import type { ProviderConfig } from '../../types/sharedTypes';

const CODING_PLAN_BASE_URL = 'https://api.kimi.com/coding/v1';
const NORMAL_PLAN_BASE_URL = 'https://api.moonshot.ai/v1';

interface MoonshotAPIModel {
    id: string;
    object?: string;
    created?: number;
    owned_by?: string;
    name?: string;
    description?: string;
}

interface MoonshotModelsResponse {
    data?: MoonshotAPIModel[];
    models?: MoonshotAPIModel[];
}

function formatMoonshotModelName(modelId: string): string {
    if (!modelId) {
        return modelId;
    }

    const normalized = modelId.toLowerCase();
    if (normalized === 'kimi-latest') {
        return 'Kimi-Latest';
    }
    if (normalized === 'kimi-k2-thinking') {
        return 'Kimi-K2-Thinking';
    }
    if (normalized === 'kimi-k2-thinking-turbo') {
        return 'Kimi-K2-Thinking-Turbo';
    }
    if (normalized === 'kimi-k2-0905-preview') {
        return 'Kimi-K2-0905-Preview';
    }
    if (normalized === 'kimi-k2-turbo-preview') {
        return 'Kimi-K2-Turbo-Preview';
    }
    if (normalized === 'kimi-k2-0711-preview') {
        return 'Kimi-K2-0711-Preview';
    }

    return modelId
        .split(/[-_/]/)
        .map((part) => {
            if (part.toLowerCase() === 'kimi') {
                return 'Kimi';
            }
            if (/^k\d(?:\.\d+)?$/i.test(part)) {
                return part.toUpperCase();
            }
            if (/^\d+$/.test(part)) {
                return part;
            }
            return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join('-');
}

/**
 * Moonshot AI Dedicated Model Provider Class
 * Dynamically fetches models from Moonshot/Kimi API
 */
export class MoonshotProvider
    extends GenericModelProvider
    implements LanguageModelChatProvider
{
    private readonly configFilePath: string;

    constructor(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig
    ) {
        super(context, providerKey, providerConfig);
        this.configFilePath = path.join(
            context.extensionPath,
            'dist',
            'providers',
            'config',
            'moonshot.json'
        );
    }

    private getBaseUrl(): string {
        return ConfigManager.getMoonshotPlan() === 'coding'
            ? CODING_PLAN_BASE_URL
            : NORMAL_PLAN_BASE_URL;
    }

    private async fetchModels(apiKey: string): Promise<MoonshotAPIModel[]> {
        const baseUrl = this.getBaseUrl();
        const url = `${baseUrl}/models`;
        Logger.info(`[Moonshot] Fetching models from ${url}`);

        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`
            }
        });

        if (!resp.ok) {
            let text = '';
            try {
                text = await resp.text();
            } catch {
                // ignore
            }
            const err = new Error(
                `Failed to fetch Moonshot models: ${resp.status} ${resp.statusText}${text ? `\n${text}` : ''}`
            );
            Logger.error('[Moonshot] Failed to fetch Moonshot models', err);
            throw err;
        }

        const parsed = (await resp.json()) as
            | MoonshotModelsResponse
            | MoonshotAPIModel[];
        if (Array.isArray(parsed)) {
            return parsed;
        }
        return parsed.data ?? parsed.models ?? [];
    }

    private getModelMetadata(modelId: string): {
        name: string;
        maxInputTokens: number;
        maxOutputTokens: number;
        toolCalling: boolean;
        imageInput: boolean;
    } {
        const displayName = formatMoonshotModelName(modelId);
        const contextLength = modelId.toLowerCase().includes('kimi')
            ? 256 * 1024
            : 128 * 1024;
        const tokens = resolveGlobalTokenLimits(modelId, contextLength, {
            defaultContextLength: contextLength,
            defaultMaxOutputTokens: 32 * 1024
        });
        const capabilities = resolveGlobalCapabilities(modelId);

        return {
            name: displayName,
            maxInputTokens: tokens.maxInputTokens,
            maxOutputTokens: tokens.maxOutputTokens,
            toolCalling: capabilities.toolCalling,
            imageInput: capabilities.imageInput
        };
    }

    private async getApiKeyFromManager(): Promise<string | null> {
        try {
            const key = await ApiKeyManager.getApiKey(this.providerKey);
            return key === undefined ? null : key;
        } catch (err) {
            Logger.warn('[Moonshot] Failed to get API key:', err);
            return null;
        }
    }

    override async provideLanguageModelChatInformation(
        options: { silent: boolean },
        token: CancellationToken
    ): Promise<LanguageModelChatInformation[]> {
        const apiKey = await this.getApiKeyFromManager();
        if (!apiKey) {
            return super.provideLanguageModelChatInformation(options, token);
        }

        try {
            const models = await this.fetchModels(apiKey);
            if (models.length > 0) {
                this.updateMoonshotConfigFile(models);
            }

            const infos = models.map((model) => {
                const modelMeta = this.getModelMetadata(model.id);
                return {
                    id: model.id,
                    name: modelMeta.name,
                    tooltip: `${model.id} by MoonshotAI`,
                    family: 'MoonshotAI',
                    version: '1.0.0',
                    maxInputTokens: modelMeta.maxInputTokens,
                    maxOutputTokens: modelMeta.maxOutputTokens,
                    capabilities: {
                        toolCalling: modelMeta.toolCalling,
                        imageInput: modelMeta.imageInput
                    }
                } as LanguageModelChatInformation;
            });

            this._chatEndpoints = infos.map((info) => ({
                model: info.id,
                modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens
            }));

            return infos;
        } catch (err) {
            Logger.warn(
                '[Moonshot] Failed to fetch models from API, falling back to config:',
                err instanceof Error ? err.message : String(err)
            );
            return super.provideLanguageModelChatInformation(options, token);
        }
    }

    private updateMoonshotConfigFile(models: MoonshotAPIModel[]): void {
        (async () => {
            try {
                if (!fs.existsSync(this.configFilePath)) {
                    Logger.debug(
                        `[Moonshot] Config file not found at ${this.configFilePath}, skipping auto-update`
                    );
                    return;
                }

                const modelConfigs = models.map((model) => {
                    const meta = this.getModelMetadata(model.id);
                    return {
                        id: model.id,
                        name: meta.name,
                        tooltip: `${model.id} by MoonshotAI`,
                        maxInputTokens: meta.maxInputTokens,
                        maxOutputTokens: meta.maxOutputTokens,
                        model: model.id,
                        sdkMode: 'openai' as const,
                        baseUrl: this.getBaseUrl(),
                        capabilities: {
                            toolCalling: meta.toolCalling,
                            imageInput: meta.imageInput
                        }
                    };
                });

                let existingConfig: Record<string, unknown>;
                try {
                    const configContent = fs.readFileSync(
                        this.configFilePath,
                        'utf8'
                    );
                    existingConfig = JSON.parse(configContent) as Record<
                        string,
                        unknown
                    >;
                } catch {
                    existingConfig = {
                        displayName: 'MoonshotAI',
                        baseUrl: this.getBaseUrl(),
                        apiKeyTemplate:
                            'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                        models: []
                    };
                }

                const updatedConfig = {
                    displayName:
                        (existingConfig.displayName as string) || 'MoonshotAI',
                    baseUrl:
                        (existingConfig.baseUrl as string) || this.getBaseUrl(),
                    apiKeyTemplate:
                        (existingConfig.apiKeyTemplate as string) ||
                        'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    models: modelConfigs
                };

                fs.writeFileSync(
                    this.configFilePath,
                    JSON.stringify(updatedConfig, null, 4),
                    'utf8'
                );
                Logger.info(
                    `[Moonshot] Auto-updated config file with ${modelConfigs.length} models`
                );
            } catch (err) {
                Logger.warn(
                    `[Moonshot] Background config update failed: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        })();
    }

    static createAndActivate(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig
    ): { provider: MoonshotProvider; disposables: vscode.Disposable[] } {
        Logger.trace(
            `${providerConfig.displayName} dedicated model extension activated!`
        );
        const provider = new MoonshotProvider(
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
                await MoonshotWizard.startWizard(
                    providerConfig.displayName,
                    providerConfig.apiKeyTemplate
                );
                await provider.modelInfoCache?.invalidateCache(providerKey);
                provider._onDidChangeLanguageModelChatInformation.fire();
            }
        );

        const configWizardCommand = vscode.commands.registerCommand(
            `chp.${providerKey}.configWizard`,
            async () => {
                Logger.info(
                    `Starting ${providerConfig.displayName} configuration wizard`
                );
                await MoonshotWizard.startWizard(
                    providerConfig.displayName,
                    providerConfig.apiKeyTemplate
                );
            }
        );

        const disposables = [
            providerDisposable,
            setApiKeyCommand,
            configWizardCommand
        ];
        for (const disposable of disposables) {
            context.subscriptions.push(disposable);
        }
        return { provider, disposables };
    }

    override async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<vscode.LanguageModelResponsePart>,
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

        await rateLimiter.executeWithRetry(async () => {
            await this.executeMoonshotRequest(
                model,
                messages,
                options,
                progress,
                token
            );
        }, this.providerConfig.displayName);
    }

    private async executeMoonshotRequest(
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<vscode.LanguageModelResponsePart>,
        token: CancellationToken
    ): Promise<void> {
        const modelConfig = this.providerConfig.models.find(
            (m) => m.id === model.id
        );
        if (modelConfig) {
            modelConfig.sdkMode = 'openai';
            modelConfig.baseUrl = this.getBaseUrl();
        }

        await super.provideLanguageModelChatResponse(
            model,
            messages,
            options,
            progress,
            token
        );
    }
}
