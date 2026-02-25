export enum ProviderKey {
	Antigravity = "antigravity",
	Chutes = "chutes",
	Codex = "codex",
	DeepInfra = "deepinfra",
	DeepSeek = "deepseek",
	GeminiCli = "geminicli",
	Huggingface = "huggingface",
	LightningAI = "lightningai",
	Kimi = "kimi",
	Kilo = "kilo",
	Mistral = "mistral",
	MiniMax = "minimax",
	MiniMaxCoding = "minimax-coding",
	Moonshot = "moonshot",
	Nvidia = "nvidia",
	Ollama = "ollama",
	OpenCode = "opencode",
	Blackbox = "blackbox",
	OpenAI = "openai",
	QwenCli = "qwencli",
	Zenmux = "zenmux",
	Zhipu = "zhipu",
	Compatible = "compatible",
}

/**
 * Provider category for unified settings organization
 */
export enum ProviderCategory {
	OpenAI = "openai",
	Anthropic = "anthropic",
	OAuth = "oauth",
}

/**
 * Provider feature flags used by unified settings UI
 */
export interface ProviderFeatureFlags {
	supportsApiKey: boolean;
	supportsOAuth: boolean;
	supportsMultiAccount: boolean;
	supportsBaseUrl: boolean;
	supportsConfigWizard: boolean;
}

/**
 * Provider metadata for unified settings and configuration wizard
 */
export interface ProviderMetadata {
	id: string;
	key?: ProviderKey;
	displayName: string;
	category: ProviderCategory;
	sdkMode?: "openai" | "anthropic" | "mixed";
	description?: string;
	icon?: string;
	settingsPrefix?: string;
	features: ProviderFeatureFlags;
	order: number;
}
