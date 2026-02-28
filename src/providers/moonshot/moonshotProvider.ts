/*---------------------------------------------------------------------------------------------
 *  Moonshot AI Dedicated Provider
 *  Handles Moonshot AI specific logic and multi-key management
 *--------------------------------------------------------------------------------------------*/

import type {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatMessage,
	LanguageModelChatProvider,
	Progress,
	ProvideLanguageModelChatResponseOptions,
} from "vscode";
import * as vscode from "vscode";
import type { ModelConfig, ProviderConfig } from "../../types/sharedTypes";
import { Logger } from "../../utils";
import { GenericModelProvider } from "../common/genericModelProvider";
import { MoonshotWizard } from "./moonshotWizard";

/**
 * Moonshot AI dedicated model provider class
 * Inherits GenericModelProvider, adding multi-key management support
 */
export class MoonshotProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	/**
	 * Static factory method - Create and activate Moonshot provider
	 */
	static override createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: MoonshotProvider; disposables: vscode.Disposable[] } {
		Logger.trace(
			`${providerConfig.displayName} dedicated model extension activated!`,
		);
		// Create provider instance
		const provider = new MoonshotProvider(context, providerKey, providerConfig);
		// Register language model chat provider
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			`chp.${providerKey}`,
			provider,
		);

		// Register configuration command
		const setApiKeyCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.setApiKey`,
			async () => {
				await MoonshotWizard.startWizard(
					providerConfig.displayName,
					providerConfig.apiKeyTemplate,
				);
				// Trigger model information change event
				provider._onDidChangeLanguageModelChatInformation.fire();
			},
		);

		const disposables = [providerDisposable, setApiKeyCommand];
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}
		return { provider, disposables };
	}
}
