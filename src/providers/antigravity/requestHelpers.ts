import crypto from "node:crypto";
import * as vscode from "vscode";
import type { ModelConfig } from "../../types/sharedTypes";
import { ConfigManager } from "../../utils/configManager";
import {
	balanceGeminiFunctionCallResponses,
	convertMessagesToGemini as convertMessagesToGeminiCommon,
	type GeminiSdkContent,
	sanitizeGeminiToolSchema,
	validateGeminiPartsBalance,
} from "../../utils/geminiSdkCommon";
import {
	FALLBACK_SIGNATURE,
	getSignatureForToolCall,
	storeToolCallSignature,
} from "./signatureCache";
import type { AntigravityPayload, GeminiContent, GeminiRequest } from "./types";

const MODEL_ALIASES: Record<string, string> = {
	"gemini-2.5-computer-use-preview-10-2025": "rev19-uic3-1p",
	"gemini-3-pro-image-preview": "gemini-3-pro-image",
	"gemini-3-pro-preview": "gemini-3-pro-high",
	"gemini-3-flash-low": "gemini-3-flash",
	"gemini-3-flash-medium": "gemini-3-flash",
	"gemini-3-flash-high": "gemini-3-flash",
	"gemini-claude-sonnet-4-5": "claude-sonnet-4-5",
	"claude-sonnet-4-5": "claude-sonnet-4-5",
	"gemini-claude-sonnet-4-5-thinking": "claude-sonnet-4-5-thinking",
	"claude-sonnet-4-5-thinking": "claude-sonnet-4-5-thinking",
	"gemini-claude-opus-4-5-thinking": "claude-opus-4-5-thinking",
	"claude-opus-4-5-thinking": "claude-opus-4-5-thinking",
	"gemini-claude-sonnet-4-6": "claude-sonnet-4-6",
	"claude-sonnet-4-6": "claude-sonnet-4-6",
	"gemini-claude-opus-4-6-thinking": "claude-opus-4-6-thinking",
	"claude-opus-4-6-thinking": "claude-opus-4-6-thinking",
	"claude-opus-4-6-thinking-low": "claude-opus-4-6-thinking",
};

export function aliasToModelName(modelName: string): string {
	return MODEL_ALIASES[modelName] || modelName;
}

export function generateSessionId(): string {
	const uuid = crypto.randomUUID
		? crypto.randomUUID()
		: crypto.randomBytes(16).toString("hex");
	return `-${uuid.replace(/-/g, "").slice(0, 16)}`;
}

export function generateRequestId(): string {
	const uuid = crypto.randomUUID
		? crypto.randomUUID()
		: crypto.randomBytes(16).toString("hex");
	return `agent-${uuid}`;
}

export function generateProjectId(): string {
	const adjectives = ["useful", "bright", "swift", "calm", "bold"];
	const nouns = ["fuze", "wave", "spark", "flow", "core"];
	const bytes = crypto.randomBytes(2);
	const uuid = crypto.randomUUID
		? crypto.randomUUID()
		: crypto.randomBytes(16).toString("hex");
	return `${adjectives[bytes[0] % adjectives.length]}-${nouns[bytes[1] % nouns.length]}-${uuid.replace(/-/g, "").slice(0, 5).toLowerCase()}`;
}

function sanitizeToolSchema(schema: unknown): Record<string, unknown> {
	return sanitizeGeminiToolSchema(schema);
}

function convertMessagesToGemini(
	messages: readonly vscode.LanguageModelChatMessage[],
	modelConfig: ModelConfig,
	resolvedModelName?: string,
	sessionId?: string,
): { contents: GeminiContent[]; systemInstruction?: Record<string, unknown> } {
	const converted = convertMessagesToGeminiCommon(messages, modelConfig, {
		resolvedModelName,
		sessionId,
		getThoughtSignature: (callId, activeSessionId) =>
			getSignatureForToolCall(callId, activeSessionId),
		storeThoughtSignature: (callId, signature) =>
			storeToolCallSignature(callId, signature),
		fallbackThoughtSignature: FALLBACK_SIGNATURE,
		normalizeToolCallArgs: false,
		skipThinkingPartWhenToolCalls: false,
	});

	return {
		contents: converted.contents as unknown as GeminiContent[],
		systemInstruction: converted.systemInstruction as Record<string, unknown> | undefined,
	};
}

export interface PreparedRequest {
	payload: AntigravityPayload;
	sessionId: string;
	resolvedModel: string;
}

/**
 * Validate that functionCall and functionResponse parts are balanced
 */
function validatePartsBalance(
	contents: GeminiContent[],
	_modelName: string,
): void {
	validateGeminiPartsBalance(contents as unknown as GeminiSdkContent[], {
		prefix: "Antigravity",
		onWarning: (message) => console.warn(message),
	});
}

/**
 * Attempt to automatically balance functionCall/functionResponse parts and reattach orphan thoughtSignatures.
 */
function balanceFunctionCallResponses(
	contents: GeminiContent[],
	_modelName: string,
): void {
	balanceGeminiFunctionCallResponses(
		contents as unknown as GeminiSdkContent[],
	);
}

export function prepareAntigravityRequest(
	model: vscode.LanguageModelChatInformation,
	modelConfig: ModelConfig,
	messages: readonly vscode.LanguageModelChatMessage[],
	options: vscode.ProvideLanguageModelChatResponseOptions,
	projectId: string,
	existingSessionId?: string,
): PreparedRequest {
	const requestModel = modelConfig.model || model.id;
	const resolvedModel = aliasToModelName(requestModel).toLowerCase();
	const sessionId = existingSessionId || generateSessionId();
	const maxOutputTokens = ConfigManager.getMaxTokensForModel(
		model.maxOutputTokens,
	);
	const { contents, systemInstruction } = convertMessagesToGemini(
		messages,
		modelConfig,
		resolvedModel,
		sessionId,
	);

	// Validate and balance function call responses
	validatePartsBalance(contents, resolvedModel);
	balanceFunctionCallResponses(contents, resolvedModel);

	const isClaudeThinkingModel =
		resolvedModel.includes("claude") && resolvedModel.includes("thinking");
	const isThinkingEnabled =
		modelConfig.outputThinking !== false ||
		modelConfig.includeThinking === true;

	const generationConfig: Record<string, unknown> = {
		maxOutputTokens,
		temperature: ConfigManager.getTemperature(),
		topP: ConfigManager.getTopP(),
	};

	const hasTools =
		options.tools &&
		options.tools.length > 0 &&
		model.capabilities?.toolCalling;
	if (isClaudeThinkingModel && isThinkingEnabled && !hasTools) {
		const selectedModelId = (modelConfig.id || model.id).toLowerCase();
		let thinkingBudget = modelConfig.thinkingBudget || 10000;
		if (selectedModelId.includes("claude-opus-4-6-thinking-low")) {
			thinkingBudget = 8192;
		} else if (selectedModelId.includes("claude-opus-4-6-thinking")) {
			thinkingBudget = 32768;
		}
		if (maxOutputTokens < thinkingBudget + 1000) {
			generationConfig.maxOutputTokens = thinkingBudget + 1000;
		}
		generationConfig.thinkingConfig = { includeThoughts: true, thinkingBudget };
	}

	const request: Record<string, unknown> = { contents, generationConfig };
	if (systemInstruction) {
		request.systemInstruction = systemInstruction;
	}
	if (hasTools) {
		request.tools = [
			{
				functionDeclarations: options.tools?.map((tool) => ({
					name: tool.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 63),
					description: tool.description || "",
					parameters:
						tool.inputSchema && typeof tool.inputSchema === "object"
							? sanitizeToolSchema(tool.inputSchema)
							: { type: "object", properties: {} },
				})),
			},
		];
		request.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
	}
	request.safetySettings = [
		{ category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
		{ category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
		{ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
		{ category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
		{ category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
	];
	if (modelConfig.extraBody && typeof modelConfig.extraBody === "object") {
		Object.assign(request, modelConfig.extraBody);
	}

	const payload: AntigravityPayload = {
		project: projectId || generateProjectId(),
		model: aliasToModelName(requestModel),
		userAgent: "antigravity",
		requestId: generateRequestId(),
		request: { ...request, sessionId } as GeminiRequest & { sessionId: string },
	};

	return { payload, sessionId, resolvedModel };
}
