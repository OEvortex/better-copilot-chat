import OpenAI from 'openai';
import * as vscode from 'vscode';
import type { ModelConfig } from '../../types/sharedTypes';
import { ApiKeyManager } from '../../utils/apiKeyManager';
import { ConfigManager } from '../../utils/configManager';
import {
    getProviderRateLimit,
    recordProviderRateLimitFromHeaders
} from '../../utils/knownProviders';
import { Logger } from '../../utils/logger';
import { RateLimiter } from '../../utils/rateLimiter';
import { RetryManager } from '../../utils/retryManager';
import { TokenCounter } from '../../utils/tokenCounter';
import { TokenTelemetryTracker } from '../../utils/tokenTelemetryTracker';
import { getUserAgent } from '../../utils/userAgent';
import { OpenAIHandler } from './openaiHandler';

export class ResponsesHandler {
    constructor(
        private provider: string,
        private displayName: string,
        private baseURL?: string
    ) {}

    dispose(): void {}

    private async createOpenAIClient(
        modelConfig?: ModelConfig
    ): Promise<OpenAI> {
        const providerKey = modelConfig?.provider || this.provider;
        let currentApiKey = modelConfig?.apiKey;

        if (!currentApiKey) {
            currentApiKey = await ApiKeyManager.getApiKey(providerKey);
        }

        return new OpenAI({
            apiKey: currentApiKey,
            baseURL: modelConfig?.baseUrl || this.baseURL,
            defaultHeaders: {
                'User-Agent': getUserAgent(),
                ...ApiKeyManager.processCustomHeader(
                    modelConfig?.customHeader,
                    currentApiKey || ''
                )
            },
            maxRetries: 2,
            timeout: 60000
        });
    }

    async handleRequest(
        model: vscode.LanguageModelChatInformation,
        modelConfig: ModelConfig,
        messages: readonly vscode.LanguageModelChatMessage[],
        options: vscode.ProvideLanguageModelChatResponseOptions,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
        token: vscode.CancellationToken,
        _accountId?: string
    ): Promise<void> {
        const rateLimit = getProviderRateLimit(
            this.provider,
            modelConfig.sdkMode
        );
        const requestsPerSecond = rateLimit?.requestsPerSecond ?? 1;
        const windowMs = rateLimit?.windowMs ?? 1000;

        const rateLimiter = RateLimiter.getInstance(
            `${this.provider}:${modelConfig.sdkMode || 'openai'}:${requestsPerSecond}:${windowMs}`,
            requestsPerSecond,
            windowMs
        );

        // Execute with automatic rate limiting and retry on 429 errors
        await rateLimiter.executeWithRetry(async () => {
            await this.executeResponsesRequest(
                model,
                modelConfig,
                messages,
                options,
                progress,
                token,
                _accountId
            );
        }, this.displayName);
    }

    /**
     * Execute the actual Responses API request (extracted for retry support)
     */
    private async executeResponsesRequest(
        model: vscode.LanguageModelChatInformation,
        modelConfig: ModelConfig,
        messages: readonly vscode.LanguageModelChatMessage[],
        options: vscode.ProvideLanguageModelChatResponseOptions,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
        token: vscode.CancellationToken,
        _accountId?: string
    ): Promise<void> {
        Logger.debug(
            `${model.name} starting to process ${this.displayName} Responses request`
        );

        const tokenTracker = TokenTelemetryTracker.getInstance();
        const requestModel = modelConfig.model || model.id;
        let hasReceivedContent = false;
        let totalCompletionTokens = 0;
        let totalPromptTokens = 0;
        const activeThinkingIds = new Set<string>();
        const emittedToolCallIds = new Set<string>();

        let activityInterval: NodeJS.Timeout | undefined;
        try {
            const client = await this.createOpenAIClient(modelConfig);
            const createParams: OpenAI.Responses.ResponseCreateParamsStreaming =
                {
                    model: requestModel,
                    input: this.convertMessagesToResponses(
                        messages,
                        model.capabilities || undefined,
                        modelConfig
                    ),
                    max_output_tokens: ConfigManager.getMaxTokensForModel(
                        model.maxOutputTokens
                    ),
                    temperature: ConfigManager.getTemperature(),
                    top_p: ConfigManager.getTopP(),
                    stream: true
                };

            if (
                options.tools &&
                options.tools.length > 0 &&
                model.capabilities?.toolCalling
            ) {
                createParams.tools = this.convertToolsToResponses([
                    ...options.tools
                ]);
                createParams.tool_choice = 'auto';
            }

            if (modelConfig.extraBody) {
                Object.assign(
                    createParams,
                    ResponsesHandler.filterExtraBodyParams(
                        modelConfig.extraBody
                    )
                );
            }

            const abortController = new AbortController();
            const cancellationListener = token.onCancellationRequested(() =>
                abortController.abort()
            );

            activityInterval = setInterval(() => {
                if (!token.isCancellationRequested) {
                    progress.report(new vscode.LanguageModelTextPart(''));
                }
            }, 300);

            let streamError: Error | undefined;
            let finalResponse: OpenAI.Responses.Response | undefined;

            try {
                const { data: stream, response } = await client.responses
                    .create(createParams, {
                        signal: abortController.signal
                    })
                    .withResponse();

                recordProviderRateLimitFromHeaders(
                    this.provider,
                    response.headers,
                    modelConfig.sdkMode
                );

                stream
                    .on('response.output_text.delta', (event) => {
                        if (!event.delta) {
                            return;
                        }

                        progress.report(
                            new vscode.LanguageModelTextPart(event.delta)
                        );
                        hasReceivedContent = true;
                    })
                    .on(
                        'event',
                        (event: OpenAI.Responses.ResponseStreamEvent) => {
                            switch (event.type) {
                                case 'response.reasoning_summary_text.delta':
                                case 'response.reasoning_text.delta': {
                                    if (
                                        modelConfig.outputThinking === false ||
                                        !event.delta
                                    ) {
                                        return;
                                    }

                                    const thinkingId =
                                        event.item_id || 'responses_reasoning';
                                    activeThinkingIds.add(thinkingId);
                                    progress.report(
                                        new vscode.LanguageModelThinkingPart(
                                            event.delta,
                                            thinkingId
                                        )
                                    );
                                    break;
                                }
                                case 'response.reasoning_summary_text.done':
                                case 'response.reasoning_text.done': {
                                    const thinkingId =
                                        event.item_id || 'responses_reasoning';
                                    if (activeThinkingIds.has(thinkingId)) {
                                        progress.report(
                                            new vscode.LanguageModelThinkingPart(
                                                '',
                                                thinkingId
                                            )
                                        );
                                        activeThinkingIds.delete(thinkingId);
                                    }
                                    break;
                                }
                                case 'response.output_item.done': {
                                    if (event.item.type !== 'function_call') {
                                        return;
                                    }

                                    const toolCallId =
                                        event.item.call_id || event.item.id;
                                    if (
                                        !toolCallId ||
                                        emittedToolCallIds.has(toolCallId)
                                    ) {
                                        return;
                                    }

                                    emittedToolCallIds.add(toolCallId);
                                    progress.report(
                                        new vscode.LanguageModelToolCallPart(
                                            toolCallId,
                                            event.item.name,
                                            ResponsesHandler.parseToolArguments(
                                                event.item.arguments
                                            )
                                        )
                                    );
                                    hasReceivedContent = true;
                                    break;
                                }
                            }
                        }
                    )
                    .on('error', (error) => {
                        streamError =
                            error instanceof Error
                                ? error
                                : new Error(String(error));
                    });

                await stream.done();
                finalResponse = await stream.finalResponse();
            } finally {
                cancellationListener.dispose();
                if (activityInterval) {
                    clearInterval(activityInterval);
                    activityInterval = undefined;
                }
            }

            if (streamError) {
                throw streamError;
            }

            if (finalResponse) {
                totalPromptTokens = finalResponse.usage?.input_tokens || 0;
                totalCompletionTokens = finalResponse.usage?.output_tokens || 0;

                for (const thinkingId of activeThinkingIds) {
                    progress.report(
                        new vscode.LanguageModelThinkingPart('', thinkingId)
                    );
                }

                if (!hasReceivedContent) {
                    const finalText =
                        ResponsesHandler.extractOutputText(finalResponse);
                    if (finalText) {
                        progress.report(
                            new vscode.LanguageModelTextPart(finalText)
                        );
                        hasReceivedContent = true;
                    }
                }
            }

            if (!hasReceivedContent) {
                progress.report(
                    new vscode.LanguageModelTextPart(
                        'No response received from the model.'
                    )
                );
            }

            let promptTokens = totalPromptTokens;
            let completionTokens = totalCompletionTokens;
            let totalTokens = totalPromptTokens + totalCompletionTokens;
            let estimatedPromptTokens = false;

            if (promptTokens === 0) {
                try {
                    promptTokens =
                        await TokenCounter.getInstance().countMessagesTokens(
                            model,
                            [...messages],
                            { sdkMode: modelConfig.sdkMode },
                            options
                        );
                    completionTokens = totalCompletionTokens || 0;
                    totalTokens = promptTokens + completionTokens;
                    estimatedPromptTokens = true;
                } catch (countError) {
                    Logger.trace(
                        `${model.name} failed to estimate prompt tokens: ${String(countError)}`
                    );
                }
            }

            tokenTracker.recordSuccess({
                modelId: model.id,
                modelName: model.name,
                providerId: this.provider,
                promptTokens,
                completionTokens,
                totalTokens,
                maxInputTokens: model.maxInputTokens,
                maxOutputTokens: model.maxOutputTokens,
                estimatedPromptTokens
            });
        } catch (error) {
            if (activityInterval) {
                clearInterval(activityInterval);
            }

            const message =
                error instanceof Error ? error.message : String(error);
            Logger.error(`${model.name} Responses request failed: ${message}`);

            if (error instanceof vscode.CancellationError) {
                tokenTracker.recordCancelled({
                    modelId: model.id,
                    providerId: this.provider
                });
                throw error;
            }

            tokenTracker.recordError({
                modelId: model.id,
                providerId: this.provider,
                errorMessage: this.isQuotaError(error)
                    ? 'quota_exceeded'
                    : message
            });

            throw error;
        }
    }

    private convertMessagesToResponses(
        messages: readonly vscode.LanguageModelChatMessage[],
        capabilities?: vscode.LanguageModelChatCapabilities,
        modelConfig?: ModelConfig
    ): OpenAI.Responses.ResponseInputItem[] {
        const items: OpenAI.Responses.ResponseInputItem[] = [];
        for (const message of messages) {
            items.push(
                ...this.convertSingleMessageToResponses(
                    message,
                    capabilities,
                    modelConfig
                )
            );
        }
        return ResponsesHandler.balanceToolHistory(items);
    }

    private convertSingleMessageToResponses(
        message: vscode.LanguageModelChatMessage,
        capabilities?: vscode.LanguageModelChatCapabilities,
        modelConfig?: ModelConfig
    ): OpenAI.Responses.ResponseInputItem[] {
        const hasToolResult = message.content.some(
            (part) => part instanceof vscode.LanguageModelToolResultPart
        );

        if (
            message.role === vscode.LanguageModelChatMessageRole.System ||
            message.role === vscode.LanguageModelChatMessageRole.User
        ) {
            if (hasToolResult) {
                return this.convertToolResultMessages(message);
            }

            const role =
                message.role === vscode.LanguageModelChatMessageRole.System
                    ? 'system'
                    : 'user';
            const content = this.buildMessageContent(message, capabilities);
            if (!content) {
                return [];
            }

            return [
                {
                    type: 'message',
                    role,
                    content
                }
            ];
        }

        if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
            const items: OpenAI.Responses.ResponseInputItem[] = [];
            const content = this.buildAssistantContent(message, modelConfig);
            if (content) {
                items.push({
                    type: 'message',
                    role: 'assistant',
                    content
                });
            }

            for (const part of message.content) {
                if (part instanceof vscode.LanguageModelToolCallPart) {
                    items.push({
                        type: 'function_call',
                        call_id: part.callId,
                        name: part.name,
                        arguments: JSON.stringify(part.input)
                    });
                }
            }

            return items;
        }

        return [];
    }

    private convertToolResultMessages(
        message: vscode.LanguageModelChatMessage
    ): OpenAI.Responses.ResponseInputItem[] {
        const items: OpenAI.Responses.ResponseInputItem[] = [];
        for (const part of message.content) {
            if (part instanceof vscode.LanguageModelToolResultPart) {
                items.push({
                    type: 'function_call_output',
                    call_id: part.callId,
                    output: this.convertToolResultContent(part)
                });
            }
        }
        return items;
    }

    private buildAssistantContent(
        message: vscode.LanguageModelChatMessage,
        modelConfig?: ModelConfig
    ): string | undefined {
        const textParts: string[] = [];
        for (const part of message.content) {
            if (part instanceof vscode.LanguageModelTextPart) {
                textParts.push(part.value);
            } else if (
                modelConfig?.includeThinking &&
                part instanceof vscode.LanguageModelThinkingPart
            ) {
                textParts.push(
                    Array.isArray(part.value) ? part.value.join('') : part.value
                );
            }
        }

        const text = textParts.join('\n\n').trim();
        return text || undefined;
    }

    private buildMessageContent(
        message: vscode.LanguageModelChatMessage,
        capabilities?: vscode.LanguageModelChatCapabilities
    ): string | OpenAI.Responses.ResponseInputMessageContentList | undefined {
        const parts: OpenAI.Responses.ResponseInputMessageContentList = [];
        const textParts: string[] = [];
        let hasImages = false;

        for (const part of message.content) {
            if (part instanceof vscode.LanguageModelTextPart) {
                textParts.push(part.value);
                continue;
            }

            if (
                part instanceof vscode.LanguageModelDataPart &&
                capabilities?.imageInput !== false &&
                ResponsesHandler.isImageMimeType(part.mimeType)
            ) {
                if (textParts.length > 0) {
                    parts.push({
                        type: 'input_text',
                        text: textParts.join('\n\n')
                    });
                    textParts.length = 0;
                }

                hasImages = true;
                parts.push({
                    type: 'input_image',
                    detail: 'auto',
                    image_url: ResponsesHandler.createDataUrl(
                        part.data,
                        part.mimeType
                    )
                });
            }
        }

        if (!hasImages) {
            const text = textParts.join('\n\n').trim();
            return text || undefined;
        }

        if (textParts.length > 0) {
            parts.push({
                type: 'input_text',
                text: textParts.join('\n\n')
            });
        }

        return parts.length > 0 ? parts : undefined;
    }

    private convertToolsToResponses(
        tools: vscode.LanguageModelChatTool[]
    ): OpenAI.Responses.Tool[] {
        return tools.map((tool) => ({
            type: 'function',
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema as Record<string, unknown>,
            strict: false
        }));
    }

    private convertToolResultContent(
        part: vscode.LanguageModelToolResultPart
    ): string {
        return part.content
            .map((item) => {
                if (item instanceof vscode.LanguageModelTextPart) {
                    return item.value;
                }

                if (item instanceof vscode.LanguageModelPromptTsxPart) {
                    return item.value;
                }

                return JSON.stringify(item);
            })
            .join('\n');
    }

    private isQuotaError(error: unknown): boolean {
        const message = error instanceof Error ? error.message : String(error);
        return (
            message.includes('insufficient_quota') ||
            message.includes('quota') ||
            message.includes('rate limit') ||
            message.includes('429')
        );
    }

    private static filterExtraBodyParams(
        extraBody: Record<string, unknown>
    ): Record<string, unknown> {
        const filtered = OpenAIHandler.filterExtraBodyParams(extraBody);
        delete filtered.messages;
        delete filtered.max_tokens;
        delete filtered.stream_options;
        return filtered;
    }

    private static parseToolArguments(argumentsText?: string): object {
        if (!argumentsText) {
            return {};
        }

        try {
            return JSON.parse(argumentsText);
        } catch {
            return {};
        }
    }

    private static extractOutputText(
        response: OpenAI.Responses.Response
    ): string {
        const textParts: string[] = [];
        for (const item of response.output || []) {
            if (item.type !== 'message') {
                continue;
            }

            for (const content of item.content || []) {
                if (content.type === 'output_text' && content.text) {
                    textParts.push(content.text);
                }
            }
        }

        return textParts.join('');
    }

    private static balanceToolHistory(
        items: OpenAI.Responses.ResponseInputItem[]
    ): OpenAI.Responses.ResponseInputItem[] {
        const balanced = [...items];
        const outputIds = new Set<string>();

        for (const item of items) {
            if (item.type === 'function_call_output') {
                outputIds.add(item.call_id);
            }
        }

        for (const item of items) {
            if (
                item.type === 'function_call' &&
                item.call_id &&
                !outputIds.has(item.call_id)
            ) {
                balanced.push({
                    type: 'function_call_output',
                    call_id: item.call_id,
                    output: 'Tool execution failed or did not return a result.'
                });
            }
        }

        return balanced;
    }

    private static isImageMimeType(mimeType?: string): boolean {
        return !!mimeType && mimeType.startsWith('image/');
    }

    private static createDataUrl(data: Uint8Array, mimeType: string): string {
        return `data:${mimeType};base64,${Buffer.from(data).toString('base64')}`;
    }
}
