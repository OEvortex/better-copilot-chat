import { KnownProviders } from '../../../../src/utils/knownProvidersData.ts'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SdkMode } from '../../../../src/types/sharedTypes.ts'
import type { ProfileFile } from './providerProfile.ts'

const liveModelCache = new Map<string, { models: string[]; ts: number }>()
const LIVE_MODEL_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

async function fetchLiveModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const cacheKey = `${baseUrl}:${apiKey ? 'auth' : 'anon'}`
  const cached = liveModelCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < LIVE_MODEL_CACHE_TTL_MS) {
    return cached.models
  }

  const url = `${baseUrl.replace(/\/$/, '')}/models`
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  try {
    const resp = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(5000) })
    if (!resp.ok) {
      return []
    }

    const parsed = (await resp.json()) as Record<string, unknown>
    const data = parsed.data
    if (!Array.isArray(data)) {
      return []
    }

    const ids = data
      .filter((m): m is { id: string } => {
        if (typeof m !== 'object' || m === null) {
          return false
        }
        return typeof (m as { id?: string }).id === 'string'
      })
      .map((m) => m.id)

    liveModelCache.set(cacheKey, { models: ids, ts: Date.now() })
    return ids
  } catch {
    return []
  }
}

export async function getProviderLiveModels(
  provider: RegistryProvider,
): Promise<string[]> {
  const baseUrl =
    provider.profile
      ? (provider.profile.env.OPENAI_BASE_URL || provider.profile.env.GEMINI_BASE_URL || provider.profile.env.ANTHROPIC_BASE_URL)
      : provider.openai?.baseUrl || provider.anthropic?.baseUrl || provider.responses?.baseUrl

  if (!baseUrl) {
    return []
  }

  const apiKey =
    provider.profile
      ? (provider.profile.env.OPENAI_API_KEY || provider.profile.env.GEMINI_API_KEY || provider.profile.env.ANTHROPIC_API_KEY || provider.profile.env.CODEX_API_KEY)
      : provider.apiKey

  return fetchLiveModels(baseUrl, apiKey)
}

type ProviderCompatConfig = {
  baseUrl?: string
  extraBody?: Record<string, unknown>
  customHeader?: Record<string, string>
}

type SnapshotProviderEntry = {
  id: string
  displayName?: string
  label?: string
  description?: string
  liveModels?: string[]
  profile: ProfileFile
}

type ProviderSnapshot = {
  providers: SnapshotProviderEntry[]
}

export type ProviderSnapshotInput = ProviderSnapshot

export type RegistryProvider = {
  id: string
  displayName: string
  description?: string
  sdkMode?: SdkMode
  baseUrl?: string
  defaultModel?: string
  supportsApiKey?: boolean
  apiKeyTemplate?: string
  apiKey?: string
  accountId?: string
  liveModels?: string[]
  profile?: ProfileFile
  openai?: ProviderCompatConfig
  anthropic?: ProviderCompatConfig
  responses?: ProviderCompatConfig
}

export const AETHER_PROVIDER_SNAPSHOT_JSON_ENV =
  'AETHER_PROVIDER_SNAPSHOT_JSON'
export const AETHER_PROVIDER_SNAPSHOT_FILE_ENV =
  'AETHER_PROVIDER_SNAPSHOT_FILE'

function inferSdkModeFromProfile(profile: ProfileFile): SdkMode | undefined {
  switch (profile.profile) {
    case 'anthropic':
      return 'anthropic'
    case 'openai':
    case 'ollama':
    case 'codex':
    case 'atomic-chat':
      return 'openai'
    case 'gemini':
    default:
      return undefined
  }
}

function getProfileBaseUrl(profile: ProfileFile): string | undefined {
  switch (profile.profile) {
    case 'anthropic':
      return profile.env.ANTHROPIC_BASE_URL
    case 'gemini':
      return profile.env.GEMINI_BASE_URL
    default:
      return profile.env.OPENAI_BASE_URL
  }
}

function getProfileDefaultModel(profile: ProfileFile): string | undefined {
  switch (profile.profile) {
    case 'anthropic':
      return profile.env.ANTHROPIC_MODEL
    case 'gemini':
      return profile.env.GEMINI_MODEL
    default:
      return profile.env.OPENAI_MODEL
  }
}

function getProfileApiKey(profile: ProfileFile): string | undefined {
  switch (profile.profile) {
    case 'anthropic':
      return profile.env.ANTHROPIC_API_KEY
    case 'gemini':
      return profile.env.GEMINI_API_KEY || profile.env.GOOGLE_API_KEY
    case 'codex':
      return profile.env.CODEX_API_KEY
    default:
      return profile.env.OPENAI_API_KEY
  }
}

function getProfileAccountId(profile: ProfileFile): string | undefined {
  switch (profile.profile) {
    case 'codex':
      return profile.env.CHATGPT_ACCOUNT_ID || profile.env.CODEX_ACCOUNT_ID
    default:
      return undefined
  }
}

function toSnapshotProvider(entry: SnapshotProviderEntry): RegistryProvider {
  const profile = entry.profile
  const sdkMode = inferSdkModeFromProfile(profile)
  const baseUrl = getProfileBaseUrl(profile)?.trim() || undefined
  const defaultModel = getProfileDefaultModel(profile)?.trim() || undefined
  const apiKey = getProfileApiKey(profile)?.trim() || undefined
  const accountId = getProfileAccountId(profile)?.trim() || undefined
  const compatConfig: ProviderCompatConfig | undefined = baseUrl
    ? { baseUrl }
    : undefined

  return {
    id: entry.id,
    displayName: entry.displayName || entry.label || entry.id,
    description: entry.description,
    sdkMode,
    baseUrl,
    defaultModel,
    supportsApiKey: apiKey !== undefined,
    apiKeyTemplate: apiKey ? 'configured' : undefined,
    apiKey,
    accountId,
    liveModels: entry.liveModels,
    profile,
    openai: sdkMode === 'anthropic' ? undefined : compatConfig,
    anthropic: sdkMode === 'anthropic' ? compatConfig : undefined,
    responses: sdkMode === 'oai-response' ? compatConfig : undefined,
  }
}

function inferSdkMode(config: ProviderConfig): SdkMode | undefined {
  const modes = new Set(
    config.models
      .map(model => model.sdkMode)
      .filter((mode): mode is SdkMode => Boolean(mode)),
  )

  if (modes.size === 1) {
    return [...modes][0]
  }

  return undefined
}

function inferSdkModeFromKnownConfig(config: typeof KnownProviders[string]): SdkMode | undefined {
  if ('sdkMode' in config && config.sdkMode) {
    return config.sdkMode as SdkMode
  }
  return undefined
}

function toConfigProvider(id: string, config: typeof KnownProviders[string]): RegistryProvider {
  const sdkMode = inferSdkModeFromKnownConfig(config)
  const baseUrl = config.openai?.baseUrl?.trim() || config.anthropic?.baseUrl?.trim() || config.responses?.baseUrl?.trim() || undefined
  const models = config.models || []
  const defaultModel = models[0]?.id
  const compatConfig: ProviderCompatConfig | undefined = baseUrl
    ? { baseUrl }
    : undefined

  return {
    id,
    displayName: config.displayName,
    description: models[0]?.tooltip,
    sdkMode,
    baseUrl,
    defaultModel,
    supportsApiKey: config.supportsApiKey,
    apiKeyTemplate: config.apiKeyTemplate,
    openai: sdkMode === 'anthropic' ? undefined : compatConfig,
    anthropic: sdkMode === 'anthropic' ? compatConfig : undefined,
    responses: sdkMode === 'oai-response' ? compatConfig : undefined,
  }
}

export function parseProviderSnapshot(
  raw: string | undefined,
): ProviderSnapshot | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ProviderSnapshot>
    if (!Array.isArray(parsed.providers)) {
      return null
    }

    const providers = parsed.providers.filter(
      (entry): entry is SnapshotProviderEntry =>
        Boolean(
          entry &&
            typeof entry === 'object' &&
            typeof entry.id === 'string' &&
            (typeof entry.displayName === 'string' ||
              typeof entry.label === 'string') &&
            entry.profile &&
            typeof entry.profile === 'object',
        ),
    )

    return { providers }
  } catch {
    return null
  }
}

function loadProviderSnapshotFromFile(filePath: string | undefined): ProviderSnapshot | null {
  if (!filePath) {
    return null
  }

  if (!existsSync(filePath)) {
    return null
  }

  try {
    return parseProviderSnapshot(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function loadFallbackProviderSnapshot(): ProviderSnapshot | null {
  return loadProviderSnapshotFromFile(
    join(homedir(), '.copilot-helper', 'aether-provider-snapshot.json'),
  )
}

export function getAllProviders(): RegistryProvider[] {
  const snapshot =
    parseProviderSnapshot(process.env[AETHER_PROVIDER_SNAPSHOT_JSON_ENV]) ||
    loadProviderSnapshotFromFile(process.env[AETHER_PROVIDER_SNAPSHOT_FILE_ENV]) ||
    loadFallbackProviderSnapshot()
  if (snapshot) {
    return getProvidersFromSnapshot(snapshot)
  }

  return Object.entries(KnownProviders)
    .map(([id, config]) => toConfigProvider(id, config))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export function getProvidersFromSnapshot(
  snapshot: ProviderSnapshot,
): RegistryProvider[] {
  return snapshot.providers
    .map(entry => toSnapshotProvider(entry))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export function getProvider(
  providerId: string,
  snapshot: ProviderSnapshot | null =
    parseProviderSnapshot(process.env[AETHER_PROVIDER_SNAPSHOT_JSON_ENV]) ||
    loadProviderSnapshotFromFile(process.env[AETHER_PROVIDER_SNAPSHOT_FILE_ENV]) ||
    loadFallbackProviderSnapshot(),
): RegistryProvider | undefined {
  if (snapshot) {
    const entry = snapshot.providers.find(provider => provider.id === providerId)
    if (entry) {
      return toSnapshotProvider(entry)
    }
  }

  const config = KnownProviders[providerId]
  if (!config) {
    return undefined
  }

  return toConfigProvider(providerId, config)
}
