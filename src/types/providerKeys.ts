export enum ProviderKey {
	AIHubMix = 'aihubmix',
	AvaSupernova = 'ava-supernova',
	Blackbox = 'blackbox',
	ChatJimmy = 'chatjimmy',
	Chutes = 'chutes',
	Cline = 'cline',
	Codex = 'codex',
	Compatible = 'compatible',
	DeepInfra = 'deepinfra',
	DeepSeek = 'deepseek',
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
	Opencodego = 'opencodego',
	Pollinations = 'pollinations',
	QwenCli = 'qwencli',
	Vercelai = 'vercelai',
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
	sdkMode?: 'openai' | 'anthropic' | 'oai-response' | 'mixed';
	description?: string;
	icon?: string;
	settingsPrefix?: string;
	baseUrl?: string;
	features: ProviderFeatureFlags;
	order: number;
}
