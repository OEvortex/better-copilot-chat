export interface ResolveTokenLimitsOptions {
	defaultContextLength: number;
	defaultMaxOutputTokens: number;
	minReservedInputTokens?: number;
}

/**
 * Default context length for providers (128K tokens)
 */
export const DEFAULT_CONTEXT_LENGTH = 128 * 1024; // 131072

/**
 * Default maximum output tokens for providers (16K tokens)
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 16 * 1024; // 16384

/**
 * Default context length for Zhipu provider (192K tokens)
 */
export const ZHIPU_DEFAULT_CONTEXT_LENGTH = 192 * 1024; // 196608

/**
 * Default maximum output tokens for Zhipu provider (16K tokens)
 */
export const ZHIPU_DEFAULT_MAX_OUTPUT_TOKENS = 16 * 1024; // 16384

const DEFAULT_MIN_RESERVED_INPUT_TOKENS = 1024;
// Claude models: 200K total context (1k=1024), 32K output / 168K input
const CLAUDE_TOTAL_TOKENS = 200 * 1024; // 204800
const CLAUDE_MAX_INPUT_TOKENS = CLAUDE_TOTAL_TOKENS - 32 * 1024; // 172032
const CLAUDE_MAX_OUTPUT_TOKENS = 32 * 1024; // 32768
// Devstral models: 256K total context (1k=1024), 32K output
const DEVSTRAL_MAX_INPUT_TOKENS = 256 * 1024 - 32 * 1024; // 229376
const DEVSTRAL_MAX_OUTPUT_TOKENS = 32 * 1024; // 32768
// DeepSeek models: 160K total context (1k=1024), 16K output / 144K input
const DEEPSEEK_TOTAL_TOKENS = 160 * 1024; // 163840
const DEEPSEEK_MAX_OUTPUT_TOKENS = 16 * 1024; // 16384
const DEEPSEEK_MAX_INPUT_TOKENS = DEEPSEEK_TOTAL_TOKENS - DEEPSEEK_MAX_OUTPUT_TOKENS; // 147456
// Fixed 128K family (1k=1024): 16K output / 112K input
export const FIXED_128K_MAX_INPUT_TOKENS = 128 * 1024 - 16 * 1024; // 114688
export const FIXED_128K_MAX_OUTPUT_TOKENS = 16 * 1024; // 16384
// GLM-4.5 special case: 128K total but 32K output
export const GLM45_MAX_INPUT_TOKENS = 128 * 1024 - 32 * 1024; // 98304
export const GLM45_MAX_OUTPUT_TOKENS = 32 * 1024; // 32768
// Fixed 256K family (1k=1024): 32K output / 224K input
const FIXED_256K_MAX_INPUT_TOKENS = 256 * 1024 - 32 * 1024; // 229376
const FIXED_256K_MAX_OUTPUT_TOKENS = 32 * 1024; // 32768
// MiniMax M2 series: 204.8K total context (1k=1024), 32K output / 172K input
const MINIMAX_TOTAL_TOKENS = 200 * 1024; // 204800
const MINIMAX_MAX_INPUT_TOKENS = MINIMAX_TOTAL_TOKENS - 32 * 1024; // 172032
const MINIMAX_MAX_OUTPUT_TOKENS = 32 * 1024; // 32768
// Fixed 64K family (1k=1024): some vendors expose smaller "64k" models where output is 8k
const FIXED_64K_TOTAL_TOKENS = 64 * 1024; // 65536
const FIXED_64K_MAX_OUTPUT_TOKENS = 8 * 1024; // 8192
const FIXED_64K_MAX_INPUT_TOKENS = FIXED_64K_TOTAL_TOKENS - FIXED_64K_MAX_OUTPUT_TOKENS; // 57344
// Gemma 3 models: 128K total context (1k=1024), 16K output / 112K input
const GEMA3_TOTAL_TOKENS = 128 * 1024; // 131072
const GEMA3_MAX_OUTPUT_TOKENS = 16 * 1024; // 16384
const GEMA3_MAX_INPUT_TOKENS = GEMA3_TOTAL_TOKENS - GEMA3_MAX_OUTPUT_TOKENS; // 114688
// Gemini large-context families (1,000,000 total)
const GEMINI_1M_TOTAL_TOKENS = 1000000;
const GEMINI25_MAX_OUTPUT_TOKENS = 32 * 1024; // Gemini 2.5 -> 32K output (32768)
const GEMINI25_MAX_INPUT_TOKENS = GEMINI_1M_TOTAL_TOKENS - GEMINI25_MAX_OUTPUT_TOKENS;
const GEMINI2_MAX_OUTPUT_TOKENS = 32 * 1024; // Gemini 2 -> 32K output (32768)
const GEMINI2_MAX_INPUT_TOKENS = GEMINI_1M_TOTAL_TOKENS - GEMINI2_MAX_OUTPUT_TOKENS;
const GEMINI3_MAX_OUTPUT_TOKENS = 64 * 1024; // Gemini 3 / 3.1 -> 64K output (65536)
const GEMINI3_MAX_INPUT_TOKENS = GEMINI_1M_TOTAL_TOKENS - GEMINI3_MAX_OUTPUT_TOKENS;
// GPT-5 (400K total -> 1k=1024, 64K output / 336K input)
const GPT5_MAX_INPUT_TOKENS = 400 * 1024 - 64 * 1024; // 344064
const GPT5_MAX_OUTPUT_TOKENS = 64 * 1024; // 65536
// GPT-4-1 family: 1,000,000 total context, 32K output
const GPT4_1_TOTAL_TOKENS = 1000000;
const GPT4_1_MAX_OUTPUT_TOKENS = 32 * 1024; // 32768
const GPT4_1_MAX_INPUT_TOKENS = GPT4_1_TOTAL_TOKENS - GPT4_1_MAX_OUTPUT_TOKENS;
const HIGH_CONTEXT_THRESHOLD = 200 * 1024; // 204800 (using 1k=1024)
const HIGH_CONTEXT_MAX_OUTPUT_TOKENS = 32 * 1024; // 32768

export function isDevstralModel(modelId: string): boolean {
	// Matches devstral-2 and devstral-small-2 (256K context, 32K output)
	return /devstral[-_]?2/i.test(modelId);
}

export function isDeepSeekModel(modelId: string): boolean {
	// Matches deepseek-r1, deepseek-tng, deepseek-v3-1, deepseek-v3.2
	return /deepseek[-_]?/i.test(modelId);
}

export function isGemma3Model(modelId: string): boolean {
	// Matches gemma-3 and variants (gemma-3, gemma-3-pro, gemma-3-flash, etc.)
	return /gemma[-_]?3/i.test(modelId);
}

export function isLlama32Model(modelId: string): boolean {
	// Matches llama-3.2 series: llama-3-2-1b, llama-3-2-3b, etc. (128K context, 16K output)
	return /llama[-_]?3[-_]?2/i.test(modelId);
}

export function isGemini25Model(modelId: string): boolean {
	// Matches gemini-2.5 and variants (gemini-2-5, gemini-2.5-flash, etc.)
	// Must have .5 or -5 to distinguish from gemini-2
	return /gemini[-_]?2(?:\.|-)5/i.test(modelId);
}

export function isGemini2Model(modelId: string): boolean {
	// Matches gemini-2 variants but NOT gemini-2.5 (use isGemini25Model for that)
	// Examples: gemini-2.0-flash, gemini-2-flash, gemini-2-pro
	return /gemini[-_]?2(?!\.|-?5)/i.test(modelId);
}

export function isGemini3Model(modelId: string): boolean {
	// Matches gemini-3 and gemini-3.1 variants (gemini-3, gemini-3-pro, gemini-3-flash, gemini-3.1-pro-preview, etc.)
	return /gemini[-_]?3(?:\.[-_]?1)?/i.test(modelId);
}

export function isGlm45Model(modelId: string): boolean {
	// Explicit exception: glm-4.5 has a 128K context window
	// Match anywhere in the model id (supports provider prefixes like z-ai/, zai-org/, etc.)
	return /glm-4\.5(?!\d)/i.test(modelId);
}

export function isGlmModel(modelId: string): boolean {
	// Match glm-5, glm-4.7, glm-4.6 and variants (exclude glm-4.5 — it's treated as 128K)
	// Use a loose substring match so provider-prefixed ids like "z-ai/glm-4.6" are detected
	return /glm-(?:5|4\.(?:6|7))(?!\d)/i.test(modelId);
}

export function isGpt41Model(modelId: string): boolean {
	// Examples: gpt-4-1, gpt-4-1-mini, gpt-4-1-nano
	return /gpt-4-1/i.test(modelId);
}

export function isGpt4oModel(modelId: string): boolean {
	// Examples: gpt-4o, gpt-4o-mini
	return /gpt-4o/i.test(modelId);
}

export function isGpt5Model(modelId: string): boolean {
	return /gpt-5/i.test(modelId);
}

export function isGptModel(modelId: string): boolean {
	return /gpt/i.test(modelId);
}

export function isClaudeModel(modelId: string): boolean {
	// Matches all Claude models: claude-3, claude-3.5, claude-4, etc.
	// Also matches provider-prefixed ids like anthropic/claude-3, etc.
	return /claude[-_]?/i.test(modelId);
}

export function isKimiK25Model(modelId: string): boolean {
	return /kimi[-_\/]?k2(?:\.|-)5/i.test(modelId);
}

export function isKimiModel(modelId: string): boolean {
	// Matches all Kimi models including kimi-k2, kimi-k2.1, kimi-k2.5, etc.
	// Note: kimi-k2.5 is handled separately by isKimiK25Model for vision support
	return /kimi[-_]?k2/i.test(modelId);
}

export function isMinimaxModel(modelId: string): boolean {
	// Matches all MiniMax M2 series: minimax-m2, minimax-m2.1, minimax-m2-5, etc.
	// All M2 series models have 256K context with 32K output
	return /minimax[-_]?m2/i.test(modelId);
}

// Check if GPT model supports vision (excludes gpt-oss)
export function isVisionGptModel(modelId: string): boolean {
	return /gpt/i.test(modelId) && !/gpt-oss/i.test(modelId);
}

export function isMingFlashOmniModel(modelId: string): boolean {
	// inclusionAI Ming-flash-omni-2.0 — single-provider 64K model with 8K output
	return /ming[-_]?flash[-_]?omni[-_]?2(?:\.|-)0/i.test(modelId) || /ming-flash-omni-2-0/i.test(modelId);
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
	// DeepSeek models: 160K total (16K output)
	if (isDeepSeekModel(modelId)) {
		return {
			maxInputTokens: DEEPSEEK_MAX_INPUT_TOKENS,
			maxOutputTokens: DEEPSEEK_MAX_OUTPUT_TOKENS,
		};
	}

	// Devstral models: 256K total context, 32K output
	if (isDevstralModel(modelId)) {
		return {
			maxInputTokens: DEVSTRAL_MAX_INPUT_TOKENS,
			maxOutputTokens: DEVSTRAL_MAX_OUTPUT_TOKENS,
		};
	}

	// Gemma 3 models: 128K total context (1k=1024), 16K output
	if (isGemma3Model(modelId)) {
		return {
			maxInputTokens: GEMA3_MAX_INPUT_TOKENS,
			maxOutputTokens: GEMA3_MAX_OUTPUT_TOKENS,
		};
	}

	// Llama 3.2 series: 128K total context (1k=1024), 16K output
	if (isLlama32Model(modelId)) {
		return {
			maxInputTokens: FIXED_128K_MAX_INPUT_TOKENS,
			maxOutputTokens: FIXED_128K_MAX_OUTPUT_TOKENS,
		};
	}

	// Gemini 2 family (1M total, 32K output)
	if (isGemini2Model(modelId)) {
		return {
			maxInputTokens: GEMINI2_MAX_INPUT_TOKENS,
			maxOutputTokens: GEMINI2_MAX_OUTPUT_TOKENS,
		};
	}

	// Gemini 2.5 large-context family (1M total, 32K output)
	if (isGemini25Model(modelId)) {
		return {
			maxInputTokens: GEMINI25_MAX_INPUT_TOKENS,
			maxOutputTokens: GEMINI25_MAX_OUTPUT_TOKENS,
		};
	}

	// Gemini 3 / Gemini 3.1 large-context families (1M total, 64K output)
	if (isGemini3Model(modelId)) {
		return {
			maxInputTokens: GEMINI3_MAX_INPUT_TOKENS,
			maxOutputTokens: GEMINI3_MAX_OUTPUT_TOKENS,
		};
	}

	// GLM family (glm-5, glm-4.7, glm-4.6) are canonical 256K models
	if (isGlmModel(modelId)) {
		return {
			maxInputTokens: FIXED_256K_MAX_INPUT_TOKENS,
			maxOutputTokens: FIXED_256K_MAX_OUTPUT_TOKENS,
		};
	}

	// GLM-4.5 is a special case: 128K total but 32K output (different from standard 128K models)
	if (isGlm45Model(modelId)) {
		return {
			maxInputTokens: GLM45_MAX_INPUT_TOKENS,
			maxOutputTokens: GLM45_MAX_OUTPUT_TOKENS,
		};
	}

	// GPT-4-1 family: 1M total context, 32K output
	if (isGpt41Model(modelId)) {
		return {
			maxInputTokens: GPT4_1_MAX_INPUT_TOKENS,
			maxOutputTokens: GPT4_1_MAX_OUTPUT_TOKENS,
		};
	}

	// GPT-4o: 128K total (16K output)
	if (isGpt4oModel(modelId)) {
		return {
			maxInputTokens: FIXED_128K_MAX_INPUT_TOKENS,
			maxOutputTokens: FIXED_128K_MAX_OUTPUT_TOKENS,
		};
	}

	// GPT-5 family: very large (400K / 64K)
	if (isGpt5Model(modelId)) {
		return {
			maxInputTokens: GPT5_MAX_INPUT_TOKENS,
			maxOutputTokens: GPT5_MAX_OUTPUT_TOKENS,
		};
	}

	// inclusionAI Ming-flash-omni (provider-specific 64K model -> 8K output)
	if (isMingFlashOmniModel(modelId)) {
		return {
			maxInputTokens: FIXED_64K_MAX_INPUT_TOKENS,
			maxOutputTokens: FIXED_64K_MAX_OUTPUT_TOKENS,
		};
	}

	// Minimax M2 series: 204.8K total context, 32K output
	if (isMinimaxModel(modelId)) {
		return {
			maxInputTokens: MINIMAX_MAX_INPUT_TOKENS,
			maxOutputTokens: MINIMAX_MAX_OUTPUT_TOKENS,
		};
	}

	// Claude models: 200K total context, 32K output
	if (isClaudeModel(modelId)) {
		return {
			maxInputTokens: CLAUDE_MAX_INPUT_TOKENS,
			maxOutputTokens: CLAUDE_MAX_OUTPUT_TOKENS,
		};
	}

	// Kimi K2 series: 256K total context, 32K output
	if (isKimiModel(modelId)) {
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

export interface ResolveCapabilitiesOptions {
	detectedToolCalling?: boolean;
	detectedImageInput?: boolean;
}

export function resolveGlobalCapabilities(
	modelId: string,
	options?: ResolveCapabilitiesOptions,
): { toolCalling: boolean; imageInput: boolean } {
	const detectedImageInput = options?.detectedImageInput === true;

	return {
		// User request: all models should support tools
		toolCalling: true,
	// User request: Claude, Kimi 2.5 and GPT models should support vision (excluding gpt-oss)
	imageInput:
		detectedImageInput ||
		isClaudeModel(modelId) ||
		isKimiK25Model(modelId) ||
		isVisionGptModel(modelId),
	};
}
