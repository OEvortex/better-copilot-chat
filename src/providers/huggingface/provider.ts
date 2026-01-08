import * as vscode from 'vscode';
import { CancellationToken, LanguageModelChatInformation, LanguageModelChatMessage, LanguageModelChatProvider, LanguageModelResponsePart, Progress, ProvideLanguageModelChatResponseOptions } from 'vscode';
import type { HFModelItem, HFModelsResponse } from './types';
import { convertTools, convertMessages, validateRequest } from './utils';
import { GenericModelProvider } from '../common/genericModelProvider';
import { Logger } from '../../utils/logger';
import { ApiKeyManager } from '../../utils/apiKeyManager';
import { ProviderConfig } from '../../types/sharedTypes';

const BASE_URL = 'https://router.huggingface.co/v1';
const DEFAULT_MAX_OUTPUT_TOKENS = 16000;
const DEFAULT_CONTEXT_LENGTH = 128000;

export class HuggingfaceProvider extends GenericModelProvider implements LanguageModelChatProvider {
    private _chatEndpoints: { model: string; modelMaxPromptTokens: number }[] = [];
    private readonly userAgent: string;

    constructor(context: vscode.ExtensionContext, providerKey: string, providerConfig: ProviderConfig, userAgent: string) {
        super(context, providerKey, providerConfig);
        this.userAgent = userAgent;
    }

    private estimateMessagesTokens(msgs: readonly vscode.LanguageModelChatMessage[]): number {
        let total = 0;
        for (const m of msgs) {
            for (const part of m.content) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    total += Math.ceil(part.value.length / 4);
                }
            }
        }
        return total;
    }

    private estimateToolTokens(tools: { type: string; function: { name: string; description?: string; parameters?: object } }[] | undefined): number {
        if (!tools || tools.length === 0) { return 0; }
        try {
            const json = JSON.stringify(tools);
            return Math.ceil(json.length / 4);
        } catch {
            return 0;
        }
    }

    async prepareLanguageModelChatInformation(options: { silent: boolean }, _token: CancellationToken): Promise<LanguageModelChatInformation[]> {
        const apiKey = await this.ensureApiKey(options.silent ?? true);
        if (!apiKey) {
            return [];
        }

        const { models } = await this.fetchModels(apiKey);

        const infos: LanguageModelChatInformation[] = models.flatMap((m) => {
            const providers = m?.providers ?? [];
            const modalities = m.architecture?.input_modalities ?? [];
            const vision = Array.isArray(modalities) && modalities.includes('image');

            const toolProviders = providers.filter((p) => p.supports_tools === true);
            const entries: LanguageModelChatInformation[] = [];

            if (toolProviders.length > 0) {
                const contextLengths = toolProviders
                    .map((p) => (typeof p?.context_length === 'number' && p.context_length > 0 ? p.context_length : undefined))
                    .filter((len): len is number => typeof len === 'number');
                const aggregateContextLen = contextLengths.length > 0 ? Math.min(...contextLengths) : DEFAULT_CONTEXT_LENGTH;
                const maxOutput = DEFAULT_MAX_OUTPUT_TOKENS;
                const maxInput = Math.max(1, aggregateContextLen - maxOutput);
                const aggregateCapabilities = {
                    toolCalling: true,
                    imageInput: vision
                };
                entries.push({
                    id: `${m.id}:cheapest`,
                    name: `${m.id} (cheapest)`,
                    tooltip: 'Hugging Face via the cheapest provider',
                    family: 'huggingface',
                    version: '1.0.0',
                    maxInputTokens: maxInput,
                    maxOutputTokens: maxOutput,
                    capabilities: aggregateCapabilities
                } as LanguageModelChatInformation);
                entries.push({
                    id: `${m.id}:fastest`,
                    name: `${m.id} (fastest)`,
                    tooltip: 'Hugging Face via the fastest provider',
                    family: 'huggingface',
                    version: '1.0.0',
                    maxInputTokens: maxInput,
                    maxOutputTokens: maxOutput,
                    capabilities: aggregateCapabilities
                } as LanguageModelChatInformation);
            }

            for (const p of toolProviders) {
                const contextLen = p?.context_length ?? DEFAULT_CONTEXT_LENGTH;
                const maxOutput = DEFAULT_MAX_OUTPUT_TOKENS;
                const maxInput = Math.max(1, contextLen - maxOutput);
                entries.push({
                    id: `${m.id}:${p.provider}`,
                    name: `${m.id} via ${p.provider}`,
                    tooltip: `Hugging Face via ${p.provider}`,
                    family: 'huggingface',
                    version: '1.0.0',
                    maxInputTokens: maxInput,
                    maxOutputTokens: maxOutput,
                    capabilities: {
                        toolCalling: true,
                        imageInput: vision
                    }
                } as LanguageModelChatInformation);
            }

            if (toolProviders.length === 0 && providers.length > 0) {
                const base = providers[0];
                const contextLen = base?.context_length ?? DEFAULT_CONTEXT_LENGTH;
                const maxOutput = DEFAULT_MAX_OUTPUT_TOKENS;
                const maxInput = Math.max(1, contextLen - maxOutput);
                entries.push({
                    id: m.id,
                    name: m.id,
                    tooltip: 'Hugging Face',
                    family: 'huggingface',
                    version: '1.0.0',
                    maxInputTokens: maxInput,
                    maxOutputTokens: maxOutput,
                    capabilities: {
                        toolCalling: false,
                        imageInput: vision
                    }
                } as LanguageModelChatInformation);
            }

            return entries;
        });

        this._chatEndpoints = infos.map((info) => ({ model: info.id, modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens }));

        return infos;
    }

    async provideLanguageModelChatInformation(options: { silent: boolean }, _token: CancellationToken): Promise<LanguageModelChatInformation[]> {
        return this.prepareLanguageModelChatInformation({ silent: options.silent ?? false }, _token);
    }

    private async fetchModels(apiKey: string): Promise<{ models: HFModelItem[] }> {
        const modelsList = (async () => {
            const resp = await fetch(`${BASE_URL}/models`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': this.userAgent }
            });
            if (!resp.ok) {
                let text = '';
                try {
                    text = await resp.text();
                } catch (error) {
                    Logger.error('[Hugging Face Model Provider] Failed to read response text', error);
                }
                const err = new Error(`Failed to fetch Hugging Face models: ${resp.status} ${resp.statusText}${text ? `\n${text}` : ''}`);
                Logger.error('[Hugging Face Model Provider] Failed to fetch Hugging Face models', err);
                throw err;
            }
            const parsed = (await resp.json()) as HFModelsResponse;
            return parsed.data ?? [];
        })();

        try {
            const models = await modelsList;
            return { models };
        } catch (err) {
            Logger.error('[Hugging Face Model Provider] Failed to fetch Hugging Face models', err);
            throw err;
        }
    }

    override async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: readonly LanguageModelChatMessage[],
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<LanguageModelResponsePart>,
        token: CancellationToken
    ): Promise<void> {
        let requestBody: Record<string, unknown> | undefined;
        const trackingProgress: Progress<LanguageModelResponsePart> = { report: (part: LanguageModelResponsePart) => { try { progress.report(part); } catch (e) { Logger.error('[Hugging Face Model Provider] Progress.report failed', { modelId: model.id, error: e instanceof Error ? { name: e.name, message: e.message } : String(e) }); } } };
        try {
            const apiKey = await this.ensureApiKey(true);
            if (!apiKey) {
                throw new Error('Hugging Face API key not found');
            }

            const openaiMessages = convertMessages(messages as readonly vscode.LanguageModelChatRequestMessage[]);

            validateRequest(messages as readonly vscode.LanguageModelChatRequestMessage[]);

            const toolConfig = convertTools(options);

            if (options.tools && options.tools.length > 128) {
                throw new Error('Cannot have more than 128 tools per request.');
            }

            const inputTokenCount = this.estimateMessagesTokens(messages as readonly vscode.LanguageModelChatMessage[]);
            const toolTokenCount = this.estimateToolTokens(toolConfig.tools as { type: string; function: { name: string; description?: string; parameters?: object } }[] | undefined);
            const tokenLimit = Math.max(1, model.maxInputTokens);
            if (inputTokenCount + toolTokenCount > tokenLimit) {
                Logger.error('[Hugging Face Model Provider] Message exceeds token limit', { total: inputTokenCount + toolTokenCount, tokenLimit });
                throw new Error('Message exceeds token limit.');
            }

            requestBody = {
                model: model.id,
                messages: openaiMessages,
                stream: true,
                max_tokens: Math.min(options.modelOptions?.max_tokens || 4096, model.maxOutputTokens),
                temperature: options.modelOptions?.temperature ?? 0.7
            };

            if (options.modelOptions) {
                const mo = options.modelOptions as Record<string, unknown>;
                if (typeof mo.stop === 'string' || Array.isArray(mo.stop)) {
                    (requestBody as Record<string, unknown>).stop = mo.stop;
                }
                if (typeof mo.frequency_penalty === 'number') {
                    (requestBody as Record<string, unknown>).frequency_penalty = mo.frequency_penalty;
                }
                if (typeof mo.presence_penalty === 'number') {
                    (requestBody as Record<string, unknown>).presence_penalty = mo.presence_penalty;
                }
            }

            if (toolConfig.tools) {
                (requestBody as Record<string, unknown>).tools = toolConfig.tools;
            }
            if (toolConfig.tool_choice) {
                (requestBody as Record<string, unknown>).tool_choice = toolConfig.tool_choice;
            }
            const response = await fetch(`${BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': this.userAgent
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                Logger.error('[Hugging Face Model Provider] HF API error response', errorText);
                throw new Error(`Hugging Face API error: ${response.status} ${response.statusText}${errorText ? `\n${errorText}` : ''}`);
            }

            if (!response.body) {
                throw new Error('No response body from Hugging Face API');
            }

            // stream processing - reuse a small parser similar to upstream implementation
            await this.processStreamingResponse(response.body, trackingProgress, token);
        } catch (err) {
            Logger.error('[Hugging Face Model Provider] Chat request failed', { modelId: model.id, messageCount: messages.length, error: err instanceof Error ? { name: err.name, message: err.message } : String(err) });
            throw err;
        }
    }

    async provideTokenCount(model: LanguageModelChatInformation, text: string | LanguageModelChatMessage, _token: CancellationToken): Promise<number> {
        if (typeof text === 'string') {
            return Math.ceil(text.length / 4);
        } else {
            let totalTokens = 0;
            for (const part of text.content) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    totalTokens += Math.ceil(part.value.length / 4);
                }
            }
            return totalTokens;
        }
    }

    private async ensureApiKey(silent: boolean): Promise<string | undefined> {
        let apiKey = await ApiKeyManager.getApiKey('huggingface');
        if (!apiKey && !silent) {
            await ApiKeyManager.promptAndSetApiKey('huggingface', 'Hugging Face', 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
            apiKey = await ApiKeyManager.getApiKey('huggingface');
        }
        return apiKey;
    }

    private async processStreamingResponse(responseBody: ReadableStream<Uint8Array>, progress: vscode.Progress<vscode.LanguageModelResponsePart>, token: vscode.CancellationToken): Promise<void> {
        const reader = responseBody.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (!token.isCancellationRequested) {
                const { done, value } = await reader.read();
                if (done) { break; }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) {
                        continue;
                    }
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        continue;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        await this.processDelta(parsed, progress);
                    } catch {
                        // ignore malformed chunks
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    private async processDelta(delta: Record<string, unknown>, progress: vscode.Progress<vscode.LanguageModelResponsePart>): Promise<boolean> {
        const choice = (delta.choices as Record<string, unknown>[] | undefined)?.[0];
        if (!choice) { return false; }

        const deltaObj = choice.delta as Record<string, unknown> | undefined;
        if (!deltaObj) { return false; }

        const content = deltaObj.content ?? deltaObj; // sometimes content nested
        if (typeof content === 'string') {
            const TextCtor = (vscode as unknown as Record<string, unknown>)['LanguageModelTextPart'] as unknown as (new (val: string) => unknown) | undefined;
            if (TextCtor) {
                try {
                    const textPartInstance = new (TextCtor as new (val: string) => unknown)(content);
                    progress.report(textPartInstance as unknown as LanguageModelResponsePart);
                    return true;
                } catch (e) {
                    Logger.warn('[Hugging Face Model Provider] Failed to construct LanguageModelTextPart', e instanceof Error ? e.message : String(e));
                }
            }
            // fallback to reporting as plain text part
            progress.report({ type: 'message', text: content } as unknown as LanguageModelResponsePart);
            return true;
        }

        return false;
    }

    static createAndActivate(context: vscode.ExtensionContext, providerKey: string, providerConfig: ProviderConfig): { provider: HuggingfaceProvider; disposables: vscode.Disposable[] } {
        Logger.trace(`${providerConfig.displayName} provider activated!`);
        const ext = vscode.extensions.getExtension('OEvortex.better-copilot-chat');
        const extVersion = ext?.packageJSON?.version ?? 'unknown';
        const vscodeVersion = vscode.version;
        const ua = `better-copilot-chat/${extVersion} VSCode/${vscodeVersion}`;

        const provider = new HuggingfaceProvider(context, providerKey, providerConfig, ua);
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
