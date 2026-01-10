/*---------------------------------------------------------------------------------------------
 *  ZhipuAI Configuration Wizard
 *  Provides an interactive wizard to configure API key and MCP search service
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ApiKeyManager } from "../../utils/apiKeyManager";
import { ConfigManager } from "../../utils/configManager";
import { Logger } from "../../utils/logger";

export class ZhipuWizard {
	private static readonly PROVIDER_KEY = "zhipu";

	/**
	 * Start configuration wizard
	 * Directly enter settings menu, no need to check API key first
	 */
	static async startWizard(
		displayName: string,
		apiKeyTemplate: string,
	): Promise<void> {
		try {
			// Get current MCP status
			const currentMCPStatus = ConfigManager.getZhipuSearchConfig().enableMCP;
			const mcpStatusText = currentMCPStatus ? "Enabled" : "Disabled";

			// Get current endpoint
			const currentEndpoint = ConfigManager.getZhipuEndpoint();
			const endpointLabel =
				currentEndpoint === "api.z.ai"
					? "International (api.z.ai)"
					: "Domestic (open.bigmodel.cn)";

			const choice = await vscode.window.showQuickPick(
				[
					{
						label: `$(key) Modify ${displayName} API Key`,
						detail: `Set or delete ${displayName} API Key`,
						action: "updateApiKey",
					},
					{
						label: "$(plug) Enable MCP Search Mode",
						description: `Current: ${mcpStatusText}`,
						detail:
							"Use search quota in Coding Plan plan, Lite(100 trial)/Pro(1K searches)/Max(4K searches)",
						action: "toggleMCP",
					},
					{
						label: "$(globe) Set Endpoint",
						description: `Current: ${endpointLabel}`,
						detail:
							"Set ZhipuAI endpoint: Domestic (open.bigmodel.cn) or International (api.z.ai)",
						action: "endpoint",
					},
				],
				{
					title: `${displayName} Configuration Menu`,
					placeHolder: "Select action to perform",
				},
			);

			if (!choice) {
				Logger.debug("User cancelled ZhipuAI configuration wizard");
				return;
			}

			if (choice.action === "updateApiKey") {
				// Check if API key already exists
				const hasApiKey = await ApiKeyManager.hasValidApiKey(
					ZhipuWizard.PROVIDER_KEY,
				);
				if (!hasApiKey) {
					// No API key, set API key first
					Logger.debug("No API key detected, starting API key setup process");
					const apiKeySet = await ZhipuWizard.showSetApiKeyStep(
						displayName,
						apiKeyTemplate,
					);
					if (!apiKeySet) {
						// User cancelled API key setup
						Logger.debug("User cancelled API key setup");
						return;
					}
					Logger.debug(
						"API key setup successful, entering MCP search configuration",
					);

					// Configure MCP search service
					await ZhipuWizard.showMCPConfigStep(displayName);
				} else {
					// API key exists, re-set API key
					const apiKeySet = await ZhipuWizard.showSetApiKeyStep(
						displayName,
						apiKeyTemplate,
					);
					if (!apiKeySet) {
						return;
					}
				}
			} else if (choice.action === "toggleMCP") {
				await ZhipuWizard.showMCPConfigStep(displayName);
			} else if (choice.action === "endpoint") {
				await ZhipuWizard.setEndpoint(displayName);
			}
		} catch (error) {
			Logger.error(
				`ZhipuAI configuration wizard error: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Show API key setup step
	 * Allows user to enter empty value to clear API key
	 */
	private static async showSetApiKeyStep(
		displayName: string,
		apiKeyTemplate: string,
	): Promise<boolean> {
		const result = await vscode.window.showInputBox({
			prompt: `Enter ${displayName} API Key (leave empty to clear)`,
			title: `Set ${displayName} API Key`,
			placeHolder: apiKeyTemplate,
			password: true,
			validateInput: (value: string) => {
				// Allow empty value for clearing API key
				if (!value || value.trim() === "") {
					return null;
				}
				return null;
			},
		});

		// User cancelled input
		if (result === undefined) {
			return false;
		}

		try {
			// Allow empty value for clearing API key
			if (result.trim() === "") {
				Logger.info(`${displayName} API Key cleared`);
				await ApiKeyManager.deleteApiKey(ZhipuWizard.PROVIDER_KEY);
			} else {
				await ApiKeyManager.setApiKey(ZhipuWizard.PROVIDER_KEY, result.trim());
				Logger.info(`${displayName} API Key set`);
			}
			return true;
		} catch (error) {
			Logger.error(
				`API Key operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			return false;
		}
	}

	/**
	 * Show MCP search configuration step
	 */
	private static async showMCPConfigStep(displayName: string): Promise<void> {
		const choice = await vscode.window.showQuickPick(
			[
				{
					label: "$(x) Do not enable MCP Search Mode",
					detail:
						"Use Web Search API pay-as-you-go interface, use when plan quota is exhausted or advanced search features are needed",
					action: "disableMCP",
				},
				{
					label: "$(check) Enable MCP Search Mode",
					detail:
						"Use search quota in Coding Plan plan, Lite(100 trial)/Pro(1K searches)/Max(4K searches)",
					action: "enableMCP",
				},
			],
			{
				title: `${displayName} MCP Search Service Configuration Communication Mode Settings`,
				placeHolder:
					"Choose whether to enable MCP communication mode for search service",
			},
		);

		if (!choice) {
			return;
		}

		try {
			if (choice.action === "enableMCP") {
				await ZhipuWizard.setMCPConfig(true);
			} else {
				await ZhipuWizard.setMCPConfig(false);
			}
		} catch (error) {
			Logger.error(
				`MCP configuration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			vscode.window.showErrorMessage(
				`MCP configuration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Set MCP configuration
	 */
	private static async setMCPConfig(enable: boolean): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration("chp");
			await config.update(
				"zhipu.search.enableMCP",
				enable,
				vscode.ConfigurationTarget.Global,
			);
			Logger.info(
				`Zhipu MCP search service ${enable ? "enabled" : "disabled"}`,
			);
		} catch (error) {
			const errorMessage = `Failed to set MCP configuration: ${error instanceof Error ? error.message : "Unknown error"}`;
			Logger.error(errorMessage);
			throw error;
		}
	}

	/**
	 * Set endpoint
	 */
	static async setEndpoint(displayName: string): Promise<void> {
		const currentEndpoint = ConfigManager.getZhipuEndpoint();
		const endpointLabel =
			currentEndpoint === "api.z.ai"
				? "International (api.z.ai)"
				: "Domestic (open.bigmodel.cn)";

		const choice = await vscode.window.showQuickPick(
			[
				{
					label: "$(home) Domestic (open.bigmodel.cn)",
					detail: "Recommended, faster domestic access",
					value: "open.bigmodel.cn",
				},
				{
					label: "$(globe) International (api.z.ai)",
					detail:
						"Use for overseas users or when domestic site access is restricted",
					value: "api.z.ai",
				},
			],
			{
				title: `${displayName} Endpoint Selection`,
				placeHolder: `Current: ${endpointLabel}`,
			},
		);

		if (!choice) {
			return;
		}

		try {
			const config = vscode.workspace.getConfiguration("chp.zhipu");
			await config.update(
				"endpoint",
				choice.value,
				vscode.ConfigurationTarget.Global,
			);
			Logger.info(`ZhipuAI endpoint set to ${choice.value}`);
			vscode.window.showInformationMessage(
				`ZhipuAI endpoint set to ${choice.value === "api.z.ai" ? "International" : "Domestic"}`,
			);
		} catch (error) {
			const errorMessage = `Failed to set endpoint: ${error instanceof Error ? error.message : "Unknown error"}`;
			Logger.error(errorMessage);
			vscode.window.showErrorMessage(errorMessage);
		}
	}

	/**
	 * Get current MCP status
	 */
	static getMCPStatus(): boolean {
		return ConfigManager.getZhipuSearchConfig().enableMCP;
	}
}
