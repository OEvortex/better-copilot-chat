/*---------------------------------------------------------------------------------------------
 *  OpenCode Dedicated Provider
 *  Handles OpenCode specific logic and optimizations
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
import { ApiKeyManager, Logger, RateLimiter, TokenCounter } from "../../utils";
import { GenericModelProvider } from "../common/genericModelProvider";

/**
 * OpenCode dedicated model provider class
 */
export class OpenCodeProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	/**
	 * Static factory method - Create and activate OpenCode provider
	 */
	static override createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: OpenCodeProvider; disposables: vscode.Disposable[] } {
		Logger.trace(
			`${providerConfig.displayName} dedicated model extension activated!`,
		);
		// Create provider instance
		const provider = new OpenCodeProvider(context, providerKey, providerConfig);
		// Register language model chat provider
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			`chp.${providerKey}`,
			provider,
		);

		// Register command to set API key
		const setApiKeyCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.setApiKey`,
			async () => {
				await ApiKeyManager.promptAndSetApiKey(
					providerKey,
					providerConfig.displayName,
					providerConfig.apiKeyTemplate,
				);
				// Clear cache after API key change
				await provider.modelInfoCache?.invalidateCache(providerKey);
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

	/**
	 * Override: Provide language model chat response
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

		try {
			Logger.info(`[OpenCode] Starting request for model: ${model.name}`);
			await super.provideLanguageModelChatResponse(
				model,
				messages,
				options,
				progress,
				token,
			);
		} catch (error) {
			Logger.error(
				`[OpenCode] Request failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw error;
		}
	}

	async provideTokenCount(
		model: LanguageModelChatInformation,
		text: string | LanguageModelChatMessage,
		_token: CancellationToken,
	): Promise<number> {
		return TokenCounter.getInstance().countTokens(model, text);
	}
}
