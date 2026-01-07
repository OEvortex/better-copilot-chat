/*---------------------------------------------------------------------------------------------
 *  OpenAI SDK Handler
 *  Implements streaming chat completion using OpenAI SDK
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import OpenAI from 'openai';
import { Logger } from '../../utils/logger';
import { VersionManager } from '../../utils/versionManager';
import { ConfigManager } from '../../utils/configManager';
import { ApiKeyManager } from '../../utils/apiKeyManager';
import { ModelConfig } from '../../types/sharedTypes';
import { ExtendedDelta, ExtendedChoice, ExtendedAssistantMessageParam } from './openaiTypes';

/**
 * OpenAI SDK Handler
 * Implements streaming chat completion using OpenAI SDK, supports tool calling
 */
export class OpenAIHandler {
    // SDK event deduplication tracker (request level)
    private currentRequestProcessedEvents = new Set<string>();
    // Cache client instance to avoid creating new one for each request
    private clientCache: Map<string, { client: OpenAI; lastUsed: number }> = new Map();
    private readonly CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    private cleanupInterval?: NodeJS.Timeout;

    constructor(
        private provider: string,
        private displayName: string,
        private baseURL?: string
    ) {
        // provider, displayName and baseURL are passed by the caller
        // Cleanup expired clients every minute
        this.cleanupInterval = setInterval(() => this.cleanupExpiredClients(), 60000);
    }

    /**
     * Cleanup expired clients to avoid memory leak
     */
    private cleanupExpiredClients(): void {
        const now = Date.now();
        for (const [key, value] of this.clientCache.entries()) {
            if (now - value.lastUsed > this.CLIENT_CACHE_TTL) {
                Logger.debug(`[${this.displayName}] Cleaning up expired OpenAI client: ${key}`);
                this.clientCache.delete(key);
            }
        }
    }

    /**
     * Dispose handler and cleanup resources
     */
    public dispose(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.clientCache.clear();
        this.currentRequestProcessedEvents.clear();
        Logger.debug(`[${this.displayName}] OpenAI Handler disposed`);
    }

    /**
     * Create new OpenAI client with caching
     */
    private async createOpenAIClient(modelConfig?: ModelConfig): Promise<OpenAI> {
        // Priority: model.provider -> this.provider
        const providerKey = modelConfig?.provider || this.provider;

        // Check if API key is provided in modelConfig (e.g. for OAuth providers)
        let currentApiKey = modelConfig?.apiKey;

        if (!currentApiKey) {
            currentApiKey = await ApiKeyManager.getApiKey(providerKey);
            if (!currentApiKey) {
                throw new Error(`Missing ${this.displayName} API key`);
            }
        }

        // Use model-specific baseURL first, if none use provider-level baseURL
        let baseURL = modelConfig?.baseUrl || this.baseURL;

        // Override baseURL settings for Zhipu AI international site
        if (providerKey === 'zhipu') {
            const endpoint = ConfigManager.getZhipuEndpoint();
            if (baseURL && endpoint === 'api.z.ai') {
                baseURL = baseURL.replace('open.bigmodel.cn', 'api.z.ai');
            }
        }

        // Build default headers, including custom headers
        const defaultHeaders: Record<string, string> = {
            'User-Agent': VersionManager.getUserAgent('OpenAI')
        };

        // Process model-level customHeader
        const processedCustomHeader = ApiKeyManager.processCustomHeader(modelConfig?.customHeader, currentApiKey);
        if (Object.keys(processedCustomHeader).length > 0) {
            Object.assign(defaultHeaders, processedCustomHeader);
            Logger.debug(`${this.displayName} apply custom headers: ${JSON.stringify(modelConfig!.customHeader)}`);
        }

        // Create cache key based on config
        const cacheKey = `${providerKey}:${baseURL}:${JSON.stringify(defaultHeaders)}`;

        // Check cache
        const cached = this.clientCache.get(cacheKey);
        if (cached) {
            cached.lastUsed = Date.now();
            Logger.debug(`[${this.displayName}] Reusing cached OpenAI client`);
            return cached.client;
        }

        const client = new OpenAI({
            apiKey: currentApiKey,
            baseURL: baseURL,
            defaultHeaders: defaultHeaders,
            fetch: this.createCustomFetch(), // Use custom fetch to solve SSE format issues
            maxRetries: 2, // Reduce retries to avoid lag
            timeout: 60000 // 60s timeout
        });

        // Cache client
        this.clientCache.set(cacheKey, { client, lastUsed: Date.now() });
        Logger.debug(`${this.displayName} OpenAI SDK client created, using baseURL: ${baseURL}`);
        return client;
    }

    /**
     * Create custom fetch function to handle non-standard SSE format
     * Fix issue where some models output "data:" without a space
     */
    private createCustomFetch(): typeof fetch {
        return async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
            // Call original fetch
            const response = await fetch(url, init);
            // All calls of current plugin are stream requests, preprocess all responses directly
            // preprocessSSEResponse is now asynchronous and may throw error for upper layer capture
            return await this.preprocessSSEResponse(response);
        };
    }

    /**
     * Preprocess SSE response, fix non-standard format
     * Fix issue where some models output "data:" without a space
     */
    private async preprocessSSEResponse(response: Response): Promise<Response> {
        const contentType = response.headers.get('Content-Type');
        // If application/json is returned, read body and throw Error directly, letting upper layer chat receive exception
        if (contentType && contentType.includes('application/json')) {
            const text = await response.text();
            // Throw Error directly (upper layer will capture and display), do not swallow or construct fake Response
            throw new Error(text || `HTTP ${response.status} ${response.statusText}`);
        }
        // Only process SSE responses, other types return original response
        if (!contentType || !contentType.includes('text/event-stream') || !response.body) {
            return response;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const transformedStream = new ReadableStream({
            async start(controller) {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            controller.close();
                            break;
                        }
                        // Decode chunk
                        let chunk = decoder.decode(value, { stream: true });
                        // Fix SSE format: ensure there is a space after "data:"
                        // Handle "data:{json}" -> "data: {json}"
                        chunk = chunk.replace(/^data:([^\s])/gm, 'data: $1');
                        // Logger.trace(`Received SSE chunk: ${chunk.length} characters, chunk=${chunk}`);
                        // Determine and process all data: {json} objects in chunk, compatible with some models using old format to put content in choice.message
                        try {
                            const dataRegex = /^data: (.*)$/gm;
                            let transformed = chunk;
                            const matches = Array.from(chunk.matchAll(dataRegex));
                            for (const m of matches) {
                                const jsonStr = m[1];
                                // Skip SSE end marker [DONE]
                                if (jsonStr === '[DONE]') {
                                    continue;
                                }
                                try {
                                    const obj = JSON.parse(jsonStr);
                                    let objModified = false;

                                    // Convert old format: if choice contains message but no delta, convert message to delta
                                    if (obj && Array.isArray(obj.choices)) {
                                        for (const ch of obj.choices) {
                                            if (ch && ch.message && (!ch.delta || Object.keys(ch.delta).length === 0)) {
                                                ch.delta = ch.message;
                                                delete ch.message;
                                                objModified = true;
                                            }
                                        }
                                    }

                                    // Process choices, ensure each choice has a correct structure
                                    if (obj.choices && obj.choices.length > 0) {
                                        // Process choices in reverse order to avoid index changes affecting subsequent processing
                                        for (
                                            let choiceIndex = obj.choices.length - 1;
                                            choiceIndex >= 0;
                                            choiceIndex--
                                        ) {
                                            const choice = obj.choices[choiceIndex];
                                            if (choice?.finish_reason) {
                                                if (!choice.delta || Object.keys(choice.delta).length === 0) {
                                                    Logger.trace(
                                                        `preprocessSSEResponse has only finish_reason (choice ${choiceIndex}), adding empty content to delta`
                                                    );
                                                    choice.delta = { role: 'assistant', content: '' };
                                                    objModified = true;
                                                }
                                                if (!choice.delta.role) {
                                                    choice.delta.role = 'assistant';
                                                    objModified = true;
                                                }
                                            }
                                            if (choice?.delta && Object.keys(choice.delta).length === 0) {
                                                if (choice?.finish_reason) {
                                                    continue;
                                                } // Avoid removing valid empty delta
                                                Logger.trace(
                                                    `preprocessSSEResponse removing invalid delta (choice ${choiceIndex})`
                                                );
                                                // Directly remove invalid choice from array
                                                obj.choices.splice(choiceIndex, 1);
                                                objModified = true;
                                            }
                                        }

                                        // Fix choice index, some models return incorrect index, causing OpenAI SDK parsing failure
                                        if (obj.choices.length == 1) {
                                            // Set choice index to 0
                                            for (const choice of obj.choices) {
                                                // Some models return index as null or value not 0
                                                if (choice.index == null || choice.index !== 0) {
                                                    choice.index = 0;
                                                    objModified = true;
                                                }
                                            }
                                        }
                                    }

                                    // Only re-serialize when object is modified
                                    if (objModified) {
                                        const newJson = JSON.stringify(obj);
                                        transformed = transformed.replace(m[0], `data: ${newJson}`);
                                    }
                                } catch {
                                    // Single data JSON parsing failed, does not affect entire chunk
                                    continue;
                                }
                            }
                            chunk = transformed;
                        } catch {
                            // Parsing failure does not affect normal flow
                        }

                        // Logger.trace(`Preprocessed SSE chunk: ${chunk.length} characters, chunk=${chunk}`);
                        // Re-encode and pass valid content
                        controller.enqueue(encoder.encode(chunk));
                    }
                } catch (error) {
                    controller.error(error);
                } finally {
                    reader.releaseLock();
                }
            }
        });

        return new Response(transformedStream, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
    }

    /**
     * Handle chat completion request - using OpenAI SDK streaming interface
     */
    async handleRequest(
        model: vscode.LanguageModelChatInformation,
        modelConfig: ModelConfig,
        messages: readonly vscode.LanguageModelChatMessage[],
        options: vscode.ProvideLanguageModelChatResponseOptions,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
        token: vscode.CancellationToken
    ): Promise<void> {
        Logger.debug(`${model.name} starting to process ${this.displayName} request`);
        // Clear event deduplication tracker for current request
        this.currentRequestProcessedEvents.clear();
        try {
            const client = await this.createOpenAIClient(modelConfig);
            Logger.debug(`${model.name} sending ${messages.length} messages, using ${this.displayName}`);
            // Prioritize using model-specific request model name, if none use model ID
            const requestModel = modelConfig.model || model.id;
            const createParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
                model: requestModel,
                messages: this.convertMessagesToOpenAI(messages, model.capabilities || undefined, modelConfig),
                max_tokens: ConfigManager.getMaxTokensForModel(model.maxOutputTokens),
                stream: true,
                stream_options: { include_usage: true },
                temperature: ConfigManager.getTemperature(),
                top_p: ConfigManager.getTopP()
            };
            // #region Debug: check image content in input messages
            // let totalImageParts = 0;
            // let totalDataParts = 0;
            // let cacheControlParts = 0;
            // messages.forEach((msg, index) => {
            //     const dataParts = msg.content.filter(part => part instanceof vscode.LanguageModelDataPart);
            //     const imageParts = dataParts.filter(part => {
            //         const dataPart = part as vscode.LanguageModelDataPart;
            //         return this.isImageMimeType(dataPart.mimeType);
            //     });
            //     const cacheControls = dataParts.filter(part => {
            //         const dataPart = part as vscode.LanguageModelDataPart;
            //         return dataPart.mimeType === 'cache_control';
            //     });

            //     totalDataParts += dataParts.length;
            //     totalImageParts += imageParts.length;
            //     cacheControlParts += cacheControls.length;

            //     if (dataParts.length > 0) {
            //         Logger.debug(`📷 Message ${index}: Found ${dataParts.length} data parts, including ${imageParts.length} images, ${cacheControls.length} cache identifiers`);
            //         dataParts.forEach((part, partIndex) => {
            //             const dataPart = part as vscode.LanguageModelDataPart;
            //             const isImage = this.isImageMimeType(dataPart.mimeType);
            //             const isCache = dataPart.mimeType === 'cache_control';
            //             const icon = isImage ? '🖼️' : isCache ? '📄' : '📄';
            //             Logger.trace(`${icon} Data part ${partIndex}: MIME=${dataPart.mimeType}, size=${dataPart.data.length} bytes, type=${isImage ? 'image' : isCache ? 'cache' : 'other'}`);
            //         });
            //     }
            // });
            // if (totalDataParts > 0) {
            //     const effectiveDataParts = totalDataParts - cacheControlParts;
            //     Logger.debug(`📊 Data statistics: total ${totalDataParts} data parts (${effectiveDataParts} effective data + ${cacheControlParts} cache identifiers), including ${totalImageParts} images, model image capability: ${model.capabilities?.imageInput}`);
            // }
            // #endregion

            // Add tool support (if any)
            if (options.tools && options.tools.length > 0 && model.capabilities?.toolCalling) {
                createParams.tools = this.convertToolsToOpenAI([...options.tools]);
                createParams.tool_choice = 'auto';
                Logger.trace(`${model.name} added ${options.tools.length} tools`);
            }

            // Merge extraBody parameters (if any)
            if (modelConfig.extraBody) {
                // Filter out core parameters that cannot be modified
                const filteredExtraBody = OpenAIHandler.filterExtraBodyParams(modelConfig.extraBody);
                Object.assign(createParams, filteredExtraBody);
                if (Object.keys(filteredExtraBody).length > 0) {
                    Logger.trace(`${model.name} merged extraBody parameters: ${JSON.stringify(filteredExtraBody)}`);
                }
            }

            // #region Debug: check tool calls in input messages
            // // Output converted message statistics
            // const openaiMessages = createParams.messages;
            // const totalContentLength = openaiMessages.reduce((sum, msg) => {
            //     if (typeof msg.content === 'string') {
            //         return sum + msg.content.length;
            //     } else if (Array.isArray(msg.content)) {
            //         return sum + msg.content.reduce((contentSum, item) => {
            //             return contentSum + (('text' in item && item.text) ? item.text.length : 0);
            //         }, 0);
            //     }
            //     return sum;
            // }, 0);
            // const totalToolCalls = openaiMessages.reduce((sum, msg) => {
            //     return sum + (('tool_calls' in msg && msg.tool_calls) ? msg.tool_calls.length : 0);
            // }, 0);
            // Logger.debug(`📊 ${model.name} Message statistics: ${openaiMessages.length} messages, ${totalContentLength} characters, ${totalToolCalls} tool calls`);

            // // Detailed message debug info
            // openaiMessages.forEach((msg, index) => {
            //     const contentInfo = typeof msg.content === 'string'
            //         ? `text(${msg.content.length}chars)`
            //         : Array.isArray(msg.content)
            //             ? `multimodal(${msg.content.length}parts)`
            //             : 'no_content';
            //     const toolCallsInfo = ('tool_calls' in msg && msg.tool_calls) ? msg.tool_calls.length : 0;
            //     const toolCallId = ('tool_call_id' in msg && msg.tool_call_id) ? msg.tool_call_id : 'none';
            //     Logger.trace(`💬 Message ${index}: role=${msg.role}, content=${contentInfo}, tool_calls=${toolCallsInfo}, tool_call_id=${toolCallId}`);
            //     if ('tool_calls' in msg && msg.tool_calls) {
            //         msg.tool_calls.forEach(tc => {
            //             if (tc.type === 'function' && tc.function) {
            //                 const argsLength = tc.function.arguments ? tc.function.arguments.length : 0;
            //                 Logger.trace(`🔧 Tool call: ${tc.id} -> ${tc.function.name}(${argsLength}chars)`);
            //             }
            //         });
            //     }
            // });
            // #endregion
            Logger.info(`🚀 ${model.name} sending ${this.displayName} request`);

            let hasReceivedContent = false;
            let hasThinkingContent = false; // Mark whether thinking content was output
            // ID of the chain of thought currently being output (can be restarted/ended)
            // When not null, indicates an unended chain of thought, encounter first visible content delta need to first send an empty value with same id to end said chain of thought
            let currentThinkingId: string | null = null;
            // Thinking content cache, used to accumulate thinking content
            let thinkingContentBuffer: string = '';

            // Activity indicator - report empty text periodically to keep UI responsive
            let lastActivityReportTime = Date.now();
            const ACTIVITY_REPORT_INTERVAL_MS = 300; // Report every 300ms to show activity (reduced from 500ms)
            const reportActivity = () => {
                const now = Date.now();
                if (now - lastActivityReportTime >= ACTIVITY_REPORT_INTERVAL_MS) {
                    // Report empty text part to keep UI "alive" and show "Working..."
                    progress.report(new vscode.LanguageModelTextPart(''));
                    lastActivityReportTime = now;
                    return true;
                }
                return false;
            };

            // Mark activity (reset timer)
            const markActivity = () => {
                lastActivityReportTime = Date.now();
            };

            // Interval to automatically report activity when no data
            let activityInterval: NodeJS.Timeout | null = null;
            const startActivityInterval = () => {
                if (activityInterval) return;
                activityInterval = setInterval(() => {
                    if (!token.isCancellationRequested) {
                        reportActivity();
                    }
                }, ACTIVITY_REPORT_INTERVAL_MS);
            };
            const stopActivityInterval = () => {
                if (activityInterval) {
                    clearInterval(activityInterval);
                    activityInterval = null;
                }
            };

            // Start activity interval
            startActivityInterval();

            // Use OpenAI SDK event-driven streaming method, utilizing built-in tool call handling
            // Convert vscode.CancellationToken to AbortSignal
            const abortController = new AbortController();
            const cancellationListener = token.onCancellationRequested(() => abortController.abort());
            let streamError: Error | null = null; // Used to capture stream error
            // Save usage information of the last chunk (if any), some providers return usage in each chunk
            let finalUsage: OpenAI.Completions.CompletionUsage | undefined = undefined;

            try {
                const stream = client.chat.completions.stream(createParams, { signal: abortController.signal });
                // Use SDK built-in event system to handle tool calls and content
                stream
                    .on('content', (delta: string, _snapshot: string) => {
                        // Check cancellation request
                        if (token.isCancellationRequested) {
                            Logger.warn(`${model.name} user cancelled request`);
                            throw new vscode.CancellationError();
                        }
                        // Mark activity
                        markActivity();
                        // Output trace log: record incremental length and fragment preview, to facilitate troubleshooting of occasional missing complete chunks
                        try {
                            Logger.trace(
                                `${model.name} received content delta: ${delta ? delta.length : 0} characters, preview=${delta}`
                            );
                        } catch {
                            // Logs should not interrupt stream processing
                        }
                        // Determine if delta contains visible characters (length > 0 after removing all whitespace and invisible spaces)
                        const deltaVisible =
                            typeof delta === 'string' && delta.replace(/[\s\uFEFF\xA0]+/g, '').length > 0;
                        if (deltaVisible && currentThinkingId) {
                            // Before outputting first visible content, if there is cached thinking content, report it first
                            if (thinkingContentBuffer.length > 0) {
                                try {
                                    progress.report(
                                        new vscode.LanguageModelThinkingPart(thinkingContentBuffer, currentThinkingId)
                                    );
                                    thinkingContentBuffer = ''; // Clear cache
                                    hasThinkingContent = true; // Mark thinking content was output
                                } catch (e) {
                                    Logger.trace(`${model.name} failed to report thinking: ${String(e)}`);
                                }
                            }

                            // Then end current chain of thought
                            progress.report(new vscode.LanguageModelThinkingPart('', currentThinkingId));
                            currentThinkingId = null;
                        }

                        // Directly output regular content
                        progress.report(new vscode.LanguageModelTextPart(delta));
                        hasReceivedContent = true;
                    })
                    .on('tool_calls.function.arguments.done', event => {
                        // Complete tool call event triggered after SDK auto-accumulation completion
                        if (token.isCancellationRequested) {
                            return;
                        }

                        // Mark activity
                        markActivity();

                        // Generate deduplication identifier based on event index and name
                        const eventKey = `tool_call_${event.name}_${event.index}_${event.arguments.length}`;
                        if (this.currentRequestProcessedEvents.has(eventKey)) {
                            Logger.trace(`Skip duplicate tool call event: ${event.name} (index: ${event.index})`);
                            return;
                        }
                        this.currentRequestProcessedEvents.add(eventKey);

                        // Use parameters parsed by SDK (priority) or manually parse arguments string
                        let parsedArgs: object = {};

                        // If SDK already parsed successfully, use directly (trust SDK result)
                        if (event.parsed_arguments) {
                            const result = event.parsed_arguments;
                            parsedArgs = typeof result === 'object' && result !== null ? result : {};
                        } else {
                            // SDK not parsed, try manual parsing
                            try {
                                parsedArgs = JSON.parse(event.arguments || '{}');
                            } catch (firstError) {
                                // First parsing failed, try deduplication fix then parse again
                                Logger.trace(
                                    `Tool call parameter first parsing failed: ${event.name} (index: ${event.index}), trying deduplication fix...`
                                );

                                let cleanedArgs = event.arguments || '{}';

                                // Detect and fix common duplication patterns
                                // 1. Detect if front part repeats in back, check first 50 characters one by one (Volcano's Coding package interface may have exceptions)
                                try {
                                    const maxCheckLength = Math.min(50, Math.floor(cleanedArgs.length / 2));
                                    let duplicateFound = false;
                                    let cutPosition = 0;

                                    // Detect from longer substrings (prioritize detecting longer repetitions)
                                    for (let len = maxCheckLength; len >= 5; len--) {
                                        const prefix = cleanedArgs.substring(0, len);
                                        // Find if this prefix repeats in the remaining part
                                        const restContent = cleanedArgs.substring(len);
                                        const duplicateIndex = restContent.indexOf(prefix);

                                        if (duplicateIndex !== -1) {
                                            // Duplicate found, calculate position to cut
                                            cutPosition = len + duplicateIndex;
                                            duplicateFound = true;
                                            Logger.debug(
                                                `Deduplication fix: detected first ${len} characters repeat at position ${cutPosition}, prefix="${prefix}"`
                                            );
                                            break;
                                        }
                                    }

                                    if (duplicateFound && cutPosition > 0) {
                                        const originalLength = cleanedArgs.length;
                                        cleanedArgs = cleanedArgs.substring(cutPosition);
                                        Logger.debug(
                                            `Deduplication fix: remove duplicate prefix, truncate from ${originalLength} characters to ${cleanedArgs.length} characters`
                                        );
                                    }
                                } catch {
                                    // Prefix repetition detection failed, continue with other fix attempts
                                }

                                // 2. Detect {}{} pattern (duplicate empty or full objects)
                                if (cleanedArgs.includes('}{')) {
                                    let depth = 0;
                                    let firstObjEnd = -1;
                                    for (let i = 0; i < cleanedArgs.length; i++) {
                                        if (cleanedArgs[i] === '{') {
                                            depth++;
                                        } else if (cleanedArgs[i] === '}') {
                                            depth--;
                                            if (depth === 0) {
                                                firstObjEnd = i;
                                                break;
                                            }
                                        }
                                    }
                                    if (firstObjEnd !== -1 && firstObjEnd < cleanedArgs.length - 1) {
                                        const originalLength = cleanedArgs.length;
                                        cleanedArgs = cleanedArgs.substring(0, firstObjEnd + 1);
                                        Logger.debug(
                                            `Deduplication fix: remove duplicate object, truncate from ${originalLength} characters to ${cleanedArgs.length} characters`
                                        );
                                    }
                                }

                                // Try to parse fixed parameters
                                try {
                                    parsedArgs = JSON.parse(cleanedArgs);
                                    Logger.debug(
                                        `✅ Deduplication fix successful: ${event.name} (index: ${event.index}), parsed successfully after fix`
                                    );
                                } catch (secondError) {
                                    // Still failed after fix, output detailed error info
                                    Logger.error(
                                        `❌ Failed to parse tool call parameters: ${event.name} (index: ${event.index})`
                                    );
                                    Logger.error(
                                        `Original parameter string (first 100 characters): ${event.arguments?.substring(0, 100)}`
                                    );
                                    Logger.error(`First parsing error: ${firstError}`);
                                    Logger.error(`Still failed after deduplication fix: ${secondError}`);
                                    // Throw original error
                                    throw firstError;
                                }
                            }
                        }

                        // SDK automatically generates unique tool call ID, using simple index identifier here
                        const toolCallId = `tool_call_${event.index}_${Date.now()}`;
                        progress.report(new vscode.LanguageModelToolCallPart(toolCallId, event.name, parsedArgs));
                        hasReceivedContent = true;
                    })

                    .on('tool_calls.function.arguments.delta', event => {
                        // Tool call parameter incremental event
                        markActivity();
                        reportActivity();
                    })
                    // Save usage information of the last chunk, some providers return usage in each chunk,
                    // we only output once after stream successful completion to avoid duplicate logs
                    .on('chunk', (chunk, _snapshot: unknown) => {
                        // Mark activity whenever a chunk is received
                        markActivity();
                        // Process token usage statistics: only save to finalUsage, output uniformly at the end
                        if (chunk.usage) {
                            finalUsage = chunk.usage;
                        }

                        // Process thinking content (reasoning/reasoning_content) and compatible with old format
                        if (chunk.choices && chunk.choices.length > 0) {
                            // Traverse all choices, handle each choice's reasoning_content and message.content
                            for (let choiceIndex = 0; choiceIndex < chunk.choices.length; choiceIndex++) {
                                const choice = chunk.choices[choiceIndex] as ExtendedChoice;
                                const delta = choice.delta as ExtendedDelta | undefined;
                                const message = choice.message;

                                // Check if there is a tool call start (tool_calls delta exists but no arguments yet)
                                if (delta?.tool_calls && delta.tool_calls.length > 0) {
                                    for (const toolCall of delta.tool_calls) {
                                        // If there is a tool call but no arguments, it means tool call just started
                                        if (toolCall.index !== undefined && !toolCall.function?.arguments) {
                                            // At tool call start, if there is cached thinking content, report it first
                                            if (thinkingContentBuffer.length > 0 && currentThinkingId) {
                                                try {
                                                    progress.report(
                                                        new vscode.LanguageModelThinkingPart(
                                                            thinkingContentBuffer,
                                                            currentThinkingId
                                                        )
                                                    );
                                                    // End current chain of thought
                                                    progress.report(
                                                        new vscode.LanguageModelThinkingPart('', currentThinkingId)
                                                    );
                                                    thinkingContentBuffer = ''; // Clear cache
                                                    hasThinkingContent = true; // Mark thinking content was output
                                                } catch (e) {
                                                    Logger.trace(`${model.name} failed to report thinking: ${String(e)}`);
                                                }
                                            }
                                        }
                                    }
                                }

                                // Compatible: prioritize reasoning/reasoning_content in delta, otherwise try reading from message
                                // Note: Some providers (Chutes) use 'reasoning', others (OpenAI-compatible) use 'reasoning_content'
                                const reasoningContent = delta?.reasoning ?? delta?.reasoning_content ?? message?.reasoning ?? message?.reasoning_content;
                                if (reasoningContent) {
                                    // Check outputThinking setting in model configuration
                                    const shouldOutputThinking = modelConfig.outputThinking !== false; // default true
                                    if (shouldOutputThinking) {
                                        try {
                                            // If currently no active id, generate one for this chain of thought
                                            if (!currentThinkingId) {
                                                currentThinkingId = `thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                                            }

                                            // Report thinking immediately for real-time streaming (no buffering)
                                            thinkingContentBuffer += reasoningContent;
                                            progress.report(new vscode.LanguageModelThinkingPart(thinkingContentBuffer, currentThinkingId));
                                            thinkingContentBuffer = ''; // Clear cache

                                            // Mark thinking content received
                                            hasThinkingContent = true;
                                        } catch (e) {
                                            Logger.trace(`${model.name} failed to report thinking: ${String(e)}`);
                                        }
                                    }
                                }

                                // Also compatible: if server puts final text in message.content (old/mixed format), treat as content delta
                                const messageContent = message?.content;
                                if (
                                    typeof messageContent === 'string' &&
                                    messageContent.replace(/[\s\uFEFF\xA0]+/g, '').length > 0
                                ) {
                                    // Before outputting visible content, if there is an unended chain of thought, end it first
                                    if (currentThinkingId) {
                                        try {
                                            progress.report(new vscode.LanguageModelThinkingPart('', currentThinkingId));
                                        } catch (e) {
                                            Logger.trace(`${model.name} failed to end thinking: ${String(e)}`);
                                        }
                                        currentThinkingId = null;
                                    }
                                    // Then report text content
                                    try {
                                        progress.report(new vscode.LanguageModelTextPart(messageContent));
                                        hasReceivedContent = true;
                                    } catch (e) {
                                        Logger.trace(
                                            `${model.name} failed to report message content (choice ${choiceIndex}): ${String(e)}`
                                        );
                                    }
                                }
                            }
                        }
                    })
                    .on('error', (error: Error) => {
                        // Save error and abort request
                        streamError = error;
                        abortController.abort();
                    });
                // Wait for stream processing completion
                await stream.done();

                // Check for unreported thinking content cache when stream ends
                if (thinkingContentBuffer.length > 0 && currentThinkingId) {
                    try {
                        progress.report(new vscode.LanguageModelThinkingPart(thinkingContentBuffer, currentThinkingId));
                        thinkingContentBuffer = ''; // Clear cache
                        hasThinkingContent = true; // Mark thinking content was output
                    } catch (e) {
                        Logger.trace(`${model.name} failed to report thinking at end: ${String(e)}`);
                    }
                }

                // Check for stream error
                if (streamError) {
                    throw streamError;
                }
                // Only output usage info once after stream successful completion to avoid multiple duplicate prints
                if (finalUsage) {
                    try {
                        const usage = finalUsage as OpenAI.Completions.CompletionUsage;
                        Logger.info(
                            `📊 ${model.name} Token usage: ${usage.prompt_tokens}+${usage.completion_tokens}=${usage.total_tokens}`
                        );
                    } catch (e) {
                        Logger.trace(`${model.name} failed to print finalUsage: ${String(e)}`);
                    }
                }
                Logger.debug(`${model.name} ${this.displayName} SDK stream processing complete`);
            } catch (streamError) {
                // Improve error handling, distinguish cancellation and other errors
                if (streamError instanceof vscode.CancellationError) {
                    Logger.info(`${model.name} request cancelled by user`);
                    throw streamError;
                } else {
                    Logger.error(`${model.name} SDK stream processing error: ${streamError}`);
                    throw streamError;
                }
            } finally {
                cancellationListener.dispose();
            }
            // Only add <think/> placeholder if thinking content was output but no content was output
            if (hasThinkingContent && !hasReceivedContent) {
                progress.report(new vscode.LanguageModelTextPart('<think/>'));
                Logger.warn(
                    `${model.name} end of message stream has only thinking content and no text content, added <think/> placeholder as output`
                );
            }
            Logger.debug(`✅ ${model.name} ${this.displayName} request complete`);
        } catch (error) {
            if (error instanceof Error) {
                if (error.cause instanceof Error) {
                    const errorMessage = error.cause.message || 'Unknown error';
                    Logger.error(`${model.name} ${this.displayName} request failed: ${errorMessage}`);
                    throw error.cause;
                } else {
                    const errorMessage = error.message || 'Unknown error';
                    Logger.error(`${model.name} ${this.displayName} request failed: ${errorMessage}`);

                    // Check if it is a statusCode error, if so ensure synchronous throw
                    if (
                        errorMessage.includes('502') ||
                        errorMessage.includes('Bad Gateway') ||
                        errorMessage.includes('500') ||
                        errorMessage.includes('Internal Server Error') ||
                        errorMessage.includes('503') ||
                        errorMessage.includes('Service Unavailable') ||
                        errorMessage.includes('504') ||
                        errorMessage.includes('Gateway Timeout')
                    ) {
                        // For server errors, throw original error directly to terminate dialogue
                        throw new vscode.LanguageModelError(errorMessage);
                    }

                    // For normal errors, also need to re-throw
                    throw error;
                }
            }

            // Improved error handling, refer to official examples
            if (error instanceof vscode.CancellationError) {
                // Cancellation error needs no extra handling, re-throw directly
                throw error;
            } else if (error instanceof vscode.LanguageModelError) {
                Logger.debug(`LanguageModelError details: code=${error.code}, cause=${error.cause}`);
                // According to official example error handling pattern, use string comparison
                if (error.code === 'blocked') {
                    Logger.warn('Request blocked, may contain inappropriate content');
                } else if (error.code === 'noPermissions') {
                    Logger.warn('Insufficient permissions, please check API key and model access permissions');
                } else if (error.code === 'notFound') {
                    Logger.warn('Model not found or unavailable');
                } else if (error.code === 'quotaExceeded') {
                    Logger.warn('Quota exceeded, please check API usage limits');
                } else if (error.code === 'unknown') {
                    Logger.warn('Unknown language model error');
                }
                throw error;
            } else {
                // Other error types
                throw error;
            }
        }
    }

    /**
     * Message conversion referring to official implementation - using OpenAI SDK standard mode
     * Support text, images and tool calls
     * Public method, can be reused by other Providers
     */
    convertMessagesToOpenAI(
        messages: readonly vscode.LanguageModelChatMessage[],
        capabilities?: { toolCalling?: boolean | number; imageInput?: boolean },
        modelConfig?: ModelConfig
    ): OpenAI.Chat.ChatCompletionMessageParam[] {
        const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];
        for (const message of messages) {
            const convertedMessage = this.convertSingleMessage(message, capabilities, modelConfig);
            if (convertedMessage) {
                if (Array.isArray(convertedMessage)) {
                    result.push(...convertedMessage);
                } else {
                    result.push(convertedMessage);
                }
            }
        }
        return result;
    }

    /**
     * Convert single message - refer to OpenAI SDK official pattern
     */
    public convertSingleMessage(
        message: vscode.LanguageModelChatMessage,
        capabilities?: { toolCalling?: boolean | number; imageInput?: boolean },
        modelConfig?: ModelConfig
    ): OpenAI.Chat.ChatCompletionMessageParam | OpenAI.Chat.ChatCompletionMessageParam[] | null {
        switch (message.role) {
            case vscode.LanguageModelChatMessageRole.System:
                return this.convertSystemMessage(message);
            case vscode.LanguageModelChatMessageRole.User:
                return this.convertUserMessage(message, capabilities);
            case vscode.LanguageModelChatMessageRole.Assistant:
                return this.convertAssistantMessage(message, modelConfig);
            default:
                Logger.warn(`Unknown message role: ${message.role}`);
                return null;
        }
    }

    /**
     * Convert system message - refer to official ChatCompletionSystemMessageParam
     */
    private convertSystemMessage(
        message: vscode.LanguageModelChatMessage
    ): OpenAI.Chat.ChatCompletionSystemMessageParam | null {
        const textContent = this.extractTextContent(message.content);
        if (!textContent) {
            return null;
        }
        return {
            role: 'system',
            content: textContent
        };
    }

    /**
     * Convert user message - support multimodal and tool results
     */
    private convertUserMessage(
        message: vscode.LanguageModelChatMessage,
        capabilities?: { toolCalling?: boolean | number; imageInput?: boolean }
    ): OpenAI.Chat.ChatCompletionMessageParam[] {
        const results: OpenAI.Chat.ChatCompletionMessageParam[] = [];
        // Handle text and image content
        const userMessage = this.convertUserContentMessage(message, capabilities);
        if (userMessage) {
            results.push(userMessage);
        }
        // Handle tool results
        const toolMessages = this.convertToolResultMessages(message);
        results.push(...toolMessages);
        return results;
    }

    /**
     * Convert user content message (text + image)
     */
    private convertUserContentMessage(
        message: vscode.LanguageModelChatMessage,
        capabilities?: { toolCalling?: boolean | number; imageInput?: boolean }
    ): OpenAI.Chat.ChatCompletionUserMessageParam | null {
        const textParts = message.content.filter(
            part => part instanceof vscode.LanguageModelTextPart
        ) as vscode.LanguageModelTextPart[];
        const imageParts: vscode.LanguageModelDataPart[] = [];
        // Collect images (if supported)
        if (capabilities?.imageInput === true) {
            Logger.debug('🖼️ Model supports image input, starting to collect image parts');
            for (const part of message.content) {
                if (part instanceof vscode.LanguageModelDataPart) {
                    Logger.debug(`📷 Found data part: MIME=${part.mimeType}, size=${part.data.length} bytes`);
                    if (this.isImageMimeType(part.mimeType)) {
                        imageParts.push(part);
                        Logger.debug(`✅ Add image: MIME=${part.mimeType}, size=${part.data.length} bytes`);
                    } else {
                        // Classify and process different types of data
                        if (part.mimeType === 'cache_control') {
                            Logger.trace('⚠️ Ignore Claude cache identifier: cache_control');
                        } else if (part.mimeType.startsWith('image/')) {
                            Logger.warn(`❌ Unsupported image MIME type: ${part.mimeType}`);
                        } else {
                            Logger.trace(`📄 Skip non-image data: ${part.mimeType}`);
                        }
                    }
                } else {
                    Logger.trace(`📝 Non-data part: ${part.constructor.name}`);
                }
            }
            // Special note: if no images found but there are non-cache_control data parts
            const allDataParts = message.content.filter(part => part instanceof vscode.LanguageModelDataPart);
            const nonCacheDataParts = allDataParts.filter(part => {
                const dataPart = part as vscode.LanguageModelDataPart;
                return dataPart.mimeType !== 'cache_control';
            });
            if (nonCacheDataParts.length > 0 && imageParts.length === 0) {
                Logger.warn(
                    `⚠️ Found ${nonCacheDataParts.length} non-cache_control data parts but no valid images, please check image attachment format`
                );
            }
        }
        // If no text and image content, return null
        if (textParts.length === 0 && imageParts.length === 0) {
            return null;
        }
        if (imageParts.length > 0) {
            // Multimodal message: text + images
            Logger.debug(
                `🖼️ Build multimodal message: ${textParts.length} text parts + ${imageParts.length} image parts`
            );
            const contentArray: OpenAI.Chat.ChatCompletionContentPart[] = [];
            if (textParts.length > 0) {
                const textContent = textParts.map(part => part.value).join('\n');
                contentArray.push({
                    type: 'text',
                    text: textContent
                });
                Logger.trace(`📝 Add text content: ${textContent.length} characters`);
            }
            for (const imagePart of imageParts) {
                const dataUrl = this.createDataUrl(imagePart);
                contentArray.push({
                    type: 'image_url',
                    image_url: { url: dataUrl }
                });
                Logger.trace(
                    `📷 Add image URL: MIME=${imagePart.mimeType}, Base64 length=${dataUrl.length} characters`
                );
            }
            Logger.debug(`✅ Multimodal message construction complete: ${contentArray.length} content parts`);
            return { role: 'user', content: contentArray };
        } else {
            // Pure text message
            return {
                role: 'user',
                content: textParts.map(part => part.value).join('\n')
            };
        }
    }

    /**
     * Convert tool result messages - use OpenAI SDK standard types
     */
    private convertToolResultMessages(
        message: vscode.LanguageModelChatMessage
    ): OpenAI.Chat.ChatCompletionToolMessageParam[] {
        const toolMessages: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

        for (const part of message.content) {
            if (part instanceof vscode.LanguageModelToolResultPart) {
                const toolContent = this.convertToolResultContent(part.content);
                // Use OpenAI SDK standard ChatCompletionToolMessageParam type
                const toolMessage: OpenAI.Chat.ChatCompletionToolMessageParam = {
                    role: 'tool',
                    content: toolContent,
                    tool_call_id: part.callId
                };
                toolMessages.push(toolMessage);
                // Logger.debug(`Add tool result: callId=${part.callId}, content length=${toolContent.length}`);
            }
        }

        return toolMessages;
    }

    /**
     * Convert assistant message - handle text and tool calls
     */
    private convertAssistantMessage(
        message: vscode.LanguageModelChatMessage,
        modelConfig?: ModelConfig
    ): OpenAI.Chat.ChatCompletionAssistantMessageParam | null {
        const textContent = this.extractTextContent(message.content);
        const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];
        let thinkingContent: string | null = null;

        // Process tool calls and thinking content
        for (const part of message.content) {
            if (part instanceof vscode.LanguageModelToolCallPart) {
                toolCalls.push({
                    id: part.callId,
                    type: 'function',
                    function: {
                        name: part.name,
                        arguments: JSON.stringify(part.input)
                    }
                });
                // Logger.debug(`Add tool call: ${part.name} (ID: ${part.callId})`);
            }
        }

        // Check if thinking content needs to be included
        const includeThinking = modelConfig?.includeThinking === true;
        if (includeThinking) {
            // Extract thinking content from message
            Logger.trace(`Check if thinking content needs to be included: includeThinking=${includeThinking}`);

            // Traverse message content, find LanguageModelThinkingPart
            for (const part of message.content) {
                if (part instanceof vscode.LanguageModelThinkingPart) {
                    // Handle thinking content, could be string or string array
                    if (Array.isArray(part.value)) {
                        thinkingContent = part.value.join('');
                    } else {
                        thinkingContent = part.value;
                    }
                    Logger.trace(`Extracted thinking content: ${thinkingContent.length} characters`);
                    break; // Only take first thinking content part
                }
            }
        }

        // If no text content, thinking content and tool calls, return null
        if (!textContent && !thinkingContent && toolCalls.length === 0) {
            return null;
        }

        // Create extended assistant message, supporting reasoning_content field
        const assistantMessage: ExtendedAssistantMessageParam = {
            role: 'assistant',
            content: textContent || null // Contains only regular text content, no thinking content
        };

        // If there is thinking content, add to reasoning_content field
        if (thinkingContent) {
            assistantMessage.reasoning_content = thinkingContent;
            Logger.trace(`Add reasoning_content: ${thinkingContent.length} characters`);
        }

        if (toolCalls.length > 0) {
            assistantMessage.tool_calls = toolCalls;
            // Logger.debug(`Assistant message contains ${toolCalls.length} tool calls`);
        }

        return assistantMessage;
    }

    /**
     * Extract text content
     */
    private extractTextContent(
        content: readonly (
            | vscode.LanguageModelTextPart
            | vscode.LanguageModelDataPart
            | vscode.LanguageModelToolCallPart
            | vscode.LanguageModelToolResultPart
            | vscode.LanguageModelThinkingPart
        )[]
    ): string | null {
        const textParts = content
            .filter(part => part instanceof vscode.LanguageModelTextPart)
            .map(part => (part as vscode.LanguageModelTextPart).value);
        return textParts.length > 0 ? textParts.join('\n') : null;
    }

    /**
     * Convert tool result content
     */
    private convertToolResultContent(content: unknown): string {
        if (typeof content === 'string') {
            return content;
        }

        if (Array.isArray(content)) {
            return content
                .map(resultPart => {
                    if (resultPart instanceof vscode.LanguageModelTextPart) {
                        return resultPart.value;
                    }
                    return JSON.stringify(resultPart);
                })
                .join('\n');
        }

        return JSON.stringify(content);
    }

    /**
     * Tool conversion - ensure correct parameter format
     * Public method, can be reused by other Providers
     */
    public convertToolsToOpenAI(tools: vscode.LanguageModelChatTool[]): OpenAI.Chat.ChatCompletionTool[] {
        return tools.map(tool => {
            const functionDef: OpenAI.Chat.ChatCompletionTool = {
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description || ''
                }
            };

            // Process parameter schema
            if (tool.inputSchema) {
                if (typeof tool.inputSchema === 'object' && tool.inputSchema !== null) {
                    functionDef.function.parameters = tool.inputSchema as Record<string, unknown>;
                } else {
                    // If not an object, provide default schema
                    functionDef.function.parameters = {
                        type: 'object',
                        properties: {},
                        required: []
                    };
                }
            } else {
                // Default schema
                functionDef.function.parameters = {
                    type: 'object',
                    properties: {},
                    required: []
                };
            }

            return functionDef;
        });
    }

    /**
     * Check if it is an image MIME type
     */
    public isImageMimeType(mimeType: string): boolean {
        // Normalize MIME type
        const normalizedMime = mimeType.toLowerCase().trim();
        // Supported image types
        const supportedTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/bmp',
            'image/svg+xml'
        ];
        const isImageCategory = normalizedMime.startsWith('image/');
        const isSupported = supportedTypes.includes(normalizedMime);
        // Debug logs
        if (isImageCategory && !isSupported) {
            Logger.warn(
                `🚫 Image type not in support list: ${mimeType}, supported types: ${supportedTypes.join(', ')}`
            );
        } else if (!isImageCategory && normalizedMime !== 'cache_control') {
            // For cache_control (Claude cache identifier) no debug info recorded, for other non-image types record trace level log
            Logger.trace(`📄 Non-image data type: ${mimeType}`);
        }
        return isImageCategory && isSupported;
    }

    /**
     * Create image data URL
     */
    public createDataUrl(dataPart: vscode.LanguageModelDataPart): string {
        try {
            const base64Data = Buffer.from(dataPart.data).toString('base64');
            const dataUrl = `data:${dataPart.mimeType};base64,${base64Data}`;
            Logger.debug(
                `🔗 Create image DataURL: MIME=${dataPart.mimeType}, original size=${dataPart.data.length} bytes, Base64 size=${base64Data.length} characters`
            );
            return dataUrl;
        } catch (error) {
            Logger.error(`❌ Failed to create image DataURL: ${error}`);
            throw error;
        }
    }

    /**
     * Filter out non-modifiable core parameters in extraBody
     * @param extraBody Original extraBody parameters
     * @returns Filtered parameters, removed core parameters that cannot be modified
     */
    public static filterExtraBodyParams(extraBody: Record<string, unknown>): Record<string, unknown> {
        const coreParams = new Set([
            'model', // Model name
            'messages', // Message array
            'stream', // Streaming switch
            'stream_options', // Streaming options
            'tools' // Tool definition
        ]);

        const filtered: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(extraBody)) {
            if (!coreParams.has(key)) {
                filtered[key] = value;
                if (value == null) {
                    filtered[key] = undefined;
                }
            }
        }

        return filtered;
    }
}
