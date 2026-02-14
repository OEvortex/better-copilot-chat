/*---------------------------------------------------------------------------------------------
 *  Account Manager Service
 *  Manage multiple accounts for different providers and route requests.
 *  Inspired by the llm-mux OAuth Registry.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ProviderKey } from "../types/providerKeys";
import { Logger } from "../utils/logger";
import { AccountQuotaCache } from "./accountQuotaCache";
import type {
	Account,
	AccountChangeEvent,
	AccountCredentials,
	AccountRoutingConfig,
	AccountStorageData,
	ActiveAccounts,
	ApiKeyCredentials,
	LoginResult,
	OAuthCredentials,
	ProviderAccountConfig,
	ProviderRoutingConfig,
} from "./types";

const STORAGE_KEY = "chp.accounts";
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
		[
			ProviderKey.Antigravity,
			{
				supportsMultiAccount: true,
				supportsOAuth: true,
				supportsApiKey: false,
			},
		],
		[
			ProviderKey.Zhipu,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.Moonshot,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.MiniMax,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.Compatible,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.DeepSeek,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.DeepInfra,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.Chutes,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.OpenCode,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.Blackbox,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.Huggingface,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.Mistral,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.OpenAI,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.Kimi,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		[
			ProviderKey.MiniMaxCoding,
			{
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			},
		],
		// Register CLI OAuth providers so they can be managed via AccountManager
		[
			ProviderKey.QwenCli,
			{
				supportsMultiAccount: true,
				supportsOAuth: true,
				supportsApiKey: false,
			},
		],
		[
			ProviderKey.GeminiCli,
			{
				supportsMultiAccount: true,
				supportsOAuth: true,
				supportsApiKey: false,
			},
		],
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
			Logger.info("AccountManager initialized");
		}
		return AccountManager.instance;
	}

	/**
	 * Get instance
	 */
	static getInstance(): AccountManager {
		if (!AccountManager.instance) {
			throw new Error(
				"AccountManager not initialized. Call initialize() first.",
			);
		}
		return AccountManager.instance;
	}

	/**
	 * Generate unique account ID
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
			const data =
				this.context.globalState.get<AccountStorageData>(STORAGE_KEY);
			if (data && data.version === STORAGE_VERSION) {
				this.accounts.clear();
				for (const account of data.accounts) {
					this.accounts.set(account.id, account);
				}
				this.activeAccounts = data.activeAccounts || {};
				this.routingConfig = data.routingConfig || {};

				// Sync isDefault with activeAccounts to ensure consistency
				this.syncIsDefaultWithActiveAccounts();

				Logger.debug(`Loaded ${this.accounts.size} accounts from storage`);
			}
		} catch (error) {
			Logger.error("Failed to load accounts from storage:", error);
		}
	}

	/**
	 * Sync isDefault flag with activeAccounts to ensure consistency
	 * Fix: switching model could pick the first account instead of the default account
	 */
	private syncIsDefaultWithActiveAccounts(): void {
		// Reset all isDefault flags to false first
		for (const account of this.accounts.values()) {
			account.isDefault = false;
		}

		// Set isDefault = true for accounts in activeAccounts
		for (const [provider, accountId] of Object.entries(this.activeAccounts)) {
			const account = this.accounts.get(accountId);
			if (account && account.provider === provider) {
				account.isDefault = true;
			}
		}
	}

	/**
	 * Save data to storage
	 */
	private async saveToStorage(): Promise<void> {
		try {
			const data: AccountStorageData = {
				version: STORAGE_VERSION,
				accounts: Array.from(this.accounts.values()),
				activeAccounts: this.activeAccounts,
				routingConfig: this.routingConfig,
			};
			await this.context.globalState.update(STORAGE_KEY, data);
			Logger.debug("Accounts saved to storage");
		} catch (error) {
			Logger.error("Failed to save accounts to storage:", error);
		}
	}

	/**
	 * Save credentials to SecretStorage
	 */
	private async saveCredentials(
		accountId: string,
		credentials: AccountCredentials,
	): Promise<void> {
		const key = `chp.account.${accountId}.credentials`;
		await this.context.secrets.store(key, JSON.stringify(credentials));
	}

	/**
	 * Get credentials from SecretStorage
	 */
	async getCredentials(
		accountId: string,
	): Promise<AccountCredentials | undefined> {
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
	 * Delete credentials from SecretStorage
	 */
	private async deleteCredentials(accountId: string): Promise<void> {
		const key = `chp.account.${accountId}.credentials`;
		await this.context.secrets.delete(key);
	}

	/**
	 * Add new account with API Key
	 */
	async addApiKeyAccount(
		provider: string,
		displayName: string,
		apiKey: string,
		options?: {
			endpoint?: string;
			customHeaders?: Record<string, string>;
			metadata?: Record<string, unknown>;
		},
	): Promise<LoginResult> {
		try {
			const accountId = this.generateAccountId();
			const now = new Date().toISOString();

			const account: Account = {
				id: accountId,
				displayName,
				provider,
				authType: "apiKey",
				status: "active",
				createdAt: now,
				updatedAt: now,
				metadata: options?.metadata,
				isDefault: this.getAccountsByProvider(provider).length === 0,
			};

			const credentials: ApiKeyCredentials = {
				apiKey,
				endpoint: options?.endpoint,
				customHeaders: options?.customHeaders,
			};

			// Save account and credentials
			this.accounts.set(accountId, account);
			await this.saveCredentials(accountId, credentials);
			await this.saveToStorage();

			// If first account, set as active
			if (account.isDefault) {
				this.activeAccounts[provider] = accountId;
			}

			this._onAccountChange.fire({ type: "added", account, provider });
			Logger.info(`Added API Key account: ${displayName} for ${provider}`);

			return { success: true, account };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			Logger.error("Failed to add API Key account:", error);
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * Add OAuth account
	 */
	async addOAuthAccount(
		provider: string,
		displayName: string,
		email: string,
		oauthCredentials: OAuthCredentials,
		metadata?: Record<string, unknown>,
	): Promise<LoginResult> {
		try {
			const accountId = this.generateAccountId();
			const now = new Date().toISOString();

			const account: Account = {
				id: accountId,
				displayName,
				provider,
				authType: "oauth",
				email,
				status: "active",
				createdAt: now,
				updatedAt: now,
				expiresAt: oauthCredentials.expiresAt,
				metadata,
				isDefault: this.getAccountsByProvider(provider).length === 0,
			};

			// Save account and credentials
			this.accounts.set(accountId, account);
			await this.saveCredentials(accountId, oauthCredentials);
			await this.saveToStorage();

			// If first account, set as active
			if (account.isDefault) {
				this.activeAccounts[provider] = accountId;
			}

			this._onAccountChange.fire({ type: "added", account, provider });
			Logger.info(
				`Added OAuth account: ${displayName} (${email}) for ${provider}`,
			);

			return { success: true, account };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			Logger.error("Failed to add OAuth account:", error);
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * Delete account
	 */
	async removeAccount(accountId: string): Promise<boolean> {
		const account = this.accounts.get(accountId);
		if (!account) {
			Logger.warn(`Account not found: ${accountId}`);
			return false;
		}

		try {
			// Delete credentials
			await this.deleteCredentials(accountId);

			// Delete account
			this.accounts.delete(accountId);

			// If active account, switch to another account
			if (this.activeAccounts[account.provider] === accountId) {
				const remainingAccounts = this.getAccountsByProvider(account.provider);
				if (remainingAccounts.length > 0) {
					this.activeAccounts[account.provider] = remainingAccounts[0].id;
				} else {
					delete this.activeAccounts[account.provider];
				}
			}

			// Remove model->account mapping if account is deleted
			const routing = this.routingConfig[account.provider];
			if (routing?.modelAssignments) {
				for (const [modelId, mappedAccountId] of Object.entries(
					routing.modelAssignments,
				)) {
					if (mappedAccountId === accountId) {
						delete routing.modelAssignments[modelId];
					}
				}
			}

			// Remove account quota cache
			try {
				const quotaCache = AccountQuotaCache.getInstance();
				await quotaCache.removeAccount(accountId);
			} catch {
				// Ignore if quota cache not initialized
			}

			await this.saveToStorage();
			this._onAccountChange.fire({
				type: "removed",
				account,
				provider: account.provider,
			});
			Logger.info(`Removed account: ${account.displayName}`);

			return true;
		} catch (error) {
			Logger.error("Failed to remove account:", error);
			return false;
		}
	}

	/**
	 * Switch active account
	 */
	async switchAccount(provider: string, accountId: string): Promise<boolean> {
		const account = this.accounts.get(accountId);
		if (!account || account.provider !== provider) {
			Logger.warn(`Account not found or provider mismatch: ${accountId}`);
			return false;
		}

		try {
			// Remove default from old active account
			const oldActiveId = this.activeAccounts[provider];
			if (oldActiveId) {
				const oldAccount = this.accounts.get(oldActiveId);
				if (oldAccount) {
					oldAccount.isDefault = false;
				}
			}

			// Set new account as active
			this.activeAccounts[provider] = accountId;
			account.isDefault = true;
			account.updatedAt = new Date().toISOString();

			await this.saveToStorage();
			this._onAccountChange.fire({ type: "switched", account, provider });
			Logger.info(
				`Switched to account: ${account.displayName} for ${provider}`,
			);

			return true;
		} catch (error) {
			Logger.error("Failed to switch account:", error);
			return false;
		}
	}

	/**
	 * Get the active account for a provider
	 */
	getActiveAccount(provider: string): Account | undefined {
		const accountId = this.activeAccounts[provider];
		if (accountId) {
			return this.accounts.get(accountId);
		}
		return undefined;
	}

	/**
	 * Get credentials of the active account
	 */
	async getActiveCredentials(
		provider: string,
	): Promise<AccountCredentials | undefined> {
		const account = this.getActiveAccount(provider);
		if (account) {
			return this.getCredentials(account.id);
		}
		return undefined;
	}

	/**
	 * Get API Key of the active account (utility)
	 */
	async getActiveApiKey(provider: string): Promise<string | undefined> {
		const credentials = await this.getActiveCredentials(provider);
		if (credentials && "apiKey" in credentials) {
			return credentials.apiKey;
		}
		return undefined;
	}

	/**
	 * Get OAuth token of the active account (utility)
	 */
	async getActiveOAuthToken(provider: string): Promise<string | undefined> {
		const credentials = await this.getActiveCredentials(provider);
		if (credentials && "accessToken" in credentials) {
			return credentials.accessToken;
		}
		return undefined;
	}

	/**
	 * Get all accounts for a provider
	 */
	getAccountsByProvider(provider: string): Account[] {
		return Array.from(this.accounts.values()).filter(
			(acc) => acc.provider === provider,
		);
	}

	/**
	 * Get all accounts
	 */
	getAllAccounts(): Account[] {
		return Array.from(this.accounts.values());
	}

	/**
	 * Get account by ID
	 */
	getAccount(accountId: string): Account | undefined {
		return this.accounts.get(accountId);
	}

	/**
	 * Update account information
	 */
	async updateAccount(
		accountId: string,
		updates: Partial<Account>,
	): Promise<boolean> {
		const account = this.accounts.get(accountId);
		if (!account) {
			return false;
		}

		try {
			Object.assign(account, updates, { updatedAt: new Date().toISOString() });
			await this.saveToStorage();
			this._onAccountChange.fire({
				type: "updated",
				account,
				provider: account.provider,
			});
			return true;
		} catch (error) {
			Logger.error("Failed to update account:", error);
			return false;
		}
	}

	/**
	 * Update credentials of account
	 */
	async updateCredentials(
		accountId: string,
		credentials: AccountCredentials,
	): Promise<boolean> {
		const account = this.accounts.get(accountId);
		if (!account) {
			return false;
		}

		try {
			await this.saveCredentials(accountId, credentials);
			account.updatedAt = new Date().toISOString();

			// Update expiresAt if OAuth
			if ("expiresAt" in credentials) {
				account.expiresAt = credentials.expiresAt;
			}

			await this.saveToStorage();
			return true;
		} catch (error) {
			Logger.error("Failed to update credentials:", error);
			return false;
		}
	}

	/**
	 * Get model -> account mapping for the provider
	 */
	getModelAccountAssignments(provider: string): Record<string, string> {
		return { ...(this.routingConfig[provider]?.modelAssignments || {}) };
	}

	/**
	 * Get assigned accountId for the model
	 */
	getAccountIdForModel(provider: string, modelId: string): string | undefined {
		return this.routingConfig[provider]?.modelAssignments?.[modelId];
	}

	/**
	 * Assign model to account (or remove assignment if accountId not provided)
	 */
	async setAccountForModel(
		provider: string,
		modelId: string,
		accountId?: string,
	): Promise<void> {
		const routing = this.ensureProviderRoutingConfig(provider);
		if (accountId) {
			routing.modelAssignments[modelId] = accountId;
		} else {
			delete routing.modelAssignments[modelId];
		}
		await this.saveToStorage();
	}

	/**
	 * Get load balance enabled state for provider
	 */
	getLoadBalanceEnabled(provider: string): boolean {
		// Default to true for antigravity to enable automatic account switching
		const defaultValue = provider === ProviderKey.Antigravity;
		return this.routingConfig[provider]?.loadBalanceEnabled ?? defaultValue;
	}

	/**
	 * Update load balance state for provider
	 */
	async setLoadBalanceEnabled(
		provider: string,
		enabled: boolean,
	): Promise<void> {
		const routing = this.ensureProviderRoutingConfig(provider);
		routing.loadBalanceEnabled = enabled;
		await this.saveToStorage();
	}

	/**
	 * Ensure provider routing config exists
	 */
	private ensureProviderRoutingConfig(provider: string): ProviderRoutingConfig {
		if (!this.routingConfig[provider]) {
			this.routingConfig[provider] = {
				modelAssignments: {},
				loadBalanceEnabled: false,
			};
		} else if (!this.routingConfig[provider].modelAssignments) {
			this.routingConfig[provider].modelAssignments = {};
		}
		return this.routingConfig[provider];
	}

	/**
	 * Check whether provider supports multi-account
	 */
	static supportsMultiAccount(provider: string): boolean {
		const config = AccountManager.providerConfigs.get(provider);
		return config?.supportsMultiAccount ?? true;
	}

	/**
	 * Get provider configuration
	 */
	static getProviderConfig(provider: string): ProviderAccountConfig {
		return (
			AccountManager.providerConfigs.get(provider) ?? {
				supportsMultiAccount: true,
				supportsOAuth: false,
				supportsApiKey: true,
			}
		);
	}

	/**
	 * Register new provider configuration
	 */
	static registerProviderConfig(
		provider: string,
		config: ProviderAccountConfig,
	): void {
		AccountManager.providerConfigs.set(provider, config);
	}

	/**
	 * Check whether account is expired
	 */
	isAccountExpired(accountId: string): boolean {
		const account = this.accounts.get(accountId);
		if (!account || !account.expiresAt) {
			return false;
		}
		return new Date(account.expiresAt) < new Date();
	}

	/**
	 * Mark account as expired
	 */
	async markAccountExpired(accountId: string): Promise<void> {
		await this.updateAccount(accountId, { status: "expired" });
	}

	/**
	 * Mark account as error
	 */
	async markAccountError(accountId: string, error?: string): Promise<void> {
		await this.updateAccount(accountId, {
			status: "error",
			metadata: { ...this.accounts.get(accountId)?.metadata, lastError: error },
		});
	}

	/**
	 * Check if account is currently quota-limited
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
	 * Get remaining quota cooldown time (ms)
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
	 * Get list of available accounts (not quota-limited) for provider
	 */
	getAvailableAccountsForProvider(provider: string): Account[] {
		const accounts = this.getAccountsByProvider(provider);
		return accounts.filter(
			(acc) =>
				acc.status === "active" &&
				!this.isAccountExpired(acc.id) &&
				!this.isAccountQuotaLimited(acc.id),
		);
	}

	/**
	 * Get next available account for provider (round-robin or priority)
	 */
	getNextAvailableAccount(
		provider: string,
		currentAccountId?: string,
	): Account | undefined {
		const availableAccounts = this.getAvailableAccountsForProvider(provider);

		if (availableAccounts.length === 0) {
			// No available accounts, return account with the shortest cooldown
			try {
				const quotaCache = AccountQuotaCache.getInstance();
				const shortestCooldownId =
					quotaCache.getAccountWithShortestCooldown(provider);
				if (shortestCooldownId) {
					return this.accounts.get(shortestCooldownId);
				}
			} catch {
				// Ignore
			}
			return undefined;
		}

		if (availableAccounts.length === 0) {
			// No available accounts, return account with the shortest cooldown
			try {
				const quotaCache = AccountQuotaCache.getInstance();
				const shortestCooldownId =
					quotaCache.getAccountWithShortestCooldown(provider);
				if (shortestCooldownId) {
					return this.accounts.get(shortestCooldownId);
				}
			} catch {
				// Ignore
			}
			return undefined;
		}

		// If currentAccountId exists, find the next account in the list
		if (currentAccountId) {
			const currentIndex = availableAccounts.findIndex(
				(acc) => acc.id === currentAccountId,
			);
			if (currentIndex >= 0 && currentIndex < availableAccounts.length - 1) {
				return availableAccounts[currentIndex + 1];
			}
		}

		// Return the first available account
		return availableAccounts[0];
	}

	/**
	 * Dispose
	 */
	dispose(): void {
		this._onAccountChange.dispose();
	}
}
