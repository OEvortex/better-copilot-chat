/*---------------------------------------------------------------------------------------------
 *  Provider Type Definitions for CLI
 *  Mirrors extension's types/sharedTypes.ts (standalone, no vscode dep)
 *--------------------------------------------------------------------------------------------*/

export type SdkMode = 'anthropic' | 'openai' | 'oai-response';

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
    tags?: string[];
    family?: string;
    sdkMode?: SdkMode;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    customHeader?: Record<string, string>;
    provider?: string;
    extraBody?: Record<string, unknown>;
    outputThinking?: boolean;
    includeThinking?: boolean;
    thinkingBudget?: number;
}

export interface ModelOverride {
    id: string;
    model?: string;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    sdkMode?: SdkMode;
    capabilities?: {
        toolCalling?: boolean;
        imageInput?: boolean;
    };
    baseUrl?: string;
    customHeader?: Record<string, string>;
    extraBody?: Record<string, unknown>;
    outputThinking?: boolean;
}

export interface ProviderOverride {
    baseUrl?: string;
    customHeader?: Record<string, string>;
    sdkMode?: SdkMode;
    models?: ModelOverride[];
}

export interface ProviderConfig {
    displayName: string;
    baseUrl: string;
    apiKeyTemplate: string;
    supportsApiKey?: boolean;
    openModelEndpoint?: boolean;
    models: ModelConfig[];
    family?: string;
    modelsEndpoint?: string;
    fetchModels?: boolean;
    modelParser?: {
        arrayPath?: string;
        cooldownMinutes?: number;
        filterField?: string;
        filterValue?: string;
        idField?: string;
        nameField?: string;
        descriptionField?: string;
        contextLengthField?: string;
    };
}

export type ConfigProvider = Record<string, ProviderConfig>;
export type UserConfigOverrides = Record<string, ProviderOverride>;
