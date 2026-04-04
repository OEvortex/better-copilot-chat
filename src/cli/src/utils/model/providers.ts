import { CliKnownProviders, getProviderBaseUrl, getProviderSdkMode } from '../../providers/cliKnownProviders.js'
import { CliApiKeyManager } from '../../config/cliApiKeyManager.js'
import { getProvider, getModel, getConfig } from '../../config/cliConfigManager.js'
import { isEnvTruthy } from '../envUtils.js'

/**
 * Provider identifier used by the CLI.
 * When a provider from Extension registry is selected, this is 'openai' (uses OpenAI shim).
 * When first-party Anthropic is selected, this is 'firstParty'.
 * For backward compat, env-var overrides still work.
 */
export type APIProvider =
  | 'firstParty'
  | 'openai'
  | 'codex'

/**
 * Determine which API provider to use.
 * Priority: env var overrides > CLI config > Extension registry default
 */
export function getAPIProvider(): APIProvider {
  // Env var overrides (backward compat with existing launch scripts)
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
    || isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
    || isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)) {
    // These providers route through Anthropic SDK specialized clients
    return 'firstParty'
  }

  // If CLI provider is set via config, resolve through the Extension registry
  const configProviderId = getProvider()
  if (configProviderId) {
    const knownConfig = CliKnownProviders[configProviderId]
    if (knownConfig) {
      const sdkMode = getProviderSdkMode(configProviderId)
      if (sdkMode === 'anthropic') {
        return 'firstParty'
      }
      return 'openai'
    }
  }

  // Fall back to env var detection (legacy / profile-based launch)
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_GEMINI)
    || isEnvTruthy(process.env.CLAUDE_CODE_USE_GITHUB)
    || isEnvTruthy(process.env.CLAUDE_CODE_USE_OPENAI)) {
    return isCodexModel() ? 'codex' : 'openai'
  }

  // Default: first-party Anthropic
  return 'firstParty'
}

export function usesAnthropicAccountFlow(): boolean {
  return getAPIProvider() === 'firstParty'
}

function isCodexModel(): boolean {
  const model = (process.env.OPENAI_MODEL || '').toLowerCase()
  return (
    model === 'codexplan' ||
    model === 'codexspark' ||
    model === 'gpt-5.4' ||
    model === 'gpt-5.3-codex' ||
    model === 'gpt-5.3-codex-spark' ||
    model === 'gpt-5.2-codex' ||
    model === 'gpt-5.1-codex-max' ||
    model === 'gpt-5.1-codex-mini'
  )
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Extension registry integration helpers
// ---------------------------------------------------------------------------

/**
 * Get the resolved provider ID from Extension registry.
 * Returns empty string if no provider is configured.
 */
export function getExtensionProviderId(): string {
  return getProvider()
}

/**
 * Get the resolved base URL for the active provider.
 * Uses Extension registry metadata > env var fallback.
 */
export function getExtensionProviderBaseUrl(): string | undefined {
  const providerId = getProvider()
  if (!providerId) return undefined

  const knownConfig = CliKnownProviders[providerId]
  if (!knownConfig) return undefined

  return getProviderBaseUrl(providerId) || process.env.OPENAI_BASE_URL
}

/**
 * Get the API key for the active provider.
 * Uses CLI key manager (mirrors extension's ApiKeyManager) > env var.
 */
export function getExtensionProviderApiKey(): string | undefined {
  const providerId = getProvider()
  if (!providerId) return undefined

  return CliApiKeyManager.getApiKey(providerId)
    || CliKnownProviders[providerId]?.defaultApiKey
    || process.env.OPENAI_API_KEY
}

/**
 * Get the SDK mode for the active provider.
 */
export function getExtensionProviderSdkMode(): 'anthropic' | 'openai' | 'oai-response' {
  const providerId = getProvider()
  if (!providerId) return 'openai'
  return getProviderSdkMode(providerId)
}

/**
 * Check if a provider from Extension registry is currently active.
 */
export function isUsingExtensionProvider(): boolean {
  const providerId = getProvider()
  return !!providerId && !!CliKnownProviders[providerId]
}
