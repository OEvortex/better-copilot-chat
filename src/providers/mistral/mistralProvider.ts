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
import type { Account } from "../../accounts/types";
import type { ModelConfig, ProviderConfig } from "../../types/sharedTypes";
import {
	ApiKeyManager,
	ConfigManager,
	Logger,
	MistralHandler,
	TokenCounter,
} from "../../utils";
import { GenericModelProvider } from "../common/genericModelProvider";

/**
 * Mistral AI dedicated model provider class
 */
export class MistralProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	private readonly mistralHandler: MistralHandler;

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
		Logger.info(`[Mistral] Starting request for model: ${model.name}`);

		// Keep feature parity with GenericModelProvider (remember last model)
		if (ConfigManager.getRememberLastModel()) {
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
		const modelConfig = this.providerConfig.models.find((m) => m.id === model.id);
		if (!modelConfig) {
			const errorMessage = `Model not found: ${model.id}`;
			Logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		// Determine actual provider based on provider field in model configuration
		const effectiveProviderKey = modelConfig.provider || this.providerKey;

		try {
			const accounts = this.accountManager.getAccountsByProvider(
				effectiveProviderKey,
			);
			const loadBalanceEnabled = this.accountManager.getLoadBalanceEnabled(
				effectiveProviderKey,
			);
			const assignedAccountId = this.accountManager.getAccountIdForModel(
				effectiveProviderKey,
				model.id,
			);

			// If no accounts managed by AccountManager, fall back to ApiKeyManager
			if (accounts.length === 0) {
				await ApiKeyManager.ensureApiKey(
					effectiveProviderKey,
					this.providerConfig.displayName,
				);

				Logger.info(
					`${this.providerConfig.displayName} Provider starts processing request (fallback mode): ${modelConfig.name}`,
				);
				await this.mistralHandler.handleRequest(
					model,
					modelConfig,
					messages,
					options,
					progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart2>,
					token,
				);
				return;
			}

			// Use AccountManager for multi-account support
			const usableAccounts: Account[] =
				accounts.filter((a) => a.status === "active").length > 0
					? accounts.filter((a) => a.status === "active")
					: accounts;

			const candidates = this.buildAccountCandidates(
				model.id,
				usableAccounts,
				assignedAccountId,
				loadBalanceEnabled,
				effectiveProviderKey,
			);

			const activeAccount = this.accountManager.getActiveAccount(
				effectiveProviderKey,
			);

			const available = loadBalanceEnabled
				? candidates.filter(
						(a) => !this.accountManager.isAccountQuotaLimited(a.id),
					)
				: candidates;

			let accountsToTry: Account[];
			if (available.length > 0) {
				if (activeAccount && available.some((a) => a.id === activeAccount.id)) {
					accountsToTry = [
						activeAccount,
						...available.filter((a) => a.id !== activeAccount.id),
					];
				} else {
					accountsToTry = available;
				}
			} else {
				if (activeAccount && candidates.some((a) => a.id === activeAccount.id)) {
					accountsToTry = [
						activeAccount,
						...candidates.filter((a) => a.id !== activeAccount.id),
					];
				} else {
					accountsToTry = candidates;
				}
			}

			Logger.debug(
				`[${effectiveProviderKey}] Active account: ${activeAccount?.displayName || "none"}, accountsToTry: ${accountsToTry.map((a) => a.displayName).join(", ")}`,
			);

			let lastError: unknown;
			let switchedAccount = false;

			for (const account of accountsToTry) {
				const credentials = await this.accountManager.getCredentials(account.id);
				if (!credentials) {
					lastError = new Error(
						`Missing credentials for ${account.displayName}`,
					);
					continue;
				}

				const configWithAuth: ModelConfig = {
					...modelConfig,
					apiKey: "apiKey" in credentials ? credentials.apiKey : undefined,
					baseUrl: "endpoint" in credentials ? credentials.endpoint : undefined,
					customHeader:
						"customHeaders" in credentials
							? credentials.customHeaders
							: undefined,
				};

				if ("accessToken" in credentials) {
					(configWithAuth as any).accessToken = credentials.accessToken;
					(configWithAuth as any).apiKey = credentials.accessToken;
				}

				try {
					Logger.info(
						`${this.providerConfig.displayName}: ${model.name} using account "${account.displayName}" (ID: ${account.id})`,
					);

					await this.mistralHandler.handleRequest(
						model,
						configWithAuth,
						messages,
						options,
						progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart2>,
						token,
						account.id,
					);

					this.lastUsedAccountByModel.set(model.id, account.id);

					if (switchedAccount) {
						Logger.info(
							`[${effectiveProviderKey}] Saving account "${account.displayName}" as preferred for model ${model.id}`,
						);
						await this.accountManager.setAccountForModel(
							effectiveProviderKey,
							model.id,
							account.id,
						);
					}
					return;
				} catch (error) {
					switchedAccount = true;
					if (this.isLongTermQuotaExhausted(error)) {
						if (loadBalanceEnabled) {
							Logger.warn(
								`[${effectiveProviderKey}] Account ${account.displayName} quota exhausted, switching...`,
							);
							lastError = error;
							continue;
						}
						throw error;
					}
					if (loadBalanceEnabled && this.isQuotaError(error)) {
						Logger.warn(
							`[${effectiveProviderKey}] Account ${account.displayName} rate limited, switching...`,
						);
						lastError = error;
						continue;
					}
					throw error;
				}
			}

			if (lastError) {
				throw lastError;
			}
			throw new Error(`No available accounts for ${effectiveProviderKey}`);
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

	async provideTokenCount(
		model: LanguageModelChatInformation,
		text: string | LanguageModelChatMessage,
		_token: CancellationToken,
	): Promise<number> {
		return TokenCounter.getInstance().countTokens(model, text);
	}
}
