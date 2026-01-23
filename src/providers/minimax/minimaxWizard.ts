/*---------------------------------------------------------------------------------------------
 *  MiniMax Configuration Wizard
 *  Provides an interactive wizard to configure regular API keys and Coding Plan dedicated keys, with endpoint (site) selection support
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ApiKeyManager } from "../../utils/apiKeyManager";
import { ConfigManager, type MiniMaxConfig } from "../../utils/configManager";
import { Logger } from "../../utils/logger";
import { ProviderWizard } from "../../utils/providerWizard";

export class MiniMaxWizard {
	private static readonly PROVIDER_KEY = "minimax";
	private static readonly CODING_PLAN_KEY = "minimax-coding";

	/**
	 * Start MiniMax configuration wizard
	 * Allows users to choose which key type to configure
	 */
	static async startWizard(
		displayName: string,
		apiKeyTemplate: string,
	): Promise<void> {
		try {
			// Get current endpoint site
			const currentEndpoint = ConfigManager.getMinimaxEndpoint();
			const endpointLabel =
				currentEndpoint === "minimax.io"
					? "International (minimax.io)"
					: "China (minimaxi.com)";

			const choice = await vscode.window.showQuickPick(
				[
					{
						label: "$(key) Configure Regular API Key",
						detail: "For standard pay-as-you-go models like MiniMax-M2",
						value: "normal",
					},
					{
						label: "$(key) Configure Coding Plan Dedicated Key",
						detail: "For MiniMax-M2 (Coding Plan) model",
						value: "coding",
					},
					{
						label: "$(check-all) Configure Both Keys",
						detail: "Configure regular key and Coding Plan key in sequence",
						value: "both",
					},
					{
						label: "$(globe) Set Coding Plan Endpoint",
						description: `Current: ${endpointLabel}`,
						detail:
							"Set the endpoint site for Coding Plan: China (minimaxi.com) or International (minimax.io)",
						value: "endpoint",
					},
					{
						label: "$(globe) Configure Base URL (Proxy)",
						detail: "Override MiniMax endpoint (optional)",
						value: "baseUrl",
					},
				],
				{
					title: `${displayName} Key Configuration`,
					placeHolder: "Please select an option to configure",
				},
			);

			if (!choice) {
				Logger.debug("User cancelled MiniMax configuration wizard");
				return;
			}

			if (choice.value === "normal" || choice.value === "both") {
				await MiniMaxWizard.setNormalApiKey(displayName, apiKeyTemplate);
			}

			if (choice.value === "coding" || choice.value === "both") {
				await MiniMaxWizard.setCodingPlanApiKey(displayName, apiKeyTemplate);
			}

			if (choice.value === "endpoint") {
				await MiniMaxWizard.setCodingPlanEndpoint(displayName);
			}

			if (choice.value === "baseUrl") {
				await ProviderWizard.configureBaseUrl("minimax", displayName);
			}
		} catch (error) {
			Logger.error(
				`MiniMax configuration wizard error: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Set regular API key
	 */
	static async setNormalApiKey(
		displayName: string,
		apiKeyTemplate: string,
	): Promise<void> {
		const result = await vscode.window.showInputBox({
			prompt: `Enter ${displayName} regular API Key (leave empty to clear)`,
			title: `Set ${displayName} Regular API Key`,
			placeHolder: apiKeyTemplate,
			password: true,
			validateInput: (value: string) => {
				// Allow empty value to clear API Key
				if (!value || value.trim() === "") {
					return null;
				}
				return null;
			},
		});

		// User cancelled input
		if (result === undefined) {
			return;
		}

		try {
			// Allow empty value to clear API Key
			if (result.trim() === "") {
				Logger.info(`${displayName} regular API Key cleared`);
				await ApiKeyManager.deleteApiKey(MiniMaxWizard.PROVIDER_KEY);
				vscode.window.showInformationMessage(
					`${displayName} regular API Key cleared`,
				);
			} else {
				await ApiKeyManager.setApiKey(
					MiniMaxWizard.PROVIDER_KEY,
					result.trim(),
				);
				Logger.info(`${displayName} regular API Key set`);
				vscode.window.showInformationMessage(
					`${displayName} regular API Key set`,
				);
			}
		} catch (error) {
			Logger.error(
				`Regular API Key operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			vscode.window.showErrorMessage(
				`Setup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Set Coding Plan dedicated key
	 */
	static async setCodingPlanApiKey(
		displayName: string,
		apiKeyTemplate: string,
	): Promise<void> {
		const result = await vscode.window.showInputBox({
			prompt: `Enter ${displayName} Coding Plan dedicated API Key (leave empty to clear)`,
			title: `Set ${displayName} Coding Plan Dedicated API Key`,
			placeHolder: apiKeyTemplate,
			password: true,
			validateInput: (value: string) => {
				// Allow empty value to clear API Key
				if (!value || value.trim() === "") {
					return null;
				}
				return null;
			},
		});

		// User cancelled input
		if (result === undefined) {
			return;
		}

		try {
			// Allow empty value to clear API Key
			if (result.trim() === "") {
				Logger.info(`${displayName} Coding Plan dedicated API Key cleared`);
				await ApiKeyManager.deleteApiKey(MiniMaxWizard.CODING_PLAN_KEY);
				vscode.window.showInformationMessage(
					`${displayName} Coding Plan dedicated API Key cleared`,
				);
			} else {
				await ApiKeyManager.setApiKey(
					MiniMaxWizard.CODING_PLAN_KEY,
					result.trim(),
				);
				Logger.info(`${displayName} Coding Plan dedicated API Key set`);
				vscode.window.showInformationMessage(
					`${displayName} Coding Plan dedicated API Key set`,
				);

				// After API Key is set, automatically proceed to endpoint selection
				await MiniMaxWizard.setCodingPlanEndpoint(displayName);
			}
		} catch (error) {
			Logger.error(
				`Coding Plan API Key operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			vscode.window.showErrorMessage(
				`Setup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Select Coding Plan endpoint (China/International)
	 */
	static async setCodingPlanEndpoint(displayName: string): Promise<void> {
		try {
			const choice = await vscode.window.showQuickPick(
				[
					{
						label: "$(home) China (minimaxi.com)",
						value: "minimaxi.com" as const,
					},
					{
						label: "$(globe) International (minimax.io)",
						value: "minimax.io" as const,
					},
				],
				{
					title: `${displayName} (Coding Plan) Endpoint Selection`,
					placeHolder: "Please select an endpoint",
					canPickMany: false,
				},
			);

			if (!choice) {
				Logger.debug(
					`User cancelled ${displayName} Coding Plan endpoint selection`,
				);
				return;
			}

			// Save user's site selection
			await MiniMaxWizard.saveCodingPlanSite(choice.value);

			const siteLabel =
				choice.value === "minimax.io" ? "International" : "China";
			Logger.info(`${displayName} Coding Plan endpoint set to: ${siteLabel}`);
			vscode.window.showInformationMessage(
				`${displayName} Coding Plan endpoint set to: ${siteLabel}`,
			);
		} catch (error) {
			Logger.error(
				`Coding Plan endpoint setup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Save Coding Plan endpoint configuration
	 */
	static async saveCodingPlanSite(
		site: MiniMaxConfig["endpoint"],
	): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration("chp.minimax");

			// Save to chp.minimax.endpoint configuration
			await config.update("endpoint", site, vscode.ConfigurationTarget.Global);
			Logger.info(`Coding Plan endpoint saved: ${site}`);
		} catch (error) {
			Logger.error(
				`Failed to save Coding Plan endpoint: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			throw error;
		}
	}
}
