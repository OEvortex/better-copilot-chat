/*---------------------------------------------------------------------------------------------
 *  Account Quota Cache
 *  Cache quota state and status for each account
 *  Persisted to survive extension restarts
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

const STORAGE_KEY = 'chp.accountQuotaCache';
const STORAGE_VERSION = 1;

/**
 * Quota state for an account
 */
export interface AccountQuotaState {
    /** Account ID */
    accountId: string;
    /** Account display name (for UI) */
    accountName?: string;
    /** Provider (antigravity, codex, etc.) */
    provider: string;
    /** Quota exceeded flag */
    quotaExceeded: boolean;
    /** Timestamp when quota will reset */
    quotaResetAt?: number;
    /** Backoff level for exponential backoff */
    backoffLevel: number;
    /** Affected model (if any) */
    affectedModel?: string;
    /** Last error message */
    lastError?: string;
    /** Last updated timestamp */
    updatedAt: number;
    /** Number of successful requests */
    successCount: number;
    /** Number of failed requests */
    failureCount: number;
    /** Timestamp of last successful request */
    lastSuccessAt?: number;
    /** Timestamp of last failed request */
    lastFailureAt?: number;
}

/**
 * Storage schema for quota cache
 */
interface QuotaCacheStorageData {
    version: number;
    accounts: AccountQuotaState[];
    updatedAt: number;
}

/**
 * Event when quota state changes
 */
export interface QuotaStateChangeEvent {
    accountId: string;
    provider: string;
    state: AccountQuotaState;
}

/**
 * Account Quota Cache - Singleton to manage quota cache for all accounts
 */
export class AccountQuotaCache {
    private static instance: AccountQuotaCache;
    private context: vscode.ExtensionContext | undefined;
    private cache = new Map<string, AccountQuotaState>();
    private _onQuotaStateChange = new vscode.EventEmitter<QuotaStateChangeEvent>();
    
    /** Event when quota state changes */
    public readonly onQuotaStateChange = this._onQuotaStateChange.event;

    private constructor() {}

    /**
     * Initialize with extension context
     */
    static initialize(context: vscode.ExtensionContext): AccountQuotaCache {
        if (!AccountQuotaCache.instance) {
            AccountQuotaCache.instance = new AccountQuotaCache();
        }
        AccountQuotaCache.instance.context = context;
        AccountQuotaCache.instance.loadFromStorage();
        Logger.info('AccountQuotaCache initialized');
        return AccountQuotaCache.instance;
    }

    /**
     * Get instance
     */
    static getInstance(): AccountQuotaCache {
        if (!AccountQuotaCache.instance) {
            AccountQuotaCache.instance = new AccountQuotaCache();
        }
        return AccountQuotaCache.instance;
    }

    /**
     * Load cache from storage
     */
    private loadFromStorage(): void {
        if (!this.context) {
            return;
        }

        try {
            const data = this.context.globalState.get<QuotaCacheStorageData>(STORAGE_KEY);
            if (data && data.version === STORAGE_VERSION) {
                this.cache.clear();
                for (const state of data.accounts) {
                    // Check whether quota has reset
                    if (state.quotaExceeded && state.quotaResetAt && Date.now() >= state.quotaResetAt) {
                        // Quota has reset, clear state
                        state.quotaExceeded = false;
                        state.quotaResetAt = undefined;
                        state.backoffLevel = 0;
                        state.lastError = undefined;
                    }
                    this.cache.set(state.accountId, state);
                }
                Logger.debug(`Loaded ${this.cache.size} account quota states from storage`);
            }
        } catch (error) {
            Logger.error('Failed to load quota cache from storage:', error);
        }
    }

    /**
     * Save cache to storage
     */
    private async saveToStorage(): Promise<void> {
        if (!this.context) {
            return;
        }

        try {
            const data: QuotaCacheStorageData = {
                version: STORAGE_VERSION,
                accounts: Array.from(this.cache.values()),
                updatedAt: Date.now()
            };
            await this.context.globalState.update(STORAGE_KEY, data);
            Logger.debug('Quota cache saved to storage');
        } catch (error) {
            Logger.error('Failed to save quota cache to storage:', error);
        }
    }

    /**
     * Get or create state for account
     */
    private getOrCreateState(accountId: string, provider: string, accountName?: string): AccountQuotaState {
        if (!accountId) {
            Logger.warn(`[AccountQuotaCache] getOrCreateState called with empty accountId! provider: ${provider}, accountName: ${accountName}`);
            Logger.warn('[AccountQuotaCache] Stack trace:', new Error().stack);
        }
        
        let state = this.cache.get(accountId);
        if (!state) {
            Logger.debug(`[AccountQuotaCache] Creating new state for accountId: ${accountId}, provider: ${provider}`);
            state = {
                accountId,
                accountName,
                provider,
                quotaExceeded: false,
                backoffLevel: 0,
                updatedAt: Date.now(),
                successCount: 0,
                failureCount: 0
            };
            this.cache.set(accountId, state);
        } else if (accountName && state.accountName !== accountName) {
            state.accountName = accountName;
        }
        return state;
    }

    /**
     * Mark quota exceeded for account
     */
    async markQuotaExceeded(
        accountId: string,
        provider: string,
        options?: {
            accountName?: string;
            resetDelayMs?: number;
            affectedModel?: string;
            error?: string;
        }
    ): Promise<void> {
        if (!accountId || accountId === 'undefined') {
            Logger.error(`[AccountQuotaCache] markQuotaExceeded called with invalid accountId: "${accountId}", provider: ${provider}, accountName: ${options?.accountName}`);
            Logger.error('[AccountQuotaCache] Stack trace:', new Error().stack);
            return;
        }
        
        Logger.debug(`[AccountQuotaCache] markQuotaExceeded - accountId: ${accountId}, provider: ${provider}, accountName: ${options?.accountName}`);
        const state = this.getOrCreateState(accountId, provider, options?.accountName);
        
        // Calculate cooldown with exponential backoff
        const { cooldown, newLevel } = this.calculateCooldown(state.backoffLevel, options?.resetDelayMs);
        
        state.quotaExceeded = true;
        state.quotaResetAt = Date.now() + cooldown;
        state.backoffLevel = newLevel;
        state.affectedModel = options?.affectedModel;
        state.lastError = options?.error || `Quota exceeded, retry after ${Math.round(cooldown / 1000)}s`;
        state.updatedAt = Date.now();
        state.failureCount++;
        state.lastFailureAt = Date.now();

        Logger.debug(`[AccountQuotaCache] Updated state for ${accountId}: failureCount=${state.failureCount}, quotaResetAt=${state.quotaResetAt}`);
        await this.saveToStorage();
        this._onQuotaStateChange.fire({ accountId, provider, state });
        
        Logger.debug(`[AccountQuotaCache] Account ${accountId} quota exceeded, cooldown ${Math.round(cooldown / 1000)}s (level ${newLevel})`);
    }

    /**
     * Clear quota exceeded state for account
     */
    async clearQuotaExceeded(accountId: string): Promise<void> {
        const state = this.cache.get(accountId);
        if (state) {
            state.quotaExceeded = false;
            state.quotaResetAt = undefined;
            state.backoffLevel = 0;
            state.lastError = undefined;
            state.updatedAt = Date.now();
            
            await this.saveToStorage();
            this._onQuotaStateChange.fire({ accountId, provider: state.provider, state });
        }
    }

    /**
     * Record a successful request
     */
    async recordSuccess(accountId: string, provider: string, accountName?: string): Promise<void> {
        if (!accountId || accountId === 'undefined') {
            Logger.error(`[AccountQuotaCache] recordSuccess called with invalid accountId: "${accountId}", provider: ${provider}, accountName: ${accountName}`);
            Logger.error('[AccountQuotaCache] Stack trace:', new Error().stack);
            return;
        }
        
        Logger.debug(`[AccountQuotaCache] recordSuccess - accountId: ${accountId}, provider: ${provider}, accountName: ${accountName}`);
        const state = this.getOrCreateState(accountId, provider, accountName);
        Logger.debug(`[AccountQuotaCache] Current state for ${accountId}: successCount=${state.successCount}, failureCount=${state.failureCount}`);
        
        // Clear quota exceeded if present
        if (state.quotaExceeded) {
            state.quotaExceeded = false;
            state.quotaResetAt = undefined;
            state.backoffLevel = 0;
            state.lastError = undefined;
        }
        
        state.successCount++;
        state.lastSuccessAt = Date.now();
        state.updatedAt = Date.now();
        
        Logger.debug(`[AccountQuotaCache] Updated state for ${accountId}: successCount=${state.successCount}`);
        await this.saveToStorage();
        this._onQuotaStateChange.fire({ accountId, provider, state });
    }

    /**
     * Record failed request (non-quota)
     */
    async recordFailure(accountId: string, provider: string, error?: string, accountName?: string): Promise<void> {
        const state = this.getOrCreateState(accountId, provider, accountName);
        
        state.failureCount++;
        state.lastFailureAt = Date.now();
        state.lastError = error;
        state.updatedAt = Date.now();
        
        await this.saveToStorage();
        this._onQuotaStateChange.fire({ accountId, provider, state });
    }

    /**
     * Check whether account is in cooldown
     */
    isInCooldown(accountId: string): boolean {
        const state = this.cache.get(accountId);
        if (!state || !state.quotaExceeded) {
            return false;
        }
        if (state.quotaResetAt && Date.now() >= state.quotaResetAt) {
            // Cooldown expired, clear state (async)
            void this.clearQuotaExceeded(accountId);
            return false;
        }
        return true;
    }

    /**
     * Get remaining cooldown time (ms)
     */
    getRemainingCooldown(accountId: string): number {
        const state = this.cache.get(accountId);
        if (!state || !state.quotaExceeded || !state.quotaResetAt) {
            return 0;
        }
        const remaining = state.quotaResetAt - Date.now();
        return remaining > 0 ? remaining : 0;
    }

    /**
     * Get state of account
     */
    getState(accountId: string): AccountQuotaState | undefined {
        return this.cache.get(accountId);
    }

    /**
     * Get all states
     */
    getAllStates(): AccountQuotaState[] {
        const states = Array.from(this.cache.values());
        Logger.debug(`[AccountQuotaCache] getAllStates returning ${states.length} states:`, states.map(s => ({ accountId: s.accountId, provider: s.provider, successCount: s.successCount, failureCount: s.failureCount })));
        return states;
    }

    /**
     * Get states by provider
     */
    getStatesByProvider(provider: string): AccountQuotaState[] {
        return Array.from(this.cache.values()).filter(s => s.provider === provider);
    }

    /**
     * Get available accounts (not in cooldown)
     */
    getAvailableAccounts(provider: string): string[] {
        return Array.from(this.cache.values())
            .filter(s => s.provider === provider && !this.isInCooldown(s.accountId))
            .map(s => s.accountId);
    }

    /**
     * Get account with the shortest cooldown (to prefer when all are limited)
     */
    getAccountWithShortestCooldown(provider: string): string | undefined {
        const states = this.getStatesByProvider(provider)
            .filter(s => s.quotaExceeded && s.quotaResetAt)
            .sort((a, b) => (a.quotaResetAt || 0) - (b.quotaResetAt || 0));
        
        return states[0]?.accountId;
    }

    /**
     * Calculate cooldown with exponential backoff
     */
    private calculateCooldown(prevLevel: number, serverDelayMs?: number): { cooldown: number; newLevel: number } {
        const QUOTA_BACKOFF_BASE_MS = 1000; // 1s
        const QUOTA_BACKOFF_MAX_MS = 30 * 60 * 1000; // 30 minutes

        if (prevLevel < 0) {
            prevLevel = 0;
        }
        
        let cooldown = QUOTA_BACKOFF_BASE_MS * Math.pow(2, prevLevel);
        if (cooldown < QUOTA_BACKOFF_BASE_MS) {
            cooldown = QUOTA_BACKOFF_BASE_MS;
        }
        
        // If server provides delay, use a larger value
        if (serverDelayMs && serverDelayMs > cooldown) {
            cooldown = serverDelayMs;
        }
        
        if (cooldown >= QUOTA_BACKOFF_MAX_MS) {
            return { cooldown: QUOTA_BACKOFF_MAX_MS, newLevel: prevLevel };
        }
        return { cooldown, newLevel: prevLevel + 1 };
    }

    /**
     * Remove account state (when account is deleted)
     */
    async removeAccount(accountId: string): Promise<void> {
        if (this.cache.has(accountId)) {
            this.cache.delete(accountId);
            await this.saveToStorage();
        }
    }

    /**
     * Clear all cache
     */
    async clearAll(): Promise<void> {
        this.cache.clear();
        await this.saveToStorage();
    }

    /**
     * Dispose
     */
    dispose(): void {
        this._onQuotaStateChange.dispose();
    }
}
