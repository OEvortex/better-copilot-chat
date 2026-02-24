import crypto from "node:crypto";
import * as vscode from "vscode";
import type { ModelConfig } from "../../types/sharedTypes";
import { ConfigManager } from "../../utils/configManager";
import {
	FALLBACK_SIGNATURE,
	getSignatureForToolCall,
	storeToolCallSignature,
} from "./signatureCache";
import type { AntigravityPayload, GeminiContent, GeminiRequest } from "./types";

const GEMINI_UNSUPPORTED_FIELDS = new Set([
	"$ref",
	"$defs",
	"definitions",
	"$id",
	"$anchor",
	"$dynamicRef",
	"$dynamicAnchor",
	"$schema",
	"$vocabulary",
	"$comment",
	"exclusiveMinimum",
	"exclusiveMaximum",
	"minimum",
	"maximum",
	"multipleOf",
	"additionalProperties",
	"minLength",
	"maxLength",
	"pattern",
	"minItems",
	"maxItems",
	"uniqueItems",
	"minContains",
	"maxContains",
	"minProperties",
	"maxProperties",
	"if",
	"then",
	"else",
	"dependentSchemas",
	"dependentRequired",
	"unevaluatedItems",
	"unevaluatedProperties",
	"contentEncoding",
	"contentMediaType",
	"contentSchema",
	"dependencies",
	"allOf",
	"anyOf",
	"oneOf",
	"not",
	"strict",
	"input_examples",
	"examples",
	// Remove 'value' field as it causes proto parsing errors when it contains arrays
	// with 'type' fields inside (e.g., {value: [{type: "string", ...}]})
	"value",
]);

const MODEL_ALIASES: Record<string, string> = {
	"gemini-2.5-computer-use-preview-10-2025": "rev19-uic3-1p",
	"gemini-3-pro-image-preview": "gemini-3-pro-image",
	"gemini-3-pro-preview": "gemini-3-pro-high",
	"gemini-claude-sonnet-4-5": "claude-sonnet-4-5",
	"claude-sonnet-4-5": "claude-sonnet-4-5",
	"gemini-claude-sonnet-4-5-thinking": "claude-sonnet-4-5-thinking",
	"claude-sonnet-4-5-thinking": "claude-sonnet-4-5-thinking",
	"gemini-claude-opus-4-5-thinking": "claude-opus-4-5-thinking",
	"claude-opus-4-5-thinking": "claude-opus-4-5-thinking",
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
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
		return { type: "object", properties: {} };
	}
	let sanitized: Record<string, unknown>;
	try {
		sanitized = JSON.parse(JSON.stringify(schema));
	} catch {
		return { type: "object", properties: {} };
	}
	const cleanRecursive = (s: Record<string, unknown>) => {
		if (!s) {
			return;
		}
		if (Array.isArray(s.type)) {
			const typeCandidates = s.type.filter((t) => t !== "null");
			const preferredType = typeCandidates.find(
				(t) => typeof t === "string" && t.trim() !== "",
			);
			s.type = preferredType ?? "object";
		}
		if (s.nullable === true) {
			delete s.nullable;
		}
		if (Array.isArray(s.properties)) {
			const mapped: Record<string, unknown> = {};
			for (const item of s.properties) {
				if (!item || typeof item !== "object") {
					continue;
				}
				const entry = item as Record<string, unknown>;
				const name = entry.name ?? entry.key;
				const value = entry.value ?? entry.schema ?? entry.property;
				if (typeof name === "string" && value && typeof value === "object") {
					mapped[name] = value;
				}
			}
			s.properties = mapped;
		}
		if (Array.isArray(s.items)) {
			const firstItem = s.items[0];
			s.items =
				firstItem && typeof firstItem === "object" ? firstItem : undefined;
		}
		if (typeof s.type === "string") {
			s.type = s.type.toLowerCase();
		}
		for (const key of Object.keys(s)) {
			if (GEMINI_UNSUPPORTED_FIELDS.has(key)) {
				delete s[key];
			}
		}
		for (const nested of [
			s.properties,
			s.items,
			s.additionalProperties,
			s.patternProperties,
			s.propertyNames,
			s.contains,
		]) {
			if (nested && typeof nested === "object" && !Array.isArray(nested)) {
				cleanRecursive(nested as Record<string, unknown>);
			}
			if (Array.isArray(nested)) {
				for (const item of nested) {
					if (item && typeof item === "object") {
						cleanRecursive(item as Record<string, unknown>);
					}
				}
			}
		}
		if (s.properties && typeof s.properties === "object") {
			for (const v of Object.values(s.properties)) {
				if (v && typeof v === "object") {
					cleanRecursive(v as Record<string, unknown>);
				}
			}
		}
	};
	cleanRecursive(sanitized);
	if (
		typeof sanitized.type !== "string" ||
		!sanitized.type.trim() ||
		sanitized.type === "None"
	) {
		sanitized.type = "object";
	}
	if (!sanitized.properties || typeof sanitized.properties !== "object") {
		sanitized.properties = {};
	}
	return sanitized;
}

function convertToolCallsToGeminiParts(
	toolCalls: readonly vscode.LanguageModelToolCallPart[],
	sessionId?: string,
): Array<Record<string, unknown>> {
	return toolCalls.map((toolCall) => {
		const signature = getSignatureForToolCall(toolCall.callId, sessionId);
		if (signature === FALLBACK_SIGNATURE) {
			storeToolCallSignature(toolCall.callId, signature);
		}
		return {
			functionCall: {
				name: toolCall.name,
				id: toolCall.callId,
				args: toolCall.input,
			},
			thoughtSignature: signature,
		};
	});
}

function convertMessagesToGemini(
	messages: readonly vscode.LanguageModelChatMessage[],
	modelConfig: ModelConfig,
	resolvedModelName?: string,
	sessionId?: string,
): { contents: GeminiContent[]; systemInstruction?: Record<string, unknown> } {
	const contents: GeminiContent[] = [];
	let systemText = "";
	const toolIdToName = new Map<string, string>();

	for (const m of messages) {
		if (m.role === vscode.LanguageModelChatMessageRole.Assistant) {
			for (const p of m.content) {
				if (p instanceof vscode.LanguageModelToolCallPart) {
					toolIdToName.set(p.callId, p.name);
				}
			}
		}
	}

	const isThinkingEnabled =
		modelConfig.outputThinking !== false ||
		modelConfig.includeThinking === true;
	const modelName = (
		resolvedModelName ||
		modelConfig.model ||
		""
	).toLowerCase();
	const isClaudeModel = modelName.includes("claude");
	const nonSystemMessages = messages.filter(
		(m) => m.role !== vscode.LanguageModelChatMessageRole.System,
	);
	const msgCount = nonSystemMessages.length;
	let currentMsgIndex = 0;

	for (const message of messages) {
		if (message.role === vscode.LanguageModelChatMessageRole.System) {
			systemText = message.content
				.filter((p) => p instanceof vscode.LanguageModelTextPart)
				.map((p) => (p as vscode.LanguageModelTextPart).value)
				.join("\n");
			continue;
		}
		currentMsgIndex++;

		if (message.role === vscode.LanguageModelChatMessageRole.User) {
			const parts: Array<Record<string, unknown>> = [];
			const text = message.content
				.filter((p) => p instanceof vscode.LanguageModelTextPart)
				.map((p) => (p as vscode.LanguageModelTextPart).value)
				.join("\n");
			if (text) {
				parts.push({ text });
			}
			for (const part of message.content) {
				if (
					part instanceof vscode.LanguageModelDataPart &&
					part.mimeType.toLowerCase().startsWith("image/")
				) {
					parts.push({
						inlineData: {
							mimeType: part.mimeType,
							data: Buffer.from(part.data).toString("base64"),
						},
					});
				}
				if (part instanceof vscode.LanguageModelToolResultPart) {
					const name = toolIdToName.get(part.callId) || "unknown";
					let content = "";
					if (typeof part.content === "string") {
						content = part.content;
					} else if (Array.isArray(part.content)) {
						content = part.content
							.map((r) =>
								r instanceof vscode.LanguageModelTextPart
									? r.value
									: JSON.stringify(r),
							)
							.join("\n");
					} else {
						content = JSON.stringify(part.content);
					}
					let response: Record<string, unknown> = { content };
					try {
						const parsed = JSON.parse(content.trim());
						if (parsed && typeof parsed === "object") {
							response = Array.isArray(parsed) ? { result: parsed } : parsed;
						}
					} catch {
						// Ignore
					}
					parts.push({ functionResponse: { name, id: part.callId, response } });
				}
			}
			if (parts.length > 0) {
				contents.push({ role: "user", parts: parts as GeminiContent["parts"] });
			}
			continue;
		}

		if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
			let parts: Array<Record<string, unknown>> = [];
			const includeThinking =
				!isClaudeModel &&
				(modelConfig.includeThinking === true ||
					modelConfig.outputThinking !== false);
			if (includeThinking) {
				for (const part of message.content) {
					if (part instanceof vscode.LanguageModelThinkingPart) {
						const value = Array.isArray(part.value)
							? part.value.join("")
							: part.value;
						if (value) {
							parts.push({ text: value, thought: true });
						}
						break;
					}
				}
			}
			const text = message.content
				.filter((p) => p instanceof vscode.LanguageModelTextPart)
				.map((p) => (p as vscode.LanguageModelTextPart).value)
				.join("\n");
			if (text) {
				parts.push({ text });
			}
			const toolCalls = message.content.filter(
				(p) => p instanceof vscode.LanguageModelToolCallPart,
			) as vscode.LanguageModelToolCallPart[];
			if (toolCalls.length > 0) {
				parts.push(...convertToolCallsToGeminiParts(toolCalls, sessionId));
			}
			if (isClaudeModel) {
				parts = parts.filter((p) => p.thought !== true);
			}
			if (
				!isClaudeModel &&
				isThinkingEnabled &&
				currentMsgIndex === msgCount &&
				!parts.some((p) => p.thought === true)
			) {
				parts.unshift({ text: "Thinking...", thought: true });
			}
			if (parts.length > 0) {
				contents.push({
					role: "model",
					parts: parts as GeminiContent["parts"],
				});
			}
		}
	}
	return {
		contents,
		systemInstruction: systemText
			? { role: "user", parts: [{ text: systemText }] }
			: undefined,
	};
}

export interface PreparedRequest {
	payload: AntigravityPayload;
	sessionId: string;
	resolvedModel: string;
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
		const thinkingBudget = modelConfig.thinkingBudget || 10000;
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
					name: tool.name,
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
