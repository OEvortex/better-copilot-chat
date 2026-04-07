/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getProjectHash, sanitizeCwd } from '../utils/paths.js';

export const AETHER_DIR = '.aether';
export const GOOGLE_ACCOUNTS_FILENAME = 'google_accounts.json';
export const OAUTH_FILE = 'oauth_creds.json';
export const SKILL_PROVIDER_CONFIG_DIRS = ['.aether', '.agents'];
const TMP_DIR_NAME = 'tmp';
const BIN_DIR_NAME = 'bin';
const PROJECT_DIR_NAME = 'projects';
const IDE_DIR_NAME = 'ide';
const DEBUG_DIR_NAME = 'debug';
const ARENA_DIR_NAME = 'arena';

export class Storage {
  private readonly targetDir: string;

  /**
   * Custom runtime output base directory set via settings.
   * When null, falls back to getGlobalAetherDir().
   */
  private static runtimeBaseDir: string | null = null;
  private static readonly runtimeBaseDirContext = new AsyncLocalStorage<
    string | null
  >();

  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  private static resolveRuntimeBaseDir(
    dir: string | null | undefined,
    cwd?: string,
  ): string | null {
    if (!dir) {
      return null;
    }

    let resolved = dir;
    if (
      resolved === '~' ||
      resolved.startsWith('~/') ||
      resolved.startsWith('~\\')
    ) {
      const relativeSegments =
        resolved === '~'
          ? []
          : resolved
              .slice(2)
              .split(/[/\\]+/)
              .filter(Boolean);
      resolved = path.join(os.homedir(), ...relativeSegments);
    }
    if (!path.isAbsolute(resolved)) {
      resolved = cwd ? path.resolve(cwd, resolved) : path.resolve(resolved);
    }
    return resolved;
  }

  /**
   * Sets the custom runtime output base directory.
   * Handles tilde (~) expansion and resolves relative paths to absolute.
   * Pass null/undefined/empty string to reset to default (getGlobalAetherDir()).
   * @param dir - The directory path, or null/undefined to reset
   * @param cwd - Base directory for resolving relative paths (defaults to process.cwd()).
   *              Pass the project root so that relative values like ".aether" resolve
   *              per-project, enabling a single global config to work across all projects.
   */
  static setRuntimeBaseDir(dir: string | null | undefined, cwd?: string): void {
    Storage.runtimeBaseDir = Storage.resolveRuntimeBaseDir(dir, cwd);
  }

  /**
   * Runs function execution in an async context with a specific runtime output dir.
   * This is used to isolate runtime output paths between concurrent sessions.
   */
  static runWithRuntimeBaseDir<T>(
    dir: string | null | undefined,
    cwd: string | undefined,
    fn: () => T,
  ): T {
    const resolved = Storage.resolveRuntimeBaseDir(dir, cwd);
    return Storage.runtimeBaseDirContext.run(resolved, fn);
  }

  /**
   * Returns the base directory for all runtime output (temp files, debug logs,
   * session data, todos, insights, etc.).
   *
   * Priority: AETHER_RUNTIME_DIR env var > setRuntimeBaseDir() value > getGlobalAetherDir()
   * @returns Absolute path to the runtime output base directory
   */
  static getRuntimeBaseDir(): string {
    const envDir = process.env['AETHER_RUNTIME_DIR'];
    if (envDir) {
      return (
        Storage.resolveRuntimeBaseDir(envDir) ?? Storage.getGlobalAetherDir()
      );
    }

    const contextualDir = Storage.runtimeBaseDirContext.getStore();
    if (contextualDir !== undefined) {
      return contextualDir ?? Storage.getGlobalAetherDir();
    }
    if (Storage.runtimeBaseDir) {
      return Storage.runtimeBaseDir;
    }
    return Storage.getGlobalAetherDir();
  }

  static getGlobalAetherDir(): string {
    const homeDir = os.homedir();
    if (!homeDir) {
      return path.join(os.tmpdir(), '.aether');
    }
    return path.join(homeDir, AETHER_DIR);
  }

  static getMcpOAuthTokensPath(): string {
    return path.join(Storage.getGlobalAetherDir(), 'mcp-oauth-tokens.json');
  }

  static getGlobalSettingsPath(): string {
    return path.join(Storage.getGlobalAetherDir(), 'settings.json');
  }

  static getInstallationIdPath(): string {
    return path.join(Storage.getGlobalAetherDir(), 'installation_id');
  }

  static getGoogleAccountsPath(): string {
    return path.join(Storage.getGlobalAetherDir(), GOOGLE_ACCOUNTS_FILENAME);
  }

  static getUserCommandsDir(): string {
    return path.join(Storage.getGlobalAetherDir(), 'commands');
  }

  static getGlobalMemoryFilePath(): string {
    return path.join(Storage.getGlobalAetherDir(), 'memory.md');
  }

  static getGlobalTempDir(): string {
    return path.join(Storage.getRuntimeBaseDir(), TMP_DIR_NAME);
  }

  static getGlobalDebugDir(): string {
    return path.join(Storage.getRuntimeBaseDir(), DEBUG_DIR_NAME);
  }

  static getDebugLogPath(sessionId: string): string {
    return path.join(Storage.getGlobalDebugDir(), `${sessionId}.txt`);
  }

  static getGlobalIdeDir(): string {
    return path.join(Storage.getRuntimeBaseDir(), IDE_DIR_NAME);
  }

  static getGlobalBinDir(): string {
    return path.join(Storage.getGlobalAetherDir(), BIN_DIR_NAME);
  }

  static getGlobalArenaDir(): string {
    return path.join(Storage.getGlobalAetherDir(), ARENA_DIR_NAME);
  }

  getAetherDir(): string {
    return path.join(this.targetDir, AETHER_DIR);
  }

  getProjectDir(): string {
    const projectId = sanitizeCwd(this.getProjectRoot());
    const projectsDir = path.join(
      Storage.getRuntimeBaseDir(),
      PROJECT_DIR_NAME,
    );
    return path.join(projectsDir, projectId);
  }

  getProjectTempDir(): string {
    const hash = getProjectHash(this.getProjectRoot());
    const tempDir = Storage.getGlobalTempDir();
    const targetDir = path.join(tempDir, hash);
    return targetDir;
  }

  ensureProjectTempDirExists(): void {
    fs.mkdirSync(this.getProjectTempDir(), { recursive: true });
  }

  static getOAuthCredsPath(): string {
    return path.join(Storage.getGlobalAetherDir(), OAUTH_FILE);
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  getHistoryDir(): string {
    const hash = getProjectHash(this.getProjectRoot());
    const historyDir = path.join(Storage.getRuntimeBaseDir(), 'history');
    const targetDir = path.join(historyDir, hash);
    return targetDir;
  }

  getWorkspaceSettingsPath(): string {
    return path.join(this.getAetherDir(), 'settings.json');
  }

  getProjectCommandsDir(): string {
    return path.join(this.getAetherDir(), 'commands');
  }

  getProjectTempCheckpointsDir(): string {
    return path.join(this.getProjectTempDir(), 'checkpoints');
  }

  getExtensionsDir(): string {
    return path.join(this.getAetherDir(), 'extensions');
  }

  getExtensionsConfigPath(): string {
    return path.join(this.getExtensionsDir(), 'aether-extension.json');
  }

  getUserSkillsDirs(): string[] {
    const homeDir = os.homedir() || os.tmpdir();
    return SKILL_PROVIDER_CONFIG_DIRS.map((dir) =>
      path.join(homeDir, dir, 'skills'),
    );
  }

  /**
   * Returns the user-level extensions directory (~/.aether/extensions/).
   * Extensions installed at user scope are stored here, as opposed to
   * project-level extensions which live in <project>/.aether/extensions/.
   */
  static getUserExtensionsDir(): string {
    return path.join(Storage.getGlobalAetherDir(), 'extensions');
  }

  getHistoryFilePath(): string {
    return path.join(this.getProjectTempDir(), 'shell_history');
  }
}
