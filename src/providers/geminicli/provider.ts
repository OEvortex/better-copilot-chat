/*---------------------------------------------------------------------------------------------
 *  Gemini CLI Provider
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
import {
	type Account,
	type AccountCredentials,
	AccountManager,
	type ApiKeyCredentials,
	type OAuthCredentials,
} from "../../accounts";
import type { ModelConfig, ProviderConfig } from "../../types/sharedTypes";
import { resolveGlobalTokenLimits } from "../../utils/globalContextLengthManager";
import { Logger } from "../../utils/logger";
import { RateLimiter } from "../../utils/rateLimiter";
import { GenericModelProvider } from "../common/genericModelProvider";
import { GeminiOAuthManager } from "./auth";
import { GeminiHandler } from "./handler";

export class GeminiCliProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	private readonly geminiHandler: GeminiHandler;

	// Gemini CLI uses 1M context for most models
	private static readonly DEFAULT_CONTEXT_LENGTH = 1000000;
	private static readonly DEFAULT_MAX_OUTPUT_TOKENS = 32 * 1024; // 32768

	constructor(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	) {
		super(context, providerKey, providerConfig);
		this.geminiHandler = new GeminiHandler(providerConfig.displayName);
	}

	static override createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: GeminiCliProvider; disposables: vscode.Disposable[] } {
		Logger.trace(`${providerConfig.displayName} provider activated!`);
		const provider = new GeminiCliProvider(
			context,
			providerKey,
			providerConfig,
		);
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			`chp.${providerKey}`,
			provider,
		);

		const loginCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.login`,
			async () => {
				try {
					const { accessToken, baseURL } =
						await GeminiOAuthManager.getInstance().ensureAuthenticated(true);
					vscode.window.showInformationMessage(
						`${providerConfig.displayName} login successful!`,
					);
					// Register CLI-managed account in AccountManager if not present
					try {
						const accountManager = AccountManager.getInstance();
						const existing = accountManager
							.getAccountsByProvider("geminicli")
							.find((a) => a.metadata?.source === "cli");
						if (!existing) {
							await accountManager.addOAuthAccount(
								"geminicli",
								"Gemini CLI (Local)",
								"",
								{
									accessToken: accessToken ?? "",
									refreshToken: "",
									expiresAt: "",
									tokenType: "",
								},
								{ source: "cli", baseURL },
							);
						}
					} catch (e) {
						Logger.warn(
							"[geminicli] Failed to register CLI account with AccountManager",
							e,
						);
					}
					await provider.modelInfoCache?.invalidateCache(providerKey);
					provider._onDidChangeLanguageModelChatInformation.fire();
				} catch (error) {
					vscode.window.showErrorMessage(
						`${providerConfig.displayName} login failed: ${error instanceof Error ? error.message : "Unknown error"}`,
					);
				}
			},
		);

		const disposables = [providerDisposable, loginCommand];
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}
		return { provider, disposables };
	}

	override async provideLanguageModelChatInformation(
		_options: { silent: boolean },
		_token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		// Always return models immediately without any async checks
		// This prevents the UI from refreshing/flickering when trying to add models
		// Authentication check will happen when user tries to use the model
		return this.providerConfig.models.map((model) =>
			this.resolveModelInfo(model),
		);
	}

	/**
	 * Resolve model info with global token limit overrides
	 */
	private resolveModelInfo(model: ModelConfig): LanguageModelChatInformation {
		const tokenLimits = resolveGlobalTokenLimits(
			model.id,
			GeminiCliProvider.DEFAULT_CONTEXT_LENGTH,
			{
				defaultContextLength: GeminiCliProvider.DEFAULT_CONTEXT_LENGTH,
				defaultMaxOutputTokens: GeminiCliProvider.DEFAULT_MAX_OUTPUT_TOKENS,
			},
		);

		return this.modelConfigToInfoWithTokens(model, tokenLimits.maxInputTokens, tokenLimits.maxOutputTokens);
	}

	/**
	 * Override to inject resolved token limits
	 */
	private modelConfigToInfoWithTokens(
		model: ModelConfig,
		maxInputTokens: number,
		maxOutputTokens: number,
	): LanguageModelChatInformation {
		const info: LanguageModelChatInformation = {
			id: model.id,
			name: model.name,
			detail: this.providerConfig.displayName,
			tooltip:
				model.tooltip || `${model.name} via ${this.providerConfig.displayName}`,
			family: "Gemini CLI",
			maxInputTokens: maxInputTokens,
			maxOutputTokens: maxOutputTokens,
			version: model.id,
			capabilities: model.capabilities,
		};

		return info;
	}

	override async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<vscode.LanguageModelResponsePart2>,
		token: CancellationToken,
	): Promise<void> {
		// Apply rate limiting: 2 requests per 1 second
		await RateLimiter.getInstance(this.providerKey, 2, 1000).throttle(
			this.providerConfig.displayName,
		);

		const modelConfig = this.providerConfig.models.find(
			(m: ModelConfig) => m.id === model.id,
		);
		if (!modelConfig) {
			throw new Error(`Model not found: ${model.id}`);
		}

		try {
			// Try managed accounts first
			const accountManager = AccountManager.getInstance();
			const accounts = accountManager.getAccountsByProvider("geminicli");
			const loadBalanceEnabled =
				accountManager.getLoadBalanceEnabled("geminicli");
			const assignedAccountId = accountManager.getAccountIdForModel(
				"geminicli",
				model.id,
			);

			const tryAccountRequest = async (account: Account) => {
				const creds = (await accountManager.getCredentials(account.id)) as
					| AccountCredentials
					| undefined;
				if (!creds) return { success: false, reason: "no-creds" };
				let acctToken: string | undefined;
				if ("accessToken" in creds) {
					acctToken = (creds as OAuthCredentials).accessToken;
				} else if ("apiKey" in creds) {
					acctToken = (creds as ApiKeyCredentials).apiKey;
				}
				if (!acctToken) return { success: false, reason: "no-token" };

				const configWithAuth: ModelConfig = {
					...modelConfig,
					baseUrl: modelConfig.baseUrl || undefined,
					customHeader: {
						...(modelConfig.customHeader || {}),
						Authorization: `Bearer ${acctToken}`,
					},
				};

				try {
					await this.geminiHandler.handleRequest(
						model,
						configWithAuth,
						messages,
						options,
						progress,
						token,
						acctToken,
					);
					return { success: true };
				} catch (err) {
					return { success: false, error: err };
				}
			};

			if (accounts && accounts.length > 0) {
				const usableAccounts = accounts.filter(
					(a: Account) => a.status === "active",
				);
				const candidates =
					usableAccounts.length > 0 ? usableAccounts : accounts;

				const activeAccount = accountManager.getActiveAccount("geminicli");
				let accountsToTry: Account[];
				if (loadBalanceEnabled) {
					if (
						activeAccount &&
						candidates.some((a: Account) => a.id === activeAccount.id)
					) {
						accountsToTry = [
							activeAccount,
							...candidates.filter((a: Account) => a.id !== activeAccount.id),
						];
					} else {
						accountsToTry = candidates;
					}
				} else {
					const assigned = assignedAccountId
						? accounts.find((a: Account) => a.id === assignedAccountId)
						: activeAccount;
					accountsToTry = assigned
						? [assigned]
						: candidates.length > 0
							? [candidates[0]]
							: [];
				}

				let lastError: unknown;
				let switchedAccount = false;
				for (const account of accountsToTry) {
					const result = await tryAccountRequest(account);
					if (result.success) {
						if (switchedAccount && loadBalanceEnabled) {
							accountManager
								.setAccountForModel("geminicli", model.id, account.id)
								.catch(() => {});
						}
						return;
					}

					lastError = result.error ?? result.reason;

					if (
						result.error instanceof Error &&
						(result.error.message.includes("401") ||
							result.error.message.includes("Authentication failed"))
					) {
						await accountManager.markAccountExpired(account.id);
						continue;
					}

					if (result.error) {
						throw result.error;
					}
				}

				if (lastError) {
					Logger.warn(
						"[geminicli] Managed accounts failed, falling back to CLI credentials",
						lastError,
					);
				}
			}

			const { accessToken, baseURL } =
				await GeminiOAuthManager.getInstance().ensureAuthenticated();

			// Update handler with latest credentials
			// Pass accessToken as apiKey so OpenAIHandler uses it for Authorization header
			const configWithAuth: ModelConfig = {
				...modelConfig,
				baseUrl: baseURL,
				apiKey: accessToken,
				customHeader: modelConfig.customHeader,
			};

			// Use GeminiHandler for Gemini CLI models as they use the same protocol
			await this.geminiHandler.handleRequest(
				model,
				configWithAuth,
				messages,
				options,
				progress,
				token,
				accessToken,
			);
		} catch (error) {
			// If we got a 401, invalidate cached credentials and retry once
			if (error instanceof Error && error.message.includes("401")) {
				GeminiOAuthManager.getInstance().invalidateCredentials?.();
				const { accessToken, baseURL } =
					await GeminiOAuthManager.getInstance().ensureAuthenticated(true);
				const configWithAuth: ModelConfig = {
					...modelConfig,
					baseUrl: baseURL,
					customHeader: {
						...modelConfig.customHeader,
						Authorization: `Bearer ${accessToken}`,
					},
				};
				await this.geminiHandler.handleRequest(
					model,
					configWithAuth,
					messages,
					options,
					progress,
					token,
					accessToken,
				);
				return;
			}

			throw error;
		}
	}
}
