import { KnownProviders } from '../../../../src/utils/knownProvidersData.ts'
import type { SdkMode } from '../../../../src/types/sharedTypes.ts'

export interface ModelConfig {
  id: string
  name: string
  provider: string
  maxInputTokens?: number
  maxOutputTokens?: number
  pricing?: {
    input: number
    output: number
  }
  capabilities?: {
    toolCalling?: boolean
    imageInput?: boolean
    vision?: boolean
  }
}

export interface ProviderConfig {
  id: string
  displayName: string
  description: string
  baseUrl: string
  sdkMode?: SdkMode
  supportsApiKey?: boolean
  apiKeyTemplate?: string
  customHeader?: Record<string, string>
  defaultModel?: string
  models?: ModelConfig[]
}

function toProviderConfig(id: string, config: typeof KnownProviders[string]): ProviderConfig {
  const baseUrl = config.openai?.baseUrl || config.anthropic?.baseUrl || config.responses?.baseUrl || ''
  return {
    id,
    displayName: config.displayName,
    description: config.description || '',
    baseUrl,
    sdkMode: config.sdkMode as SdkMode | undefined,
    supportsApiKey: config.supportsApiKey,
    apiKeyTemplate: config.apiKeyTemplate,
    customHeader: config.customHeader,
    defaultModel: config.models?.[0]?.id,
    models: config.models?.map(model => toModelConfig(id, model)),
  }
}

function toModelConfig(providerId: string, model: NonNullable<typeof KnownProviders[string]['models']>[number]): ModelConfig {
  return {
    id: model.id,
    name: model.name,
    provider: providerId,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    capabilities: model.capabilities,
  }
}

export function getProviderById(id: string): ProviderConfig | undefined {
  const config = KnownProviders[id]
  if (!config) {
    return undefined
  }

  return toProviderConfig(id, config)
}

export function getAllProviders(): ProviderConfig[] {
  return Object.entries(KnownProviders)
    .map(([id, config]) => toProviderConfig(id, config))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export function getModelById(id: string): ModelConfig | undefined {
  for (const [providerId, config] of Object.entries(KnownProviders)) {
    const model = config.models?.find(entry => entry.id === id || entry.model === id)
    if (model) {
      return toModelConfig(providerId, model)
    }
  }

  return undefined
}

export function getModelsByProvider(providerId: string): ModelConfig[] {
  const provider = KnownProviders[providerId]
  if (!provider?.models) {
    return []
  }

  return provider.models.map(model => toModelConfig(providerId, model))
}

export function getAllModels(): ModelConfig[] {
  const models: ModelConfig[] = []

  for (const [providerId, config] of Object.entries(KnownProviders)) {
    for (const model of config.models ?? []) {
      models.push(toModelConfig(providerId, model))
    }
  }

  return models
}

export function getProviderForModel(modelId: string): ProviderConfig | undefined {
  const model = getModelById(modelId)
  if (!model) {
    return undefined
  }

  return getProviderById(model.provider)
}

export function getDefaultModelForProvider(providerId: string): ModelConfig | undefined {
  const provider = getProviderById(providerId)
  if (!provider) {
    return undefined
  }

  if (provider.defaultModel) {
    const defaultModel = getModelById(provider.defaultModel)
    if (defaultModel && defaultModel.provider === providerId) {
      return defaultModel
    }
  }

  return provider.models?.[0]
}
