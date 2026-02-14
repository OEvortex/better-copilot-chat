export interface ResolveTokenLimitsOptions {
	defaultContextLength: number;
	defaultMaxOutputTokens: number;
	minReservedInputTokens?: number;
}

const HIGH_CONTEXT_THRESHOLD = 200000;
const HIGH_CONTEXT_MAX_OUTPUT_TOKENS = 32000;
const FIXED_256K_MAX_INPUT_TOKENS = 224000;
const FIXED_256K_MAX_OUTPUT_TOKENS = 32000;
const GPT5_MAX_INPUT_TOKENS = 336000;
const GPT5_MAX_OUTPUT_TOKENS = 64000;
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
	if (isGpt5Model(modelId)) {
		return {
			maxInputTokens: GPT5_MAX_INPUT_TOKENS,
			maxOutputTokens: GPT5_MAX_OUTPUT_TOKENS,
		};
	}

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
