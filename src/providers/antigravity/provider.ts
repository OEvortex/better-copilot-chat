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
import type { Account } from "../../accounts/types";
import { ProviderKey } from "../../types/providerKeys";
import type { ModelConfig, ProviderConfig } from "../../types/sharedTypes";
import { ConfigManager, Logger } from "../../utils";
import { GenericModelProvider } from "../common/genericModelProvider";
import { AntigravityAuth, antigravityLoginCommand } from "./auth";
import { AntigravityHandler } from "./handler";


export class AntigravityProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	private static readonly PROVIDER_KEY = ProviderKey.Antigravity;
	private cachedModels: ModelConfig[] = [];
	private readonly antigravityHandler: AntigravityHandler;
	readonly accountManager: AccountManager;
	readonly lastUsedAccountByModel = new Map<string, string>();

	constructor(context: vscode.ExtensionContext) {
		const virtualConfig: ProviderConfig = {
			displayName: "Antigravity",
			baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
			apiKeyTemplate: "",
			models: [],
		};
		super(context, AntigravityProvider.PROVIDER_KEY, virtualConfig);
		this.antigravityHandler = new AntigravityHandler(virtualConfig.displayName);
		this.accountManager = AccountManager.getInstance();
	}

	static createAndActivate(context: vscode.ExtensionContext): {
		provider: AntigravityProvider;
		disposables: vscode.Disposable[];
	} {
		Logger.trace("Antigravity Provider activated!");
		const provider = new AntigravityProvider(context);
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			"chp.antigravity",
			provider,
		);
		const loginCommand = vscode.commands.registerCommand(
			"chp.antigravity.login",
			async () => {
				await antigravityLoginCommand();
				await provider.modelInfoCache?.invalidateCache(
					AntigravityProvider.PROVIDER_KEY,
				);
				provider._onDidChangeLanguageModelChatInformation.fire();
			},
		);
		const logoutCommand = vscode.commands.registerCommand(
			"chp.antigravity.logout",
			async () => {
				await AntigravityAuth.logout();
				await provider.modelInfoCache?.invalidateCache(
					AntigravityProvider.PROVIDER_KEY,
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
			displayName: "Antigravity",
			baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
			apiKeyTemplate: "",
			models: this.cachedModels,
		};
	}

	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: vscode.CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		try {
			const isLoggedIn = await AntigravityAuth.isLoggedIn();
			if (!isLoggedIn) {
				if (!options.silent) {
					const action = await vscode.window.showInformationMessage(
						"Antigravity requires login. Would you like to login now?",
						"Login",
						"Cancel",
					);
					if (action === "Login") {
						await antigravityLoginCommand();
					}
				}
				return [];
			}
			let models = await AntigravityAuth.getCachedModels();
			if (models.length === 0) {
				models = await AntigravityAuth.getModels();
			}
			if (models.length === 0) {
				Logger.warn("No Antigravity models available");
				return [];
			}
			// Get provider overrides from settings
			const overrides = ConfigManager.getProviderOverrides();
			const antigravityOverride = overrides[AntigravityProvider.PROVIDER_KEY];
			const modelOverrides = antigravityOverride?.models || [];
			const baseUrlOverride = antigravityOverride?.baseUrl;

			this.cachedModels = models.map((m) => {
				// Find override for this model
				const override = modelOverrides.find((o) => o.id === m.id);
				const effectiveSdkMode = override?.sdkMode || 'anthropic';

				// Calculate context window split: 200K+ = 32K output, <200K = 16K output
				const totalContext = m.maxTokens || 200000;
				const OUTPUT_THRESHOLD = 200000;
				const MAX_OUTPUT_32K = 32000;
				const MAX_OUTPUT_16K = 16000;

				let maxOutput =
					override?.maxOutputTokens || m.maxOutputTokens || (totalContext >= OUTPUT_THRESHOLD ? MAX_OUTPUT_32K : MAX_OUTPUT_16K);

				// Ensure output doesn't exceed context
				if (maxOutput >= totalContext) {
					maxOutput = totalContext >= OUTPUT_THRESHOLD ? MAX_OUTPUT_32K : MAX_OUTPUT_16K;
				}
				const maxInput = Math.max(1, totalContext - maxOutput);

				const baseConfig: ModelConfig = {
					id: m.id,
					name: m.displayName || m.name,
					tooltip: `${m.displayName} - Antigravity`,
					maxInputTokens: maxInput,
					maxOutputTokens: maxOutput,
					sdkMode: effectiveSdkMode,
					capabilities: { toolCalling: true, imageInput: true },
				};

				if (baseUrlOverride) {
					baseConfig.baseUrl = baseUrlOverride;
				}

				// Apply extraBody from override if present
				if (override?.extraBody) {
					baseConfig.extraBody = override.extraBody;
					Logger.debug(
						`[Antigravity] Applied extraBody override to model ${m.id}`,
					);
				}

				// Apply outputThinking from override if present
				if (override?.outputThinking !== undefined) {
					baseConfig.outputThinking = override.outputThinking;
				}

				return baseConfig;
			});
			const rememberLastModel = ConfigManager.getRememberLastModel();
			let lastSelectedId: string | undefined;
			if (rememberLastModel) {
				lastSelectedId =
					this.modelInfoCache?.getLastSelectedModel(
						AntigravityProvider.PROVIDER_KEY,
					) ?? undefined;
			}
			const modelInfos: LanguageModelChatInformation[] = this.cachedModels.map(
				(model) => {
					return {
						id: model.id,
						name: model.name,
						vendor: "chp.antigravity",
						family: "Antigravity",
						version: "1.0",
						maxInputTokens: model.maxInputTokens,
						maxOutputTokens: model.maxOutputTokens,
						isDefault: rememberLastModel && model.id === lastSelectedId,
						capabilities: {
							toolCalling: model.capabilities?.toolCalling ?? true,
							imageInput: model.capabilities?.imageInput ?? true,
						},
						tooltip: model.tooltip || model.name,
						detail: "Antigravity",
					};
				},
			);
			Logger.debug(`Antigravity Provider provides ${modelInfos.length} models`);
			return modelInfos;
		} catch (error) {
			Logger.error("Failed to get Antigravity models:", error);
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
		const rememberLastModel = ConfigManager.getRememberLastModel();
		if (rememberLastModel) {
			this.modelInfoCache
				?.saveLastSelectedModel(AntigravityProvider.PROVIDER_KEY, model.id)
				.catch((err) =>
					Logger.warn("[antigravity] Failed to save model selection:", err),
				);
		}
		const modelConfig = this.cachedModels.find((m) => m.id === model.id);
		if (!modelConfig) {
			throw new Error(`Model not found: ${model.id}`);
		}
		try {
			const configWithAuth: ModelConfig = { ...modelConfig, model: model.id };
			const accounts = this.accountManager.getAccountsByProvider(
				AntigravityProvider.PROVIDER_KEY,
			);
			const loadBalanceEnabled = this.accountManager.getLoadBalanceEnabled(
				AntigravityProvider.PROVIDER_KEY,
			);
			const assignedAccountId = this.accountManager.getAccountIdForModel(
				AntigravityProvider.PROVIDER_KEY,
				model.id,
			);
			if (accounts.length === 0) {
				const accessToken = await AntigravityAuth.getAccessToken();
				if (!accessToken) {
					throw new Error("Not logged in to Antigravity. Please login first.");
				}
				Logger.info(
					`Antigravity Provider processing request: ${model.name} (default account)`,
				);
				await this.antigravityHandler.handleRequest(
					model,
					configWithAuth,
					messages,
					options,
					progress,
					token,
					accessToken,
					undefined,
					loadBalanceEnabled,
				);
				return;
			}
			const usableAccounts =
				accounts.filter((a) => a.status === "active").length > 0
					? accounts.filter((a) => a.status === "active")
					: accounts;
			const candidates = this.buildAccountCandidates(
				model.id,
				usableAccounts,
				assignedAccountId,
				loadBalanceEnabled,
				AntigravityProvider.PROVIDER_KEY,
			);

			// Lấy active account để luôn ưu tiên nó đầu tiên
			const activeAccount = this.accountManager.getActiveAccount(
				AntigravityProvider.PROVIDER_KEY,
			);

			const available = loadBalanceEnabled
				? candidates.filter(
						(a) =>
							!this.accountManager.isAccountQuotaLimited(a.id) &&
							!this.antigravityHandler.isInCooldown(model.id, a.id),
					)
				: candidates;

			// Đảm bảo activeAccount luôn được thử đầu tiên nếu nó trong candidates
			// Chỉ skip nếu thực sự bị lỗi khi gọi API
			let accountsToTry: Account[];
			if (available.length > 0) {
				// Nếu activeAccount available, đảm bảo nó ở đầu
				if (activeAccount && available.some((a) => a.id === activeAccount.id)) {
					accountsToTry = [
						activeAccount,
						...available.filter((a) => a.id !== activeAccount.id),
					];
				} else {
					accountsToTry = available;
				}
			} else {
				// Fallback to candidates, ưu tiên activeAccount
				if (
					activeAccount &&
					candidates.some((a) => a.id === activeAccount.id)
				) {
					accountsToTry = [
						activeAccount,
						...candidates.filter((a) => a.id !== activeAccount.id),
					];
				} else {
					accountsToTry = candidates;
				}
			}

			Logger.debug(
				`[antigravity] Active account: ${activeAccount?.displayName || "none"}, accountsToTry: ${accountsToTry.map((a) => a.displayName).join(", ")}`,
			);
			let lastError: unknown;
			let switchedAccount = false;
			for (const account of accountsToTry) {
				const accessToken = await this.getAccessTokenForAccount(account);
				if (!accessToken) {
					lastError = new Error(
						`Missing Antigravity credentials for ${account.displayName}`,
					);
					continue;
				}
				try {
					Logger.info(
						`Antigravity Provider: ${model.name} using account "${account.displayName}" (ID: ${account.id})`,
					);
					await this.antigravityHandler.handleRequest(
						model,
						configWithAuth,
						messages,
						options,
						progress,
						token,
						accessToken,
						account.id,
						loadBalanceEnabled,
					);
					this.lastUsedAccountByModel.set(model.id, account.id);
					if (switchedAccount) {
						if (loadBalanceEnabled) {
							const switched = await this.accountManager.switchAccount(
								AntigravityProvider.PROVIDER_KEY,
								account.id,
							);
							if (!switched) {
								Logger.warn(
									`[antigravity] Failed to persist automatic account switch to ${account.displayName}`,
								);
							}
						}
						Logger.info(
							`[antigravity] Saving account "${account.displayName}" as preferred for model ${model.id}`,
						);
						await this.accountManager.setAccountForModel(
							AntigravityProvider.PROVIDER_KEY,
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
								`[antigravity] Account ${account.displayName} quota exhausted, switching...`,
							);
							lastError = error;
							continue;
						}
						throw error;
					}
					if (loadBalanceEnabled && this.isCapacityExhaustedError(error)) {
						Logger.warn(
							`[antigravity] Account ${account.displayName} model capacity exhausted, switching...`,
						);
						lastError = error;
						continue;
					}
					if (loadBalanceEnabled && this.isQuotaError(error)) {
						Logger.warn(
							`[antigravity] Account ${account.displayName} rate limited, switching...`,
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
			throw new Error("No available Antigravity accounts for this request.");
		} catch (error) {
			Logger.error("Antigravity request failed:", error);
			throw error;
		} finally {
			Logger.info(`Antigravity Provider: ${model.name} request completed`);
		}
	}

	protected override buildAccountCandidates(
		modelId: string,
		accounts: Account[],
		assignedAccountId: string | undefined,
		loadBalanceEnabled: boolean,
		providerKey: string,
	): Account[] {
		if (accounts.length === 0) {
			return [];
		}
		const assignedAccount = assignedAccountId
			? accounts.find((a) => a.id === assignedAccountId)
			: undefined;
		const activeAccount = this.accountManager.getActiveAccount(providerKey);
		const defaultAccount =
			activeAccount || accounts.find((a) => a.isDefault) || accounts[0];
		if (!loadBalanceEnabled) {
			return assignedAccount
				? [assignedAccount]
				: defaultAccount
					? [defaultAccount]
					: [];
		}
		const ordered = [...accounts].sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		);
		const lastUsed = this.lastUsedAccountByModel.get(modelId);
		let rotatedOrder = ordered;
		if (lastUsed) {
			const index = ordered.findIndex((a) => a.id === lastUsed);
			if (index >= 0) {
				rotatedOrder = [
					...ordered.slice(index + 1),
					...ordered.slice(0, index + 1),
				];
			}
		}
		if (assignedAccount) {
			return [
				assignedAccount,
				...rotatedOrder.filter((a) => a.id !== assignedAccount.id),
			];
		}
		if (defaultAccount) {
			return [
				defaultAccount,
				...rotatedOrder.filter((a) => a.id !== defaultAccount.id),
			];
		}
		return rotatedOrder;
	}

	private async getAccessTokenForAccount(
		account: Account,
	): Promise<string | null> {
		const credentials = await this.accountManager.getCredentials(account.id);
		if (!credentials || !("accessToken" in credentials)) {
			return null;
		}
		const expiresAt = credentials.expiresAt
			? new Date(credentials.expiresAt).getTime()
			: 0;
		if (expiresAt && expiresAt - Date.now() > 5 * 60 * 1000) {
			return credentials.accessToken;
		}
		if (!("refreshToken" in credentials) || !credentials.refreshToken) {
			return credentials.accessToken;
		}
		const refreshed = await AntigravityAuth.refreshToken(
			credentials.refreshToken,
			{
				persist: account.isDefault === true,
			},
		);
		if (!refreshed) {
			return null;
		}
		await this.accountManager.updateCredentials(account.id, {
			...credentials,
			accessToken: refreshed.accessToken,
			expiresAt: refreshed.expiresAt,
		});
		return refreshed.accessToken;
	}

	protected override isQuotaError(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}
		const msg = error.message;
		return (
			msg.startsWith("Quota exceeded") ||
			msg.startsWith("Rate limited") ||
			msg.includes("HTTP 429") ||
			msg.includes('"code": 429') ||
			msg.includes('"code":429') ||
			msg.includes("RESOURCE_EXHAUSTED") ||
			(msg.includes("429") && msg.includes("Resource has been exhausted"))
		);
	}

	protected override isLongTermQuotaExhausted(error: unknown): boolean {
		return (
			error instanceof Error &&
			error.message.startsWith("Account quota exhausted")
		);
	}

	protected isCapacityExhaustedError(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}
		const message = error.message.toLowerCase();
		return (
			message.includes("model_capacity_exhausted") ||
			message.includes("no capacity available for model") ||
			(message.includes("http 503") && message.includes("capacity")) ||
			(message.includes('"code": 503') && message.includes("unavailable")) ||
			(message.includes('"code":503') && message.includes("unavailable"))
		);
	}
}
