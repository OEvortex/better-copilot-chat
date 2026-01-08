/*---------------------------------------------------------------------------------------------
 *  Status Bar Manager
 *  Global static manager, unifies lifecycle management and operations of all status bar items
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { StatusLogger } from '../utils/statusLogger';
import { AntigravityStatusBar } from './antigravityStatusBar';

/**
 * Status Bar Item Interface
 */
interface IStatusBar {
    initialize(context: vscode.ExtensionContext): Promise<void>;
    checkAndShowStatus(): Promise<void>;
    delayedUpdate(delayMs?: number): void;
    dispose(): void;
}

/**
 * Status Bar Manager
 * Global static class, unifies lifecycle management and operations of all status bar items
 * All status bar instances are provided as public members for access
 */
export class StatusBarManager {
    // ==================== Public Status Bar Instances ====================
    /** Antigravity (Cloud Code) Quota Status Bar */
    static antigravity: IStatusBar | undefined;

    // ==================== Private Members ====================
    private static statusBars: Map<string, IStatusBar> = new Map<string, IStatusBar>();
    private static initialized = false;

    /**
     * Register all built-in status bars
     * Automatically create and register all status bar instances during initialization
     */
    private static registerBuiltInStatusBars(): void {
        // Create and register Antigravity (Cloud Code) status bar
        const antigravityStatusBar = new AntigravityStatusBar();
        this.registerStatusBar('antigravity', antigravityStatusBar);
    }

    /**
     * Register status bar item
     * Used to register all status bars during initialization
     * @param key Unique identifier for the status bar item
     * @param statusBar Status bar item instance
     */
    static registerStatusBar(key: string, statusBar: IStatusBar): void {
        if (this.statusBars.has(key)) {
            StatusLogger.warn(`[StatusBarManager] Status bar item ${key} already exists, overwriting registration`);
        }
        this.statusBars.set(key, statusBar);

        // Associate status bar instance with public member
        switch (key) {
            case 'antigravity':
                this.antigravity = statusBar;
                break;
            default:
                break;
        }
    }

    /**
     * Get specified status bar item
     * @param key Unique identifier for the status bar item
     */
    static getStatusBar(key: string): IStatusBar | undefined {
        return this.statusBars.get(key);
    }

    /**
     * Initialize all registered status bar items
     * Batch load and initialize all status bars
     * @param context Extension context
     */
    static async initializeAll(context: vscode.ExtensionContext): Promise<void> {
        if (this.initialized) {
            StatusLogger.warn(
                '[StatusBarManager] Status bar manager already initialized, skipping duplicate initialization'
            );
            return;
        }

        // Step 1: Register all built-in status bars
        this.registerBuiltInStatusBars();

        StatusLogger.info(`[StatusBarManager] Starting initialization of ${this.statusBars.size} status bar items`);

        // Initialize all status bars in parallel, and record the time taken for each
        const initPromises = Array.from(this.statusBars.entries()).map(async ([key, statusBar]) => {
            const startTime = Date.now();
            try {
                await statusBar.initialize(context);
                const duration = Date.now() - startTime;
                StatusLogger.debug(
                    `[StatusBarManager] Status bar item ${key} initialized successfully (duration: ${duration}ms)`
                );
            } catch (error) {
                const duration = Date.now() - startTime;
                StatusLogger.error(
                    `[StatusBarManager] Status bar item ${key} initialization failed (duration: ${duration}ms)`,
                    error
                );
            }
        });

        await Promise.all(initPromises);

        this.initialized = true;
        StatusLogger.info('[StatusBarManager] All status bar items initialization completed');
    }

    /**
     * Check and show specified status bar item
     * @param key Unique identifier for the status bar item
     */
    static async checkAndShowStatus(key: string): Promise<void> {
        const statusBar = this.getStatusBar(key);
        if (statusBar) {
            try {
                await statusBar.checkAndShowStatus();
            } catch (error) {
                StatusLogger.error(`[StatusBarManager] Failed to check and show status bar ${key}`, error);
            }
        } else {
            StatusLogger.warn(`[StatusBarManager] Status bar item ${key} not found`);
        }
    }

    /**
     * Delayed update for specified status bar item
     * @param key Unique identifier for the status bar item
     * @param delayMs Delay time (milliseconds)
     */
    static delayedUpdate(key: string, delayMs?: number): void {
        const statusBar = this.getStatusBar(key);
        if (statusBar) {
            statusBar.delayedUpdate(delayMs);
        } else {
            StatusLogger.warn(`[StatusBarManager] Status bar item ${key} not found`);
        }
    }

    /**
     * Dispose all status bar items
     */
    static disposeAll(): void {
        for (const [key, statusBar] of this.statusBars) {
            try {
                statusBar.dispose();
                StatusLogger.debug(`[StatusBarManager] Status bar item ${key} disposed`);
            } catch (error) {
                StatusLogger.error(`[StatusBarManager] Failed to dispose status bar item ${key}`, error);
            }
        }
        this.statusBars.clear();
        this.initialized = false;

        // Clear public instance references
        this.antigravity = undefined;
    }

    /**
     * Get list of all registered status bar items
     */
    static getRegisteredKeys(): string[] {
        return Array.from(this.statusBars.keys());
    }

    /**
     * Get initialization status
     */
    static isInitialized(): boolean {
        return this.initialized;
    }
}
