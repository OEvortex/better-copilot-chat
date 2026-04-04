import * as vscode from 'vscode';
import { AccountManager } from '../accounts/accountManager';
import { configProviders } from '../providers/config';
import { MiniMaxWizard } from '../providers/minimax/minimaxWizard';
import { MoonshotWizard } from '../providers/moonshot/moonshotWizard';
import {
    ProviderCategory,
    ProviderKey,
    type ProviderMetadata
} from '../types/providerKeys';
import type {
    ConfigProvider,
    ModelConfig,
    ProviderConfig,
    ProviderOverride,
    SdkMode
} from '../types/sharedTypes';
import { Logger } from './logger';

export interface KnownProviderConfig
    extends Partial<ProviderConfig & ProviderOverride> {
    /** Provider description for settings and UI metadata */
    description?: string;
    /** Provider settings prefix override */
    settingsPrefix?: string;
    /** Inline model definitions - static fallback when fetchModels is enabled */
    models?: ModelConfig[];
    /** API key template for the provider (e.g., "sk-xxxxxxxx") */
    apiKeyTemplate?: string;
    /** Whether this provider requires an API key */
    supportsApiKey?: boolean;
    /** Default API key to use when no user-configured key is available */
    defaultApiKey?: string;
    /** Whether this provider has an open/unauthenticated model endpoint that can be fetched without API key */
    openModelEndpoint?: boolean;
    /** Provider family identifier (optional) */
    family?: string;
    /** Enable auto-fetching models from endpoint with cooldown */
    fetchModels?: boolean;
    /** Endpoint to fetch model list from (e.g., "/models" or full URL) */
    modelsEndpoint?: string;
    /** Response parser configuration for model fetching */
    modelParser?: {
        /** JSON path to array of models (e.g., "data", "models") */
        arrayPath?: string;
        /** Cooldown between fetches in minutes (default: 10) */
        cooldownMinutes?: number;
        /** Optional field name used to filter imported models */
        filterField?: string;
        /** Optional exact-match field value used to filter imported models */
        filterValue?: string;
        /** Field mappings for model properties */
        idField?: string;
        nameField?: string;
        descriptionField?: string;
        contextLengthField?: string;
        tagsField?: string;
    };
    /** OpenAI SDK compatibility configuration */
    openai?: {
        baseUrl?: string;
        extraBody?: Record<string, unknown>;
        customHeader?: Record<string, string>;
    };
    /** Anthropic SDK compatibility configuration */
    anthropic?: {
        baseUrl?: string;
        extraBody?: Record<string, unknown>;
        customHeader?: Record<string, string>;
    };
    /** OpenAI Responses SDK compatibility configuration */
    responses?: {
        baseUrl?: string;
        extraBody?: Record<string, unknown>;
        customHeader?: Record<string, string>;
    };
    /** Provider rate-limit tuning used by request throttling helpers */
    rateLimit?: RateLimitSelection;
}

export interface RateLimitConfig {
    /** Requests allowed within the configured window */
    requestsPerSecond: number;
    /** Window size in milliseconds (defaults to 1000) */
    windowMs?: number;
}

export interface RateLimitSelection {
    /** Fallback rate limit when no SDK-specific override matches */
    default?: RateLimitConfig;
    /** OpenAI SDK requests-per-second tuning */
    openai?: RateLimitConfig;
    /** Anthropic SDK requests-per-second tuning */
    anthropic?: RateLimitConfig;
    /** OpenAI Responses SDK requests-per-second tuning */
    responses?: RateLimitConfig;
}

export const DEFAULT_PROVIDER_RATE_LIMIT: RateLimitConfig = {
    requestsPerSecond: 1,
    windowMs: 1000
};

type RateLimitHeaderSource =
    | Headers
    | Record<string, string | string[] | undefined>;

const providerRateLimitCache = new Map<string, RateLimitConfig>();

function getRateLimitCacheKey(providerId: string, sdkMode?: SdkMode): string {
    return `${providerId}:${sdkMode || 'default'}`;
}

function normalizeRateLimitConfig(
    config?: Partial<RateLimitConfig> | null
): RateLimitConfig | undefined {
    if (!config) {
        return undefined;
    }

    const requestsPerSecond = Math.max(
        1,
        Math.floor(config.requestsPerSecond || 1)
    );
    const windowMs = Math.max(1000, Math.floor(config.windowMs || 1000));

    return {
        requestsPerSecond,
        windowMs
    };
}

function getHeaderValue(
    headers: RateLimitHeaderSource,
    name: string
): string | undefined {
    if (headers instanceof Headers) {
        return (
            headers.get(name) || headers.get(name.toLowerCase()) || undefined
        );
    }

    const value = headers[name] || headers[name.toLowerCase()];
    if (Array.isArray(value)) {
        return value[0];
    }

    return value;
}

function parseHeaderNumber(
    headers: RateLimitHeaderSource,
    ...names: string[]
): number | undefined {
    for (const name of names) {
        const raw = getHeaderValue(headers, name)?.trim();
        if (!raw) {
            continue;
        }

        const value = Number.parseFloat(raw);
        if (!Number.isFinite(value) || Number.isNaN(value) || value <= 0) {
            continue;
        }

        return value;
    }

    return undefined;
}

function parseDynamicRateLimitFromHeaders(
    headers: RateLimitHeaderSource
): RateLimitConfig | undefined {
    const retryAfterSeconds = parseHeaderNumber(headers, 'retry-after');
    if (retryAfterSeconds !== undefined) {
        return {
            requestsPerSecond: 1,
            windowMs: Math.max(1000, Math.ceil(retryAfterSeconds * 1000))
        };
    }

    const resetSeconds = parseHeaderNumber(
        headers,
        'x-ratelimit-reset-requests',
        'x-ratelimit-reset',
        'ratelimit-reset'
    );
    if (resetSeconds === undefined) {
        return undefined;
    }

    const limit = parseHeaderNumber(
        headers,
        'x-ratelimit-limit-requests',
        'x-ratelimit-limit',
        'ratelimit-limit'
    );

    if (limit === undefined) {
        return {
            requestsPerSecond: 1,
            windowMs: Math.max(1000, Math.ceil(resetSeconds * 1000))
        };
    }

    return {
        requestsPerSecond: Math.max(1, Math.floor(limit)),
        windowMs: Math.max(1000, Math.ceil(resetSeconds * 1000))
    };
}

export function setProviderRateLimit(
    providerId: string,
    rateLimit: RateLimitConfig,
    sdkMode?: SdkMode
): void {
    providerRateLimitCache.set(
        getRateLimitCacheKey(providerId, sdkMode),
        normalizeRateLimitConfig(rateLimit) || DEFAULT_PROVIDER_RATE_LIMIT
    );
}

export function recordProviderRateLimitFromHeaders(
    providerId: string,
    headers: RateLimitHeaderSource,
    sdkMode?: SdkMode
): RateLimitConfig | undefined {
    const rateLimit = parseDynamicRateLimitFromHeaders(headers);
    if (!rateLimit) {
        return undefined;
    }

    setProviderRateLimit(providerId, rateLimit, sdkMode);
    return rateLimit;
}

function getRateLimitModeKey(
    sdkMode?: SdkMode
): keyof RateLimitSelection | undefined {
    if (sdkMode === 'anthropic') {
        return 'anthropic';
    }

    if (sdkMode === 'oai-response') {
        return 'responses';
    }

    if (sdkMode === 'openai') {
        return 'openai';
    }

    return undefined;
}

export function getProviderRateLimit(
    providerId: string,
    sdkMode?: SdkMode
): RateLimitConfig | undefined {
    const cachedRateLimit = providerRateLimitCache.get(
        getRateLimitCacheKey(providerId, sdkMode)
    );
    if (cachedRateLimit) {
        return cachedRateLimit;
    }

    const knownConfig = KnownProviders[providerId];
    const rateLimit = knownConfig?.rateLimit;
    if (!rateLimit) {
        return DEFAULT_PROVIDER_RATE_LIMIT;
    }

    const selectedMode =
        getRateLimitModeKey(sdkMode || knownConfig?.sdkMode) ?? undefined;
    if (selectedMode && rateLimit[selectedMode]) {
        return rateLimit[selectedMode];
    }

    return (
        rateLimit.default ||
        rateLimit.openai ||
        rateLimit.responses ||
        rateLimit.anthropic ||
        DEFAULT_PROVIDER_RATE_LIMIT
    );
}

/**
 * Central provider registry and compatibility adaptation information
 *
 * Priority when merging model configurations: Model Config > Provider Config > Known Provider Config
 * Merged parameters handled include:
 *   - customHeader,
 *   - override.extraBody
 *
 * This file is the single source of truth for provider metadata shared by:
 *   - compatible model flows
 *   - provider metadata registry
 *   - provider factory specialized-provider capability checks
 *
 * @static
 * @type {(Record<string, KnownProviderConfig>)}
 * @memberof CompatibleModelManager
 */
const knownProviderOverrides: Record<string, KnownProviderConfig> = {
    aihubmix: {
        displayName: 'AIHubMix',
        family: 'AIHubMix',
        customHeader: { 'APP-Code': 'TFUV4759' },
        openai: {
            baseUrl: 'https://aihubmix.com/v1'
        },
        anthropic: {
            baseUrl: 'https://aihubmix.com',
            extraBody: {
                top_p: null
            }
        },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    apertis: {
        displayName: 'Apertis AI',
        family: 'Apertis AI',
        description: 'Apertis AI endpoint integration',
        supportsApiKey: true,
        apiKeyTemplate: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        openai: {
            baseUrl: 'https://api.apertis.ai/v1'
        },
        anthropic: {
            baseUrl: 'https://api.apertis.ai'
        },
        responses: {
            baseUrl: 'https://api.apertis.ai/v1'
        },
        openModelEndpoint: false,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    blackbox: {
        displayName: 'Blackbox AI',
        family: 'Blackbox AI',
        description: 'Blackbox AI official API',
        supportsApiKey: true,
        apiKeyTemplate: 'YOUR_BLACKBOX_API_KEY',
        sdkMode: 'oai-response',
        fetchModels: true,
        modelsEndpoint: '/models',
        openai: {
            baseUrl: 'https://api.blackbox.ai/v1'
        },
        anthropic: {
            baseUrl: 'https://api.blackbox.ai/',
            customHeader: {
                'anthropic-version': '2023-06-01'
            }
        },
        responses: {
            baseUrl: 'https://api.blackbox.ai/v1'
        }
    },
    chatjimmy: {
        displayName: 'ChatJimmy',
        family: 'ChatJimmy',
        description: 'ChatJimmy - free public API, no auth required',
        supportsApiKey: false
    },
    'ava-supernova': {
        displayName: 'AVA Supernova',
        family: 'AVA Supernova',
        description: 'AVA Supernova - free public API, no auth required',
        supportsApiKey: false,
        openai: { baseUrl: 'https://ava-supernova.com/api/v1' },
        openModelEndpoint: true,
        fetchModels: false
    },
    cline: {
        displayName: 'Cline',
        family: 'Cline',
        description: 'Cline endpoint integration',
        openai: { baseUrl: 'https://api.cline.bot/api/v1' },
        fetchModels: true,
        openModelEndpoint: true,
        modelsEndpoint: 'https://api.cline.bot/api/v1/ai/cline/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    chutes: {
        displayName: 'Chutes AI',
        family: 'Chutes AI',
        description: 'Chutes AI endpoint integration',
        openai: { baseUrl: 'https://llm.chutes.ai/v1' },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    codex: {
        displayName: 'OpenAI Codex',
        family: 'OpenAI Codex',
        description: 'OpenAI Codex specialized coding provider'
    },
    compatible: {
        displayName: 'OpenAI/Anthropic Compatible',
        family: 'Custom',
        description: 'Custom OpenAI/Anthropic compatible models',
        settingsPrefix: 'chp.compatibleModels'
    },
    deepinfra: {
        displayName: 'DeepInfra',
        family: 'DeepInfra',
        description: 'OpenAI-compatible endpoints from DeepInfra',
        openai: { baseUrl: 'https://api.deepinfra.com/v1/openai' },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    deepseek: {
        displayName: 'DeepSeek',
        family: 'DeepSeek',
        description: 'DeepSeek model family',
        openai: { baseUrl: 'https://api.deepseek.com/v1' },
        anthropic: { baseUrl: 'https://api.deepseek.com/anthropic' },
        apiKeyTemplate: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    huggingface: {
        displayName: 'Hugging Face',
        family: 'Hugging Face',
        description: 'Hugging Face Router endpoint integration',
        openai: { baseUrl: 'https://router.huggingface.co/v1' },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    kilo: {
        displayName: 'Kilo AI',
        family: 'Kilo AI',
        description: 'Kilo AI endpoint integration',
        openai: { baseUrl: 'https://api.kilo.ai/api/gateway' },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    lightningai: {
        displayName: 'LightningAI',
        family: 'LightningAI',
        description: 'LightningAI endpoint integration',
        openai: { baseUrl: 'https://lightning.ai/api/v1' },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    minimax: {
        displayName: 'MiniMax',
        family: 'MiniMax',
        description: 'MiniMax family models with coding endpoint options',
        openai: { baseUrl: 'https://api.minimaxi.com/v1' },
        anthropic: { baseUrl: 'https://api.minimaxi.com/anthropic' },
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    mistral: {
        displayName: 'Mistral AI',
        family: 'Mistral',
        description: 'Mistral AI model endpoints',
        openai: { baseUrl: 'https://api.mistral.ai/v1' },
        apiKeyTemplate: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        fetchModels: false // Mistral's model list is static and doesn't require fetching
    },
    modelscope: {
        displayName: 'ModelScope',
        family: 'ModelScope',
        openai: { baseUrl: 'https://api-inference.modelscope.ai/v1' },
        anthropic: { baseUrl: 'https://api-inference.modelscope.ai' },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    llmgateway: {
        displayName: 'LLMGateway',
        family: 'LLMGateway',
        description: 'LLMGateway - unified access to multiple AI models',
        openai: { baseUrl: 'https://api.llmgateway.io/v1' },
        anthropic: { baseUrl: 'https://api.llmgateway.io' },
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    moonshot: {
        displayName: 'MoonshotAI',
        family: 'Moonshot AI',
        description:
            'MoonshotAI Kimi model family with normal and coding plans',
        openai: { baseUrl: 'https://api.moonshot.ai/v1' },
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    nanogpt: {
        displayName: 'NanoGPT',
        family: 'NanoGPT',
        description: 'NanoGPT endpoint integration',
        openai: { baseUrl: 'https://nano-gpt.com/api/v1' },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    nvidia: {
        displayName: 'NVIDIA NIM',
        family: 'NVIDIA',
        description: 'NVIDIA NIM hosted model endpoints',
        openai: { baseUrl: 'https://integrate.api.nvidia.com/v1' },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    ollama: {
        displayName: 'Ollama',
        family: 'Ollama',
        description: "Ollama - use Ollama's OpenAI / Anthropic compatible API",
        openai: { baseUrl: 'https://ollama.com/v1' },
        anthropic: { baseUrl: 'https://ollama.com' },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    opencode: {
        displayName: 'OpenCode',
        family: 'OpenCode',
        description: 'OpenCode endpoint integration',
        sdkMode: 'openai',
        openai: { baseUrl: 'https://opencode.ai/zen/v1' },
        anthropic: { baseUrl: 'https://opencode.ai/zen' },
        rateLimit: {
            default: { requestsPerSecond: 1, windowMs: 1000 },
            openai: { requestsPerSecond: 1, windowMs: 1000 },
            anthropic: { requestsPerSecond: 1, windowMs: 1000 }
        },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    opencodego: {
        displayName: 'OpenCode Zen Go',
        family: 'OpenCode',
        description: 'OpenCode Zen Go endpoint integration',
        sdkMode: 'openai',
        openai: { baseUrl: 'https://opencode.ai/zen/go/v1' },
        anthropic: { baseUrl: 'https://opencode.ai/zen/go' },
        rateLimit: {
            default: { requestsPerSecond: 1, windowMs: 1000 },
            openai: { requestsPerSecond: 1, windowMs: 1000 },
            anthropic: { requestsPerSecond: 1, windowMs: 1000 }
        },
        openModelEndpoint: true,
        fetchModels: false
    },
    pollinations: {
        displayName: 'Pollinations AI',
        family: 'Pollinations',
        description: 'Pollinations AI',
        supportsApiKey: true,
        apiKeyTemplate: 'sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        openai: { baseUrl: 'https://gen.pollinations.ai/v1' },
        openModelEndpoint: true,
        fetchModels: false
    },
    qwencli: {
        displayName: 'Qwen CLI',
        family: 'Qwen',
        description: 'Qwen OAuth via local qwen-code CLI credentials',
        openai: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }
    },
    seraphyn: {
        displayName: 'Seraphyn',
        family: 'Seraphyn',
        description: 'Seraphyn AI - OpenAI SDK compatible endpoint',
        supportsApiKey: true,
        apiKeyTemplate: 'sk-xxxxxxxx',
        openai: {
            baseUrl: 'https://seraphyn.ai/api/v1'
        },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    vercelai: {
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
            tagsField: 'tags',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    zenmux: {
        displayName: 'Zenmux',
        family: 'Zenmux',
        description: 'Zenmux endpoint integration',
        openai: { baseUrl: 'https://zenmux.ai/api/v1' },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    knox: {
        displayName: 'Knox',
        family: 'Knox',
        description: 'Knox Chat - OpenAI SDK compatible endpoint',
        supportsApiKey: true,
        apiKeyTemplate: 'sk-xxxxxxxx',
        openai: {
            baseUrl: 'https://api.knox.chat/v1'
        },
        openModelEndpoint: true,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    hicapai: {
        displayName: 'HicapAI',
        family: 'HicapAI',
        description: 'HicapAI - OpenAI SDK compatible endpoint',
        supportsApiKey: true,
        apiKeyTemplate: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        openai: {
            baseUrl: 'https://api.hicap.ai/v1'
        },
        openModelEndpoint: false,
        fetchModels: true,
        modelsEndpoint: '/models',
        modelParser: {
            arrayPath: 'data',
            descriptionField: 'id',
            cooldownMinutes: 10
        }
    },
    zhipu: {
        displayName: 'Zhipu AI',
        family: 'Zhipu AI',
        description: 'GLM family models and coding plan features',
        openai: {
            baseUrl: 'https://open.bigmodel.cn/api/paas/v4'
        }
    },
    puter: {
        displayName: 'Puter AI',
        family: 'Puter AI',
        description:
            'Free AI API - access 500+ models including GPT, Claude, Gemini with Puter auth token',
        supportsApiKey: true,
        apiKeyTemplate: 'YOUR_PUTER_AUTH_TOKEN',
        openai: {
            baseUrl: 'https://api.puter.com/puterai/openai/v1'
        },
        openModelEndpoint: false,
        fetchModels: false
    }
};

export const KnownProviders: Record<string, KnownProviderConfig> =
    Object.fromEntries(
        Object.entries(knownProviderOverrides)
            .sort((left, right) => left[0].localeCompare(right[0]))
            .map(([providerId, config]) => [providerId, { ...config }])
    );

export type RegisteredProvider = {
    dispose?: () => void;
};

interface ProviderFactoryResult {
    provider: RegisteredProvider;
    disposables: vscode.Disposable[];
}

type ProviderFactory = (
    context: vscode.ExtensionContext,
    providerKey: string,
    providerConfig: ProviderConfig
) => Promise<ProviderFactoryResult>;

type ProviderFactoryModule = Record<string, unknown>;

function createLazyFactory(
    loadFactoryModule: () => Promise<ProviderFactoryModule>,
    exportName: string
): ProviderFactory {
    return async (context, providerKey, providerConfig) => {
        const providerModule = await loadFactoryModule();
        const providerFactory = providerModule[exportName] as {
            createAndActivate: (
                context: vscode.ExtensionContext,
                providerKey: string,
                providerConfig: ProviderConfig
            ) => ProviderFactoryResult;
        };
        return providerFactory.createAndActivate(
            context,
            providerKey,
            providerConfig
        );
    };
}

const specializedProviderFactories: Record<string, ProviderFactory> = {
    seraphyn: createLazyFactory(
        () => import('../providers/seraphyn/provider.js'),
        'SeraphynProvider'
    ),
    qwencli: createLazyFactory(
        () => import('../providers/qwencli/provider.js'),
        'QwenCliProvider'
    ),
    moonshot: createLazyFactory(
        () => import('../providers/moonshot/moonshotProvider.js'),
        'MoonshotProvider'
    ),
    llmgateway: createLazyFactory(
        () => import('../providers/llmgateway/llmgatewayProvider.js'),
        'LLGGatewayProvider'
    ),
    zhipu: createLazyFactory(
        () => import('../providers/zhipu/zhipuProvider.js'),
        'ZhipuProvider'
    )
};

async function registerProvider(
    context: vscode.ExtensionContext,
    providerKey: string,
    providerConfig: ProviderConfig
): Promise<{
    providerKey: string;
    provider: RegisteredProvider;
    disposables: vscode.Disposable[];
} | null> {
    try {
        const providerDisplayName =
            providerConfig.displayName ||
            KnownProviders[providerKey]?.displayName ||
            providerKey;

        Logger.trace(
            `Registering provider: ${providerDisplayName} (${providerKey})`
        );
        const startTime = Date.now();

        const specializedFactory = specializedProviderFactories[providerKey];
        let result: ProviderFactoryResult;

        if (specializedFactory) {
            result = await specializedFactory(
                context,
                providerKey,
                providerConfig
            );
        } else if (KnownProviders[providerKey]?.fetchModels) {
            // Use DynamicModelProvider for auto-fetching model lists
            const { DynamicModelProvider } = await import(
                '../providers/common/dynamicModelProvider.js'
            );
            const knownConfig = KnownProviders[providerKey];
            result = DynamicModelProvider.createAndActivateDynamic(
                context,
                providerKey,
                providerConfig,
                knownConfig
            );

            // Register specialized commands for MiniMax and Moonshot
            if (providerKey === 'minimax') {
                const setCodingKeyCommand = vscode.commands.registerCommand(
                    `chp.${providerKey}.setCodingPlanApiKey`,
                    async () => {
                        await MiniMaxWizard.setCodingPlanApiKey(
                            providerConfig.displayName,
                            providerConfig.apiKeyTemplate
                        );
                        await (
                            result.provider as any
                        ).modelInfoCache?.invalidateCache('minimax-coding');
                        (
                            result.provider as any
                        )._onDidChangeLanguageModelChatInformation.fire();
                    }
                );

                const setCodingPlanEndpointCommand =
                    vscode.commands.registerCommand(
                        `chp.${providerKey}.setCodingPlanEndpoint`,
                        async () => {
                            await MiniMaxWizard.setCodingPlanEndpoint(
                                providerConfig.displayName
                            );
                        }
                    );

                const configWizardCommand = vscode.commands.registerCommand(
                    `chp.${providerKey}.configWizard`,
                    async () => {
                        await MiniMaxWizard.startWizard(
                            providerConfig.displayName,
                            providerConfig.apiKeyTemplate
                        );
                    }
                );

                result.disposables.push(
                    setCodingKeyCommand,
                    setCodingPlanEndpointCommand,
                    configWizardCommand
                );
            } else if (providerKey === 'moonshot') {
                const configWizardCommand = vscode.commands.registerCommand(
                    `chp.${providerKey}.configWizard`,
                    async () => {
                        await MoonshotWizard.startWizard(
                            providerConfig.displayName,
                            providerConfig.apiKeyTemplate
                        );
                    }
                );

                result.disposables.push(configWizardCommand);
            }
        } else {
            const { GenericModelProvider } = await import(
                '../providers/common/genericModelProvider.js'
            );
            result = GenericModelProvider.createAndActivate(
                context,
                providerKey,
                providerConfig
            );
        }

        const elapsed = Date.now() - startTime;
        Logger.info(
            `${providerDisplayName} provider registered successfully (time: ${elapsed}ms)`
        );

        return {
            providerKey,
            provider: result.provider,
            disposables: result.disposables
        };
    } catch (error) {
        Logger.error(`Failed to register provider ${providerKey}:`, error);
        return null;
    }
}

export async function registerProvidersFromConfig(
    context: vscode.ExtensionContext,
    configProvider: ConfigProvider,
    excludeKeys: string[] = []
): Promise<{
    providers: Record<string, RegisteredProvider>;
    disposables: vscode.Disposable[];
}> {
    const startTime = Date.now();
    const registeredProviders: Record<string, RegisteredProvider> = {};
    const registeredDisposables: vscode.Disposable[] = [];

    const providerEntries = Object.entries(configProvider).filter(
        ([providerKey]) => !excludeKeys.includes(providerKey)
    );

    Logger.info(
        `⏱️ Starting parallel registration of ${providerEntries.length} providers...`
    );

    const registrationPromises = providerEntries.map(
        async ([providerKey, providerConfig]) =>
            registerProvider(context, providerKey, providerConfig)
    );

    const results = await Promise.all(registrationPromises);

    for (const result of results) {
        if (result) {
            registeredProviders[result.providerKey] = result.provider;
            registeredDisposables.push(...result.disposables);
        }
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter((result) => result !== null).length;
    Logger.info(
        `⏱️ Provider registration completed: ${successCount}/${providerEntries.length} successful (total time: ${totalTime}ms)`
    );

    return {
        providers: registeredProviders,
        disposables: registeredDisposables
    };
}

function toProviderKey(providerId: string): ProviderKey | undefined {
    const values = Object.values(ProviderKey) as string[];
    if (values.includes(providerId)) {
        return providerId as ProviderKey;
    }
    return undefined;
}

function getSdkCompatConfig(
    knownConfig: KnownProviderConfig,
    sdkMode: SdkMode
):
    | KnownProviderConfig['openai']
    | KnownProviderConfig['anthropic']
    | KnownProviderConfig['responses']
    | undefined {
    if (sdkMode === 'anthropic') {
        return knownConfig.anthropic;
    }

    if (sdkMode === 'oai-response') {
        return knownConfig.responses;
    }

    return knownConfig.openai;
}

function getPreferredSdkMode(knownConfig?: KnownProviderConfig): SdkMode {
    return knownConfig?.sdkMode || 'openai';
}

function getPreferredBaseUrl(
    knownConfig: KnownProviderConfig
): string | undefined {
    const preferredSdkMode = getPreferredSdkMode(knownConfig);
    return (
        knownConfig.baseUrl ||
        getSdkCompatConfig(knownConfig, preferredSdkMode)?.baseUrl ||
        knownConfig.openai?.baseUrl ||
        knownConfig.responses?.baseUrl ||
        knownConfig.anthropic?.baseUrl
    );
}

function getSdkMode(
    providerId: string
): 'openai' | 'anthropic' | 'oai-response' | 'mixed' {
    if (providerId === ProviderKey.Compatible) {
        return 'mixed';
    }

    const knownConfig = KnownProviders[providerId];
    const providerConfig = (
        configProviders as Record<string, { models: ModelConfig[] }>
    )[providerId];
    const modes = new Set<string>(
        (providerConfig?.models || []).map((model) => model.sdkMode || 'openai')
    );
    const hasAnthropic =
        !!knownConfig?.anthropic?.baseUrl || modes.has('anthropic');
    const hasOpenAI = !!knownConfig?.openai?.baseUrl || modes.has('openai');
    const hasResponses =
        !!knownConfig?.responses?.baseUrl || modes.has('oai-response');
    const concreteModesCount = [hasAnthropic, hasOpenAI, hasResponses].filter(
        Boolean
    ).length;

    if (concreteModesCount > 1) {
        return 'mixed';
    }
    if (hasResponses) {
        return 'oai-response';
    }
    if (hasAnthropic) {
        return 'anthropic';
    }
    return 'openai';
}

function resolveCategory(
    providerId: string,
    features: ProviderMetadata['features']
): ProviderCategory {
    const isOAuthProvider =
        providerId === ProviderKey.Codex || providerId === ProviderKey.QwenCli;

    if (features.supportsOAuth && !features.supportsApiKey) {
        return ProviderCategory.OAuth;
    }

    if (isOAuthProvider && features.supportsOAuth) {
        return ProviderCategory.OAuth;
    }

    const sdkMode = getSdkMode(providerId);
    if (sdkMode === 'anthropic') {
        return ProviderCategory.Anthropic;
    }

    return ProviderCategory.OpenAI;
}

function getDefaultFeatures(providerId: string): ProviderMetadata['features'] {
    const accountConfig = AccountManager.getProviderConfig(providerId);
    const isNoConfigProvider =
        providerId === ProviderKey.QwenCli || providerId === 'chatjimmy';
    const isCodex = providerId === ProviderKey.Codex;
    const isCompatible = providerId === ProviderKey.Compatible;
    return {
        supportsApiKey:
            (accountConfig.supportsApiKey && !isNoConfigProvider) ||
            isCodex ||
            isCompatible,
        supportsOAuth: accountConfig.supportsOAuth || isCodex,
        supportsMultiAccount: accountConfig.supportsMultiAccount,
        supportsConfigWizard: !isNoConfigProvider || isCodex
    };
}

const _providerRegistryCache: ProviderMetadata[] | null = null;

export function getAllProviders(): ProviderMetadata[] {
    const mergedConfig = buildConfigProvider(configProviders);
    const metadata: ProviderMetadata[] = Object.entries(mergedConfig).map(
        ([providerId, providerConfig]) => {
            const knownProvider = KnownProviders[providerId];
            const features = getDefaultFeatures(providerId);
            return {
                id: providerId,
                key: toProviderKey(providerId),
                displayName:
                    knownProvider?.displayName ||
                    providerConfig.displayName ||
                    providerId,
                category: resolveCategory(providerId, features),
                sdkMode: getSdkMode(providerId),
                description: knownProvider?.description,
                settingsPrefix:
                    knownProvider?.settingsPrefix || `chp.${providerId}`,
                baseUrl:
                    providerConfig.baseUrl ||
                    knownProvider?.baseUrl ||
                    knownProvider?.responses?.baseUrl ||
                    knownProvider?.anthropic?.baseUrl ||
                    knownProvider?.openai?.baseUrl,
                features,
                order: 0
            };
        }
    );

    if (!metadata.some((provider) => provider.id === ProviderKey.Compatible)) {
        const compatibleProvider = KnownProviders[ProviderKey.Compatible];
        metadata.push({
            id: ProviderKey.Compatible,
            key: ProviderKey.Compatible,
            displayName:
                compatibleProvider?.displayName ||
                'OpenAI/Anthropic Compatible',
            category: ProviderCategory.OpenAI,
            sdkMode: 'mixed',
            description:
                compatibleProvider?.description ||
                'Custom OpenAI/Anthropic compatible models',
            icon: '$(symbol-misc)',
            settingsPrefix:
                compatibleProvider?.settingsPrefix || 'chp.compatibleModels',
            baseUrl: '',
            features: getDefaultFeatures(ProviderKey.Compatible),
            order: 0
        });
    }

    metadata.sort((a, b) => a.id.localeCompare(b.id));
    for (const [index, provider] of metadata.entries()) {
        provider.order = index + 1;
    }
    Logger.trace(
        `[KnownProviders] Final metadata list has ${metadata.length} providers`
    );
    return metadata;
}

export function getProvider(providerId: string): ProviderMetadata | undefined {
    return getAllProviders().find((provider) => provider.id === providerId);
}

export const ProviderRegistry = {
    getAllProviders,
    getProvider
};

/**
 * Build complete ConfigProvider by merging JSON config files with declarative providers from KnownProviders
 * Providers with inline `models` defined in KnownProviders don't need separate JSON config files
 */
export function buildConfigProvider(
    configProvider: ConfigProvider
): ConfigProvider {
    const mergedConfig: ConfigProvider = { ...configProvider };
    Logger.trace(
        `[KnownProviders] Merging ${Object.keys(KnownProviders).length} known providers into ${Object.keys(configProvider).length} config providers`
    );

    for (const [providerKey, knownConfig] of Object.entries(KnownProviders)) {
        const existingConfig = mergedConfig[providerKey];

        // For existing providers, merge metadata and configurations
        if (existingConfig) {
            Logger.trace(
                `[KnownProviders] Merging metadata for existing provider: ${providerKey}`
            );
            // Merge provider-level metadata
            if (knownConfig.displayName) {
                existingConfig.displayName = knownConfig.displayName;
            }
            if (knownConfig.family) {
                existingConfig.family = knownConfig.family;
            }
            if (knownConfig.openModelEndpoint !== undefined) {
                existingConfig.openModelEndpoint =
                    knownConfig.openModelEndpoint;
            }
            if (knownConfig.modelsEndpoint) {
                existingConfig.modelsEndpoint = knownConfig.modelsEndpoint;
            }
            if (knownConfig.modelParser) {
                existingConfig.modelParser = knownConfig.modelParser;
            }
            if (knownConfig.fetchModels !== undefined) {
                existingConfig.fetchModels = knownConfig.fetchModels;
            }

            // Apply openai/anthropic baseUrl overrides if present
            if (!existingConfig.baseUrl) {
                const preferredBaseUrl = getPreferredBaseUrl(knownConfig);
                if (preferredBaseUrl) {
                    existingConfig.baseUrl = preferredBaseUrl;
                }
            }

            // Apply family and customHeader to all models in the static list
            existingConfig.models = (existingConfig.models || []).map(
                (model) => {
                    const sdkMode =
                        model.sdkMode || knownConfig.sdkMode || 'openai';
                    const sdkCompatConfig = getSdkCompatConfig(
                        knownConfig,
                        sdkMode
                    );

                    return {
                        ...model,
                        sdkMode,
                        family:
                            knownConfig.family || model.family || providerKey,
                        baseUrl:
                            model.baseUrl ||
                            sdkCompatConfig?.baseUrl ||
                            existingConfig.baseUrl,
                        customHeader: {
                            ...knownConfig.customHeader,
                            ...sdkCompatConfig?.customHeader,
                            ...model.customHeader
                        },
                        extraBody: {
                            ...(sdkCompatConfig?.extraBody ?? {}),
                            ...model.extraBody
                        }
                    };
                }
            );
            continue;
        }

        // Skip if no inline models defined AND not a dynamic fetching provider
        // (specialized providers handle their own setup)
        if (
            (!knownConfig.models || knownConfig.models.length === 0) &&
            !knownConfig.fetchModels
        ) {
            Logger.trace(
                `[KnownProviders] Skipping provider ${providerKey}: no models and no fetchModels`
            );
            continue;
        }

        // Check for required fields
        if (!knownConfig.displayName) {
            Logger.warn(
                `[KnownProviders] Skipping declarative provider "${providerKey}": missing displayName`
            );
            continue;
        }

        // Get baseUrl from openai config, anthropic config, or direct baseUrl
        const baseUrl = getPreferredBaseUrl(knownConfig);

        if (!baseUrl && !knownConfig.fetchModels) {
            Logger.warn(
                `[KnownProviders] Skipping declarative provider "${providerKey}": missing baseUrl`
            );
            continue;
        }

        Logger.trace(
            `[KnownProviders] Adding new declarative provider: ${providerKey}`
        );
        // Build complete ProviderConfig from inline definition
        const providerConfig: ProviderConfig = {
            displayName: knownConfig.displayName,
            baseUrl: baseUrl || '',
            apiKeyTemplate: knownConfig.apiKeyTemplate ?? '',
            supportsApiKey: knownConfig.supportsApiKey ?? true,
            openModelEndpoint: knownConfig.openModelEndpoint,
            modelsEndpoint: knownConfig.modelsEndpoint,
            modelParser: knownConfig.modelParser,
            family: knownConfig.family ?? providerKey,
            models: (knownConfig.models || []).map((modelConfig) => {
                const sdkMode =
                    modelConfig.sdkMode || knownConfig.sdkMode || 'openai';
                const sdkCompatConfig = getSdkCompatConfig(
                    knownConfig,
                    sdkMode
                );

                return {
                    ...modelConfig,
                    sdkMode,
                    baseUrl:
                        modelConfig.baseUrl ||
                        sdkCompatConfig?.baseUrl ||
                        baseUrl ||
                        '',
                    // Apply known provider-level overrides to each model if applicable
                    customHeader: {
                        ...knownConfig.customHeader,
                        ...sdkCompatConfig?.customHeader,
                        ...modelConfig.customHeader
                    },
                    extraBody: {
                        ...(sdkCompatConfig?.extraBody ?? {}),
                        ...modelConfig.extraBody
                    }
                };
            })
        };

        mergedConfig[providerKey] = providerConfig;
    }

    return mergedConfig;
}
