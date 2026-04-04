/*---------------------------------------------------------------------------------------------
 *  CLI Provider Registry
 *  Mirrors extension's KnownProviders (src/utils/knownProviders.ts)
 *  Single source of truth for provider metadata in the CLI
 *--------------------------------------------------------------------------------------------*/

export type SdkMode = 'anthropic' | 'openai' | 'oai-response';

export interface RateLimitConfig {
  requestsPerSecond: number;
  windowMs?: number;
}

export interface RateLimitSelection {
  default?: RateLimitConfig;
  openai?: RateLimitConfig;
  anthropic?: RateLimitConfig;
  responses?: RateLimitConfig;
}

export interface SdkCompatConfig {
  baseUrl?: string;
  extraBody?: Record<string, unknown>;
  customHeader?: Record<string, string>;
}

export interface KnownProviderEntry {
  displayName: string;
  family?: string;
  description?: string;
  baseUrl?: string;
  sdkMode?: SdkMode;
  apiKeyTemplate?: string;
  supportsApiKey?: boolean;
  defaultApiKey?: string;
  openModelEndpoint?: boolean;
  fetchModels?: boolean;
  modelsEndpoint?: string;
  modelParser?: {
    arrayPath?: string;
    cooldownMinutes?: number;
    filterField?: string;
    filterValue?: string;
    idField?: string;
    nameField?: string;
    contextLengthField?: string;
  };
  openai?: SdkCompatConfig;
  anthropic?: SdkCompatConfig;
  responses?: SdkCompatConfig;
  customHeader?: Record<string, string>;
  rateLimit?: RateLimitSelection;
}

/**
 * Provider registry — mirrors extension's KnownProviders.
 * Keep this in sync with src/utils/knownProviders.ts in the extension.
 */
export const CliKnownProviders: Record<string, KnownProviderEntry> = {
  'aihubmix': {
    displayName: 'AIHubMix',
    family: 'AIHubMix',
    customHeader: { 'APP-Code': 'TFUV4759' },
    openai: { baseUrl: 'https://aihubmix.com/v1' },
    anthropic: { baseUrl: 'https://aihubmix.com', extraBody: { top_p: null } },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'apertis': {
    displayName: 'Apertis AI',
    family: 'Apertis AI',
    description: 'Apertis AI endpoint integration',
    supportsApiKey: true,
    apiKeyTemplate: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    openai: { baseUrl: 'https://api.apertis.ai/v1' },
    anthropic: { baseUrl: 'https://api.apertis.ai' },
    responses: { baseUrl: 'https://api.apertis.ai/v1' },
    openModelEndpoint: false,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'blackbox': {
    displayName: 'Blackbox AI',
    family: 'Blackbox AI',
    description: 'Blackbox AI official API',
    supportsApiKey: true,
    apiKeyTemplate: 'YOUR_BLACKBOX_API_KEY',
    sdkMode: 'oai-response',
    fetchModels: true,
    modelsEndpoint: '/models',
    openai: { baseUrl: 'https://api.blackbox.ai/v1' },
    anthropic: { baseUrl: 'https://api.blackbox.ai/', customHeader: { 'anthropic-version': '2023-06-01' } },
    responses: { baseUrl: 'https://api.blackbox.ai/v1' },
  },
  'chatjimmy': {
    displayName: 'ChatJimmy',
    family: 'ChatJimmy',
    description: 'ChatJimmy - free public API, no auth required',
    supportsApiKey: false,
  },
  'ava-supernova': {
    displayName: 'AVA Supernova',
    family: 'AVA Supernova',
    description: 'AVA Supernova - free public API, no auth required',
    supportsApiKey: false,
    openai: { baseUrl: 'https://ava-supernova.com/api/v1' },
    openModelEndpoint: true,
    fetchModels: false,
  },
  'cline': {
    displayName: 'Cline',
    family: 'Cline',
    description: 'Cline endpoint integration',
    openai: { baseUrl: 'https://api.cline.bot/api/v1' },
    fetchModels: true,
    openModelEndpoint: true,
    modelsEndpoint: 'https://api.cline.bot/api/v1/ai/cline/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'chutes': {
    displayName: 'Chutes AI',
    family: 'Chutes AI',
    description: 'Chutes AI endpoint integration',
    openai: { baseUrl: 'https://llm.chutes.ai/v1' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'codex': {
    displayName: 'OpenAI Codex',
    family: 'OpenAI Codex',
    description: 'OpenAI Codex specialized coding provider',
  },
  'deepinfra': {
    displayName: 'DeepInfra',
    family: 'DeepInfra',
    description: 'OpenAI-compatible endpoints from DeepInfra',
    openai: { baseUrl: 'https://api.deepinfra.com/v1/openai' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'deepseek': {
    displayName: 'DeepSeek',
    family: 'DeepSeek',
    description: 'DeepSeek model family',
    openai: { baseUrl: 'https://api.deepseek.com/v1' },
    anthropic: { baseUrl: 'https://api.deepseek.com/anthropic' },
    apiKeyTemplate: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'huggingface': {
    displayName: 'Hugging Face',
    family: 'Hugging Face',
    description: 'Hugging Face Router endpoint integration',
    openai: { baseUrl: 'https://router.huggingface.co/v1' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'kilo': {
    displayName: 'Kilo AI',
    family: 'Kilo AI',
    description: 'Kilo AI endpoint integration',
    openai: { baseUrl: 'https://api.kilo.ai/api/gateway' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'knox': {
    displayName: 'Knox',
    family: 'Knox',
    description: 'Knox Chat - OpenAI SDK compatible endpoint',
    supportsApiKey: true,
    apiKeyTemplate: 'sk-xxxxxxxx',
    openai: { baseUrl: 'https://api.knox.chat/v1' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'hicapai': {
    displayName: 'HicapAI',
    family: 'HicapAI',
    description: 'HicapAI - OpenAI SDK compatible endpoint',
    supportsApiKey: true,
    apiKeyTemplate: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    openai: { baseUrl: 'https://api.hicap.ai/v1' },
    openModelEndpoint: false,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'lightningai': {
    displayName: 'LightningAI',
    family: 'LightningAI',
    description: 'LightningAI endpoint integration',
    openai: { baseUrl: 'https://lightning.ai/api/v1' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'llmgateway': {
    displayName: 'LLMGateway',
    family: 'LLMGateway',
    description: 'LLMGateway - unified access to multiple AI models',
    openai: { baseUrl: 'https://api.llmgateway.io/v1' },
    anthropic: { baseUrl: 'https://api.llmgateway.io' },
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'minimax': {
    displayName: 'MiniMax',
    family: 'MiniMax',
    description: 'MiniMax family models with coding endpoint options',
    openai: { baseUrl: 'https://api.minimaxi.com/v1' },
    anthropic: { baseUrl: 'https://api.minimaxi.com/anthropic' },
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'mistral': {
    displayName: 'Mistral AI',
    family: 'Mistral',
    description: 'Mistral AI model endpoints',
    openai: { baseUrl: 'https://api.mistral.ai/v1' },
    apiKeyTemplate: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    fetchModels: false,
  },
  'modelscope': {
    displayName: 'ModelScope',
    family: 'ModelScope',
    openai: { baseUrl: 'https://api-inference.modelscope.ai/v1' },
    anthropic: { baseUrl: 'https://api-inference.modelscope.ai' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'moonshot': {
    displayName: 'MoonshotAI',
    family: 'Moonshot AI',
    description: 'MoonshotAI Kimi model family with normal and coding plans',
    openai: { baseUrl: 'https://api.moonshot.ai/v1' },
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'nanogpt': {
    displayName: 'NanoGPT',
    family: 'NanoGPT',
    description: 'NanoGPT endpoint integration',
    openai: { baseUrl: 'https://nano-gpt.com/api/v1' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'nvidia': {
    displayName: 'NVIDIA NIM',
    family: 'NVIDIA',
    description: 'NVIDIA NIM hosted model endpoints',
    openai: { baseUrl: 'https://integrate.api.nvidia.com/v1' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'ollama': {
    displayName: 'Ollama',
    family: 'Ollama',
    description: "Ollama - use Ollama's OpenAI / Anthropic compatible API",
    openai: { baseUrl: 'https://ollama.com/v1' },
    anthropic: { baseUrl: 'https://ollama.com' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'opencode': {
    displayName: 'OpenCode',
    family: 'OpenCode',
    description: 'OpenCode endpoint integration',
    sdkMode: 'openai',
    openai: { baseUrl: 'https://opencode.ai/zen/v1' },
    anthropic: { baseUrl: 'https://opencode.ai/zen' },
    rateLimit: {
      default: { requestsPerSecond: 1, windowMs: 1000 },
      openai: { requestsPerSecond: 1, windowMs: 1000 },
      anthropic: { requestsPerSecond: 1, windowMs: 1000 },
    },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'opencodego': {
    displayName: 'OpenCode Zen Go',
    family: 'OpenCode',
    description: 'OpenCode Zen Go endpoint integration',
    sdkMode: 'openai',
    openai: { baseUrl: 'https://opencode.ai/zen/go/v1' },
    anthropic: { baseUrl: 'https://opencode.ai/zen/go' },
    rateLimit: {
      default: { requestsPerSecond: 1, windowMs: 1000 },
      openai: { requestsPerSecond: 1, windowMs: 1000 },
      anthropic: { requestsPerSecond: 1, windowMs: 1000 },
    },
    openModelEndpoint: true,
    fetchModels: false,
  },
  'pollinations': {
    displayName: 'Pollinations AI',
    family: 'Pollinations',
    description: 'Pollinations AI',
    supportsApiKey: true,
    apiKeyTemplate: 'sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    openai: { baseUrl: 'https://gen.pollinations.ai/v1' },
    openModelEndpoint: true,
    fetchModels: false,
  },
  'puter': {
    displayName: 'Puter AI',
    family: 'Puter AI',
    description: 'Free AI API - access 500+ models including GPT, Claude, Gemini with Puter auth token',
    supportsApiKey: true,
    apiKeyTemplate: 'YOUR_PUTER_AUTH_TOKEN',
    openai: { baseUrl: 'https://api.puter.com/puterai/openai/v1' },
    openModelEndpoint: false,
    fetchModels: false,
  },
  'qwencli': {
    displayName: 'Qwen CLI',
    family: 'Qwen',
    description: 'Qwen OAuth via local qwen-code CLI credentials',
    openai: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  },
  'seraphyn': {
    displayName: 'Seraphyn',
    family: 'Seraphyn',
    description: 'Seraphyn AI - OpenAI SDK compatible endpoint',
    supportsApiKey: true,
    apiKeyTemplate: 'sk-xxxxxxxx',
    openai: { baseUrl: 'https://seraphyn.ai/api/v1' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'vercelai': {
    displayName: 'Vercel AI',
    family: 'Vercel AI',
    description: 'Vercel AI Gateway endpoint integration',
    openai: { baseUrl: 'https://ai-gateway.vercel.sh/v1' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: {
      arrayPath: 'data',
      filterField: 'type',
      filterValue: 'language',
      contextLengthField: 'context_window',
      cooldownMinutes: 10,
    },
  },
  'zenmux': {
    displayName: 'Zenmux',
    family: 'Zenmux',
    description: 'Zenmux endpoint integration',
    openai: { baseUrl: 'https://zenmux.ai/api/v1' },
    openModelEndpoint: true,
    fetchModels: true,
    modelsEndpoint: '/models',
    modelParser: { arrayPath: 'data', cooldownMinutes: 10 },
  },
  'zhipu': {
    displayName: 'Zhipu AI',
    family: 'Zhipu AI',
    description: 'GLM family models and coding plan features',
    openai: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  },
};

/**
 * Get the effective base URL for a provider, resolving the SDK mode.
 */
export function getProviderBaseUrl(providerId: string, sdkMode?: SdkMode): string | undefined {
  const config = CliKnownProviders[providerId];
  if (!config) return undefined;

  const mode = sdkMode || config.sdkMode || 'openai';
  if (mode === 'anthropic') return config.anthropic?.baseUrl ?? config.openai?.baseUrl;
  if (mode === 'oai-response') return config.responses?.baseUrl ?? config.openai?.baseUrl;
  return config.openai?.baseUrl;
}

/**
 * Get the default SDK mode for a provider.
 */
export function getProviderSdkMode(providerId: string): SdkMode {
  return CliKnownProviders[providerId]?.sdkMode || 'openai';
}

/**
 * Check if a provider requires an API key.
 */
export function providerNeedsApiKey(providerId: string): boolean {
  const config = CliKnownProviders[providerId];
  if (!config) return true;
  if (config.supportsApiKey === false) return false;
  return true;
}

/**
 * Get all available provider IDs.
 */
export function getAllProviderIds(): string[] {
  return Object.keys(CliKnownProviders);
}

/**
 * Check if a provider exists in the registry.
 */
export function hasProvider(providerId: string): boolean {
  return providerId in CliKnownProviders;
}

/**
 * Get a provider's display name.
 */
export function getProviderDisplayName(providerId: string): string {
  return CliKnownProviders[providerId]?.displayName || providerId;
}
