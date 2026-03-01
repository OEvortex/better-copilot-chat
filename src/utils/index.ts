/*---------------------------------------------------------------------------------------------
 *  Utility Functions Export File
 *  Unified export of all utility functions
 *--------------------------------------------------------------------------------------------*/

export { AnthropicHandler } from "../providers/anthropic/anthropicHandler";
export {
	AntigravityAuth,
	antigravityLoginCommand,
	doAntigravityLoginForNewAccount,
} from "../providers/antigravity/auth";
export {
	AntigravityHandler,
	extractToolCallFromGeminiResponse,
	storeThoughtSignature,
} from "../providers/antigravity/handler";
export type { AntigravityModel } from "../providers/antigravity/types";
export {
	CodexAuth,
	codexLoginCommand,
	doCodexLoginForNewAccount,
} from "../providers/codex/codexAuth";
export { CodexHandler } from "../providers/codex/codexHandler";
export { MiniMaxWizard } from "../providers/minimax/minimaxWizard";
export { MistralHandler } from "../providers/mistral/mistralHandler";
export { MoonshotWizard } from "../providers/moonshot/moonshotWizard";
export { OpenAIHandler } from "../providers/openai/openaiHandler";
export { OpenAIStreamProcessor } from "../providers/openai/openaiStreamProcessor";
export { ZhipuWizard } from "../providers/zhipu/zhipuWizard";
export { ApiKeyManager } from "./apiKeyManager";
export { CompatibleModelManager } from "./compatibleModelManager";
export { CompletionLogger } from "./completionLogger";
export { ConfigManager } from "./configManager";
export {
	getDefaultMaxOutputTokensForContext,
	isDeepSeekModel,
	isGemini2Model,
	isGemini3Model,
	isGemini25Model,
	isGeminiModel,
	isGlm45Model,
	isGlmModel,
	isGpt4oModel,
	isGpt5Model,
	isGpt41Model,
	isGptModel,
	isKimiK25Model,
	isKimiModel,
	isLlama32Model,
	isMingFlashOmniModel,
	isMinimaxModel,
	isVisionGptModel,
	resolveGlobalCapabilities,
	resolveGlobalTokenLimits,
} from "./globalContextLengthManager";
export { JsonSchemaProvider } from "./jsonSchemaProvider";
export {
	type RegisteredProvider,
	KnownProviderConfig,
	KnownProviders,
	ProviderRegistry,
	getAllProviders,
	getProvider,
	registerProvidersFromConfig,
} from "./knownProviders";
export { Logger } from "./logger";
export { MCPWebSearchClient } from "./mcpWebSearchClient";
export { ModelInfoCache } from "./modelInfoCache";
export { RateLimiter } from "./rateLimiter";
export {
	formatRateLimitDisplay,
	formatRateLimitSummary,
	parseRateLimitFromHeaders,
	renderRateLimitProgressBar,
} from "./rateLimitParser";
export { RetryManager } from "./retryManager";
export { StatusLogger } from "./statusLogger";
export { TokenCounter } from "./tokenCounter";
export {
	type TokenResponseMetrics,
	type TokenTelemetryEvent,
	TokenTelemetryTracker,
	type TokenUsageSummary,
} from "./tokenTelemetryTracker";
export { getExtensionVersion, getUserAgent } from "./userAgent";
export { VersionManager } from "./versionManager";
