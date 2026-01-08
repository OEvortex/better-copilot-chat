/*---------------------------------------------------------------------------------------------
 *  Account Status Bar
 *  Hiển thị tài khoản đang active trên status bar với Quick Switch
 *  Khi đang dùng model nào thì hiển thị account tương ứng
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AccountManager } from '../accounts';
import { Account } from './types';
import { CodexRateLimitStatusBar } from '../status/codexRateLimitStatusBar';
import { TokenUsageStatusBar, TokenUsageData } from '../status/tokenUsageStatusBar';

/**
 * Account Status Bar Item - Cải tiến UX với Quick Switch
 * Hiển thị account tương ứng với model đang được sử dụng
 */
export class AccountStatusBar {
    private static instance: AccountStatusBar;
    private statusBarItem: vscode.StatusBarItem;
    private accountManager: AccountManager;
    private disposables: vscode.Disposable[] = [];
    private currentProviderKey: string | undefined;

    private constructor() {
        this.accountManager = AccountManager.getInstance();
        
        // Tạo status bar item - sử dụng command mở Account Manager
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            99 // Priority
        );
        // Click vào sẽ mở Account Manager
        this.statusBarItem.command = 'chp.accounts.openManager';
        
        // Lắng nghe thay đổi tài khoản
        this.disposables.push(
            this.accountManager.onAccountChange(() => {
                this.updateStatusBar();
            })
        );

        // Lắng nghe thay đổi model đang sử dụng
        this.disposables.push(
            TokenUsageStatusBar.onDidChangeActiveModel((data: TokenUsageData) => {
                this.onActiveModelChanged(data);
            })
        );

        this.updateStatusBar();
    }

    /**
     * Khởi tạo
     */
    static initialize(): AccountStatusBar {
        if (!AccountStatusBar.instance) {
            AccountStatusBar.instance = new AccountStatusBar();
        }
        return AccountStatusBar.instance;
    }

    /**
     * Lấy instance
     */
    static getInstance(): AccountStatusBar | undefined {
        return AccountStatusBar.instance;
    }

    /**
     * Xử lý khi model đang sử dụng thay đổi
     */
    private onActiveModelChanged(data: TokenUsageData): void {
        this.currentProviderKey = data.providerKey;
        this.updateStatusBar();
    }

    /**
     * Cập nhật status bar với thông tin chi tiết hơn
     * Ưu tiên hiển thị account của provider đang được sử dụng
     */
    private updateStatusBar(): void {
        const accounts = this.accountManager.getAllAccounts();
        
        if (accounts.length === 0) {
            this.statusBarItem.text = '$(add) Add Account';
            this.statusBarItem.tooltip = 'Click to add your first account';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            // Nếu có provider đang được sử dụng, ưu tiên hiển thị account của provider đó
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

            // Fallback: Lấy các tài khoản active
            const activeAccounts = accounts.filter(acc => acc.isDefault);
            
            if (activeAccounts.length === 0) {
                this.statusBarItem.text = `$(account) ${accounts.length} Accounts`;
                this.statusBarItem.tooltip = this.buildTooltip(accounts, []);
                this.statusBarItem.backgroundColor = undefined;
            } else if (activeAccounts.length === 1) {
                // Hiển thị tên tài khoản active
                const active = activeAccounts[0];
                const providerName = this.getProviderDisplayName(active.provider);
                this.statusBarItem.text = `$(account) ${this.truncateName(active.displayName)} · ${providerName}`;
                this.statusBarItem.tooltip = this.buildTooltip(accounts, activeAccounts);
                this.statusBarItem.backgroundColor = this.getProviderStatusBarColor(active.provider);
            } else {
                // Nhiều tài khoản active (nhiều provider)
                this.statusBarItem.text = `$(account) ${activeAccounts.length} Active`;
                this.statusBarItem.tooltip = this.buildTooltip(accounts, activeAccounts);
                this.statusBarItem.backgroundColor = undefined;
            }
        }

        this.statusBarItem.show();
    }

    /**
     * Rút gọn tên nếu quá dài
     */
    private truncateName(name: string, maxLength: number = 15): string {
        if (name.length <= maxLength) {return name;}
        return name.substring(0, maxLength - 2) + '..';
    }

    /**
     * Tạo tooltip chi tiết
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
     * Lấy account active cho provider cụ thể
     */
    private getActiveAccountForProvider(providerKey: string): Account | undefined {
        // Thử lấy account active cho provider
        const activeAccount = this.accountManager.getActiveAccount(providerKey);
        if (activeAccount) {
            return activeAccount;
        }

        // Fallback: lấy account đầu tiên của provider
        const accounts = this.accountManager.getAllAccounts();
        return accounts.find(acc => acc.provider === providerKey);
    }

    /**
     * Tạo tooltip với thông tin model đang sử dụng
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

        // Hiển thị các account khác của cùng provider
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

        // Hiển thị tổng số account
        md.appendMarkdown(`Total: ${allAccounts.length} account(s)\n\n`);

        // Hiển thị rate limits nếu là Codex
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
     * Lấy tên hiển thị của provider
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
     * Lấy màu status bar theo provider
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
     * Hiển thị status bar
     */
    show(): void {
        this.statusBarItem.show();
    }

    /**
     * Ẩn status bar
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
