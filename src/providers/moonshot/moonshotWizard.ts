/*---------------------------------------------------------------------------------------------
 *  MoonshotAI Configuration Wizard
 *  Provides an interactive wizard to configure Moonshot API key and Kimi For Coding dedicated key
 *--------------------------------------------------------------------------------------------*/

// cSpell:ignore kimi
import * as vscode from "vscode";
import { ApiKeyManager } from "../../utils/apiKeyManager";
import { Logger } from "../../utils/logger";
import { ProviderWizard } from "../../utils/providerWizard";

export class MoonshotWizard {
	private static readonly PROVIDER_KEY = "moonshot";
	private static readonly KIMI_KEY = "kimi";

	/**
	 * Start the MoonshotAI configuration wizard
	 * Allows users to choose which key type to configure
	 */
	static async startWizard(
		displayName: string,
		apiKeyTemplate: string,
	): Promise<void> {
		try {
			const choice = await vscode.window.showQuickPick(
				[
					{
						label: "$(key) Configure Moonshot API Key",
						detail:
							"API key for calling Kimi-K2 series and other models on Moonshot AI Open Platform",
						value: "moonshot",
					},
					{
						label: "$(key) Configure Kimi For Coding Dedicated Key",
						detail:
							"Dedicated key for code development scenarios provided as a premium benefit in Kimi membership plan",
						value: "kimi",
					},
					{
						label: "$(check-all) Configure Both Keys",
						detail:
							"Configure Moonshot API key and Kimi For Coding dedicated key in sequence",
						value: "both",
					},
					{
						label: "$(globe) Configure Base URL (Proxy)",
						detail: "Override MoonshotAI endpoint (optional)",
						value: "baseUrl",
					},
				],
				{
					title: `${displayName} Key Configuration`,
					placeHolder: "Please select the item to configure",
				},
			);

			if (!choice) {
				Logger.debug("User cancelled the MoonshotAI configuration wizard");
				return;
			}

			if (choice.value === "moonshot" || choice.value === "both") {
				await MoonshotWizard.setMoonshotApiKey(displayName, apiKeyTemplate);
			}

			if (choice.value === "kimi" || choice.value === "both") {
				await MoonshotWizard.setKimiApiKey(displayName);
			}

			if (choice.value === "baseUrl") {
				await ProviderWizard.configureBaseUrl("moonshot", displayName);
			}
		} catch (error) {
			Logger.error(
				`MoonshotAI configuration wizard error: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Set Moonshot API Key
	 */
	static async setMoonshotApiKey(
		displayName: string,
		apiKeyTemplate: string,
	): Promise<void> {
		const result = await vscode.window.showInputBox({
			prompt: `Enter ${displayName} API Key (leave empty to clear)`,
			title: `Set ${displayName} API Key`,
			placeHolder: apiKeyTemplate,
			password: true,
			validateInput: (value: string) => {
				// Allow empty value for clearing API Key
				if (!value || value.trim() === "") {
					return null;
				}
				return null;
			},
		});

		// User cancelled the input
		if (result === undefined) {
			return;
		}

		try {
			// Allow empty value for clearing API Key
			if (result.trim() === "") {
				Logger.info(`${displayName} API Key cleared`);
				await ApiKeyManager.deleteApiKey(MoonshotWizard.PROVIDER_KEY);
				vscode.window.showInformationMessage(`${displayName} API Key cleared`);
			} else {
				await ApiKeyManager.setApiKey(
					MoonshotWizard.PROVIDER_KEY,
					result.trim(),
				);
				Logger.info(`${displayName} API Key set`);
				vscode.window.showInformationMessage(`${displayName} API Key set`);
			}
		} catch (error) {
			Logger.error(
				`Moonshot API Key operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			vscode.window.showErrorMessage(
				`Setup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Set Kimi For Coding Dedicated Key
	 */
	static async setKimiApiKey(_displayName: string): Promise<void> {
		const result = await vscode.window.showInputBox({
			prompt: "Enter Kimi For Coding dedicated API Key (leave empty to clear)",
			title: "Set Kimi For Coding Dedicated API Key",
			placeHolder:
				"sk-kimi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			password: true,
			validateInput: (value: string) => {
				// Allow empty value for clearing API Key
				if (!value || value.trim() === "") {
					return null;
				}
				return null;
			},
		});

		// User cancelled the input
		if (result === undefined) {
			return;
		}

		try {
			// Allow empty value for clearing API Key
			if (result.trim() === "") {
				Logger.info("Kimi For Coding dedicated API Key cleared");
				await ApiKeyManager.deleteApiKey(MoonshotWizard.KIMI_KEY);
				vscode.window.showInformationMessage(
					"Kimi For Coding dedicated API Key cleared",
				);
			} else {
				await ApiKeyManager.setApiKey(MoonshotWizard.KIMI_KEY, result.trim());
				Logger.info("Kimi For Coding dedicated API Key set");
				vscode.window.showInformationMessage(
					"Kimi For Coding dedicated API Key set",
				);
			}
		} catch (error) {
			Logger.error(
				`Kimi For Coding API Key operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			vscode.window.showErrorMessage(
				`Setup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}
}
