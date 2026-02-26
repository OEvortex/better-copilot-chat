import * as vscode from "vscode";
import type { ModelConfig } from "../../types/sharedTypes";
import { ProcessStreamOptions } from "../common/commonTypes";
import { storeThoughtSignature, extractToolCallFromGeminiResponse } from "./handler";

export class AntigravityStreamProcessor {
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
	private thinkingProgress: vscode.Progress<vscode.LanguageModelResponsePart2> | null =
		null;
	private chunkCounter = 0;
	private lastChunkTime = 0;
	private streamVelocity = 0;
	private hasReceivedContent = false;
	private hasThinkingContent = false;

	// Function calls buffer to support XML-style <function_calls> blocks split across parts/chunks
	private functionCallsBuffer = "";

	// Activity tracking để giữ UI "sống" khi đang xử lý tool calls
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
	private static readonly ACTIVITY_REPORT_INTERVAL_MS = 400; // Giảm xuống để report thường xuyên hơn
	private static readonly TEXT_BUFFER_MIN_SIZE = 40;
	private static readonly TEXT_BUFFER_MAX_DELAY_MS = 25;
	private static readonly YIELD_EVERY_N_CHUNKS = 5;
	private static readonly HIGH_VELOCITY_THRESHOLD = 10;
	private static readonly ADAPTIVE_BUFFER_MULTIPLIER = 0.5;
	private static readonly TOOL_CALL_FLUSH_DELAY_MS = 50; // Delay nhỏ trước khi flush tool call

	async processStream(options: ProcessStreamOptions): Promise<void> {
		const { response, modelConfig, progress, token } = options;
		if (!response.body) {
			throw new Error("Antigravity response body is empty.");
		}
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		// Bắt đầu activity reporting để giữ UI "sống"
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
					this.streamVelocity =
						delta > 0 ? value.length / delta : this.streamVelocity;
				}
				this.lastChunkTime = now;
				buffer += decoder.decode(value, { stream: true });
				buffer = buffer.replace(/\r\n/g, "\n");
				buffer = this.processSSELines(buffer, modelConfig, progress);
				this.flushTextBufferAdaptive(progress);
				this.flushThinkingBufferIfNeeded(progress);

				// Flush pending tool calls với delay nhỏ để không block UI
				this.schedulePendingToolCallsFlush(progress);

				this.chunkCounter++;
				if (
					this.chunkCounter %
						AntigravityStreamProcessor.YIELD_EVERY_N_CHUNKS ===
					0
				) {
					await new Promise<void>((resolve) => setTimeout(resolve, 1));
				}
			}
		} finally {
			this.stopActivityReporting();
			this.processRemainingBuffer(buffer, modelConfig, progress);
			this.flushTextBuffer(progress, true);
			this.flushPendingToolCallsImmediate(progress); // Flush tất cả tool calls còn lại
			this.finalizeThinkingPart(progress);

			// Only add <think/> placeholder if thinking content was output but no content was output
			if (this.hasThinkingContent && !this.hasReceivedContent) {
				progress.report(new vscode.LanguageModelTextPart("<think/>"));
			}
		}
	}

	/**
	 * Bắt đầu report activity định kỳ để giữ UI hiển thị "Working..."
	 */
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

			// Nếu đã lâu không có activity, report một empty text để giữ stream "sống"
			if (
				timeSinceLastActivity >=
				AntigravityStreamProcessor.ACTIVITY_REPORT_INTERVAL_MS
			) {
				// Report empty thinking part nếu đang có thinking context
				// hoặc flush bất kỳ buffer nào có sẵn
				if (this.thinkingBuffer.length > 0) {
					this.flushThinkingBuffer(progress);
				} else if (this.textBuffer.length > 0) {
					this.flushTextBuffer(progress, true);
				}
				// Cập nhật thời gian activity
				this.lastActivityReportTime = now;
			}
		}, AntigravityStreamProcessor.ACTIVITY_REPORT_INTERVAL_MS / 2);
	}

	/**
	 * Dừng activity reporting
	 */
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

	/**
	 * Đánh dấu có activity để reset timer
	 */
	private markActivity(): void {
		this.lastActivityReportTime = Date.now();
	}

	/**
	 * Schedule flush pending tool calls với delay nhỏ
	 */
	private schedulePendingToolCallsFlush(
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
	): void {
		if (this.pendingToolCalls.length === 0 || this.toolCallFlushInterval) {
			return;
		}
		this.toolCallFlushInterval = setTimeout(() => {
			this.flushPendingToolCallsImmediate(progress);
			this.toolCallFlushInterval = null;
		}, AntigravityStreamProcessor.TOOL_CALL_FLUSH_DELAY_MS) as unknown as ReturnType<
			typeof setInterval
		>;
	}

	/**
	 * Flush tất cả pending tool calls ngay lập tức
	 */
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
		const createCallId = () =>
			`tool_call_${this.toolCallCounter++}_${Date.now()}`;
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
						this.handleStreamPayload(
							jsonStr,
							createCallId,
							modelConfig,
							progress,
						);
					} catch {
						/* Ignore JSON parse errors */
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
				const createCallId = () =>
					`tool_call_${this.toolCallCounter++}_${Date.now()}`;
				try {
					this.handleStreamPayload(
						eventData,
						createCallId,
						modelConfig,
						progress,
					);
				} catch {
					/* Ignore JSON parse errors */
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
		const candidates =
			(payload.candidates as Array<Record<string, unknown>>) || [];
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
		// Debug: Log all parts to see what we're receiving
		console.log("Antigravity: Received part:", JSON.stringify(part, null, 2));

		// Track for debugging
		const hasFunctionCall =
			part.functionCall !== undefined && part.functionCall !== null;
		const hasFunctionResponse =
			part.functionResponse !== undefined && part.functionResponse !== null;
		const hasText = typeof part.text === "string";
		const hasThought = part.thought === true;
		const hasThoughtSignature = typeof part.thoughtSignature === "string";
		const isGeminiThinkingPart =
			hasThoughtSignature &&
			typeof part.text === "string" &&
			!hasFunctionCall &&
			!hasFunctionResponse;
		console.log(
			`Antigravity: Part has functionCall=${hasFunctionCall}, text=${hasText}, thought=${hasThought}, thoughtSignature=${hasThoughtSignature}`,
		);

		// Render explicit thought parts and Gemini-style thoughtSignature text as VS Code thinking.
		if (part.thought === true || isGeminiThinkingPart) {
			if (
				modelConfig.outputThinking !== false &&
				typeof part.text === "string"
			) {
				if (!this.currentThinkingId) {
					this.currentThinkingId = createCallId();
				}
				// Debug: Log that we received a thought part
				console.log("Antigravity: Received thought part:", part.text);

				this.thinkingBuffer += part.text;
				this.hasThinkingContent = true;
				this.flushThinkingBufferIfNeeded(progress);
			}
			return;
		}
		if (typeof part.text === "string") {
			// Prepend any leftover function_calls fragment from previous parts
			const textToProcess = this.functionCallsBuffer + part.text;

			// Try to extract complete <function_calls>...</function_calls> blocks
			const funcCallsRegex = /<function_calls>[\s\S]*?<\/function_calls>/g;
			let lastIndex = 0;
			let match = funcCallsRegex.exec(textToProcess);
			while (match !== null) {
				// Process text before the function_calls block
				const before = textToProcess.slice(lastIndex, match.index);
				if (before.length > 0) {
					const processedText = this.processTextWithThinkingTags(
						before,
						modelConfig,
					);
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

				// Extract tool calls from the block
				const block = match[0];
				const toolCallRegex =
					/<tool_call\s+name="([^"]+)"\s+arguments='([^']*)'\s*\/>/g;
				let toolMatch = toolCallRegex.exec(block);
				// Flush buffers before reporting tool calls
				this.flushTextBuffer(progress, true);
				this.flushThinkingBuffer(progress);
				while (toolMatch !== null) {
					const name = toolMatch[1];
					const argsString = toolMatch[2] || "";
					let argsObj: Record<string, unknown> = {};
					try {
						argsObj = JSON.parse(argsString);
					} catch {
						// Fallback: wrap as value
						argsObj = { value: argsString };
					}
					const callId = createCallId();
					// Deduplicate
					const dedupeKey = `${callId}:${name}`;
					if (!this.seenToolCalls.has(dedupeKey)) {
						this.seenToolCalls.add(dedupeKey);
						// Queue the tool call so UI has a small pause to update
						this.pendingToolCalls.push({ callId, name, args: argsObj });
						this.hasReceivedContent = true;
						this.markActivity();
					}
					toolMatch = toolCallRegex.exec(block);
				}

				lastIndex = funcCallsRegex.lastIndex;
				match = funcCallsRegex.exec(textToProcess);
			}

			// Handle trailing text after last processed function_calls block
			const remaining = textToProcess.slice(lastIndex);

			// If there's an incomplete function_calls start tag at end, keep it in buffer
			const openStart = remaining.indexOf("<function_calls>");
			const closeEnd = remaining.indexOf("</function_calls>");
			if (openStart !== -1 && closeEnd === -1) {
				// Keep from the open tag onwards in buffer
				this.functionCallsBuffer = remaining.slice(openStart);
				const beforeOpen = remaining.slice(0, openStart);
				if (beforeOpen.length > 0) {
					const processedText = this.processTextWithThinkingTags(
						beforeOpen,
						modelConfig,
					);
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
				// No incomplete function_calls at end, clear buffer
				this.functionCallsBuffer = "";
				if (remaining.length > 0) {
					const processedText = this.processTextWithThinkingTags(
						remaining,
						modelConfig,
					);
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
			// Flush buffers trước khi xử lý tool call
			this.flushTextBuffer(progress, true);
			this.flushThinkingBuffer(progress);

			const toolCallInfo = extractToolCallFromGeminiResponse(part);
			if (toolCallInfo?.callId && toolCallInfo.name) {
				const dedupeKey = `${toolCallInfo.callId}:${toolCallInfo.name}`;
				if (this.seenToolCalls.has(dedupeKey)) {
					return;
				}
				this.seenToolCalls.add(dedupeKey);
				if (toolCallInfo.thoughtSignature) {
					storeThoughtSignature(
						toolCallInfo.callId,
						toolCallInfo.thoughtSignature,
					);
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

				// Queue tool call thay vì report ngay lập tức
				// Điều này cho phép UI có thời gian cập nhật "Working..."
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

	private processTextWithThinkingTags(
		text: string,
		modelConfig: ModelConfig,
	): string {
		if (modelConfig.outputThinking === false) {
			return text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "");
		}

		// Debug: Log input text
		if (text.includes("<thinking>") || text.includes("</thinking>")) {
			console.log("Antigravity: Found thinking tags in text:", text);
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
						console.log("Antigravity: Processing thinking content:", thinkingContent.substring(0, 100));
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
					console.log("Antigravity: Found <thinking> tag at index:", openIdx);
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
			(force ||
				this.textBuffer.length >=
					AntigravityStreamProcessor.TEXT_BUFFER_MIN_SIZE)
		) {
			progress.report(new vscode.LanguageModelTextPart(this.textBuffer));
			this.textBuffer = "";
			this.textBufferLastFlush = Date.now();
			this.markActivity(); // Đánh dấu activity khi flush
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
			this.textBuffer.length >=
				AntigravityStreamProcessor.TEXT_BUFFER_MIN_SIZE ||
			timeSinceLastFlush >= AntigravityStreamProcessor.TEXT_BUFFER_MAX_DELAY_MS;
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
		const isHighVelocity =
			this.streamVelocity > AntigravityStreamProcessor.HIGH_VELOCITY_THRESHOLD;
		const baseSize = AntigravityStreamProcessor.TEXT_BUFFER_MIN_SIZE;
		const baseDelay = AntigravityStreamProcessor.TEXT_BUFFER_MAX_DELAY_MS;
		const multiplier = AntigravityStreamProcessor.ADAPTIVE_BUFFER_MULTIPLIER;
		const adaptiveMinSize = isHighVelocity
			? Math.floor(baseSize * multiplier)
			: baseSize;
		const adaptiveMaxDelay = isHighVelocity
			? Math.floor(baseDelay * multiplier)
			: baseDelay;
		const timeSinceLastFlush = Date.now() - this.textBufferLastFlush;
		const shouldFlush =
			this.textBuffer.length >= adaptiveMinSize ||
			timeSinceLastFlush >= adaptiveMaxDelay;
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
		console.log("Antigravity: enqueueThinking called with text length:", text.length);
		this.thinkingQueue += text;
		this.thinkingProgress = progress;
		this.markActivity(); // Đánh dấu activity khi có thinking content
		if (!this.thinkingFlushInterval) {
			this.thinkingFlushInterval = setInterval(
				() => this.flushThinkingChunk(),
				AntigravityStreamProcessor.THINKING_FLUSH_INTERVAL_MS,
			);
		}
	}

	private flushThinkingChunk(): void {
		console.log("Antigravity: flushThinkingChunk called, queue length:", this.thinkingQueue.length, "thinkingId:", this.currentThinkingId);
		if (
			this.thinkingQueue.length === 0 ||
			!this.thinkingProgress ||
			!this.currentThinkingId
		) {
			console.log("Antigravity: flushThinkingChunk early return");
			return;
		}
		const chunkSize = Math.min(
			AntigravityStreamProcessor.THINKING_CHARS_PER_FLUSH,
			this.thinkingQueue.length,
		);
		const chunk = this.thinkingQueue.slice(0, chunkSize);
		this.thinkingQueue = this.thinkingQueue.slice(chunkSize);
		console.log("Antigravity: Reporting thinking chunk:", chunk.substring(0, 50));
		this.thinkingProgress.report(
			new vscode.LanguageModelThinkingPart(chunk, this.currentThinkingId),
		);
		this.markActivity(); // Đánh dấu activity khi flush thinking
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
				AntigravityStreamProcessor.THINKING_CHARS_PER_FLUSH * 2,
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
