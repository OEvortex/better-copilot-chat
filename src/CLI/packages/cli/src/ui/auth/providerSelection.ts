/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  type ProviderModelConfig,
  type ModelProvidersConfig,
} from '@aether/aether-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  KnownProviders,
  type KnownProviderConfig,
} from '../../../../../../utils/knownProvidersData.js';

export interface StoredProviderConfig extends KnownProviderConfig {
  apiKey?: string;
}

type ProviderCatalogModel = {
  id: string;
  name?: string;
  tooltip?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  customHeader?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  sdkMode?: 'openai' | 'anthropic' | 'oai-response';
};

type ProviderCatalog = {
  models?: ProviderCatalogModel[];
};

const providerCatalogCache = new Map<string, ProviderCatalog | undefined>();

function findProviderCatalogPath(providerId: string): string | undefined {
  let currentDir = process.cwd();

  for (let i = 0; i < 10; i++) {
    const candidate = path.join(
      currentDir,
      'src',
      'providers',
      'config',
      `${providerId}.json`,
    );
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return undefined;
}

function loadProviderCatalog(providerId: string): ProviderCatalog | undefined {
  if (providerCatalogCache.has(providerId)) {
    return providerCatalogCache.get(providerId);
  }

  const catalogPath = findProviderCatalogPath(providerId);
  if (!catalogPath) {
    providerCatalogCache.set(providerId, undefined);
    return undefined;
  }

  try {
    const content = fs.readFileSync(catalogPath, 'utf-8');
    const parsed = JSON.parse(content) as ProviderCatalog;
    providerCatalogCache.set(providerId, parsed);
    return parsed;
  } catch {
    providerCatalogCache.set(providerId, undefined);
    return undefined;
  }
}

export type ProviderStorageSettings = {
  merged: {
    providers?: Record<string, StoredProviderConfig> | undefined;
  };
};

function getProviderConfig(
  providerId: string,
  provider?: StoredProviderConfig,
): KnownProviderConfig | StoredProviderConfig | undefined {
  return provider ?? KnownProviders[providerId];
}

export function getProviderAuthType(
  providerId: string,
  provider?: StoredProviderConfig,
): AuthType {
  const providerConfig = getProviderConfig(providerId, provider);
  if (providerConfig?.sdkMode === 'anthropic') {
    return AuthType.USE_ANTHROPIC;
  }
  if (providerConfig?.sdkMode === 'oai-response') {
    return AuthType.USE_OPENAI;
  }
  return AuthType.USE_OPENAI;
}

export function getProviderBaseUrl(
  providerId: string,
  provider?: StoredProviderConfig,
): string | undefined {
  const providerConfig = getProviderConfig(providerId, provider);
  return (
    providerConfig?.baseUrl ||
    providerConfig?.openai?.baseUrl ||
    providerConfig?.anthropic?.baseUrl ||
    providerConfig?.responses?.baseUrl
  );
}

function getProviderCustomHeader(
  providerId: string,
  provider?: StoredProviderConfig,
): Record<string, string> | undefined {
  const providerConfig = getProviderConfig(providerId, provider);
  return (
    providerConfig?.customHeader ||
    providerConfig?.openai?.customHeader ||
    providerConfig?.anthropic?.customHeader ||
    providerConfig?.responses?.customHeader
  );
}

function getProviderExtraBody(
  providerId: string,
  provider?: StoredProviderConfig,
): Record<string, unknown> | undefined {
  const providerConfig = getProviderConfig(providerId, provider);
  return (
    providerConfig?.extraBody ||
    providerConfig?.openai?.extraBody ||
    providerConfig?.anthropic?.extraBody ||
    providerConfig?.responses?.extraBody
  );
}

function mapStaticModels(
  providerId: string,
  provider?: StoredProviderConfig,
): ProviderModelConfig[] {
  const providerConfig = getProviderConfig(providerId, provider);
  const staticModels =
    loadProviderCatalog(providerId)?.models ?? providerConfig?.models ?? [];

  if (providerConfig?.fetchModels !== false || staticModels.length === 0) {
    return [];
  }

  const baseUrl = getProviderBaseUrl(providerId, provider);
  const customHeader = getProviderCustomHeader(providerId, provider);
  const extraBody = getProviderExtraBody(providerId, provider);

  // Use provider config from settings for apiKey if available
  const providerApiKey = provider?.apiKey;

  return staticModels.map((model) => ({
    id: model.id,
    name: model.name || model.id,
    description: model.tooltip,
    provider: providerId,
    model: model.model || model.id,
    sdkMode: model.sdkMode || providerConfig?.sdkMode,
    baseUrl: model.baseUrl || baseUrl,
    apiKey: model.apiKey || providerApiKey,
    customHeader: model.customHeader || customHeader,
    extraBody: model.extraBody || extraBody,
    fetchModels: false,
  }));
}

function buildDiscoveryTemplate(
  providerId: string,
  provider?: StoredProviderConfig,
): ProviderModelConfig | undefined {
  const providerConfig = getProviderConfig(providerId, provider);
  if (!providerConfig) {
    return undefined;
  }

  const baseUrl = getProviderBaseUrl(providerId, provider);
  if (!baseUrl && !providerConfig.fetchModels) {
    return undefined;
  }

  return {
    id: providerId,
    name: providerConfig.displayName,
    description: providerConfig.description,
    provider: providerId,
    sdkMode: providerConfig.sdkMode,
    baseUrl,
    apiKey: provider?.apiKey,
    customHeader: getProviderCustomHeader(providerId, provider),
    extraBody: getProviderExtraBody(providerId, provider),
    fetchModels: providerConfig.fetchModels,
    modelsEndpoint: providerConfig.modelsEndpoint,
    modelParser: providerConfig.modelParser,
  };
}

export function buildStoredProviderConfig(
  providerId: string,
  apiKey?: string,
  baseUrl?: string,
): StoredProviderConfig | undefined {
  const provider = KnownProviders[providerId];
  if (!provider) {
    return undefined;
  }

  return {
    ...provider,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    apiKey: apiKey ?? '',
  };
}

export function getStoredProviderApiKey(
  providerId: string,
  settings: ProviderStorageSettings,
): string | undefined {
  const storedProvider = settings.merged.providers?.[providerId];
  const apiKey = storedProvider?.apiKey?.trim();
  return apiKey ? apiKey : undefined;
}

export function shouldPromptForProviderApiKey(
  providerId: string,
  settings: ProviderStorageSettings,
): boolean {
  const provider = KnownProviders[providerId];
  if (!provider || provider.supportsApiKey === false) {
    return false;
  }

  return getStoredProviderApiKey(providerId, settings) === undefined;
}

export function buildProviderModelProvidersConfig(
  providerId: string,
  provider?: StoredProviderConfig,
): ModelProvidersConfig | undefined {
  const authType = getProviderAuthType(providerId, provider);
  const staticModels = mapStaticModels(providerId, provider);
  const providerTemplate = buildDiscoveryTemplate(providerId, provider);
  const models =
    staticModels.length > 0
      ? staticModels
      : providerTemplate
        ? [providerTemplate]
        : [];

  if (models.length === 0) {
    return undefined;
  }

  return {
    [authType]: models,
  };
}

export function buildModelProvidersConfigFromProviderRegistry(
  providerRegistry?: Record<string, StoredProviderConfig | undefined>,
): ModelProvidersConfig | undefined {
  const merged: ModelProvidersConfig = {};

  for (const [providerId, provider] of Object.entries(providerRegistry ?? {})) {
    const providerModels = buildProviderModelProvidersConfig(providerId, provider);
    if (!providerModels) {
      continue;
    }

    for (const [authType, models] of Object.entries(providerModels)) {
      merged[authType] = [...(merged[authType] ?? []), ...models];
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

