/*---------------------------------------------------------------------------------------------
 *  Single Provider Status Bar Item Base Class
 *  Inherits from BaseStatusBarItem, adds API Key related logic
 *  Suitable for provider status bars that depend on a single API Key (e.g., MiniMax, DeepSeek, Kimi, Moonshot, etc.)
 *--------------------------------------------------------------------------------------------*/

import { BaseStatusBarItem, StatusBarItemConfig } from './baseStatusBarItem';
import { ApiKeyManager } from '../utils/apiKeyManager';

// Re-export StatusBarItemConfig for subclasses to use
export { StatusBarItemConfig } from './baseStatusBarItem';

/**
 * Single Provider Status Bar Item Base Class
 * Inherits from BaseStatusBarItem, provides API Key check logic
 *
 * Suitable for:
 * - Providers dependent on a single API Key
 * - MiniMaxStatusBar, DeepSeekStatusBar, KimiStatusBar, MoonshotStatusBar, etc.
 *
 * @template T Status data type
 */
export abstract class ProviderStatusBarItem<T> extends BaseStatusBarItem<T> {
    /** Status bar item configuration (includes apiKeyProvider) */
    protected override readonly config: StatusBarItemConfig;

    /**
     * Constructor
     * @param config Status bar item configuration including apiKeyProvider
     */
    constructor(config: StatusBarItemConfig) {
        super(config);
        this.config = config;
    }

    /**
     * Check if status bar should be shown
     * Determined by checking if API Key exists
     * @returns Whether status bar should be shown
     */
    protected async shouldShowStatusBar(): Promise<boolean> {
        return await ApiKeyManager.hasValidApiKey(this.config.apiKeyProvider);
    }
}
