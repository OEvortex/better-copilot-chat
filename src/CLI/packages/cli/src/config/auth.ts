/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  type Config,
  type ProviderModelConfig,
} from '@aether/aether-core';
import { loadEnvironment, loadSettings, type Settings } from './settings.js';
import { t } from '../i18n/index.js';
import {
  buildModelProvidersConfigFromProviderRegistry,
} from '../ui/auth/providerSelection.js';

/**
 * Default environment variable names for each auth type
 */
const DEFAULT_ENV_KEYS: Record<string, string> = {
  [AuthType.USE_OPENAI]: 'OPENAI_API_KEY',
  [AuthType.USE_ANTHROPIC]: 'ANTHROPIC_API_KEY',
  [AuthType.USE_GEMINI]: 'GEMINI_API_KEY',
  [AuthType.USE_VERTEX_AI]: 'GOOGLE_API_KEY',
};

/**
 * Find model configuration from providers by authType and modelId
 */
function findModelConfig(
  providers: Record<string, unknown> | undefined,
  authType: string,
  modelId: string | undefined,
): ProviderModelConfig | undefined {
  if (!providers || !modelId) {
    return undefined;
  }

  // Convert providers to ModelProvidersConfig format
  const modelProvidersConfig = buildModelProvidersConfigFromProviderRegistry(
    providers as any,
  );

  if (!modelProvidersConfig) {
    return undefined;
  }

  const models = modelProvidersConfig[authType];
  if (!Array.isArray(models)) {
    return undefined;
  }

  return models.find((m) => m.id === modelId);
}

/**
 * Check if API key is available for the given auth type and model configuration.
 * Prioritizes custom envKey from providers over default environment variables.
 */
function hasApiKeyForAuth(
  authType: string,
  settings: Settings,
  config?: Config,
): {
  hasKey: boolean;
  checkedEnvKey: string | undefined;
  isExplicitEnvKey: boolean;
} {
  const providers = settings.providers as Record<string, unknown> | undefined;

  // Use config.getModelsConfig().getModel() if available for accurate model ID resolution
  // that accounts for CLI args, env vars, and settings. Fall back to settings.model.name.
  const modelId = config?.getModelsConfig().getModel() ?? settings.model?.name;

  // Try to find model-specific envKey from providers
  const modelConfig = findModelConfig(providers, authType, modelId);
  if (modelConfig?.envKey) {
    // Explicit envKey configured - only check this env var, no apiKey fallback
    const hasKey = !!process.env[modelConfig.envKey];
    return {
      hasKey,
      checkedEnvKey: modelConfig.envKey,
      isExplicitEnvKey: true,
    };
  }

  // Using default environment variable - apiKey fallback is allowed
  const defaultEnvKey = DEFAULT_ENV_KEYS[authType];
  if (defaultEnvKey) {
    const hasKey = !!process.env[defaultEnvKey];
    if (hasKey) {
      return { hasKey, checkedEnvKey: defaultEnvKey, isExplicitEnvKey: false };
    }
  }

  // Also check settings.security.auth.apiKey as fallback (only for default env key)
  if (settings.security?.auth?.apiKey) {
    return {
      hasKey: true,
      checkedEnvKey: defaultEnvKey || undefined,
      isExplicitEnvKey: false,
    };
  }

  return {
    hasKey: false,
    checkedEnvKey: defaultEnvKey,
    isExplicitEnvKey: false,
  };
}

/**
 * Generate API key error message based on auth check result.
 * Returns null if API key is present, otherwise returns the appropriate error message.
 */
function getApiKeyError(
  authMethod: string,
  settings: Settings,
  config?: Config,
): string | null {
  const { hasKey, checkedEnvKey, isExplicitEnvKey } = hasApiKeyForAuth(
    authMethod,
    settings,
    config,
  );
  if (hasKey) {
    return null;
  }

  const envKeyHint = checkedEnvKey || DEFAULT_ENV_KEYS[authMethod];
  if (isExplicitEnvKey) {
    return t(
      '{{envKeyHint}} environment variable not found. Please set it in your .env file or environment variables.',
      { envKeyHint },
    );
  }
  return t(
    '{{envKeyHint}} environment variable not found (or set settings.security.auth.apiKey). Please set it in your .env file or environment variables.',
    { envKeyHint },
  );
}

/**
 * Validate that the required credentials and configuration exist for the given auth method.
 */
export function validateAuthMethod(
  authMethod: string,
  config?: Config,
): string | null {
  const settings = loadSettings();
  loadEnvironment(settings.merged);

  if (authMethod === AuthType.USE_OPENAI) {
    const { hasKey, checkedEnvKey, isExplicitEnvKey } = hasApiKeyForAuth(
      authMethod,
      settings.merged,
      config,
    );
    if (!hasKey) {
      const envKeyHint = checkedEnvKey
        ? `'${checkedEnvKey}'`
        : "'OPENAI_API_KEY'";
      if (isExplicitEnvKey) {
        // Explicit envKey configured - only suggest setting the env var
        return t(
          'Missing API key for OpenAI-compatible auth. Set the {{envKeyHint}} environment variable.',
          { envKeyHint },
        );
      }
      // Default env key - can use either apiKey or env var
      return t(
        'Missing API key for OpenAI-compatible auth. Set settings.security.auth.apiKey, or set the {{envKeyHint}} environment variable.',
        { envKeyHint },
      );
    }
    return null;
  }

  if (authMethod === AuthType.AETHER_OAUTH) {
    // Aether OAuth doesn't require any environment variables for basic setup
    // The OAuth flow will handle authentication
    return null;
  }

  if (authMethod === AuthType.USE_ANTHROPIC) {
    const apiKeyError = getApiKeyError(authMethod, settings.merged, config);
    if (apiKeyError) {
      return apiKeyError;
    }

    // Check baseUrl - can come from providers or environment
    const providers = settings.merged.providers as Record<string, unknown> | undefined;
    // Use config.getModelsConfig().getModel() if available for accurate model ID
    const modelId =
      config?.getModelsConfig().getModel() ?? settings.merged.model?.name;
    const modelConfig = findModelConfig(providers, authMethod, modelId);

    if (modelConfig && !modelConfig.baseUrl) {
      return t(
        'Anthropic provider missing required baseUrl in providers[].baseUrl.',
      );
    }
    if (!modelConfig && !process.env['ANTHROPIC_BASE_URL']) {
      return t('ANTHROPIC_BASE_URL environment variable not found.');
    }

    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    const apiKeyError = getApiKeyError(authMethod, settings.merged, config);
    if (apiKeyError) {
      return apiKeyError;
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const apiKeyError = getApiKeyError(authMethod, settings.merged, config);
    if (apiKeyError) {
      return apiKeyError;
    }

    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
    return null;
  }

  return t('Invalid auth method selected.');
}
