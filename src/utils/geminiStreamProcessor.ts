import * as vscode from "vscode";
import type { ModelConfig } from "../types/sharedTypes";
import type { ProcessStreamOptions } from "../providers/common/commonTypes";

// Handler interface for provider-specific operations
export interface GeminiStreamHandler {
    extractToolCallFromGeminiResponse(part: Record<string, unknown>): {
        callId: string;
        name: string;
        args: Record<string, unknown> | string;
        thoughtSignature?: string;
    } | null;
    storeThoughtSignature(callId: string, signature: string): void;
}

/**
 * Unified stream processor for Gemini-compatible providers (Antigravity, GeminiCLI).
 * Handles SSE streaming, thinking tags, tool calls, and adaptive buffering.
 */
export class GeminiStreamProcessor {
    private textBuffer = "";
    private textBufferLastFlush = 0;
    private thinkingBuffer = "";
    private currentThinkingId: string | null = null;
    private seenToolCalls = new Set<string>();
    private toolCallCounter = 0;
    private isInsideThinkingTag = false;
    private thinkingTagBuffer = "";
    private sseDataParts: string[] = [];
    private readonly CLOSING_TAG = "</thinking>";
    private thinkingQueue = "";
    private thinkingFlushInterval: ReturnType<typeof setInterval> | null = null;
    private thinkingProgress: vscode.Progress<vscode.LanguageModelResponsePart2> | null = null;
    private chunkCounter = 0;
    private lastChunkTime = 0;
    private streamVelocity = 0;
    private hasReceivedContent = false;
    private hasThinkingContent = false;

    // Function calls buffer to support XML-style <function_calls> blocks split across parts/chunks
    private functionCallsBuffer = "";

    // Activity tracking to keep UI "alive" when processing tool calls
    private lastActivityReportTime = 0;
    private activityReportInterval: ReturnType<typeof setInterval> | null = null;
    private pendingToolCalls: Array<{
        callId: string;
        name: string;
        args: Record<string, unknown>;
    }> = [];
    private toolCallFlushInterval: ReturnType<typeof setInterval> | null = null;

    private static readonly THINKING_FLUSH_INTERVAL_MS = 80;
    private static readonly THINKING_CHARS_PER_FLUSH = 150;
    private static readonly ACTIVITY_REPORT_INTERVAL_MS = 400;
    private static readonly TEXT_BUFFER_MIN_SIZE = 40;
    private static readonly TEXT_BUFFER_MAX_DELAY_MS = 25;
    private static readonly YIELD_EVERY_N_CHUNKS = 5;
    private static readonly HIGH_VELOCITY_THRESHOLD = 10;
    private static readonly ADAPTIVE_BUFFER_MULTIPLIER = 0.5;
    private static readonly TOOL_CALL_FLUSH_DELAY_MS = 50;

    constructor(
        private readonly providerName: string,
        private readonly handler: GeminiStreamHandler,
    ) {}

    async processStream(options: ProcessStreamOptions): Promise<void> {
        const { response, modelConfig, progress, token } = options;
        if (!response.body) {
            throw new Error(`${this.providerName} response body is empty.`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        this.startActivityReporting(progress);

        try {
            while (true) {
                if (token.isCancellationRequested) {
                    throw new vscode.CancellationError();
                }
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                const now = performance.now();
                if (this.lastChunkTime > 0) {
                    const delta = now - this.lastChunkTime;
                    this.streamVelocity = delta > 0 ? value.length / delta : this.streamVelocity;
                }
                this.lastChunkTime = now;
                buffer += decoder.decode(value, { stream: true });
                buffer = buffer.replace(/\r\n/g, "\n");
                buffer = this.processSSELines(buffer, modelConfig, progress);
                this.flushTextBufferAdaptive(progress);
                this.flushThinkingBufferIfNeeded(progress);
                this.schedulePendingToolCallsFlush(progress);

                this.chunkCounter++;
                if (this.chunkCounter % GeminiStreamProcessor.YIELD_EVERY_N_CHUNKS === 0) {
                    await new Promise<void>((resolve) => setTimeout(resolve, 1));
                }
            }
        } finally {
            this.stopActivityReporting();
            this.processRemainingBuffer(buffer, modelConfig, progress);
            this.flushTextBuffer(progress, true);
            this.flushPendingToolCallsImmediate(progress);
            this.finalizeThinkingPart(progress);

            // Only add <think/> placeholder if thinking content was output but no content was output
            if (this.hasThinkingContent && !this.hasReceivedContent) {
                progress.report(new vscode.LanguageModelTextPart("<think/>"));
            }
        }
    }

    private startActivityReporting(
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        if (this.activityReportInterval) {
            return;
        }
        this.lastActivityReportTime = Date.now();
        this.activityReportInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastActivity = now - this.lastActivityReportTime;

            if (timeSinceLastActivity >= GeminiStreamProcessor.ACTIVITY_REPORT_INTERVAL_MS) {
                if (this.thinkingBuffer.length > 0) {
                    this.flushThinkingBuffer(progress);
                } else if (this.textBuffer.length > 0) {
                    this.flushTextBuffer(progress, true);
                }
                this.lastActivityReportTime = now;
            }
        }, GeminiStreamProcessor.ACTIVITY_REPORT_INTERVAL_MS / 2);
    }

    private stopActivityReporting(): void {
        if (this.activityReportInterval) {
            clearInterval(this.activityReportInterval);
            this.activityReportInterval = null;
        }
        if (this.toolCallFlushInterval) {
            clearInterval(this.toolCallFlushInterval);
            this.toolCallFlushInterval = null;
        }
    }

    private markActivity(): void {
        this.lastActivityReportTime = Date.now();
    }

    private schedulePendingToolCallsFlush(
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        if (this.pendingToolCalls.length === 0 || this.toolCallFlushInterval) {
            return;
        }
        this.toolCallFlushInterval = setTimeout(() => {
            this.flushPendingToolCallsImmediate(progress);
            this.toolCallFlushInterval = null;
        }, GeminiStreamProcessor.TOOL_CALL_FLUSH_DELAY_MS) as unknown as ReturnType<typeof setInterval>;
    }

    private flushPendingToolCallsImmediate(
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        while (this.pendingToolCalls.length > 0) {
            const toolCall = this.pendingToolCalls.shift();
            if (toolCall) {
                progress.report(
                    new vscode.LanguageModelToolCallPart(
                        toolCall.callId,
                        toolCall.name,
                        toolCall.args,
                    ),
                );
                this.markActivity();
            }
        }
    }

    private processSSELines(
        buffer: string,
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): string {
        let lineEndIndex = buffer.indexOf("\n");
        while (lineEndIndex !== -1) {
            const line = buffer.slice(0, lineEndIndex).trimEnd();
            buffer = buffer.slice(lineEndIndex + 1);
            if (line.length === 0) {
                this.processSSEEvent(modelConfig, progress);
                lineEndIndex = buffer.indexOf("\n");
                continue;
            }
            if (line.startsWith("data:")) {
                const dataLine = line.slice(5);
                if (dataLine.trim() === "[DONE]") {
                    this.sseDataParts = [];
                    lineEndIndex = buffer.indexOf("\n");
                    continue;
                }
                if (dataLine.length > 0) {
                    this.sseDataParts.push(dataLine.trimStart());
                }
            }
            lineEndIndex = buffer.indexOf("\n");
        }
        return buffer;
    }

    private processSSEEvent(
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        if (this.sseDataParts.length === 0) {
            return;
        }
        const eventData = this.sseDataParts.join("\n").trim();
        this.sseDataParts = [];
        if (!eventData || eventData === "[DONE]") {
            return;
        }
        const createCallId = () => `tool_call_${this.toolCallCounter++}_${Date.now()}`;
        try {
            this.handleStreamPayload(eventData, createCallId, modelConfig, progress);
            this.flushTextBufferIfNeeded(progress);
            this.flushThinkingBufferIfNeeded(progress);
        } catch (error) {
            if (
                error instanceof SyntaxError &&
                String(error.message).includes("after JSON")
            ) {
                const jsonObjects = this.splitConcatenatedJSON(eventData);
                for (const jsonStr of jsonObjects) {
                    try {
                        this.handleStreamPayload(jsonStr, createCallId, modelConfig, progress);
                    } catch {
                        // Ignore JSON parse errors
                    }
                }
            }
        }
    }

    private processRemainingBuffer(
        buffer: string,
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        const trailing = buffer.trim();
        if (trailing.length > 0 && trailing.startsWith("data:")) {
            this.sseDataParts.push(trailing.slice(5).trimStart());
        }
        if (this.sseDataParts.length > 0) {
            const eventData = this.sseDataParts.join("\n").trim();
            if (eventData && eventData !== "[DONE]") {
                const createCallId = () => `tool_call_${this.toolCallCounter++}_${Date.now()}`;
                try {
                    this.handleStreamPayload(eventData, createCallId, modelConfig, progress);
                } catch {
                    // Ignore JSON parse errors
                }
            }
        }
    }

    private handleStreamPayload(
        data: string,
        createCallId: () => string,
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        const payload = (parsed.response as Record<string, unknown>) || parsed;
        const candidates = (payload.candidates as Array<Record<string, unknown>>) || [];
        for (const candidate of candidates) {
            const content = candidate.content as
                | { parts?: Array<Record<string, unknown>> }
                | undefined;
            for (const part of content?.parts || []) {
                this.handlePart(part, createCallId, modelConfig, progress);
            }
        }
    }

    private handlePart(
        part: Record<string, unknown>,
        createCallId: () => string,
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        const hasFunctionCall = part.functionCall !== undefined && part.functionCall !== null;
        const hasText = typeof part.text === "string";
        const hasThought = part.thought === true;
        const hasThoughtSignature = typeof part.thoughtSignature === "string";
        const isGeminiThinkingPart =
            hasThoughtSignature && typeof part.text === "string" && !hasFunctionCall;

        // Render explicit thought parts and Gemini-style thoughtSignature text as VS Code thinking
        if (part.thought === true || isGeminiThinkingPart) {
            if (modelConfig.outputThinking !== false && typeof part.text === "string") {
                if (!this.currentThinkingId) {
                    this.currentThinkingId = createCallId();
                }
                this.thinkingBuffer += part.text;
                this.hasThinkingContent = true;
                this.flushThinkingBufferIfNeeded(progress);
            }
            return;
        }

        if (typeof part.text === "string") {
            const textToProcess = this.functionCallsBuffer + part.text;
            const funcCallsRegex = /<function_calls>[\s\S]*?<\/function_calls>/g;
            let lastIndex = 0;
            let match = funcCallsRegex.exec(textToProcess);

            while (match !== null) {
                const before = textToProcess.slice(lastIndex, match.index);
                if (before.length > 0) {
                    const processedText = this.processTextWithThinkingTags(before, modelConfig);
                    if (this.isInsideThinkingTag) {
                        this.flushThinkingBufferIfNeeded(progress);
                    } else {
                        this.finalizeThinkingPart(progress);
                        if (processedText.length > 0) {
                            this.textBuffer += processedText;
                            if (processedText.trim().length > 0) {
                                this.hasReceivedContent = true;
                            }
                            this.flushTextBufferIfNeeded(progress);
                        }
                    }
                }

                const block = match[0];
                const toolCallRegex = /<tool_call\s+name="([^"]+)"\s+arguments='([^']*)'\s*\/>/g;
                let toolMatch = toolCallRegex.exec(block);
                this.flushTextBuffer(progress, true);
                this.flushThinkingBuffer(progress);

                while (toolMatch !== null) {
                    const name = toolMatch[1];
                    const argsString = toolMatch[2] || "";
                    let argsObj: Record<string, unknown> = {};
                    try {
                        argsObj = JSON.parse(argsString);
                    } catch {
                        argsObj = { value: argsString };
                    }
                    const callId = createCallId();
                    const dedupeKey = `${callId}:${name}`;
                    if (!this.seenToolCalls.has(dedupeKey)) {
                        this.seenToolCalls.add(dedupeKey);
                        this.pendingToolCalls.push({ callId, name, args: argsObj });
                        this.hasReceivedContent = true;
                        this.markActivity();
                    }
                    toolMatch = toolCallRegex.exec(block);
                }

                lastIndex = funcCallsRegex.lastIndex;
                match = funcCallsRegex.exec(textToProcess);
            }

            const remaining = textToProcess.slice(lastIndex);
            const openStart = remaining.indexOf("<function_calls>");
            const closeEnd = remaining.indexOf("</function_calls>");

            if (openStart !== -1 && closeEnd === -1) {
                this.functionCallsBuffer = remaining.slice(openStart);
                const beforeOpen = remaining.slice(0, openStart);
                if (beforeOpen.length > 0) {
                    const processedText = this.processTextWithThinkingTags(beforeOpen, modelConfig);
                    if (this.isInsideThinkingTag) {
                        this.flushThinkingBufferIfNeeded(progress);
                    } else {
                        this.finalizeThinkingPart(progress);
                        if (processedText.length > 0) {
                            this.textBuffer += processedText;
                            if (processedText.trim().length > 0) {
                                this.hasReceivedContent = true;
                            }
                            this.flushTextBufferIfNeeded(progress);
                        }
                    }
                }
            } else {
                this.functionCallsBuffer = "";
                if (remaining.length > 0) {
                    const processedText = this.processTextWithThinkingTags(remaining, modelConfig);
                    if (this.isInsideThinkingTag) {
                        this.flushThinkingBufferIfNeeded(progress);
                    } else {
                        this.finalizeThinkingPart(progress);
                        if (processedText.length > 0) {
                            this.textBuffer += processedText;
                            if (processedText.trim().length > 0) {
                                this.hasReceivedContent = true;
                            }
                            this.flushTextBufferIfNeeded(progress);
                        }
                    }
                }
            }
        }

        const functionCall = part.functionCall as
            | { name?: string; args?: unknown; id?: string }
            | undefined;
        if (functionCall?.name) {
            this.flushTextBuffer(progress, true);
            this.flushThinkingBuffer(progress);

            const toolCallInfo = this.handler.extractToolCallFromGeminiResponse(part);
            if (toolCallInfo?.callId && toolCallInfo.name) {
                const dedupeKey = `${toolCallInfo.callId}:${toolCallInfo.name}`;
                if (this.seenToolCalls.has(dedupeKey)) {
                    return;
                }
                this.seenToolCalls.add(dedupeKey);
                if (toolCallInfo.thoughtSignature) {
                    this.handler.storeThoughtSignature(toolCallInfo.callId, toolCallInfo.thoughtSignature);
                }

                let normalizedArgs: Record<string, unknown> = {};
                if (toolCallInfo.args && typeof toolCallInfo.args === "object") {
                    normalizedArgs = toolCallInfo.args as Record<string, unknown>;
                } else if (typeof toolCallInfo.args === "string") {
                    try {
                        const parsed = JSON.parse(toolCallInfo.args);
                        if (parsed && typeof parsed === "object") {
                            normalizedArgs = parsed;
                        }
                    } catch {
                        normalizedArgs = { value: toolCallInfo.args };
                    }
                }

                this.pendingToolCalls.push({
                    callId: toolCallInfo.callId,
                    name: toolCallInfo.name,
                    args: normalizedArgs,
                });
                this.hasReceivedContent = true;
                this.markActivity();
            }
        }
    }

    private processTextWithThinkingTags(text: string, modelConfig: ModelConfig): string {
        if (modelConfig.outputThinking === false) {
            return text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "");
        }

        let result = "";
        let remaining = this.thinkingTagBuffer + text;
        this.thinkingTagBuffer = "";

        while (remaining.length > 0) {
            if (this.isInsideThinkingTag) {
                const closeIdx = remaining.indexOf(this.CLOSING_TAG);
                if (closeIdx !== -1) {
                    const thinkingContent = remaining.slice(0, closeIdx);
                    if (thinkingContent.length > 0) {
                        if (!this.currentThinkingId) {
                            this.currentThinkingId = this.generateThinkingId();
                        }
                        this.thinkingBuffer += thinkingContent;
                        this.hasThinkingContent = true;
                    }
                    this.isInsideThinkingTag = false;
                    remaining = remaining.slice(closeIdx + this.CLOSING_TAG.length);
                } else {
                    const safeLen = Math.max(0, remaining.length - 12);
                    if (safeLen > 0) {
                        if (!this.currentThinkingId) {
                            this.currentThinkingId = this.generateThinkingId();
                        }
                        this.thinkingBuffer += remaining.slice(0, safeLen);
                        this.hasThinkingContent = true;
                    }
                    this.thinkingTagBuffer = remaining.slice(safeLen);
                    remaining = "";
                }
            } else {
                const openIdx = remaining.indexOf("<thinking>");
                if (openIdx !== -1) {
                    result += remaining.slice(0, openIdx);
                    this.isInsideThinkingTag = true;
                    if (!this.currentThinkingId) {
                        this.currentThinkingId = this.generateThinkingId();
                    }
                    remaining = remaining.slice(openIdx + 10);
                } else {
                    const safeLen = Math.max(0, remaining.length - 10);
                    result += remaining.slice(0, safeLen);
                    this.thinkingTagBuffer = remaining.slice(safeLen);
                    remaining = "";
                }
            }
        }
        return result;
    }

    private flushTextBuffer(
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
        force = false,
    ): void {
        if (
            this.textBuffer.length > 0 &&
            (force || this.textBuffer.length >= GeminiStreamProcessor.TEXT_BUFFER_MIN_SIZE)
        ) {
            progress.report(new vscode.LanguageModelTextPart(this.textBuffer));
            this.textBuffer = "";
            this.textBufferLastFlush = Date.now();
            this.markActivity();
        }
    }

    private flushTextBufferIfNeeded(
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        if (this.textBuffer.length === 0) {
            return;
        }
        const timeSinceLastFlush = Date.now() - this.textBufferLastFlush;
        const shouldFlush =
            this.textBuffer.length >= GeminiStreamProcessor.TEXT_BUFFER_MIN_SIZE ||
            timeSinceLastFlush >= GeminiStreamProcessor.TEXT_BUFFER_MAX_DELAY_MS;
        if (shouldFlush) {
            this.flushTextBuffer(progress, true);
        }
    }

    private flushTextBufferAdaptive(
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        if (this.textBuffer.length === 0) {
            return;
        }
        const isHighVelocity = this.streamVelocity > GeminiStreamProcessor.HIGH_VELOCITY_THRESHOLD;
        const baseSize = GeminiStreamProcessor.TEXT_BUFFER_MIN_SIZE;
        const baseDelay = GeminiStreamProcessor.TEXT_BUFFER_MAX_DELAY_MS;
        const multiplier = GeminiStreamProcessor.ADAPTIVE_BUFFER_MULTIPLIER;
        const adaptiveMinSize = isHighVelocity ? Math.floor(baseSize * multiplier) : baseSize;
        const adaptiveMaxDelay = isHighVelocity ? Math.floor(baseDelay * multiplier) : baseDelay;
        const timeSinceLastFlush = Date.now() - this.textBufferLastFlush;
        const shouldFlush =
            this.textBuffer.length >= adaptiveMinSize || timeSinceLastFlush >= adaptiveMaxDelay;
        if (shouldFlush) {
            this.flushTextBuffer(progress, true);
        }
    }

    private flushThinkingBuffer(
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        if (this.thinkingBuffer.length > 0 && this.currentThinkingId) {
            this.enqueueThinking(this.thinkingBuffer, progress);
            this.thinkingBuffer = "";
        }
    }

    private flushThinkingBufferIfNeeded(
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        this.flushThinkingBuffer(progress);
    }

    private enqueueThinking(
        text: string,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        this.thinkingQueue += text;
        this.thinkingProgress = progress;
        this.markActivity();
        if (!this.thinkingFlushInterval) {
            this.thinkingFlushInterval = setInterval(
                () => this.flushThinkingChunk(),
                GeminiStreamProcessor.THINKING_FLUSH_INTERVAL_MS,
            );
        }
    }

    private flushThinkingChunk(): void {
        if (
            this.thinkingQueue.length === 0 ||
            !this.thinkingProgress ||
            !this.currentThinkingId
        ) {
            return;
        }
        const chunkSize = Math.min(
            GeminiStreamProcessor.THINKING_CHARS_PER_FLUSH,
            this.thinkingQueue.length,
        );
        const chunk = this.thinkingQueue.slice(0, chunkSize);
        this.thinkingQueue = this.thinkingQueue.slice(chunkSize);
        this.thinkingProgress.report(
            new vscode.LanguageModelThinkingPart(chunk, this.currentThinkingId),
        );
        this.markActivity();
    }

    private finalizeThinkingPart(
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
    ): void {
        if (this.thinkingFlushInterval) {
            clearInterval(this.thinkingFlushInterval);
            this.thinkingFlushInterval = null;
        }
        if (this.thinkingBuffer.length > 0) {
            this.thinkingQueue += this.thinkingBuffer;
            this.thinkingBuffer = "";
        }
        this.thinkingProgress = progress;
        while (this.thinkingQueue.length > 0) {
            const chunkSize = Math.min(
                GeminiStreamProcessor.THINKING_CHARS_PER_FLUSH * 2,
                this.thinkingQueue.length,
            );
            const chunk = this.thinkingQueue.slice(0, chunkSize);
            this.thinkingQueue = this.thinkingQueue.slice(chunkSize);
            if (this.currentThinkingId) {
                progress.report(
                    new vscode.LanguageModelThinkingPart(chunk, this.currentThinkingId),
                );
            }
        }
        if (this.currentThinkingId) {
            progress.report(
                new vscode.LanguageModelThinkingPart("", this.currentThinkingId),
            );
            this.currentThinkingId = null;
        }
    }

    private splitConcatenatedJSON(data: string): string[] {
        const results: string[] = [];
        let depth = 0;
        let start = -1;
        for (let i = 0; i < data.length; i++) {
            if (data[i] === "{") {
                if (depth === 0) {
                    start = i;
                }
                depth++;
            } else if (data[i] === "}") {
                depth--;
                if (depth === 0 && start !== -1) {
                    results.push(data.slice(start, i + 1));
                    start = -1;
                }
            }
        }
        return results;
    }

    private generateThinkingId(): string {
        return `thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
}
