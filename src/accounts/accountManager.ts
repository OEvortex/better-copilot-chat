/*---------------------------------------------------------------------------------------------
 *  Account Manager Service
 *  Manage multiple accounts for different providers and route requests.
 *  Inspired by the llm-mux OAuth Registry.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AccountQuotaCache } from './accountQuotaCache';
import { ProviderKey } from '../types/providerKeys';
import {
    Account,
    AccountStatus,
    AuthType,
    AccountCredentials,
    OAuthCredentials,
    ApiKeyCredentials,
    AccountStorageData,
    ActiveAccounts,
    AccountChangeEvent,
    LoginResult,
    ProviderAccountConfig,
    AccountRoutingConfig,
    ProviderRoutingConfig
} from './types';

const STORAGE_KEY = 'chp.accounts';
const STORAGE_VERSION = 1;

/**
 * Account Manager - Manage multiple accounts for providers
 */
export class AccountManager {
    private static instance: AccountManager;
    private context: vscode.ExtensionContext;
    private accounts = new Map<string, Account>();
    private activeAccounts: ActiveAccounts = {};
    private routingConfig: AccountRoutingConfig = {};
    private _onAccountChange = new vscode.EventEmitter<AccountChangeEvent>();
    
    /** Event fired when accounts change */
    public readonly onAccountChange = this._onAccountChange.event;

    /** Provider configuration */
    private static providerConfigs = new Map<string, ProviderAccountConfig>([
        [ProviderKey.Antigravity, { supportsMultiAccount: true, supportsOAuth: true, supportsApiKey: false }],
        [ProviderKey.Codex, { supportsMultiAccount: true, supportsOAuth: true, supportsApiKey: true }],
        [ProviderKey.Zhipu, { supportsMultiAccount: true, supportsOAuth: false, supportsApiKey: true }],
        [ProviderKey.Moonshot, { supportsMultiAccount: true, supportsOAuth: false, supportsApiKey: true }],
        [ProviderKey.MiniMax, { supportsMultiAccount: true, supportsOAuth: false, supportsApiKey: true }],
        [ProviderKey.Compatible, { supportsMultiAccount: true, supportsOAuth: false, supportsApiKey: true }],
        ['deepseek', { supportsMultiAccount: true, supportsOAuth: false, supportsApiKey: true }],
        // Register CLI OAuth providers so they can be managed via AccountManager
        ['qwencli', { supportsMultiAccount: true, supportsOAuth: true, supportsApiKey: false }],
        ['geminicli', { supportsMultiAccount: true, supportsOAuth: true, supportsApiKey: false }]
    ]);

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Initialize AccountManager
     */
    static initialize(context: vscode.ExtensionContext): AccountManager {
        if (!AccountManager.instance) {
            AccountManager.instance = new AccountManager(context);
            AccountManager.instance.loadFromStorage();
            Logger.info('AccountManager initialized');
        }
        return AccountManager.instance;
    }

    /**
     * Get instance
     */
    static getInstance(): AccountManager {
        if (!AccountManager.instance) {
            throw new Error('AccountManager not initialized. Call initialize() first.');
        }
        return AccountManager.instance;
    }

    /**
     * Generate unique ID for account
     */
    private generateAccountId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `acc_${timestamp}_${random}`;
    }

    /**
     * Load data from storage
     */
    private async loadFromStorage(): Promise<void> {
        try {
            const data = this.context.globalState.get<AccountStorageData>(STORAGE_KEY);
            if (data && data.version === STORAGE_VERSION) {
                this.accounts.clear();
                for (const account of data.accounts) {
                    this.accounts.set(account.id, account);
                }
                this.activeAccounts = data.activeAccounts || {};
                this.routingConfig = data.routingConfig || {};
                
                // Sync isDefault với activeAccounts để đảm bảo consistency
                this.syncIsDefaultWithActiveAccounts();
                
                Logger.debug(`Loaded ${this.accounts.size} accounts from storage`);
            }
        } catch (error) {
            Logger.error('Failed to load accounts from storage:', error);
        }
    }

    /**
     * Sync isDefault flag với activeAccounts để đảm bảo consistency
     * Fix bug: khi switch model, có thể gọi account đầu tiên thay vì default account
     */
    private syncIsDefaultWithActiveAccounts(): void {
        // Reset tất cả isDefault về false trước
        for (const account of this.accounts.values()) {
            account.isDefault = false;
        }
        
        // Set isDefault = true cho các account trong activeAccounts
        for (const [provider, accountId] of Object.entries(this.activeAccounts)) {
            const account = this.accounts.get(accountId);
            if (account && account.provider === provider) {
                account.isDefault = true;
            }
        }
    }

    /**
     * Lưu dữ liệu vào storage
     */
    private async saveToStorage(): Promise<void> {
        try {
            const data: AccountStorageData = {
                version: STORAGE_VERSION,
                accounts: Array.from(this.accounts.values()),
                activeAccounts: this.activeAccounts,
                routingConfig: this.routingConfig
            };
            await this.context.globalState.update(STORAGE_KEY, data);
            Logger.debug('Accounts saved to storage');
        } catch (error) {
            Logger.error('Failed to save accounts to storage:', error);
        }
    }

    /**
     * Lưu credentials vào SecretStorage
     */
    private async saveCredentials(accountId: string, credentials: AccountCredentials): Promise<void> {
        const key = `chp.account.${accountId}.credentials`;
        await this.context.secrets.store(key, JSON.stringify(credentials));
    }

    /**
     * Lấy credentials từ SecretStorage
     */
    async getCredentials(accountId: string): Promise<AccountCredentials | undefined> {
        const key = `chp.account.${accountId}.credentials`;
        const data = await this.context.secrets.get(key);
        if (data) {
            try {
                return JSON.parse(data) as AccountCredentials;
            } catch {
                return undefined;
            }
        }
        return undefined;
    }

    /**
     * Xóa credentials từ SecretStorage
     */
    private async deleteCredentials(accountId: string): Promise<void> {
        const key = `chp.account.${accountId}.credentials`;
        await this.context.secrets.delete(key);
    }

    /**
     * Thêm tài khoản mới với API Key
     */
    async addApiKeyAccount(
        provider: string,
        displayName: string,
        apiKey: string,
        options?: {
            endpoint?: string;
            customHeaders?: Record<string, string>;
            metadata?: Record<string, unknown>;
        }
    ): Promise<LoginResult> {
        try {
            const accountId = this.generateAccountId();
            const now = new Date().toISOString();

            const account: Account = {
                id: accountId,
                displayName,
                provider,
                authType: 'apiKey',
                status: 'active',
                createdAt: now,
                updatedAt: now,
                metadata: options?.metadata,
                isDefault: this.getAccountsByProvider(provider).length === 0
            };

            const credentials: ApiKeyCredentials = {
                apiKey,
                endpoint: options?.endpoint,
                customHeaders: options?.customHeaders
            };

            // Lưu account và credentials
            this.accounts.set(accountId, account);
            await this.saveCredentials(accountId, credentials);
            await this.saveToStorage();

            // Nếu là tài khoản đầu tiên, set làm active
            if (account.isDefault) {
                this.activeAccounts[provider] = accountId;
            }

            this._onAccountChange.fire({ type: 'added', account, provider });
            Logger.info(`Added API Key account: ${displayName} for ${provider}`);

            return { success: true, account };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            Logger.error('Failed to add API Key account:', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Thêm tài khoản OAuth
     */
    async addOAuthAccount(
        provider: string,
        displayName: string,
        email: string,
        oauthCredentials: OAuthCredentials,
        metadata?: Record<string, unknown>
    ): Promise<LoginResult> {
        try {
            const accountId = this.generateAccountId();
            const now = new Date().toISOString();

            const account: Account = {
                id: accountId,
                displayName,
                provider,
                authType: 'oauth',
                email,
                status: 'active',
                createdAt: now,
                updatedAt: now,
                expiresAt: oauthCredentials.expiresAt,
                metadata,
                isDefault: this.getAccountsByProvider(provider).length === 0
            };

            // Lưu account và credentials
            this.accounts.set(accountId, account);
            await this.saveCredentials(accountId, oauthCredentials);
            await this.saveToStorage();

            // Nếu là tài khoản đầu tiên, set làm active
            if (account.isDefault) {
                this.activeAccounts[provider] = accountId;
            }

            this._onAccountChange.fire({ type: 'added', account, provider });
            Logger.info(`Added OAuth account: ${displayName} (${email}) for ${provider}`);

            return { success: true, account };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            Logger.error('Failed to add OAuth account:', error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Xóa tài khoản
     */
    async removeAccount(accountId: string): Promise<boolean> {
        const account = this.accounts.get(accountId);
        if (!account) {
            Logger.warn(`Account not found: ${accountId}`);
            return false;
        }

        try {
            // Xóa credentials
            await this.deleteCredentials(accountId);

            // Xóa account
            this.accounts.delete(accountId);

            // Nếu là active account, chuyển sang account khác
            if (this.activeAccounts[account.provider] === accountId) {
                const remainingAccounts = this.getAccountsByProvider(account.provider);
                if (remainingAccounts.length > 0) {
                    this.activeAccounts[account.provider] = remainingAccounts[0].id;
                } else {
                    delete this.activeAccounts[account.provider];
                }
            }

            // Xóa mapping model -> account nếu account bị xóa
            const routing = this.routingConfig[account.provider];
            if (routing?.modelAssignments) {
                for (const [modelId, mappedAccountId] of Object.entries(routing.modelAssignments)) {
                    if (mappedAccountId === accountId) {
                        delete routing.modelAssignments[modelId];
                    }
                }
            }

            // Xóa quota cache của account
            try {
                const quotaCache = AccountQuotaCache.getInstance();
                await quotaCache.removeAccount(accountId);
            } catch {
                // Ignore if quota cache not initialized
            }

            await this.saveToStorage();
            this._onAccountChange.fire({ type: 'removed', account, provider: account.provider });
            Logger.info(`Removed account: ${account.displayName}`);

            return true;
        } catch (error) {
            Logger.error('Failed to remove account:', error);
            return false;
        }
    }

    /**
     * Chuyển đổi tài khoản active
     */
    async switchAccount(provider: string, accountId: string): Promise<boolean> {
        const account = this.accounts.get(accountId);
        if (!account || account.provider !== provider) {
            Logger.warn(`Account not found or provider mismatch: ${accountId}`);
            return false;
        }

        try {
            // Bỏ default của account cũ
            const oldActiveId = this.activeAccounts[provider];
            if (oldActiveId) {
                const oldAccount = this.accounts.get(oldActiveId);
                if (oldAccount) {
                    oldAccount.isDefault = false;
                }
            }

            // Set account mới làm active
            this.activeAccounts[provider] = accountId;
            account.isDefault = true;
            account.updatedAt = new Date().toISOString();

            await this.saveToStorage();
            this._onAccountChange.fire({ type: 'switched', account, provider });
            Logger.info(`Switched to account: ${account.displayName} for ${provider}`);

            return true;
        } catch (error) {
            Logger.error('Failed to switch account:', error);
            return false;
        }
    }

    /**
     * Lấy tài khoản active của provider
     */
    getActiveAccount(provider: string): Account | undefined {
        const accountId = this.activeAccounts[provider];
        if (accountId) {
            return this.accounts.get(accountId);
        }
        return undefined;
    }

    /**
     * Lấy credentials của tài khoản active
     */
    async getActiveCredentials(provider: string): Promise<AccountCredentials | undefined> {
        const account = this.getActiveAccount(provider);
        if (account) {
            return this.getCredentials(account.id);
        }
        return undefined;
    }

    /**
     * Lấy API Key của tài khoản active (tiện ích)
     */
    async getActiveApiKey(provider: string): Promise<string | undefined> {
        const credentials = await this.getActiveCredentials(provider);
        if (credentials && 'apiKey' in credentials) {
            return credentials.apiKey;
        }
        return undefined;
    }

    /**
     * Lấy OAuth token của tài khoản active (tiện ích)
     */
    async getActiveOAuthToken(provider: string): Promise<string | undefined> {
        const credentials = await this.getActiveCredentials(provider);
        if (credentials && 'accessToken' in credentials) {
            return credentials.accessToken;
        }
        return undefined;
    }

    /**
     * Lấy tất cả tài khoản của một provider
     */
    getAccountsByProvider(provider: string): Account[] {
        return Array.from(this.accounts.values()).filter(acc => acc.provider === provider);
    }

    /**
     * Lấy tất cả tài khoản
     */
    getAllAccounts(): Account[] {
        return Array.from(this.accounts.values());
    }

    /**
     * Lấy tài khoản theo ID
     */
    getAccount(accountId: string): Account | undefined {
        return this.accounts.get(accountId);
    }

    /**
     * Cập nhật thông tin tài khoản
     */
    async updateAccount(accountId: string, updates: Partial<Account>): Promise<boolean> {
        const account = this.accounts.get(accountId);
        if (!account) {
            return false;
        }

        try {
            Object.assign(account, updates, { updatedAt: new Date().toISOString() });
            await this.saveToStorage();
            this._onAccountChange.fire({ type: 'updated', account, provider: account.provider });
            return true;
        } catch (error) {
            Logger.error('Failed to update account:', error);
            return false;
        }
    }

    /**
     * Cập nhật credentials của tài khoản
     */
    async updateCredentials(accountId: string, credentials: AccountCredentials): Promise<boolean> {
        const account = this.accounts.get(accountId);
        if (!account) {
            return false;
        }

        try {
            await this.saveCredentials(accountId, credentials);
            account.updatedAt = new Date().toISOString();
            
            // Cập nhật expiresAt nếu là OAuth
            if ('expiresAt' in credentials) {
                account.expiresAt = credentials.expiresAt;
            }
            
            await this.saveToStorage();
            return true;
        } catch (error) {
            Logger.error('Failed to update credentials:', error);
            return false;
        }
    }

    /**
     * Lấy mapping model -> account cho provider
     */
    getModelAccountAssignments(provider: string): Record<string, string> {
        return { ...(this.routingConfig[provider]?.modelAssignments || {}) };
    }

    /**
     * Lấy accountId đã gán cho model
     */
    getAccountIdForModel(provider: string, modelId: string): string | undefined {
        return this.routingConfig[provider]?.modelAssignments?.[modelId];
    }

    /**
     * Gán model cho account (hoặc xóa gán nếu accountId không có)
     */
    async setAccountForModel(provider: string, modelId: string, accountId?: string): Promise<void> {
        const routing = this.ensureProviderRoutingConfig(provider);
        if (accountId) {
            routing.modelAssignments[modelId] = accountId;
        } else {
            delete routing.modelAssignments[modelId];
        }
        await this.saveToStorage();
    }

    /**
     * Lấy trạng thái bật/tắt load balance theo provider
     */
    getLoadBalanceEnabled(provider: string): boolean {
        // Default to true for antigravity and codex to enable automatic account switching
        const defaultValue = (provider === ProviderKey.Antigravity || provider === ProviderKey.Codex) ? true : false;
        return this.routingConfig[provider]?.loadBalanceEnabled ?? defaultValue;
    }

    /**
     * Cập nhật trạng thái load balance theo provider
     */
    async setLoadBalanceEnabled(provider: string, enabled: boolean): Promise<void> {
        const routing = this.ensureProviderRoutingConfig(provider);
        routing.loadBalanceEnabled = enabled;
        await this.saveToStorage();
    }

    /**
     * Đảm bảo routing config của provider tồn tại
     */
    private ensureProviderRoutingConfig(provider: string): ProviderRoutingConfig {
        if (!this.routingConfig[provider]) {
            this.routingConfig[provider] = {
                modelAssignments: {},
                loadBalanceEnabled: false
            };
        } else if (!this.routingConfig[provider].modelAssignments) {
            this.routingConfig[provider].modelAssignments = {};
        }
        return this.routingConfig[provider];
    }

    /**
     * Kiểm tra provider có hỗ trợ multi-account không
     */
    static supportsMultiAccount(provider: string): boolean {
        const config = AccountManager.providerConfigs.get(provider);
        return config?.supportsMultiAccount ?? true;
    }

    /**
     * Lấy cấu hình provider
     */
    static getProviderConfig(provider: string): ProviderAccountConfig {
        return AccountManager.providerConfigs.get(provider) ?? {
            supportsMultiAccount: true,
            supportsOAuth: false,
            supportsApiKey: true
        };
    }

    /**
     * Đăng ký cấu hình provider mới
     */
    static registerProviderConfig(provider: string, config: ProviderAccountConfig): void {
        AccountManager.providerConfigs.set(provider, config);
    }

    /**
     * Kiểm tra tài khoản có hết hạn không
     */
    isAccountExpired(accountId: string): boolean {
        const account = this.accounts.get(accountId);
        if (!account || !account.expiresAt) {
            return false;
        }
        return new Date(account.expiresAt) < new Date();
    }

    /**
     * Đánh dấu tài khoản là expired
     */
    async markAccountExpired(accountId: string): Promise<void> {
        await this.updateAccount(accountId, { status: 'expired' });
    }

    /**
     * Đánh dấu tài khoản có lỗi
     */
    async markAccountError(accountId: string, error?: string): Promise<void> {
        await this.updateAccount(accountId, { 
            status: 'error',
            metadata: { ...this.accounts.get(accountId)?.metadata, lastError: error }
        });
    }

    /**
     * Kiểm tra account có đang bị quota limit không
     */
    isAccountQuotaLimited(accountId: string): boolean {
        try {
            const quotaCache = AccountQuotaCache.getInstance();
            return quotaCache.isInCooldown(accountId);
        } catch {
            return false;
        }
    }

    /**
     * Lấy thời gian còn lại của quota cooldown (ms)
     */
    getAccountQuotaCooldown(accountId: string): number {
        try {
            const quotaCache = AccountQuotaCache.getInstance();
            return quotaCache.getRemainingCooldown(accountId);
        } catch {
            return 0;
        }
    }

    /**
     * Lấy danh sách accounts available (không bị quota limit) cho provider
     */
    getAvailableAccountsForProvider(provider: string): Account[] {
        const accounts = this.getAccountsByProvider(provider);
        return accounts.filter(acc => 
            acc.status === 'active' && 
            !this.isAccountExpired(acc.id) && 
            !this.isAccountQuotaLimited(acc.id)
        );
    }

    /**
     * Lấy account tiếp theo available cho provider (round-robin hoặc ưu tiên)
     */
    getNextAvailableAccount(provider: string, currentAccountId?: string): Account | undefined {
        const availableAccounts = this.getAvailableAccountsForProvider(provider);
        
        if (availableAccounts.length === 0) {
            // Không có account available, trả về account có cooldown ngắn nhất
            try {
                const quotaCache = AccountQuotaCache.getInstance();
                const shortestCooldownId = quotaCache.getAccountWithShortestCooldown(provider);
                if (shortestCooldownId) {
                    return this.accounts.get(shortestCooldownId);
                }
            } catch {
                // Ignore
            }
            return undefined;
        }
        
        // Nếu có currentAccountId, tìm account tiếp theo trong danh sách
        if (currentAccountId) {
            const currentIndex = availableAccounts.findIndex(acc => acc.id === currentAccountId);
            if (currentIndex >= 0 && currentIndex < availableAccounts.length - 1) {
                return availableAccounts[currentIndex + 1];
            }
        }
        
        // Trả về account đầu tiên available
        return availableAccounts[0];
    }

    /**
     * Dispose
     */
    dispose(): void {
        this._onAccountChange.dispose();
    }
}
