/*---------------------------------------------------------------------------------------------
 *  Token Counter
 *  Handles all logic related to token counting
 *--------------------------------------------------------------------------------------------*/

import {
	createTokenizer,
	getRegexByEncoder,
	getSpecialTokensByEncoder,
	type TikTokenizer,
} from "@microsoft/tiktokenizer";
import * as vscode from "vscode";
import {
	type LanguageModelChatInformation,
	type LanguageModelChatMessage,
	LanguageModelChatMessageRole,
	type LanguageModelChatTool,
	type ProvideLanguageModelChatResponseOptions,
} from "vscode";
import { Logger } from "./logger";

/**
 * Globally shared tokenizer instance and extension path
 */
let sharedTokenizerPromise: TikTokenizer | null = null;
let extensionPath: string | null = null;
let sharedTokenCounterInstance: TokenCounter | null = null;

/**
 * Simple LRU cache implementation
 */
class LRUCache<T> {
	private cache = new Map<string, T>();
	constructor(private maxSize: number) {}

	get(key: string): T | undefined {
		const value = this.cache.get(key);
		if (value !== undefined) {
			// Move accessed item to the end (most recently used)
			this.cache.delete(key);
			this.cache.set(key, value);
		}
		return value;
	}

	put(key: string, value: T): void {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxSize) {
			// Delete the oldest item (first one)
			const firstKey = this.cache.keys().next().value;
			if (firstKey) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(key, value);
	}
}

/**
 * Token Counter class
 * Responsible for calculating the number of tokens for messages, system messages, and tool definitions
 * Also manages the globally shared tokenizer instance
 */
export class TokenCounter {
	/**
	 * Cache for text token counts (LRU, capacity 5000)
	 */
	private tokenCache = new LRUCache<number>(5000);

	/**
	 * Set extension path
	 * Must be called before creating a TokenCounter instance
	 */
	static setExtensionPath(path: string): void {
		extensionPath = path;
		Logger.trace("[TokenCounter] Extension path set");
	}

	/**
	 * Get globally shared TokenCounter instance (singleton)
	 */
	static getInstance(): TokenCounter {
		if (!sharedTokenCounterInstance) {
			sharedTokenCounterInstance = new TokenCounter();
			Logger.trace("[TokenCounter] Global instance created");
		}
		return sharedTokenCounterInstance;
	}

	/**
	 * Get shared tokenizer instance (lazy loading, global singleton)
	 */
	static getSharedTokenizer(): TikTokenizer {
		if (!sharedTokenizerPromise) {
			Logger.trace(
				"[TokenCounter] First request for tokenizer, initializing global shared instance...",
			);
			if (!extensionPath) {
				throw new Error(
					"[TokenCounter] Extension path not initialized, please call TokenCounter.setExtensionPath() first",
				);
			}
			const basePath = vscode.Uri.file(extensionPath!);
			const tokenizerPath = vscode.Uri.joinPath(
				basePath,
				"dist",
				"o200k_base.tiktoken",
			).fsPath;
			sharedTokenizerPromise = createTokenizer(
				tokenizerPath,
				getSpecialTokensByEncoder("o200k_base"),
				getRegexByEncoder("o200k_base"),
			);
			Logger.trace("[TokenCounter] Tokenizer initialization complete");
		}
		return sharedTokenizerPromise;
	}

	constructor(private tokenizer?: TikTokenizer) {
		// If no tokenizer is passed, use the shared instance
		if (!this.tokenizer) {
			this.tokenizer = TokenCounter.getSharedTokenizer();
		}
	}

	/**
	 * Calculate text token count (with cache)
	 */
	private getTextTokenLength(text: string): number {
		if (!text) {
			return 0;
		}

		// Check cache first
		const cacheValue = this.tokenCache.get(text);
		if (cacheValue !== undefined) {
			// Logger.trace(`[Cache Hit] "${text.substring(0, 20)}..." -> ${cacheValue} tokens`);
			return cacheValue;
		}

		// Cache miss, calculate token count
		const tokenCount = this.tokenizer?.encode(text)?.length ?? 0;

		// Store in cache
		this.tokenCache.put(text, tokenCount);
		// Logger.trace(`[Cache Write] "${text.substring(0, 20)}..." -> ${tokenCount} tokens`);

		return tokenCount;
	}

	private stringifyUnknown(value: unknown): string {
		if (typeof value === "string") {
			return value;
		}
		try {
			return JSON.stringify(value) || "";
		} catch {
			return String(value);
		}
	}

	private async countMessagePartTokens(part: unknown): Promise<number> {
		if (!part) {
			return 0;
		}

		if (part instanceof vscode.LanguageModelTextPart) {
			return this.getTextTokenLength(part.value);
		}

		if (part instanceof vscode.LanguageModelToolCallPart) {
			const payload = `${part.callId || ""} ${part.name || ""} ${this.stringifyUnknown(part.input)}`;
			return this.getTextTokenLength(payload);
		}

		if (part instanceof vscode.LanguageModelToolResultPart) {
			let combined = part.callId || "";
			for (const resultPart of part.content || []) {
				if (resultPart instanceof vscode.LanguageModelTextPart) {
					combined += `\n${resultPart.value}`;
				} else {
					combined += `\n${this.stringifyUnknown(resultPart)}`;
				}
			}
			return this.getTextTokenLength(combined);
		}

		if (part instanceof vscode.LanguageModelPromptTsxPart) {
			return this.getTextTokenLength(this.stringifyUnknown(part.value));
		}

		if (typeof part === "string" || typeof part === "number" || typeof part === "boolean") {
			return this.getTextTokenLength(String(part));
		}

		if (typeof part === "object") {
			return this.countMessageObjectTokens(part as Record<string, unknown>, 1);
		}

		return 0;
	}

	private async countLanguageModelMessageTokens(
		message: LanguageModelChatMessage,
	): Promise<number> {
		let numTokens = 3;
		numTokens += this.getTextTokenLength(String(message.role));

		if (typeof message.content === "string") {
			numTokens += this.getTextTokenLength(message.content);
			return numTokens;
		}

		if (Array.isArray(message.content)) {
			for (const part of message.content) {
				numTokens += await this.countMessagePartTokens(part);
			}
			return numTokens;
		}

		numTokens += this.getTextTokenLength(this.stringifyUnknown(message.content));
		return numTokens;
	}

	/**
	 * Calculate token count for a single text or message object
	 */
	async countTokens(
		_model: LanguageModelChatInformation,
		text: string | LanguageModelChatMessage,
	): Promise<number> {
		if (typeof text === "string") {
			const stringTokens = this.tokenizer?.encode(text)?.length ?? 0;
			Logger.trace(
				`[Token Count] String: ${stringTokens} tokens (Length: ${text.length})`,
			);
			return stringTokens;
		}

		// Handle LanguageModelChatMessage object
		try {
			const objectTokens = await this.countLanguageModelMessageTokens(text);
			return objectTokens;
		} catch (error) {
			Logger.warn(
				"[Token Count] Failed to calculate message object tokens, using simplified calculation:",
				error,
			);
			// Fallback: convert message object to JSON string for calculation
			const fallbackTokens =
				this.tokenizer?.encode(JSON.stringify(text))?.length ?? 0;
			Logger.trace(
				`[Token Count] Fallback calculation: ${fallbackTokens} tokens`,
			);
			return fallbackTokens;
		}
	}

	/**
	 * Recursively calculate token count in message objects
	 * Supports text, images, tool calls, and other complex content
	 */
	async countMessageObjectTokens(
		obj: Record<string, unknown>,
		depth: number = 0,
	): Promise<number> {
		let numTokens = 0;
		// const indent = '  '.repeat(depth);

		// Each object/message needs some extra tokens for separation and formatting
		if (depth === 0) {
			// Message separator and basic formatting overhead (3 tokens is more accurate than 1)
			const overheadTokens = 3;
			numTokens += overheadTokens;
			// Logger.trace(`${indent}[Overhead] Message separator: ${overheadTokens} tokens`);
		}

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for (const [_key, value] of Object.entries(obj)) {
			if (!value) {
				continue;
			}

			if (typeof value === "string") {
				// String content directly calculated (using cache)
				const tokens = this.getTextTokenLength(value);
				numTokens += tokens;
				// Logger.trace(`${indent}[${key}] String: ${tokens} tokens`);
			} else if (typeof value === "number" || typeof value === "boolean") {
				// Numbers and booleans also calculated (using cache)
				const tokens = this.getTextTokenLength(String(value));
				numTokens += tokens;
				// Logger.trace(`${indent}[${key}] ${typeof value}: ${tokens} tokens`);
			} else if (Array.isArray(value)) {
				// Array handling
				// Logger.trace(`${indent}[${key}] Array (${value.length} items)`);
				for (const item of value) {
					if (typeof item === "string") {
						const tokens = this.getTextTokenLength(item);
						numTokens += tokens;
						// Logger.trace(`${indent}  [value] String: ${tokens} tokens`);
					} else if (typeof item === "number" || typeof item === "boolean") {
						const tokens = this.getTextTokenLength(String(item));
						numTokens += tokens;
						// Logger.trace(`${indent}  [${typeof item}] ${typeof item}: ${tokens} tokens`);
					} else if (item && typeof item === "object") {
						// Nested object array
						const itemTokens = await this.countMessageObjectTokens(
							item as Record<string, unknown>,
							depth + 2,
						);
						numTokens += itemTokens;
					}
				}
			} else if (typeof value === "object") {
				// Logger.trace(`${indent}[${key}] Object type`);
				const nestedTokens = await this.countMessageObjectTokens(
					value as Record<string, unknown>,
					depth + 1,
				);
				numTokens += nestedTokens;
			}
		}

		return numTokens;
	}

	/**
	 * Calculate total token count for multiple messages
	 * Includes regular messages, system messages, and tool definitions
	 */
	async countMessagesTokens(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		modelConfig?: { sdkMode?: string },
		options?: ProvideLanguageModelChatResponseOptions,
	): Promise<number> {
		let totalTokens = 0;
		// Logger.trace(`[Token Count] Starting calculation for ${messages.length} messages...`);

		// Calculate message tokens
		// eslint-disable-next-line @typescript-eslint/prefer-for-of
		for (let i = 0; i < messages.length; i++) {
			const message = messages[i];
			const messageTokens = await this.countTokens(
				model,
				message as unknown as string | LanguageModelChatMessage,
			);
			totalTokens += messageTokens;
			// Logger.trace(`[Token Count] Message #${i + 1}: ${messageTokens} tokens (Cumulative: ${totalTokens})`);
		}

		const sdkMode = modelConfig?.sdkMode || "openai";

		if (sdkMode === "anthropic") {
			// Add system message and tool token costs for Anthropic SDK mode
			// Calculate system message token cost
			const systemMessageTokens = this.countSystemMessageTokens(messages);
			if (systemMessageTokens > 0) {
				totalTokens += systemMessageTokens;
				// Logger.trace(`[Token Count] System message: ${systemMessageTokens} tokens (Cumulative: ${totalTokens})`);
			}

			// Calculate tool definition token cost
			const toolsTokens = this.countToolsTokens(options?.tools);
			if (toolsTokens > 0) {
				totalTokens += toolsTokens;
				// Logger.trace(
				//     `[Token Count] Tool definitions (${options?.tools?.length || 0}): ${toolsTokens} tokens (Cumulative: ${totalTokens})`
				// );
			}
		} else if (sdkMode === "openai") {
			// OpenAI SDK mode: tool cost same as Anthropic (both use 1.1x)
			const toolsTokens = this.countToolsTokens(options?.tools);
			if (toolsTokens > 0) {
				totalTokens += toolsTokens;
				// Logger.trace(
				//     `[Token Count] Tool definitions (${options?.tools?.length || 0}): ${toolsTokens} tokens (Cumulative: ${totalTokens})`
				// );
			}
		}

		// Logger.info(
		//     `[Token Count] Total: ${messages.length} messages${sdkMode === 'anthropic' ? ' + system message + tool definitions' : ' (OpenAI SDK)'}, ${totalTokens} tokens`
		// );
		return totalTokens;
	}

	/**
	 * Calculate system message token count
	 * Extract all system messages from the message list and calculate combined
	 */
	private countSystemMessageTokens(
		messages: Array<LanguageModelChatMessage>,
	): number {
		let systemText = "";

		for (const message of messages) {
			if (message.role === LanguageModelChatMessageRole.System) {
				if (typeof message.content === "string") {
					systemText += message.content;
				} else if (Array.isArray(message.content)) {
					systemText += message.content
						.map((part) => {
							if (part instanceof vscode.LanguageModelTextPart) {
								return part.value;
							}
							if (part instanceof vscode.LanguageModelPromptTsxPart) {
								return this.stringifyUnknown(part.value);
							}
							return this.stringifyUnknown(part);
						})
						.filter(Boolean)
						.join("\n");
				}
			}
		}

		if (!systemText) {
			return 0;
		}

		// Calculate system message token count - using cache mechanism
		const systemTokens = this.getTextTokenLength(systemText);

		// Anthropic's system message processing adds some extra formatting tokens
		// Based on testing, system message wrapping overhead is about 25-30 tokens
		const systemOverhead = 28;
		const totalSystemTokens = systemTokens + systemOverhead;

		Logger.debug(
			`[Token Count] System message details: Content ${systemTokens} tokens + Wrapping overhead ${systemOverhead} tokens = ${totalSystemTokens} tokens`,
		);
		return totalSystemTokens;
	}

	/**
	 * Calculate tool definition token count
	 * Follows official VS Code Copilot implementation:
	 * - Base overhead: 16 tokens (tool array overhead)
	 * - Each tool: 8 tokens + object content token count
	 * - Finally multiplied by 1.1 safety factor (official standard)
	 */
	private countToolsTokens(tools?: readonly LanguageModelChatTool[]): number {
		const baseToolTokens = 16;
		let numTokens = 0;
		if (!tools || tools.length === 0) {
			return 0;
		}

		numTokens += baseToolTokens;

		const baseTokensPerTool = 8;
		for (const tool of tools) {
			numTokens += baseTokensPerTool;
			// Calculate tool object token count (name, description, parameters)
			const toolObj = {
				name: tool.name,
				description: tool.description || "",
				input_schema: tool.inputSchema,
			};
			// Simple heuristic: traverse object and calculate tokens (using cache)
			for (const [, value] of Object.entries(toolObj)) {
				if (typeof value === "string") {
					numTokens += this.getTextTokenLength(value);
				} else if (value && typeof value === "object") {
					// For JSON objects, use JSON string encoding (using cache)
					numTokens += this.getTextTokenLength(JSON.stringify(value));
				}
			}
		}

		// Use official standard 1.1 safety factor
		return Math.floor(numTokens * 1.1);
	}
}
