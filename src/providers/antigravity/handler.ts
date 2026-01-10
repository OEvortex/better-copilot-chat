import crypto from "node:crypto";
import * as vscode from "vscode";
import { AccountQuotaCache } from "../../accounts/accountQuotaCache";
import type { ModelConfig } from "../../types/sharedTypes";
import { ConfigManager } from "../../utils/configManager";
import { QuotaNotificationManager } from "../../utils/quotaNotificationManager";
import { OpenAIStreamProcessor } from "../openai/openaiStreamProcessor";
import { AntigravityAuth } from "./auth";
import { AntigravityStreamProcessor } from "./streamProcessor";
import {
	type AntigravityPayload,
	ErrorCategory,
	type GeminiContent,
	type GeminiRequest,
	type QuotaState,
	RateLimitAction,
} from "./types";

export const DEFAULT_BASE_URLS = [
	"https://daily-cloudcode-pa.sandbox.googleapis.com",
	"https://cloudcode-pa.googleapis.com",
];
export const DEFAULT_USER_AGENT = "antigravity/1.11.5";
const RATE_LIMIT_MAX_RETRIES = 5;
const RATE_LIMIT_BASE_DELAY_MS = 1000;
const RATE_LIMIT_MAX_DELAY_MS = 30000;
const QUOTA_BACKOFF_BASE_MS = 1000;
const QUOTA_BACKOFF_MAX_MS = 30 * 60 * 1000;
export const QUOTA_EXHAUSTED_THRESHOLD_MS = 10 * 60 * 1000;
export const QUOTA_COOLDOWN_WAIT_MAX_MS = 2 * 60 * 1000;

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
]);

const thoughtSignatureStore = new Map<string, string>();
const FALLBACK_THOUGHT_SIGNATURE = "skip_thought_signature_validator";

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
		case 429:
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

function parseSecondsDuration(duration: string): number | null {
	const match = duration.match(/^(\d+(?:\.\d+)?)s$/);
	return match ? Math.round(parseFloat(match[1]) * 1000) : null;
}

function parseDurationFormat(duration: string): number | null {
	const simpleSeconds = parseSecondsDuration(duration);
	if (simpleSeconds !== null) {
		return simpleSeconds;
	}
	let totalMs = 0;
	const hourMatch = duration.match(/(\d+)h/);
	const minMatch = duration.match(/(\d+)m/);
	const secMatch = duration.match(/(\d+(?:\.\d+)?)s/);
	if (hourMatch) {
		totalMs += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
	}
	if (minMatch) {
		totalMs += parseInt(minMatch[1], 10) * 60 * 1000;
	}
	if (secMatch) {
		totalMs += Math.round(parseFloat(secMatch[1]) * 1000);
	}
	return totalMs > 0 ? totalMs : null;
}

export function parseQuotaRetryDelay(errorBody: string): number | null {
	try {
		const parsed = JSON.parse(errorBody);
		// Handle nested error structure: { "error": { "code": 429, ... } }
		const errorObj = parsed?.error || parsed;
		const details =
			errorObj?.details ||
			(Array.isArray(parsed) ? parsed[0]?.error?.details : null);
		if (!details) {
			// Try to extract retry delay from error message or metadata
			if (errorObj?.metadata?.quotaResetDelay) {
				const d = parseDurationFormat(errorObj.metadata.quotaResetDelay);
				if (d !== null && d > 0) {
					return d;
				}
			}
			return null;
		}
		for (const detail of details) {
			if (
				detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo" &&
				detail.retryDelay
			) {
				const d = parseSecondsDuration(detail.retryDelay);
				if (d !== null && d > 0) {
					return d;
				}
			}
			if (
				detail["@type"] === "type.googleapis.com/google.rpc.ErrorInfo" &&
				detail.metadata?.quotaResetDelay
			) {
				const d = parseDurationFormat(detail.metadata.quotaResetDelay);
				if (d !== null && d > 0) {
					return d;
				}
			}
		}
	} catch {
		/* Ignore JSON parse errors */
	}
	return null;
}

export function sleepWithCancellation(
	ms: number,
	token: vscode.CancellationToken,
): Promise<void> {
	return new Promise((resolve) => {
		if (ms <= 0) {
			resolve();
			return;
		}
		const timeout = setTimeout(resolve, ms);
		const disposable = token.onCancellationRequested(() => {
			clearTimeout(timeout);
			resolve();
		});
		setTimeout(() => disposable.dispose(), ms + 100);
	});
}

export class QuotaStateManager {
	private static instance: QuotaStateManager;
	private modelStates = new Map<string, QuotaState>();
	static getInstance(): QuotaStateManager {
		if (!QuotaStateManager.instance) {
			QuotaStateManager.instance = new QuotaStateManager();
		}
		return QuotaStateManager.instance;
	}

	markQuotaExceeded(modelId: string, retryAfterMs?: number): void {
		const existing = this.modelStates.get(modelId) || {
			isExhausted: false,
			resetsAt: 0,
			lastUpdated: 0,
			exceeded: false,
			nextRecoverAt: 0,
			backoffLevel: 0,
		};
		let cooldown = QUOTA_BACKOFF_BASE_MS * 2 ** (existing.backoffLevel || 0);
		if (cooldown > QUOTA_BACKOFF_MAX_MS) {
			cooldown = QUOTA_BACKOFF_MAX_MS;
		}
		const actualCooldown =
			retryAfterMs && retryAfterMs > cooldown ? retryAfterMs : cooldown;
		this.modelStates.set(modelId, {
			isExhausted: true,
			resetsAt: Date.now() + actualCooldown,
			lastUpdated: Date.now(),
			exceeded: true,
			nextRecoverAt: Date.now() + actualCooldown,
			backoffLevel: (existing.backoffLevel || 0) + 1,
			lastError: `Quota exceeded, retry after ${Math.round(actualCooldown / 1000)}s`,
		});
	}

	clearQuotaExceeded(modelId: string): void {
		const existing = this.modelStates.get(modelId);
		if (existing) {
			existing.exceeded = false;
			existing.backoffLevel = 0;
			existing.lastError = undefined;
		}
	}

	isInCooldown(modelId: string): boolean {
		const state = this.modelStates.get(modelId);
		if (!state || !state.exceeded) {
			return false;
		}
		if (Date.now() >= (state.nextRecoverAt || 0)) {
			this.clearQuotaExceeded(modelId);
			return false;
		}
		return true;
	}

	getRemainingCooldown(modelId: string): number {
		const state = this.modelStates.get(modelId);
		if (!state || !state.exceeded) {
			return 0;
		}
		const remaining = (state.nextRecoverAt || 0) - Date.now();
		return remaining > 0 ? remaining : 0;
	}
}

export class RateLimitRetrier {
	private retryCount = 0;
	async handleRateLimit(
		hasNextUrl: boolean,
		errorBody: string,
		token: vscode.CancellationToken,
	): Promise<RateLimitAction> {
		if (hasNextUrl) {
			return RateLimitAction.Continue;
		}
		if (this.retryCount >= RATE_LIMIT_MAX_RETRIES) {
			return RateLimitAction.MaxExceeded;
		}
		let delay = RATE_LIMIT_BASE_DELAY_MS * 2 ** this.retryCount;
		const serverDelay = parseQuotaRetryDelay(errorBody);
		if (serverDelay !== null) {
			delay = Math.min(serverDelay + 500, RATE_LIMIT_MAX_DELAY_MS);
		} else if (delay > RATE_LIMIT_MAX_DELAY_MS) {
			delay = RATE_LIMIT_MAX_DELAY_MS;
		}
		this.retryCount++;
		await sleepWithCancellation(delay, token);
		return token.isCancellationRequested
			? RateLimitAction.MaxExceeded
			: RateLimitAction.Retry;
	}
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
): Array<Record<string, unknown>> {
	return toolCalls.map((toolCall) => {
		const storedSignature = thoughtSignatureStore.get(toolCall.callId);
		const signature = storedSignature || FALLBACK_THOUGHT_SIGNATURE;
		if (!storedSignature) {
			thoughtSignatureStore.set(toolCall.callId, signature);
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
					parts.push(...convertToolCallsToGeminiParts(toolCalls));
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
}

class FromIRTranslator {
	private readonly messageConverter = new MessageConverter();
	private readonly MODEL_ALIASES: Record<string, string> = {
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

	aliasToModelName(modelName: string): string {
		return this.MODEL_ALIASES[modelName] || modelName;
	}

	buildAntigravityPayload(
		model: vscode.LanguageModelChatInformation,
		modelConfig: ModelConfig,
		messages: readonly vscode.LanguageModelChatMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		modelName: string,
		projectId: string,
	): AntigravityPayload {
		const maxOutputTokens = ConfigManager.getMaxTokensForModel(
			model.maxOutputTokens,
		);
		const resolvedModel = this.aliasToModelName(modelName).toLowerCase();
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
		if (isClaudeThinkingModel && isThinkingEnabled && !hasTools) {
			const thinkingBudget = modelConfig.thinkingBudget || 10000;
			if (maxOutputTokens < thinkingBudget + 1000) {
				generationConfig.maxOutputTokens = thinkingBudget + 1000;
			}
			generationConfig.thinkingConfig = {
				includeThoughts: true,
				thinkingBudget,
			};
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
		const uuid = crypto.randomUUID
			? crypto.randomUUID()
			: crypto.randomBytes(16).toString("hex");
		return {
			project: projectId || this.generateProjectId(),
			model: this.aliasToModelName(modelName),
			userAgent: "antigravity",
			requestId: `agent-${uuid}`,
			request: {
				...request,
				sessionId: `-${uuid.replace(/-/g, "").slice(0, 16)}`,
			} as GeminiRequest & {
				sessionId: string;
			},
		};
	}

	private generateProjectId(): string {
		const adjectives = ["useful", "bright", "swift", "calm", "bold"];
		const nouns = ["fuze", "wave", "spark", "flow", "core"];
		const bytes = crypto.randomBytes(2);
		return `${adjectives[bytes[0] % adjectives.length]}-${nouns[bytes[1] % nouns.length]}-${(crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex")).replace(/-/g, "").slice(0, 5).toLowerCase()}`;
	}
}

export class AntigravityHandler {
	private readonly quotaManager = QuotaStateManager.getInstance();
	private readonly accountQuotaCache = AccountQuotaCache.getInstance();
	private readonly quotaNotificationManager = new QuotaNotificationManager();
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
		const authToken = accessToken || (await AntigravityAuth.getAccessToken());
		if (!authToken) {
			throw new Error("Not logged in to Antigravity. Please login first.");
		}
		const requestModel = modelConfig.model || model.id;
		const resolvedModel = this.fromIRTranslator.aliasToModelName(requestModel);
		const effectiveAccountId = accountId || "default-antigravity";
		const quotaKey = `${effectiveAccountId}:${resolvedModel}`;

		if (this.quotaManager.isInCooldown(quotaKey)) {
			const remaining = this.quotaManager.getRemainingCooldown(quotaKey);
			if (remaining > 5000) {
				this.quotaNotificationManager.notifyQuotaExceeded(
					remaining,
					resolvedModel,
					accountId,
					this.displayName,
				);
			}
			if (remaining > QUOTA_COOLDOWN_WAIT_MAX_MS) {
				this.debouncedCacheUpdate(
					`quota-${effectiveAccountId}`,
					() =>
						this.accountQuotaCache.markQuotaExceeded(
							effectiveAccountId,
							"antigravity",
							{
								accountName: this.displayName,
								resetDelayMs: remaining,
								affectedModel: resolvedModel,
								error: "Quota cooldown exceeds max wait threshold",
							},
						),
					50,
				);
				await this.quotaNotificationManager.notifyQuotaTooLong(
					remaining,
					resolvedModel,
					accountId,
					this.displayName,
				);
				throw new Error(
					`Quota wait too long (${this.quotaNotificationManager.formatDuration(remaining)}). Please add another account or try again later.`,
				);
			}
			await sleepWithCancellation(remaining, token);
			if (token.isCancellationRequested) {
				throw new vscode.CancellationError();
			}
		}

		const projectId = await this.getProjectId(authToken);
		const payload = this.fromIRTranslator.buildAntigravityPayload(
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
		const retrier = new RateLimitRetrier();
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
						this.quotaManager.clearQuotaExceeded(quotaKey);
						this.quotaNotificationManager.clearQuotaCountdown();
						this.debouncedCacheUpdate(
							`success-${effectiveAccountId}`,
							() =>
								this.accountQuotaCache.recordSuccess(
									effectiveAccountId,
									"antigravity",
									this.displayName,
								),
							50,
						);
						return;
					}
					if (isPermissionDeniedError(result.status, result.body)) {
						this.debouncedCacheUpdate(
							`failure-${effectiveAccountId}`,
							() =>
								this.accountQuotaCache.recordFailure(
									effectiveAccountId,
									"antigravity",
									`HTTP ${result.status || 403}: ${result.body || "Permission denied"}`,
									this.displayName,
								),
							50,
						);
						throw new Error(
							result.body || "Permission denied on Antigravity project.",
						);
					}
					const category = categorizeHttpStatus(result.status || 0);
					if (category === ErrorCategory.QuotaError) {
						lastStatus = result.status || 0;
						lastBody = result.body || "";
						const quotaDelay = parseQuotaRetryDelay(lastBody);
						this.quotaManager.markQuotaExceeded(
							quotaKey,
							quotaDelay || undefined,
						);
						const cooldownRemaining =
							this.quotaManager.getRemainingCooldown(quotaKey);
						if (cooldownRemaining > 5000) {
							this.quotaNotificationManager.notifyQuotaExceeded(
								cooldownRemaining,
								resolvedModel,
								effectiveAccountId,
								this.displayName,
							);
						}
						this.debouncedCacheUpdate(
							`quota-${effectiveAccountId}`,
							() =>
								this.accountQuotaCache.markQuotaExceeded(
									effectiveAccountId,
									"antigravity",
									{
										accountName: this.displayName,
										resetDelayMs: quotaDelay || cooldownRemaining,
										affectedModel: resolvedModel,
										error: `HTTP ${lastStatus}: Quota exceeded`,
									},
								),
							50,
						);
						if (cooldownRemaining > QUOTA_COOLDOWN_WAIT_MAX_MS) {
							await this.quotaNotificationManager.notifyQuotaTooLong(
								cooldownRemaining,
								resolvedModel,
								effectiveAccountId,
								this.displayName,
							);
							throw new Error(
								`Quota wait too long (${this.quotaNotificationManager.formatDuration(cooldownRemaining)}). Please add another account or try again later.`,
							);
						}
						if (quotaDelay && quotaDelay > QUOTA_EXHAUSTED_THRESHOLD_MS) {
							throw new Error(
								`Account quota exhausted (quota resets in ${this.quotaNotificationManager.formatDuration(quotaDelay)}). Please wait or use a different account.`,
							);
						}
						if (idx + 1 < baseUrls.length) {
							continue;
						}
						if (loadBalanceEnabled !== false) {
							const action = await retrier.handleRateLimit(
								false,
								lastBody,
								token,
							);
							if (action === RateLimitAction.Retry) {
								idx--;
								continue;
							}
						}
						throw new Error(
							`Quota exceeded${quotaDelay ? ` (quota resets in ${this.quotaNotificationManager.formatDuration(quotaDelay)})` : ""}: ${lastBody || `HTTP ${result.status}`}`,
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
							"Authentication failed. Please re-login to Antigravity.",
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
							error.message.startsWith("Rate limited") ||
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
				throw new Error(
					`HTTP ${lastStatus}${parseQuotaRetryDelay(lastBody) ? ` (quota resets in ${this.quotaNotificationManager.formatDuration(parseQuotaRetryDelay(lastBody)!)})` : ""}: ${lastBody}`,
				);
			}
			if (lastError) {
				throw lastError;
			}
			throw new Error("All Antigravity endpoints unavailable");
		} finally {
			cancelListener.dispose();
		}
	}

	private async streamRequest(
		url: string,
		accessToken: string,
		payload: AntigravityPayload,
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
					"User-Agent": DEFAULT_USER_AGENT,
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
			await new AntigravityStreamProcessor().processStream({
				response,
				modelConfig,
				progress,
				token,
			});
		}
		return { success: true };
	}

	private async getProjectId(accessToken?: string): Promise<string> {
		if (this.projectIdCache) {
			return this.projectIdCache;
		}
		if (this.projectIdPromise) {
			return this.projectIdPromise;
		}
		this.projectIdPromise = AntigravityAuth.ensureProjectId(accessToken)
			.then((projectId) => {
				this.projectIdCache = projectId;
				this.projectIdPromise = null;
				return projectId;
			})
			.catch((err) => {
				this.projectIdPromise = null;
				throw err;
			});
		return this.projectIdPromise;
	}

	isInCooldown(modelId: string, accountId?: string): boolean {
		return this.quotaManager.isInCooldown(
			`${accountId || "default-antigravity"}:${this.fromIRTranslator.aliasToModelName(modelId)}`,
		);
	}
	getRemainingCooldown(modelId: string, accountId?: string): number {
		return this.quotaManager.getRemainingCooldown(
			`${accountId || "default-antigravity"}:${this.fromIRTranslator.aliasToModelName(modelId)}`,
		);
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
