/*---------------------------------------------------------------------------------------------
 *  CLI Config Manager
 *  Mirrors extension's ConfigManager but uses file-based JSON config
 *  Config directory: ~/.chp-cli/config.json (mirrors ~/.claude/ from extension)
 *--------------------------------------------------------------------------------------------*/

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CLI_DIR_NAME = '.chp-cli';
const CONFIG_FILE_NAME = 'config.json';
const DEFAULT_CONFIG: ChpCliConfig = {
  provider: '',
  model: '',
  temperature: 0.1,
  topP: 1.0,
  maxTokens: 256000,
  hideThinkingInUI: false,
  zhipu: { endpoint: 'open.bigmodel.cn', plan: 'coding', thinking: 'auto', clearThinking: true },
  minimax: { endpoint: 'minimaxi.com' },
  moonshot: { plan: 'normal' },
  providerOverrides: {},
};

export interface ZhipuCliConfig {
  endpoint: 'open.bigmodel.cn' | 'api.z.ai';
  plan: 'coding' | 'normal';
  thinking: 'enabled' | 'disabled' | 'auto';
  clearThinking: boolean;
}

export interface MiniMaxCliConfig {
  endpoint: 'minimaxi.com' | 'minimax.io';
}

export interface MoonshotCliConfig {
  plan: 'coding' | 'normal';
}

export interface ChpCliConfig {
  /** Selected provider ID (e.g., "llmgateway", "deepseek", "ollama") */
  provider: string;
  /** Selected model ID (provider-specific, e.g., "free" for llmgateway) */
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  hideThinkingInUI: boolean;
  zhipu: ZhipuCliConfig;
  minimax: MiniMaxCliConfig;
  moonshot: MoonshotCliConfig;
  /** Provider-level overrides matching extension's UserConfigOverrides */
  providerOverrides: Record<string, { sdkMode?: string; baseUrl?: string; customHeader?: Record<string, string> }>;
}

let cachedConfig: ChpCliConfig | null = null;

function getCliDir(): string {
  return join(homedir(), CLI_DIR_NAME);
}

function getConfigFilePath(): string {
  return join(getCliDir(), CONFIG_FILE_NAME);
}

function ensureConfigDir(): void {
  const dir = getCliDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Get the CLI config directory path (used by apiKeyManager and others)
 */
export function getCliConfigDir(): string {
  return getCliDir();
}

function loadConfig(): ChpCliConfig {
  if (cachedConfig) return cachedConfig;

  const path = getConfigFilePath();
  if (!existsSync(path)) {
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }

  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ChpCliConfig>;
    cachedConfig = { ...DEFAULT_CONFIG, ...parsed };
    return cachedConfig;
  } catch {
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

export function getConfig(): ChpCliConfig {
  return loadConfig();
}

export function saveConfig(updater: (current: ChpCliConfig) => ChpCliConfig): void {
  ensureConfigDir();
  const current = loadConfig();
  const next = updater(current);
  cachedConfig = next;
  writeFileSync(getConfigFilePath(), JSON.stringify(next, null, 2), { mode: 0o600 });
}

export function getProvider(): string {
  return loadConfig().provider;
}

export function setProvider(providerId: string): void {
  saveConfig(c => ({ ...c, provider: providerId }));
}

export function getModel(): string {
  return loadConfig().model;
}

export function setModel(modelId: string): void {
  saveConfig(c => ({ ...c, model: modelId }));
}

export function getTemperature(): number {
  return loadConfig().temperature;
}

export function getMaxTokens(): number {
  return loadConfig().maxTokens;
}

export function getHideThinkingInUI(): boolean {
  return loadConfig().hideThinkingInUI;
}

export function getProviderOverride(providerId: string) {
  return loadConfig().providerOverrides[providerId];
}
