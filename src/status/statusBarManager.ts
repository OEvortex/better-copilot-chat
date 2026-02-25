/*---------------------------------------------------------------------------------------------
 *  Status Bar Manager
 *  Global static manager, unifies lifecycle management and operations of all status bar items
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { StatusLogger } from '../utils/statusLogger.js';
import { LeaderElectionService } from './leaderElectionService.js';
import { AntigravityStatusBar } from './antigravityStatusBar.js';

interface IStatusBar {
    initialize(context: vscode.ExtensionContext): Promise<void>;
    checkAndShowStatus(): Promise<void>;
    delayedUpdate(delayMs?: number): void;
    dispose(): void;
}

export class StatusBarManager {
    static antigravity: IStatusBar | undefined;

    private static statusBars: Map<string, IStatusBar> = new Map<string, IStatusBar>();
    private static initialized = false;

    private static registerBuiltInStatusBars(): void {
        const antigravityStatusBar = new AntigravityStatusBar();
        this.registerStatusBar('antigravity', antigravityStatusBar);
    }

    static registerStatusBar(key: string, statusBar: IStatusBar): void {
        if (this.statusBars.has(key)) {
            StatusLogger.warn(`[StatusBarManager] Status bar item ${key} already exists, overwriting registration`);
        }
        this.statusBars.set(key, statusBar);

        switch (key) {
            case 'antigravity':
                this.antigravity = statusBar;
                break;
        }
    }

    static getStatusBar(key: string): IStatusBar | undefined {
        return this.statusBars.get(key);
    }

    static async initializeAll(context: vscode.ExtensionContext): Promise<void> {
        if (this.initialized) {
            StatusLogger.warn('[StatusBarManager] Status bar manager already initialized, skipping duplicate initialization');
            return;
        }

        this.registerBuiltInStatusBars();

        StatusLogger.info(`[StatusBarManager] Starting initialization of ${this.statusBars.size} status bar items`);

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

    static delayedUpdate(key: string, delayMs?: number): void {
        const statusBar = this.getStatusBar(key);
        if (statusBar) {
            statusBar.delayedUpdate(delayMs);
        } else {
            StatusLogger.warn(`[StatusBarManager] Status bar item ${key} not found`);
        }
    }

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

        this.antigravity = undefined;
    }

    static getRegisteredKeys(): string[] {
        return Array.from(this.statusBars.keys());
    }

    static isInitialized(): boolean {
        return this.initialized;
    }
}
