/*---------------------------------------------------------------------------------------------
 *  Mistral AI Dedicated Provider
 *  Handles Mistral AI specific logic and optimizations
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
import { ApiKeyManager, Logger, MistralHandler } from "../../utils";
import { GenericModelProvider } from "../common/genericModelProvider";

/**
 * Mistral AI dedicated model provider class
 */
export class MistralProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	private mistralHandler: MistralHandler;

	constructor(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	) {
		super(context, providerKey, providerConfig);
		this.mistralHandler = new MistralHandler(
			providerKey,
			providerConfig.displayName,
			providerConfig.baseUrl,
		);
	}

	/**
	 * Static factory method - Create and activate Mistral provider
	 */
	static override createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: MistralProvider; disposables: vscode.Disposable[] } {
		Logger.trace(
			`${providerConfig.displayName} dedicated model extension activated!`,
		);
		// Create provider instance
		const provider = new MistralProvider(context, providerKey, providerConfig);
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
		// Save user's selected model and its provider (only if memory is enabled)
		const rememberLastModel = vscode.workspace
			.getConfiguration("chp")
			.get("rememberLastModel", true);
		if (rememberLastModel) {
			this.modelInfoCache
				?.saveLastSelectedModel(this.providerKey, model.id)
				.catch((err) =>
					Logger.warn(
						`[${this.providerKey}] Failed to save model selection:`,
						err,
					),
				);
		}

		// Find corresponding model configuration
		const modelConfig = this.providerConfig.models.find(
			(m: ModelConfig) => m.id === model.id,
		);
		if (!modelConfig) {
			const errorMessage = `Model not found: ${model.id}`;
			Logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		try {
			Logger.info(`[Mistral] Starting request for model: ${model.name}`);
			await this.mistralHandler.handleRequest(
				model,
				modelConfig,
				messages,
				options,
				progress,
				token,
			);
		} catch (error) {
			Logger.error(
				`[Mistral] Request failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw error;
		} finally {
			Logger.info(
				`${this.providerConfig.displayName}: ${model.name} Request completed`,
			);
		}
	}
}
