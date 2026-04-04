/*---------------------------------------------------------------------------------------------
 *  CLI API Key Manager
 *  Mirrors extension's ApiKeyManager but uses file-based storage instead of VS Code SecretStorage
 *--------------------------------------------------------------------------------------------*/

import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCliConfigDir } from './cliConfigManager';

const KEYS_DIR_NAME = 'keys';
const KEY_FILE_MODE = 0o600;

function getKeysDir(): string {
  return join(getCliConfigDir(), KEYS_DIR_NAME);
}

function getKeyFilePath(vendor: string): string {
  const safeName = vendor.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(getKeysDir(), `${safeName}.key`);
}

export class CliApiKeyManager {
  private static keysDirInitialized = false;

  private static ensureKeysDir(): void {
    if (this.keysDirInitialized) return;
    const dir = getKeysDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    this.keysDirInitialized = true;
  }

  static hasApiKey(vendor: string): boolean {
    this.ensureKeysDir();
    return existsSync(getKeyFilePath(vendor));
  }

  static getApiKey(vendor: string): string | undefined {
    this.ensureKeysDir();
    const path = getKeyFilePath(vendor);
    if (!existsSync(path)) return undefined;
    try {
      const key = readFileSync(path, 'utf8').trim();
      return key || undefined;
    } catch {
      return undefined;
    }
  }

  static setApiKey(vendor: string, apiKey: string): void {
    this.ensureKeysDir();
    const path = getKeyFilePath(vendor);
    writeFileSync(path, apiKey.trim(), { mode: KEY_FILE_MODE });
    chmodSync(path, KEY_FILE_MODE);
  }

  static deleteApiKey(vendor: string): void {
    this.ensureKeysDir();
    const path = getKeyFilePath(vendor);
    if (existsSync(path)) {
      rmSync(path, { force: true });
    }
  }

  static listStoredVendors(): string[] {
    this.ensureKeysDir();
    const dir = getKeysDir();
    if (!existsSync(dir)) return [];
    try {
      return readdirSync(dir)
        .filter(f => f.endsWith('.key'))
        .map(f => f.replace('.key', ''));
    } catch {
      return [];
    }
  }

  static processCustomHeader(
    customHeader: Record<string, string> | undefined,
    apiKey: string,
  ): Record<string, string> {
    if (!customHeader) return {};
    const processed: Record<string, string> = {};
    for (const [key, value] of Object.entries(customHeader)) {
      processed[key] = value.replace(/\$\{\s*APIKEY\s*\}/gi, apiKey);
    }
    return processed;
  }

  static maskApiKey(apiKey: string): string {
    if (apiKey.length <= 12) return '****';
    return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
  }
}
