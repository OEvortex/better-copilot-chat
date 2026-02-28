import crypto from "node:crypto";
import * as vscode from "vscode";
import { AccountQuotaCache } from "../../accounts/accountQuotaCache";
import type { ModelConfig } from "../../types/sharedTypes";
import { ConfigManager } from "../../utils/configManager";
import { Logger } from "../../utils/logger";
import { TokenCounter } from "../../utils/tokenCounter";
import { TokenTelemetryTracker } from "../../utils/tokenTelemetryTracker";
import { OpenAIStreamProcessor } from "../openai/openaiStreamProcessor";
import { GeminiOAuthManager } from "./auth";
import { GeminiStreamProcessor } from "./streamProcessor";
import {
	ErrorCategory,
	GEMINI_CLI_HEADERS,
	SKIP_THOUGHT_SIGNATURE,
	type GeminiContent,
	type GeminiPayload,
	type GeminiRequest,
} from "./types";

export const DEFAULT_BASE_URLS = ["https://cloudcode-pa.googleapis.com"];
export const DEFAULT_USER_AGENT = GEMINI_CLI_HEADERS["User-Agent"];

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

const thoughtSignatureStore = new Map<string, string>();
const FALLBACK_THOUGHT_SIGNATURE = SKIP_THOUGHT_SIGNATURE;

export function storeThoughtSignature(callId: string, signature: string): void {
	if (callId && signature) {
		thoughtSignatureStore.set(callId, signature);
	}
}

export function categorizeHttpStatus(statusCode: number): ErrorCategory {
	switch (statusCode) {
		case 400:
			return ErrorCategory.UserError;
		case 401:
			return ErrorCategory.AuthError;
		case 402:
		case 403:
			return ErrorCategory.QuotaError;
		case 404:
			return ErrorCategory.NotFound;
		case 500:
		case 502:
		case 503:
		case 504:
			return ErrorCategory.Transient;
		default:
			return ErrorCategory.Unknown;
	}
}

export function shouldFallback(category: ErrorCategory): boolean {
	return (
		category === ErrorCategory.QuotaError ||
		category === ErrorCategory.Transient ||
		category === ErrorCategory.AuthError
	);
}

export function isPermissionDeniedError(
	statusCode: number | undefined,
	bodyText: string | undefined,
): boolean {
	if (statusCode !== 403 || !bodyText) {
		return false;
	}
	if (bodyText.toLowerCase().includes("permission denied")) {
		return true;
	}
	try {
		const parsed = JSON.parse(bodyText);
		if (parsed?.error?.status === "PERMISSION_DENIED") {
			return true;
		}
		const details = parsed?.error?.details;
		if (Array.isArray(details)) {
			for (const detail of details) {
				if (
					detail["@type"] === "type.googleapis.com/google.rpc.ErrorInfo" &&
					detail.reason === "CONSUMER_INVALID"
				) {
					return true;
				}
			}
		}
	} catch {
		/* Ignore JSON parse errors */
	}
	return false;
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
): Array<Record<string, unknown>> {
	return toolCalls.map((toolCall) => {
		const storedSignature = thoughtSignatureStore.get(toolCall.callId);
		const signature = storedSignature || FALLBACK_THOUGHT_SIGNATURE;
		if (!storedSignature) {
			thoughtSignatureStore.set(toolCall.callId, signature);
		}
		let args: unknown = toolCall.input;
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args) as unknown;
			} catch {
				args = { value: args };
			}
		}
		if (!args || typeof args !== 'object' || Array.isArray(args)) {
			args = { value: args };
		}
		return {
			functionCall: {
				name: toolCall.name,
				id: toolCall.callId,
				args,
			},
			thoughtSignature: signature,
		};
	});
}

export function extractToolCallFromGeminiResponse(
	part: Record<string, unknown>,
): {
	callId?: string;
	name?: string;
	args?: unknown;
	thoughtSignature?: string;
} | null {
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
		args: functionCall.args,
		thoughtSignature: part.thoughtSignature as string | undefined,
	};
}

export interface GeminiResponseGroundingMetadata {
	groundingChunks?: Array<{ web?: { title?: string; url?: string } }>;
	groundingSupports?: Array<{
		startIndex?: number;
		endIndex?: number;
		text?: string;
	}>;
}

export interface GeminiResponseCandidate {
	content?: {
		parts?: Array<Record<string, unknown>>;
	};
	groundingMetadata?: GeminiResponseGroundingMetadata;
}

export function extractGeminiResponseCandidates(
	payload: unknown,
): GeminiResponseCandidate[] {
	if (!payload || typeof payload !== "object") {
		return [];
	}

	const root = payload as Record<string, unknown>;
	const responseRoot =
		root.response && typeof root.response === "object"
			? (root.response as Record<string, unknown>)
			: root;
	const candidates = responseRoot.candidates;

	if (!Array.isArray(candidates)) {
		return [];
	}

	return candidates.filter(
		(candidate): candidate is GeminiResponseCandidate =>
			!!candidate && typeof candidate === "object",
	);
}

export function extractTextFromGeminiCandidates(
	candidates: GeminiResponseCandidate[],
): string {
	const textSegments: string[] = [];

	for (const candidate of candidates) {
		const parts = candidate.content?.parts;
		if (!Array.isArray(parts)) {
			continue;
		}

		for (const part of parts) {
			if (!part || typeof part !== "object") {
				continue;
			}
			if (part.thought === true) {
				continue;
			}
			if (typeof part.text === "string" && part.text.trim()) {
				textSegments.push(part.text.trim());
			}
		}
	}

	return textSegments.join("\n\n");
}

export function extractGroundingMetadataFromGeminiCandidates(
	candidates: GeminiResponseCandidate[],
): GeminiResponseGroundingMetadata | undefined {
	for (const candidate of candidates) {
		if (candidate.groundingMetadata) {
			return candidate.groundingMetadata;
		}
	}

	return undefined;
}

export function parseGeminiSSECandidates(
	sseText: string,
): GeminiResponseCandidate[] {
	const lines = sseText.split(/\r?\n/);
	const aggregatedCandidates: GeminiResponseCandidate[] = [];
	let sseDataParts: string[] = [];

	const flushEvent = () => {
		if (sseDataParts.length === 0) {
			return;
		}

		const eventData = sseDataParts.join("\n").trim();
		sseDataParts = [];

		if (!eventData || eventData === "[DONE]") {
			return;
		}

		try {
			const parsed = JSON.parse(eventData) as unknown;
			aggregatedCandidates.push(...extractGeminiResponseCandidates(parsed));
		} catch {
			// Ignore non-JSON or partial chunks
		}
	};

	for (const line of lines) {
		if (line.trim().length === 0) {
			flushEvent();
			continue;
		}

		if (!line.startsWith("data:")) {
			continue;
		}

		const payload = line.slice(5).trimStart();
		if (payload === "[DONE]") {
			flushEvent();
			continue;
		}

		if (payload) {
			sseDataParts.push(payload);
		}
	}

	flushEvent();
	return aggregatedCandidates;
}

class MessageConverter {
	convertMessagesToGemini(
		messages: readonly vscode.LanguageModelChatMessage[],
		modelConfig: ModelConfig,
		resolvedModelName?: string,
	): {
		contents: GeminiContent[];
		systemInstruction?: Record<string, unknown>;
	} {
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
		const _isThinkingEnabled =
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
							/* Ignore */
						}
						parts.push({
							functionResponse: { name, id: part.callId, response },
						});
					}
				}
				if (parts.length > 0) {
					contents.push({
						role: "user",
						parts: parts as GeminiContent["parts"],
					});
				}
				continue;
			}
			if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
				let parts: Array<Record<string, unknown>> = [];
				const includeThinking =
					!isClaudeModel &&
					(modelConfig.includeThinking === true ||
						modelConfig.outputThinking !== false);
				const toolCalls = message.content.filter(
					(p) => p instanceof vscode.LanguageModelToolCallPart,
				) as vscode.LanguageModelToolCallPart[];

				// IMPORTANT: When there are tool calls, DON'T add separate thought parts
				// The functionCall parts will include thoughtSignatures from the stored signatures
				// Adding separate thought parts would create a mismatch between functionCall and functionResponse counts
				if (includeThinking && toolCalls.length === 0) {
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
				if (toolCalls.length > 0) {
					parts.push(...convertToolCallsToGeminiParts(toolCalls));
				}
				if (isClaudeModel) {
					parts = parts.filter((p) => p.thought !== true);
				}
				if (
					!isClaudeModel &&
					toolCalls.length === 0 &&
					includeThinking &&
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
}

class FromIRTranslator {
	private readonly messageConverter = new MessageConverter();

	buildGeminiPayload(
		model: vscode.LanguageModelChatInformation,
		modelConfig: ModelConfig,
		messages: readonly vscode.LanguageModelChatMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		modelName: string,
		projectId: string,
	): GeminiPayload {
		const maxOutputTokens = ConfigManager.getMaxTokensForModel(
			model.maxOutputTokens,
		);
		const resolvedModel = modelName.toLowerCase();
		const { contents, systemInstruction } =
			this.messageConverter.convertMessagesToGemini(
				messages,
				modelConfig,
				resolvedModel,
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

		const isImageModel = isImageGenerationModel(resolvedModel);

		if (isThinkingEnabled && !isImageModel) {
			console.log("GeminiCLI: Thinking enabled for model:", resolvedModel);
			
			// Read thinking configuration from VS Code settings
			const config = vscode.workspace.getConfiguration("chp.geminicli");
			const thinkingLevel = config.get<string>("thinkingLevel") || "high";
			const thinkingBudget = config.get<number>("thinkingBudget") || 8192;
			
			if (isClaudeThinkingModel) {
				const budget = modelConfig.thinkingBudget || thinkingBudget;
				if (maxOutputTokens < budget + 1000) {
					generationConfig.maxOutputTokens = budget + 1000;
				}
				generationConfig.thinkingConfig = {
					includeThoughts: true,
					thinkingBudget: budget,
				};
			} else if (isGemini3Model(resolvedModel)) {
				// Gemini 3 uses thinkingLevel (string)
				generationConfig.thinkingConfig = {
					includeThoughts: true,
					thinkingLevel: thinkingLevel.toLowerCase(),
				};
			} else if (isGemini25Model(resolvedModel)) {
				// Gemini 2.5 uses thinkingBudget (numeric)
				const budget = modelConfig.thinkingBudget || thinkingBudget;
				generationConfig.thinkingConfig = {
					includeThoughts: true,
					thinkingBudget: budget,
				};
			} else {
				console.log(
					"GeminiCLI: Model does not support thinking:",
					resolvedModel,
				);
			}
		} else if (isImageModel) {
			console.log("GeminiCLI: Image model detected, disabling thinking and adding imageConfig");
			// Image models don't support thinking
			delete generationConfig.thinkingConfig;
			// Add imageConfig if needed (reference code had buildImageGenerationConfig)
			(generationConfig as any).imageConfig = {
				aspectRatio: process.env.OPENCODE_IMAGE_ASPECT_RATIO || "1:1",
			};
		}

		const request: GeminiRequest = {
			contents,
			generationConfig: generationConfig as GeminiRequest["generationConfig"],
		};
		if (systemInstruction) {
			request.systemInstruction = systemInstruction as unknown as GeminiContent;
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
		if (modelConfig.extraBody && typeof modelConfig.extraBody === "object") {
			Object.assign(request, modelConfig.extraBody);
		}
		const uuid = crypto.randomUUID
			? crypto.randomUUID()
			: crypto.randomBytes(16).toString("hex");
		const userPromptId = `agent-${uuid}`;

		// IMPORTANT: Match the official Code Assist API request schema used by google-gemini/gemini-cli
		// (model/project/user_prompt_id/request + optional request.session_id)
		// Transform model name: strip "google/" prefix if present
		const apiModelName = modelName.replace(/^google\//, "");
		const payload: GeminiPayload = {
			model: apiModelName,
			user_prompt_id: userPromptId,
			request,
		};
		if (projectId) {
			payload.project = projectId;
		}

		// DEBUG: Validate parts count to prevent "function response parts mismatch" error
		this.validatePartsBalance(request.contents, resolvedModel);
		// Attempt to automatically balance and fix any mismatches before sending the request
		this.balanceFunctionCallResponses(request.contents, resolvedModel);

		return payload;
	}

	/**
	 * Validate that functionCall and functionResponse parts are balanced
	 * This prevents the "Please ensure that the number of function response parts is equal to
	 * the number of function call parts of the function call turn" error
	 */
	private validatePartsBalance(
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
				// Count thoughtSignature as a separate part issue
				if (part.thoughtSignature && !part.functionCall) {
					totalThoughtSignatureParts++;
				}
			}
		}

		console.log(
			`GeminiCLI: Parts validation - functionCalls=${totalFunctionCalls}, functionResponses=${totalFunctionResponses}, orphanThoughtSignatures=${totalThoughtSignatureParts}`,
		);

		if (totalFunctionCalls !== totalFunctionResponses) {
			console.warn(
				`GeminiCLI: WARNING - Function call/response mismatch! calls=${totalFunctionCalls}, responses=${totalFunctionResponses}. Attempting to automatically balance parts before sending.`,
			);
		}

		if (totalThoughtSignatureParts > 0) {
			console.warn(
				`GeminiCLI: WARNING - Found ${totalThoughtSignatureParts} thoughtSignature parts without functionCall. Attempting to reattach them to the nearest functionCall part.`,
			);
		}
	}

	/**
	 * Attempt to automatically balance functionCall/functionResponse parts and reattach orphan thoughtSignatures.
	 * This mutates the contents array in-place to fix common causes of the "function response parts" 400 error.
	 */
	private balanceFunctionCallResponses(
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

		// Track orphan thoughtSignatures to try to reattach
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
					// If thoughtSignature was on a separate part earlier, try to attach later
					if (part.thoughtSignature) {
						// normalize to string
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

		// For every function call with no response, append a user content that contains an empty response
		for (const [id, info] of callsById.entries()) {
			const responseKey = id;
			if (!responsesById.has(responseKey)) {
				contents.push({
					role: "user",
					parts: [
						{ functionResponse: { name: info.name || "", id, response: {} } },
					],
				});
				console.log(
					`GeminiCLI: Added placeholder functionResponse for id=${id} name=${info.name || ""}`,
				);
			}
		}

		// Convert orphan functionResponse parts (that don't have a matching call id) into text parts or remove them
		for (const [key, arr] of responsesById.entries()) {
			// Key can be id or name-based key; it is only orphan if not present in callsById
			if (!callsById.has(key)) {
				for (let i = arr.length - 1; i >= 0; i--) {
					const loc = arr[i];
					const c = contents[loc.contentIndex];
					const p = c.parts[loc.partIndex] as any;
					const resp = p.functionResponse?.response;
					if (resp && Object.keys(resp).length > 0) {
						// replace with text part containing the serialized response
						c.parts[loc.partIndex] = { text: JSON.stringify(resp) };
					} else {
						// remove empty orphan response
						c.parts.splice(loc.partIndex, 1);
					}
				}
				console.warn(
					`GeminiCLI: Converted/removed ${arr.length} orphan functionResponse(s) for key=${key}`,
				);
			}
		}

		// Attempt to reattach orphan thoughtSignatures to the nearest functionCall
		for (const orphan of orphanThoughts) {
			const { signature, contentIndex, partIndex } = orphan;
			let attached = false;
			// Search same content for a functionCall
			const content = contents[contentIndex];
			if (content) {
				const idx = content.parts.findIndex((p) => (p as any).functionCall);
				if (idx !== -1) {
					(content.parts[idx] as any).thoughtSignature = signature;
					// remove signature from original part
					delete (content.parts[partIndex] as any).thoughtSignature;
					attached = true;
				}
			}
			if (!attached) {
				// search previous contents
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
				// search next contents
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
				// Couldn't attach; just remove the orphan signature to avoid API errors
				delete (contents[contentIndex].parts[partIndex] as any)
					.thoughtSignature;
				console.warn(
					`GeminiCLI: Removed orphan thoughtSignature at content=${contentIndex} part=${partIndex} - no functionCall found to attach to.`,
				);
			}
		}

		// Remove any empty contents
		for (let i = contents.length - 1; i >= 0; i--) {
			if (!contents[i].parts || contents[i].parts.length === 0) {
				contents.splice(i, 1);
			}
		}
	}
}

export class GeminiHandler {
	private readonly accountQuotaCache = AccountQuotaCache.getInstance();
	private readonly fromIRTranslator = new FromIRTranslator();
	private cacheUpdateTimers = new Map<string, NodeJS.Timeout>();
	private pendingCacheUpdates = new Map<string, () => Promise<void>>();
	private projectIdCache: string | null = null;
	private projectIdPromise: Promise<string> | null = null;

	constructor(private readonly displayName: string) {}

	async handleRequest(
		model: vscode.LanguageModelChatInformation,
		modelConfig: ModelConfig,
		messages: readonly vscode.LanguageModelChatMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		token: vscode.CancellationToken,
		accessToken?: string,
		accountId?: string,
		loadBalanceEnabled?: boolean,
	): Promise<void> {
		const authToken =
			accessToken || (await GeminiOAuthManager.getInstance().getAccessToken());
		if (!authToken) {
			throw new Error("Not logged in to Gemini CLI. Please login first.");
		}
		const resolvedModel = modelConfig.model || model.id;
		const effectiveAccountId = accountId || "default-gemini";

		// IMPORTANT: some tiers require a project, and some accounts need to be "loaded" via loadCodeAssist
		// before generate/stream works reliably.
		const projectId = await this.getProjectId(authToken, modelConfig.baseUrl);
		const payload = this.fromIRTranslator.buildGeminiPayload(
			model,
			modelConfig,
			messages,
			options,
			resolvedModel,
			projectId,
		);
		const baseUrls = modelConfig.baseUrl
			? [modelConfig.baseUrl.replace(/\/v1internal\/?$/, "")]
			: [...DEFAULT_BASE_URLS];
		const abortController = new AbortController();
		const cancelListener = token.onCancellationRequested(() =>
			abortController.abort(),
		);
		progress.report(new vscode.LanguageModelTextPart(""));
		let lastStatus = 0,
			lastBody = "",
			lastError: Error | null = null;

		try {
			for (let idx = 0; idx < baseUrls.length; idx++) {
				const url = `${baseUrls[idx].replace(/\/$/, "")}/v1internal:streamGenerateContent?alt=sse`;
				if (token.isCancellationRequested) {
					throw new vscode.CancellationError();
				}
				try {
					const result = await this.streamRequest(
						url,
						authToken,
						payload,
						modelConfig,
						progress,
						token,
						abortController,
					);
					if (result.success) {
						this.debouncedCacheUpdate(
							`success-${effectiveAccountId}`,
							() =>
								this.accountQuotaCache.recordSuccess(
									effectiveAccountId,
									"gemini",
									this.displayName,
								),
							50,
						);
						try {
							const promptTokens =
								await TokenCounter.getInstance().countMessagesTokens(
									model,
									[...messages],
									{ sdkMode: modelConfig.sdkMode || "openai" },
									options,
								);
							TokenTelemetryTracker.getInstance().recordSuccess({
								modelId: model.id,
								modelName: model.name,
								providerId: "gemini",
								promptTokens,
								completionTokens: 0,
								totalTokens: promptTokens,
								maxInputTokens: model.maxInputTokens,
								maxOutputTokens: model.maxOutputTokens,
								estimatedPromptTokens: true
							});
						} catch (e) {
							Logger.trace(
								`[GeminiCLI] Failed to estimate prompt tokens: ${String(e)}`,
							);
						}
						return;
					}
					if (isPermissionDeniedError(result.status, result.body)) {
						this.debouncedCacheUpdate(
							`failure-${effectiveAccountId}`,
							() =>
								this.accountQuotaCache.recordFailure(
									effectiveAccountId,
									"gemini",
									`HTTP ${result.status || 403}: ${result.body || "Permission denied"}`,
									this.displayName,
								),
							50,
						);
						throw new Error(
							result.body || "Permission denied on Gemini project.",
						);
					}
					const category = categorizeHttpStatus(result.status || 0);
					if (category === ErrorCategory.QuotaError) {
						lastStatus = result.status || 0;
						lastBody = result.body || "";
						if (idx + 1 < baseUrls.length) {
							continue;
						}
						throw new Error(
							lastBody || `HTTP ${result.status} ${result.statusText}`,
						);
					}
					if (
						category === ErrorCategory.Transient &&
						shouldFallback(category) &&
						idx + 1 < baseUrls.length
					) {
						lastStatus = result.status || 0;
						lastBody = result.body || "";
						continue;
					}
					if (category === ErrorCategory.AuthError) {
						throw new Error(
							`Authentication failed (401). Please re-login to Gemini CLI.`,
						);
					}
					if (result.status === 404 && idx + 1 < baseUrls.length) {
						lastStatus = result.status;
						lastBody = result.body || "";
						continue;
					}
					throw new Error(
						result.body || `HTTP ${result.status} ${result.statusText}`,
					);
				} catch (error) {
					if (error instanceof vscode.CancellationError) {
						throw error;
					}
					if (
						error instanceof Error &&
						(error.message.startsWith("Quota exceeded") ||
							error.message.startsWith("HTTP") ||
							error.message.startsWith("Authentication failed"))
					) {
						throw error;
					}
					lastStatus = 0;
					lastBody = "";
					lastError = error instanceof Error ? error : new Error(String(error));
					if (idx + 1 < baseUrls.length) {
						continue;
					}
					throw error;
				}
			}
			if (lastStatus !== 0) {
				throw new Error(`HTTP ${lastStatus}: ${lastBody}`);
			}
			if (lastError) {
				throw lastError;
			}
			throw new Error("All Gemini endpoints unavailable");
		} finally {
			cancelListener.dispose();
		}
	}

	private async getProjectId(
		accessToken: string,
		baseUrl?: string,
	): Promise<string> {
		if (this.projectIdCache) {
			return this.projectIdCache;
		}
		if (this.projectIdPromise) {
			return this.projectIdPromise;
		}

		this.projectIdPromise = (async () => {
			try {
				// Match the official gemini-cli approach: call loadCodeAssist to discover tier/project.
				// For FREE tier, the response may not include a project and that's OK.
				const urlBase = (
					baseUrl || "https://cloudcode-pa.googleapis.com/v1internal"
				).replace(/\/$/, "");
				const loadUrl = urlBase.includes("/v1internal")
					? `${urlBase}:loadCodeAssist`
					: `${urlBase.replace(/\/$/, "")}/v1internal:loadCodeAssist`;

				const envProject =
					process.env.GOOGLE_CLOUD_PROJECT ||
					process.env.GOOGLE_CLOUD_PROJECT_ID ||
					"";
				const res = await fetch(loadUrl, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						"Content-Type": "application/json",
						"User-Agent": GEMINI_CLI_HEADERS["User-Agent"],
						"X-Goog-Api-Client": GEMINI_CLI_HEADERS["X-Goog-Api-Client"],
						"Client-Metadata": GEMINI_CLI_HEADERS["Client-Metadata"],
					},
					body: JSON.stringify({
						cloudaicompanionProject: envProject || undefined,
						metadata: {
							ideType: "IDE_UNSPECIFIED",
							platform: "PLATFORM_UNSPECIFIED",
							pluginType: "GEMINI",
						},
					}),
				});

				if (!res.ok) {
					this.projectIdCache = "";
					return "";
				}
				const text = await res.text();
				let data: Record<string, unknown>;
				try {
					data = JSON.parse(text);
				} catch {
					this.projectIdCache = "";
					return "";
				}

				const rawProject = data?.cloudaicompanionProject;
				let projectId = "";
				if (typeof rawProject === "string") {
					projectId = rawProject.trim();
				} else if (
					rawProject &&
					typeof rawProject === "object" &&
					typeof (rawProject as { id?: string }).id === "string"
				) {
					projectId = (rawProject as { id: string }).id.trim();
				}

				this.projectIdCache = projectId;
				return projectId;
			} catch {
				this.projectIdCache = "";
				return "";
			} finally {
				this.projectIdPromise = null;
			}
		})();

		return this.projectIdPromise;
	}

	private async streamRequest(
		url: string,
		accessToken: string,
		payload: GeminiPayload,
		modelConfig: ModelConfig,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		token: vscode.CancellationToken,
		abortController: AbortController,
	): Promise<{
		success: boolean;
		status?: number;
		statusText?: string;
		body?: string;
	}> {
		let response: Response;
		try {
			response = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
					Accept: "text/event-stream",
					"User-Agent": GEMINI_CLI_HEADERS["User-Agent"],
					"X-Goog-Api-Client": GEMINI_CLI_HEADERS["X-Goog-Api-Client"],
					"Client-Metadata": GEMINI_CLI_HEADERS["Client-Metadata"],
				},
				body: JSON.stringify(payload),
				signal: abortController.signal,
			});
		} catch (error) {
			if (token.isCancellationRequested || abortController.signal.aborted) {
				throw new vscode.CancellationError();
			}
			throw error;
		}
		if (!response.ok) {
			return {
				success: false,
				status: response.status,
				statusText: response.statusText,
				body: await response.text(),
			};
		}
		if (
			modelConfig.sdkMode === "openai" ||
			modelConfig.sdkMode === "openai-sse"
		) {
			await new OpenAIStreamProcessor().processStream({
				response,
				modelConfig,
				progress,
				token,
			});
		} else {
			await new GeminiStreamProcessor().processStream({
				response,
				modelConfig,
				progress,
				token,
			});
		}
		return { success: true };
	}

	private debouncedCacheUpdate(
		key: string,
		updateFn: () => Promise<void>,
		delayMs: number,
	): void {
		const existingTimer = this.cacheUpdateTimers.get(key);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}
		this.pendingCacheUpdates.set(key, updateFn);
		const timer = setTimeout(() => {
			const fn = this.pendingCacheUpdates.get(key);
			if (fn) {
				void fn().catch(() => {});
				this.pendingCacheUpdates.delete(key);
			}
			this.cacheUpdateTimers.delete(key);
		}, delayMs);
		this.cacheUpdateTimers.set(key, timer);
	}
}

export function isGeminiModel(model: string): boolean {
	const lower = model.toLowerCase();
	return lower.includes("gemini") && !lower.includes("claude");
}

export function isGemini3Model(model: string): boolean {
	return model.toLowerCase().includes("gemini-3");
}

export function isGemini25Model(model: string): boolean {
	return model.toLowerCase().includes("gemini-2.5");
}

export function isImageGenerationModel(model: string): boolean {
	const lower = model.toLowerCase();
	return lower.includes("image") || lower.includes("imagen");
}
