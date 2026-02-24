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
		for (const composite of ["anyOf", "oneOf", "allOf"]) {
			const branch = s[composite] as unknown;
			if (Array.isArray(branch) && branch.length > 0) {
				let preferred: Record<string, unknown> | undefined;
				for (const option of branch) {
					if (option && typeof option === "object") {
						preferred = option as Record<string, unknown>;
						if (preferred.type === "string") {
							break;
						}
					}
				}
				const selected = preferred ?? (branch[0] as Record<string, unknown>);
				for (const key of Object.keys(s)) {
					delete s[key];
				}
				Object.assign(s, selected);
				break;
			}
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

		if (s.properties && typeof s.properties === "object" && !Array.isArray(s.properties)) {
			const cleanedProperties: Record<string, unknown> = {};
			const propKeys = Object.keys(s.properties);
			
			for (const key of propKeys) {
				const val = (s.properties as Record<string, unknown>)[key];
				if (val && typeof val === "object" && !Array.isArray(val)) {
					// Sanitize key name to match [a-zA-Z0-9_]*
					const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "_");
					cleanedProperties[safeKey] = val;
					cleanRecursive(val as Record<string, unknown>);
				}
			}
			s.properties = cleanedProperties;
		}

		// Robust filtering of required fields (must be after properties cleaning)
		if (s.required && Array.isArray(s.required)) {
			if (
				s.properties &&
				typeof s.properties === "object" &&
				!Array.isArray(s.properties)
			) {
				const propKeys = new Set(Object.keys(s.properties));
				const filteredRequired = (s.required as unknown[]).filter(
					(key) => typeof key === "string" && propKeys.has(key.replace(/[^a-zA-Z0-9_]/g, "_")),
				) as string[];

				if (filteredRequired.length > 0) {
					s.required = filteredRequired.map(k => k.replace(/[^a-zA-Z0-9_]/g, "_"));
				} else {
					delete s.required;
				}
			} else {
				delete s.required;
			}
		}

		// Handle nested schemas in objects and arrays
		if (s.items) {
			if (Array.isArray(s.items)) {
				for (const item of s.items) {
					if (item && typeof item === "object") {
						cleanRecursive(item as Record<string, unknown>);
					}
				}
			} else if (typeof s.items === "object") {
				cleanRecursive(s.items as Record<string, unknown>);
			}
		}

		if (s.additionalProperties && typeof s.additionalProperties === "object") {
			cleanRecursive(s.additionalProperties as Record<string, unknown>);
		}

		if (s.patternProperties && typeof s.patternProperties === "object") {
			for (const v of Object.values(s.patternProperties)) {
				if (v && typeof v === "object") {
					cleanRecursive(v as Record<string, unknown>);
				}
			}
		}

		if (s.propertyNames && typeof s.propertyNames === "object") {
			cleanRecursive(s.propertyNames as Record<string, unknown>);
		}

		if (s.contains && typeof s.contains === "object") {
			cleanRecursive(s.contains as Record<string, unknown>);
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

/**
 * Validate that functionCall and functionResponse parts are balanced
 */
function validatePartsBalance(
	contents: GeminiContent[],
	_modelName: string,
): void {
	let totalFunctionCalls = 0;
	let totalFunctionResponses = 0;
	let totalThoughtSignatureParts = 0;

	for (const content of contents) {
		for (const part of content.parts) {
			if (part.functionCall) {
				totalFunctionCalls++;
			}
			if (part.functionResponse) {
				totalFunctionResponses++;
			}
			if (part.thoughtSignature && !part.functionCall) {
				totalThoughtSignatureParts++;
			}
		}
	}

	if (totalFunctionCalls !== totalFunctionResponses) {
		console.warn(
			`Antigravity: WARNING - Function call/response mismatch! calls=${totalFunctionCalls}, responses=${totalFunctionResponses}. Attempting to automatically balance parts before sending.`,
		);
	}

	if (totalThoughtSignatureParts > 0) {
		console.warn(
			`Antigravity: WARNING - Found ${totalThoughtSignatureParts} thoughtSignature parts without functionCall. Attempting to reattach them to the nearest functionCall part.`,
		);
	}
}

/**
 * Attempt to automatically balance functionCall/functionResponse parts and reattach orphan thoughtSignatures.
 */
function balanceFunctionCallResponses(
	contents: GeminiContent[],
	_modelName: string,
): void {
	const callsById = new Map<
		string,
		{ name?: string; contentIndex: number; partIndex: number }
	>();
	const responsesById = new Map<
		string,
		Array<{ contentIndex: number; partIndex: number }>
	>();

	const orphanThoughts: Array<{
		signature: string;
		contentIndex: number;
		partIndex: number;
	}> = [];

	for (let ci = 0; ci < contents.length; ci++) {
		const content = contents[ci];
		for (let pi = 0; pi < content.parts.length; pi++) {
			const part = content.parts[pi] as any;
			if (part.functionCall) {
				const id =
					part.functionCall.id ||
					part.functionCall.callId ||
					`call_${ci}_${pi}`;
				callsById.set(String(id), {
					name: part.functionCall.name,
					contentIndex: ci,
					partIndex: pi,
				});
				if (part.thoughtSignature) {
					part.thoughtSignature = String(part.thoughtSignature);
				}
			} else if (part.functionResponse) {
				const id = part.functionResponse.id;
				const key = id || `__name_${part.functionResponse.name}`;
				const arr = responsesById.get(key) || [];
				arr.push({ contentIndex: ci, partIndex: pi });
				responsesById.set(key, arr);
			}
			if (part.thoughtSignature && !part.functionCall) {
				orphanThoughts.push({
					signature: String(part.thoughtSignature),
					contentIndex: ci,
					partIndex: pi,
				});
			}
		}
	}

	for (const [id, info] of callsById.entries()) {
		if (!responsesById.has(id)) {
			contents.push({
				role: "user",
				parts: [
					{
						functionResponse: { name: info.name || "", id, response: {} },
					} as any,
				],
			});
		}
	}

	for (const [key, arr] of responsesById.entries()) {
		if (!callsById.has(key)) {
			for (let i = arr.length - 1; i >= 0; i--) {
				const loc = arr[i];
				const c = contents[loc.contentIndex];
				const p = c.parts[loc.partIndex] as any;
				const resp = p.functionResponse?.response;
				if (resp && Object.keys(resp).length > 0) {
					c.parts[loc.partIndex] = { text: JSON.stringify(resp) };
				} else {
					c.parts.splice(loc.partIndex, 1);
				}
			}
		}
	}

	for (const orphan of orphanThoughts) {
		const { signature, contentIndex, partIndex } = orphan;
		let attached = false;
		const content = contents[contentIndex];
		if (content) {
			const idx = content.parts.findIndex((p) => (p as any).functionCall);
			if (idx !== -1) {
				(content.parts[idx] as any).thoughtSignature = signature;
				delete (content.parts[partIndex] as any).thoughtSignature;
				attached = true;
			}
		}
		if (!attached) {
			for (let ci = contentIndex - 1; ci >= 0 && !attached; ci--) {
				const idx = contents[ci].parts.findIndex(
					(p) => (p as any).functionCall,
				);
				if (idx !== -1) {
					(contents[ci].parts[idx] as any).thoughtSignature = signature;
					delete (contents[contentIndex].parts[partIndex] as any)
						.thoughtSignature;
					attached = true;
				}
			}
		}
		if (!attached) {
			for (
				let ci = contentIndex + 1;
				ci < contents.length && !attached;
				ci++
			) {
				const idx = contents[ci].parts.findIndex(
					(p) => (p as any).functionCall,
				);
				if (idx !== -1) {
					(contents[ci].parts[idx] as any).thoughtSignature = signature;
					delete (contents[contentIndex].parts[partIndex] as any)
						.thoughtSignature;
					attached = true;
				}
			}
		}
		if (!attached) {
			delete (contents[contentIndex].parts[partIndex] as any)
				.thoughtSignature;
		}
	}

	for (let i = contents.length - 1; i >= 0; i--) {
		if (!contents[i].parts || contents[i].parts.length === 0) {
			contents.splice(i, 1);
		}
	}
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
