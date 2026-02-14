export interface ResolveTokenLimitsOptions {
	defaultContextLength: number;
	defaultMaxOutputTokens: number;
	minReservedInputTokens?: number;
}

const HIGH_CONTEXT_THRESHOLD = 200000;
const HIGH_CONTEXT_MAX_OUTPUT_TOKENS = 32000;
const FIXED_256K_MAX_INPUT_TOKENS = 224000;
const FIXED_256K_MAX_OUTPUT_TOKENS = 32000;
const FIXED_128K_MAX_INPUT_TOKENS = 112000;
const FIXED_128K_MAX_OUTPUT_TOKENS = 16000;
// GPT-5 (400K total -> 64K output / 336K input)
const GPT5_MAX_INPUT_TOKENS = 336000;
const GPT5_MAX_OUTPUT_TOKENS = 64000;
// GPT-4-1 family: 1,000,000 total context, 32K output
const GPT4_1_TOTAL_TOKENS = 1000000;
const GPT4_1_MAX_OUTPUT_TOKENS = 32000;
const GPT4_1_MAX_INPUT_TOKENS = GPT4_1_TOTAL_TOKENS - GPT4_1_MAX_OUTPUT_TOKENS;
// Gemini large-context families (1,000,000 total)
const GEMINI_1M_TOTAL_TOKENS = 1000000;
const GEMINI3_MAX_OUTPUT_TOKENS = 64000; // Gemini 3 -> 64K output
const GEMINI3_MAX_INPUT_TOKENS = GEMINI_1M_TOTAL_TOKENS - GEMINI3_MAX_OUTPUT_TOKENS;
const GEMINI25_MAX_OUTPUT_TOKENS = 32000; // Gemini 2.5 -> 32K output
const GEMINI25_MAX_INPUT_TOKENS = GEMINI_1M_TOTAL_TOKENS - GEMINI25_MAX_OUTPUT_TOKENS;
const DEFAULT_MIN_RESERVED_INPUT_TOKENS = 1024;

export function isMinimaxModel(modelId: string): boolean {
	return /minimax/i.test(modelId);
}

export function isKimiModel(modelId: string): boolean {
	return /kimi/i.test(modelId);
}

export function isKimiK25Model(modelId: string): boolean {
	return /kimi[-_\/]?k2(?:\.|-)5/i.test(modelId);
}

export function isGpt5Model(modelId: string): boolean {
	return /gpt-5/i.test(modelId);
}

export function isGpt41Model(modelId: string): boolean {
	// Examples: gpt-4-1, gpt-4-1-mini, gpt-4-1-nano
	return /gpt-4-1/i.test(modelId);
}

export function isGpt4oModel(modelId: string): boolean {
	// Examples: gpt-4o, gpt-4o-mini
	return /gpt-4o/i.test(modelId);
}

export function isGemini3Model(modelId: string): boolean {
	// Matches gemini-3 variants (gemini-3, gemini-3-pro, gemini-3-flash, etc.)
	return /gemini[-_]?3/i.test(modelId);
}

export function isGemini25Model(modelId: string): boolean {
	// Matches gemini-2.5 and variants (gemini-2-5, gemini-2.5-flash, etc.)
	return /gemini[-_]?2(?:\.|-)5/i.test(modelId);
}

export function isGlm45Model(modelId: string): boolean {
	// Explicit exception: glm-4.5 has a 128K context window
	return /^glm-4\.5(?:[^\d].*)?$/i.test(modelId);
}

export function isGlmModel(modelId: string): boolean {
	// Match glm-5, glm-4.7, glm-4.6 and variants (exclude glm-4.5 — it's treated as 128K)
	return /^glm-(?:5|4\.(?:6|7))(?:[^\d].*)?$/i.test(modelId);
}

export function getDefaultMaxOutputTokensForContext(
	contextLength: number,
	defaultMaxOutputTokens: number,
): number {
	return contextLength >= HIGH_CONTEXT_THRESHOLD
		? HIGH_CONTEXT_MAX_OUTPUT_TOKENS
		: defaultMaxOutputTokens;
}

export function resolveGlobalTokenLimits(
	modelId: string,
	contextLength: number,
	options: ResolveTokenLimitsOptions,
): { maxInputTokens: number; maxOutputTokens: number } {
	// GPT-5 family: very large (400K / 64K)
	if (isGpt5Model(modelId)) {
		return {
			maxInputTokens: GPT5_MAX_INPUT_TOKENS,
			maxOutputTokens: GPT5_MAX_OUTPUT_TOKENS,
		};
	}

	// GPT-4-1 family: 1M total context, 32K output
	if (isGpt41Model(modelId)) {
		return {
			maxInputTokens: GPT4_1_MAX_INPUT_TOKENS,
			maxOutputTokens: GPT4_1_MAX_OUTPUT_TOKENS,
		};
	}

	// Gemini 3 / Gemini 2.5 large-context families
	if (isGemini3Model(modelId)) {
		return {
			maxInputTokens: GEMINI3_MAX_INPUT_TOKENS,
			maxOutputTokens: GEMINI3_MAX_OUTPUT_TOKENS,
		};
	}

	if (isGemini25Model(modelId)) {
		return {
			maxInputTokens: GEMINI25_MAX_INPUT_TOKENS,
			maxOutputTokens: GEMINI25_MAX_OUTPUT_TOKENS,
		};
	}

	// GPT-4o: 128K total (16K output)
	if (isGpt4oModel(modelId)) {
		return {
			maxInputTokens: FIXED_128K_MAX_INPUT_TOKENS,
			maxOutputTokens: FIXED_128K_MAX_OUTPUT_TOKENS,
		};
	}

	// glm-4.5 is a 128K model (exception)
	if (isGlm45Model(modelId)) {
		return {
			maxInputTokens: FIXED_128K_MAX_INPUT_TOKENS,
			maxOutputTokens: FIXED_128K_MAX_OUTPUT_TOKENS,
		};
	}

	// GLM family (glm-5, glm-4.7, glm-4.6) are canonical 256K models
	if (isGlmModel(modelId)) {
		return {
			maxInputTokens: FIXED_256K_MAX_INPUT_TOKENS,
			maxOutputTokens: FIXED_256K_MAX_OUTPUT_TOKENS,
		};
	}

	// Minimax / Kimi remain fixed 256K
	if (isMinimaxModel(modelId) || isKimiModel(modelId)) {
		return {
			maxInputTokens: FIXED_256K_MAX_INPUT_TOKENS,
			maxOutputTokens: FIXED_256K_MAX_OUTPUT_TOKENS,
		};
	}

	const minReservedInputTokens =
		typeof options.minReservedInputTokens === 'number' &&
		options.minReservedInputTokens > 0
			? options.minReservedInputTokens
			: DEFAULT_MIN_RESERVED_INPUT_TOKENS;

	const safeContextLength =
		typeof contextLength === 'number' && contextLength > minReservedInputTokens
			? contextLength
			: options.defaultContextLength;

	let maxOutput = getDefaultMaxOutputTokensForContext(
		safeContextLength,
		options.defaultMaxOutputTokens,
	);
	maxOutput = Math.floor(
		Math.max(1, Math.min(maxOutput, safeContextLength - minReservedInputTokens)),
	);

	return {
		maxInputTokens: Math.max(1, safeContextLength - maxOutput),
		maxOutputTokens: maxOutput,
	};
}
