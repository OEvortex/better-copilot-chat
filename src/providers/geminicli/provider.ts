/*---------------------------------------------------------------------------------------------
 *  Gemini CLI Provider
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
    CancellationToken,
    LanguageModelChatInformation,
    LanguageModelChatMessage,
    LanguageModelChatProvider,
    Progress,
    ProvideLanguageModelChatResponseOptions
} from 'vscode';
import { GenericModelProvider } from '../common/genericModelProvider';
import { ProviderConfig, ModelConfig } from '../../types/sharedTypes';
import { Logger } from '../../utils/logger';
import { GeminiOAuthManager } from './auth';
import { GeminiHandler } from './handler';
import { AccountManager, Account, AccountCredentials, OAuthCredentials, ApiKeyCredentials } from '../../accounts';

export class GeminiCliProvider extends GenericModelProvider implements LanguageModelChatProvider {
    private readonly geminiHandler: GeminiHandler;
    private readonly cooldowns = new Map<string, number>();

    constructor(context: vscode.ExtensionContext, providerKey: string, providerConfig: ProviderConfig) {
        super(context, providerKey, providerConfig);
        this.geminiHandler = new GeminiHandler(providerConfig.displayName);
    }

    private isInCooldown(modelId: string): boolean {
        const until = this.cooldowns.get(modelId);
        return typeof until === 'number' && Date.now() < until;
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
            msg.includes('HTTP 429') ||
            msg.includes('Rate limited') ||
            msg.includes('Quota exceeded') ||
            msg.includes('429')
        );
    }

    static override createAndActivate(
        context: vscode.ExtensionContext,
        providerKey: string,
        providerConfig: ProviderConfig
    ): { provider: GeminiCliProvider; disposables: vscode.Disposable[] } {
        Logger.trace(`${providerConfig.displayName} provider activated!`);
        const provider = new GeminiCliProvider(context, providerKey, providerConfig);
        const providerDisposable = vscode.lm.registerLanguageModelChatProvider(`chp.${providerKey}`, provider);

        const loginCommand = vscode.commands.registerCommand(`chp.${providerKey}.login`, async () => {
            try {
                const { accessToken, baseURL } = await GeminiOAuthManager.getInstance().ensureAuthenticated(true);
                vscode.window.showInformationMessage(`${providerConfig.displayName} login successful!`);
                // Register CLI-managed account in AccountManager if not present
                try {
                    const accountManager = AccountManager.getInstance();
                    const existing = accountManager.getAccountsByProvider('geminicli').find(a => a.metadata?.source === 'cli');
                    if (!existing) {
                        await accountManager.addOAuthAccount(
                            'geminicli',
                            'Gemini CLI (Local)',
                            '',
                            { accessToken: accessToken ?? '', refreshToken: '', expiresAt: '', tokenType: '' },
                            { source: 'cli', baseURL }
                        );
                    }
                } catch (e) {
                    Logger.warn('[geminicli] Failed to register CLI account with AccountManager', e);
                }
                await provider.modelInfoCache?.invalidateCache(providerKey);
                provider._onDidChangeLanguageModelChatInformation.fire();
            } catch (error) {
                vscode.window.showErrorMessage(`${providerConfig.displayName} login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });

        const disposables = [providerDisposable, loginCommand];
        disposables.forEach(disposable => context.subscriptions.push(disposable));
        return { provider, disposables };
    }

    override async provideLanguageModelChatInformation(
        _options: { silent: boolean },
        _token: CancellationToken
    ): Promise<LanguageModelChatInformation[]> {
        // Always return models immediately without any async checks
        // This prevents the UI from refreshing/flickering when trying to add models
        // Authentication check will happen when user tries to use the model
        return this.providerConfig.models.map(model => this.modelConfigToInfo(model));
    }

    override async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<vscode.LanguageModelResponsePart2>,
        token: CancellationToken
    ): Promise<void> {
        const modelConfig = this.providerConfig.models.find((m: ModelConfig) => m.id === model.id);
        if (!modelConfig) {
            throw new Error(`Model not found: ${model.id}`);
        }

        try {
            if (this.isInCooldown(model.id)) {
                throw new Error('Rate limited: please try again later');
            }

            // Try managed accounts first
            const accountManager = AccountManager.getInstance();
            const accounts = accountManager.getAccountsByProvider('geminicli');
            const loadBalanceEnabled = accountManager.getLoadBalanceEnabled('geminicli');
            const assignedAccountId = accountManager.getAccountIdForModel('geminicli', model.id);

            const tryAccountRequest = async (account: Account) => {
                const creds = (await accountManager.getCredentials(account.id)) as AccountCredentials | undefined;
                if (!creds) return { success: false, reason: 'no-creds' };
                let acctToken: string | undefined;
                if ('accessToken' in creds) {
                    acctToken = (creds as OAuthCredentials).accessToken;
                } else if ('apiKey' in creds) {
                    acctToken = (creds as ApiKeyCredentials).apiKey;
                }
                if (!acctToken) return { success: false, reason: 'no-token' };

                const configWithAuth: ModelConfig = {
                    ...modelConfig,
                    baseUrl: modelConfig.baseUrl || undefined,
                    customHeader: { ...(modelConfig.customHeader || {}), Authorization: `Bearer ${acctToken}` }
                };

                try {
                    await this.geminiHandler.handleRequest(
                        model,
                        configWithAuth,
                        messages,
                        options,
                        progress,
                        token,
                        acctToken
                    );
                    return { success: true };
                } catch (err) {
                    return { success: false, error: err };
                }
            };

            if (accounts && accounts.length > 0) {
                const usableAccounts = accounts.filter((a: Account) => a.status === 'active');
                const candidates = usableAccounts.length > 0 ? usableAccounts : accounts;

                const activeAccount = accountManager.getActiveAccount('geminicli');
                let accountsToTry: Account[];
                if (loadBalanceEnabled) {
                    if (activeAccount && candidates.some((a: Account) => a.id === activeAccount.id)) {
                        accountsToTry = [activeAccount, ...candidates.filter((a: Account) => a.id !== activeAccount.id)];
                    } else {
                        accountsToTry = candidates;
                    }
                } else {
                    const assigned = assignedAccountId ? accounts.find((a: Account) => a.id === assignedAccountId) : activeAccount;
                    accountsToTry = assigned ? [assigned] : candidates.length > 0 ? [candidates[0]] : [];
                }

                let lastError: unknown;
                let switchedAccount = false;
                for (const account of accountsToTry) {
                    const result = await tryAccountRequest(account);
                    if (result.success) {
                        if (switchedAccount && loadBalanceEnabled) {
                            accountManager.setAccountForModel('geminicli', model.id, account.id).catch(() => {});
                        }
                        return;
                    }

                    lastError = result.error ?? result.reason;

                    if (result.error instanceof Error && result.error.message.includes('401')) {
                        await accountManager.markAccountExpired(account.id);
                        continue;
                    }

                    if (this.isRateLimitError(result.error) && loadBalanceEnabled) {
                        switchedAccount = true;
                        continue;
                    }

                    if (result.error) {
                        throw result.error;
                    }
                }

                if (lastError) {
                    Logger.warn('[geminicli] Managed accounts failed, falling back to CLI credentials', lastError);
                }
            }

            const { accessToken, baseURL } = await GeminiOAuthManager.getInstance().ensureAuthenticated();
            
            // Update handler with latest credentials
            // Pass accessToken as apiKey so OpenAIHandler uses it for Authorization header
            const configWithAuth: ModelConfig = {
                ...modelConfig,
                baseUrl: baseURL,
                apiKey: accessToken,
                customHeader: modelConfig.customHeader
            };

            // Use GeminiHandler for Gemini CLI models as they use the same protocol
            await this.geminiHandler.handleRequest(
                model,
                configWithAuth,
                messages,
                options,
                progress,
                token,
                accessToken
            );
        } catch (error) {
            // If we got a 401, invalidate cached credentials and retry once
            if (error instanceof Error && error.message.includes('401')) {
                GeminiOAuthManager.getInstance().invalidateCredentials?.();
                const { accessToken, baseURL } = await GeminiOAuthManager.getInstance().ensureAuthenticated(true);
                const configWithAuth: ModelConfig = {
                    ...modelConfig,
                    baseUrl: baseURL,
                    customHeader: {
                        ...modelConfig.customHeader,
                        'Authorization': `Bearer ${accessToken}`
                    }
                };
                await this.geminiHandler.handleRequest(
                    model,
                    configWithAuth,
                    messages,
                    options,
                    progress,
                    token,
                    accessToken
                );
                return;
            }

            // If we got a rate limit error, set short cooldown and surface a friendly error
            if (this.isRateLimitError(error)) {
                this.setCooldown(model.id, 10000);
                throw new Error('Rate limited: please try again in a few seconds');
            }

            throw error;
        }
    }
}
