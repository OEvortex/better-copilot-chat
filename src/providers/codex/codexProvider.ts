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
import { AccountManager } from "../../accounts";
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
	private readonly accountManager: AccountManager;

	constructor(context: vscode.ExtensionContext) {
		const virtualConfig: ProviderConfig = {
			displayName: "Codex",
			baseUrl: "https://chatgpt.com/backend-api/codex",
			apiKeyTemplate: "",
			models: [],
		};
		super(context, CodexProvider.PROVIDER_KEY, virtualConfig);
		this.codexHandler = new CodexHandler(virtualConfig.displayName);
		this.accountManager = AccountManager.getInstance();
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
				(model) => ({
					id: model.id,
					name: model.name,
					vendor: "chp.codex",
					family: "codex",
					version: "1.0",
					maxInputTokens: model.maxInputTokens,
					maxOutputTokens: model.maxOutputTokens,
					capabilities: {
						toolCalling: model.capabilities?.toolCalling ?? true,
						imageInput: model.capabilities?.imageInput ?? false,
					},
					tooltip: model.tooltip || model.name,
					detail: "Codex",
				}),
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
			const accounts = this.accountManager.getAccountsByProvider(providerKey);

			// Simple account selection for now (first available or default)
			// Can be enhanced with load balancing later if needed
			let accessToken = "";
			let accountId = "";
			let organizationId = "";
			let projectId = "";

			if (accounts.length > 0) {
				// Use first account
				// We need to get the actual token, which might need refresh
				// AccountManager stores credentials, but we should use CodexAuth to ensure validity/refresh
				// However, CodexAuth currently manages a single "global" token in ApiKeyManager for backward compat
				// If we use AccountManager, we should use its credentials.
				// For now, let's stick to CodexAuth global token to match current implementation
				accessToken = (await CodexAuth.getAccessToken()) || "";
				accountId = (await CodexAuth.getAccountId()) || "";
				organizationId = (await CodexAuth.getOrganizationId()) || "";
				projectId = (await CodexAuth.getProjectId()) || "";
			} else {
				accessToken = (await CodexAuth.getAccessToken()) || "";
				accountId = (await CodexAuth.getAccountId()) || "";
				organizationId = (await CodexAuth.getOrganizationId()) || "";
				projectId = (await CodexAuth.getProjectId()) || "";
			}

			if (!accessToken) {
				throw new Error("Not logged in to Codex. Please login first.");
			}

			Logger.info(`Codex Provider processing request: ${model.name}`);
			Logger.info(
				`[codex] Retrieved from storage - accountId: ${accountId || "EMPTY"}, organizationId: ${organizationId || "EMPTY"}, projectId: ${projectId || "EMPTY"}`,
			);
			await this.codexHandler.handleRequest(
				model,
				configWithAuth,
				messages,
				options,
				progress,
				token,
				accessToken,
				accountId,
				organizationId,
				projectId,
			);
		} catch (error) {
			Logger.error("Codex request failed:", error);
			throw error;
		}
	}
}
