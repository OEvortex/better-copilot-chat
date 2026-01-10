/*---------------------------------------------------------------------------------------------
 *  Qwen Code CLI Provider
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
import { Logger } from "../../utils/logger";
import { GenericModelProvider } from "../common/genericModelProvider";
import { QwenOAuthManager } from "./auth";

class ThinkingBlockParser {
	private inThinkingBlock = false;
	private buffer = "";

	parse(text: string): { regular: string; thinking: string } {
		let regular = "";
		let thinking = "";
		this.buffer += text;

		while (true) {
			if (this.inThinkingBlock) {
				const endIdx = this.buffer.indexOf("</think>");
				if (endIdx !== -1) {
					thinking += this.buffer.substring(0, endIdx);
					this.buffer = this.buffer.substring(endIdx + 8);
					this.inThinkingBlock = false;
				} else {
					thinking += this.buffer;
					this.buffer = "";
					break;
				}
			} else {
				const startIdx = this.buffer.indexOf("<think>");
				if (startIdx !== -1) {
					regular += this.buffer.substring(0, startIdx);
					this.buffer = this.buffer.substring(startIdx + 7);
					this.inThinkingBlock = true;
				} else {
					regular += this.buffer;
					this.buffer = "";
					break;
				}
			}
		}
		return { regular, thinking };
	}
}

export class QwenCliProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	private readonly cooldowns = new Map<string, number>();

	private isInCooldown(modelId: string): boolean {
		const until = this.cooldowns.get(modelId);
		return typeof until === "number" && Date.now() < until;
	}

	private setCooldown(modelId: string, ms = 10000): void {
		this.cooldowns.set(modelId, Date.now() + ms);
	}

	private isRateLimitError(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}
		const msg = error.message;
		return (
			msg.includes("HTTP 429") ||
			msg.includes("Rate limited") ||
			msg.includes("Quota exceeded") ||
			msg.includes("429")
		);
	}

	static override createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: QwenCliProvider; disposables: vscode.Disposable[] } {
		Logger.trace(`${providerConfig.displayName} provider activated!`);
		const provider = new QwenCliProvider(context, providerKey, providerConfig);
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			`chp.${providerKey}`,
			provider,
		);

		const loginCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.login`,
			async () => {
				try {
					const { accessToken, baseURL } =
						await QwenOAuthManager.getInstance().ensureAuthenticated(true);
					vscode.window.showInformationMessage(
						`${providerConfig.displayName} login successful!`,
					);
					// Register CLI-managed account in AccountManager if not present
					try {
						const accountManager = AccountManager.getInstance();
						const existing = accountManager
							.getAccountsByProvider("qwencli")
							.find((a) => a.metadata?.source === "cli");
						if (!existing) {
							await accountManager.addOAuthAccount(
								"qwencli",
								"Qwen CLI (Local)",
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
							"[qwencli] Failed to register CLI account with AccountManager",
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
			this.modelConfigToInfo(model),
		);
	}

	override async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<vscode.LanguageModelResponsePart2>,
		token: CancellationToken,
	): Promise<void> {
		const modelConfig = this.providerConfig.models.find(
			(m: ModelConfig) => m.id === model.id,
		);
		if (!modelConfig) {
			throw new Error(`Model not found: ${model.id}`);
		}

		try {
			// Short cooldown check to avoid hammering after rate limits
			if (this.isInCooldown(model.id)) {
				throw new Error("Rate limited: please try again later");
			}

			// Try to use managed accounts first (load balancing if configured)
			const accountManager = AccountManager.getInstance();
			const accounts = accountManager.getAccountsByProvider("qwencli");
			const loadBalanceEnabled =
				accountManager.getLoadBalanceEnabled("qwencli");
			const assignedAccountId = accountManager.getAccountIdForModel(
				"qwencli",
				model.id,
			);

			// Helper to attempt using account credentials
			const tryAccountRequest = async (
				account: Account,
				accountAccessToken?: string,
			) => {
				if (!accountAccessToken) {
					const creds = (await accountManager.getCredentials(account.id)) as
						| AccountCredentials
						| undefined;
					if (!creds) {
						return { success: false, reason: "no-creds" };
					}
					if ("accessToken" in creds) {
						accountAccessToken = (creds as OAuthCredentials).accessToken;
					} else if ("apiKey" in creds) {
						accountAccessToken = (creds as ApiKeyCredentials).apiKey;
					}
					if (!accountAccessToken) {
						return { success: false, reason: "no-token" };
					}
				}

				const configWithAuth: ModelConfig = {
					...modelConfig,
					baseUrl: modelConfig.baseUrl || undefined,
					customHeader: {
						...(modelConfig.customHeader || {}),
						Authorization: `Bearer ${accountAccessToken}`,
					},
				};

				try {
					await this.openaiHandler.handleRequest(
						model,
						configWithAuth,
						messages,
						options,
						progress,
						token,
					);
					return { success: true };
				} catch (err) {
					return { success: false, error: err };
				}
			};

			// If there are managed accounts, attempt to use them with optional load balancing
			if (accounts && accounts.length > 0) {
				const usableAccounts = accounts.filter((a) => a.status === "active");
				const candidates =
					usableAccounts.length > 0 ? usableAccounts : accounts;

				// If load balance is enabled, try multiple accounts, otherwise use active/default account
				const activeAccount = accountManager.getActiveAccount("qwencli");
				let accountsToTry: Account[];
				if (loadBalanceEnabled) {
					// Place assignedAccountId or activeAccount first
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
				} else {
					const assigned = assignedAccountId
						? accounts.find((a) => a.id === assignedAccountId)
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
							// Save preferred account mapping
							accountManager
								.setAccountForModel("qwencli", model.id, account.id)
								.catch(() => {});
						}
						return;
					}

					lastError = result.error ?? result.reason;

					// If 401, mark account expired and continue
					if (
						result.error instanceof Error &&
						result.error.message.includes("401")
					) {
						await accountManager.markAccountExpired(account.id);
						continue;
					}

					// If rate limited and load balancing enabled, try next account
					if (this.isRateLimitError(result.error) && loadBalanceEnabled) {
						switchedAccount = true;
						continue;
					}

					// Other errors -> rethrow
					if (result.error) {
						throw result.error;
					}
				}

				if (lastError) {
					// No managed account worked, fall back to CLI OAuth behavior below
					Logger.warn(
						"[qwencli] Managed accounts failed, falling back to CLI credentials",
						lastError,
					);
				}
			}

			// Fallback: Ensure we read latest token (in case CLI updated credentials externally)
			const { accessToken, baseURL } =
				await QwenOAuthManager.getInstance().ensureAuthenticated();

			// Update handler with latest credentials (CLI)
			// Pass accessToken as apiKey so OpenAIHandler uses it for Authorization header
			const configWithAuth: ModelConfig = {
				...modelConfig,
				baseUrl: baseURL,
				apiKey: accessToken,
				customHeader: modelConfig.customHeader,
			};

			const thinkingParser = new ThinkingBlockParser();
			let currentThinkingId: string | null = null;

			let functionCallsBuffer = "";
			const wrappedProgress: Progress<vscode.LanguageModelResponsePart2> = {
				report: (part) => {
					if (part instanceof vscode.LanguageModelTextPart) {
						// First, parse thinking blocks
						const { regular, thinking } = thinkingParser.parse(part.value);

						if (thinking) {
							if (!currentThinkingId) {
								currentThinkingId = `qwen_thinking_${Date.now()}`;
							}
							progress.report(
								new vscode.LanguageModelThinkingPart(
									thinking,
									currentThinkingId,
								),
							);
						}

						// Next, handle function_calls XML embedded in regular text
						const textToHandle = functionCallsBuffer + (regular || "");
						// Extract complete <function_calls>...</function_calls> blocks
						const funcCallsRegex =
							/<function_calls>[\s\S]*?<\/function_calls>/g;
						let lastIdx = 0;
						let fm = funcCallsRegex.exec(textToHandle);
						while (fm !== null) {
							const before = textToHandle.slice(lastIdx, fm.index);
							if (before && before.length > 0) {
								// End thinking if needed before reporting text
								if (currentThinkingId) {
									progress.report(
										new vscode.LanguageModelThinkingPart("", currentThinkingId),
									);
									currentThinkingId = null;
								}
								progress.report(new vscode.LanguageModelTextPart(before));
							}

							// Parse tool calls inside block
							const block = fm[0];
							const toolCallRegex =
								/<tool_call\s+name="([^"]+)"\s+arguments='([^']*)'\s*\/>/g;
							let tm = toolCallRegex.exec(block);
							while (tm !== null) {
								const name = tm[1];
								const argsString = tm[2] || "";
								let argsObj: Record<string, unknown> = {};
								try {
									argsObj = JSON.parse(argsString);
								} catch {
									argsObj = { value: argsString };
								}
								const callId = `qwen_call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
								// Make sure thinking is ended before tool call
								if (currentThinkingId) {
									progress.report(
										new vscode.LanguageModelThinkingPart("", currentThinkingId),
									);
									currentThinkingId = null;
								}
								progress.report(
									new vscode.LanguageModelToolCallPart(callId, name, argsObj),
								);
								tm = toolCallRegex.exec(block);
							}

							lastIdx = funcCallsRegex.lastIndex;
							fm = funcCallsRegex.exec(textToHandle);
						}

						const trailing = textToHandle.slice(lastIdx);
						// If trailing contains start of a <function_calls> but no close, keep it buffered
						const openStart = trailing.indexOf("<function_calls>");
						const closeEnd = trailing.indexOf("</function_calls>");
						if (openStart !== -1 && closeEnd === -1) {
							// Emit text before openStart
							const beforeOpen = trailing.slice(0, openStart);
							if (beforeOpen && beforeOpen.length > 0) {
								if (currentThinkingId) {
									progress.report(
										new vscode.LanguageModelThinkingPart("", currentThinkingId),
									);
									currentThinkingId = null;
								}
								progress.report(new vscode.LanguageModelTextPart(beforeOpen));
							}
							functionCallsBuffer = trailing.slice(openStart);
						} else {
							functionCallsBuffer = "";
							if (trailing && trailing.length > 0) {
								if (currentThinkingId) {
									progress.report(
										new vscode.LanguageModelThinkingPart("", currentThinkingId),
									);
									currentThinkingId = null;
								}
								progress.report(new vscode.LanguageModelTextPart(trailing));
							}
						}
					} else {
						// Forward other parts unchanged
						progress.report(part);
					}
				},
			};

			await this.openaiHandler.handleRequest(
				model,
				configWithAuth,
				messages,
				options,
				wrappedProgress,
				token,
			);
		} catch (error) {
			// If we got a 401, invalidate cached credentials and retry once with fresh token
			if (error instanceof Error && error.message.includes("401")) {
				QwenOAuthManager.getInstance().invalidateCredentials();
				const { accessToken, baseURL } =
					await QwenOAuthManager.getInstance().ensureAuthenticated(true);
				const configWithAuth: ModelConfig = {
					...modelConfig,
					baseUrl: baseURL,
					customHeader: {
						...modelConfig.customHeader,
						Authorization: `Bearer ${accessToken}`,
					},
				};
				await this.openaiHandler.handleRequest(
					model,
					configWithAuth,
					messages,
					options,
					progress,
					token,
				);
				return;
			}

			// If we got a rate limit error, set short cooldown and surface a friendly error
			if (this.isRateLimitError(error)) {
				this.setCooldown(model.id, 10000);
				throw new Error("Rate limited: please try again in a few seconds");
			}

			throw error;
		}
	}
}
