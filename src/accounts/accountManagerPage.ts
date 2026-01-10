/*---------------------------------------------------------------------------------------------
 *  Account Manager Page
 *  WebView-based UI for managing multiple accounts
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ProviderKey } from "../types/providerKeys";
import accountManagerCss from "../ui/accountManager.css?raw";
import accountManagerJs from "../ui/accountManager.js?raw";
import { Logger } from "../utils/logger";
import { AccountManager } from "./accountManager";
import { AccountQuotaCache } from "./accountQuotaCache";

/**
 * Provider info for UI
 *
 */
interface ProviderInfo {
	id: string;
	name: string;
	authType: "oauth" | "apiKey";
}

interface AntigravityQuotaNotice {
	resetAt: number;
	modelName?: string;
	accountId?: string;
	accountName?: string;
}

/**
 * Account Manager Page - WebView-based account management
 */
export class AccountManagerPage {
	private static instance: AccountManagerPage | undefined;
	private static antigravityQuotaNotice: AntigravityQuotaNotice | null = null;
	private panel: vscode.WebviewPanel | undefined;
	private accountManager: AccountManager;
	private disposables: vscode.Disposable[] = [];

	/** Available providers */
	private static readonly providers: ProviderInfo[] = [
		{ id: "antigravity", name: "Antigravity (Google)", authType: "oauth" },
		{ id: "codex", name: "Codex (OpenAI)", authType: "oauth" },
		{ id: "zhipu", name: "ZhipuAI", authType: "apiKey" },
		{ id: "moonshot", name: "MoonshotAI", authType: "apiKey" },
		{ id: "minimax", name: "MiniMax", authType: "apiKey" },
		{ id: "deepseek", name: "DeepSeek", authType: "apiKey" },
		{ id: "deepinfra", name: "DeepInfra", authType: "apiKey" },
		{ id: "compatible", name: "Compatible (Custom)", authType: "apiKey" },
	];

	private constructor() {
		this.accountManager = AccountManager.getInstance();

		// Listen for account changes
		this.disposables.push(
			this.accountManager.onAccountChange(() => {
				this.refreshWebview();
			}),
		);

		// Listen for quota state changes
		const quotaCache = AccountQuotaCache.getInstance();
		this.disposables.push(
			quotaCache.onQuotaStateChange((event) => {
				this.sendQuotaStateUpdate(event);
			}),
		);
	}

	/**
	 * Send quota state update to webview
	 */
	private sendQuotaStateUpdate(event: {
		accountId: string;
		provider: string;
		state: import("./accountQuotaCache").AccountQuotaState;
	}): void {
		if (this.panel) {
			this.sendToWebview({
				command: "updateAccountQuotaState",
				accountId: event.accountId,
				provider: event.provider,
				state: {
					accountId: event.state.accountId,
					accountName: event.state.accountName,
					provider: event.state.provider,
					quotaExceeded: event.state.quotaExceeded,
					quotaResetAt: event.state.quotaResetAt,
					affectedModel: event.state.affectedModel,
					lastError: event.state.lastError,
					successCount: event.state.successCount,
					failureCount: event.state.failureCount,
					lastSuccessAt: event.state.lastSuccessAt,
					lastFailureAt: event.state.lastFailureAt,
					updatedAt: event.state.updatedAt,
				},
			});
		}
	}

	/**
	 * Get or create instance
	 */
	static getInstance(): AccountManagerPage {
		if (!AccountManagerPage.instance) {
			AccountManagerPage.instance = new AccountManagerPage();
		}
		return AccountManagerPage.instance;
	}

	/**
	 * Show the Account Manager page
	 */
	async show(context?: vscode.ExtensionContext): Promise<void> {
		if (this.panel) {
			// If panel exists, reveal it
			this.panel.reveal(vscode.ViewColumn.One);
			return;
		}

		// Get extension context for resource URIs
		const extensionUri =
			context?.extensionUri || vscode.Uri.file(`${__dirname}/../..`);

		// Create new panel
		this.panel = vscode.window.createWebviewPanel(
			"chpAccountManager",
			"Account Manager",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, "images")],
			},
		);

		// Set icon - use undefined as ThemeIcon is not supported for iconPath
		// this.panel.iconPath = new vscode.ThemeIcon('account');

		// Generate HTML with webview URIs for images
		const imageUris = this.getImageUris(this.panel.webview, extensionUri);
		this.panel.webview.html = this.generateHTML(imageUris);

		// Handle messages from webview
		this.panel.webview.onDidReceiveMessage(
			async (message) => {
				await this.handleMessage(message);
			},
			undefined,
			this.disposables,
		);

		// Handle panel disposal
		this.panel.onDidDispose(
			() => {
				this.panel = undefined;
			},
			undefined,
			this.disposables,
		);

		Logger.info("Account Manager page opened");
	}

	static updateAntigravityQuotaNotice(
		notice: AntigravityQuotaNotice | null,
	): void {
		AccountManagerPage.antigravityQuotaNotice = notice;

		if (AccountManagerPage.instance?.panel) {
			AccountManagerPage.instance.sendToWebview({
				command: "updateAntigravityQuota",
				notice,
			});
		}
	}

	/**
	 * Get webview URIs for provider images
	 */
	private getImageUris(
		webview: vscode.Webview,
		extensionUri: vscode.Uri,
	): Record<string, string> {
		const imageUris: Record<string, string> = {};

		// Map provider IDs to image filenames
		const imageFiles: Record<string, string> = {
			codex: "codex.png",
			deepseek: "deepseek.png",
			zhipu: "z-ai.svg",
		};

		for (const [providerId, filename] of Object.entries(imageFiles)) {
			const imageUri = vscode.Uri.joinPath(extensionUri, "images", filename);
			imageUris[providerId] = webview.asWebviewUri(imageUri).toString();
		}

		return imageUris;
	}

	/**
	 * Generate HTML for the webview
	 */
	private generateHTML(imageUris: Record<string, string> = {}): string {
		let accountsJson = "[]";
		let providersJson = "[]";
		let antigravityQuotaJson = "null";
		let accountQuotaStatesJson = "[]";
		let codexRateLimitsJson = "[]";

		try {
			const accounts = this.accountManager.getAllAccounts();
			accountsJson = JSON.stringify(accounts);
		} catch (e) {
			Logger.error("Failed to get accounts:", e);
		}

		try {
			providersJson = JSON.stringify(AccountManagerPage.providers);
		} catch (e) {
			Logger.error("Failed to serialize providers:", e);
		}

		try {
			antigravityQuotaJson = JSON.stringify(
				AccountManagerPage.antigravityQuotaNotice,
			);
		} catch (e) {
			Logger.error("Failed to serialize antigravity quota:", e);
		}

		// Get account quota states from cache
		try {
			const accountQuotaCache = AccountQuotaCache.getInstance();
			const accountQuotaStates = accountQuotaCache.getAllStates();
			accountQuotaStatesJson = JSON.stringify(
				accountQuotaStates.map((state) => ({
					accountId: state.accountId,
					accountName: state.accountName,
					provider: state.provider,
					quotaExceeded: state.quotaExceeded,
					quotaResetAt: state.quotaResetAt,
					affectedModel: state.affectedModel,
					lastError: state.lastError,
					successCount: state.successCount,
					failureCount: state.failureCount,
					lastSuccessAt: state.lastSuccessAt,
					lastFailureAt: state.lastFailureAt,
					updatedAt: state.updatedAt,
				})),
			);
		} catch (e) {
			Logger.error("Failed to get account quota states:", e);
		}

		try {
			codexRateLimitsJson = "[]";
		} catch (e) {
			Logger.error("Failed to get codex rate limits:", e);
		}

		return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Account Manager</title>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
        <style>
            ${accountManagerCss}
        </style>
    </head>
    <body>
        <div class="container">
            <div id="app">
                <div class="empty-state">
                    <div class="loading-spinner"></div>
                    <p>Loading...</p>
                </div>
            </div>
        </div>
        <script>
            ${accountManagerJs}

            // Initialize with data
            const initialAccounts = ${accountsJson};
            const initialProviders = ${providersJson};
            const initialAntigravityQuota = ${antigravityQuotaJson};
            const initialCodexRateLimits = ${codexRateLimitsJson};
            const initialAccountQuotaStates = ${accountQuotaStatesJson};
            const initialProviderImageUris = ${JSON.stringify(imageUris)};

            // Always wait for DOM to be fully ready
            function safeInitialize() {
                try {
                    console.log('[AccountManager] Starting initialization...');
                    initializeAccountManager(initialAccounts, initialProviders, initialAntigravityQuota, initialCodexRateLimits, initialAccountQuotaStates, initialProviderImageUris);
                    console.log('[AccountManager] Initialization complete');
                } catch (error) {
                    console.error('[AccountManager] Initialization error:', error);
                    const app = document.getElementById('app');
                    if (app) {
                        app.innerHTML = '<div class="empty-state"><p style="color: red;">Error: ' + (error.message || error) + '</p></div>';
                    }
                }
            }
            
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', safeInitialize);
            } else {
                // DOM is already ready, but use setTimeout to ensure all scripts are loaded
                setTimeout(safeInitialize, 0);
            }
        </script>
    </body>
</html>`;
	}

	/**
	 * Handle messages from webview
	 */
	private async handleMessage(message: {
		command: string;
		[key: string]: unknown;
	}): Promise<void> {
		switch (message.command) {
			case "addApiKeyAccount":
				await this.handleAddApiKeyAccount(
					message.provider as string,
					message.displayName as string,
					message.apiKey as string,
					message.endpoint as string | undefined,
				);
				break;

			case "addOAuthAccount":
				await this.handleAddOAuthAccount(message.provider as string);
				break;

			case "setDefaultAccount":
				await this.handleSetDefaultAccount(message.accountId as string);
				break;

			case "deleteAccount":
				await this.handleDeleteAccount(message.accountId as string);
				break;

			case "refresh":
				this.refreshWebview();
				break;

			case "openSettings":
				await vscode.commands.executeCommand("chp.openSettings");
				break;

			case "checkQuota":
				await this.handleCheckQuota(message.accountId as string);
				break;
		}
	}

	/**
	 * Handle adding API key account
	 */
	private async handleAddApiKeyAccount(
		provider: string,
		displayName: string,
		apiKey: string,
		endpoint?: string,
	): Promise<void> {
		try {
			const result = await this.accountManager.addApiKeyAccount(
				provider,
				displayName,
				apiKey,
				{ endpoint },
			);

			if (result.success) {
				this.sendToWebview({
					command: "showToast",
					message: `Account "${displayName}" added successfully!`,
					type: "success",
				});
				this.refreshWebview();
			} else {
				this.sendToWebview({
					command: "showToast",
					message: `Failed to add account: ${result.error}`,
					type: "error",
				});
			}
		} catch (error) {
			Logger.error("Failed to add API key account:", error);
			this.sendToWebview({
				command: "showToast",
				message: "Failed to add account. Please try again.",
				type: "error",
			});
		}
	}

	/**
	 * Handle adding OAuth account
	 */
	private async handleAddOAuthAccount(provider: string): Promise<void> {
		try {
			if (provider === ProviderKey.Antigravity) {
				// Import and call the login function directly to force add new account
				const { doAntigravityLoginForNewAccount } = await import(
					"../providers/antigravity/auth.js"
				);
				await doAntigravityLoginForNewAccount();
				this.refreshWebview();
			} else if (provider === ProviderKey.Codex) {
				// Import and call the Codex login function
				const { doCodexLoginForNewAccount } = await import(
					"../providers/codex/codexAuth.js"
				);
				await doCodexLoginForNewAccount();
				this.refreshWebview();
			}
		} catch (error) {
			Logger.error("OAuth login failed:", error);
			this.sendToWebview({
				command: "showToast",
				message: "OAuth login failed. Please try again.",
				type: "error",
			});
		}
	}

	/**
	 * Handle setting default account
	 */
	private async handleSetDefaultAccount(accountId: string): Promise<void> {
		try {
			const account = this.accountManager.getAccount(accountId);
			if (!account) {
				this.sendToWebview({
					command: "showToast",
					message: "Account not found",
					type: "error",
				});
				return;
			}

			await this.accountManager.switchAccount(account.provider, accountId);
			this.sendToWebview({
				command: "showToast",
				message: `"${account.displayName}" is now the default account`,
				type: "success",
			});
			this.refreshWebview();
		} catch (error) {
			Logger.error("Failed to set default account:", error);
			this.sendToWebview({
				command: "showToast",
				message: "Failed to set default account",
				type: "error",
			});
		}
	}

	/**
	 * Handle checking quota for an account
	 */
	private async handleCheckQuota(accountId: string): Promise<void> {
		try {
			const account = this.accountManager.getAccount(accountId);
			if (!account) {
				this.sendToWebview({
					command: "quotaCheckResult",
					accountId,
					success: false,
					error: "Account not found",
				});
				return;
			}

			// Only check quota for Antigravity accounts
			if (account.provider !== ProviderKey.Antigravity) {
				this.sendToWebview({
					command: "quotaCheckResult",
					accountId,
					success: true,
					message: "Quota check not needed for this provider",
				});
				return;
			}

			// Save current account to restore later
			const currentAccount = this.accountManager.getActiveAccount(
				account.provider,
			);
			const currentAccountId = currentAccount?.id;

			// IMPORTANT: Temporarily switch to the target account to check its quota
			await this.accountManager.switchAccount(account.provider, accountId);

			// Trigger quota refresh by executing the refresh command
			await vscode.commands.executeCommand(
				"chp.antigravity.refreshAndShowQuota",
			);

			// Wait a bit for the refresh to complete
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Restore original account after checking quota
			if (currentAccountId && currentAccountId !== accountId) {
				await this.accountManager.switchAccount(
					account.provider,
					currentAccountId,
				);
			}

			this.sendToWebview({
				command: "quotaCheckResult",
				accountId,
				success: true,
				message: "Quota refresh triggered",
			});
		} catch (error) {
			Logger.error("Failed to check quota:", error);
			this.sendToWebview({
				command: "quotaCheckResult",
				accountId,
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	/**
	 * Handle deleting account
	 */
	private async handleDeleteAccount(accountId: string): Promise<void> {
		try {
			const account = this.accountManager.getAccount(accountId);
			const displayName = account?.displayName || "Account";

			const success = await this.accountManager.removeAccount(accountId);
			if (success) {
				this.sendToWebview({
					command: "showToast",
					message: `"${displayName}" has been deleted`,
					type: "success",
				});
				this.refreshWebview();
			} else {
				this.sendToWebview({
					command: "showToast",
					message: "Failed to delete account",
					type: "error",
				});
			}
		} catch (error) {
			Logger.error("Failed to delete account:", error);
			this.sendToWebview({
				command: "showToast",
				message: "Failed to delete account",
				type: "error",
			});
		}
	}

	/**
	 * Refresh webview with latest data
	 */
	private refreshWebview(): void {
		if (!this.panel) {
			return;
		}

		const accounts = this.accountManager.getAllAccounts();
		this.sendToWebview({
			command: "updateAccounts",
			accounts: accounts,
		});
	}

	/**
	 * Send message to webview
	 */
	private sendToWebview(message: object): void {
		if (this.panel) {
			this.panel.webview.postMessage(message);
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.panel) {
			this.panel.dispose();
		}
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
		AccountManagerPage.instance = undefined;
	}
}

/**
 * Register Account Manager Page command
 */
export function registerAccountManagerPageCommand(
	context: vscode.ExtensionContext,
): vscode.Disposable {
	return vscode.commands.registerCommand("chp.accounts.openManager", () => {
		const page = AccountManagerPage.getInstance();
		page.show(context);
	});
}
