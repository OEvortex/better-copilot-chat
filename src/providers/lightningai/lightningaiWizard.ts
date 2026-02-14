/*---------------------------------------------------------------------------------------------
 *  Lightning AI Configuration Wizard
 *  Provides an interactive wizard to configure API key in the required format
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { ApiKeyManager } from "../../utils/apiKeyManager";
import { Logger } from "../../utils/logger";
import { ProviderWizard } from "../../utils/providerWizard";

export class LightningAIWizard {
	private static readonly PROVIDER_KEY = "lightningai";

	/**
	 * Start configuration wizard
	 */
	static async startWizard(
		displayName: string,
		apiKeyTemplate: string,
	): Promise<boolean> {
		try {
			const choice = await vscode.window.showQuickPick(
				[
					{
						label: `$(key) Configure ${displayName} API Key`,
						detail: `Format: APIKey/Username/StudioName (e.g., 26e4d40e.../abhay/vision-model)`,
						action: "updateApiKey",
					},
					{
						label: "$(globe) Configure Base URL (Proxy)",
						detail: `Override ${displayName} endpoint (optional)`,
						action: "baseUrl",
					},
				],
				{
					title: `${displayName} Configuration Menu`,
					placeHolder: "Select action to perform",
				},
			);

			if (!choice) {
				Logger.debug("User cancelled Lightning AI configuration wizard");
				return false;
			}

			if (choice.action === "updateApiKey") {
				return await LightningAIWizard.showSetApiKeyStep(
					displayName,
					apiKeyTemplate,
				);
			}
			if (choice.action === "baseUrl") {
				await ProviderWizard.configureBaseUrl("lightningai", displayName);
				return true;
			}

			return false;
		} catch (error) {
			Logger.error(
				`Lightning AI configuration wizard error: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			return false;
		}
	}

	/**
	 * Show API key setup step
	 */
	private static async showSetApiKeyStep(
		displayName: string,
		apiKeyTemplate: string,
	): Promise<boolean> {
		const result = await vscode.window.showInputBox({
			prompt: `Enter ${displayName} API Key in format: APIKey/Username/StudioName`,
			title: `Set ${displayName} API Key`,
			placeHolder: "************************/abhay/vision-model",
			password: true,
			validateInput: (value: string) => {
				if (!value || value.trim() === "") {
					return null;
				}
				const parts = value.split("/");
				if (parts.length !== 3) {
					return "Invalid format. Expected: APIKey/Username/StudioName";
				}
				return null;
			},
		});

		if (result === undefined) {
			return false;
		}

		try {
			if (result.trim() === "") {
				Logger.info(`${displayName} API Key cleared`);
				await ApiKeyManager.deleteApiKey(LightningAIWizard.PROVIDER_KEY);
			} else {
				await ApiKeyManager.setApiKey(LightningAIWizard.PROVIDER_KEY, result.trim());
				Logger.info(`${displayName} API Key set`);
				vscode.window.showInformationMessage(`${displayName} API Key set successfully.`);
			}
			return true;
		} catch (error) {
			Logger.error(
				`API Key operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			return false;
		}
	}
}
