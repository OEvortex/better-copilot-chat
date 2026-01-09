/*---------------------------------------------------------------------------------------------
 *  Copilot Fetcher - HTTP Request Handling
 *  Implements IFetcher interface, handles API requests
 *--------------------------------------------------------------------------------------------*/

import { Readable } from 'stream';
import { VersionManager } from '../utils/versionManager';
import type { NESCompletionConfig } from '../utils/configManager';
import type {
    FetchOptions,
    PaginationOptions,
    IAbortController,
    IHeaders,
    Response
} from '@vscode/chat-lib/dist/src/_internal/platform/networking/common/fetcherService';
import { IFetcher } from '@vscode/chat-lib/dist/src/_internal/platform/networking/common/networking';
import { configProviders } from '../providers/config';
import OpenAI from 'openai';
import { getCompletionLogger, getApiKeyManager, getConfigManager } from './singletons';

// ============================================================================
// Response wrapper class
// ============================================================================

/**
 * Response class - Compatible with @vscode/chat-lib Response interface
 * Supports streaming response, body() returns readable stream
 */
class ResponseWrapper {
    readonly ok: boolean;

    constructor(
        readonly status: number,
        readonly statusText: string,
        readonly headers: IHeaders,
        private readonly getText: () => Promise<string>,
        private readonly getJson: () => Promise<unknown>,
        private readonly getBody: () => Promise<Readable | null>,
        readonly fetcher: string
    ) {
        this.ok = status >= 200 && status < 300;
    }

    async text(): Promise<string> {
        return this.getText();
    }

    async json(): Promise<unknown> {
        return this.getJson();
    }

    async body(): Promise<Readable | null> {
        return this.getBody();
    }
}

// ============================================================================
// Fetcher - Implements IFetcher interface
// Reference: TestFetcher in nesProvider.spec.ts
// ============================================================================

/**
 * Custom Fetcher implementation
 */
export class Fetcher implements IFetcher {
    getUserAgentLibrary(): string {
        return 'Fetcher';
    }

    async fetch(url: string, options: FetchOptions): Promise<Response> {
        // Prefer using singleton instances from globalThis (ensure cross-bundle singleton)
        const logger = getCompletionLogger();
        const keyManager = getApiKeyManager();

        if (options?.method === 'GET' && url.endsWith('/models')) {
            // Return an empty model list response
            const emptyModelsResponse = {
                object: 'list',
                data: []
            };
            // Create headers object that conforms to IHeaders interface
            const headers: IHeaders = {
                get: (name: string) => {
                    if (name.toLowerCase() === 'content-type') {
                        return 'application/json';
                    }
                    return null;
                },
                [Symbol.iterator]: function* () {
                    yield ['content-type', 'application/json'];
                }
            };
            return new ResponseWrapper(
                200,
                'OK',
                headers,
                async () => JSON.stringify(emptyModelsResponse),
                async () => emptyModelsResponse,
                async () => null,
                'fetcher'
            ) as unknown as Response;
        }

        if (options?.method !== 'POST' || url.endsWith('/completions') === false) {
            throw new Error('Not Support Request');
        }

        const requestBody = { ...options.json } as Record<string, unknown>; // as OpenAI.Chat.ChatCompletionCreateParamsStreaming;

        const ConfigManager = getConfigManager();
        let modelConfig: NESCompletionConfig['modelConfig'];
        if (url.endsWith('/chat/completions')) {
            modelConfig = ConfigManager.getNESConfig().modelConfig;
            if (!modelConfig || !modelConfig.baseUrl) {
                logger.error('[Fetcher] NES model configuration missing');
                throw new Error('NES model configuration is missing');
            }
            url = `${modelConfig.baseUrl}/chat/completions`;
        } else if (url.endsWith('/completions')) {
            modelConfig = ConfigManager.getFIMConfig().modelConfig;
            if (!modelConfig || !modelConfig.baseUrl) {
                logger.error('[Fetcher] FIM model configuration missing');
                throw new Error('FIM model configuration is missing');
            }
            url = `${modelConfig.baseUrl}/completions`;
        } else {
            throw new Error('Not Support Request URL');
        }

        const { provider, model, maxTokens, extraBody } = modelConfig;

        try {
            const apiKey = await keyManager.getApiKey(provider);
            if (!apiKey) {
                logger.error(`[Fetcher] ${provider} API key not configured`);
                throw new Error('API key not configured');
            }

            const requestHeaders: Record<string, string> = {
                ...(options.headers || {}),
                'Content-Type': 'application/json',
                'User-Agent': VersionManager.getUserAgent(provider),
                Authorization: `Bearer ${apiKey}`
            };

            if (extraBody) {
                for (const key in extraBody) {
                    requestBody[key] = extraBody[key];
                }
            }
            // if (Array.isArray(requestBody.messages)) {
            //     const messages = requestBody.messages;
            //     const promptAddition =
            //         '\n IMPORTANT: Do NOT use markdown code blocks (```). Output ONLY the raw code. Do not explain.';
            //     // Try to add to system message
            //     const systemMessage = messages.find(m => m.role === 'system');
            //     if (systemMessage) {
            //         systemMessage.content = (systemMessage.content || '') + promptAddition;
            //     }
            //     CompletionLogger.trace('[Fetcher] Prompt instruction injected to prohibit Markdown');
            // }

            const fetchOptions: RequestInit = {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify({
                    ...requestBody,
                    model,
                    max_tokens: maxTokens
                }),
                signal: options.signal as AbortSignal | undefined
            };

            logger.info(`[Fetcher] Sending request: ${url}`);
            const response = await fetch(url, fetchOptions);
            logger.debug(`[Fetcher] Received response - Status code: ${response.status} ${response.statusText}`);

            // let responseText: string | null = null;
            // if (response.ok) {
            //     responseText = await response.text();
            //     CompletionLogger.trace(`[Fetcher] Received response - Response body: ${responseText}`);

            //     const completion = JSON.parse(responseText) as OpenAI.ChatCompletion;
            //     if (completion?.choices?.length === 1) {
            //         const [choice] = completion.choices;
            //         const { message } = choice;
            //         const { content } = message;
            //         if (content && content.startsWith('```')) {
            //             // Use regex to efficiently remove code block markers
            //             // Matches opening ```language\n and closing \n``` or a separate line with ```
            //             const newContent = content
            //                 .replace(/^```\w*\n/, '') // Remove opening ```language\n
            //                 .replace(/\n```$/, ''); // Remove closing \n```

            //             // Update response content
            //             if (newContent && newContent !== content) {
            //                 message.content = newContent;
            //                 responseText = JSON.stringify(completion);
            //                 CompletionLogger.debug(`[Fetcher] Corrected response - Response body: ${responseText}`);
            //             }
            //         }
            //     }
            // }

            // Cache response text (for text() and json() methods)
            let cachedText: string | null = null;
            let bodyConsumed = false;

            const getText = async (): Promise<string> => {
                if (cachedText !== null) {
                    return cachedText;
                }
                if (bodyConsumed) {
                    throw new Error('Response body has already been consumed as stream');
                }
                bodyConsumed = true;
                cachedText = await response.text();
                logger.trace(`[Fetcher] Response body length: ${cachedText.length} characters`);
                return cachedText;
            };

            const getJson = async (): Promise<unknown> => {
                const text = await getText();
                try {
                    return JSON.parse(text);
                } catch (e) {
                    logger.error('[Fetcher.ResponseWrapper] JSON parsing failed:', e);
                    throw e;
                }
            };

            const getBody = async (): Promise<Readable | null> => {
                if (bodyConsumed) {
                    // If text has already been read, return stream based on cached text
                    if (cachedText !== null) {
                        return Readable.from([cachedText]);
                    }
                    throw new Error('Response body has already been consumed');
                }
                bodyConsumed = true;

                // Get Web ReadableStream from fetch response and convert to Node.js Readable
                if (!response.body) {
                    return null;
                }

                // Convert Web ReadableStream to Node.js Readable
                const reader = response.body.getReader();
                const nodeStream = new Readable({
                    async read() {
                        try {
                            const { done, value } = await reader.read();
                            if (done) {
                                this.push(null);
                            } else {
                                this.push(Buffer.from(value));
                            }
                        } catch (error) {
                            this.destroy(error as Error);
                        }
                    }
                });
                return nodeStream;
            };

            return new ResponseWrapper(
                response.status,
                response.statusText,
                response.headers,
                getText,
                getJson,
                getBody,
                'node-fetch'
            ) as unknown as Response;
        } catch (error) {
            // If request is aborted, do not log error
            if (!this.isAbortError(error)) {
                logger.error('[Fetcher] Exception:', error);
            }
            throw error;
        }
    }

    fetchWithPagination<T>(_baseUrl: string, _options: PaginationOptions<T>): Promise<T[]> {
        throw new Error('Method not implemented.');
    }

    async disconnectAll(): Promise<unknown> {
        return Promise.resolve();
    }

    makeAbortController(): IAbortController {
        return new AbortController() as IAbortController;
    }

    isAbortError(e: unknown): boolean {
        return !!e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'AbortError';
    }

    isInternetDisconnectedError(_e: unknown): boolean {
        return false;
    }

    isFetcherError(_e: unknown): boolean {
        return false;
    }

    getUserMessageForFetcherError(err: unknown): string {
        const message = err instanceof Error ? err.message : String(err);
        return `Fetcher error: ${message}`;
    }
}
