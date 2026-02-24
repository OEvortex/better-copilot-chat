/*---------------------------------------------------------------------------------------------
 *  Codex Provider
 *  Provider for OpenAI Codex models
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
import type { Account, OAuthCredentials } from "../../accounts/types";
import type { ModelConfig, ProviderConfig } from "../../types/sharedTypes";
import {
	CodexAuth,
	CodexHandler,
	codexLoginCommand,
	Logger,
} from "../../utils";
import { GenericModelProvider } from "../common/genericModelProvider";
import { configProviders } from "../config";

export class CodexProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	private static readonly PROVIDER_KEY = "codex";
	private cachedModels: ModelConfig[] = [];
	private readonly codexHandler: CodexHandler;

	constructor(context: vscode.ExtensionContext) {
		const virtualConfig: ProviderConfig = {
			displayName: "Codex",
			baseUrl: "https://chatgpt.com/backend-api/codex",
			apiKeyTemplate: "",
			models: [],
		};
		super(context, CodexProvider.PROVIDER_KEY, virtualConfig);
		this.codexHandler = new CodexHandler(virtualConfig.displayName);
	}

	static createAndActivate(context: vscode.ExtensionContext): {
		provider: CodexProvider;
		disposables: vscode.Disposable[];
	} {
		Logger.trace("Codex Provider activated!");

		const provider = new CodexProvider(context);

		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			"chp.codex",
			provider,
		);

		// Fire event to notify VS Code that models are available
		// This is needed because VS Code may not automatically query the provider
		setTimeout(() => {
			CodexAuth.isLoggedIn().then((isLoggedIn) => {
				if (isLoggedIn) {
					Logger.info("[Codex] User is logged in, firing model change event");
					provider._onDidChangeLanguageModelChatInformation.fire();
				}
			});
		}, 100);

		const loginCommand = vscode.commands.registerCommand(
			"chp.codex.login",
			async () => {
				await codexLoginCommand();
				await provider.modelInfoCache?.invalidateCache(
					CodexProvider.PROVIDER_KEY,
				);
				provider._onDidChangeLanguageModelChatInformation.fire();
			},
		);

		const logoutCommand = vscode.commands.registerCommand(
			"chp.codex.logout",
			async () => {
				await CodexAuth.logout();
				await provider.modelInfoCache?.invalidateCache(
					CodexProvider.PROVIDER_KEY,
				);
				provider._onDidChangeLanguageModelChatInformation.fire();
			},
		);

		const disposables = [providerDisposable, loginCommand, logoutCommand];
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}

		return { provider, disposables };
	}

	getProviderConfig(): ProviderConfig {
		return {
			displayName: "Codex",
			baseUrl: "https://chatgpt.com/backend-api/codex",
			apiKeyTemplate: "",
			models: this.cachedModels,
		};
	}

	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: vscode.CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		try {
			const isLoggedIn = await CodexAuth.isLoggedIn();

			if (!isLoggedIn) {
				if (!options.silent) {
					// Optional: Prompt for login if needed, but usually better to let user initiate
				}
				return [];
			}

			// Use models from configProviders
			const knownModels = configProviders.codex.models || [];

			this.cachedModels = knownModels.map((m) => ({
				id: m.id,
				name: m.name,
				tooltip: m.tooltip || `${m.name} - Codex`,
				maxInputTokens: m.maxInputTokens || 400000,
				maxOutputTokens: m.maxOutputTokens || 128000,
				sdkMode: "openai" as const,
				capabilities: {
					toolCalling: m.capabilities?.toolCalling ?? true,
					imageInput: m.capabilities?.imageInput ?? false,
				},
			}));

			const modelInfos: LanguageModelChatInformation[] = this.cachedModels.map(
				(model) => {
					return {
						id: model.id,
						name: model.name,
						vendor: "chp.codex",
						family: "Codex",
						version: "1.0",
						maxInputTokens: model.maxInputTokens,
						maxOutputTokens: model.maxOutputTokens,
						capabilities: {
							toolCalling: model.capabilities?.toolCalling ?? true,
							imageInput: model.capabilities?.imageInput ?? false,
						},
						tooltip: model.tooltip || model.name,
						detail: "Codex",
					};
				},
			);

			Logger.debug(`Codex Provider provides ${modelInfos.length} models`);
			return modelInfos;
		} catch (error) {
			Logger.error("Failed to get Codex models:", error);
			return [];
		}
	}

	async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<vscode.LanguageModelResponsePart2>,
		token: CancellationToken,
	): Promise<void> {
		const modelConfig = this.cachedModels.find((m) => m.id === model.id);
		if (!modelConfig) {
			throw new Error(`Model not found: ${model.id}`);
		}

		try {
			const configWithAuth: ModelConfig = {
				...modelConfig,
				model: model.id,
			};
			const providerKey = CodexProvider.PROVIDER_KEY;
			const loadBalanceEnabled =
				this.accountManager.getLoadBalanceEnabled(providerKey);
			const accounts = this.accountManager.getAccountsByProvider(providerKey);
			const activeAccount = this.accountManager.getActiveAccount(providerKey);

			const usableAccounts =
				accounts.filter((a) => a.status === "active").length > 0
					? accounts.filter((a) => a.status === "active")
					: accounts;

			const orderedAccounts = activeAccount
				? [
						...usableAccounts.filter((a) => a.id === activeAccount.id),
						...usableAccounts.filter((a) => a.id !== activeAccount.id),
					]
				: usableAccounts;

			const availableAccounts = loadBalanceEnabled
				? orderedAccounts.filter(
						(a) => !this.accountManager.isAccountQuotaLimited(a.id),
					)
				: orderedAccounts;

			const accountCandidates =
				availableAccounts.length > 0
					? availableAccounts
					: orderedAccounts.length > 0
						? orderedAccounts
						: [undefined];

			let lastError: unknown;
			let switchedAccount = false;

			for (const account of accountCandidates) {
				const authContext = await this.resolveAuthContext(account);
				if (!authContext.accessToken) {
					lastError = new Error("Not logged in to Codex. Please login first.");
					continue;
				}

				try {
					Logger.info(`Codex Provider processing request: ${model.name}`);
					Logger.info(
						`[codex] Using account "${authContext.displayName}" localId=${authContext.managedAccountId || "GLOBAL"} chatgptAccountId=${authContext.chatgptAccountId || "EMPTY"} organizationId=${authContext.organizationId || "EMPTY"} projectId=${authContext.projectId || "EMPTY"}`,
					);

					await this.codexHandler.handleRequest(
						model,
						configWithAuth,
						messages,
						options,
						progress,
						token,
						authContext.accessToken,
						authContext.managedAccountId,
						authContext.chatgptAccountId,
						authContext.organizationId,
						authContext.projectId,
					);

					if (
						switchedAccount &&
						loadBalanceEnabled &&
						account &&
						activeAccount?.id !== account.id
					) {
						await this.accountManager.switchAccount(providerKey, account.id);
					}
					return;
				} catch (error) {
					if (account && this.isQuotaError(error) && loadBalanceEnabled) {
						switchedAccount = true;
						lastError = error;
						continue;
					}
					throw error;
				}
			}

			if (lastError) {
				throw lastError;
			}
			throw new Error("Not logged in to Codex. Please login first.");
		} catch (error) {
			Logger.error("Codex request failed:", error);
			throw error;
		}
	}

	private async resolveAuthContext(account?: Account): Promise<{
		accessToken: string;
		managedAccountId?: string;
		chatgptAccountId?: string;
		organizationId?: string;
		projectId?: string;
		displayName: string;
	}> {
		if (!account) {
			return {
				accessToken: (await CodexAuth.getAccessToken()) || "",
				chatgptAccountId: (await CodexAuth.getAccountId()) || "",
				organizationId: (await CodexAuth.getOrganizationId()) || "",
				projectId: (await CodexAuth.getProjectId()) || "",
				displayName: "Global Codex Session",
			};
		}

		let accessToken = "";
		const credentials = (await this.accountManager.getCredentials(
			account.id,
		)) as OAuthCredentials | undefined;

		if (credentials?.accessToken) {
			accessToken = credentials.accessToken;
			const expiresAtMs = credentials.expiresAt
				? new Date(credentials.expiresAt).getTime()
				: 0;
			const shouldRefresh =
				!!credentials.refreshToken &&
				(expiresAtMs === 0 || expiresAtMs - Date.now() <= 5 * 60 * 1000);

			if (shouldRefresh) {
				const refreshed = await CodexAuth.refreshToken(credentials.refreshToken, {
					persist: false,
				});
				if (refreshed?.accessToken) {
					accessToken = refreshed.accessToken;
					await this.accountManager.updateCredentials(account.id, {
						...credentials,
						accessToken: refreshed.accessToken,
						expiresAt: refreshed.expiresAt,
					});
				}
			}
		}

		if (!accessToken) {
			accessToken = (await CodexAuth.getAccessToken()) || "";
		}

		const metadata = account.metadata || {};
		const metadataAccountId =
			typeof metadata.accountId === "string" ? metadata.accountId : undefined;
		const metadataOrgId =
			typeof metadata.organizationId === "string"
				? metadata.organizationId
				: undefined;
		const metadataProjectId =
			typeof metadata.projectId === "string" ? metadata.projectId : undefined;

		return {
			accessToken,
			managedAccountId: account.id,
			chatgptAccountId: metadataAccountId || (await CodexAuth.getAccountId()) || "",
			organizationId:
				metadataOrgId || (await CodexAuth.getOrganizationId()) || "",
			projectId: metadataProjectId || (await CodexAuth.getProjectId()) || "",
			displayName: account.displayName,
		};
	}

	protected override isQuotaError(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}
		const msg = error.message;
		return (
			msg.includes('"type":"usage_limit_reached"') ||
			msg.includes('"type": "usage_limit_reached"') ||
			msg.includes("usage_limit_reached") ||
			msg.includes("429")
		);
	}
}
