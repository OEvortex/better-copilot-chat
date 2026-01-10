/*---------------------------------------------------------------------------------------------
 *  Anthropic Message Converter
 *
 *  Main features:
 *  - Convert VS Code API message format to Anthropic API format
 *  - Support text, images, tool calls and tool results
 *  - Support thinking content conversion to maintain multi-turn conversation thinking chain continuity
 *  - Support cache control and streaming response handling
 *  - Complete error handling and type safety
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from "@anthropic-ai/sdk";
import type {
	ContentBlockParam,
	ImageBlockParam,
	MessageParam,
	RedactedThinkingBlockParam,
	TextBlockParam,
	ThinkingBlockParam,
} from "@anthropic-ai/sdk/resources";
import * as vscode from "vscode";
import type { ModelConfig } from "../../types/sharedTypes";
import { Logger } from "../../utils/logger";
import { CustomDataPartMimeTypes } from "./anthropicTypes";

// Helper function - filter undefined values
function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}

/**
 * Check if content block supports cache control
 */
function contentBlockSupportsCacheControl(block: ContentBlockParam): boolean {
	return block.type !== "thinking" && block.type !== "redacted_thinking";
}

/**
 * Convert VS Code API message content to Anthropic format
 * * Support thinking content blocks to maintain multi-turn conversation thinking chain continuity (MiniMax requirement)
 */
function apiContentToAnthropicContent(
	content: vscode.LanguageModelChatMessage["content"],
	includeThinking = false,
): ContentBlockParam[] {
	const convertedContent: ContentBlockParam[] = [];

	for (const part of content) {
		// Thinking content - used to maintain multi-turn conversation thinking chain continuity
		if (includeThinking && part instanceof vscode.LanguageModelThinkingPart) {
			// Check if there is metadata (containing signature and other information)
			const metadata = part.metadata as
				| { signature?: string; data?: string; _completeThinking?: string }
				| undefined;

			// Some providers (e.g. Gemini/Antigravity) may attach provider-specific signature metadata.
			// Never forward unknown signatures to Anthropic `thinking.signature`.
			const providerHint = (
				part.metadata as { _signatureProvider?: string } | undefined
			)?._signatureProvider;
			const signatureToSend =
				providerHint === "anthropic" ? metadata?.signature : undefined;

			// If it's encrypted thinking content (redacted_thinking)
			if (metadata?.data) {
				convertedContent.push({
					type: "redacted_thinking",
					data: metadata.data,
				} as RedactedThinkingBlockParam);
			} else {
				// Normal thinking content
				// Prefer _completeThinking (complete thinking content), otherwise use value
				const thinkingText =
					metadata?._completeThinking ||
					(Array.isArray(part.value) ? part.value.join("") : part.value);
				// Only add thinking content when it's not empty
				if (thinkingText) {
					const thinkingBlock = {
						type: "thinking",
						thinking: thinkingText,
					} as ThinkingBlockParam;
					// If there is a signature, add it to the block
					if (signatureToSend) {
						thinkingBlock.signature = signatureToSend;
					}
					convertedContent.push(thinkingBlock);
				}
			}
		}
		// Tool calls
		else if (part instanceof vscode.LanguageModelToolCallPart) {
			convertedContent.push({
				type: "tool_use",
				id: part.callId,
				input: part.input,
				name: part.name,
			});
		}
		// Cache control markers
		else if ("data" in part && "mimeType" in part) {
			const dataPart = part as { data: unknown; mimeType: string };
			if (dataPart.mimeType === CustomDataPartMimeTypes.CacheControl) {
				const previousBlock = convertedContent.at(-1);
				if (previousBlock && contentBlockSupportsCacheControl(previousBlock)) {
					(
						previousBlock as ContentBlockParam & {
							cache_control?: { type: string };
						}
					).cache_control = {
						type: "ephemeral",
					};
				} else {
					// Empty string is invalid, use space
					convertedContent.push({
						type: "text",
						text: " ",
						cache_control: { type: "ephemeral" },
					} as ContentBlockParam);
				}
			}
			// Image data
			else if (dataPart.mimeType.startsWith("image/")) {
				convertedContent.push({
					type: "image",
					source: {
						type: "base64",
						data: Buffer.from(dataPart.data as Uint8Array).toString("base64"),
						media_type: dataPart.mimeType as
							| "image/jpeg"
							| "image/png"
							| "image/gif"
							| "image/webp",
					},
				});
			}
		}
		// Tool results
		else if (part instanceof vscode.LanguageModelToolResultPart) {
			convertedContent.push({
				type: "tool_result",
				tool_use_id: part.callId,
				content: part.content
					.map((p): TextBlockParam | ImageBlockParam | undefined => {
						if (p instanceof vscode.LanguageModelTextPart) {
							return { type: "text", text: p.value };
						}
						// Handle other types of content (such as images, etc.)
						return undefined;
					})
					.filter(isDefined),
			});
		}
		// Text content
		else if (part instanceof vscode.LanguageModelTextPart) {
			// Anthropic throws error on empty string, skip empty text parts
			if (part.value === "") {
				continue;
			}
			convertedContent.push({
				type: "text",
				text: part.value,
			});
		}
	}

	return convertedContent;
}

/**
 * Convert VS Code API messages to Anthropic format
 */
export function apiMessageToAnthropicMessage(
	model: ModelConfig,
	messages: readonly vscode.LanguageModelChatMessage[],
): {
	messages: MessageParam[];
	system: TextBlockParam;
} {
	const unmergedMessages: MessageParam[] = [];
	const systemMessage: TextBlockParam = {
		type: "text",
		text: "",
	};

	for (const message of messages) {
		if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
			unmergedMessages.push({
				role: "assistant",
				content: apiContentToAnthropicContent(
					message.content,
					model.includeThinking,
				),
			});
		} else if (message.role === vscode.LanguageModelChatMessageRole.User) {
			unmergedMessages.push({
				role: "user",
				content: apiContentToAnthropicContent(message.content),
			});
		} else if (message.role === vscode.LanguageModelChatMessageRole.System) {
			systemMessage.text += message.content
				.map((p) => {
					if (p instanceof vscode.LanguageModelTextPart) {
						return p.value;
					} else if (
						"data" in p &&
						"mimeType" in p &&
						p.mimeType === CustomDataPartMimeTypes.CacheControl &&
						(p.data as Uint8Array).toString() === "ephemeral"
					) {
						(
							systemMessage as TextBlockParam & {
								cache_control?: { type: string };
							}
						).cache_control = {
							type: "ephemeral",
						};
					}
					return "";
				})
				.join("");
		}
	}

	// Merge consecutive messages with the same role
	const mergedMessages: MessageParam[] = [];
	for (const message of unmergedMessages) {
		if (
			mergedMessages.length === 0 ||
			mergedMessages[mergedMessages.length - 1].role !== message.role
		) {
			mergedMessages.push(message);
		} else {
			const prevMessage = mergedMessages[mergedMessages.length - 1];
			if (
				Array.isArray(prevMessage.content) &&
				Array.isArray(message.content)
			) {
				(prevMessage.content as ContentBlockParam[]).push(
					...(message.content as ContentBlockParam[]),
				);
			}
		}
	}

	// If includeThinking=true, check and ensure assistant messages contain thinking blocks
	if (model.includeThinking) {
		for (const message of mergedMessages) {
			if (message.role === "assistant" && Array.isArray(message.content)) {
				const content = message.content as ContentBlockParam[];
				const thinkingBlocks = content.filter(
					(block) =>
						block.type === "thinking" || block.type === "redacted_thinking",
				);
				const nonThinkingBlocks = content.filter(
					(block) =>
						block.type !== "thinking" && block.type !== "redacted_thinking",
				);
				if (thinkingBlocks.length === 0) {
					// Add default thinking block at the beginning of assistant message
					content.unshift({
						type: "thinking",
						thinking: "...",
					} as ThinkingBlockParam);
					Logger.trace(
						"Assistant message missing thinking block, added default one",
					);
				} else if (
					content[0]?.type !== "thinking" &&
					content[0]?.type !== "redacted_thinking"
				) {
					// Ensure thinking blocks are first (Anthropic requirement)
					message.content = [...thinkingBlocks, ...nonThinkingBlocks];
					Logger.trace(
						"Assistant message reordered to start with thinking block",
					);
				}
			}
		}
	}

	return { messages: mergedMessages, system: systemMessage };
}

/**
 * Convert tool definitions to Anthropic format
 */
export function convertToAnthropicTools(
	tools: readonly vscode.LanguageModelChatTool[],
): Anthropic.Messages.Tool[] {
	return tools.map((tool) => {
		const inputSchema = tool.inputSchema as
			| Anthropic.Messages.Tool.InputSchema
			| undefined;

		if (!inputSchema) {
			return {
				name: tool.name,
				description: tool.description || "",
				input_schema: {
					type: "object" as const,
					properties: {},
					required: [],
				},
			};
		}

		return {
			name: tool.name,
			description: tool.description || "",
			input_schema: {
				type: "object" as const,
				properties: inputSchema.properties ?? {},
				required: inputSchema.required ?? [],
				...(inputSchema.additionalProperties !== undefined && {
					additionalProperties: inputSchema.additionalProperties,
				}),
			},
		};
	});
}
