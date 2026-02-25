/*---------------------------------------------------------------------------------------------
 *  Account Quota Status Bar
 *  Displays account quota status from AccountQuotaCache
 *  Shows quota exceeded/warning status for configured accounts
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AccountQuotaCache, type AccountQuotaState } from '../accounts/accountQuotaCache';
import { Logger } from '../utils/logger';
import { StatusLogger } from '../utils/statusLogger';
import { BaseStatusBarItem, BaseStatusBarItemConfig } from './baseStatusBarItem';

export interface AccountQuotaStatusData {
    totalAccounts: number;
    exceededAccounts: number;
    warningAccounts: number;
    activeAccounts: number;
    accounts: AccountQuotaState[];
}

const CONFIG: BaseStatusBarItemConfig = {
    id: 'chp.statusBar.accountQuota',
    name: 'Copilot Helper: Account Quota',
    alignment: vscode.StatusBarAlignment.Right,
    priority: 99,
    refreshCommand: 'chp.accountQuota.refresh',
    cacheKeyPrefix: 'accountQuota',
    logPrefix: 'AccountQuota状态栏',
    icon: '$(pulse)'
};

export class AccountQuotaStatusBar extends BaseStatusBarItem<AccountQuotaStatusData> {
    private static instance: AccountQuotaStatusBar;

    constructor() {
        super(CONFIG);
    }

    static getInstance(): AccountQuotaStatusBar {
        if (!AccountQuotaStatusBar.instance) {
            AccountQuotaStatusBar.instance = new AccountQuotaStatusBar();
        }
        return AccountQuotaStatusBar.instance;
    }

    protected override async shouldShowStatusBar(): Promise<boolean> {
        const cache = AccountQuotaCache.getInstance();
        const states = cache.getAllStates();
        return states.length > 0;
    }

    protected getDisplayText(data: AccountQuotaStatusData): string {
        if (data.totalAccounts === 0) {
            return `${this.config.icon}`;
        }

        if (data.exceededAccounts === data.totalAccounts) {
            return `$(error) ${data.exceededAccounts} Quota`;
        }

        if (data.exceededAccounts > 0) {
            return `$(warning) ${data.exceededAccounts}/${data.totalAccounts}`;
        }

        return `$(check) ${data.activeAccounts}`;
    }

    protected generateTooltip(data: AccountQuotaStatusData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;

        md.appendMarkdown(`#### ${this.config.icon} Account Quota Status\n\n`);
        md.appendMarkdown(`**Total Accounts:** ${data.totalAccounts}\n\n`);
        md.appendMarkdown(`**Active:** ${data.activeAccounts}\n\n`);
        md.appendMarkdown(`**Exceeded:** ${data.exceededAccounts}\n\n`);
        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`**Account Details:**\n\n`);

        for (const account of data.accounts) {
            const icon = account.quotaExceeded ? '$(error)' : '$(check)';
            const status = account.quotaExceeded ? 'Exceeded' : 'Active';
            md.appendMarkdown(`${icon} **${account.accountName || account.accountId}** (${account.provider})\n`);
            md.appendMarkdown(`&nbsp;&nbsp;Status: ${status}\n\n`);
            if (account.quotaResetAt) {
                const resetTime = new Date(account.quotaResetAt).toLocaleString();
                md.appendMarkdown(`&nbsp;&nbsp;Resets: ${resetTime}\n\n`);
            }
        }

        md.appendMarkdown(`\n---\n`);
        md.appendMarkdown(`*Click to refresh*\n`);

        return md;
    }

    protected async performApiQuery(): Promise<{ success: boolean; data?: AccountQuotaStatusData; error?: string }> {
        try {
            const cache = AccountQuotaCache.getInstance();
            const states = cache.getAllStates();

            const exceededAccounts = states.filter(s => s.quotaExceeded).length;
            const warningAccounts = states.filter(s => s.backoffLevel && s.backoffLevel > 0 && !s.quotaExceeded).length;
            const activeAccounts = states.filter(s => !s.quotaExceeded).length;

            const data: AccountQuotaStatusData = {
                totalAccounts: states.length,
                exceededAccounts,
                warningAccounts,
                activeAccounts,
                accounts: states
            };

            return { success: true, data };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            Logger.error('[AccountQuotaStatusBar] Failed to get quota data:', error);
            return { success: false, error: errorMsg };
        }
    }

    protected shouldHighlightWarning(data: AccountQuotaStatusData): boolean {
        return data.exceededAccounts > 0;
    }

    protected shouldRefresh(): boolean {
        if (!this.lastStatusData) {
            return true;
        }

        const dataAge = Date.now() - this.lastStatusData.timestamp;
        const CACHE_EXPIRY_THRESHOLD = 5 * 60 * 1000;

        if (dataAge > CACHE_EXPIRY_THRESHOLD) {
            StatusLogger.debug(
                `[${this.config.logPrefix}] Cache expired (${(dataAge / 1000).toFixed(1)}s), triggering refresh`
            );
            return true;
        }

        return false;
    }

    protected override async onInitialized(): Promise<void> {
        const cache = AccountQuotaCache.getInstance();

        cache.onQuotaStateChange((event) => {
            StatusLogger.debug(`[${this.config.logPrefix}] Quota state changed for ${event.accountId}`);
            this.delayedUpdate(2000);
        });
    }
}
