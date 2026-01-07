/*---------------------------------------------------------------------------------------------
 *  Status Bar Item Base Class
 *  Provides common logic and lifecycle management for status bar management
 *  This is the most general base class, does not contain API Key related logic
 *  Suitable for status bar items that need to manage multiple providers or custom display logic (such as CompatibleStatusBar)
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { StatusLogger } from '../utils/statusLogger';
import { LeaderElectionService } from './leaderElectionService';

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
    /** Status bar item unique identifier (used by VS Code to distinguish different status bar items) */
    id: string;
    /** Status bar item name (displayed in the status bar item menu) */
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
    /** Status bar icon, such as '$(chp-minimax)' */
    icon: string;
}

/**
 * Extended status bar item configuration (includes API Key provider)
 * Suitable for single provider status bars (such as MiniMaxStatusBar, DeepSeekStatusBar, etc.)
 */
export interface StatusBarItemConfig extends BaseStatusBarItemConfig {
    /** API Key provider identifier */
    apiKeyProvider: string;
}

/**
 * Status bar item base class
 * Provides the most general logic for status bar management, including:
 * - Lifecycle management (initialization, destruction)
 * - Refresh mechanism (manual refresh, delayed refresh, periodic refresh)
 * - Cache management (read, write, expiration detection)
 * - Debounce logic
 *
 * This class does not contain API Key related logic, suitable for:
 * - Status bars managing multiple providers (such as CompatibleStatusBar)
 * - Status bars with custom display logic
 *
 * For single provider status bars, please use the ProviderStatusBarItem subclass
 *
 * @template T Status data type
 */
export abstract class BaseStatusBarItem<T> {
    // ==================== Instance members ====================
    protected statusBarItem: vscode.StatusBarItem | undefined;
    protected context: vscode.ExtensionContext | undefined;
    protected readonly config: BaseStatusBarItemConfig;

    // Status data
    protected lastStatusData: CachedStatusData<T> | null = null;

    // Timers
    protected updateDebouncer: NodeJS.Timeout | undefined;
    protected cacheUpdateTimer: NodeJS.Timeout | undefined;

    // Timestamps
    protected lastDelayedUpdateTime = 0;

    // Flags
    protected isLoading = false;
    protected initialized = false;

    // Constant configuration
    protected readonly MIN_DELAYED_UPDATE_INTERVAL = 30000; // Minimum delayed update interval 30 seconds
    protected readonly CACHE_UPDATE_INTERVAL = 10000; // Cache loading interval 10 seconds
    protected readonly HIGH_USAGE_THRESHOLD = 80; // High usage threshold 80%

    /**
     * Constructor
     * @param config Status bar item configuration
     */
    constructor(config: BaseStatusBarItemConfig) {
        this.config = config;
        this.validateConfig();
    }

    /**
     * Validate the validity of configuration parameters
     * @throws {Error} Throws an error when configuration is invalid
     */
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

    // ==================== Abstract methods (subclasses must implement) ====================

    /**
     * Get display text
     * @param data Status data
     * @returns Text displayed in the status bar
     */
    protected abstract getDisplayText(data: T): string;

    /**
     * Generate Tooltip content
     * @param data Status data
     * @returns Tooltip content
     */
    protected abstract generateTooltip(data: T): vscode.MarkdownString | string;

    /**
     * Execute API query
     * @returns Query result
     */
    protected abstract performApiQuery(): Promise<{ success: boolean; data?: T; error?: string }>;

    /**
     * Check if warning highlight is needed
     * @param data Status data
     * @returns Whether highlight is needed
     */
    protected abstract shouldHighlightWarning(data: T): boolean;

    /**
     * Check if cache needs to be refreshed
     * Implemented by subclasses for custom refresh judgment logic (including cache trigger and main instance periodic trigger)
     * @returns Whether refresh is needed
     */
    protected abstract shouldRefresh(): boolean;

    /**
     * Check if status bar should be displayed
     * Subclasses need to implement based on their own logic (such as checking if API Key exists, if there are configured providers, etc.)
     * @returns Whether status bar should be displayed
     */
    protected abstract shouldShowStatusBar(): Promise<boolean>;

    /**
     * Get cache key name
     * @param key Key name suffix
     * @returns Complete cache key name
     */
    protected getCacheKey(key: string): string {
        return `${this.config.cacheKeyPrefix}.${key}`;
    }

    // ==================== Virtual methods (subclasses can override) ====================

    /**
     * Hook method executed after initialization
     */
    protected async onInitialized(): Promise<void> {
        // Default empty implementation, subclasses can override
    }

    /**
     * Hook method executed before destruction
     */
    protected async onDispose(): Promise<void> {
        // Default empty implementation, subclasses can override
    }

    // ==================== Public methods ====================

    /**
     * Initialize status bar item
     * @param context Extension context
     */
    async initialize(context: vscode.ExtensionContext): Promise<void> {
        if (this.initialized) {
            StatusLogger.warn(`[${this.config.logPrefix}] Status bar item already initialized, skipping duplicate initialization`);
            return;
        }

        this.context = context;

        // Create StatusBarItem (use unique id to ensure VS Code can correctly distinguish different status bar items)
        this.statusBarItem = vscode.window.createStatusBarItem(
            this.config.id,
            this.config.alignment,
            this.config.priority
        );
        this.statusBarItem.name = this.config.name;
        this.statusBarItem.text = this.config.icon;
        this.statusBarItem.command = this.config.refreshCommand;

        // Asynchronously check if status bar should be displayed (does not block initialization)
        // Hide first, then decide whether to display after check is complete
        this.statusBarItem.hide();
        this.shouldShowStatusBar()
            .then(shouldShow => {
                if (shouldShow && this.statusBarItem) {
                    this.statusBarItem.show();
                } else {
                    StatusLogger.trace(`[${this.config.logPrefix}] Conditions not met for display, hiding status bar`);
                }
            })
            .catch(error => {
                StatusLogger.error(`[${this.config.logPrefix}] Failed to check display conditions`, error);
            });

        // Register refresh command
        context.subscriptions.push(
            vscode.commands.registerCommand(this.config.refreshCommand, () => {
                if (!this.isLoading) {
                    this.performRefresh();
                }
            })
        );

        // Initial update
        this.performInitialUpdate();

        // Start cache timer
        this.startCacheUpdateTimer();

        // Register cleanup logic
        context.subscriptions.push({
            dispose: () => {
                this.dispose();
            }
        });

        this.initialized = true;

        // Register main instance periodic refresh task
        this.registerLeaderPeriodicTask();

        // Call initialization hook
        await this.onInitialized();

        StatusLogger.info(`[${this.config.logPrefix}] Status bar item initialization completed`);
    }

    /**
     * Check and display status bar (called after conditions are met)
     */
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

    /**
     * Delayed update status bar (called after API request)
     * Includes debounce mechanism to avoid frequent requests
     * @param delayMs Delay time (milliseconds)
     */
    delayedUpdate(delayMs = 2000): void {
        // Clear previous debounce timer
        if (this.updateDebouncer) {
            clearTimeout(this.updateDebouncer);
        }

        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastDelayedUpdateTime;

        // If time since last update is less than threshold, wait until threshold is met
        const finalDelayMs =
            timeSinceLastUpdate < this.MIN_DELAYED_UPDATE_INTERVAL
                ? this.MIN_DELAYED_UPDATE_INTERVAL - timeSinceLastUpdate
                : delayMs;

        StatusLogger.debug(`[${this.config.logPrefix}] Setting delayed update, will execute in ${finalDelayMs / 1000} seconds`);

        // Set new debounce timer
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

    /**
     * Destroy status bar item
     */
    dispose(): void {
        // Call destruction hook
        this.onDispose();

        // Clean up timers
        if (this.updateDebouncer) {
            clearTimeout(this.updateDebouncer);
            this.updateDebouncer = undefined;
        }
        if (this.cacheUpdateTimer) {
            clearInterval(this.cacheUpdateTimer);
            this.cacheUpdateTimer = undefined;
        }

        // Clean up memory state
        this.lastStatusData = null;
        this.lastDelayedUpdateTime = 0;
        this.isLoading = false;
        this.context = undefined;

        // Destroy status bar item
        this.statusBarItem?.dispose();
        this.statusBarItem = undefined;

        this.initialized = false;

        StatusLogger.info(`[${this.config.logPrefix}] Status bar item destroyed`);
    }

    // ==================== Private methods ====================

    /**
     * Perform initial update (background loading)
     */
    private async performInitialUpdate(): Promise<void> {
        // Check if status bar should be displayed
        const shouldShow = await this.shouldShowStatusBar();

        if (!shouldShow) {
            if (this.statusBarItem) {
                this.statusBarItem.hide();
            }
            return;
        }

        // Ensure status bar is displayed
        if (this.statusBarItem) {
            this.statusBarItem.show();
        }

        // Execute API query (automatic refresh, do not display ERR on failure)
        await this.executeApiQuery(false);
    }

    /**
     * Perform user refresh (with loading state)
     */
    private async performRefresh(): Promise<void> {
        try {
            // Display loading state
            if (this.statusBarItem && this.lastStatusData) {
                const previousText = this.getDisplayText(this.lastStatusData.data);
                this.statusBarItem.text = `$(loading~spin) ${previousText.replace(this.config.icon, '').trim()}`;
                this.statusBarItem.backgroundColor = undefined;
                this.statusBarItem.tooltip = 'Loading...';
            }

            // Check if status bar should be displayed
            const shouldShow = await this.shouldShowStatusBar();

            if (!shouldShow) {
                if (this.statusBarItem) {
                    this.statusBarItem.hide();
                }
                return;
            }

            // Ensure status bar is displayed
            if (this.statusBarItem) {
                this.statusBarItem.show();
            }

            // Execute API query (manual refresh, display ERR on failure)
            await this.executeApiQuery(true);
        } catch (error) {
            StatusLogger.error(`[${this.config.logPrefix}] Refresh failed`, error);

            if (this.statusBarItem) {
                this.statusBarItem.text = `${this.config.icon} ERR`;
                this.statusBarItem.tooltip = `Failed to get: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        }
    }

    /**
     * Execute API query and update status bar
     * @param isManualRefresh Whether it is manual refresh (triggered by user click), display ERR on manual refresh failure, keep original state on automatic refresh failure
     */
    protected async executeApiQuery(isManualRefresh = false): Promise<void> {
        // Prevent concurrent execution
        if (this.isLoading) {
            StatusLogger.debug(`[${this.config.logPrefix}] Query in progress, skipping duplicate call`);
            return;
        }

        // For non-manual refresh, check if cache is valid within 5 seconds, skip this load if valid
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
                // Old version data format incompatible, ignore error and continue with refresh
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

                    // Save complete usage data
                    this.lastStatusData = {
                        data: data,
                        timestamp: Date.now()
                    };

                    // Save to global state
                    if (this.context) {
                        this.context.globalState.update(this.getCacheKey('statusData'), this.lastStatusData);
                    }

                    // Update status bar UI
                    this.updateStatusBarUI(data);

                    StatusLogger.info(`[${this.config.logPrefix}] Usage query successful`);
                }
            } else {
                // Error handling
                const errorMsg = result.error || 'Unknown error';

                // Only display ERR on manual refresh, keep original state on automatic refresh failure and wait for next refresh
                if (isManualRefresh && this.statusBarItem) {
                    this.statusBarItem.text = `${this.config.icon} ERR`;
                    this.statusBarItem.tooltip = `Failed to get: ${errorMsg}`;
                }

                StatusLogger.warn(`[${this.config.logPrefix}] Usage query failed: ${errorMsg}`);
            }
        } catch (error) {
            StatusLogger.error(`[${this.config.logPrefix}] Status bar update failed`, error);

            // Only display ERR on manual refresh, keep original state on automatic refresh failure and wait for next refresh
            if (isManualRefresh && this.statusBarItem) {
                this.statusBarItem.text = `${this.config.icon} ERR`;
                this.statusBarItem.tooltip = `Failed to get: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        } finally {
            // Must reset loading state at the end
            this.isLoading = false;
        }
    }

    /**
     * Update status bar UI
     * @param data Status data
     */
    protected updateStatusBarUI(data: T): void {
        if (!this.statusBarItem) {
            return;
        }

        // Update text
        this.statusBarItem.text = this.getDisplayText(data);

        // Update background color (warning highlight)
        if (this.shouldHighlightWarning(data)) {
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.backgroundColor = undefined;
        }

        // Update Tooltip
        this.statusBarItem.tooltip = this.generateTooltip(data);
    }

    /**
     * Read from cache and update status information
     */
    private updateFromCache(): void {
        if (!this.context || !this.statusBarItem || this.isLoading) {
            return;
        }

        try {
            // Read cached data from global state
            const cachedStatusData = this.context.globalState.get<CachedStatusData<T>>(this.getCacheKey('statusData'));

            if (cachedStatusData && cachedStatusData.data) {
                const dataAge = Date.now() - cachedStatusData.timestamp;

                if (dataAge > 30 * 1000) {
                    // Data over 30 seconds is considered unchanged, skip update
                    if (dataAge < 60 * 1000) {
                        // Data within 30-60 seconds is logged as warning
                        StatusLogger.debug(
                            `[${this.config.logPrefix}] Cached data expired (${(dataAge / 1000).toFixed(1)}s ago), skipping update`
                        );
                    }
                    // Data over 60 seconds is no longer logged
                    return;
                }

                // Update data in memory
                this.lastStatusData = cachedStatusData;

                // Update status bar display
                this.updateStatusBarUI(cachedStatusData.data);

                StatusLogger.debug(
                    `[${this.config.logPrefix}] Update status from cache (cached ${(dataAge / 1000).toFixed(1)}s ago)`
                );
            }
        } catch (error) {
            StatusLogger.warn(`[${this.config.logPrefix}] Failed to update status from cache`, error);
        }
    }

    /**
     * Start cache update timer
     */
    private startCacheUpdateTimer(): void {
        if (this.cacheUpdateTimer) {
            clearInterval(this.cacheUpdateTimer);
        }

        this.cacheUpdateTimer = setInterval(() => {
            this.updateFromCache();
        }, this.CACHE_UPDATE_INTERVAL);

        StatusLogger.debug(`[${this.config.logPrefix}] Cache update timer started, interval: ${this.CACHE_UPDATE_INTERVAL}ms`);
    }

    /**
     * Register main instance periodic refresh task
     */
    private registerLeaderPeriodicTask(): void {
        LeaderElectionService.registerPeriodicTask(async () => {
            // Only main instance will execute this task
            if (!this.initialized || !this.context || !this.statusBarItem) {
                StatusLogger.trace(`[${this.config.logPrefix}] Main instance periodic task skipped: not initialized or no context`);
                return;
            }

            // Check if refresh is needed
            const needRefresh = this.shouldRefresh();
            StatusLogger.trace(
                `[${this.config.logPrefix}] Main instance periodic task check: needRefresh=${needRefresh}, lastStatusData=${!!this.lastStatusData}`
            );

            if (needRefresh) {
                StatusLogger.debug(`[${this.config.logPrefix}] Main instance triggers timed refresh`);
                // Timed refresh is automatic refresh, do not display ERR on failure
                await this.executeApiQuery(false);
            }
        });

        StatusLogger.debug(`[${this.config.logPrefix}] Main instance periodic refresh task registered`);
    }
}
