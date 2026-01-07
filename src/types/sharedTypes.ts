/*---------------------------------------------------------------------------------------------
 *  Shared Type Definitions
 *  Universal type definitions supporting multiple providers
 *--------------------------------------------------------------------------------------------*/

/**
 * Model Configuration Interface
 */
export interface ModelConfig {
    id: string;
    name: string;
    tooltip: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    version?: string;
    capabilities: {
        toolCalling: boolean;
        imageInput: boolean;
    };
    /**
     * SDK mode selection (optional)
     * - "anthropic": Use Anthropic SDK
     * - "openai": Use OpenAI SDK (default)
     * - "openai-sse": Use OpenAI SSE compatible mode (custom implementation for streaming response handling)
     */
    sdkMode?: 'anthropic' | 'openai' | 'openai-sse';
    /**
     * Model-specific baseUrl (optional)
     * If provided, will override provider-level baseUrl
     */
    baseUrl?: string;
    /**
     * Model-specific request model name (optional)
     * If provided, will use this model name instead of model ID to initiate requests
     */
    model?: string;
    /**
     * Model-specific custom HTTP headers (optional)
     * If provided, will append these custom headers in API requests
     */
    customHeader?: Record<string, string>;
    /**
     * Model-specific provider identifier (optional)
     * Used for custom models, specifies which provider this model uses for API key lookup
     * If provided, Handler will prioritize getting API key from this provider
     */
    provider?: string;
    /**
     * Additional request body parameters (optional)
     * If provided, will be merged into request body in API requests
     */
    extraBody?: Record<string, unknown>;
    /**
     * Whether to enable output thinking process (optional)
     * Default value is true, enable thinking content output (advanced feature)
     * When set to false, handler will not report thinking content
     * Note: This feature is enabled by default, no manual user configuration required
     */
    outputThinking?: boolean;
    /**
     * Whether multi-round dialogue messages must include thinking content (optional)
     * Default value is false, meaning thinking content is optionally passed to model
     * When model requires tool messages to include thinking content, set to true
     */
    includeThinking?: boolean;
    thinkingBudget?: number;
}

/**
 * Model Override Configuration Interface - Used for user configuration override
 */
export interface ModelOverride {
    id: string;
    /** Override model name */
    model?: string;
    /** Override maximum input token count */
    maxInputTokens?: number;
    /** Override maximum output token count */
    maxOutputTokens?: number;
    /** Override SDK mode: openai (OpenAI compatible format) or anthropic (Anthropic compatible format) */
    sdkMode?: 'anthropic' | 'openai';
    /** Merge capabilities (will be merged with original capabilities) */
    capabilities?: {
        toolCalling?: boolean;
        imageInput?: boolean;
    };
    /** Override baseUrl */
    baseUrl?: string;
    /**
     * Model-specific custom HTTP headers (optional)
     * If provided, will append these custom headers in API requests
     */
    customHeader?: Record<string, string>;
    /**
     * Extra request body parameters (optional)
     * If provided, will be merged into request body in API requests
     */
    extraBody?: Record<string, unknown>;
    /**
     * Whether to show thinking process in chat interface (recommended for thinking models)
     */
    outputThinking?: boolean;
}

/**
 * Provider Override Configuration Interface - Used for user configuration override
 */
export interface ProviderOverride {
    /** Override provider-level baseUrl */
    baseUrl?: string;
    /** Provider-level custom HTTP headers (optional) */
    customHeader?: Record<string, string>;
    /** Model override configuration list */
    models?: ModelOverride[];
}

/**
 * Provider Configuration Interface - From package.json
 */
export interface ProviderConfig {
    displayName: string;
    baseUrl: string;
    apiKeyTemplate: string;
    models: ModelConfig[];
}

/**
 * Complete Configuration Provider Structure - From package.json
 */
export type ConfigProvider = Record<string, ProviderConfig>;

/**
 * User Configuration Override Interface - From VS Code Settings
 */
export type UserConfigOverrides = Record<string, ProviderOverride>;

/**
 * API Key Validation Result
 */
export interface ApiKeyValidation {
    isValid: boolean;
    error?: string;
    isEmpty?: boolean;
}
