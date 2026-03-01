import crypto from "node:crypto";
import * as vscode from "vscode";
import { AccountQuotaCache } from "../../accounts/accountQuotaCache";
import type { ModelConfig } from "../../types/sharedTypes";
import { ConfigManager } from "../../utils/configManager";
import {
	balanceGeminiFunctionCallResponses,
	convertMessagesToGemini as convertMessagesToGeminiCommon,
	sanitizeGeminiToolSchema,
	validateGeminiPartsBalance,
} from "../../utils/geminiSdkCommon";
import {
	GeminiStreamProcessor,
	type GeminiStreamHandler,
} from "../../utils/geminiStreamProcessor";
import {
	isGemini25Model,
	isGemini3Model,
} from "../../utils/globalContextLengthManager";
import { Logger } from "../../utils/logger";
import { TokenCounter } from "../../utils/tokenCounter";
import { TokenTelemetryTracker } from "../../utils/tokenTelemetryTracker";
import { GeminiOAuthManager } from "./auth";
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

export function extractToolCallFromGeminiResponse(
	part: Record<string, unknown>,
): {
	callId: string;
	name: string;
	args: Record<string, unknown> | string;
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
		args: (functionCall.args as Record<string, unknown>) || {},
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

class FromIRTranslator {
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
		const { contents, systemInstruction } = convertMessagesToGeminiCommon(
			messages,
			modelConfig,
			{
				resolvedModelName: resolvedModel,
				getThoughtSignature: (callId) => thoughtSignatureStore.get(callId),
				storeThoughtSignature: (callId, signature) => {
					if (callId && signature) {
						thoughtSignatureStore.set(callId, signature);
					}
				},
				fallbackThoughtSignature: FALLBACK_THOUGHT_SIGNATURE,
				normalizeToolCallArgs: true,
				skipThinkingPartWhenToolCalls: true,
			},
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
			console.log(
				"GeminiCLI: Image model detected, disabling thinking and adding imageConfig",
			);
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
								? sanitizeGeminiToolSchema(tool.inputSchema)
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
		validateGeminiPartsBalance(contents, {
			prefix: "GeminiCLI",
			onWarning: (message) => console.warn(message),
		});
		// Attempt to automatically balance and fix any mismatches before sending the request
		balanceGeminiFunctionCallResponses(contents);

		return payload;
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
									{ sdkMode: modelConfig.sdkMode || "gemini" },
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
								estimatedPromptTokens: true,
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
		// Always use GeminiStreamProcessor for Gemini CLI since the API returns
		// responses in Gemini format (candidates/parts), not OpenAI format.
		const handler: GeminiStreamHandler = {
			extractToolCallFromGeminiResponse,
			storeThoughtSignature,
		};
		await new GeminiStreamProcessor('GeminiCLI', handler).processStream({
			response,
			modelConfig,
			progress,
			token,
		});
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

function isImageGenerationModel(model: string): boolean {
	const lower = model.toLowerCase();
	return lower.includes("image") || lower.includes("imagen");
}
