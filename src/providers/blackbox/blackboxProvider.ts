/*-----------------------------------------------------------------------------
 *  Blackbox AI Provider
 *  Uses static model configuration from src/providers/config/blackbox.json
 *----------------------------------------------------------------------------*/

import OpenAI from "openai";
import type {
    CancellationToken,
    LanguageModelChatInformation,
    LanguageModelChatMessage,
    LanguageModelChatProvider,
    LanguageModelResponsePart,
    Progress,
    ProvideLanguageModelChatResponseOptions,
} from "vscode";
import * as vscode from "vscode";
import type { ProviderConfig } from "../../types/sharedTypes";
import { ApiKeyManager } from "../../utils/apiKeyManager";
import { ConfigManager } from "../../utils/configManager";
import {
    resolveGlobalCapabilities,
    resolveGlobalTokenLimits,
} from "../../utils/globalContextLengthManager";
import { Logger } from "../../utils/logger";
import { RateLimiter } from "../../utils/rateLimiter";
import { TokenCounter } from "../../utils/tokenCounter";
import { ProviderWizard } from "../../utils/providerWizard";
import { DEFAULT_CONTEXT_LENGTH, GenericModelProvider } from "../common";

const BLACKBOX_MAX_OUTPUT_TOKENS = 32 * 1024; // 32768 - Blackbox specific

function resolveTokenLimits(
    modelId: string,
    contextLength: number,
): { maxInputTokens: number; maxOutputTokens: number } {
    return resolveGlobalTokenLimits(modelId, contextLength, {
        defaultContextLength: DEFAULT_CONTEXT_LENGTH,
        defaultMaxOutputTokens: BLACKBOX_MAX_OUTPUT_TOKENS,
    });
}

// Blackbox API requires specific headers
const BLACKBOX_DEFAULT_HEADERS = {
    customerId: "",
    userId: "",
    version: "1.1"
};

export class BlackboxProvider
    extends GenericModelProvider
    implements LanguageModelChatProvider
{
    private readonly userAgent: string;
    private clientCache = new Map<string, { client: OpenAI; lastUsed: number }>();
    // Track processed tool call events to prevent duplicates
    private currentRequestProcessedEvents = new Set<string>();

    constructor(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig,
        userAgent: string,
    ) {
        super(context, providerKey, providerConfig);
        this.userAgent = userAgent;
    }

    /**
     * Override refreshHandlers to also clear the OpenAI client cache
     * This ensures that when baseUrl changes, new clients are created with the correct URL
     */
    protected override refreshHandlers(): void {
        if (this.clientCache && this.clientCache.size > 0) {
            Logger.debug(`[Blackbox] Clearing ${this.clientCache.size} cached OpenAI clients due to config change`);
            this.clientCache.clear();
        }
        super.refreshHandlers();
    }

    async prepareLanguageModelChatInformation(
        options: { silent: boolean },
        _token: CancellationToken,
    ): Promise<LanguageModelChatInformation[]> {
        const apiKey = await this.ensureApiKey(options.silent ?? true);
        if (!apiKey) {
            return [];
        }

        const infos = this.providerConfig.models.map((model) => {
            const capabilities = resolveGlobalCapabilities(model.model || model.id, {
                detectedImageInput: model.capabilities?.imageInput === true,
            });

            const fallbackContextLength =
                (model.maxInputTokens || 0) + (model.maxOutputTokens || 0) ||
                DEFAULT_CONTEXT_LENGTH;
            const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(
                model.model || model.id,
                fallbackContextLength,
            );

            return {
                id: model.id,
                name: model.name,
                tooltip: `${model.name} by Blackbox AI`,
                family: "Blackbox AI",
                version: "1.0.0",
                maxInputTokens,
                maxOutputTokens,
                capabilities,
            } as LanguageModelChatInformation;
        });

        this._chatEndpoints = infos.map((info) => ({
            model: info.id,
            modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens,
        }));
        return infos;
    }

    async provideLanguageModelChatInformation(
        options: { silent: boolean },
        _token: CancellationToken,
    ): Promise<LanguageModelChatInformation[]> {
        return this.prepareLanguageModelChatInformation(
            { silent: options.silent ?? false },
            _token,
        );
    }

    override async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: readonly LanguageModelChatMessage[],
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<LanguageModelResponsePart>,
        token: CancellationToken,
    ): Promise<void> {
        await RateLimiter.getInstance(this.providerKey, 2, 1000).throttle(
            this.providerConfig.displayName,
        );

        // Clear processed events for new request
        this.currentRequestProcessedEvents.clear();

        try {
            const rememberLastModel = ConfigManager.getRememberLastModel();
            if (rememberLastModel) {
                this.modelInfoCache
                    ?.saveLastSelectedModel(this.providerKey, model.id)
                    .catch((err) =>
                        Logger.warn(
                            "[Blackbox] Failed to save model selection",
                            err instanceof Error ? err.message : String(err),
                        ),
                    );
            }

            const apiKey = await this.ensureApiKey(false);
            if (!apiKey) {
                throw new Error("Blackbox API key not found");
            }

            if (options.tools && options.tools.length > 128) {
                throw new Error("Cannot have more than 128 tools per request.");
            }

            // Get model config
            const modelConfig = this.providerConfig.models.find(
                (m) => m.id === model.id,
            );

            // Create OpenAI client with Blackbox-specific configuration
            const client = await this.createOpenAIClient(apiKey, modelConfig);

            // Convert messages using OpenAIHandler
            const openaiMessages = this.openaiHandler.convertMessagesToOpenAI(
                messages as any,
                model.capabilities || undefined,
                modelConfig,
            );

            // Create stream parameters
            const createParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
                model: model.id,
                messages: openaiMessages,
                stream: true,
                stream_options: { include_usage: true },
                max_tokens: Math.min(
                    options.modelOptions?.max_tokens || 4096,
                    model.maxOutputTokens,
                ),
                temperature:
                    options.modelOptions?.temperature ?? ConfigManager.getTemperature(),
                top_p: ConfigManager.getTopP(),
            };

            // Add model options
            if (options.modelOptions) {
                const mo = options.modelOptions as Record<string, unknown>;
                if (typeof mo.stop === "string" || Array.isArray(mo.stop)) {
                    createParams.stop = mo.stop;
                }
                if (typeof mo.frequency_penalty === "number") {
                    createParams.frequency_penalty = mo.frequency_penalty;
                }
                if (typeof mo.presence_penalty === "number") {
                    createParams.presence_penalty = mo.presence_penalty;
                }
            }

            // Add tools if supported
            if (
                options.tools &&
                options.tools.length > 0 &&
                model.capabilities?.toolCalling
            ) {
                createParams.tools = this.openaiHandler.convertToolsToOpenAI([
                    ...options.tools,
                ]);
                createParams.tool_choice = "auto";
            }

            // Use OpenAI SDK streaming
            const abortController = new AbortController();
            token.onCancellationRequested(() => abortController.abort());

            const stream = client.chat.completions.stream(createParams, {
                signal: abortController.signal,
            });

            let currentThinkingId: string | null = null;
            let thinkingContentBuffer = "";
            let _hasReceivedContent = false;
            let hasThinkingContent = false;

            // Store tool call IDs by index
            const toolCallIds = new Map<number, string>();

            // Handle chunks for reasoning_content
            stream.on("chunk", (chunk: OpenAI.Chat.ChatCompletionChunk) => {
                if (token.isCancellationRequested) {
                    return;
                }

                // Capture tool call IDs
                if (chunk.choices && chunk.choices.length > 0) {
                    for (const choice of chunk.choices) {
                        if (choice.delta?.tool_calls) {
                            for (const toolCall of choice.delta.tool_calls) {
                                if (toolCall.id && toolCall.index !== undefined) {
                                    toolCallIds.set(toolCall.index, toolCall.id);
                                }
                            }
                        }

                        const delta = choice.delta as
                            | { reasoning?: string; reasoning_content?: string }
                            | undefined;
                        const reasoningContent =
                            delta?.reasoning ?? delta?.reasoning_content;

                        if (reasoningContent && typeof reasoningContent === "string") {
                            if (!currentThinkingId) {
                                currentThinkingId = `blackbox_thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                            }
                            thinkingContentBuffer += reasoningContent;
                            try {
                                progress.report(
                                    new vscode.LanguageModelThinkingPart(
                                        thinkingContentBuffer,
                                        currentThinkingId,
                                    ) as unknown as LanguageModelResponsePart,
                                );
                                thinkingContentBuffer = "";
                                hasThinkingContent = true;
                            } catch (e) {
                                Logger.warn(
                                    "[Blackbox] Failed to report thinking",
                                    e instanceof Error ? e.message : String(e),
                                );
                            }
                        }
                    }
                }
            });

            // Handle content stream
            stream.on("content", (delta: string) => {
                if (token.isCancellationRequested) {
                    return;
                }

                // Handle regular content
                if (delta && typeof delta === "string" && delta.trim().length > 0) {
                    // End thinking if we're starting to output regular content
                    if (currentThinkingId) {
                        try {
                            progress.report(
                                new vscode.LanguageModelThinkingPart(
                                    "",
                                    currentThinkingId,
                                ) as unknown as LanguageModelResponsePart,
                            );
                        } catch {
                            // ignore
                        }
                        currentThinkingId = null;
                    }

                    try {
                        progress.report(new vscode.LanguageModelTextPart(delta));
                        _hasReceivedContent = true;
                    } catch (e) {
                        Logger.warn(
                            "[Blackbox] Failed to report content",
                            e instanceof Error ? e.message : String(e),
                        );
                    }
                }
            });

            // Handle tool calls
            stream.on("tool_calls.function.arguments.done", (event) => {
                if (token.isCancellationRequested) {
                    return;
                }

                // Deduplicate tool call events
                const eventKey = `tool_call_${event.name}_${event.index}_${event.arguments.length}`;
                if (this.currentRequestProcessedEvents.has(eventKey)) {
                    Logger.trace(
                        `[Blackbox] Skip duplicate tool call event: ${event.name} (index: ${event.index})`,
                    );
                    return;
                }
                this.currentRequestProcessedEvents.add(eventKey);

                // Finalize thinking before tool calls
                if (currentThinkingId) {
                    try {
                        progress.report(
                            new vscode.LanguageModelThinkingPart(
                                "",
                                currentThinkingId,
                            ) as unknown as LanguageModelResponsePart,
                        );
                    } catch {
                        // ignore
                    }
                    currentThinkingId = null;
                }

                // Report tool call to VS Code
                const toolCallId =
                    toolCallIds.get(event.index) ||
                    `tool_call_${event.index}_${Date.now()}`;

                // Use parameters parsed by SDK (priority) or manually parse arguments string
                let parsedArgs: object = {};
                if (event.parsed_arguments) {
                    const result = event.parsed_arguments;
                    parsedArgs =
                        typeof result === "object" && result !== null ? result : {};
                } else {
                    try {
                        parsedArgs = JSON.parse(event.arguments || "{}");
                    } catch {
                        parsedArgs = { value: event.arguments };
                    }
                }

                try {
                    progress.report(
                        new vscode.LanguageModelToolCallPart(
                            toolCallId,
                            event.name,
                            parsedArgs,
                        ),
                    );
                    _hasReceivedContent = true;
                } catch (e) {
                    Logger.warn(
                        "[Blackbox] Failed to report tool call",
                        e instanceof Error ? e.message : String(e),
                    );
                }
            });

            // Wait for stream to complete
            try {
                await stream.finalChatCompletion();
            } catch (err) {
                // Handle case where stream ends without finish_reason
                if (
                    err instanceof Error &&
                    err.message.includes("missing finish_reason")
                ) {
                    Logger.debug(
                        "[Blackbox] Stream completed without finish_reason, ignoring error",
                    );
                } else {
                    throw err;
                }
            }

            // Finalize thinking if still active
            if (currentThinkingId) {
                try {
                    progress.report(
                        new vscode.LanguageModelThinkingPart(
                            "",
                            currentThinkingId,
                        ) as unknown as LanguageModelResponsePart,
                    );
                } catch {
                    // ignore
                }
            }

            // Only add <think/> placeholder if thinking content was output but no content was output
            if (hasThinkingContent && !_hasReceivedContent) {
                progress.report(new vscode.LanguageModelTextPart("<think/>"));
                Logger.warn(
                    "[Blackbox] End of message stream has only thinking content and no text content, added <think/> placeholder as output",
                );
            }
        } catch (error) {
            Logger.error(
                "[Blackbox] Chat request failed",
                error instanceof Error ? error.message : String(error),
            );
            throw error;
        }
    }

    /**
     * Create OpenAI client for Blackbox API
     * Includes Blackbox-specific headers required by the API
     */
    private async createOpenAIClient(
        apiKey: string,
        modelConfig: any,
    ): Promise<OpenAI> {
        const baseUrl =
            modelConfig?.baseUrl ||
            this.providerConfig.baseUrl ||
            "https://oi-vscode-server-985058387028.europe-west1.run.app";
        const cacheKey = `blackbox:${baseUrl}`;
        const cached = this.clientCache.get(cacheKey);
        if (cached) {
            cached.lastUsed = Date.now();
            return cached.client;
        }

        const client = new OpenAI({
            apiKey: apiKey,
            baseURL: baseUrl,
            defaultHeaders: {
                "User-Agent": this.userAgent,
                ...BLACKBOX_DEFAULT_HEADERS,
            },
            maxRetries: 2,
            timeout: 120000,
        });

        this.clientCache.set(cacheKey, { client, lastUsed: Date.now() });
        return client;
    }

    async provideTokenCount(
        model: LanguageModelChatInformation,
        text: string | LanguageModelChatMessage,
        _token: CancellationToken,
    ): Promise<number> {
        return TokenCounter.getInstance().countTokens(model, text);
    }

    private async ensureApiKey(silent: boolean): Promise<string | undefined> {
        // If provider doesn't require API key (supportsApiKey is false), use the template key
        if (this.providerConfig.supportsApiKey === false) {
            return this.providerConfig.apiKeyTemplate || "xxx";
        }

        let apiKey = await ApiKeyManager.getApiKey(this.providerKey);
        if (!apiKey && !silent) {
            await ApiKeyManager.promptAndSetApiKey(
                this.providerKey,
                this.providerConfig.displayName,
                this.providerConfig.apiKeyTemplate,
            );
            apiKey = await ApiKeyManager.getApiKey(this.providerKey);
        }
        return apiKey;
    }

    static createAndActivate(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig,
    ): { provider: BlackboxProvider; disposables: vscode.Disposable[] } {
        Logger.trace(`${providerConfig.displayName} provider activated!`);
        const ext = vscode.extensions.getExtension("OEvortex.better-copilot-chat");
        const extVersion = ext?.packageJSON?.version ?? "unknown";
        const vscodeVersion = vscode.version;
        const ua = `better-copilot-chat/${extVersion} VSCode/${vscodeVersion}`;

        const provider = new BlackboxProvider(context, providerKey, providerConfig, ua);
        const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
            `chp.${providerKey}`,
            provider,
        );

        const setApiKeyCommand = vscode.commands.registerCommand(
            `chp.${providerKey}.setApiKey`,
            async () => {
                await ProviderWizard.startWizard({
                    providerKey,
                    displayName: providerConfig.displayName,
                    apiKeyTemplate: providerConfig.apiKeyTemplate,
                    supportsApiKey: true,
                    supportsBaseUrl: true
                });
                await provider.modelInfoCache?.invalidateCache(providerKey);
                provider._onDidChangeLanguageModelChatInformation.fire(undefined);
            },
        );

        const disposables = [providerDisposable, setApiKeyCommand];
        for (const disposable of disposables) {
            context.subscriptions.push(disposable);
        }
        return { provider, disposables };
    }
}
