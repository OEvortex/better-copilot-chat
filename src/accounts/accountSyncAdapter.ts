/*---------------------------------------------------------------------------------------------
 *  Account Sync Adapter
 *  Sync between AccountManager and existing auth systems
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from "vscode";
import { ProviderKey } from "../types/providerKeys";
import { ApiKeyManager } from "../utils/apiKeyManager";
import { Logger } from "../utils/logger";
import { AccountManager } from "./accountManager";
import type { OAuthCredentials } from "./types";

/**
 * Adapter to sync accounts from various sources
 */
export class AccountSyncAdapter {
	private static instance: AccountSyncAdapter;
	private accountManager: AccountManager;
	private disposables: vscode.Disposable[] = [];

	private constructor() {
		this.accountManager = AccountManager.getInstance();
		this.disposables.push(
			this.accountManager.onAccountChange(async (event) => {
				try {
					if (
						event.type === "added" ||
						event.type === "switched" ||
						event.type === "updated"
					) {
						await this.syncToApiKeyManager(event.provider);
					} else if (event.type === "removed") {
						await this.handleAccountRemoval(event.provider);
					}
				} catch (error) {
					Logger.warn(
						`Failed to sync ${event.provider} to ApiKeyManager:`,
						error,
					);
				}
			}),
		);
	}

	/**
	 * Initialize adapter
	 */
	static initialize(): AccountSyncAdapter {
		if (!AccountSyncAdapter.instance) {
			AccountSyncAdapter.instance = new AccountSyncAdapter();
		}
		return AccountSyncAdapter.instance;
	}

	/**
	 * Get instance
	 */
	static getInstance(): AccountSyncAdapter {
		if (!AccountSyncAdapter.instance) {
			throw new Error("AccountSyncAdapter not initialized");
		}
		return AccountSyncAdapter.instance;
	}

	/**
	 * Sync Antigravity account from ApiKeyManager
	 */
	async syncAntigravityAccount(): Promise<void> {
		try {
			const stored = await ApiKeyManager.getApiKey(ProviderKey.Antigravity);
			if (!stored) {
				return;
			}

			const authData = JSON.parse(stored) as {
				access_token: string;
				refresh_token: string;
				email?: string;
				project_id?: string;
				expires_at: string;
			};

			// Check whether this account already exists
			const existingAccounts = this.accountManager.getAccountsByProvider(
				ProviderKey.Antigravity,
			);
			const existingByEmail = existingAccounts.find(
				(acc) => acc.email === authData.email,
			);

			if (existingByEmail) {
				// Update credentials
				const credentials: OAuthCredentials = {
					accessToken: authData.access_token,
					refreshToken: authData.refresh_token,
					expiresAt: authData.expires_at,
				};
				await this.accountManager.updateCredentials(
					existingByEmail.id,
					credentials,
				);
				Logger.debug(`Updated Antigravity account: ${authData.email}`);
			} else {
				// Add a new account
				const displayName = authData.email || "Antigravity Account";
				const credentials: OAuthCredentials = {
					accessToken: authData.access_token,
					refreshToken: authData.refresh_token,
					expiresAt: authData.expires_at,
				};

				await this.accountManager.addOAuthAccount(
					ProviderKey.Antigravity,
					displayName,
					authData.email || "",
					credentials,
					{ projectId: authData.project_id },
				);
				Logger.info(`Synced Antigravity account: ${displayName}`);
			}
		} catch (error) {
			Logger.error("Failed to sync Antigravity account:", error);
		}
	}

	/**
	 * Sync Codex account from ApiKeyManager
	 */
	async syncCodexAccount(): Promise<void> {
		try {
			const stored = await ApiKeyManager.getApiKey("codex");
			if (!stored) {
				return;
			}

			const authData = JSON.parse(stored) as {
				access_token: string;
				refresh_token: string;
				email?: string;
				expires_at: string;
			};

			// Check whether this account already exists
			const existingAccounts =
				this.accountManager.getAccountsByProvider("codex");
			const existingByEmail = existingAccounts.find(
				(acc) => acc.email === authData.email,
			);

			if (existingByEmail) {
				// Update credentials
				const credentials: OAuthCredentials = {
					accessToken: authData.access_token,
					refreshToken: authData.refresh_token,
					expiresAt: authData.expires_at,
				};
				await this.accountManager.updateCredentials(
					existingByEmail.id,
					credentials,
				);
				Logger.debug(`Updated Codex account: ${authData.email}`);
			} else {
				// Add a new account
				const displayName = authData.email || "Codex Account";
				const credentials: OAuthCredentials = {
					accessToken: authData.access_token,
					refreshToken: authData.refresh_token,
					expiresAt: authData.expires_at,
				};

				await this.accountManager.addOAuthAccount(
					"codex",
					displayName,
					authData.email || "",
					credentials,
				);
				Logger.info(`Synced Codex account: ${displayName}`);
			}
		} catch (error) {
			Logger.error("Failed to sync Codex account:", error);
		}
	}

	/**
	 * Sync API Key account from ApiKeyManager
	 */
	async syncApiKeyAccount(
		provider: string,
		displayName?: string,
	): Promise<void> {
		try {
			const apiKey = await ApiKeyManager.getApiKey(provider);
			if (!apiKey) {
				return;
			}

			// Check whether this account already exists
			const existingAccounts =
				this.accountManager.getAccountsByProvider(provider);

			if (existingAccounts.length === 0) {
				// Add a new account
				const name = displayName || `${provider} Account`;
				await this.accountManager.addApiKeyAccount(provider, name, apiKey);
				Logger.info(`Synced ${provider} account from ApiKeyManager`);
			}
		} catch (error) {
			Logger.error(`Failed to sync ${provider} account:`, error);
		}
	}

	/**
	 * Sync all accounts from ApiKeyManager
	 */
	async syncAllAccounts(): Promise<void> {
		const providers = ["zhipu", "moonshot", "minimax", "deepseek"];

		// Sync Antigravity (OAuth)
		await this.syncAntigravityAccount();

		// Sync Codex (OAuth)
		await this.syncCodexAccount();

		// Sync API Key providers
		for (const provider of providers) {
			await this.syncApiKeyAccount(provider);
		}

		// Sync active accounts back to ApiKeyManager for compatibility
		const allProviders = [
			ProviderKey.Antigravity,
			ProviderKey.Codex,
			...providers,
		];
		for (const provider of allProviders) {
			await this.syncToApiKeyManager(provider);
		}
	}

	/**
	 * When a new account is added via AccountManager,
	 * update ApiKeyManager for backward compatibility
	 */
	async syncToApiKeyManager(provider: string): Promise<void> {
		const activeCredentials =
			await this.accountManager.getActiveCredentials(provider);
		if (!activeCredentials) {
			return;
		}

		if ("apiKey" in activeCredentials) {
			await ApiKeyManager.setApiKey(provider, activeCredentials.apiKey);
		} else if (
			"accessToken" in activeCredentials &&
			provider === ProviderKey.Antigravity
		) {
			// Antigravity requires special format
			const account = this.accountManager.getActiveAccount(provider);
			const authData = {
				type: ProviderKey.Antigravity,
				access_token: activeCredentials.accessToken,
				refresh_token: activeCredentials.refreshToken,
				email: account?.email || "",
				project_id: account?.metadata?.projectId || "",
				expires_at: activeCredentials.expiresAt,
				timestamp: Date.now(),
			};
			await ApiKeyManager.setApiKey(
				ProviderKey.Antigravity,
				JSON.stringify(authData),
			);
		} else if (
			"accessToken" in activeCredentials &&
			provider === ProviderKey.Codex
		) {
			// Codex requires special format
			const account = this.accountManager.getActiveAccount(provider);

			// Get existing data to preserve account_id, organization_id, etc.
			const existingData = await ApiKeyManager.getApiKey("codex");
			let existingParsed: Record<string, unknown> = {};
			if (existingData) {
				try {
					existingParsed = JSON.parse(existingData);
				} catch (_e) {
					// Ignore parse errors
				}
			}

			const authData = {
				type: "codex",
				access_token: activeCredentials.accessToken,
				refresh_token: activeCredentials.refreshToken,
				email: account?.email || "",
				// IMPORTANT: Preserve these fields from existing storage
				account_id:
					(existingParsed.account_id as string) || account?.metadata?.accountId,
				organization_id: existingParsed.organization_id as string,
				project_id: existingParsed.project_id as string,
				organizations: existingParsed.organizations as unknown[],
				expires_at: activeCredentials.expiresAt,
				timestamp: Date.now(),
			};
			Logger.info(
				"[accountSync] Preserving Codex account/org data during sync",
			);
			await ApiKeyManager.setApiKey("codex", JSON.stringify(authData));
		}
	}

	/**
	 * When an account is removed, update or delete ApiKeyManager to avoid reverse sync
	 */
	private async handleAccountRemoval(provider: string): Promise<void> {
		const remainingAccounts =
			this.accountManager.getAccountsByProvider(provider);
		if (remainingAccounts.length === 0) {
			await ApiKeyManager.deleteApiKey(provider);
			return;
		}

		// Other accounts exist -> re-sync active account for backward compatibility
		await this.syncToApiKeyManager(provider);
	}

	/**
	 * Dispose
	 */
	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
