/**
 * Known Providers Module
 * Manages provider and model configurations for multi-provider support
 * Uses configProviders from src/providers/config/index.ts (dynamic JSON configs)
 */

import { configProviders, type ProviderName } from '../../../../providers/config/index.js'
import { getSettings_DEPRECATED } from '../settings/settings.js'
import type { SettingsJson } from '../settings/types.js'

export interface KnownProvider {
  id: string
  name: string
  displayName: string
  baseUrl: string
  modelCount: number
  family?: string
}

export interface KnownModel {
  id: string
  name: string
  tooltip: string
  maxInputTokens: number
  maxOutputTokens: number
  capabilities: {
    toolCalling: boolean
    imageInput: boolean
  }
  model?: string
}

/**
 * Get all known providers from configProviders (dynamic JSON configs)
 */
export function getKnownProviders(): KnownProvider[] {
  const providers: KnownProvider[] = []

  for (const [id, config] of Object.entries(configProviders)) {
    providers.push({
      id,
      name: id,
      displayName: config.displayName,
      baseUrl: config.baseUrl,
      modelCount: config.models?.length ?? 0,
      family: config.family,
    })
  }

  return providers.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/**
 * Get provider configuration by ID
 */
export function getProviderConfig(providerId: string): KnownProvider | undefined {
  const providers = getKnownProviders()
  return providers.find(p => p.id === providerId || p.name === providerId)
}

/**
 * Get models for a specific provider from dynamic config
 */
export function getProviderModels(providerId: string): KnownModel[] {
  const config = configProviders[providerId as ProviderName]
  if (!config?.models) {
    return []
  }

  return config.models.map(m => ({
    id: m.id,
    name: m.name,
    tooltip: m.tooltip,
    maxInputTokens: m.maxInputTokens,
    maxOutputTokens: m.maxOutputTokens,
    capabilities: m.capabilities,
    model: m.model,
  }))
}

/**
 * Get ALL models from ALL providers (for /model list)
 */
export function getAllDynamicModels(): { provider: string, providerName: string, models: KnownModel[] }[] {
  const result: { provider: string, providerName: string, models: KnownModel[] }[] = []

  for (const [providerId, config] of Object.entries(configProviders)) {
    if (config.models && config.models.length > 0) {
      result.push({
        provider: providerId,
        providerName: config.displayName,
        models: config.models.map(m => ({
          id: m.id,
          name: m.name,
          tooltip: m.tooltip,
          maxInputTokens: m.maxInputTokens,
          maxOutputTokens: m.maxOutputTokens,
          capabilities: m.capabilities,
          model: m.model,
        })),
      })
    }
  }

  return result.sort((a, b) => a.providerName.localeCompare(b.providerName))
}

/**
 * Get current active provider from settings
 */
export function getActiveProvider(): string | undefined {
  const settings = getSettings_DEPRECATED() as SettingsJson | undefined
  return settings?.activeProvider
}

/**
 * Get current active model from settings
 */
export function getActiveModel(): string | undefined {
  const settings = getSettings_DEPRECATED() as SettingsJson | undefined
  return settings?.activeModel
}

/**
 * Get models for the currently active provider
 */
export function getActiveProviderModels(): KnownModel[] {
  const activeProvider = getActiveProvider()
  if (!activeProvider) {
    return []
  }
  return getProviderModels(activeProvider)
}

/**
 * Check if a provider exists in configProviders
 */
export function isKnownProvider(providerId: string): boolean {
  return providerId in configProviders
}

/**
 * Check if a model belongs to the active provider
 */
export function isModelInActiveProvider(modelId: string): boolean {
  const activeProvider = getActiveProvider()
  if (!activeProvider) {
    return true // No active provider, allow all models
  }

  const models = getProviderModels(activeProvider)
  return models.some(m => m.id === modelId || m.model === modelId)
}

/**
 * Get display string for current provider:model
 */
export function getCurrentProviderModelDisplay(): string {
  const provider = getActiveProvider()
  const model = getActiveModel()

  if (!provider && !model) {
    return 'Default'
  }

  if (provider && model) {
    return `${provider}:${model}`
  }

  return provider || model || 'Default'
}

/**
 * Set active provider in settings
 */
export function setActiveProvider(providerId: string): boolean {
  if (!isKnownProvider(providerId)) {
    return false
  }

  const settings = getSettings_DEPRECATED() as SettingsJson | undefined
  if (settings) {
    settings.activeProvider = providerId
  }
  return true
}

/**
 * Set active model in settings
 */
export function setActiveModel(modelId: string): void {
  const settings = getSettings_DEPRECATED() as SettingsJson | undefined
  if (settings) {
    settings.activeModel = modelId
  }
}