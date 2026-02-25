/**
 * Copilot ++ Settings Page
 * Trang cài đặt riêng cho Copilot ++ với giao diện hiện đại
 */

import * as vscode from "vscode";
import { AccountManager } from "../accounts/accountManager";
import type { ApiKeyCredentials } from "../accounts/types";
import { ProviderRegistry } from "../utils/providerRegistry";
import { ProviderWizard } from "../utils/providerWizard";
import { antigravityLoginCommand, codexLoginCommand } from "../utils";
import settingsPageCss from "./settingsPage.css?raw";
import settingsPageJs from "./settingsPage.js?raw";

/**
 * Provider info for settings page
 */
interface ProviderInfo {
	id: string;
	displayName: string;
	category: string;
	sdkMode?: string;
	icon?: string;
	description?: string;
	settingsPrefix?: string;
	accountCount: number;
	supportsLoadBalance: boolean;
	supportsApiKey: boolean;
	supportsOAuth: boolean;
	supportsBaseUrl: boolean;
	supportsConfigWizard: boolean;
	hasApiKey: boolean;
	baseUrl: string;
	endpoint: string;
}

/**
 * Load balance strategy type
 */
type LoadBalanceStrategy = "round-robin" | "quota-aware" | "failover";

/**
 * Settings Page class
 * Manage the Copilot ++ settings page via webview
 */
export class SettingsPage {
	private static readonly LOAD_BALANCE_STRATEGY_STORAGE_KEY =
		"chp.settings.loadBalanceStrategies";
	private static readonly VALID_LOAD_BALANCE_STRATEGIES: LoadBalanceStrategy[] =
		["round-robin", "quota-aware", "failover"];
	private static currentPanel: vscode.WebviewPanel | undefined;
	private static context: vscode.ExtensionContext;
	private static accountManager: AccountManager;
	private static strategiesLoaded = false;

	// Store strategies in memory (persisted to globalState)
	private static loadBalanceStrategies: Record<string, LoadBalanceStrategy> =
		{};

	/**
	 * Hiển thị trang settings
	 */
	static async show(context: vscode.ExtensionContext): Promise<void> {
		SettingsPage.context = context;

		// Nếu panel đã tồn tại, focus vào nó
		if (SettingsPage.currentPanel) {
			SettingsPage.currentPanel.reveal(vscode.ViewColumn.One);
			return;
		}

		// Lấy AccountManager instance
		try {
			SettingsPage.accountManager = AccountManager.getInstance();
			await SettingsPage.accountManager.waitUntilReady();
		} catch {
			vscode.window.showErrorMessage("Account Manager not initialized");
			return;
		}

		await SettingsPage.ensureStrategiesLoaded();

		// Tạo webview panel mới
		const panel = vscode.window.createWebviewPanel(
			"chpSettings",
			"Copilot ++ Settings",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, "src", "ui"),
				],
			},
		);

		SettingsPage.currentPanel = panel;

		// Generate HTML content
		panel.webview.html = SettingsPage.generateHTML(panel.webview);

		// Handle messages from webview
		const messageDisposable = panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case "setLoadBalance":
						await SettingsPage.handleSetLoadBalance(
							message.providerId,
							message.enabled,
							panel.webview,
						);
						break;
					case "setLoadBalanceStrategy":
						await SettingsPage.handleSetLoadBalanceStrategy(
							message.providerId,
							message.strategy,
							panel.webview,
						);
						break;
					case "openAccountManager":
						await vscode.commands.executeCommand("chp.accounts.openManager");
						break;
					case "openProviderSettings":
						await SettingsPage.handleOpenProviderSettings(message.providerId);
						break;
					case "runProviderWizard":
						await SettingsPage.handleRunProviderWizard(
							message.providerId,
							panel.webview,
						);
						break;
					case "saveProviderSettings":
						await SettingsPage.handleSaveProviderSettings(
							message.providerId,
							message.payload,
							panel.webview,
						);
						break;
					case "refresh":
						await SettingsPage.sendStateUpdate(panel.webview);
						break;
				}
			},
		);

		// Handle panel dispose
		panel.onDidDispose(() => {
			SettingsPage.currentPanel = undefined;
			messageDisposable.dispose();
		});

		// Send initial state
		await SettingsPage.sendStateUpdate(panel.webview);
	}

	/**
	 * Generate HTML for the settings page
	 */
	private static generateHTML(webview: vscode.Webview): string {
		const cspSource = webview.cspSource || "";

		return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Copilot ++ Settings</title>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'unsafe-inline' ${cspSource};" />
        <style>
            ${settingsPageCss}
        </style>
    </head>
    <body>
        <div class="settings-container">
            <div id="app">
                <div class="settings-header">
                    <h1>
                        <span class="icon"></span>
                        Copilot ++ Settings
                    </h1>
                    <p>Loading settings...</p>
                </div>
                <div style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        </div>
        <script>
            ${settingsPageJs}
        </script>
    </body>
</html>`;
	}

	/**
	 * Send state update to webview
	 */
	private static async sendStateUpdate(webview: vscode.Webview): Promise<void> {
		const providers = await SettingsPage.getProvidersInfo();
		const loadBalanceSettings: Record<string, boolean> = {};
		const loadBalanceStrategies: Record<string, string> = {};

		for (const provider of providers) {
			loadBalanceSettings[provider.id] =
				SettingsPage.accountManager.getLoadBalanceEnabled(provider.id);
			loadBalanceStrategies[provider.id] =
				SettingsPage.loadBalanceStrategies[provider.id] || "round-robin";
		}

		// Send initial data
		webview.postMessage({
			command: "updateState",
			data: {
				providers,
				loadBalanceSettings,
				loadBalanceStrategies,
			},
		});

		// Post a second message to handle webview scripts that initialize a bit later
		setTimeout(() => {
			webview.postMessage({
				command: "updateState",
				data: {
					providers,
					loadBalanceSettings,
					loadBalanceStrategies,
				},
			});
		}, 100);
	}

	/**
	 * Get providers info for display
	 */
	private static async getProvidersInfo(): Promise<ProviderInfo[]> {
		const providerConfigs = ProviderRegistry.getAllProviders();
		const configSection = vscode.workspace.getConfiguration("chp");

		return Promise.all(providerConfigs.map(async (config) => {
			const accounts = SettingsPage.accountManager.getAccountsByProvider(
				config.id,
			);
			const activeApiKey = await SettingsPage.accountManager.getActiveApiKey(
				config.id,
			);
			return {
				id: config.id,
				displayName: config.displayName,
				category: config.category,
				sdkMode: config.sdkMode,
				icon: config.icon,
				description: config.description,
				settingsPrefix: config.settingsPrefix,
				accountCount: accounts.length,
				supportsLoadBalance: AccountManager.supportsMultiAccount(config.id),
				supportsApiKey: config.features.supportsApiKey,
				supportsOAuth: config.features.supportsOAuth,
				supportsBaseUrl: config.features.supportsBaseUrl,
				supportsConfigWizard: config.features.supportsConfigWizard,
				hasApiKey: !!activeApiKey,
				baseUrl: configSection.get<string>(`${config.id}.baseUrl`, "").trim(),
				endpoint: SettingsPage.getEndpointSetting(config.id, configSection),
			};
		}));
	}

	private static getEndpointSetting(
		providerId: string,
		configSection?: vscode.WorkspaceConfiguration,
	): string {
		const config = configSection || vscode.workspace.getConfiguration("chp");
		if (providerId === "zhipu") {
			return config.get<string>("zhipu.endpoint", "open.bigmodel.cn");
		}
		if (providerId === "minimax") {
			return config.get<string>("minimax.endpoint", "minimaxi.com");
		}
		return "";
	}

	private static async handleSaveProviderSettings(
		providerId: string,
		payload: { apiKey?: string; baseUrl?: string; endpoint?: string },
		webview: vscode.Webview,
	): Promise<void> {
		try {
			const provider = ProviderRegistry.getProvider(providerId);
			if (!provider) {
				throw new Error(`Unknown provider: ${providerId}`);
			}

			const config = vscode.workspace.getConfiguration("chp");

			if (provider.features.supportsApiKey && payload.apiKey !== undefined) {
				await SettingsPage.upsertProviderApiKey(
					providerId,
					provider.displayName,
					payload.apiKey,
				);
			}

			if (provider.features.supportsBaseUrl && payload.baseUrl !== undefined) {
				await config.update(
					`${providerId}.baseUrl`,
					payload.baseUrl.trim(),
					vscode.ConfigurationTarget.Global,
				);
			}

			if (payload.endpoint !== undefined) {
				if (providerId === "zhipu") {
					await config.update(
						"zhipu.endpoint",
						payload.endpoint,
						vscode.ConfigurationTarget.Global,
					);
				} else if (providerId === "minimax") {
					await config.update(
						"minimax.endpoint",
						payload.endpoint,
						vscode.ConfigurationTarget.Global,
					);
				}
			}

			await SettingsPage.sendStateUpdate(webview);
			webview.postMessage({
				command: "showToast",
				message: `${provider.displayName} settings saved`,
				type: "success",
			});
		} catch (error) {
			webview.postMessage({
				command: "showToast",
				message: `Failed to save settings: ${error}`,
				type: "error",
			});
		}
	}

	private static async upsertProviderApiKey(
		providerId: string,
		displayName: string,
		apiKeyRaw: string,
	): Promise<void> {
		const apiKey = apiKeyRaw.trim();
		const activeAccount = SettingsPage.accountManager.getActiveAccount(providerId);

		if (!apiKey) {
			if (activeAccount?.authType === "apiKey") {
				await SettingsPage.accountManager.removeAccount(activeAccount.id);
			}
			return;
		}

		if (activeAccount?.authType === "apiKey") {
			const existing = await SettingsPage.accountManager.getCredentials(
				activeAccount.id,
			);
			const previous =
				existing && "apiKey" in existing
					? existing
					: ({ apiKey } as ApiKeyCredentials);
			const updated: ApiKeyCredentials = {
				...previous,
				apiKey,
			};
			await SettingsPage.accountManager.updateCredentials(activeAccount.id, updated);
			return;
		}

		const added = await SettingsPage.accountManager.addApiKeyAccount(
			providerId,
			`${displayName} API Key`,
			apiKey,
		);
		if (!added.success || !added.account) {
			throw new Error(added.error || "Failed to create API key account");
		}
		await SettingsPage.accountManager.switchAccount(providerId, added.account.id);
	}

	private static async handleOpenProviderSettings(
		providerId: string,
	): Promise<void> {
		const query = `chp.${providerId}`;
		await vscode.commands.executeCommand(
			"workbench.action.openSettings",
			query,
		);
	}

	private static async handleRunProviderWizard(
		providerId: string,
		webview: vscode.Webview,
	): Promise<void> {
		try {
			// Special case for Codex - use the codex login command
			if (providerId === "codex") {
				await codexLoginCommand();
				return;
			}

			// Special case for Antigravity - use the antigravity login command
			if (providerId === "antigravity") {
				await antigravityLoginCommand();
				return;
			}

			// Get provider config to determine wizard capabilities
			const config = ProviderRegistry.getProvider(providerId);
			if (!config) {
				throw new Error("Provider not found");
			}
			// Use the generic ProviderWizard which works for any provider
			await ProviderWizard.startWizard({
				providerKey: providerId,
				displayName: config.displayName,
				supportsApiKey: config.features.supportsApiKey,
				supportsBaseUrl: config.features.supportsBaseUrl,
			});
		} catch {
			// Fallback to opening VS Code settings if wizard fails
			await SettingsPage.handleOpenProviderSettings(providerId);
			webview.postMessage({
				command: "showToast",
				message: `Wizard unavailable for ${providerId}. Opened settings instead.`,
				type: "success",
			});
		}
	}

	/**
	 * Handle set load balance request
	 */
	private static async handleSetLoadBalance(
		providerId: string,
		enabled: boolean,
		webview: vscode.Webview,
	): Promise<void> {
		try {
			await SettingsPage.accountManager.setLoadBalanceEnabled(
				providerId,
				enabled,
			);
			await SettingsPage.sendStateUpdate(webview);

			webview.postMessage({
				command: "showToast",
				message: `Load balancing ${enabled ? "enabled" : "disabled"} for ${providerId}`,
				type: "success",
			});
		} catch (error) {
			webview.postMessage({
				command: "showToast",
				message: `Failed to update load balance setting: ${error}`,
				type: "error",
			});
		}
	}

	/**
	 * Handle set load balance strategy request
	 */
	private static async handleSetLoadBalanceStrategy(
		providerId: string,
		strategy: LoadBalanceStrategy,
		webview: vscode.Webview,
	): Promise<void> {
		try {
			if (!SettingsPage.isValidStrategy(strategy)) {
				throw new Error(`Invalid load balance strategy: ${strategy}`);
			}

			SettingsPage.loadBalanceStrategies[providerId] = strategy;
			await SettingsPage.saveStrategiesToStorage();
			await SettingsPage.sendStateUpdate(webview);

			// TODO: Implement actual strategy change in AccountManager if needed
			// await SettingsPage.accountManager.setLoadBalanceStrategy(providerId, strategy);

			webview.postMessage({
				command: "showToast",
				message: `Strategy changed to ${strategy} for ${providerId}`,
				type: "success",
			});
		} catch (error) {
			webview.postMessage({
				command: "showToast",
				message: `Failed to update strategy: ${error}`,
				type: "error",
			});
		}
	}

	private static isValidStrategy(
		strategy: unknown,
	): strategy is LoadBalanceStrategy {
		return SettingsPage.VALID_LOAD_BALANCE_STRATEGIES.includes(
			strategy as LoadBalanceStrategy,
		);
	}

	private static normalizeStrategy(strategy: unknown): LoadBalanceStrategy {
		if (SettingsPage.isValidStrategy(strategy)) {
			return strategy;
		}
		return "round-robin";
	}

	private static async ensureStrategiesLoaded(): Promise<void> {
		if (SettingsPage.strategiesLoaded) {
			return;
		}

		const stored = SettingsPage.context.globalState.get<
			Record<string, unknown>
		>(SettingsPage.LOAD_BALANCE_STRATEGY_STORAGE_KEY, {});

		const normalized: Record<string, LoadBalanceStrategy> = {};
		for (const [providerId, rawStrategy] of Object.entries(stored || {})) {
			normalized[providerId] = SettingsPage.normalizeStrategy(rawStrategy);
		}

		SettingsPage.loadBalanceStrategies = normalized;
		SettingsPage.strategiesLoaded = true;
	}

	private static async saveStrategiesToStorage(): Promise<void> {
		await SettingsPage.context.globalState.update(
			SettingsPage.LOAD_BALANCE_STRATEGY_STORAGE_KEY,
			SettingsPage.loadBalanceStrategies,
		);
	}

	/**
	 * Dispose the current panel
	 */
	static dispose(): void {
		if (SettingsPage.currentPanel) {
			SettingsPage.currentPanel.dispose();
			SettingsPage.currentPanel = undefined;
		}
	}
}

/**
 * Register settings page command
 */
export function registerSettingsPageCommand(
	context: vscode.ExtensionContext,
): vscode.Disposable {
	return vscode.commands.registerCommand("chp.openSettings", async () => {
		await SettingsPage.show(context);
	});
}
