/*---------------------------------------------------------------------------------------------
 *  Zhipu AI Dedicated Provider
 *  Extends GenericModelProvider, adds configuration wizard and status bar updates
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
import type { ProviderConfig } from "../../types/sharedTypes";
import { Logger } from "../../utils/logger";
import { RateLimiter } from "../../utils/rateLimiter";
import { GenericModelProvider } from "../common/genericModelProvider";
import { ZhipuWizard } from "./zhipuWizard";

/**
 * Zhipu AI Dedicated Model Provider Class
 * Extends GenericModelProvider, adds configuration wizard functionality
 */
export class ZhipuProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	/**
	 * Static factory method - Create and activate Zhipu provider
	 */
	static createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: ZhipuProvider; disposables: vscode.Disposable[] } {
		Logger.trace(
			`${providerConfig.displayName} dedicated model extension activated!`,
		);
		// Create provider instance
		const provider = new ZhipuProvider(context, providerKey, providerConfig);
		// Register language model chat provider
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			`chp.${providerKey}`,
			provider,
		);
		// Register configuration command
		const setApiKeyCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.setApiKey`,
			async () => {
				await ZhipuWizard.startWizard(
					providerConfig.displayName,
					providerConfig.apiKeyTemplate,
				);
				// Clear cache after configuration change
				await provider.modelInfoCache?.invalidateCache(providerKey);
				// Trigger model information change event
				provider._onDidChangeLanguageModelChatInformation.fire();
			},
		);

		// Register configuration wizard command
		const configWizardCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.configWizard`,
			async () => {
				Logger.info(
					`Starting ${providerConfig.displayName} configuration wizard`,
				);
				await ZhipuWizard.startWizard(
					providerConfig.displayName,
					providerConfig.apiKeyTemplate,
				);
			},
		);

		const disposables = [
			providerDisposable,
			setApiKeyCommand,
			configWizardCommand,
		];
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}
		return { provider, disposables };
	}

	/**
	 * Override provideChatResponse to update status bar after request completion
	 */
	override async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<vscode.LanguageModelResponsePart>,
		token: CancellationToken,
	): Promise<void> {
		// Apply rate limiting: 2 requests per 1 second
		await RateLimiter.getInstance(this.providerKey, 2, 1000).throttle(
			this.providerConfig.displayName,
		);

		// Call parent class implementation
		await super.provideLanguageModelChatResponse(
			model,
			messages,
			options,
			progress,
			token,
		);
	}
}
