/*---------------------------------------------------------------------------------------------
 *  Status Bar Manager
 *  Global static manager, unifies lifecycle management and operations of all status bar items
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { StatusLogger } from '../utils/statusLogger';
import { MiniMaxStatusBar } from './minimaxStatusBar';
import { KimiStatusBar } from './kimiStatusBar';
import { DeepSeekStatusBar } from './deepseekStatusBar';
import { MoonshotStatusBar } from './moonshotStatusBar';
import { ZhipuStatusBar } from './zhipuStatusBar';
import { ChutesStatusBar } from './chutesStatusBar';
import { OpenCodeStatusBar } from './opencodeStatusBar';
import { QwenCliStatusBar } from './qwencliStatusBar';
import { CompatibleStatusBar } from './compatibleStatusBar';
import { TokenUsageStatusBar } from './tokenUsageStatusBar';
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
interface ICompatibleStatusBar extends IStatusBar {
    /** @deprecated Use delayedUpdate with providerId instead */
    delayedUpdate(delayMs?: number): void;
    delayedUpdate(providerId: string, delayMs?: number): void;
}

/**
 * Status Bar Manager
 * Global static class, unifies lifecycle management and operations of all status bar items
 * All status bar instances are provided as public members for access
 */
export class StatusBarManager {
    // ==================== Public Status Bar Instances ====================
    /** MiniMax Coding Plan Status Bar */
    static minimax: IStatusBar | undefined;
    /** Kimi For Coding Status Bar */
    static kimi: IStatusBar | undefined;
    /** DeepSeek Balance Query Status Bar */
    static deepseek: IStatusBar | undefined;
    /** Moonshot Balance Query Status Bar */
    static moonshot: IStatusBar | undefined;
    /** Zhipu AI Usage Status Bar */
    static zhipu: IStatusBar | undefined;
    /** Chutes Status Bar */
    static chutes: IStatusBar | undefined;
    /** OpenCode Status Bar */
    static opencode: IStatusBar | undefined;
    /** Qwen CLI Status Bar */
    static qwencli: IStatusBar | undefined;
    /** Compatible Provider Status Bar */
    static compatible: ICompatibleStatusBar | undefined;
    /** Model context window usage status bar */
    static tokenUsage: IStatusBar | undefined;
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
        // Create and register MiniMax status bar
        const miniMaxStatusBar = new MiniMaxStatusBar();
        this.registerStatusBar('minimax', miniMaxStatusBar);

        // Create and register Zhipu status bar
        const zhipuStatusBar = new ZhipuStatusBar();
        this.registerStatusBar('zhipu', zhipuStatusBar);

        // Create and register Chutes status bar
        const chutesStatusBar = new ChutesStatusBar();
        this.registerStatusBar('chutes', chutesStatusBar);

        // Create and register OpenCode status bar
        const opencodeStatusBar = new OpenCodeStatusBar();
        this.registerStatusBar('opencode', opencodeStatusBar);

        // Create and register Qwen CLI status bar
        const qwencliStatusBar = new QwenCliStatusBar();
        this.registerStatusBar('qwencli', qwencliStatusBar);

        // Create and register Kimi status bar
        const kimiStatusBar = new KimiStatusBar();
        this.registerStatusBar('kimi', kimiStatusBar);

        // Create and register DeepSeek status bar
        const deepseekStatusBar = new DeepSeekStatusBar();
        this.registerStatusBar('deepseek', deepseekStatusBar);

        // Create and register Moonshot status bar
        const moonshotStatusBar = new MoonshotStatusBar();
        this.registerStatusBar('moonshot', moonshotStatusBar);

        // Create and register Compatible provider status bar
        const compatibleStatusBar = new CompatibleStatusBar();
        this.registerStatusBar('compatible', compatibleStatusBar);

        // Create and register Model context window usage status bar
        const tokenUsageStatusBar = new TokenUsageStatusBar();
        this.registerStatusBar('tokenUsage', tokenUsageStatusBar);

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
            case 'minimax':
                this.minimax = statusBar;
                break;
            case 'zhipu':
                this.zhipu = statusBar;
                break;
            case 'chutes':
                this.chutes = statusBar;
                break;
            case 'opencode':
                this.opencode = statusBar;
                break;
            case 'qwencli':
                this.qwencli = statusBar;
                break;
            case 'kimi':
                this.kimi = statusBar;
                break;
            case 'deepseek':
                this.deepseek = statusBar;
                break;
            case 'moonshot':
                this.moonshot = statusBar;
                break;
            case 'compatible':
                this.compatible = statusBar as ICompatibleStatusBar;
                break;
            case 'tokenUsage':
                this.tokenUsage = statusBar;
                break;
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
    static getStatusBar(key: 'compatible'): ICompatibleStatusBar | undefined;
    static getStatusBar(key: string): IStatusBar | undefined;
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
            StatusLogger.warn('[StatusBarManager] Status bar manager already initialized, skipping duplicate initialization');
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
                StatusLogger.debug(`[StatusBarManager] Status bar item ${key} initialized successfully (duration: ${duration}ms)`);
            } catch (error) {
                const duration = Date.now() - startTime;
                StatusLogger.error(`[StatusBarManager] Status bar item ${key} initialization failed (duration: ${duration}ms)`, error);
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
        this.minimax = undefined;
        this.zhipu = undefined;
        this.chutes = undefined;
        this.opencode = undefined;
        this.qwencli = undefined;
        this.kimi = undefined;
        this.deepseek = undefined;
        this.moonshot = undefined;
        this.compatible = undefined;
        this.tokenUsage = undefined;
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
