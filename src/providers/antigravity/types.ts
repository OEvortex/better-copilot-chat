import type * as vscode from "vscode";

export type ContentType =
	| "text"
	| "reasoning"
	| "image"
	| "file"
	| "audio"
	| "video"
	| "tool_result"
	| "executable_code"
	| "code_result";
export type Role = "user" | "assistant" | "system" | "tool";
export type FinishReason =
	| "stop"
	| "max_tokens"
	| "tool_calls"
	| "content_filter"
	| "stop_sequence"
	| "error"
	| "unknown";

export interface ImagePart {
	mimeType: string;
	data: string;
	url?: string;
}

export interface FilePart {
	fileId?: string;
	fileUrl?: string;
	filename?: string;
	fileData?: string;
	mimeType?: string;
}

export interface AudioPart {
	data: string;
	format?: string;
	mimeType?: string;
	transcript?: string;
}

export interface VideoPart {
	data?: string;
	fileUri?: string;
	mimeType?: string;
	transcript?: string;
}

export interface ToolResultPart {
	toolCallId: string;
	result: string;
	isError?: boolean;
	images?: ImagePart[];
}

export interface CodeExecutionPart {
	language?: string;
	code?: string;
	outcome?: string;
	output?: string;
}

export interface ContentPart {
	type: ContentType;
	text?: string;
	reasoning?: string;
	thoughtSignature?: string;
	image?: ImagePart;
	file?: FilePart;
	audio?: AudioPart;
	video?: VideoPart;
	toolResult?: ToolResultPart;
	codeExecution?: CodeExecutionPart;
}

export interface ToolCall {
	id: string;
	name: string;
	args: string;
}

export interface Message {
	role: Role;
	content: ContentPart[];
	toolCalls?: ToolCall[];
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters?: Record<string, unknown>;
}

export interface ThinkingConfig {
	includeThoughts: boolean;
	thinkingBudget?: number;
}

export interface SafetySetting {
	category: string;
	threshold: string;
}

export interface UnifiedChatRequest {
	model: string;
	messages: Message[];
	tools?: ToolDefinition[];
	temperature?: number;
	topP?: number;
	maxTokens?: number;
	stopSequences?: string[];
	thinking?: ThinkingConfig;
	safetySettings?: SafetySetting[];
	metadata?: Record<string, unknown>;
}

export interface GeminiContentPart {
	text?: string;
	thought?: boolean;
	thoughtSignature?: string;
	inlineData?: { mimeType: string; data: string };
	functionCall?: { name: string; args: Record<string, unknown> };
	functionResponse?: {
		name: string;
		id?: string;
		response: Record<string, unknown>;
	};
}

export interface GeminiContent {
	role: "user" | "model";
	parts: GeminiContentPart[];
}

export interface GeminiRequest {
	contents: GeminiContent[];
	systemInstruction?: { role?: string; parts: { text: string }[] };
	generationConfig?: {
		maxOutputTokens?: number;
		temperature?: number;
		topP?: number;
		stopSequences?: string[];
		thinkingConfig?: { includeThoughts?: boolean; thinkingBudget?: number };
	};
	tools?: Array<{
		functionDeclarations: Array<{
			name: string;
			description: string;
			parameters?: Record<string, unknown>;
		}>;
	}>;
	toolConfig?: { functionCallingConfig: { mode: string } };
	safetySettings?: Array<{ category: string; threshold: string }>;
}

export interface AntigravityPayload {
	project: string;
	model: string;
	userAgent: string;
	requestId: string;
	requestType?: string;
	request: GeminiRequest & { sessionId: string };
}

export interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
}

export interface UserInfo {
	email: string;
}

export interface AntigravityAuthResult {
	accessToken: string;
	refreshToken: string;
	email: string;
	projectId: string;
	expiresAt: string;
}

export interface AntigravityModel {
	id: string;
	name: string;
	displayName: string;
	ownedBy: string;
	maxTokens?: number;
	maxOutputTokens?: number;
	capabilities?: { toolCalling?: boolean; imageInput?: boolean };
	quotaInfo?: { remainingFraction?: number; resetTime?: string };
}

export interface ModelQuickPickItem extends vscode.QuickPickItem {
	model: AntigravityModel;
}

export enum ErrorCategory {
	Unknown = "unknown",
	UserError = "user_error",
	AuthError = "auth_error",
	QuotaError = "quota_error",
	NotFound = "not_found",
	Transient = "transient",
}

export enum RateLimitAction {
	Continue = "continue",
	Retry = "retry",
	MaxExceeded = "max_exceeded",
}

export interface QuotaState {
	isExhausted: boolean;
	resetsAt: number;
	lastUpdated: number;
	exceeded?: boolean;
	nextRecoverAt?: number;
	backoffLevel?: number;
	lastError?: string;
}
