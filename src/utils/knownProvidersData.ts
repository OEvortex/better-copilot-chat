/**
 * Pure data exports for provider configuration — no VS Code or extension runtime dependencies.
 * This file is safe to import from CLI and non-extension contexts.
 */

export interface ModelConfig {
    id: string;
    name: string;
    tooltip?: string;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    capabilities?: {
        toolCalling?: boolean;
        imageInput?: boolean;
    };
    extraBody?: Record<string, unknown>;
    sdkMode?: 'openai' | 'anthropic' | 'oai-response';
    provider?: string;
    model?: string;
}

export interface ProviderOverride {
    customHeader?: Record<string, string>;
    extraBody?: Record<string, unknown>;
    sdkMode?: 'openai' | 'anthropic' | 'oai-response';
}

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

export interface KnownProviderConfig extends Partial<ProviderOverride> {
    displayName: string;
    description?: string;
    settingsPrefix?: string;
    models?: ModelConfig[];
    apiKeyTemplate?: string;
    supportsApiKey?: boolean;
    defaultApiKey?: string;
    openModelEndpoint?: boolean;
    family?: string;
    fetchModels?: boolean;
    modelsEndpoint?: string;
    modelParser?: {
        arrayPath?: string;
        cooldownMinutes?: number;
        filterField?: string;
        filterValue?: string;
        idField?: string;
        nameField?: string;
        descriptionField?: string;
        contextLengthField?: string;
        tagsField?: string;
    };
    openai?: {
        baseUrl?: string;
        extraBody?: Record<string, unknown>;
        customHeader?: Record<string, string>;
    };
    anthropic?: {
        baseUrl?: string;
        extraBody?: Record<string, unknown>;
        customHeader?: Record<string, string>;
    };
    responses?: {
        baseUrl?: string;
        extraBody?: Record<string, unknown>;
        customHeader?: Record<string, string>;
    };
    rateLimit?: RateLimitSelection;
    sdkMode?: string;
    baseUrl?: string;
}

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
        supportsApiKey: false
    },
    'ava-supernova': {
        displayName: 'AVA Supernova',
        family: 'AVA Supernova',
        supportsApiKey: false,
        openai: { baseUrl: 'https://ava-supernova.com/api/v1' },
        openModelEndpoint: true,
        fetchModels: false
    },
    cline: {
        displayName: 'Cline',
        family: 'Cline',
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
        family: 'OpenAI Codex'
    },
    compatible: {
        displayName: 'OpenAI/Anthropic Compatible',
        family: 'Custom',
        settingsPrefix: 'chp.compatibleModels'
    },
    deepinfra: {
        displayName: 'DeepInfra',
        family: 'DeepInfra',
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
        openai: { baseUrl: 'https://api.mistral.ai/v1' },
        apiKeyTemplate: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        fetchModels: false
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
        supportsApiKey: true,
        apiKeyTemplate: 'sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        openai: { baseUrl: 'https://gen.pollinations.ai/v1' },
        openModelEndpoint: true,
        fetchModels: false
    },
    qwencli: {
        displayName: 'Qwen CLI',
        family: 'Qwen',
        openai: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }
    },
    seraphyn: {
        displayName: 'Seraphyn',
        family: 'Seraphyn',
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
        openai: {
            baseUrl: 'https://open.bigmodel.cn/api/paas/v4'
        }
    },
    puter: {
        displayName: 'Puter AI',
        family: 'Puter AI',
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
