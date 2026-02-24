/**
 * Copilot ++ Settings Page
 * Trang cài đặt riêng cho Copilot ++ với giao diện hiện đại
 */

import * as vscode from "vscode";
import { AccountManager } from "../accounts/accountManager";
import settingsPageCss from "./settingsPage.css?raw";
import settingsPageJs from "./settingsPage.js?raw";

/**
 * Provider info for settings page
 */
interface ProviderInfo {
	id: string;
	displayName: string;
	accountCount: number;
	supportsLoadBalance: boolean;
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
	private static readonly VALID_LOAD_BALANCE_STRATEGIES: LoadBalanceStrategy[] = [
		"round-robin",
		"quota-aware",
		"failover",
	];
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
		const providers = SettingsPage.getProvidersInfo();
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
	private static getProvidersInfo(): ProviderInfo[] {
		const providerConfigs: Array<{ id: string; displayName: string }> = [
			{ id: "antigravity", displayName: "Antigravity (Google Cloud Code)" },
			{ id: "codex", displayName: "Codex (OpenAI Codex)" },
			{ id: "zhipu", displayName: "ZhipuAI (GLM)" },
			{ id: "moonshot", displayName: "MoonshotAI (Kimi)" },
			{ id: "minimax", displayName: "MiniMax" },
			{ id: "deepseek", displayName: "DeepSeek" },
			{ id: "deepinfra", displayName: "DeepInfra" },
			{ id: "nvidia", displayName: "NVIDIA NIM" },
			{ id: "compatible", displayName: "OpenAI/Anthropic Compatible" },
		];

		return providerConfigs.map((config) => {
			const accounts = SettingsPage.accountManager.getAccountsByProvider(
				config.id,
			);
			return {
				id: config.id,
				displayName: config.displayName,
				accountCount: accounts.length,
				supportsLoadBalance: AccountManager.supportsMultiAccount(config.id),
			};
		});
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
