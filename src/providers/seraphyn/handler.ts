import * as vscode from 'vscode';
import type { ModelConfig, ProviderConfig } from '../../types/sharedTypes.js';
import { ConfigManager } from '../../utils/configManager.js';
import { Logger } from '../../utils/logger.js';
import { getUserAgent } from '../../utils/userAgent.js';
import { resolveGlobalTokenLimits } from '../../utils/globalContextLengthManager.js';
import { SeraphynSseParser } from './sseParser.js';
import type {
    SeraphynContentPart,
    SeraphynModelResponseItem,
    SeraphynModelsResponse,
    SeraphynToolDefinition
} from './types.js';

type SeraphynRequestContext = {
    providerKey: string;
    displayName: string;
    providerConfig: ProviderConfig;
    modelConfig: ModelConfig;
    messages: readonly vscode.LanguageModelChatMessage[];
    options: vscode.ProvideLanguageModelChatResponseOptions;
    progress: vscode.Progress<vscode.LanguageModelResponsePart2>;
    token: vscode.CancellationToken;
    apiKey: string;
    baseUrl: string;
    customHeaders?: Record<string, string>;
};

type SeraphynToolCallDelta = {
    index?: number;
    id?: string;
    type?: string;
    function?: {
        name?: string;
        arguments?: string;
    };
};

type SeraphynChoice = {
    index?: number;
    delta?: {
        role?: string;
        content?: string | null;
        reasoning?: string;
        reasoning_content?: string;
        tool_calls?: SeraphynToolCallDelta[];
    };
    message?: {
        content?: string | null;
        reasoning?: string;
        reasoning_content?: string;
        tool_calls?: SeraphynToolCallDelta[];
    };
    finish_reason?: string | null;
};

type SeraphynStreamChunk = {
    id?: string;
    model?: string;
    choices?: SeraphynChoice[];
    usage?: unknown;
};

type SeraphynResponseMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | SeraphynContentPart[] | null;
    tool_calls?: Array<{
        index: number;
        id?: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
    tool_call_id?: string;
    reasoning_content?: string;
};

function getPositiveNumber(value: unknown): number | undefined {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0
        ? numericValue
        : undefined;
}

function isValidJsonLiteralStart(char: string): boolean {
    return /[\d\-tfn]/.test(char);
}

export class SeraphynHandler {
    private recoverJsonPayload(input: string): string | null {
        let candidate = input.trim();

        if (!candidate) {
            return null;
        }

        if (
            candidate.startsWith('```') &&
            candidate.endsWith('```') &&
            candidate.length > 6
        ) {
            candidate = candidate.slice(3, -3).trim();
        }

        const firstObjectIndex = candidate.indexOf('{');
        const firstArrayIndex = candidate.indexOf('[');
        const firstJsonIndex =
            firstObjectIndex === -1
                ? firstArrayIndex
                : firstArrayIndex === -1
                  ? firstObjectIndex
                  : Math.min(firstObjectIndex, firstArrayIndex);

        if (firstJsonIndex > 0) {
            candidate = candidate.slice(firstJsonIndex);
        }

        const stack: string[] = [];
        let inString = false;
        let escaped = false;
        let endIndex = -1;

        for (let i = 0; i < candidate.length; i++) {
            const char = candidate[i];

            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (char === '\\') {
                    escaped = true;
                } else if (char === '"') {
                    inString = false;
                }
                continue;
            }

            if (char === '"') {
                inString = true;
                continue;
            }

            if (char === '{' || char === '[') {
                stack.push(char);
                continue;
            }

            if (char === '}' || char === ']') {
                const opener = stack.pop();
                if (
                    !opener ||
                    (opener === '{' && char !== '}') ||
                    (opener === '[' && char !== ']')
                ) {
                    return null;
                }

                if (stack.length === 0) {
                    endIndex = i;
                    break;
                }
            }
        }

        if (endIndex === -1) {
            return null;
        }

        return candidate.slice(0, endIndex + 1).replace(/,\s*([}\]])/g, '$1');
    }

    private quoteBareObjectValues(input: string): string {
        let output = '';
        let index = 0;
        let inString = false;
        let escaped = false;

        while (index < input.length) {
            const char = input[index];

            if (inString) {
                output += char;
                if (escaped) {
                    escaped = false;
                } else if (char === '\\') {
                    escaped = true;
                } else if (char === '"') {
                    inString = false;
                }
                index++;
                continue;
            }

            if (char === '"') {
                inString = true;
                output += char;
                index++;
                continue;
            }

            if (char === ':') {
                output += char;
                index++;

                while (index < input.length && /\s/.test(input[index])) {
                    output += input[index];
                    index++;
                }

                if (index >= input.length) {
                    break;
                }

                const first = input[index];
                if (
                    first === '"' ||
                    first === '{' ||
                    first === '[' ||
                    isValidJsonLiteralStart(first)
                ) {
                    continue;
                }

                let end = index;
                while (
                    end < input.length &&
                    input[end] !== ',' &&
                    input[end] !== '}' &&
                    input[end] !== ']'
                ) {
                    end++;
                }

                const rawValue = input.slice(index, end).trim();
                if (rawValue.length > 0) {
                    output += JSON.stringify(rawValue);
                }

                index = end;
                continue;
            }

            output += char;
            index++;
        }

        return output;
    }

    private escapeInvalidBackslashes(input: string): string {
        return input.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
    }

    private normalizeJsonLikePayload(input: string): string | null {
        const recovered = this.recoverJsonPayload(input);
        if (!recovered) {
            return null;
        }

        let candidate = recovered.trim();
        candidate = candidate.replace(/^\uFEFF/, '');
        candidate = candidate.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
        candidate = candidate.replace(
            /([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:)/g,
            '$1"$2"$3'
        );
        candidate = this.quoteBareObjectValues(candidate);
        candidate = this.escapeInvalidBackslashes(candidate);
        candidate = candidate.replace(/,\s*([}\]])/g, '$1');

        return candidate;
    }

    private parseJsonPayload(payload: string): SeraphynStreamChunk | null {
        const trimmed = payload.trim();
        if (!trimmed || trimmed === '[DONE]') {
            return null;
        }

        try {
            return JSON.parse(trimmed) as SeraphynStreamChunk;
        } catch (firstError) {
            const recovered = this.normalizeJsonLikePayload(trimmed);
            if (recovered) {
                try {
                    return JSON.parse(recovered) as SeraphynStreamChunk;
                } catch (secondError) {
                    Logger.trace(
                        `Seraphyn JSON recovery failed: ${String(secondError)} (original: ${String(firstError)})`
                    );
                }
            }
        }

        return null;
    }

    private getEndpoint(baseUrl: string): string {
        const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
        return normalizedBaseUrl.endsWith('/chat/completions')
            ? normalizedBaseUrl
            : `${normalizedBaseUrl}/chat/completions`;
    }

    private isImageMimeType(mimeType: string): boolean {
        const normalizedMime = mimeType.toLowerCase().trim();
        const supportedTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/bmp',
            'image/svg+xml'
        ];

        return (
            normalizedMime.startsWith('image/') &&
            supportedTypes.includes(normalizedMime)
        );
    }

    private createDataUrl(dataPart: vscode.LanguageModelDataPart): string {
        const base64Data = Buffer.from(dataPart.data).toString('base64');
        return `data:${dataPart.mimeType};base64,${base64Data}`;
    }

    private convertToolResultContent(content: unknown): string {
        if (typeof content === 'string') {
            return content;
        }

        if (Array.isArray(content)) {
            return content
                .map((resultPart) => {
                    if (resultPart instanceof vscode.LanguageModelTextPart) {
                        return resultPart.value;
                    }
                    return JSON.stringify(resultPart);
                })
                .join('\n');
        }

        return JSON.stringify(content);
    }

    private convertToolsToRequest(
        tools: vscode.LanguageModelChatTool[]
    ): SeraphynToolDefinition[] {
        return tools.map((tool) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description || '',
                parameters: (tool.inputSchema as Record<string, unknown>) || {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        }));
    }

    private convertTextContent(
        content: readonly (
            | vscode.LanguageModelTextPart
            | vscode.LanguageModelDataPart
            | vscode.LanguageModelToolCallPart
            | vscode.LanguageModelToolResultPart
            | vscode.LanguageModelThinkingPart
        )[]
    ): string | null {
        const textParts = content
            .filter((part) => part instanceof vscode.LanguageModelTextPart)
            .map((part) => (part as vscode.LanguageModelTextPart).value);

        return textParts.length > 0 ? textParts.join('\n') : null;
    }

    private convertAssistantMessage(
        message: vscode.LanguageModelChatMessage,
        modelConfig: ModelConfig
    ): SeraphynResponseMessage | null {
        const textContent = this.convertTextContent(message.content);
        const toolCalls: NonNullable<SeraphynResponseMessage['tool_calls']> = [];
        let thinkingContent: string | null = null;

        for (const part of message.content) {
            if (part instanceof vscode.LanguageModelToolCallPart) {
                toolCalls.push({
                    index: toolCalls.length,
                    id: part.callId,
                    type: 'function',
                    function: {
                        name: part.name,
                        arguments: JSON.stringify(part.input)
                    }
                });
            } else if (part instanceof vscode.LanguageModelThinkingPart) {
                thinkingContent = Array.isArray(part.value)
                    ? part.value.join('')
                    : part.value;
            }
        }

        if (!textContent && !thinkingContent && toolCalls.length === 0) {
            return null;
        }

        const assistantMessage: SeraphynResponseMessage = {
            role: 'assistant',
            content: textContent || null
        };

        if (thinkingContent && modelConfig.includeThinking === true) {
            assistantMessage.reasoning_content = thinkingContent;
        } else if (modelConfig.includeThinking === true && toolCalls.length > 0) {
            assistantMessage.reasoning_content = '';
        }

        if (toolCalls.length > 0) {
            assistantMessage.tool_calls = toolCalls;
        }

        return assistantMessage;
    }

    private convertUserMessage(
        message: vscode.LanguageModelChatMessage,
        capabilities?: { imageInput?: boolean }
    ): SeraphynResponseMessage[] {
        const results: SeraphynResponseMessage[] = [];
        const textParts = message.content.filter(
            (part) => part instanceof vscode.LanguageModelTextPart
        ) as vscode.LanguageModelTextPart[];

        const imageParts: vscode.LanguageModelDataPart[] = [];
        if (capabilities?.imageInput === true) {
            for (const part of message.content) {
                if (part instanceof vscode.LanguageModelDataPart) {
                    if (part.mimeType === 'cache_control') {
                        continue;
                    }
                    if (this.isImageMimeType(part.mimeType)) {
                        imageParts.push(part);
                    }
                }
            }
        }

        const toolMessages = message.content.filter(
            (part) => part instanceof vscode.LanguageModelToolResultPart
        ) as vscode.LanguageModelToolResultPart[];

        if (textParts.length > 0 || imageParts.length > 0) {
            if (imageParts.length > 0) {
                const contentArray: SeraphynContentPart[] = [];
                if (textParts.length > 0) {
                    contentArray.push({
                        type: 'text',
                        text: textParts.map((part) => part.value).join('\n')
                    });
                }

                for (const imagePart of imageParts) {
                    contentArray.push({
                        type: 'image_url',
                        image_url: {
                            url: this.createDataUrl(imagePart)
                        }
                    });
                }

                results.push({ role: 'user', content: contentArray });
            } else {
                results.push({
                    role: 'user',
                    content: textParts.map((part) => part.value).join('\n')
                });
            }
        }

        for (const part of toolMessages) {
            results.push({
                role: 'tool',
                content: this.convertToolResultContent(part.content),
                tool_call_id: part.callId
            });
        }

        return results;
    }

    private convertSingleMessage(
        message: vscode.LanguageModelChatMessage,
        modelConfig: ModelConfig
    ): SeraphynResponseMessage[] {
        switch (message.role) {
            case vscode.LanguageModelChatMessageRole.System: {
                const text = this.convertTextContent(message.content);
                return text ? [{ role: 'system', content: text }] : [];
            }
            case vscode.LanguageModelChatMessageRole.User:
                return this.convertUserMessage(message, {
                    imageInput: modelConfig.capabilities?.imageInput
                });
            case vscode.LanguageModelChatMessageRole.Assistant: {
                const assistant = this.convertAssistantMessage(
                    message,
                    modelConfig
                );
                return assistant ? [assistant] : [];
            }
            default:
                Logger.warn(`Seraphyn: Unsupported message role ${message.role}`);
                return [];
        }
    }

    private convertMessages(
        messages: readonly vscode.LanguageModelChatMessage[],
        modelConfig: ModelConfig
    ): SeraphynResponseMessage[] {
        const result: SeraphynResponseMessage[] = [];

        for (const message of messages) {
            result.push(...this.convertSingleMessage(message, modelConfig));
        }

        return result;
    }

    private buildRequestBody(
        modelConfig: ModelConfig,
        messages: readonly vscode.LanguageModelChatMessage[],
        options: vscode.ProvideLanguageModelChatResponseOptions
    ): Record<string, unknown> {
        const requestBody: Record<string, unknown> = {
            model: modelConfig.model || modelConfig.id,
            messages: this.convertMessages(messages, modelConfig),
            max_tokens: ConfigManager.getMaxTokensForModel(
                modelConfig.maxOutputTokens
            ),
            stream: true,
            stream_options: {
                include_usage: true
            },
            temperature: ConfigManager.getTemperature(),
            top_p: ConfigManager.getTopP()
        };

        if (
            options.tools &&
            options.tools.length > 0 &&
            modelConfig.capabilities?.toolCalling
        ) {
            requestBody.tools = this.convertToolsToRequest([...options.tools]);
            requestBody.tool_choice = 'auto';
        }

        const extraBody = modelConfig.extraBody;
        if (extraBody && typeof extraBody === 'object') {
            const filtered: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(extraBody)) {
                if (
                    key === 'model' ||
                    key === 'messages' ||
                    key === 'stream' ||
                    key === 'stream_options' ||
                    key === 'tools' ||
                    key === 'tool_choice' ||
                    key === 'temperature' ||
                    key === 'top_p' ||
                    key === 'max_tokens'
                ) {
                    continue;
                }
                filtered[key] = value;
            }

            Object.assign(requestBody, filtered);
        }

        return requestBody;
    }

    private buildHeaders(
        apiKey: string,
        customHeaders?: Record<string, string>
    ): Record<string, string> {
        return {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'User-Agent': getUserAgent(),
            ...(customHeaders || {})
        };
    }

    private tryParseToolArguments(args: string): object {
        const trimmed = args.trim();
        if (!trimmed) {
            return {};
        }

        const attempts = [trimmed, this.normalizeJsonLikePayload(trimmed)]
            .filter((value): value is string => Boolean(value));

        for (const candidate of attempts) {
            try {
                return JSON.parse(candidate) as object;
            } catch {
                // try next candidate
            }
        }

        return { raw: trimmed };
    }

    private emitParsedToolCalls(
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
        toolCallIds: Map<number, string>,
        toolCallNames: Map<number, string>,
        toolCallArguments: Map<number, string>,
        completedToolCalls: Set<number>
    ): void {
        for (const [index, args] of toolCallArguments.entries()) {
            if (completedToolCalls.has(index)) {
                continue;
            }

            completedToolCalls.add(index);

            const toolCallId =
                toolCallIds.get(index) || `tool_call_${index}_${Date.now()}`;
            const toolName = toolCallNames.get(index) || 'unknown_tool';
            const parsedArgs = this.tryParseToolArguments(args || '{}');

            progress.report(
                new vscode.LanguageModelToolCallPart(
                    toolCallId,
                    toolName,
                    parsedArgs
                )
            );
        }
    }

    private processChunkChoice(
        chunk: SeraphynStreamChunk,
        modelName: string,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
        toolCallIds: Map<number, string>,
        toolCallNames: Map<number, string>,
        toolCallArguments: Map<number, string>,
        completedToolCalls: Set<number>,
        thinkingState: { id: string | null; seen: boolean },
        outputThinking: boolean | undefined
    ): void {
        if (!chunk.choices || chunk.choices.length === 0) {
            return;
        }

        for (const choice of chunk.choices) {
            const delta = choice.delta;
            const message = choice.message;

            const toolCalls =
                delta?.tool_calls && delta.tool_calls.length > 0
                    ? delta.tool_calls
                    : message?.tool_calls || [];

            for (const toolCall of toolCalls) {
                if (toolCall.index !== undefined && toolCall.id) {
                    toolCallIds.set(toolCall.index, toolCall.id);
                }

                if (toolCall.index !== undefined && toolCall.function?.name) {
                    toolCallNames.set(toolCall.index, toolCall.function.name);
                }

                if (toolCall.index !== undefined && toolCall.function?.arguments) {
                    const existing = toolCallArguments.get(toolCall.index) || '';
                    toolCallArguments.set(
                        toolCall.index,
                        existing + toolCall.function.arguments
                    );
                }
            }

            const reasoningContent =
                delta?.reasoning_content ??
                delta?.reasoning ??
                message?.reasoning_content ??
                message?.reasoning;

            if (
                outputThinking !== false &&
                typeof reasoningContent === 'string' &&
                reasoningContent.length > 0
            ) {
                if (!thinkingState.id) {
                    thinkingState.id = `seraphyn_thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                }

                thinkingState.seen = true;
                progress.report(
                    new vscode.LanguageModelThinkingPart(
                        reasoningContent,
                        thinkingState.id
                    )
                );
            }

            const content = delta?.content ?? message?.content;
            if (typeof content === 'string' && content.length > 0) {
                progress.report(new vscode.LanguageModelTextPart(content));
            }

            if (choice.finish_reason) {
                this.emitParsedToolCalls(
                    progress,
                    toolCallIds,
                    toolCallNames,
                    toolCallArguments,
                    completedToolCalls
                );
            }
        }

        Logger.trace(
            `Seraphyn processed chunk for ${modelName}: ${chunk.choices.length} choice(s)`
        );
    }

    async sendChatCompletion(context: SeraphynRequestContext): Promise<void> {
        const endpoint = this.getEndpoint(context.baseUrl);
        const requestBody = this.buildRequestBody(
            context.modelConfig,
            context.messages,
            context.options
        );

        const controller = new AbortController();
        const cancellation = context.token.onCancellationRequested(() => {
            controller.abort();
        });

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: this.buildHeaders(
                    context.apiKey,
                    context.customHeaders
                ),
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            if (!response.ok) {
                let errorText = '';
                try {
                    errorText = await response.text();
                } catch {
                    // ignore
                }

                throw new Error(
                    `Seraphyn request failed: ${response.status} ${response.statusText}${errorText ? `\n${errorText}` : ''}`
                );
            }

            if (!response.body) {
                throw new Error('Seraphyn response missing body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const parser = new SeraphynSseParser();

            const toolCallIds = new Map<number, string>();
            const toolCallNames = new Map<number, string>();
            const toolCallArguments = new Map<number, string>();
            const completedToolCalls = new Set<number>();
            const thinkingState = { id: null as string | null, seen: false };
            let lastChunkId = '';
            let lastModel = '';

            const processPayload = (payload: string): void => {
                const chunk = this.parseJsonPayload(payload);
                if (!chunk) {
                    return;
                }

                if (chunk.id) {
                    lastChunkId = chunk.id;
                }

                if (chunk.model) {
                    lastModel = chunk.model;
                }

                this.processChunkChoice(
                    chunk,
                    context.modelConfig.name || lastModel || context.modelConfig.id,
                    context.progress,
                    toolCallIds,
                    toolCallNames,
                    toolCallArguments,
                    completedToolCalls,
                    thinkingState,
                    context.modelConfig.includeThinking === true ||
                        context.modelConfig.outputThinking !== false
                );
            };

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        break;
                    }

                    const chunkText = decoder.decode(value, { stream: true });
                    for (const payload of parser.feed(chunkText)) {
                        if (payload.trim().length > 0) {
                            processPayload(payload);
                        }
                    }
                }

                for (const payload of parser.flush()) {
                    if (payload.trim().length > 0) {
                        processPayload(payload);
                    }
                }
            } finally {
                reader.releaseLock();
            }

            this.emitParsedToolCalls(
                context.progress,
                toolCallIds,
                toolCallNames,
                toolCallArguments,
                completedToolCalls
            );

            if (thinkingState.seen && thinkingState.id) {
                context.progress.report(
                    new vscode.LanguageModelThinkingPart('', thinkingState.id)
                );
            }

            Logger.debug(
                `${context.displayName} stream completed for ${context.modelConfig.id}${lastChunkId ? ` (chunk id: ${lastChunkId})` : ''}`
            );
        } finally {
            cancellation.dispose();
        }
    }

    private extractModelsArray(
        resp: unknown,
        providerConfig: ProviderConfig
    ): unknown[] {
        const arrayPath = providerConfig.modelParser?.arrayPath || 'data';

        if (arrayPath === '') {
            return Array.isArray(resp) ? resp : [];
        }

        const data = resp as Record<string, unknown>;
        let modelsArray = data[arrayPath];

        if (!modelsArray && Array.isArray(resp)) {
            modelsArray = resp;
        }

        if (!modelsArray && data) {
            modelsArray = data.data || data.models || data.results || [];
        }

        return Array.isArray(modelsArray) ? modelsArray : [];
    }

    async fetchModels(
        apiKey: string,
        baseUrl: string,
        providerConfig: ProviderConfig,
        customHeaders?: Record<string, string>
    ): Promise<ModelConfig[]> {
        const endpoint = providerConfig.modelsEndpoint || '/models';
        const modelsUrl = endpoint.startsWith('http')
            ? endpoint
            : `${baseUrl.replace(/\/$/, '')}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

        Logger.debug(`[Seraphyn] Fetching models from: ${modelsUrl}`);

        const headers: Record<string, string> = {
            Accept: 'application/json',
            'User-Agent': getUserAgent(),
            Authorization: `Bearer ${apiKey}`,
            ...(customHeaders || {})
        };

        const response = await fetch(modelsUrl, {
            method: 'GET',
            headers
        });

        if (!response.ok) {
            let errorText = '';
            try {
                errorText = await response.text();
            } catch {
                // ignore
            }

            throw new Error(
                `Failed to fetch Seraphyn models: ${response.status} ${response.statusText}${errorText ? `\n${errorText}` : ''}`
            );
        }

        const parsed = (await response.json()) as
            | SeraphynModelsResponse
            | SeraphynModelResponseItem[];
        const items = this.extractModelsArray(parsed, providerConfig) as SeraphynModelResponseItem[];
        const parser = providerConfig.modelParser;
        const idField = parser?.idField || 'id';
        const nameField = parser?.nameField || parser?.descriptionField || 'id';

        const models: ModelConfig[] = [];
        for (const item of items) {
            const modelId = String(item[idField] || item.id || '').trim();
            if (!modelId) {
                continue;
            }

            const record = item as Record<string, unknown>;
            const contextLength =
                getPositiveNumber(record.context_length) ??
                getPositiveNumber(record.context_window);
            const advertisedMaxOutputTokens =
                getPositiveNumber(record.max_tokens) ??
                getPositiveNumber(record.max_output_tokens);
            const defaultContextLength = contextLength || 344064;
            const defaultMaxOutputTokens = advertisedMaxOutputTokens || 65536;
            const { maxInputTokens, maxOutputTokens } = resolveGlobalTokenLimits(
                modelId,
                defaultContextLength,
                {
                    defaultContextLength,
                    defaultMaxOutputTokens
                }
            );

            models.push({
                id: modelId,
                name: String(item[nameField] || modelId),
                tooltip: `${modelId} via Seraphyn`,
                maxInputTokens,
                maxOutputTokens,
                model: modelId,
                sdkMode: 'openai',
                baseUrl,
                capabilities: {
                    toolCalling: true,
                    imageInput: false
                }
            });
        }

        return models;
    }
}
