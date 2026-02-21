/**
 * ChatJimmy Provider Type Definitions
 */

/**
 * ChatJimmy API Request Body
 */
export interface ChatJimmyRequest {
	messages: ChatJimmyMessage[];
	chatOptions: ChatJimmyChatOptions;
	attachment?: null | string;
}

/**
 * ChatJimmy Message Format
 */
export interface ChatJimmyMessage {
	role: "user" | "assistant";
	content: string;
}

/**
 * ChatJimmy Chat Options
 */
export interface ChatJimmyChatOptions {
	selectedModel: string;
	systemPrompt: string;
	topK?: number;
}

/**
 * ChatJimmy Streaming Response
 */
export interface ChatJimmyResponse {
	created_at?: number;
	done?: boolean;
	done_reason?: string;
	total_tokens?: number;
	ttft?: number;
	decode_rate?: number;
	prefill_tokens?: number;
	decode_tokens?: number;
	logprobs?: unknown;
	topk?: number;
	reason?: string;
	status?: number;
}

/**
 * FIM Tokens for ChatJimmy
 */
export const FIM_TOKENS = {
	PREFIX: "<|fim_prefix|>",
	SUFFIX: "<|fim_suffix|>",
	MIDDLE: "<|fim_middle|>",
} as const;
