import * as vscode from 'vscode';
import OpenAI from 'openai';
import {
    LanguageModelChatProvider,
    LanguageModelChatInformation,
    LanguageModelChatMessage,
    ProvideLanguageModelChatResponseOptions,
    Progress,
    CancellationToken,
    LanguageModelResponsePart
} from 'vscode';
import { ProviderConfig } from '../../types/sharedTypes';
import { Logger, ApiKeyManager, ConfigManager } from '../../utils';
import { GenericModelProvider } from '../common/genericModelProvider';
import { StatusBarManager } from '../../status';
import { DeepInfraModelsResponse, DeepInfraModelItem } from './types';

/**
 * DeepInfra dedicated model provider class
 * Uses OpenAI-compatible endpoints: https://api.deepinfra.com/v1/openai
 */
export class DeepInfraProvider extends GenericModelProvider implements LanguageModelChatProvider {
    private _chatEndpoints: { model: string; modelMaxPromptTokens: number }[] = [];
    private readonly userAgent: string;
    private clientCache = new Map<string, { client: OpenAI; lastUsed: number }>();

    constructor(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig,
        userAgent: string
    ) {
        super(context, providerKey, providerConfig);
        this.userAgent = userAgent;
    }

    private async ensureApiKey(silent: boolean): Promise<string | undefined> {
        let apiKey = await ApiKeyManager.getApiKey(this.providerKey);
        if (!apiKey && !silent) {
            await ApiKeyManager.promptAndSetApiKey(
                this.providerKey,
                this.providerConfig.displayName,
                this.providerConfig.apiKeyTemplate
            );
            apiKey = await ApiKeyManager.getApiKey(this.providerKey);
        }
        return apiKey;
    }

    private async fetchModels(apiKey: string): Promise<DeepInfraModelItem[]> {
        try {
            const resp = await fetch('https://api.deepinfra.com/v1/openai/models', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'User-Agent': this.userAgent
                }
            });

            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`Failed to fetch DeepInfra models: ${resp.status} ${resp.statusText}\n${text}`);
            }

            const parsed = (await resp.json()) as DeepInfraModelsResponse;
            return parsed.data || [];
        } catch (err) {
            Logger.error('[DeepInfra Model Provider] Failed to fetch models', err);
            throw err;
        }
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

        // Filter models: must have metadata, max_tokens, and context_length
        const filteredModels = models.filter(m => 
            m.metadata && 
            typeof m.metadata.max_tokens === 'number' && 
            typeof m.metadata.context_length === 'number'
        );

        const infos: LanguageModelChatInformation[] = filteredModels.map(m => {
            const metadata = m.metadata!;
            const vision = metadata.tags?.includes('vision') ?? false;
            
            // All models support tools as per user request
            const capabilities = {
                toolCalling: true,
                imageInput: vision
            };

            const maxOutput = 16000;
            const maxInput = metadata.max_tokens || 128000;

            return {
                id: m.id,
                name: m.id.split('/').pop() || m.id,
                tooltip: metadata.description || `DeepInfra model: ${m.id}`,
                family: 'deepinfra',
                version: '1.0.0',
                maxInputTokens: maxInput,
                maxOutputTokens: maxOutput,
                capabilities: capabilities
            } as LanguageModelChatInformation;
        });

        this._chatEndpoints = infos.map(info => ({
            model: info.id,
            modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens
        }));

        return infos;
    }

    override async provideLanguageModelChatInformation(
        options: { silent: boolean },
        _token: CancellationToken
    ): Promise<LanguageModelChatInformation[]> {
        try {
            const apiKeyHash = await this.getApiKeyHash();
            let cachedModels = await this.modelInfoCache?.getCachedModels(this.providerKey, apiKeyHash);

            if (cachedModels) {
                // Background update
                this.prepareLanguageModelChatInformation(options, _token).then(models => {
                    this.modelInfoCache?.cacheModels(this.providerKey, models, apiKeyHash);
                }).catch(() => {});
                return cachedModels;
            }

            const models = await this.prepareLanguageModelChatInformation(options, _token);
            if (models.length > 0) {
                await this.modelInfoCache?.cacheModels(this.providerKey, models, apiKeyHash);
            }
            return models;
        } catch (error) {
            Logger.error('[DeepInfra] Failed to provide model info', error);
            return [];
        }
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

        // Register set ApiKey command
        const setApiKeyCommand = vscode.commands.registerCommand(`chp.${providerKey}.setApiKey`, async () => {
            try {
                const apiKey = await vscode.window.showInputBox({
                    prompt: `Enter API key for ${providerConfig.displayName}`,
                    placeHolder: providerConfig.apiKeyTemplate || 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    ignoreFocusOut: true
                });
                if (apiKey !== undefined) {
                    await ApiKeyManager.setApiKey(providerKey, apiKey || '');
                    vscode.window.showInformationMessage(`${providerConfig.displayName} API key saved.`);
                    // Invalidate cache and trigger update
                    await provider.modelInfoCache?.invalidateCache(providerKey);
                    provider._onDidChangeLanguageModelChatInformation.fire();
                }
            } catch (err) {
                Logger.error(`Failed to set API key for ${providerKey}:`, err);
                vscode.window.showErrorMessage(`Failed to set API key: ${err instanceof Error ? err.message : String(err)}`);
            }
        });

        const disposables: vscode.Disposable[] = [providerDisposable, setApiKeyCommand];
        disposables.forEach(d => context.subscriptions.push(d));
        return { provider, disposables };
    }

    private async createOpenAIClient(apiKey: string): Promise<OpenAI> {
        const baseURL = 'https://api.deepinfra.com/v1/openai';
        const cacheKey = `deepinfra:${baseURL}`;
        const cached = this.clientCache.get(cacheKey);
        if (cached) {
            cached.lastUsed = Date.now();
            return cached.client;
        }

        const client = new OpenAI({
            apiKey: apiKey,
            baseURL: baseURL,
            defaultHeaders: {
                'User-Agent': this.userAgent
            },
            maxRetries: 2,
            timeout: 60000
        });

        this.clientCache.set(cacheKey, { client, lastUsed: Date.now() });
        return client;
    }

    override async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: LanguageModelChatMessage[],
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<LanguageModelResponsePart>,
        token: CancellationToken
    ): Promise<void> {
        try {
            Logger.info(`[DeepInfra] Starting request for model: ${model.name}`);
            
            const apiKey = await this.ensureApiKey(true);
            if (!apiKey) {
                throw new Error('DeepInfra API key not found');
            }

            const client = await this.createOpenAIClient(apiKey);
            const modelConfig = this.providerConfig.models.find(m => m.id === model.id);

            const openaiMessages = this.openaiHandler.convertMessagesToOpenAI(
                messages,
                model.capabilities || undefined,
                modelConfig
            );

            const createParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
                model: model.id,
                messages: openaiMessages,
                stream: true,
                stream_options: { include_usage: true },
                max_tokens: Math.min(options.modelOptions?.max_tokens || 4096, model.maxOutputTokens),
                temperature: options.modelOptions?.temperature ?? ConfigManager.getTemperature(),
                top_p: ConfigManager.getTopP()
            };

            if (options.tools && options.tools.length > 0 && model.capabilities?.toolCalling) {
                createParams.tools = this.openaiHandler.convertToolsToOpenAI([...options.tools]);
                createParams.tool_choice = 'auto';
            }

            const abortController = new AbortController();
            token.onCancellationRequested(() => abortController.abort());

            const stream = client.chat.completions.stream(createParams, { signal: abortController.signal });

            let currentThinkingId: string | null = null;
            let thinkingContentBuffer = '';

            stream.on('chunk', (chunk: OpenAI.Chat.ChatCompletionChunk) => {
                if (token.isCancellationRequested) { return; }

                if (chunk.choices && chunk.choices.length > 0) {
                    for (const choice of chunk.choices) {
                        const delta = choice.delta as { reasoning_content?: string } | undefined;
                        if (delta?.reasoning_content) {
                            if (!currentThinkingId) {
                                currentThinkingId = `di_thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                            }
                            thinkingContentBuffer += delta.reasoning_content;
                            progress.report(new vscode.LanguageModelThinkingPart(thinkingContentBuffer, currentThinkingId) as any);
                            thinkingContentBuffer = '';
                        }
                    }
                }
            });

            stream.on('content', (delta: string) => {
                if (token.isCancellationRequested) { return; }
                if (delta) {
                    if (currentThinkingId) {
                        progress.report(new vscode.LanguageModelThinkingPart('', currentThinkingId) as any);
                        currentThinkingId = null;
                    }
                    progress.report(new vscode.LanguageModelTextPart(delta));
                }
            });

            await stream.finalChatCompletion();

            if (currentThinkingId) {
                progress.report(new vscode.LanguageModelThinkingPart('', currentThinkingId) as any);
            }

        } catch (error) {
            Logger.error(`[DeepInfra] Request failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        } finally {
            StatusBarManager.delayedUpdate('deepinfra', 100);
        }
    }
}
