import * as vscode from "vscode";
import type { ModelConfig } from "../../types/sharedTypes";
import { ProcessStreamOptions } from "../common/commonTypes";
import {
	cacheSignature,
	storeToolCallSignature,
	FALLBACK_SIGNATURE,
} from "./signatureCache";

export interface TransformContext {
	sessionId: string;
	modelConfig: ModelConfig;
	progress: vscode.Progress<vscode.LanguageModelResponsePart2>;
}

export interface ExtractedToolCall {
	callId: string;
	name: string;
	args: Record<string, unknown>;
	thoughtSignature?: string;
}

export function extractToolCallFromPart(
	part: Record<string, unknown>,
): ExtractedToolCall | null {
	const functionCall = part.functionCall as
		| { name?: string; args?: unknown; id?: string }
		| undefined;
	if (!functionCall?.name) {
		return null;
	}
	return {
		callId:
			functionCall.id ||
			`call_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
		name: functionCall.name,
		args:
			functionCall.args && typeof functionCall.args === "object"
				? (functionCall.args as Record<string, unknown>)
				: {},
		thoughtSignature: part.thoughtSignature as string | undefined,
	};
}

export function transformSseLine(
	data: string,
	sessionId: string,
	onText: (text: string) => void,
	onThinking: (text: string) => void,
	onToolCall: (toolCall: ExtractedToolCall) => void,
): void {
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(data);
	} catch {
		return;
	}
	const payload = (parsed.response as Record<string, unknown>) || parsed;
	const candidates =
		(payload.candidates as Array<Record<string, unknown>>) || [];

	for (const candidate of candidates) {
		const content = candidate.content as
			| { parts?: Array<Record<string, unknown>> }
			| undefined;
		for (const part of content?.parts || []) {
			if (part.thought === true) {
				if (typeof part.text === "string" && part.text.length > 0) {
					onThinking(part.text);
					if (part.thoughtSignature) {
						cacheSignature(
							sessionId,
							part.text,
							part.thoughtSignature as string,
						);
					}
				}
				continue;
			}
			if (typeof part.text === "string" && part.text.length > 0) {
				onText(part.text);
			}
			const toolCall = extractToolCallFromPart(part);
			if (toolCall) {
				if (toolCall.thoughtSignature) {
					storeToolCallSignature(toolCall.callId, toolCall.thoughtSignature);
				} else {
					storeToolCallSignature(toolCall.callId, FALLBACK_SIGNATURE);
				}
				onToolCall(toolCall);
			}
		}
	}
}

export class StreamingTransformer {
	private textBuffer = "";
	private textBufferLastFlush = 0;
	private thinkingBuffer = "";
	private currentThinkingId: string | null = null;
	private seenToolCalls = new Set<string>();
	private toolCallCounter = 0;
	private isInsideThinkingTag = false;
	private thinkingTagBuffer = "";
	private sseDataParts: string[] = [];
	private thinkingQueue = "";
	private thinkingFlushInterval: ReturnType<typeof setInterval> | null = null;
	private chunkCounter = 0;
	private lastChunkTime = 0;
	private streamVelocity = 0;
	private lastActivityReportTime = 0;
	private activityReportInterval: ReturnType<typeof setInterval> | null = null;
	private pendingToolCalls: ExtractedToolCall[] = [];
	private toolCallFlushInterval: ReturnType<typeof setInterval> | null = null;
	private sessionId = "";
	private readonly CLOSING_TAG = "</thinking>";

	private static readonly THINKING_FLUSH_INTERVAL_MS = 80;
	private static readonly THINKING_CHARS_PER_FLUSH = 150;
	private static readonly ACTIVITY_REPORT_INTERVAL_MS = 400;
	private static readonly TEXT_BUFFER_MIN_SIZE = 40;
	private static readonly TEXT_BUFFER_MAX_DELAY_MS = 25;
	private static readonly YIELD_EVERY_N_CHUNKS = 5;
	private static readonly HIGH_VELOCITY_THRESHOLD = 10;
	private static readonly ADAPTIVE_BUFFER_MULTIPLIER = 0.5;
	private static readonly TOOL_CALL_FLUSH_DELAY_MS = 50;

	async processStream(
		options: ProcessStreamOptions & { sessionId?: string },
	): Promise<void> {
		const { response, modelConfig, progress, token, sessionId } = options;
		this.sessionId = sessionId || "";

		if (!response.body) {
			throw new Error("Antigravity response body is empty.");
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
					this.streamVelocity =
						delta > 0 ? value.length / delta : this.streamVelocity;
				}
				this.lastChunkTime = now;
				buffer += decoder.decode(value, { stream: true });
				buffer = buffer.replace(/\r\n/g, "\n");
				buffer = this.processSSELines(buffer, modelConfig, progress);
				this.flushTextBufferAdaptive(progress);
				this.flushThinkingBufferIfNeeded(progress);
				this.schedulePendingToolCallsFlush(progress);
				this.chunkCounter++;
				if (
					this.chunkCounter % StreamingTransformer.YIELD_EVERY_N_CHUNKS ===
					0
				) {
					await new Promise<void>((resolve) => setTimeout(resolve, 1));
				}
			}
		} finally {
			this.stopActivityReporting();
			this.processRemainingBuffer(buffer, modelConfig, progress);
			this.flushTextBuffer(progress, true);
			this.flushPendingToolCallsImmediate(progress);
			this.finalizeThinkingPart(progress);
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
			if (
				timeSinceLastActivity >=
				StreamingTransformer.ACTIVITY_REPORT_INTERVAL_MS
			) {
				if (this.thinkingBuffer.length > 0) {
					this.flushThinkingBuffer(progress);
				} else if (this.textBuffer.length > 0) {
					this.flushTextBuffer(progress, true);
				}
				this.lastActivityReportTime = now;
			}
		}, StreamingTransformer.ACTIVITY_REPORT_INTERVAL_MS / 2);
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
		}, StreamingTransformer.TOOL_CALL_FLUSH_DELAY_MS) as unknown as ReturnType<
			typeof setInterval
		>;
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
						// Ignore
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
					// Ignore
				}
			}
		}
	}

	private handleStreamPayload(
		data: string,
		_createCallId: () => string,
		modelConfig: ModelConfig,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
	): void {
		transformSseLine(
			data,
			this.sessionId,
			(text) => {
				const processedText = this.processTextWithThinkingTags(
					text,
					modelConfig,
				);
				if (this.isInsideThinkingTag) {
					this.flushThinkingBufferIfNeeded(progress);
				} else {
					this.finalizeThinkingPart(progress);
					if (processedText.length > 0) {
						this.textBuffer += processedText;
						this.flushTextBufferIfNeeded(progress);
					}
				}
			},
			(thinkingText) => {
				if (modelConfig.outputThinking !== false) {
					if (!this.currentThinkingId) {
						this.currentThinkingId = this.generateThinkingId();
					}
					this.thinkingBuffer += thinkingText;
					this.flushThinkingBufferIfNeeded(progress);
				}
			},
			(toolCall) => {
				this.flushTextBuffer(progress, true);
				this.flushThinkingBuffer(progress);
				const dedupeKey = `${toolCall.callId}:${toolCall.name}`;
				if (this.seenToolCalls.has(dedupeKey)) {
					return;
				}
				this.seenToolCalls.add(dedupeKey);
				this.pendingToolCalls.push(toolCall);
				this.markActivity();
			},
		);
	}

	private processTextWithThinkingTags(
		text: string,
		modelConfig: ModelConfig,
	): string {
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
			(force ||
				this.textBuffer.length >= StreamingTransformer.TEXT_BUFFER_MIN_SIZE)
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
			this.textBuffer.length >= StreamingTransformer.TEXT_BUFFER_MIN_SIZE ||
			timeSinceLastFlush >= StreamingTransformer.TEXT_BUFFER_MAX_DELAY_MS;
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
			this.streamVelocity > StreamingTransformer.HIGH_VELOCITY_THRESHOLD;
		const baseSize = StreamingTransformer.TEXT_BUFFER_MIN_SIZE;
		const baseDelay = StreamingTransformer.TEXT_BUFFER_MAX_DELAY_MS;
		const multiplier = StreamingTransformer.ADAPTIVE_BUFFER_MULTIPLIER;
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
		this.thinkingQueue += text;
		this.markActivity();
		if (!this.thinkingFlushInterval) {
			this.thinkingFlushInterval = setInterval(
				() => this.flushThinkingChunk(progress),
				StreamingTransformer.THINKING_FLUSH_INTERVAL_MS,
			);
		}
	}

	private flushThinkingChunk(
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
	): void {
		if (this.thinkingQueue.length === 0 || !this.currentThinkingId) {
			return;
		}
		const chunkSize = Math.min(
			StreamingTransformer.THINKING_CHARS_PER_FLUSH,
			this.thinkingQueue.length,
		);
		const chunk = this.thinkingQueue.slice(0, chunkSize);
		this.thinkingQueue = this.thinkingQueue.slice(chunkSize);
		progress.report(
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
		while (this.thinkingQueue.length > 0) {
			const chunkSize = Math.min(
				StreamingTransformer.THINKING_CHARS_PER_FLUSH * 2,
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
