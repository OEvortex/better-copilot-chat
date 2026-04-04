/*---------------------------------------------------------------------------------------------
 *  CLI Provider Client
 *  Replaces the env-var-based provider routing in utils/model/providers.ts
 *  Uses the extension's provider registry (cliKnownProviders.ts) for all provider metadata
 *--------------------------------------------------------------------------------------------*/

import { CliKnownProviders, getProviderBaseUrl, getProviderSdkMode } from './cliKnownProviders';
import { CliApiKeyManager } from '../config/cliApiKeyManager';
import type { ChpCliConfig } from '../config/cliConfigManager';
import { getConfig, getModel, getProvider, getProviderOverride, getTemperature, getMaxTokens, getHideThinkingInUI } from '../config/cliConfigManager';

export type ProviderTransport = 'chat_completions' | 'anthropic_messages' | 'codex_responses';

export interface ResolvedProviderRequest {
  transport: ProviderTransport;
  providerId: string;
  modelId: string;
  requestedModel: string;
  baseUrl: string;
  apiKey: string | undefined;
  sdkMode: 'anthropic' | 'openai' | 'oai-response';
  customHeaders: Record<string, string>;
  extraBody: Record<string, unknown>;
  maxTokens: number;
  temperature: number;
}

/**
 * Resolve the active provider and model from CLI config.
 * Falls back to env vars for compatibility with existing launch scripts.
 */
export function resolveProviderRequest(options?: {
  providerId?: string;
  modelId?: string;
}): ResolvedProviderRequest {
  const config = getConfig();
  const providerId = options?.providerId || config.provider || process.env.CHP_PROVIDER || 'openai';
  const modelId = options?.modelId || config.model || process.env.CHP_MODEL || '';

  const knownConfig = CliKnownProviders[providerId];
  if (!knownConfig) {
    throw new Error(`Unknown provider: "${providerId}". Run with --provider to select one.`);
  }

  // Determine SDK mode
  const override = getProviderOverride(providerId);
  const sdkMode = override?.sdkMode as 'anthropic' | 'openai' | 'oai-response' | undefined
    || getProviderSdkMode(providerId);

  // Get base URL: provider-level override > known config > env var
  let baseUrl = override?.baseUrl
    || getProviderBaseUrl(providerId, sdkMode)
    || process.env.OPENAI_BASE_URL
    || '';

  if (!baseUrl) {
    throw new Error(`No base URL configured for provider "${providerId}". Set it via config or env var OPENAI_BASE_URL.`);
  }

  // Get API key from CLI key manager (mirrors extension's ApiKeyManager)
  const apiKey = CliApiKeyManager.getApiKey(providerId)
    || process.env.OPENAI_API_KEY
    || knownConfig.defaultApiKey;

  // Merge provider-level custom headers
  const customHeaders: Record<string, string> = {
    ...(knownConfig.customHeader || {}),
    ...(override?.customHeader || {}),
  };

  // Determine transport type
  const transport: ProviderTransport = sdkMode === 'anthropic' ? 'anthropic_messages' : 'chat_completions';

  return {
    transport,
    providerId,
    modelId,
    requestedModel: modelId,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    sdkMode,
    customHeaders,
    extraBody: {},
    maxTokens: getMaxTokens(),
    temperature: getTemperature(),
  };
}

/**
 * Get all available providers as a list of { id, displayName, description, needsApiKey }
 */
export function listAvailableProviders(): Array<{
  id: string;
  displayName: string;
  description?: string;
  needsApiKey: boolean;
  hasKey: boolean;
}> {
  return Object.entries(CliKnownProviders).map(([id, config]) => ({
    id,
    displayName: config.displayName,
    description: config.description,
    needsApiKey: config.supportsApiKey !== false,
    hasKey: CliApiKeyManager.hasApiKey(id),
  }));
}

/**
 * Check if the current provider is configured and ready to use.
 */
export function isProviderReady(): boolean {
  const providerId = getProvider();
  if (!providerId) return false;

  const config = CliKnownProviders[providerId];
  if (!config) return false;

  if (config.supportsApiKey === false) return true;
  if (config.defaultApiKey) return true;
  if (CliApiKeyManager.hasApiKey(providerId)) return true;

  const baseUrl = getProviderBaseUrl(providerId);
  if (!baseUrl && !process.env.OPENAI_BASE_URL) return false;

  return true;
}

/**
 * Get provider info for display/status
 */
export function getCurrentProviderInfo(): { id: string; displayName: string; model: string; hasKey: boolean; baseUrl: string } {
  const providerId = getProvider();
  const modelId = getModel();
  const config = CliKnownProviders[providerId];

  return {
    id: providerId,
    displayName: config?.displayName || providerId,
    model: modelId,
    hasKey: CliApiKeyManager.hasApiKey(providerId) || !!config?.defaultApiKey,
    baseUrl: getProviderBaseUrl(providerId) || '',
  };
}
