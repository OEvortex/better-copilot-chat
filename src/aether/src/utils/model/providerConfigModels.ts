import path from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { getAPIProvider } from './providers.js'
import type { ModelSetting } from './model.js'

export type ProviderModelOption = {
  value: ModelSetting
  label: string
  description: string
  descriptionForModel?: string
}

type ProviderModelConfig = {
  id?: string
  model?: string
  name?: string
  tooltip?: string
}

type ProviderConfigFile = {
  displayName?: string
  baseUrl?: string
  models?: ProviderModelConfig[]
}

let cachedProviderConfigs: ProviderConfigFile[] | undefined

function trimValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function resolveProviderConfigDir(): string {
  const envDir = trimValue(process.env.AETHER_PROVIDER_CONFIG_DIR)
  if (envDir) {
    return envDir
  }

  // When bundled, the bundle lives at src/aether/dist/cli.mjs
  // The provider config JSON files live at src/providers/config/
  // From dist/, we need to go up two levels to src/aether/, then up one more
  // to the repo root, then into src/providers/config
  const bundleDir = path.dirname(fileURLToPath(import.meta.url))
  const repoRoot = path.resolve(bundleDir, '..', '..')
  return path.resolve(repoRoot, 'src', 'providers', 'config')
}

function loadProviderConfigs(): ProviderConfigFile[] {
  if (cachedProviderConfigs) {
    return cachedProviderConfigs
  }

  const configDir = resolveProviderConfigDir()
  const entries = readdirSync(configDir, { withFileTypes: true })
  const loaded: ProviderConfigFile[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }

    const filePath = path.join(configDir, entry.name)
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as ProviderConfigFile
    loaded.push(parsed)
  }

  cachedProviderConfigs = loaded
  return loaded
}

function matchesCurrentProviderConfig(providerBaseUrl?: string): boolean {
  const currentBaseUrl = trimValue(process.env.OPENAI_BASE_URL)
  if (!currentBaseUrl || !providerBaseUrl) {
    return false
  }

  return currentBaseUrl === trimValue(providerBaseUrl)
}

export function getConfiguredProviderModelOptions(): ProviderModelOption[] {
  const provider = getAPIProvider()
  if (provider !== 'openai' && provider !== 'codex') {
    return []
  }

  const options: ProviderModelOption[] = []
  const providerConfigs = loadProviderConfigs()

  for (const config of providerConfigs) {
    if (!matchesCurrentProviderConfig(config.baseUrl)) {
      continue
    }

    for (const model of config.models ?? []) {
      const value = trimValue(model.model) || trimValue(model.id)
      if (!value) {
        continue
      }

      const label = trimValue(model.name) || trimValue(model.tooltip) || value
      const description = trimValue(model.tooltip) || `${config.displayName ?? 'Provider'} model`

      if (!options.some(existing => existing.value === value)) {
        options.push({
          value,
          label,
          description,
        })
      }
    }
  }

  return options
}
