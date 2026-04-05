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
    SdkMode
} from '../types/sharedTypes';
import { Logger } from './logger';
import { KnownProviders, type KnownProviderConfig } from './knownProvidersData';

// Re-export data types for convenience
export { KnownProviders, type KnownProviderConfig } from './knownProvidersData';
export type { KnownProviderConfig as KnownProviderConfigType } from './knownProvidersData';

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
