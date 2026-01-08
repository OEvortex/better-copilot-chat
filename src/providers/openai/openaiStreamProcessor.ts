/*---------------------------------------------------------------------------------------------
 *  OpenAI Stream Processor
 *  Handles both OpenAI format and Antigravity (Gemini) format SSE stream processing.
 *  Based on gcli2api's convert_antigravity_stream_to_openai implementation.
 *  
 *  This processor can handle:
 *  1. OpenAI format SSE (from OpenAI-compatible APIs)
 *  2. Antigravity/Gemini format SSE (from Antigravity API, converted to VS Code format)
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ModelConfig } from '../../types/sharedTypes';
import {
    GeminiResponse,
    OpenAIStreamChunk,
    OpenAIToolCallDelta,
    ProcessStreamOptions
} from './openaiTypes';

export class OpenAIStreamProcessor {
    private textBuffer = '';
    private lastTextFlushTime = 0;
    private thinkingBuffer = '';
    private currentThinkingId: string | null = null;
    private toolCallsInProgress = new Map<number, { id: string; name: string; args: string }>();
    private seenToolCalls = new Set<string>();
    private toolCallCounter = 0;

    // Claude <thinking></thinking> tag detection state
    private isInsideThinkingTag = false;
    private thinkingTagBuffer = '';

    // Buffer batching thresholds for chunked rendering
    private static readonly TEXT_BUFFER_WORD_THRESHOLD = 20;
    private static readonly TEXT_BUFFER_CHAR_THRESHOLD = 160;
    private static readonly TEXT_BUFFER_MAX_DELAY_MS = 200;
    private static readonly THINKING_BUFFER_THRESHOLD = 0; // Flush thinking immediately - no buffering

    private readonly CLOSING_TAG = '</thinking>';
    private readonly CLOSING_TAG_LEN = this.CLOSING_TAG.length;

    // Activity indicator
    private lastActivityReportTime = 0;
    private static readonly ACTIVITY_REPORT_INTERVAL_MS = 200; // Fast heartbeat to keep "Working..." visible

    // Tool call progress indicator
    private toolCallProgressReported = new Set<number>();
    private lastToolCallProgressTime = 0;
    private static readonly TOOL_CALL_PROGRESS_INTERVAL_MS = 300; // Report tool call progress frequently
    
    // Track if we've sent any real content (for debugging)
    private hasReportedContent = false;
    // Stop reading the stream after reporting a Gemini tool call to avoid deadlocks
    private shouldStopAfterToolCall = false;

    /**
     * Process the SSE stream from a successful OpenAI format response
     */
    async processStream(options: ProcessStreamOptions): Promise<void> {
        const { response, modelConfig, progress, token } = options;

        if (!response.body) {
            throw new Error('OpenAI response body is empty.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let chunkCount = 0;

        // Start activity indicator interval to keep UI responsive while waiting for data
        // This is CRITICAL because server may take a long time to generate tool call arguments
        // Without this, the "Working..." indicator disappears during long waits
        const activityInterval = setInterval(() => {
            if (!token.isCancellationRequested) {
                progress.report(new vscode.LanguageModelTextPart(''));
            }
        }, OpenAIStreamProcessor.ACTIVITY_REPORT_INTERVAL_MS);

        try {
            while (true) {
                if (token.isCancellationRequested) {
                    throw new vscode.CancellationError();
                }

                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                chunkCount++;
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                buffer = buffer.replace(/\r\n/g, '\n');

                // Process complete SSE lines
                buffer = this.processSSELines(buffer, modelConfig, progress);

                // If a Gemini tool call was reported, stop the stream to allow tool execution
                if (this.shouldStopAfterToolCall) {
                    await reader.cancel();
                    break;
                }

                // Yield control to allow UI to render - CRITICAL for smooth streaming
                // Without this, multiple chunks may be processed before UI updates
                await new Promise(resolve => setImmediate(resolve));

                // Buffers are already flushed in processOpenAIChunk for realtime streaming
                // No need to flush again here - avoid double flush
            }
        } finally {
            // Stop activity indicator interval
            clearInterval(activityInterval);
            
            // Process any remaining buffer
            this.processRemainingBuffer(buffer, modelConfig, progress);
            // Ensure no trailing text is stuck in thinkingTagBuffer when stream ends
            this.flushPendingThinkingTagBuffer();
            this.flushTextBuffer(progress);
            this.finalizeThinkingPart(progress);
            this.finalizeToolCalls(progress);
        }
    }

    /**
     * Process SSE lines from buffer
     */
    private processSSELines(
        buffer: string,
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>
    ): string {
        let lineEndIndex = buffer.indexOf('\n');

        while (lineEndIndex !== -1) {
            const rawLine = buffer.slice(0, lineEndIndex);
            buffer = buffer.slice(lineEndIndex + 1);
            const line = rawLine.trimEnd();

            // Skip empty lines
            if (line.length === 0) {
                lineEndIndex = buffer.indexOf('\n');
                continue;
            }

            // Process data: lines
            if (line.startsWith('data:')) {
                const dataLine = line.slice(5).trim();

                // Skip [DONE] marker
                if (dataLine === '[DONE]') {
                    lineEndIndex = buffer.indexOf('\n');
                    continue;
                }

                if (dataLine.length > 0) {
                    this.processOpenAIChunk(dataLine, modelConfig, progress);
                }
            }

            lineEndIndex = buffer.indexOf('\n');
        }

        return buffer;
    }

    /**
     * Process a single chunk - auto-detects OpenAI or Gemini format
     */
    private processOpenAIChunk(
        data: string,
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>
    ): void {
        try {
            const parsed = JSON.parse(data);

            // Detect format: OpenAI has 'choices', Gemini/Antigravity has 'response' or 'candidates'
            if (parsed.choices) {
                // OpenAI format
                this.processOpenAIFormat(parsed as OpenAIStreamChunk, modelConfig, progress);
            } else if (parsed.response || parsed.candidates) {
                // Gemini/Antigravity format
                this.processGeminiFormat(parsed as GeminiResponse, modelConfig, progress);
            }
            
            // Flush text in chunks to avoid tiny progressive renders
            this.flushTextBufferIfNeeded(progress);
            this.flushThinkingBuffer(progress);
        } catch (error) {
            // Ignore parse errors
        }
    }

    /**
     * Process OpenAI format chunk
     */
    private processOpenAIFormat(
        chunk: OpenAIStreamChunk,
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>
    ): void {
        for (const choice of chunk.choices || []) {
            const delta = choice.delta;

            // Handle text content
            if (delta.content !== undefined && delta.content !== null) {
                this.handleTextContent(delta.content, modelConfig, progress);
            }

            // Handle tool calls
            if (delta.tool_calls && delta.tool_calls.length > 0) {
                for (const toolCallDelta of delta.tool_calls) {
                    this.handleToolCallDelta(toolCallDelta, progress);
                }
            }

            // Handle finish reason
            if (choice.finish_reason === 'tool_calls') {
                // CRITICAL: Flush all buffers before finalizing tool calls
                if (this.thinkingTagBuffer.length > 0) {
                    this.textBuffer += this.thinkingTagBuffer;
                    this.thinkingTagBuffer = '';
                }
                this.flushTextBuffer(progress);
                this.flushThinkingBuffer(progress);
                
                this.finalizeToolCalls(progress);
            }
        }
    }

    /**
     * Process Gemini/Antigravity format chunk (like gcli2api's convert_antigravity_stream_to_openai)
     */
    private processGeminiFormat(
        data: GeminiResponse,
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>
    ): void {
        // Extract candidates from response or directly
        const response = data.response || data;
        const candidates = response.candidates || [];

        for (const candidate of candidates) {
            const parts = candidate.content?.parts || [];
            
            // Log what parts we received for debugging
            const partTypes = parts.map(p => {
                if (p.thought) {return 'thought';}
                if (p.text !== undefined) {return 'text';}
                if (p.functionCall) {return 'functionCall';}
                if (p.inlineData) {return 'inlineData';}
                return 'unknown';
            });

            for (const part of parts) {
                // Handle Gemini native thought flag
                if (part.thought === true) {
                    if (modelConfig.outputThinking !== false && part.text) {
                        if (!this.currentThinkingId) {
                            this.currentThinkingId = this.generateThinkingId();
                        }
                        this.thinkingBuffer += part.text;
                        this.flushThinkingBuffer(progress);
                    }
                    continue;
                }

                // Handle text content - IMMEDIATELY flush to UI for realtime streaming
                if (part.text !== undefined) {
                    this.processTextWithThinkingTags(part.text, modelConfig, progress);
                    
                    // Force immediate flush - no buffering for realtime feel
                    this.flushTextBuffer(progress);
                    this.flushThinkingBuffer(progress);
                }

                // Handle function calls (tool calls)
                if (part.functionCall) {
                    // CRITICAL: Flush all buffers before handling tool calls
                    // This ensures no text is held back in thinkingTagBuffer
                    this.flushThinkingTagBufferForToolCall();
                    this.flushTextBuffer(progress);
                    this.flushThinkingBuffer(progress);
                    
                    this.handleGeminiFunctionCall(part.functionCall, progress);
                }

                // Handle inline data (images)
                if (part.inlineData) {
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    const base64Data = part.inlineData.data || '';
                    const imageMarkdown = `\n\n![Generated Image](data:${mimeType};base64,${base64Data})\n\n`;
                    this.textBuffer += imageMarkdown;
                    this.flushTextBuffer(progress);
                }
            }

            // Check finish reason
            if (candidate.finishReason) {
                // CRITICAL: Flush all buffers before finalizing
                if (this.thinkingTagBuffer.length > 0) {
                    this.textBuffer += this.thinkingTagBuffer;
                    this.thinkingTagBuffer = '';
                }
                this.flushTextBuffer(progress);
                this.flushThinkingBuffer(progress);
                
                this.finalizeToolCalls(progress);
            }
        }
    }

    /**
     * Handle Gemini function call (convert to VS Code tool call)
     */
    private handleGeminiFunctionCall(
        functionCall: { id?: string; name?: string; args?: Record<string, unknown> },
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>
    ): void {
        const callId = functionCall.id || `tool_call_${this.toolCallCounter++}_${Date.now()}`;
        const name = functionCall.name || '';
        
        if (!name) {
            return;
        }

        const dedupeKey = `${callId}:${name}`;
        if (this.seenToolCalls.has(dedupeKey)) {
            return;
        }
        this.seenToolCalls.add(dedupeKey);

        // CRITICAL: Flush any pending thinkingTagBuffer before tool calls
        this.flushThinkingTagBufferForToolCall();

        // Flush buffers before reporting tool call to ensure UI stays responsive
        this.flushTextBuffer(progress);
        this.flushThinkingBuffer(progress);

        // Remove null values from args
        const args = this.removeNullsFromArgs(functionCall.args || {});

        try {
            const toolCallPart = new vscode.LanguageModelToolCallPart(callId, name, args);
            progress.report(toolCallPart);
            
            // Report activity after tool call to keep UI responsive
            this.lastActivityReportTime = Date.now();
            this.shouldStopAfterToolCall = true;
        } catch (error) {
            // Ignore error
        }
    }

    /**
     * Handle text content from delta - IMMEDIATELY flush to UI
     */
    private handleTextContent(
        content: string,
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>
    ): void {
        // Check for <think>...</think> wrapper (gcli2api format)
        const thinkMatch = content.match(/^<think>\n?([\s\S]*?)\n?<\/think>\n?/);
        if (thinkMatch) {
            // Extract thinking content
            const thinkingContent = thinkMatch[1];
            if (thinkingContent && modelConfig.outputThinking !== false) {
                if (!this.currentThinkingId) {
                    this.currentThinkingId = this.generateThinkingId();
                }
                this.thinkingBuffer += thinkingContent;
                this.flushThinkingBuffer(progress);
            }
            // Get remaining content after thinking block
            const remainingContent = content.slice(thinkMatch[0].length);
            if (remainingContent) {
                this.processTextWithThinkingTags(remainingContent, modelConfig, progress);
                // Force immediate flush
                this.flushTextBuffer(progress);
            }
            return;
        }

        // Process text with Claude <thinking></thinking> tag detection
        this.processTextWithThinkingTags(content, modelConfig, progress);
        // Force immediate flush after processing
        this.flushTextBuffer(progress);
    }

    /**
     * Process text content with Claude <thinking></thinking> tag detection
     */
    private processTextWithThinkingTags(
        text: string,
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>
    ): void {
        if (modelConfig.outputThinking === false) {
            // If thinking output is disabled, strip thinking tags entirely
            const stripped = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
            if (stripped.length > 0) {
                this.textBuffer += stripped;
            }
            return;
        }

        let i = 0;

        while (i < text.length) {
            if (this.isInsideThinkingTag) {
                // We're inside a thinking block
                this.thinkingTagBuffer += text[i];

                // Check if we have a complete </thinking> tag
                if (this.thinkingTagBuffer.endsWith(this.CLOSING_TAG)) {
                    // Extract thinking content (remove the </thinking> tag)
                    const thinkingContent = this.thinkingTagBuffer.slice(0, -this.CLOSING_TAG_LEN);
                    if (thinkingContent.length > 0) {
                        if (!this.currentThinkingId) {
                            this.currentThinkingId = this.generateThinkingId();
                        }
                        this.thinkingBuffer += thinkingContent;
                        this.flushThinkingBuffer(progress);
                    }

                    // End thinking mode
                    this.isInsideThinkingTag = false;
                    this.thinkingTagBuffer = '';
                } else if (this.thinkingTagBuffer.length > this.CLOSING_TAG_LEN) {
                    // Stream content that's definitely not part of the closing tag
                    const safeLength = this.thinkingTagBuffer.length - this.CLOSING_TAG_LEN;
                    const toStream = this.thinkingTagBuffer.slice(0, safeLength);
                    this.thinkingTagBuffer = this.thinkingTagBuffer.slice(safeLength);

                    if (toStream.length > 0) {
                        if (!this.currentThinkingId) {
                            this.currentThinkingId = this.generateThinkingId();
                        }
                        this.thinkingBuffer += toStream;
                    }
                }
                i++;
            } else {
                // We're outside thinking block, look for <thinking>
                this.thinkingTagBuffer += text[i];

                // Keep only the last 10 chars to detect <thinking>
                if (this.thinkingTagBuffer.length > 10) {
                    const overflow = this.thinkingTagBuffer.slice(0, -10);
                    this.textBuffer += overflow;
                    this.thinkingTagBuffer = this.thinkingTagBuffer.slice(-10);
                }

                // Check if we have a complete <thinking> tag
                if (this.thinkingTagBuffer.endsWith('<thinking>')) {
                    // Output any text before the tag (minus the tag itself)
                    const beforeTag = this.thinkingTagBuffer.slice(0, -'<thinking>'.length);
                    if (beforeTag.length > 0) {
                        this.textBuffer += beforeTag;
                    }

                    // Enter thinking mode
                    this.isInsideThinkingTag = true;
                    this.thinkingTagBuffer = '';

                    // Initialize thinking ID if needed
                    if (!this.currentThinkingId) {
                        this.currentThinkingId = this.generateThinkingId();
                    }
                }
                i++;
            }
        }

        // CRITICAL FIX: Always flush thinkingTagBuffer to textBuffer after processing
        // This ensures no characters are held back before tool calls
        if (!this.isInsideThinkingTag && this.thinkingTagBuffer.length > 0) {
            // Only flush if buffer doesn't look like it could be start of <thinking> tag
            // Check if buffer could be partial match for "<thinking>" (e.g., "<", "<t", "<th", etc.)
            const possibleTagStart = '<thinking>'.startsWith(this.thinkingTagBuffer);
            
            if (!possibleTagStart) {
                // Not a potential tag start - flush everything
                this.textBuffer += this.thinkingTagBuffer;
                this.thinkingTagBuffer = '';
            } else if (this.thinkingTagBuffer.length > 0 && this.thinkingTagBuffer.length < 10) {
                // Could be partial tag, but we need to be more aggressive about flushing
                // to prevent characters being held back before tool calls.
                // Only keep buffer if it's exactly matching the start of "<thinking>"
                const tagPrefix = '<thinking>'.slice(0, this.thinkingTagBuffer.length);
                if (this.thinkingTagBuffer !== tagPrefix) {
                    // Not an exact match - flush it
                    this.textBuffer += this.thinkingTagBuffer;
                    this.thinkingTagBuffer = '';
                }
            }
        }
    }

    /**
     * Handle tool call delta from OpenAI stream
     */
    private handleToolCallDelta(
        toolCallDelta: OpenAIToolCallDelta,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>
    ): void {
        const index = toolCallDelta.index;

        // Get or create tool call in progress
        let toolCall = this.toolCallsInProgress.get(index);
        if (!toolCall) {
            // CRITICAL: Flush any pending thinkingTagBuffer before tool calls
            this.flushThinkingTagBufferForToolCall();
            
            // Flush buffers when starting a new tool call to keep UI responsive
            this.flushTextBuffer(progress);
            this.flushThinkingBuffer(progress);
            
            toolCall = {
                id: toolCallDelta.id || `tool_call_${this.toolCallCounter++}_${Date.now()}`,
                name: '',
                args: ''
            };
            this.toolCallsInProgress.set(index, toolCall);
        }

        // Update tool call with delta
        if (toolCallDelta.id) {
            toolCall.id = toolCallDelta.id;
        }
        if (toolCallDelta.function?.name) {
            toolCall.name = toolCallDelta.function.name;
            
            // Report tool call progress immediately when we have the name
            if (!this.toolCallProgressReported.has(index)) {
                this.toolCallProgressReported.add(index);
                this.reportToolCallProgress(toolCall.name, progress);
            }
        }
        if (toolCallDelta.function?.arguments) {
            toolCall.args += toolCallDelta.function.arguments;
            
            // Report progress periodically while accumulating arguments
            this.reportToolCallArgumentsProgress(toolCall.name, toolCall.args.length, progress);
        }

        // Report activity to keep UI responsive
        this.reportActivity(progress);
    }

    /**
     * Report tool call progress to UI - shows that a tool is being prepared
     */
    private reportToolCallProgress(
        toolName: string,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>
    ): void {
        // Send a thinking indicator to show tool call is being prepared
        const thinkingId = `tool_prep_${Date.now()}`;
        const message = `\nPreparing tool: ${toolName}...\n`; 
        progress.report(new vscode.LanguageModelThinkingPart(message, thinkingId));
    }

    /**
     * Report tool call arguments accumulation progress
     */
    private reportToolCallArgumentsProgress(
        toolName: string,
        argsLength: number,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>
    ): void {
        const now = Date.now();
        if (now - this.lastToolCallProgressTime >= OpenAIStreamProcessor.TOOL_CALL_PROGRESS_INTERVAL_MS) {
            this.lastToolCallProgressTime = now;
            // Send empty text to keep connection alive and UI responsive
            progress.report(new vscode.LanguageModelTextPart(''));
        }
    }

    /**
     * Finalize and report all tool calls
     */
    private finalizeToolCalls(
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>
    ): void {
        // CRITICAL: Flush any pending thinkingTagBuffer before tool calls
        // This ensures no characters are held back
        this.flushThinkingTagBufferForToolCall();
        
        // Flush text buffer first
        this.flushTextBuffer(progress);
        this.flushThinkingBuffer(progress);

        for (const [, toolCall] of this.toolCallsInProgress) {
            if (!toolCall.name) {
                continue;
            }

            const dedupeKey = `${toolCall.id}:${toolCall.name}`;
            if (this.seenToolCalls.has(dedupeKey)) {
                continue;
            }
            this.seenToolCalls.add(dedupeKey);

            // Parse arguments
            let args: Record<string, unknown> = {};
            if (toolCall.args) {
                try {
                    args = JSON.parse(toolCall.args);
                } catch {
                    args = { value: toolCall.args };
                }
            }

            // Remove null values from args (like gcli2api does)
            args = this.removeNullsFromArgs(args);

            try {
                const toolCallPart = new vscode.LanguageModelToolCallPart(toolCall.id, toolCall.name, args);
                progress.report(toolCallPart);
            } catch (error) {
                // Ignore error
            }
        }

        this.toolCallsInProgress.clear();
        this.toolCallProgressReported.clear();
    }

    /**
     * Remove null values from args recursively (like gcli2api's _remove_nulls_for_tool_input)
     */
    private removeNullsFromArgs(value: unknown): Record<string, unknown> {
        if (value === null || value === undefined) {
            return {};
        }

        if (typeof value !== 'object') {
            return { value };
        }

        if (Array.isArray(value)) {
            return { items: value.filter(item => item !== null && item !== undefined) };
        }

        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            if (val === null || val === undefined) {
                continue;
            }
            if (typeof val === 'object' && !Array.isArray(val)) {
                result[key] = this.removeNullsFromArgs(val);
            } else if (Array.isArray(val)) {
                result[key] = val.filter(item => item !== null && item !== undefined);
            } else {
                result[key] = val;
            }
        }
        return result;
    }

    /**
     * Process remaining buffer at end of stream
     */
    private processRemainingBuffer(
        buffer: string,
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>
    ): void {
        const trailing = buffer.trim();
        if (trailing.length > 0 && trailing.startsWith('data:')) {
            const dataLine = trailing.slice(5).trim();
            if (dataLine && dataLine !== '[DONE]') {
                this.processOpenAIChunk(dataLine, modelConfig, progress);
            }
        }
    }

    /**
     * Flush text buffer to progress - IMMEDIATELY reports text to UI
     * Uses fake streaming for large chunks to improve perceived responsiveness
     */
    private flushTextBuffer(progress: vscode.Progress<vscode.LanguageModelResponsePart2>): void {
        if (this.textBuffer.length === 0) {
            return;
        }

        const textToReport = this.textBuffer;
        this.textBuffer = '';
        this.lastTextFlushTime = Date.now();

        try {
            progress.report(new vscode.LanguageModelTextPart(textToReport));
        } catch (error) {
            // Ignore error
        }
    }

    /**
     * Fake stream text gradually to improve UX when server buffers
     */
    private async fakeStreamText(
        text: string,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
        chunkSize: number = 30,
        delayMs: number = 8
    ): Promise<void> {
        for (let i = 0; i < text.length; i += chunkSize) {
            const chunk = text.slice(i, i + chunkSize);
            progress.report(new vscode.LanguageModelTextPart(chunk));
            
            // Small delay to simulate streaming
            if (i + chunkSize < text.length) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    /**
     * Flush text buffer only if it exceeds threshold (for batching)
     */
    private flushTextBufferIfNeeded(progress: vscode.Progress<vscode.LanguageModelResponsePart2>): void {
        if (this.textBuffer.length === 0) {
            return;
        }

        const wordCount = this.countWords(this.textBuffer);
        const now = Date.now();
        const timeSinceFlush = now - this.lastTextFlushTime;

        if (
            wordCount >= OpenAIStreamProcessor.TEXT_BUFFER_WORD_THRESHOLD ||
            this.textBuffer.length >= OpenAIStreamProcessor.TEXT_BUFFER_CHAR_THRESHOLD ||
            timeSinceFlush >= OpenAIStreamProcessor.TEXT_BUFFER_MAX_DELAY_MS
        ) {
            this.flushTextBuffer(progress);
        }
    }

    private countWords(text: string): number {
        const matches = text.trim().match(/\S+/g);
        return matches ? matches.length : 0;
    }

    /**
     * Flush thinking buffer to progress - IMMEDIATELY reports thinking to UI
     */
    private flushThinkingBuffer(progress: vscode.Progress<vscode.LanguageModelResponsePart2>): void {
        if (this.thinkingBuffer.length > 0 && this.currentThinkingId) {
            const thinkingToReport = this.thinkingBuffer;
            this.thinkingBuffer = '';
            
            progress.report(new vscode.LanguageModelThinkingPart(thinkingToReport, this.currentThinkingId));
        }
    }

    /**
     * Flush thinking buffer only if it exceeds threshold (for batching)
     */
    private flushThinkingBufferIfNeeded(progress: vscode.Progress<vscode.LanguageModelResponsePart2>): void {
        if (this.thinkingBuffer.length >= OpenAIStreamProcessor.THINKING_BUFFER_THRESHOLD) {
            this.flushThinkingBuffer(progress);
        }
    }

    /**
     * Finalize thinking part
     */
    private finalizeThinkingPart(progress: vscode.Progress<vscode.LanguageModelResponsePart2>): void {
        if (this.thinkingBuffer.length > 0) {
            this.flushThinkingBuffer(progress);
        }
        if (this.currentThinkingId) {
            progress.report(new vscode.LanguageModelThinkingPart('', this.currentThinkingId));
            this.currentThinkingId = null;
        }
    }

    /**
     * Report activity to keep UI responsive
     */
    private reportActivity(progress: vscode.Progress<vscode.LanguageModelResponsePart2>): void {
        const now = Date.now();
        if (now - this.lastActivityReportTime >= OpenAIStreamProcessor.ACTIVITY_REPORT_INTERVAL_MS) {
            progress.report(new vscode.LanguageModelTextPart(''));
            this.lastActivityReportTime = now;
        }
    }

    /**
     * Generate unique thinking ID
     */
    private generateThinkingId(): string {
        return `thinking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    /**
     * Flush any leftover thinking tag buffer at stream end
     */
    private flushPendingThinkingTagBuffer(): void {
        if (this.thinkingTagBuffer.length === 0) {
            return;
        }

        if (this.isInsideThinkingTag) {
            // Stream ended mid-thinking tag; treat leftover as thinking content
            if (!this.currentThinkingId) {
                this.currentThinkingId = this.generateThinkingId();
            }
            this.thinkingBuffer += this.thinkingTagBuffer;
        } else {
            // Stream ended outside thinking; treat leftover as normal text
            this.textBuffer += this.thinkingTagBuffer;
        }

        this.thinkingTagBuffer = '';
    }

    /**
     * Flush thinking tag buffer before tool calls to avoid truncation.
     * Tool calls indicate the stream is switching modes, so keep any pending text.
     */
    private flushThinkingTagBufferForToolCall(): void {
        if (this.thinkingTagBuffer.length === 0) {
            return;
        }

        // Treat any pending tag buffer as text to avoid losing characters
        this.textBuffer += this.thinkingTagBuffer;
        this.thinkingTagBuffer = '';
        this.isInsideThinkingTag = false;
    }
}
