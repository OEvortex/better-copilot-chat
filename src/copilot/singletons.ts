/**
 * Global singleton accessor - Unified access to shared singleton instances in copilot.bundle.js
 *
 * Due to esbuild's code splitting, extension.js and copilot.bundle.js are two independent CommonJS modules
 * This module provides a unified interface to access shared singletons stored in globalThis,
 * ensuring both bundles use the same instance
 */

import { CompletionLogger } from '../utils/completionLogger';
import { ApiKeyManager } from '../utils/apiKeyManager';
import { ConfigManager } from '../utils/configManager';

/** Type definition for singleton container */
interface CHPSingletons {
    CompletionLogger: typeof CompletionLogger;
    ApiKeyManager: typeof ApiKeyManager;
    ConfigManager: typeof ConfigManager;
}

/** Extend global types */
declare global {
    var __chp_singletons: CHPSingletons | undefined;
}

/**
 * Get shared CompletionLogger instance
 * Prefer to get from globalThis (instance initialized by extension.js), otherwise fallback to direct import
 */
export function getCompletionLogger(): typeof CompletionLogger {
    return globalThis.__chp_singletons?.CompletionLogger || CompletionLogger;
}

/**
 * Get shared ApiKeyManager instance
 * Prefer to get from globalThis (instance initialized by extension.js), otherwise fallback to direct import
 */
export function getApiKeyManager(): typeof ApiKeyManager {
    return globalThis.__chp_singletons?.ApiKeyManager || ApiKeyManager;
}

/**
 * Get shared ConfigManager instance
 * Prefer to get from globalThis (instance initialized by extension.js), otherwise fallback to direct import
 */
export function getConfigManager(): typeof ConfigManager {
    return globalThis.__chp_singletons?.ConfigManager || ConfigManager;
}

/**
 * Batch get all shared singletons (optional)
 * Used to get multiple instances at once
 */
export function getAllSingletons(): CHPSingletons {
    return {
        CompletionLogger: getCompletionLogger(),
        ApiKeyManager: getApiKeyManager(),
        ConfigManager: getConfigManager()
    };
}
