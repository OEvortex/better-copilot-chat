import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { AccountManager } from '../accounts/accountManager';
import type { AccountCredentials } from '../accounts/types';
import type { ConfigProvider, ModelConfig } from '../types/sharedTypes';
import { ApiKeyManager } from './apiKeyManager';
import { ConfigManager } from './configManager';
import { getAllProviders, KnownProviders } from './knownProviders';
import { Logger } from './logger';

async function fetchLiveModels(
    baseUrl: string,
    apiKey?: string,
    modelsEndpoint: string = '/models',
    customHeader?: Record<string, string>,
    openaiCustomHeader?: Record<string, string>
): Promise<{ id: string; name?: string }[]> {
    const url = modelsEndpoint.startsWith('http')
        ? modelsEndpoint
        : `${baseUrl.replace(/\/$/, '')}${modelsEndpoint.startsWith('/') ? '' : '/'}${modelsEndpoint}`;

    const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(customHeader || {}),
        ...(openaiCustomHeader || {})
    };
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    try {
        const resp = await fetch(url, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(5000)
        });
        if (!resp.ok) {
            return [];
        }

        const parsed = (await resp.json()) as Record<string, unknown>;
        const data = parsed.data;
        if (!Array.isArray(data)) {
            return [];
        }

        return data
            .filter((m): m is { id: string; name?: string } => {
                if (typeof m !== 'object' || m === null) {
                    return false;
                }
                return typeof (m as { id?: string }).id === 'string';
            })
            .map((m) => ({
                id: m.id,
                name: (m as { name?: string }).name
            }));
    } catch {
        return [];
    }
}

type OpenClaudeProfileName = 'openai' | 'ollama' | 'gemini' | 'codex';

export interface OpenClaudeProfileFile {
    profile: OpenClaudeProfileName;
    env: Record<string, string>;
    createdAt: string;
}

export interface OpenClaudeBridgeResult {
    filePath: string;
    profile: OpenClaudeProfileFile;
}

export const AETHER_PROFILE_JSON_ENV = 'AETHER_PROFILE_JSON';
export const AETHER_PROVIDER_SNAPSHOT_JSON_ENV =
    'AETHER_PROVIDER_SNAPSHOT_JSON';
export const AETHER_PROVIDER_SNAPSHOT_FILE_ENV =
    'AETHER_PROVIDER_SNAPSHOT_FILE';

export interface OpenClaudeProviderSnapshotEntry {
    id: string;
    label: string;
    detail?: string;
    liveModels?: string[];
    profile: OpenClaudeProfileFile;
}

export interface OpenClaudeProviderSnapshot {
    providers: OpenClaudeProviderSnapshotEntry[];
    createdAt: string;
}

function toTrimmedString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function getProviderModel(
    providerConfig?: ConfigProvider[string]
): ModelConfig | undefined {
    return providerConfig?.models?.[0];
}

function getProviderDisplayName(providerId: string): string {
    return (
        KnownProviders[providerId]?.displayName ||
        getAllProviders().find((provider) => provider.id === providerId)
            ?.displayName ||
        providerId
    );
}

function resolveProviderBaseUrl(
    providerId: string,
    providerConfig?: ConfigProvider[string],
    modelConfig?: ModelConfig
): string | undefined {
    return (
        modelConfig?.baseUrl ||
        providerConfig?.baseUrl ||
        KnownProviders[providerId]?.baseUrl ||
        KnownProviders[providerId]?.openai?.baseUrl ||
        KnownProviders[providerId]?.responses?.baseUrl ||
        KnownProviders[providerId]?.anthropic?.baseUrl
    );
}

async function resolveProviderCredentials(providerId: string): Promise<{
    apiKey?: string;
    accountId?: string;
    credentials?: AccountCredentials;
}> {
    const accountManager = AccountManager.getInstance();
    const [activeCredentials, activeApiKey, storedApiKey] = await Promise.all([
        accountManager.getActiveCredentials(providerId),
        accountManager.getActiveApiKey(providerId),
        ApiKeyManager.getApiKey(providerId)
    ]);

    const apiKey =
        activeApiKey ||
        storedApiKey ||
        (activeCredentials && 'apiKey' in activeCredentials
            ? activeCredentials.apiKey
            : undefined) ||
        (activeCredentials && 'accessToken' in activeCredentials
            ? activeCredentials.accessToken
            : undefined) ||
        toTrimmedString(KnownProviders[providerId]?.defaultApiKey);

    const accountId = accountManager.getActiveAccount(providerId)?.id;

    return {
        apiKey: toTrimmedString(apiKey),
        accountId,
        credentials: activeCredentials
    };
}

function buildOpenAIProfile(
    providerId: string,
    providerConfig?: ConfigProvider[string],
    modelConfig?: ModelConfig,
    apiKey?: string
): OpenClaudeProfileFile {
    const env: Record<string, string> = {};
    const baseUrl = resolveProviderBaseUrl(
        providerId,
        providerConfig,
        modelConfig
    );
    const modelName =
        toTrimmedString(modelConfig?.model) ||
        toTrimmedString(modelConfig?.id) ||
        toTrimmedString(providerConfig?.models?.[0]?.model) ||
        toTrimmedString(providerConfig?.models?.[0]?.id) ||
        providerId;

    if (baseUrl) {
        env.OPENAI_BASE_URL = baseUrl;
    }
    env.OPENAI_MODEL = modelName;

    if (apiKey) {
        env.OPENAI_API_KEY = apiKey;
    }

    return {
        profile: 'openai',
        env,
        createdAt: new Date().toISOString()
    };
}

function buildOllamaProfile(
    providerConfig?: ConfigProvider[string],
    modelConfig?: ModelConfig
): OpenClaudeProfileFile {
    const env: Record<string, string> = {};
    const baseUrl =
        resolveProviderBaseUrl('ollama', providerConfig, modelConfig) ||
        'http://localhost:11434/v1';
    const modelName =
        toTrimmedString(modelConfig?.model) ||
        toTrimmedString(modelConfig?.id) ||
        toTrimmedString(providerConfig?.models?.[0]?.model) ||
        toTrimmedString(providerConfig?.models?.[0]?.id) ||
        'llama3.1:8b';

    env.OPENAI_BASE_URL = baseUrl;
    env.OPENAI_MODEL = modelName;

    return {
        profile: 'ollama',
        env,
        createdAt: new Date().toISOString()
    };
}

function buildGeminiProfile(
    providerConfig?: ConfigProvider[string],
    modelConfig?: ModelConfig,
    apiKey?: string
): OpenClaudeProfileFile {
    const env: Record<string, string> = {};
    const baseUrl = resolveProviderBaseUrl(
        'gemini',
        providerConfig,
        modelConfig
    );
    const modelName =
        toTrimmedString(modelConfig?.model) ||
        toTrimmedString(modelConfig?.id) ||
        toTrimmedString(providerConfig?.models?.[0]?.model) ||
        toTrimmedString(providerConfig?.models?.[0]?.id) ||
        'gemini-2.0-flash';

    env.GEMINI_MODEL = modelName;
    if (baseUrl) {
        env.GEMINI_BASE_URL = baseUrl;
    }
    env.GEMINI_AUTH_MODE = apiKey ? 'api-key' : 'adc';
    if (apiKey) {
        env.GEMINI_API_KEY = apiKey;
    }

    return {
        profile: 'gemini',
        env,
        createdAt: new Date().toISOString()
    };
}

function buildCodexProfile(
    providerConfig?: ConfigProvider[string],
    modelConfig?: ModelConfig,
    apiKey?: string,
    accountId?: string
): OpenClaudeProfileFile {
    const env: Record<string, string> = {};
    const baseUrl = resolveProviderBaseUrl(
        'codex',
        providerConfig,
        modelConfig
    );
    const modelName =
        toTrimmedString(modelConfig?.model) ||
        toTrimmedString(modelConfig?.id) ||
        toTrimmedString(providerConfig?.models?.[0]?.model) ||
        toTrimmedString(providerConfig?.models?.[0]?.id) ||
        'codexplan';

    env.OPENAI_BASE_URL = baseUrl || 'https://chatgpt.com/backend-api/codex';
    env.OPENAI_MODEL = modelName;

    if (apiKey) {
        env.CODEX_API_KEY = apiKey;
    }
    if (accountId) {
        env.CHATGPT_ACCOUNT_ID = accountId;
    }

    return {
        profile: 'codex',
        env,
        createdAt: new Date().toISOString()
    };
}

function buildProfileForProvider(
    providerId: string,
    providerConfig?: ConfigProvider[string],
    modelConfig?: ModelConfig,
    apiKey?: string,
    accountId?: string
): OpenClaudeProfileFile {
    switch (providerId) {
        case 'codex':
            return buildCodexProfile(
                providerConfig,
                modelConfig,
                apiKey,
                accountId
            );
        case 'gemini':
            return buildGeminiProfile(providerConfig, modelConfig, apiKey);
        case 'ollama':
            return buildOllamaProfile(providerConfig, modelConfig);
        default:
            return buildOpenAIProfile(
                providerId,
                providerConfig,
                modelConfig,
                apiKey
            );
    }
}

export async function buildOpenClaudeProfile(
    providerId: string
): Promise<OpenClaudeProfileFile | null> {
    const configProvider = ConfigManager.getConfigProvider();
    const providerConfig = configProvider[providerId];
    if (!providerConfig && !KnownProviders[providerId]) {
        return null;
    }

    const knownConfig = KnownProviders[providerId];
    const modelConfig = getProviderModel(providerConfig);
    const { apiKey, accountId } = await resolveProviderCredentials(providerId);
    const displayName = getProviderDisplayName(providerId);

    Logger.trace(
        `Building OpenClaude profile from ${displayName} (${providerId})`
    );

    // For fetchModels-enabled providers, try to fetch live models
    if (knownConfig?.fetchModels && knownConfig?.modelsEndpoint) {
        const baseUrl = resolveProviderBaseUrl(
            providerId,
            providerConfig,
            modelConfig
        );
        if (baseUrl) {
            const effectiveKey =
                providerId === 'ollama' && knownConfig.openModelEndpoint
                    ? apiKey || knownConfig.defaultApiKey
                    : apiKey;
            if (
                providerId !== 'ollama' ||
                knownConfig.openModelEndpoint ||
                effectiveKey
            ) {
                const liveModels = await fetchLiveModels(
                    baseUrl,
                    effectiveKey,
                    knownConfig.modelsEndpoint,
                    knownConfig.customHeader,
                    knownConfig.openai?.customHeader
                );
                if (liveModels.length > 0) {
                    const firstModel = liveModels[0].name || liveModels[0].id;
                    const updatedModelConfig: ModelConfig = {
                        id: modelConfig?.id ?? firstModel,
                        name: modelConfig?.name ?? firstModel,
                        model: firstModel,
                        maxInputTokens: modelConfig?.maxInputTokens ?? 4096,
                        maxOutputTokens: modelConfig?.maxOutputTokens ?? 4096,
                        capabilities: modelConfig?.capabilities ?? {
                            toolCalling: true,
                            imageInput: false
                        },
                        baseUrl: modelConfig?.baseUrl ?? '',
                        sdkMode: modelConfig?.sdkMode,
                        customHeader: modelConfig?.customHeader,
                        extraBody: modelConfig?.extraBody,
                        tooltip: modelConfig?.tooltip ?? firstModel
                    };
                    return buildProfileForProvider(
                        providerId,
                        providerConfig,
                        updatedModelConfig,
                        apiKey,
                        accountId
                    );
                }
            }
        }
    }

    return buildProfileForProvider(
        providerId,
        providerConfig,
        modelConfig,
        apiKey,
        accountId
    );
}

export async function writeOpenClaudeBridgeProfile(
    context: vscode.ExtensionContext,
    providerId: string
): Promise<OpenClaudeBridgeResult> {
    const profile = await buildOpenClaudeProfile(providerId);
    if (!profile) {
        throw new Error(
            `Provider "${providerId}" cannot be exported to OpenClaude.`
        );
    }

    const targetDir = join(homedir(), '.copilot-helper');
    mkdirSync(targetDir, { recursive: true });

    const filePath = join(targetDir, '.aether.json');
    writeFileSync(filePath, JSON.stringify(profile, null, 2), {
        encoding: 'utf8',
        mode: 0o600
    });

    return { filePath, profile };
}

export async function buildOpenClaudeLaunchEnv(
    providerId: string
): Promise<Record<string, string>> {
    const profile = await buildOpenClaudeProfile(providerId);
    if (!profile) {
        throw new Error(
            `Provider "${providerId}" cannot be exported to OpenClaude.`
        );
    }

    const snapshot = await buildOpenClaudeProviderSnapshot();
    const snapshotPath = writeOpenClaudeProviderSnapshot(snapshot);
    return {
        [AETHER_PROFILE_JSON_ENV]: JSON.stringify(profile),
        [AETHER_PROVIDER_SNAPSHOT_JSON_ENV]: JSON.stringify(snapshot),
        [AETHER_PROVIDER_SNAPSHOT_FILE_ENV]: snapshotPath
    };
}

export async function buildOpenClaudeProviderSnapshot(): Promise<OpenClaudeProviderSnapshot> {
    const providers = await getLaunchableOpenClaudeProviders();
    const snapshotRows: OpenClaudeProviderSnapshotEntry[] = [];

    for (const provider of providers) {
        const profile = await buildOpenClaudeProfile(provider.id);
        if (!profile) {
            continue;
        }

        snapshotRows.push({
            id: provider.id,
            label: provider.label,
            detail: provider.detail,
            liveModels: provider.liveModelIds,
            profile
        });
    }

    return {
        providers: snapshotRows,
        createdAt: new Date().toISOString()
    };
}

function writeOpenClaudeProviderSnapshot(
    snapshot: OpenClaudeProviderSnapshot
): string {
    const targetDir = join(homedir(), '.copilot-helper');
    mkdirSync(targetDir, { recursive: true });

    const filePath = join(targetDir, 'aether-provider-snapshot.json');
    writeFileSync(filePath, JSON.stringify(snapshot, null, 2), {
        encoding: 'utf8',
        mode: 0o600
    });

    return filePath;
}

export async function getLaunchableOpenClaudeProviders(): Promise<
    Array<{
        id: string;
        label: string;
        detail: string;
        liveModelIds?: string[];
    }>
> {
    const providers = getAllProviders();
    const eligible = providers.filter((p) => p.id !== 'compatible');

    // Parallel fetch models from providers that support fetchModels
    const modelResults = await Promise.all(
        eligible.map(async (provider) => {
            const knownConfig = KnownProviders[provider.id];
            if (!knownConfig?.fetchModels || !knownConfig?.modelsEndpoint) {
                return undefined;
            }

            const configProvider = ConfigManager.getConfigProvider();
            const providerConfig = configProvider[provider.id];
            const modelConfig = getProviderModel(providerConfig);
            const baseUrl = resolveProviderBaseUrl(
                provider.id,
                providerConfig,
                modelConfig
            );
            if (!baseUrl) {
                return undefined;
            }

            const { apiKey } = await resolveProviderCredentials(provider.id);
            const effectiveKey =
                provider.id === 'ollama' && knownConfig.openModelEndpoint
                    ? apiKey || knownConfig.defaultApiKey || undefined
                    : apiKey;
            if (
                provider.id !== 'ollama' &&
                !effectiveKey &&
                knownConfig.openModelEndpoint !== true
            ) {
                return undefined;
            }

            try {
                const models = await fetchLiveModels(
                    baseUrl,
                    effectiveKey,
                    knownConfig.modelsEndpoint,
                    knownConfig.customHeader,
                    knownConfig.openai?.customHeader
                );
                return {
                    id: provider.id,
                    count: models.length,
                    modelIds: models.map((m) =>
                        m.id
                            .replace(/[/]/g, '-')
                            .replace(/[^a-zA-Z0-9-]/g, '-')
                            .toLowerCase()
                    )
                };
            } catch {
                return undefined;
            }
        })
    );

    return eligible
        .map((provider, index) => {
            const detail =
                provider.description ??
                provider.baseUrl ??
                provider.sdkMode ??
                '';
            const mc = modelResults[index];
            const enrichedDetail = mc
                ? `${mc.count} model${mc.count === 1 ? '' : 's'} available ${detail}`
                : detail;
            return {
                id: provider.id,
                label: provider.displayName,
                detail: enrichedDetail,
                liveModelIds: mc?.modelIds
            };
        })
        .sort((left, right) => left.label.localeCompare(right.label));
}

export async function launchOpenClaudeFromExtension(
    context: vscode.ExtensionContext
): Promise<void> {
    const providers = await getLaunchableOpenClaudeProviders();
    const picked = await vscode.window.showQuickPick(providers, {
        placeHolder: 'Choose a Copilot++ provider for OpenClaude'
    });

    if (!picked) {
        return;
    }

    const terminal = vscode.window.createTerminal({
        name: 'OpenClaude',
        cwd: context.extensionPath,
        env: await buildOpenClaudeLaunchEnv(picked.id)
    });

    terminal.show(true);
    terminal.sendText('npm run aether:dev');
}
