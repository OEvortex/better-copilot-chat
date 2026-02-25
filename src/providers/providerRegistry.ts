import * as vscode from 'vscode';
import { GenericModelProvider } from './common/genericModelProvider';
import { CompatibleProvider } from './compatible/compatibleProvider';
import { ZhipuProvider } from './zhipu/zhipuProvider';
import { MiniMaxProvider } from './minimax/minimaxProvider';
import { ChutesProvider } from './chutes/chutesProvider';
import { ZenmuxProvider } from './zenmux/provider';
import { OpenCodeProvider } from './opencode/opencodeProvider';
import { LightningAIProvider } from './lightningai/provider';
import { QwenCliProvider } from './qwencli/provider';
import { GeminiCliProvider } from './geminicli/provider';
import { HuggingfaceProvider } from './huggingface/provider';
import { KiloProvider } from './kilo/provider';
import { DeepInfraProvider } from './deepinfra/deepinfraProvider';
import { MistralProvider } from './mistral/mistralProvider';
import { MoonshotProvider } from './moonshot/moonshotProvider';
import { NvidiaProvider } from './nvidia';
import { OllamaProvider } from './ollama';
import { BlackboxProvider } from './blackbox';
import { ProviderConfig } from '../types/sharedTypes';
import { Logger } from '../utils';

/**
 * Provider type union for all registered providers
 */
export type RegisteredProvider =
    | GenericModelProvider
    | ZhipuProvider
    | MiniMaxProvider
    | ChutesProvider
    | ZenmuxProvider
    | OpenCodeProvider
    | LightningAIProvider
    | QwenCliProvider
    | GeminiCliProvider
    | HuggingfaceProvider
    | KiloProvider
    | OllamaProvider
    | DeepInfraProvider
    | MistralProvider
    | MoonshotProvider
    | NvidiaProvider
    | BlackboxProvider
    | CompatibleProvider;

/**
 * Result returned by provider factory functions
 */
export interface ProviderFactoryResult {
    provider: RegisteredProvider;
    disposables: vscode.Disposable[];
}

/**
 * Provider factory function type
 */
type ProviderFactory = (
    context: vscode.ExtensionContext,
    providerKey: string,
    providerConfig: ProviderConfig
) => ProviderFactoryResult;

/**
 * Provider registry entry containing the factory and metadata
 */
interface ProviderRegistryEntry {
    factory: ProviderFactory;
    displayName: string;
}

/**
 * Provider registry - maps provider keys to their factory functions
 * Add new providers here to automatically register them
 */
const providerRegistry: Map<string, ProviderRegistryEntry> = new Map([
    ['zhipu', { factory: (ctx, key, cfg) => ZhipuProvider.createAndActivate(ctx, key, cfg), displayName: 'Zhipu AI' }],
    ['minimax', { factory: (ctx, key, cfg) => MiniMaxProvider.createAndActivate(ctx, key, cfg), displayName: 'MiniMax' }],
    ['chutes', { factory: (ctx, key, cfg) => ChutesProvider.createAndActivate(ctx, key, cfg), displayName: 'Chutes' }],
    ['zenmux', { factory: (ctx, key, cfg) => ZenmuxProvider.createAndActivate(ctx, key, cfg), displayName: 'Zenmux' }],
    ['lightningai', { factory: (ctx, key, cfg) => LightningAIProvider.createAndActivate(ctx, key, cfg), displayName: 'Lightning AI' }],
    ['opencode', { factory: (ctx, key, cfg) => OpenCodeProvider.createAndActivate(ctx, key, cfg), displayName: 'OpenCode' }],
    ['qwencli', { factory: (ctx, key, cfg) => QwenCliProvider.createAndActivate(ctx, key, cfg), displayName: 'Qwen CLI' }],
    ['geminicli', { factory: (ctx, key, cfg) => GeminiCliProvider.createAndActivate(ctx, key, cfg), displayName: 'Gemini CLI' }],
    ['huggingface', { factory: (ctx, key, cfg) => HuggingfaceProvider.createAndActivate(ctx, key, cfg), displayName: 'Hugging Face' }],
    ['kilo', { factory: (ctx, key, cfg) => KiloProvider.createAndActivate(ctx, key, cfg), displayName: 'Kilo' }],
    ['deepinfra', { factory: (ctx, key, cfg) => DeepInfraProvider.createAndActivate(ctx, key, cfg), displayName: 'DeepInfra' }],
    ['mistral', { factory: (ctx, key, cfg) => MistralProvider.createAndActivate(ctx, key, cfg), displayName: 'Mistral AI' }],
    ['moonshot', { factory: (ctx, key, cfg) => MoonshotProvider.createAndActivate(ctx, key, cfg), displayName: 'Moonshot AI' }],
    ['nvidia', { factory: (ctx, key, cfg) => NvidiaProvider.createAndActivate(ctx, key, cfg), displayName: 'NVIDIA NIM' }],
    ['ollama', { factory: (ctx, key, cfg) => OllamaProvider.createAndActivate(ctx, key, cfg), displayName: 'Ollama' }],
    ['blackbox', { factory: (ctx, key, cfg) => BlackboxProvider.createAndActivate(ctx, key, cfg), displayName: 'Blackbox AI' }],
]);

/**
 * Register a single provider using the registry
 * @param context Extension context
 * @param providerKey Provider key
 * @param providerConfig Provider configuration
 * @returns Provider registration result or null if registration failed
 */
export function registerProvider(
    context: vscode.ExtensionContext,
    providerKey: string,
    providerConfig: ProviderConfig
): { providerKey: string; provider: RegisteredProvider; disposables: vscode.Disposable[] } | null {
    try {
        Logger.trace(`Registering provider: ${providerConfig.displayName} (${providerKey})`);
        const startTime = Date.now();

        // Check if provider has a specialized factory in the registry
        const registryEntry = providerRegistry.get(providerKey);
        let result: ProviderFactoryResult;

        if (registryEntry) {
            // Use specialized provider factory from registry
            result = registryEntry.factory(context, providerKey, providerConfig);
        } else {
            // Fall back to generic provider (supports automatic selection based on sdkMode)
            result = GenericModelProvider.createAndActivate(context, providerKey, providerConfig);
        }

        const elapsed = Date.now() - startTime;
        Logger.info(`${providerConfig.displayName} provider registered successfully (time: ${elapsed}ms)`);

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

/**
 * Register all providers from configuration using the registry
 * @param context Extension context
 * @param configProvider Provider configuration object
 * @param excludeKeys Provider keys to exclude from registration
 * @returns Object containing registered providers and disposables
 */
export async function registerProvidersFromConfig(
    context: vscode.ExtensionContext,
    configProvider: Record<string, ProviderConfig>,
    excludeKeys: string[] = []
): Promise<{
    providers: Record<string, RegisteredProvider>;
    disposables: vscode.Disposable[];
}> {
    const startTime = Date.now();
    const registeredProviders: Record<string, RegisteredProvider> = {};
    const registeredDisposables: vscode.Disposable[] = [];

    // Filter out excluded providers
    const providerEntries = Object.entries(configProvider).filter(
        ([providerKey]) => !excludeKeys.includes(providerKey)
    );

    Logger.info(`⏱️ Starting parallel registration of ${providerEntries.length} providers...`);

    // Register all providers in parallel
    const registrationPromises = providerEntries.map(async ([providerKey, providerConfig]) => {
        return registerProvider(context, providerKey, providerConfig);
    });

    // Wait for all registrations to complete
    const results = await Promise.all(registrationPromises);

    // Collect successfully registered providers
    for (const result of results) {
        if (result) {
            registeredProviders[result.providerKey] = result.provider;
            registeredDisposables.push(...result.disposables);
        }
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter(r => r !== null).length;
    Logger.info(`⏱️ Provider registration completed: ${successCount}/${providerEntries.length} successful (total time: ${totalTime}ms)`);

    return { providers: registeredProviders, disposables: registeredDisposables };
}

/**
 * Get list of registered provider keys
 */
export function getRegisteredProviderKeys(): string[] {
    return Array.from(providerRegistry.keys());
}

/**
 * Check if a provider key has a specialized factory
 */
export function hasSpecializedProvider(providerKey: string): boolean {
    return providerRegistry.has(providerKey);
}
