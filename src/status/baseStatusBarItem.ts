/*---------------------------------------------------------------------------------------------
 *  Status Bar Item Base Class
 *  Provides common logic and lifecycle management for status bar management
 *  This is the most general base class, does not contain API Key related logic
 *  Suitable for status bar items that need to manage multiple providers or custom display logic
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { StatusLogger } from '../utils/statusLogger';
import { LeaderElectionService } from './leaderElectionService.js';

/**
 * Cached data structure
 */
export interface CachedStatusData<T> {
    /** Status data */
    data: T;
    /** Cache timestamp */
    timestamp: number;
}

/**
 * Base status bar item configuration
 * Does not include apiKeyProvider, suitable for status bars that do not depend on a single API Key
 */
export interface BaseStatusBarItemConfig {
    /** Status bar item unique identifier */
    id: string;
    /** Status bar item name */
    name: string;
    /** Status bar item alignment */
    alignment: vscode.StatusBarAlignment;
    /** Status bar item priority */
    priority: number;
    /** Refresh command ID */
    refreshCommand: string;
    /** Cache key prefix */
    cacheKeyPrefix: string;
    /** Log prefix */
    logPrefix: string;
    /** Status bar icon */
    icon: string;
}

/**
 * Extended status bar item configuration (includes API Key provider)
 */
export interface StatusBarItemConfig extends BaseStatusBarItemConfig {
    /** API Key provider identifier */
    apiKeyProvider: string;
}

/**
 * Status bar item base class
 * @template T Status data type
 */
export abstract class BaseStatusBarItem<T> {
    protected statusBarItem: vscode.StatusBarItem | undefined;
    protected context: vscode.ExtensionContext | undefined;
    protected readonly config: BaseStatusBarItemConfig;
    protected lastStatusData: CachedStatusData<T> | null = null;
    protected updateDebouncer: NodeJS.Timeout | undefined;
    protected cacheUpdateTimer: NodeJS.Timeout | undefined;
    protected lastDelayedUpdateTime = 0;
    protected isLoading = false;
    protected initialized = false;

    protected readonly MIN_DELAYED_UPDATE_INTERVAL = 30000;
    protected readonly CACHE_UPDATE_INTERVAL: number = 10000;
    protected readonly HIGH_USAGE_THRESHOLD = 80;

    constructor(config: BaseStatusBarItemConfig) {
        this.config = config;
        this.validateConfig();
    }

    private validateConfig(): void {
        const requiredFields: (keyof BaseStatusBarItemConfig)[] = [
            'id',
            'name',
            'refreshCommand',
            'cacheKeyPrefix',
            'logPrefix',
            'icon'
        ];

        for (const field of requiredFields) {
            if (!this.config[field]) {
                throw new Error(`Invalid status bar configuration: ${field} cannot be empty`);
            }
        }

        if (typeof this.config.priority !== 'number') {
            throw new Error('Invalid status bar configuration: priority must be a number');
        }
    }

    protected abstract getDisplayText(data: T): string;
    protected abstract generateTooltip(data: T): vscode.MarkdownString | string;
    protected abstract performApiQuery(): Promise<{ success: boolean; data?: T; error?: string }>;
    protected abstract shouldHighlightWarning(data: T): boolean;
    protected abstract shouldRefresh(): boolean;
    protected abstract shouldShowStatusBar(): Promise<boolean>;

    protected getCacheKey(key: string): string {
        return `${this.config.cacheKeyPrefix}.${key}`;
    }

    protected async onInitialized(): Promise<void> {}
    protected async onDispose(): Promise<void> {}

    async initialize(context: vscode.ExtensionContext): Promise<void> {
        if (this.initialized) {
            StatusLogger.warn(`[${this.config.logPrefix}] Status bar item already initialized`);
            return;
        }

        this.context = context;

        this.statusBarItem = vscode.window.createStatusBarItem(
            this.config.id,
            this.config.alignment,
            this.config.priority
        );
        this.statusBarItem.name = this.config.name;
        this.statusBarItem.text = this.config.icon;
        this.statusBarItem.command = this.config.refreshCommand;

        this.statusBarItem.hide();
        this.shouldShowStatusBar()
            .then(shouldShow => {
                if (shouldShow && this.statusBarItem) {
                    this.statusBarItem.show();
                }
            })
            .catch(error => {
                StatusLogger.error(`[${this.config.logPrefix}] Failed to check display conditions`, error);
            });

        context.subscriptions.push(
            vscode.commands.registerCommand(this.config.refreshCommand, () => {
                if (!this.isLoading) {
                    this.performRefresh();
                }
            })
        );

        this.performInitialUpdate();
        this.startCacheUpdateTimer();

        context.subscriptions.push({
            dispose: () => {
                this.dispose();
            }
        });

        this.initialized = true;
        this.registerLeaderPeriodicTask();
        await this.onInitialized();

        StatusLogger.info(`[${this.config.logPrefix}] Status bar item initialization completed`);
    }

    async checkAndShowStatus(): Promise<void> {
        if (this.statusBarItem) {
            const shouldShow = await this.shouldShowStatusBar();
            if (shouldShow) {
                this.statusBarItem.show();
                this.performInitialUpdate();
            } else {
                this.statusBarItem.hide();
            }
        }
    }

    delayedUpdate(delayMs = 2000): void {
        if (this.updateDebouncer) {
            clearTimeout(this.updateDebouncer);
        }

        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastDelayedUpdateTime;

        const finalDelayMs =
            timeSinceLastUpdate < this.MIN_DELAYED_UPDATE_INTERVAL
                ? this.MIN_DELAYED_UPDATE_INTERVAL - timeSinceLastUpdate
                : delayMs;

        StatusLogger.debug(`[${this.config.logPrefix}] Setting delayed update, will execute in ${finalDelayMs / 1000} seconds`);

        this.updateDebouncer = setTimeout(async () => {
            try {
                StatusLogger.debug(`[${this.config.logPrefix}] Executing delayed update`);
                this.lastDelayedUpdateTime = Date.now();
                await this.performInitialUpdate();
            } catch (error) {
                StatusLogger.error(`[${this.config.logPrefix}] Delayed update failed`, error);
            } finally {
                this.updateDebouncer = undefined;
            }
        }, finalDelayMs);
    }

    dispose(): void {
        this.onDispose();

        if (this.updateDebouncer) {
            clearTimeout(this.updateDebouncer);
            this.updateDebouncer = undefined;
        }
        if (this.cacheUpdateTimer) {
            clearInterval(this.cacheUpdateTimer);
            this.cacheUpdateTimer = undefined;
        }

        this.lastStatusData = null;
        this.lastDelayedUpdateTime = 0;
        this.isLoading = false;
        this.context = undefined;

        this.statusBarItem?.dispose();
        this.statusBarItem = undefined;

        this.initialized = false;

        StatusLogger.info(`[${this.config.logPrefix}] Status bar item destroyed`);
    }

    private async performInitialUpdate(): Promise<void> {
        const shouldShow = await this.shouldShowStatusBar();

        if (!shouldShow) {
            if (this.statusBarItem) {
                this.statusBarItem.hide();
            }
            return;
        }

        if (this.statusBarItem) {
            this.statusBarItem.show();
        }

        await this.executeApiQuery(false);
    }

    private async performRefresh(): Promise<void> {
        try {
            if (this.statusBarItem && this.lastStatusData) {
                const previousText = this.getDisplayText(this.lastStatusData.data);
                this.statusBarItem.text = `$(loading~spin) ${previousText.replace(this.config.icon, '').trim()}`;
                this.statusBarItem.backgroundColor = undefined;
                this.statusBarItem.tooltip = 'Loading...';
            }

            const shouldShow = await this.shouldShowStatusBar();

            if (!shouldShow) {
                if (this.statusBarItem) {
                    this.statusBarItem.hide();
                }
                return;
            }

            if (this.statusBarItem) {
                this.statusBarItem.show();
            }

            await this.executeApiQuery(true);
        } catch (error) {
            StatusLogger.error(`[${this.config.logPrefix}] Refresh failed`, error);

            if (this.statusBarItem) {
                this.statusBarItem.text = `${this.config.icon} ERR`;
                this.statusBarItem.tooltip = `Failed to get: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        }
    }

    protected async executeApiQuery(isManualRefresh = false): Promise<void> {
        if (this.isLoading) {
            StatusLogger.debug(`[${this.config.logPrefix}] Query in progress, skipping duplicate call`);
            return;
        }

        if (!isManualRefresh && this.lastStatusData) {
            try {
                const dataAge = Date.now() - this.lastStatusData.timestamp;
                if (dataAge >= 0 && dataAge < 5000) {
                    StatusLogger.debug(
                        `[${this.config.logPrefix}] Data valid within 5 seconds (${(dataAge / 1000).toFixed(1)}s ago), skipping this automatic refresh`
                    );
                    return;
                }
            } catch {
                StatusLogger.debug(`[${this.config.logPrefix}] Cache data format incompatible, continuing with refresh`);
            }
        }

        this.isLoading = true;

        try {
            StatusLogger.debug(`[${this.config.logPrefix}] Starting usage query...`);

            const result = await this.performApiQuery();

            if (result.success && result.data) {
                if (this.statusBarItem) {
                    const data = result.data;

                    this.lastStatusData = {
                        data: data,
                        timestamp: Date.now()
                    };

                    if (this.context) {
                        this.context.globalState.update(this.getCacheKey('statusData'), this.lastStatusData);
                    }

                    this.updateStatusBarUI(data);

                    StatusLogger.info(`[${this.config.logPrefix}] Usage query successful`);
                }
            } else {
                const errorMsg = result.error || 'Unknown error';

                if (isManualRefresh && this.statusBarItem) {
                    this.statusBarItem.text = `${this.config.icon} ERR`;
                    this.statusBarItem.tooltip = `Failed to get: ${errorMsg}`;
                }

                StatusLogger.warn(`[${this.config.logPrefix}] Usage query failed: ${errorMsg}`);
            }
        } catch (error) {
            StatusLogger.error(`[${this.config.logPrefix}] Status bar update failed`, error);

            if (isManualRefresh && this.statusBarItem) {
                this.statusBarItem.text = `${this.config.icon} ERR`;
                this.statusBarItem.tooltip = `Failed to get: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        } finally {
            this.isLoading = false;
        }
    }

    protected updateStatusBarUI(data: T): void {
        if (!this.statusBarItem) {
            return;
        }

        this.statusBarItem.text = this.getDisplayText(data);

        const tooltip = this.generateTooltip(data);
        if (typeof tooltip === 'string') {
            this.statusBarItem.tooltip = tooltip;
        } else {
            this.statusBarItem.tooltip = tooltip;
        }

        if (this.shouldHighlightWarning(data)) {
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.backgroundColor = undefined;
        }
    }

    private startCacheUpdateTimer(): void {
        this.cacheUpdateTimer = setInterval(() => {
            if (this.shouldRefresh()) {
                StatusLogger.debug(`[${this.config.logPrefix}] Cache timer triggered refresh`);
                this.executeApiQuery(false).catch(error => {
                    StatusLogger.error(`[${this.config.logPrefix}] Cache timer refresh failed`, error);
                });
            }
        }, this.CACHE_UPDATE_INTERVAL);
    }

    private registerLeaderPeriodicTask(): void {
        LeaderElectionService.registerPeriodicTask(async () => {
            if (this.shouldRefresh()) {
                StatusLogger.debug(`[${this.config.logPrefix}] Leader periodic task triggered refresh`);
                await this.executeApiQuery(false);
            }
        });
    }
}
