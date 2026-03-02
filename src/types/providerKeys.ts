export enum ProviderKey {
	AIHubMix = 'aihubmix',
	Antigravity = 'antigravity',
	Blackbox = 'blackbox',
	ChatJimmy = 'chatjimmy',
	Chutes = 'chutes',
	Codex = 'codex',
	Compatible = 'compatible',
	DeepInfra = 'deepinfra',
	DeepSeek = 'deepseek',
	GeminiCli = 'geminicli',
	Huggingface = 'huggingface',
	Kilo = 'kilo',
	Kimi = 'kimi',
	LightningAI = 'lightningai',
	MiniMax = 'minimax',
	MiniMaxCoding = 'minimax-coding',
	Mistral = 'mistral',
	ModelScope = 'modelscope',
	Moonshot = 'moonshot',
	Nanogpt = 'nanogpt',
	Nvidia = 'nvidia',
	Ollama = 'ollama',
	OpenAI = 'openai',
	OpenCode = 'opencode',
	QwenCli = 'qwencli',
	Zenmux = 'zenmux',
	Zhipu = 'zhipu',
}

/**
 * Provider category for unified settings organization
 */
export enum ProviderCategory {
	OpenAI = 'openai',
	Anthropic = 'anthropic',
	OAuth = 'oauth',
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
	sdkMode?: 'openai' | 'anthropic' | 'gemini' | 'mixed';
	description?: string;
	icon?: string;
	settingsPrefix?: string;
	baseUrl?: string;
	features: ProviderFeatureFlags;
	order: number;
}
