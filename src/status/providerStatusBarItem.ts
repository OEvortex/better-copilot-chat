/*---------------------------------------------------------------------------------------------
 *  Single Provider Status Bar Item Base Class
 *  Inherits from BaseStatusBarItem, adds API Key related logic
 *--------------------------------------------------------------------------------------------*/

import { BaseStatusBarItem, StatusBarItemConfig } from './baseStatusBarItem';
import { ApiKeyManager } from '../utils/apiKeyManager';

export { StatusBarItemConfig } from './baseStatusBarItem';

export abstract class ProviderStatusBarItem<T> extends BaseStatusBarItem<T> {
    protected override readonly config: StatusBarItemConfig;

    constructor(config: StatusBarItemConfig) {
        super(config);
        this.config = config;
    }

    protected async shouldShowStatusBar(): Promise<boolean> {
        return await ApiKeyManager.hasValidApiKey(this.config.apiKeyProvider);
    }
}
