import * as vscode from 'vscode';
import {
    CancellationToken,
    LanguageModelChatInformation,
    LanguageModelChatMessage,
    LanguageModelChatProvider,
    LanguageModelResponsePart,
    Progress,
    ProvideLanguageModelChatResponseOptions
} from 'vscode';
import { GenericModelProvider } from '../common/genericModelProvider';
import { ProviderConfig } from '../../types/sharedTypes';
import { Logger } from '../../utils/logger';
import { ApiKeyManager } from '../../utils/apiKeyManager';
import type { DeepInfraModel, DeepInfraModelsResponse } from './types';
import { ConfigManager } from '../../utils/configManager';

const BASE_URL = 'https://api.deepinfra.com/v1/openai';
const DEFAULT_MAX_OUTPUT_TOKENS = 16000;
const DEFAULT_CONTEXT_LENGTH = 131072;

export class DeepInfraProvider extends GenericModelProvider implements LanguageModelChatProvider {
    private _chatEndpoints: { model: string; modelMaxPromptTokens: number }[] = [];
    private readonly userAgent: string;

    constructor(context: vscode.ExtensionContext, providerKey: string, providerConfig: ProviderConfig, userAgent: string) {
        super(context, providerKey, providerConfig);
        this.userAgent = userAgent;
    }

    async prepareLanguageModelChatInformation(
        options: { silent: boolean },
        _token: CancellationToken
    ): Promise<LanguageModelChatInformation[]> {
        const apiKey = await this.ensureApiKey(options.silent ?? true);
        if (!apiKey) {
            return [];
        }

        const models = await this.fetchModels(apiKey);

        // Only include models that explicitly provide both context_length and max_tokens in metadata
        const infos: LanguageModelChatInformation[] = models
            .filter(m => {
                const meta = m.metadata;
                return (
                    meta !== null &&
                    typeof meta === 'object' &&
                    typeof (meta as any).context_length === 'number' &&
                    typeof (meta as any).max_tokens === 'number'
                );
            })
            .map(m => {
                const meta = m.metadata!;
                const contextLen = (meta.context_length ?? meta.max_tokens) ?? DEFAULT_CONTEXT_LENGTH;
                const maxOutput = DEFAULT_MAX_OUTPUT_TOKENS;
                const maxInput = Math.max(1, contextLen - maxOutput);
                const vision = Array.isArray(meta.tags) && meta.tags.includes('vision');

                // All models exposed by DeepInfra should support tool-calling according to your specification
                return {
                    id: m.id,
                    name: m.id,
                    tooltip: meta.description ?? 'DeepInfra',
                    family: 'deepinfra',
                    version: '1.0.0',
                    maxInputTokens: maxInput,
                    maxOutputTokens: maxOutput,
                    capabilities: {
                        toolCalling: true,
                        imageInput: vision
                    }
                } as LanguageModelChatInformation;
            });

        this._chatEndpoints = infos.map(info => ({ model: info.id, modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens }));

        return infos;
    }

    async provideLanguageModelChatInformation(options: { silent: boolean }, token: CancellationToken): Promise<LanguageModelChatInformation[]> {
        return this.prepareLanguageModelChatInformation({ silent: options.silent ?? false }, token);
    }

    private async fetchModels(apiKey: string): Promise<DeepInfraModel[]> {
        const resp = await fetch(`${BASE_URL}/models`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': this.userAgent }
        });
        if (!resp.ok) {
            let text = '';
            try {
                text = await resp.text();
            } catch (e) {
                Logger.error('[DeepInfra Model Provider] Failed to read response text', e);
            }
            const err = new Error(`Failed to fetch DeepInfra models: ${resp.status} ${resp.statusText}${text ? `\n${text}` : ''}`);
            Logger.error('[DeepInfra Model Provider] Failed to fetch DeepInfra models', err);
            throw err;
        }

        const parsed = (await resp.json()) as DeepInfraModelsResponse;
        return parsed ?? [];
    }

    private async ensureApiKey(silent: boolean): Promise<string | undefined> {
        let apiKey = await ApiKeyManager.getApiKey('deepinfra');
        if (!apiKey && !silent) {
            await ApiKeyManager.promptAndSetApiKey('deepinfra', 'DeepInfra', 'sk-deepinfra-xxxxxxxxxxxxxxxxxxxx');
            apiKey = await ApiKeyManager.getApiKey('deepinfra');
        }
        return apiKey;
    }

    static createAndActivate(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig
    ): { provider: DeepInfraProvider; disposables: vscode.Disposable[] } {
        Logger.trace(`${providerConfig.displayName} provider activated!`);
        const ext = vscode.extensions.getExtension('OEvortex.better-copilot-chat');
        const extVersion = ext?.packageJSON?.version ?? 'unknown';
        const vscodeVersion = vscode.version;
        const ua = `better-copilot-chat/${extVersion} VSCode/${vscodeVersion}`;

        const provider = new DeepInfraProvider(context, providerKey, providerConfig, ua);
        const providerDisposable = vscode.lm.registerLanguageModelChatProvider(`chp.${providerKey}`, provider);

        const setApiKeyCommand = vscode.commands.registerCommand(`chp.${providerKey}.setApiKey`, async () => {
            await ApiKeyManager.promptAndSetApiKey(providerKey, providerConfig.displayName, providerConfig.apiKeyTemplate);
            // Clear cached models and notify VS Code the available models may have changed
            await provider.modelInfoCache?.invalidateCache(providerKey);
            provider._onDidChangeLanguageModelChatInformation.fire(undefined);
        });

        const disposables = [providerDisposable, setApiKeyCommand];
        disposables.forEach(d => context.subscriptions.push(d));
        return { provider, disposables };
    }
}
