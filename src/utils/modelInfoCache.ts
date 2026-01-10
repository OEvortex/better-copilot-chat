/*---------------------------------------------------------------------------------------------
 *  Model Information Cache Manager
 *  Provides persistent caching for model information to speed up model selector display during extension activation.
 *  Reference: Microsoft vscode-copilot-chat LanguageModelAccessPromptBaseCountCache
 *--------------------------------------------------------------------------------------------*/

import crypto from "node:crypto";
import type { LanguageModelChatInformation } from "vscode";
import * as vscode from "vscode";
import { configProviders } from "../providers/config";
import { Logger } from "./logger";

/**
 * Saved model selection information
 */
interface SavedModelSelection {
	/** Provider identifier */
	providerKey: string;
	/** Model ID */
	modelId: string;
	/** Save timestamp */
	timestamp: number;
}

/**
 * Cached model information structure
 */
interface CachedModelInfo {
	/** Model information list */
	models: LanguageModelChatInformation[];
	/** Extension version when cached (used for version mismatch invalidation) */
	extensionVersion: string;
	/** Cache creation timestamp */
	timestamp: number;
	/** API key hash (used for key change detection) */
	apiKeyHash: string;
}

/**
 * Model Information Cache Manager
 *
 * Uses VS Code globalState for persistent caching, supporting:
 * - Persistence across activation sessions
 * - Automatic version mismatch invalidation
 * - API key change detection
 * - 24-hour expiration
 * - Global model selection persistence (saves user's last selected model across all providers)
 */
export class ModelInfoCache {
	private readonly context: vscode.ExtensionContext;
	private readonly cacheVersion = "1";
	private readonly cacheExpiryMs = 24 * 60 * 60 * 1000; // 24 hours
	private static readonly SELECTED_MODEL_KEY = "chp_selected_model"; // Global model selection storage key

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	/**
	 * Get cached model information
	 *
	 * Quickly checks if cache is valid. Checks:
	 * - Cache existence
	 * - Extension version match
	 * - API key hash match
	 * - Cache not expired
	 *
	 * @param providerKey Provider identifier (e.g., 'zhipu', 'kimi')
	 * @param apiKeyHash API key hash
	 * @returns Valid model information list, or null (if cache is invalid or non-existent)
	 */
	async getCachedModels(
		providerKey: string,
		apiKeyHash: string,
	): Promise<LanguageModelChatInformation[] | null> {
		try {
			// Always return null in development mode to force model list refresh
			const isDevelopment =
				this.context.extensionMode === vscode.ExtensionMode.Development;
			if (isDevelopment) {
				Logger.trace(
					`[ModelInfoCache] ${providerKey}: Skipping cache in development mode`,
				);
				return null;
			}

			const cacheKey = this.getCacheKey(providerKey);
			const cached = this.context.globalState.get<CachedModelInfo>(cacheKey);

			if (!cached) {
				Logger.trace(`[ModelInfoCache] ${providerKey}: No cache`);
				return null;
			}

			// Check 1: Version match
			const currentVersion =
				vscode.extensions.getExtension("vicanent.copilot-helper-pro")
					?.packageJSON.version || "";
			if (cached.extensionVersion !== currentVersion) {
				Logger.trace(
					`[ModelInfoCache] ${providerKey}: Version mismatch ` +
						`(cached: ${cached.extensionVersion}, current: ${currentVersion})`,
				);
				return null;
			}

			// Check 2: API key match
			if (cached.apiKeyHash !== apiKeyHash) {
				Logger.trace(`[ModelInfoCache] ${providerKey}: API key changed`);
				return null;
			}

			// Check 3: Not expired
			const now = Date.now();
			const ageMs = now - cached.timestamp;
			if (ageMs > this.cacheExpiryMs) {
				const ageHours = (ageMs / (60 * 60 * 1000)).toFixed(1);
				Logger.trace(
					`[ModelInfoCache] ${providerKey}: Cache expired ` +
						`(${ageHours} hours ago)`,
				);
				return null;
			}

			Logger.trace(
				`[ModelInfoCache] ${providerKey}: Cache hit ` +
					`(${cached.models.length} models, age ${(ageMs / 1000).toFixed(1)}s)`,
			);
			return cached.models;
		} catch (err) {
			// Cache read error should not affect extension operation
			Logger.warn(
				`[ModelInfoCache] Failed to read ${providerKey} cache:`,
				err instanceof Error ? err.message : String(err),
			);
			return null;
		}
	}

	/**
	 * Cache model information
	 *
	 * Asynchronously stores model information in globalState. This operation should not block.
	 *
	 * @param providerKey Provider identifier
	 * @param models Model information list to cache
	 * @param apiKeyHash API key hash
	 */
	async cacheModels(
		providerKey: string,
		models: LanguageModelChatInformation[],
		apiKeyHash: string,
	): Promise<void> {
		try {
			const currentVersion =
				vscode.extensions.getExtension("vicanent.copilot-helper-pro")
					?.packageJSON.version || "";

			const cacheData: CachedModelInfo = {
				models,
				extensionVersion: currentVersion,
				timestamp: Date.now(),
				apiKeyHash,
			};

			const cacheKey = this.getCacheKey(providerKey);
			await this.context.globalState.update(cacheKey, cacheData);
		} catch (err) {
			// Cache failure should not block extension
			Logger.warn(
				`[ModelInfoCache] Failed to cache ${providerKey}:`,
				err instanceof Error ? err.message : String(err),
			);
		}
	}

	/**
	 * Invalidate cache for a specific provider
	 *
	 * Called when:
	 * - API key changes (ApiKeyManager.setApiKey)
	 * - Provider configuration changes (onDidChangeConfiguration)
	 * - User manually clears cache
	 *
	 * @param providerKey Provider identifier
	 */
	async invalidateCache(providerKey: string): Promise<void> {
		try {
			const cacheKey = this.getCacheKey(providerKey);
			await this.context.globalState.update(cacheKey, undefined);
			Logger.trace(`[ModelInfoCache] ${providerKey}: Cache cleared`);
		} catch (err) {
			Logger.warn(
				`[ModelInfoCache] Failed to clear ${providerKey} cache:`,
				err instanceof Error ? err.message : String(err),
			);
		}
	}

	/**
	 * Clear all caches
	 *
	 * Called during extension uninstall or user request
	 */
	async clearAll(): Promise<void> {
		// Dynamically get all provider keys from config, add 'compatible' at the end
		const allProviderKeys = [...Object.keys(configProviders), "compatible"];

		let clearedCount = 0;
		for (const key of allProviderKeys) {
			try {
				await this.invalidateCache(key);
				clearedCount++;
			} catch (err) {
				// Continue clearing other caches, do not interrupt flow
				Logger.warn(
					`[ModelInfoCache] Error clearing ${key} cache:`,
					err instanceof Error ? err.message : String(err),
				);
			}
		}

		Logger.info(
			`[ModelInfoCache] All caches cleared (${clearedCount}/${allProviderKeys.length})`,
		);
	}

	/**
	 * Compute API key hash
	 *
	 * Uses SHA-256 hash and takes first 16 characters to avoid storing full key in cache
	 *
	 * @param apiKey API key
	 * @returns First 16 characters of key hash
	 */
	static async computeApiKeyHash(apiKey: string): Promise<string> {
		try {
			const hash = crypto.createHash("sha256").update(apiKey).digest("hex");
			return hash.substring(0, 16);
		} catch (err) {
			Logger.warn(
				"Failed to compute API key hash:",
				err instanceof Error ? err.message : String(err),
			);
			// If hashing fails, return fixed value (key change verification will fail)
			return "hash-error";
		}
	}

	/**
	 * Get cache storage key
	 *
	 * Format: chp_modelinfo_cache_<version>_<providerKey>
	 * Ensures caches for different versions do not conflict
	 */
	private getCacheKey(providerKey: string): string {
		return `chp_modelinfo_cache_${this.cacheVersion}_${providerKey}`;
	}

	/**
	 * Save user's model selection (globally save provider+model pair)
	 *
	 * Reference: Microsoft vscode-copilot-chat COPILOT_CLI_MODEL_MEMENTO_KEY
	 * Saves user's last selected model and its provider to distinguish models with same name from different providers
	 *
	 * @param providerKey Provider identifier
	 * @param modelId Model ID
	 */
	async saveLastSelectedModel(
		providerKey: string,
		modelId: string,
	): Promise<void> {
		try {
			const selection: SavedModelSelection = {
				providerKey,
				modelId,
				timestamp: Date.now(),
			};
			await this.context.globalState.update(
				ModelInfoCache.SELECTED_MODEL_KEY,
				selection,
			);
		} catch (err) {
			Logger.warn(
				"[ModelInfoCache] Failed to save model selection:",
				err instanceof Error ? err.message : String(err),
			);
		}
	}

	/**
	 * Get user's last selected model (global query)
	 * Only returns saved model matching current provider
	 *
	 * @param providerKey Current provider identifier
	 * @returns Model ID if last selected provider matches current; otherwise null
	 */
	getLastSelectedModel(providerKey: string): string | null {
		try {
			const saved = this.context.globalState.get<SavedModelSelection>(
				ModelInfoCache.SELECTED_MODEL_KEY,
			);
			if (saved && saved.providerKey === providerKey) {
				Logger.trace(
					`[ModelInfoCache] ${providerKey}: Read default model (${saved.modelId})`,
				);
				return saved.modelId;
			}
			if (saved) {
				Logger.trace(
					`[ModelInfoCache] ${providerKey}: Skipping default selection for other provider (` +
						`saved: ${saved.providerKey}/${saved.modelId})`,
				);
			}
			return null;
		} catch (err) {
			Logger.warn(
				"[ModelInfoCache] Failed to read model selection:",
				err instanceof Error ? err.message : String(err),
			);
			return null;
		}
	}
}
