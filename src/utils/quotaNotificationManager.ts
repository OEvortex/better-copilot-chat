/*---------------------------------------------------------------------------------------------
 *  Quota Notification Manager
 *  Manages quota countdown timers, status bar messages, and account manager updates.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AccountManagerPage } from '../accounts/accountManagerPage';

const QUOTA_NOTICE_DEDUP_MS = 30000;
const QUOTA_COUNTDOWN_LONG_UPDATE_MS = 60000;
const QUOTA_COUNTDOWN_SHORT_UPDATE_MS = 1000;

export class QuotaNotificationManager {
    private quotaCountdownTimer: NodeJS.Timeout | undefined;
    private quotaCountdownEndAt = 0;
    private quotaCountdownMessage: vscode.Disposable | undefined;
    private quotaCountdownModel: string | undefined;
    private quotaCountdownAccountId: string | undefined;
    private quotaCountdownAccountName: string | undefined;
    private lastQuotaNoticeAt = 0;

    /**
     * Notify user about quota exceeded with countdown
     */
    notifyQuotaExceeded(delayMs: number, modelName: string, accountId?: string, accountName?: string): void {
        if (delayMs <= 0) {
            return;
        }

        this.startQuotaCountdown(delayMs, modelName, accountId, accountName);
        this.updateAccountManagerQuota(delayMs, modelName, accountId, accountName);

        const now = Date.now();
        if (now - this.lastQuotaNoticeAt < QUOTA_NOTICE_DEDUP_MS) {
            return;
        }
        this.lastQuotaNoticeAt = now;

        const modelLabel = modelName ? ` (${modelName})` : '';
        const accountLabel = accountName ? ` [${accountName}]` : '';
        const message = `Copilot ++ Antigravity quota limit reached${modelLabel}${accountLabel}. Retry in ${this.formatCountdown(delayMs)}.`;
        // void vscode.window.showWarningMessage(message); // Disabled notification
    }

    /**
     * Show a popup when quota wait is too long.
     */
    async notifyQuotaTooLong(
        delayMs: number,
        modelName: string,
        accountId?: string,
        accountName?: string
    ): Promise<void> {
        if (delayMs <= 0) {
            return;
        }

        const modelLabel = modelName ? ` (${modelName})` : '';
        const accountLabel = accountName ? ` [${accountName}]` : '';
        const message = `Antigravity quota exceeded${modelLabel}${accountLabel}. Retry in ${this.formatCountdown(delayMs)}.`;

        const selection = await vscode.window.showWarningMessage(
            message,
            'Add Account',
            'Open Account Manager',
            'Dismiss'
        );

        if (selection === 'Add Account') {
            await vscode.commands.executeCommand('chp.antigravity.login');
        } else if (selection === 'Open Account Manager') {
            await vscode.commands.executeCommand('chp.accounts.openManager');
        }
    }

    /**
     * Start quota countdown timer
     */
    private startQuotaCountdown(delayMs: number, modelName: string, accountId?: string, accountName?: string): void {
        this.quotaCountdownEndAt = Date.now() + delayMs;
        this.quotaCountdownModel = modelName;
        this.quotaCountdownAccountId = accountId;
        this.quotaCountdownAccountName = accountName;

        if (this.quotaCountdownTimer) {
            clearTimeout(this.quotaCountdownTimer);
            this.quotaCountdownTimer = undefined;
        }

        this.updateQuotaCountdown();
    }

    /**
     * Update quota countdown display
     */
    private updateQuotaCountdown(): void {
        if (!this.quotaCountdownEndAt) {
            return;
        }

        const remaining = this.quotaCountdownEndAt - Date.now();
        if (remaining <= 0) {
            this.clearQuotaCountdown();
            return;
        }

        const modelLabel = this.quotaCountdownModel ? ` (${this.quotaCountdownModel})` : '';
        const accountLabel = this.quotaCountdownAccountName ? ` [${this.quotaCountdownAccountName}]` : '';
        const message = `Copilot ++ Antigravity limited${modelLabel}${accountLabel}: ${this.formatCountdown(remaining)}`;

        if (this.quotaCountdownMessage) {
            this.quotaCountdownMessage.dispose();
        }
        this.quotaCountdownMessage = vscode.window.setStatusBarMessage(message);

        const nextDelay = this.getCountdownUpdateInterval(remaining);
        this.quotaCountdownTimer = setTimeout(() => this.updateQuotaCountdown(), nextDelay);
    }

    /**
     * Clear quota countdown timer and status bar message
     */
    clearQuotaCountdown(): void {
        if (this.quotaCountdownTimer) {
            clearTimeout(this.quotaCountdownTimer);
            this.quotaCountdownTimer = undefined;
        }
        if (this.quotaCountdownMessage) {
            this.quotaCountdownMessage.dispose();
            this.quotaCountdownMessage = undefined;
        }
        this.quotaCountdownEndAt = 0;
        this.quotaCountdownModel = undefined;
        this.quotaCountdownAccountId = undefined;
        this.quotaCountdownAccountName = undefined;
        this.updateAccountManagerQuota(0, '');
    }

    /**
     * Update account manager with quota information
     */
    private updateAccountManagerQuota(
        delayMs: number,
        modelName: string,
        accountId?: string,
        accountName?: string
    ): void {
        try {
            if (delayMs <= 0) {
                AccountManagerPage.updateAntigravityQuotaNotice(null);
                return;
            }
            AccountManagerPage.updateAntigravityQuotaNotice({
                resetAt: Date.now() + delayMs,
                modelName: modelName || undefined,
                accountId: accountId || this.quotaCountdownAccountId,
                accountName: accountName || this.quotaCountdownAccountName
            });
        } catch (error) {
            // Silently ignore quota notice update failures
        }
    }

    /**
     * Format countdown in milliseconds to human-readable string
     */
    private formatCountdown(ms: number): string {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const seconds = totalSeconds % 60;
        const minutes = Math.floor(totalSeconds / 60) % 60;
        const hours = Math.floor(totalSeconds / 3600);

        if (hours > 0) {
            return `${hours}h${minutes}m${seconds}s`;
        }
        if (minutes > 0) {
            return `${minutes}m${seconds}s`;
        }
        return `${seconds}s`;
    }

    /**
     * Get countdown update interval based on remaining time
     */
    private getCountdownUpdateInterval(remainingMs: number): number {
        if (remainingMs >= 60 * 60 * 1000) {
            return QUOTA_COUNTDOWN_LONG_UPDATE_MS;
        }
        return QUOTA_COUNTDOWN_SHORT_UPDATE_MS;
    }

    /**
     * Format duration in milliseconds to human-readable string
     */
    formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            const remainingMinutes = minutes % 60;
            return `${hours}h${remainingMinutes}m`;
        } else if (minutes > 0) {
            const remainingSeconds = seconds % 60;
            return `${minutes}m${remainingSeconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Dispose all resources
     */
    dispose(): void {
        this.clearQuotaCountdown();
    }
}
