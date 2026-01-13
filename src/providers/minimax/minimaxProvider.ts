/*---------------------------------------------------------------------------------------------
 *  MiniMax Dedicated Provider
 *  Provides multi-key management and exclusive configuration wizard functions for MiniMax providers
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
import {
	ApiKeyManager,
	ConfigManager,
	Logger,
	MiniMaxWizard,
	RateLimiter,
	TokenCounter,
} from "../../utils";
import { GenericModelProvider } from "../common/genericModelProvider";

/**
 * MiniMax dedicated model provider class
 * Inherits GenericModelProvider, adding multi-key management and configuration wizard functions
 */
export class MiniMaxProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	/**
	 * Static factory method - Create and activate MiniMax provider
	 */
	static createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: MiniMaxProvider; disposables: vscode.Disposable[] } {
		Logger.trace(
			`${providerConfig.displayName} dedicated model extension activated!`,
		);
		// Create provider instance
		const provider = new MiniMaxProvider(context, providerKey, providerConfig);
		// Register language model chat provider
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			`chp.${providerKey}`,
			provider,
		);

		// Register command to set normal API key
		const setApiKeyCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.setApiKey`,
			async () => {
				await MiniMaxWizard.setNormalApiKey(
					providerConfig.displayName,
					providerConfig.apiKeyTemplate,
				);
				// Clear cache after API key change
				await provider.modelInfoCache?.invalidateCache(providerKey);
				// Trigger model information change event
				provider._onDidChangeLanguageModelChatInformation.fire();
			},
		);

		// Register command to set Coding Plan dedicated key
		const setCodingKeyCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.setCodingPlanApiKey`,
			async () => {
				await MiniMaxWizard.setCodingPlanApiKey(
					providerConfig.displayName,
					providerConfig.apiKeyTemplate,
				);
				// Clear cache after API key change
				await provider.modelInfoCache?.invalidateCache("minimax-coding");
				// Trigger model information change event
				provider._onDidChangeLanguageModelChatInformation.fire();
			},
		);

		// Register command to set Coding Plan endpoint
		const setCodingPlanEndpointCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.setCodingPlanEndpoint`,
			async () => {
				Logger.info(
					`User manually opens ${providerConfig.displayName} Coding Plan endpoint selection`,
				);
				await MiniMaxWizard.setCodingPlanEndpoint(providerConfig.displayName);
			},
		);

		// Register configuration wizard command
		const configWizardCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.configWizard`,
			async () => {
				Logger.info(`Start ${providerConfig.displayName} configuration wizard`);
				await MiniMaxWizard.startWizard(
					providerConfig.displayName,
					providerConfig.apiKeyTemplate,
				);
			},
		);

		const disposables = [
			providerDisposable,
			setApiKeyCommand,
			setCodingKeyCommand,
			setCodingPlanEndpointCommand,
			configWizardCommand,
		];
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}
		return { provider, disposables };
	}

	/**
	 * Get provider key for model (considering provider field and default values)
	 */
	private getProviderKeyForModel(modelConfig: ModelConfig): string {
		// Prioritize using model-specific provider field
		if (modelConfig.provider) {
			return modelConfig.provider;
		}
		// Otherwise use provider's default provider key
		return this.providerKey;
	}

	/**
	 * Get key for model, ensuring a valid key exists
	 * @param modelConfig Model configuration
	 * @returns Return available API key
	 */
	private async ensureApiKeyForModel(
		modelConfig: ModelConfig,
	): Promise<string> {
		const providerKey = this.getProviderKeyForModel(modelConfig);
		const isCodingPlan = providerKey === "minimax-coding";
		const keyType = isCodingPlan ? "Coding Plan Dedicated" : "Normal";

		// Check if key already exists
		const hasApiKey = await ApiKeyManager.hasValidApiKey(providerKey);
		if (hasApiKey) {
			const apiKey = await ApiKeyManager.getApiKey(providerKey);
			if (apiKey) {
				return apiKey;
			}
		}

		// Key does not exist, enter setup process directly (no popup confirmation)
		Logger.warn(
			`Model ${modelConfig.name} lacks ${keyType} API key, entering setup process`,
		);

		if (isCodingPlan) {
			// Coding Plan model directly enters dedicated key setup
			await MiniMaxWizard.setCodingPlanApiKey(
				this.providerConfig.displayName,
				this.providerConfig.apiKeyTemplate,
			);
		} else {
			// Normal model directly enters normal key setup
			await MiniMaxWizard.setNormalApiKey(
				this.providerConfig.displayName,
				this.providerConfig.apiKeyTemplate,
			);
		}

		// Re-check if key setup was successful
		const apiKey = await ApiKeyManager.getApiKey(providerKey);
		if (apiKey) {
			Logger.info(`${keyType} key setup successful`);
			return apiKey;
		}

		// User not set or setup failed
		throw new Error(
			`${this.providerConfig.displayName}: User has not set ${keyType} API key`,
		);
	}

	/**
	 * Override: Get model information - add key check
	 * Return all models if any key exists, no filtering
	 * Specific key verification is performed during actual use (provideLanguageModelChatResponse)
	 */
	override async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		// Check if any key exists
		const hasNormalKey = await ApiKeyManager.hasValidApiKey(this.providerKey);
		const hasCodingKey = await ApiKeyManager.hasValidApiKey("minimax-coding");
		const hasAnyKey = hasNormalKey || hasCodingKey;

		// If silent mode and no keys, return empty list
		if (options.silent && !hasAnyKey) {
			Logger.debug(
				`${this.providerConfig.displayName}: In silent mode, no keys detected, returning empty model list`,
			);
			return [];
		}

		// Non-silent mode: If no keys, start configuration wizard
		if (!options.silent && !hasAnyKey) {
			Logger.info(
				`${this.providerConfig.displayName}: Detected no keys configured, starting configuration wizard`,
			);
			await MiniMaxWizard.startWizard(
				this.providerConfig.displayName,
				this.providerConfig.apiKeyTemplate,
			);

			// Re-check if keys are set
			const normalKeyValid = await ApiKeyManager.hasValidApiKey(
				this.providerKey,
			);
			const codingKeyValid =
				await ApiKeyManager.hasValidApiKey("minimax-coding");

			// If user still hasn't set any keys, return empty list
			if (!normalKeyValid && !codingKeyValid) {
				Logger.warn(
					`${this.providerConfig.displayName}: User has not set any keys, returning empty model list`,
				);
				return [];
			}
		}

		// Return all models without filtering
		// Specific key verification will be performed in provideLanguageModelChatResponse after user selects a model
		Logger.debug(
			`${this.providerConfig.displayName}: Return all ${this.providerConfig.models.length} models`,
		);

		// Convert models in config to format required by VS Code
		let models = this.providerConfig.models.map((model) =>
			this.modelConfigToInfo(model),
		);

		// Read user's last selected model and mark as default (only if memory is enabled and provider matches)
		const rememberLastModel = ConfigManager.getRememberLastModel();
		if (rememberLastModel) {
			const lastSelectedId = this.modelInfoCache?.getLastSelectedModel(
				this.providerKey,
			);
			if (lastSelectedId) {
				models = models.map((model) => ({
					...model,
					isDefault: model.id === lastSelectedId,
				}));
			}
		}

		return models;
	}

	/**
	 * Override: Provide language model chat response - add pre-request key assurance mechanism
	 * Ensure corresponding key exists before processing request
	 */
	async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<vscode.LanguageModelResponsePart>,
		_token: CancellationToken,
	): Promise<void> {
		// Apply rate limiting: 2 requests per 1 second
		await RateLimiter.getInstance(this.providerKey, 2, 1000).throttle(
			this.providerConfig.displayName,
		);

		// Save user's selected model and its provider (only when memory function is enabled)
		const rememberLastModel = ConfigManager.getRememberLastModel();
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

		// Before request: Ensure key for model exists
		// This will pop up a setup dialog when there is no key
		const providerKey = this.getProviderKeyForModel(modelConfig);
		const apiKey = await this.ensureApiKeyForModel(modelConfig);

		if (!apiKey) {
			const keyType =
				providerKey === "minimax-coding" ? "Coding Plan Dedicated" : "Normal";
			throw new Error(
				`${this.providerConfig.displayName}: Invalid ${keyType} API key`,
			);
		}

		Logger.info(
			`${this.providerConfig.displayName}: About to process request, using ${providerKey === "minimax-coding" ? "Coding Plan" : "Normal"} key - model: ${modelConfig.name}`,
		);

		// Select handler based on model's sdkMode
		// Note: Do not call super.provideLanguageModelChatResponse here, process directly
		// Avoid double key checks as we already checked in ensureApiKeyForModel
		const sdkMode = modelConfig.sdkMode || "openai";
		const sdkName = sdkMode === "anthropic" ? "Anthropic SDK" : "OpenAI SDK";
		Logger.info(
			`${this.providerConfig.displayName} Provider starts processing request (${sdkName}): ${modelConfig.name}`,
		);

		try {
			if (sdkMode === "anthropic") {
				await this.anthropicHandler.handleRequest(
					model,
					modelConfig,
					messages,
					options,
					progress,
					_token,
				);
			} else {
				await this.openaiHandler.handleRequest(
					model,
					modelConfig,
					messages,
					options,
					progress,
					_token,
				);
			}
		} catch (error) {
			const errorMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
			Logger.error(errorMessage);
			throw error;
		} finally {
			Logger.info(
				`${this.providerConfig.displayName}: ${model.name} Request completed`,
			);
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
