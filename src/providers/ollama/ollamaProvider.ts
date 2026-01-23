/*---------------------------------------------------------------------------------------------
 *  Ollama Cloud Dedicated Provider
 *  Uses static model configuration from src/providers/config/ollama.json
 *--------------------------------------------------------------------------------------------*/

import type {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatMessage,
	LanguageModelChatProvider,
	LanguageModelResponsePart,
	Progress,
	ProvideLanguageModelChatResponseOptions,
} from "vscode";
import * as vscode from "vscode";
import type { ProviderConfig } from "../../types/sharedTypes";
import { ApiKeyManager } from "../../utils/apiKeyManager";
import { ConfigManager } from "../../utils/configManager";
import { Logger } from "../../utils/logger";
import { RateLimiter } from "../../utils/rateLimiter";
import { TokenCounter } from "../../utils/tokenCounter";
import { GenericModelProvider } from "../common/genericModelProvider";

export class OllamaProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	async prepareLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		const apiKey = await this.ensureApiKey(options.silent ?? true);
		if (!apiKey) {
			return [];
		}

		const infos = this.providerConfig.models.map((model) =>
			this.modelConfigToInfo(model),
		);
		this._chatEndpoints = infos.map((info) => ({
			model: info.id,
			modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens,
		}));
		return infos;
	}

	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		return this.prepareLanguageModelChatInformation(
			{ silent: options.silent ?? false },
			_token,
		);
	}

	override async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<LanguageModelResponsePart>,
		token: CancellationToken,
	): Promise<void> {
		await RateLimiter.getInstance(this.providerKey, 2, 1000).throttle(
			this.providerConfig.displayName,
		);

		try {
			const rememberLastModel = ConfigManager.getRememberLastModel();
			if (rememberLastModel) {
				this.modelInfoCache
					?.saveLastSelectedModel(this.providerKey, model.id)
					.catch((err) =>
						Logger.warn(
							"[Ollama] Failed to save model selection",
							err instanceof Error ? err.message : String(err),
						),
					);
			}

			await this.ensureApiKey(false);
			await super.provideLanguageModelChatResponse(
				model,
				messages,
				options,
				progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart2>,
				token,
			);
		} catch (error) {
			Logger.error(
				"[Ollama] Chat request failed",
				error instanceof Error ? error.message : String(error),
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

	private async ensureApiKey(silent: boolean): Promise<string | undefined> {
		let apiKey = await ApiKeyManager.getApiKey(this.providerKey);
		if (!apiKey && !silent) {
			await ApiKeyManager.promptAndSetApiKey(
				this.providerKey,
				this.providerConfig.displayName,
				this.providerConfig.apiKeyTemplate,
			);
			apiKey = await ApiKeyManager.getApiKey(this.providerKey);
		}
		return apiKey;
	}

	static createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: OllamaProvider; disposables: vscode.Disposable[] } {
		Logger.trace(`${providerConfig.displayName} provider activated!`);
		const provider = new OllamaProvider(context, providerKey, providerConfig);
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			`chp.${providerKey}`,
			provider,
		);

		const setApiKeyCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.setApiKey`,
			async () => {
				await ApiKeyManager.promptAndSetApiKey(
					providerKey,
					providerConfig.displayName,
					providerConfig.apiKeyTemplate,
				);
				await provider.modelInfoCache?.invalidateCache(providerKey);
				provider._onDidChangeLanguageModelChatInformation.fire(undefined);
			},
		);

		const disposables = [providerDisposable, setApiKeyCommand];
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}
		return { provider, disposables };
	}
}
