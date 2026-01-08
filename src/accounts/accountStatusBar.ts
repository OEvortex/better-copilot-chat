/*---------------------------------------------------------------------------------------------
 *  Account Status Bar
 *  Show the active account in the status bar with Quick Switch
 *  Display the account corresponding to the model currently in use
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AccountManager } from '../accounts';
import { Account } from './types';
import { CodexRateLimitStatusBar } from '../status/codexRateLimitStatusBar';
import { TokenUsageStatusBar, TokenUsageData } from '../status/tokenUsageStatusBar';

/**
 * Account Status Bar Item - Improve UX with Quick Switch
 * Display the account corresponding to the model currently in use
 */
export class AccountStatusBar {
    private static instance: AccountStatusBar;
    private statusBarItem: vscode.StatusBarItem;
    private accountManager: AccountManager;
    private disposables: vscode.Disposable[] = [];
    private currentProviderKey: string | undefined;

    private constructor() {
        this.accountManager = AccountManager.getInstance();
        
        // Create status bar item - uses command to open Account Manager
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            99 // Priority
        );
        // Clicking will open Account Manager
        this.statusBarItem.command = 'chp.accounts.openManager';
        
        // Listen to account changes
        this.disposables.push(
            this.accountManager.onAccountChange(() => {
                this.updateStatusBar();
            })
        );

        // Listen to changes of the active model
        this.disposables.push(
            TokenUsageStatusBar.onDidChangeActiveModel((data: TokenUsageData) => {
                this.onActiveModelChanged(data);
            })
        );

        this.updateStatusBar();
    }

    /**
     * Initialize
     */
    static initialize(): AccountStatusBar {
        if (!AccountStatusBar.instance) {
            AccountStatusBar.instance = new AccountStatusBar();
        }
        return AccountStatusBar.instance;
    }

    /**
     * Get instance
     */
    static getInstance(): AccountStatusBar | undefined {
        return AccountStatusBar.instance;
    }

    /**
     * Handle when the active model changes
     */
    private onActiveModelChanged(data: TokenUsageData): void {
        this.currentProviderKey = data.providerKey;
        this.updateStatusBar();
    }

    /**
     * Update status bar with more detailed information
     * Prefer displaying the account of the provider in use
     */
    private updateStatusBar(): void {
        const accounts = this.accountManager.getAllAccounts();
        
        if (accounts.length === 0) {
            this.statusBarItem.text = '$(add) Add Account';
            this.statusBarItem.tooltip = 'Click to add your first account';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            // If a provider is currently in use, prefer displaying its account
            if (this.currentProviderKey) {
                const providerAccount = this.getActiveAccountForProvider(this.currentProviderKey);
                if (providerAccount) {
                    const providerName = this.getProviderDisplayName(this.currentProviderKey);
                    this.statusBarItem.text = `$(account) ${this.truncateName(providerAccount.displayName)} · ${providerName}`;
                    this.statusBarItem.tooltip = this.buildTooltipWithCurrentModel(accounts, providerAccount, this.currentProviderKey);
                    this.statusBarItem.backgroundColor = this.getProviderStatusBarColor(this.currentProviderKey);
                    this.statusBarItem.show();
                    return;
                }
            }

            // Fallback: get active accounts
            const activeAccounts = accounts.filter(acc => acc.isDefault);
            
            if (activeAccounts.length === 0) {
                this.statusBarItem.text = `$(account) ${accounts.length} Accounts`;
                this.statusBarItem.tooltip = this.buildTooltip(accounts, []);
                this.statusBarItem.backgroundColor = undefined;
            } else if (activeAccounts.length === 1) {
                // Show active account name
                const active = activeAccounts[0];
                const providerName = this.getProviderDisplayName(active.provider);
                this.statusBarItem.text = `$(account) ${this.truncateName(active.displayName)} · ${providerName}`;
                this.statusBarItem.tooltip = this.buildTooltip(accounts, activeAccounts);
                this.statusBarItem.backgroundColor = this.getProviderStatusBarColor(active.provider);
            } else {
                // Multiple active accounts (multiple providers)
                this.statusBarItem.text = `$(account) ${activeAccounts.length} Active`;
                this.statusBarItem.tooltip = this.buildTooltip(accounts, activeAccounts);
                this.statusBarItem.backgroundColor = undefined;
            }
        }

        this.statusBarItem.show();
    }

    /**
     * Truncate name if too long
     */
    private truncateName(name: string, maxLength: number = 15): string {
        if (name.length <= maxLength) {return name;}
        return name.substring(0, maxLength - 2) + '..';
    }

    /**
     * Build detailed tooltip
     */
    private buildTooltip(allAccounts: Account[], activeAccounts: Account[]): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportThemeIcons = true;

        md.appendMarkdown('### Quick Switch Account\n\n');
        
        if (activeAccounts.length > 0) {
            md.appendMarkdown('**Active Accounts:**\n');
            for (const acc of activeAccounts) {
                const providerName = this.getProviderDisplayName(acc.provider);
                md.appendMarkdown(`- $(check) **${acc.displayName}** (${providerName})\n`);
            }
            md.appendMarkdown('\n');
        }

        md.appendMarkdown(`Total: ${allAccounts.length} account(s)\n\n`);
        
        const codexAccounts = allAccounts.filter(acc => acc.provider === 'codex');
        if (codexAccounts.length > 0) {
            const rateLimits = CodexRateLimitStatusBar.getInstance().getAllAccountSnapshots();
            if (rateLimits.length > 0) {
                md.appendMarkdown('---\n\n');
                md.appendMarkdown('**$(pulse) Codex Rate Limits:**\n\n');
                for (const data of rateLimits) {
                    const account = codexAccounts.find(acc => acc.id === data.accountId);
                    const accountLabel = account?.displayName || data.accountName || data.accountId.slice(0, 8);
                    md.appendMarkdown(`**${accountLabel}:**\n`);
                    if (data.snapshot.primary) {
                        const remaining = 100 - data.snapshot.primary.usedPercent;
                        const icon = remaining < 30 ? '$(warning)' : '$(check)';
                        md.appendMarkdown(`${icon} 5h: ${remaining.toFixed(0)}% left\n`);
                    }
                    if (data.snapshot.secondary) {
                        const remaining = 100 - data.snapshot.secondary.usedPercent;
                        const icon = remaining < 30 ? '$(warning)' : '$(check)';
                        md.appendMarkdown(`${icon} Weekly: ${remaining.toFixed(0)}% left\n`);
                    }
                    md.appendMarkdown('\n');
                }
            }
        }

        md.appendMarkdown('---\n');
        md.appendMarkdown('$(zap) **Click to switch accounts quickly**\n\n');
        md.appendMarkdown('[$(settings-gear) Open Manager](command:chp.accounts.openManager)');

        return md;
    }

    /**
     * Get active account for a specific provider
     */
    private getActiveAccountForProvider(providerKey: string): Account | undefined {
        // Try to get the active account for the provider
        const activeAccount = this.accountManager.getActiveAccount(providerKey);
        if (activeAccount) {
            return activeAccount;
        }

        // Fallback: take the first account of the provider
        const accounts = this.accountManager.getAllAccounts();
        return accounts.find(acc => acc.provider === providerKey);
    }

    /**
     * Build tooltip with current model information
     */
    private buildTooltipWithCurrentModel(
        allAccounts: Account[], 
        currentAccount: Account, 
        providerKey: string
    ): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportThemeIcons = true;

        const providerName = this.getProviderDisplayName(providerKey);
        md.appendMarkdown(`### Currently Using: ${providerName}\n\n`);
        md.appendMarkdown(`**Account:** $(check) **${currentAccount.displayName}**\n\n`);

        // Show other accounts for the same provider
        const sameProviderAccounts = allAccounts.filter(
            acc => acc.provider === providerKey && acc.id !== currentAccount.id
        );
        if (sameProviderAccounts.length > 0) {
            md.appendMarkdown('**Other accounts for this provider:**\n');
            for (const acc of sameProviderAccounts) {
                md.appendMarkdown(`- $(account) ${acc.displayName}\n`);
            }
            md.appendMarkdown('\n');
        }

        // Show total number of accounts
        md.appendMarkdown(`Total: ${allAccounts.length} account(s)\n\n`);

        // Show rate limits if provider is Codex
        if (providerKey === 'codex') {
            const codexAccounts = allAccounts.filter(acc => acc.provider === 'codex');
            const rateLimits = CodexRateLimitStatusBar.getInstance().getAllAccountSnapshots();
            if (rateLimits.length > 0) {
                md.appendMarkdown('---\n\n');
                md.appendMarkdown('**$(pulse) Codex Rate Limits:**\n\n');
                for (const data of rateLimits) {
                    const account = codexAccounts.find(acc => acc.id === data.accountId);
                    const accountLabel = account?.displayName || data.accountName || data.accountId.slice(0, 8);
                    const isCurrent = account?.id === currentAccount.id;
                    const prefix = isCurrent ? '$(arrow-right) ' : '';
                    md.appendMarkdown(`${prefix}**${accountLabel}:**\n`);
                    if (data.snapshot.primary) {
                        const remaining = 100 - data.snapshot.primary.usedPercent;
                        const icon = remaining < 30 ? '$(warning)' : '$(check)';
                        md.appendMarkdown(`${icon} 5h: ${remaining.toFixed(0)}% left\n`);
                    }
                    if (data.snapshot.secondary) {
                        const remaining = 100 - data.snapshot.secondary.usedPercent;
                        const icon = remaining < 30 ? '$(warning)' : '$(check)';
                        md.appendMarkdown(`${icon} Weekly: ${remaining.toFixed(0)}% left\n`);
                    }
                    md.appendMarkdown('\n');
                }
            }
        }

        md.appendMarkdown('---\n');
        md.appendMarkdown('$(zap) **Click to switch accounts quickly**\n\n');
        md.appendMarkdown('[$(settings-gear) Open Manager](command:chp.accounts.openManager)');

        return md;
    }

    /**
     * Get provider display name
     */
    private getProviderDisplayName(provider: string): string {
        const names: Record<string, string> = {
            'antigravity': 'Antigravity',
            'codex': 'Codex',
            'zhipu': 'ZhipuAI',
            'moonshot': 'Moonshot',
            'minimax': 'MiniMax',
            'deepseek': 'DeepSeek',
            'kimi': 'Kimi',
            'compatible': 'Compatible'
        };
        return names[provider] || provider;
    }

    /**
     * Get status bar color for the provider
     */
    private getProviderStatusBarColor(provider: string): vscode.ThemeColor | undefined {
        const colorIds: Record<string, string> = {
            'antigravity': 'chp.statusBar.account.antigravity',
            'codex': 'chp.statusBar.account.codex',
            'zhipu': 'chp.statusBar.account.zhipu',
            'moonshot': 'chp.statusBar.account.moonshot',
            'minimax': 'chp.statusBar.account.minimax',
            'deepseek': 'chp.statusBar.account.deepseek',
            'kimi': 'chp.statusBar.account.kimi',
            'compatible': 'chp.statusBar.account.compatible'
        };
        const colorId = colorIds[provider];
        return colorId ? new vscode.ThemeColor(colorId) : undefined;
    }

    /**
     * Show status bar
     */
    show(): void {
        this.statusBarItem.show();
    }

    /**
     * Hide status bar
     */
    hide(): void {
        this.statusBarItem.hide();
    }

    /**
     * Dispose
     */
    dispose(): void {
        this.statusBarItem.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}
