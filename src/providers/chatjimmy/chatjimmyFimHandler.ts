/**
 * ChatJimmy FIM Handler
 * Specialized handler for Fill-In-the-Middle completions using ChatJimmy API
 * 
 * ChatJimmy API endpoint: https://chatjimmy.ai/api/chat
 * Input format: {messages, chatOptions}
 * Output format: Streaming text responses with stats
 */

import * as vscode from "vscode";
import type { ModelConfig } from "../../types/sharedTypes";
import { Logger } from "../../utils/logger";

/**
 * ChatJimmy request body for FIM
 */
interface ChatJimmyFIMRequest {
	messages: Array<{
		role: "user" | "assistant";
		content: string;
	}>;
	chatOptions: {
		selectedModel: string;
		systemPrompt: string;
		topK?: number;
	};
	attachment?: null | string;
}

/**
 * ChatJimmy FIM response chunk (streaming)
 */
interface ChatJimmyStreamChunk {
	content?: string;
	done?: boolean;
	done_reason?: string;
	["<|stats|>"]?: string; // Stats embedded in response
}

/**
 * ChatJimmy FIM Handler
 * Converts FIM requests (prefix + suffix) to ChatJimmy's message format
 */
export class ChatJimmyFIMHandler {
	private readonly displayName = "ChatJimmy";

	/**
	 * Build ChatJimmy FIM request from prefix and suffix
	 * @param prefix Code before the cursor
	 * @param suffix Code after the cursor
	 * @param modelConfig Model configuration containing model name
	 * @returns ChatJimmy API request body
	 */
	buildFIMRequest(
		prefix: string,
		suffix: string,
		modelConfig: ModelConfig,
	): ChatJimmyFIMRequest {
		// Construct FIM-specific prompt for ChatJimmy
		// Use a simpler format that ChatJimmy understands
		const fimPrompt = `Complete the code between the prefix and suffix:\n\nPrefix:\n${prefix}\n\nSuffix:\n${suffix}\n\nMiddle:`;

		return {
			messages: [
				{
					role: "user",
					content: fimPrompt,
				},
			],
			chatOptions: {
				selectedModel: modelConfig.model || modelConfig.id,
				systemPrompt:
					"You are a code completion AI. Complete the code between the prefix and suffix. Return ONLY the code to fill in the middle, without any explanation or markdown formatting.",
				topK: 8,
			},
			attachment: null,
		};
	}

	/**
	 * Send FIM request to ChatJimmy API
	 * @param prefix Code before cursor
	 * @param suffix Code after cursor
	 * @param modelConfig Model configuration
	 * @param progress Progress reporter
	 * @param token Cancellation token
	 */
	async handleFIMRequest(
		prefix: string,
		suffix: string,
		modelConfig: ModelConfig,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const requestBody = this.buildFIMRequest(prefix, suffix, modelConfig);

		try {
			Logger.debug(
				`[${this.displayName}] Sending FIM request for model: ${modelConfig.model || modelConfig.id}`,
			);

			// Convert VS Code cancellation token to AbortSignal for fetch
			const abortController = new AbortController();
			const abortSignal = abortController.signal;

			token.onCancellationRequested(() => {
				abortController.abort();
			});

			const fetcher = fetch("https://chatjimmy.ai/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
				signal: abortSignal,
			});

			const response = await fetcher;

			if (!response.ok) {
				throw new Error(
					`ChatJimmy API error: ${response.status} ${response.statusText}`,
				);
			}

			if (!response.body) {
				throw new Error("ChatJimmy API returned no response body");
			}

			// Handle streaming response
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let completionBuffer = "";

			while (!token.isCancellationRequested) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				// Process complete lines
				const lines = buffer.split("\n");
				buffer = lines.pop() || ""; // Keep incomplete line in buffer

				for (const line of lines) {
					if (!line.trim()) continue;

					// Skip stats lines
					if (line.includes("<|stats|>") || line.includes("<|/stats|>")) {
						continue;
					}

					// Extract completion text from response
					// ChatJimmy returns the completion in the response, we need to extract it
					// The response format appears to be: "completion text" or code blocks
					completionBuffer += line + "\n";
				}
			}

			// Process any remaining buffer
			if (buffer.trim() && !buffer.includes("<|stats|>")) {
				completionBuffer += buffer;
			}

			// Clean up the completion buffer
			// Remove any markdown code blocks if present
			let cleanedCompletion = completionBuffer.trim();
			if (cleanedCompletion.startsWith("```")) {
				// Remove opening ```language
				cleanedCompletion = cleanedCompletion.replace(/^```\w*\n/, "");
				// Remove closing ```
				cleanedCompletion = cleanedCompletion.replace(/\n```$/, "");
			}

			// Report text content
			if (cleanedCompletion.trim()) {
				progress.report(new vscode.LanguageModelTextPart(cleanedCompletion));
			}

			Logger.debug(`[${this.displayName}] FIM request completed successfully`);
		} catch (error) {
			if (token.isCancellationRequested) {
				Logger.debug(`[${this.displayName}] FIM request cancelled`);
				return;
			}

			const errorMessage =
				error instanceof Error ? error.message : String(error);
			Logger.error(`[${this.displayName}] FIM request failed: ${errorMessage}`);
			throw error;
		}
	}
}
