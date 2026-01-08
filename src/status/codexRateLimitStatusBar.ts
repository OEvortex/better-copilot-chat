import * as vscode from 'vscode';
import { RateLimitSnapshot, RateLimitWindow } from '../types/rateLimitTypes';
import { Logger } from '../utils/logger';

export interface AccountRateLimitData {
    accountId: string;
    accountName?: string;
    snapshot: RateLimitSnapshot;
}

/** Serializable format for persisting rate limit data */
interface SerializedAccountRateLimitData {
    accountId: string;
    accountName?: string;
    snapshot: {
        primary?: {
            usedPercent: number;
            windowMinutes?: number;
            resetsAt?: number;
        };
        secondary?: {
            usedPercent: number;
            windowMinutes?: number;
            resetsAt?: number;
        };
        credits?: {
            hasCredits?: boolean;
            unlimited?: boolean;
            balance?: string;
        };
        capturedAt: number; // timestamp in ms
    };
}

interface PersistedRateLimitState {
    rateLimitByAccount: SerializedAccountRateLimitData[];
    currentAccountId: string | null;
    savedAt: number;
}

const STORAGE_KEY = 'chp.codexRateLimitStatusBar.state';
const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const SHOW_QUOTA_COMMAND = 'chp.codexRateLimit.showQuota';

export class CodexRateLimitStatusBar {
    private static instance: CodexRateLimitStatusBar;
    private primaryStatusBarItem: vscode.StatusBarItem;
    private secondaryStatusBarItem: vscode.StatusBarItem;
    private rateLimitByAccount = new Map<string, AccountRateLimitData>();
    private currentAccountId: string | null = null;
    private context: vscode.ExtensionContext | null = null;
    private commandDisposable: vscode.Disposable | null = null;

    private constructor() {
        this.primaryStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            96
        );
        this.primaryStatusBarItem.name = 'Codex Rate Limit (Primary)';
        this.primaryStatusBarItem.command = 'chp.showCombinedQuotaDetails';

        this.secondaryStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            95
        );
        this.secondaryStatusBarItem.name = 'Codex Rate Limit (Secondary)';
        this.secondaryStatusBarItem.command = 'chp.showCombinedQuotaDetails';

        // Register the legacy show quota command (redirects to combined popup)
        this.commandDisposable = vscode.commands.registerCommand(SHOW_QUOTA_COMMAND, () => {
            vscode.commands.executeCommand('chp.showCombinedQuotaDetails');
        });
    }

    static getInstance(): CodexRateLimitStatusBar {
        if (!CodexRateLimitStatusBar.instance) {
            CodexRateLimitStatusBar.instance = new CodexRateLimitStatusBar();
        }
        return CodexRateLimitStatusBar.instance;
    }

    static initialize(context?: vscode.ExtensionContext): CodexRateLimitStatusBar {
        const instance = CodexRateLimitStatusBar.getInstance();
        if (context && !instance.context) {
            instance.context = context;
            instance.restoreFromCache();
        }
        return instance;
    }

    /** Restore rate limit data from globalState cache */
    private restoreFromCache(): void {
        if (!this.context) {
            return;
        }

        try {
            const cached = this.context.globalState.get<PersistedRateLimitState>(STORAGE_KEY);
            if (!cached) {
                Logger.debug('[CodexRateLimitStatusBar] No cached state found');
                return;
            }

            // Check if cache is expired
            const now = Date.now();
            if (now - cached.savedAt > CACHE_EXPIRY_MS) {
                Logger.debug('[CodexRateLimitStatusBar] Cached state expired, clearing');
                this.context.globalState.update(STORAGE_KEY, undefined);
                return;
            }

            // Restore data
            for (const serialized of cached.rateLimitByAccount) {
                const data = this.deserializeAccountData(serialized);
                if (data) {
                    this.rateLimitByAccount.set(data.accountId, data);
                }
            }

            this.currentAccountId = cached.currentAccountId;

            Logger.info(`[CodexRateLimitStatusBar] Restored ${this.rateLimitByAccount.size} account(s) from cache`);

            // Refresh display with restored data
            this.refreshDisplay();
        } catch (error) {
            Logger.error('[CodexRateLimitStatusBar] Failed to restore from cache', error);
        }
    }

    /** Save current state to globalState cache */
    private async saveToCache(): Promise<void> {
        if (!this.context) {
            return;
        }

        try {
            const serializedData: SerializedAccountRateLimitData[] = [];
            for (const [, data] of this.rateLimitByAccount) {
                serializedData.push(this.serializeAccountData(data));
            }

            const state: PersistedRateLimitState = {
                rateLimitByAccount: serializedData,
                currentAccountId: this.currentAccountId,
                savedAt: Date.now()
            };

            await this.context.globalState.update(STORAGE_KEY, state);
            Logger.debug(`[CodexRateLimitStatusBar] Saved ${serializedData.length} account(s) to cache`);
        } catch (error) {
            Logger.error('[CodexRateLimitStatusBar] Failed to save to cache', error);
        }
    }

    /** Serialize AccountRateLimitData for storage */
    private serializeAccountData(data: AccountRateLimitData): SerializedAccountRateLimitData {
        const snapshot = data.snapshot;
        return {
            accountId: data.accountId,
            accountName: data.accountName,
            snapshot: {
                primary: snapshot.primary ? {
                    usedPercent: snapshot.primary.usedPercent,
                    windowMinutes: snapshot.primary.windowMinutes,
                    resetsAt: snapshot.primary.resetsAt
                } : undefined,
                secondary: snapshot.secondary ? {
                    usedPercent: snapshot.secondary.usedPercent,
                    windowMinutes: snapshot.secondary.windowMinutes,
                    resetsAt: snapshot.secondary.resetsAt
                } : undefined,
                credits: snapshot.credits ? {
                    hasCredits: snapshot.credits.hasCredits,
                    unlimited: snapshot.credits.unlimited,
                    balance: snapshot.credits.balance
                } : undefined,
                capturedAt: snapshot.capturedAt.getTime()
            }
        };
    }

    /** Deserialize stored data back to AccountRateLimitData */
    private deserializeAccountData(serialized: SerializedAccountRateLimitData): AccountRateLimitData | null {
        try {
            const snapshot: RateLimitSnapshot = {
                primary: serialized.snapshot.primary as RateLimitWindow | undefined,
                secondary: serialized.snapshot.secondary as RateLimitWindow | undefined,
                credits: serialized.snapshot.credits ? {
                    hasCredits: serialized.snapshot.credits.hasCredits ?? (serialized.snapshot.credits.unlimited || !!serialized.snapshot.credits.balance),
                    unlimited: serialized.snapshot.credits.unlimited ?? false,
                    balance: serialized.snapshot.credits.balance
                } : undefined,
                capturedAt: new Date(serialized.snapshot.capturedAt)
            };

            return {
                accountId: serialized.accountId,
                accountName: serialized.accountName,
                snapshot
            };
        } catch (error) {
            Logger.error('[CodexRateLimitStatusBar] Failed to deserialize account data', error);
            return null;
        }
    }

    update(snapshot: RateLimitSnapshot | null, accountId?: string, accountName?: string): void {
        if (!snapshot || !accountId) {
            return;
        }

        this.rateLimitByAccount.set(accountId, {
            accountId,
            accountName,
            snapshot
        });
        this.currentAccountId = accountId;
        this.refreshDisplay();

        // Save to cache asynchronously
        this.saveToCache();
    }

    private refreshDisplay(): void {
        if (!this.currentAccountId) {
            this.primaryStatusBarItem.hide();
            this.secondaryStatusBarItem.hide();
            return;
        }

        const data = this.rateLimitByAccount.get(this.currentAccountId);
        if (!data) {
            this.primaryStatusBarItem.hide();
            this.secondaryStatusBarItem.hide();
            return;
        }

        const snapshot = data.snapshot;

        const primaryRemaining = snapshot.primary ? 100 - snapshot.primary.usedPercent : null;
        const secondaryRemaining = snapshot.secondary ? 100 - snapshot.secondary.usedPercent : null;

        const minRemaining = Math.min(
            primaryRemaining ?? 100,
            secondaryRemaining ?? 100
        );

        const primaryLabel = this.formatWindowLabel(snapshot.primary?.windowMinutes);
        const secondaryLabel = this.formatWindowLabel(snapshot.secondary?.windowMinutes);

        const tooltip = this.buildTooltip(data);
        const hasPrimary = primaryRemaining !== null;
        const hasSecondary = secondaryRemaining !== null;

        if (!hasPrimary && !hasSecondary) {
            this.primaryStatusBarItem.hide();
            this.secondaryStatusBarItem.hide();
            return;
        }

        if (hasPrimary && primaryRemaining !== null) {
            const primaryText = `$(pulse) ${primaryLabel}: ${primaryRemaining.toFixed(0)}%  `;
            this.primaryStatusBarItem.text = primaryText;
            this.applyRemainingStyle(this.primaryStatusBarItem, primaryRemaining, 'charts.blue');
            this.primaryStatusBarItem.tooltip = tooltip;
            this.primaryStatusBarItem.show();
        } else {
            this.primaryStatusBarItem.hide();
        }

        if (hasSecondary && secondaryRemaining !== null) {
            const prefix = hasPrimary ? '' : '$(pulse) ';
            const secondaryText = `${prefix}${secondaryLabel}: ${secondaryRemaining.toFixed(0)}%`;
            this.secondaryStatusBarItem.text = secondaryText;
            this.applyRemainingStyle(this.secondaryStatusBarItem, secondaryRemaining, 'charts.blue');
            this.secondaryStatusBarItem.tooltip = tooltip;
            this.secondaryStatusBarItem.show();
        } else {
            this.secondaryStatusBarItem.hide();
        }

        const displayParts: string[] = [];
        if (hasPrimary && primaryRemaining !== null) {
            displayParts.push(`${primaryLabel}: ${primaryRemaining.toFixed(0)}%`);
        }
        if (hasSecondary && secondaryRemaining !== null) {
            displayParts.push(`${secondaryLabel}: ${secondaryRemaining.toFixed(0)}%`);
        }
        const displayText = `$(pulse) ${displayParts.join(' | ')}`;

        Logger.debug(`[CodexRateLimitStatusBar] Updated: ${displayText}, account=${data.accountName || data.accountId}, minRemaining=${minRemaining}%`);
    }

    private applyRemainingStyle(item: vscode.StatusBarItem, remaining: number, baseColorId: string): void {
        if (remaining < 10) {
            item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
            return;
        }

        if (remaining < 30) {
            item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
            return;
        }

        item.backgroundColor = undefined;
        item.color = new vscode.ThemeColor(baseColorId);
    }

    private formatWindowLabel(minutes?: number): string {
        if (!minutes) {
            return '5h';
        }
        if (minutes < 60) {
            return `${minutes}m`;
        }
        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return `${hours}h`;
        }
        const days = Math.floor(hours / 24);
        if (days === 7) {
            return 'Weekly';
        }
        return `${days}d`;
    }

    private buildTooltip(data: AccountRateLimitData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportThemeIcons = true;

        const accountLabel = data.accountName || data.accountId;
        md.appendMarkdown('### $(pulse) Codex Rate Limit\n\n');
        md.appendMarkdown(`**Account:** ${accountLabel}\n\n`);

        const snapshot = data.snapshot;

        if (snapshot.primary) {
            const remaining = 100 - snapshot.primary.usedPercent;
            const label = this.formatWindowLabel(snapshot.primary.windowMinutes);
            const bar = this.renderProgressBar(remaining);
            const icon = remaining < 30 ? '$(warning)' : '$(check)';
            md.appendMarkdown(`${icon} **${label} Limit:** ${remaining.toFixed(0)}% remaining\n\n`);
            md.appendMarkdown(`\`${bar}\`\n\n`);
            if (snapshot.primary.resetsAt) {
                const resetTime = this.formatResetTime(snapshot.primary.resetsAt);
                md.appendMarkdown(`Resets: ${resetTime}\n\n`);
            }
        }

        if (snapshot.secondary) {
            const remaining = 100 - snapshot.secondary.usedPercent;
            const label = this.formatWindowLabel(snapshot.secondary.windowMinutes);
            const bar = this.renderProgressBar(remaining);
            const icon = remaining < 30 ? '$(warning)' : '$(check)';
            md.appendMarkdown(`${icon} **${label} Limit:** ${remaining.toFixed(0)}% remaining\n\n`);
            md.appendMarkdown(`\`${bar}\`\n\n`);
            if (snapshot.secondary.resetsAt) {
                const resetTime = this.formatResetTime(snapshot.secondary.resetsAt);
                md.appendMarkdown(`Resets: ${resetTime}\n\n`);
            }
        }

        if (snapshot.credits) {
            md.appendMarkdown('---\n\n');
            if (snapshot.credits.unlimited) {
                md.appendMarkdown('$(star-full) **Credits:** Unlimited\n\n');
            } else if (snapshot.credits.balance) {
                const balance = this.formatCreditBalance(snapshot.credits.balance);
                if (balance) {
                    md.appendMarkdown(`$(credit-card) **Credits:** ${balance}\n\n`);
                }
            }
        }

        md.appendMarkdown('---\n');
        md.appendMarkdown(`*Last updated: ${snapshot.capturedAt.toLocaleTimeString()}*\n\n`);
        md.appendMarkdown('*Click to view details and refresh*');

        return md;
    }

    private renderProgressBar(percentRemaining: number, segments: number = 20): string {
        const ratio = Math.max(0, Math.min(1, percentRemaining / 100));
        const filled = Math.round(ratio * segments);
        const empty = segments - filled;
        return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
    }

    private formatResetTime(timestampSeconds: number): string {
        const resetDate = new Date(timestampSeconds * 1000);
        const now = new Date();
        const diffMs = resetDate.getTime() - now.getTime();

        if (diffMs <= 0) {
            return 'now';
        }

        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMinutes / 60);

        if (diffMinutes < 60) {
            return `in ${diffMinutes}m`;
        }

        if (diffHours < 24) {
            const mins = diffMinutes % 60;
            if (mins > 0) {
                return `in ${diffHours}h ${mins}m`;
            }
            return `in ${diffHours}h`;
        }

        return resetDate.toLocaleString();
    }

    private formatCreditBalance(raw: string): string | null {
        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }

        const floatValue = parseFloat(trimmed);
        if (!isNaN(floatValue) && floatValue > 0) {
            return Math.round(floatValue).toLocaleString();
        }

        return null;
    }

    getSnapshot(accountId?: string): RateLimitSnapshot | null {
        const id = accountId || this.currentAccountId;
        if (!id) {
            return null;
        }
        return this.rateLimitByAccount.get(id)?.snapshot || null;
    }

    getSnapshotForAccount(accountId: string): AccountRateLimitData | null {
        return this.rateLimitByAccount.get(accountId) || null;
    }

    getAllAccountSnapshots(): AccountRateLimitData[] {
        return Array.from(this.rateLimitByAccount.values());
    }

    show(): void {
        if (this.currentAccountId && this.rateLimitByAccount.has(this.currentAccountId)) {
            this.primaryStatusBarItem.show();
            this.secondaryStatusBarItem.show();
        }
    }

    hide(): void {
        this.primaryStatusBarItem.hide();
        this.secondaryStatusBarItem.hide();
    }

    /**
     * Show quota details in a popup when clicking on status bar
     */
    private async showQuotaDetails(): Promise<void> {
        if (!this.currentAccountId) {
            vscode.window.showInformationMessage('No Codex rate limit data available yet.');
            return;
        }

        const data = this.rateLimitByAccount.get(this.currentAccountId);
        if (!data) {
            vscode.window.showInformationMessage('No Codex rate limit data available yet.');
            return;
        }

        const snapshot = data.snapshot;
        const accountLabel = data.accountName || data.accountId;

        // Build the message content
        const lines: string[] = [];
        lines.push('$(pulse) Codex Rate Limit');
        lines.push(`Account: ${accountLabel}`);
        lines.push('');
        lines.push('Summary:');

        // Calculate summary
        const primaryRemaining = snapshot.primary ? 100 - snapshot.primary.usedPercent : null;
        const secondaryRemaining = snapshot.secondary ? 100 - snapshot.secondary.usedPercent : null;

        if (primaryRemaining !== null) {
            const primaryLabel = this.formatWindowLabel(snapshot.primary?.windowMinutes);
            const icon = primaryRemaining < 30 ? '$(warning)' : '$(check)';
            lines.push(`${icon} ${primaryLabel}: ${primaryRemaining.toFixed(0)}% remaining`);
        }

        if (secondaryRemaining !== null) {
            const secondaryLabel = this.formatWindowLabel(snapshot.secondary?.windowMinutes);
            const icon = secondaryRemaining < 30 ? '$(warning)' : '$(check)';
            lines.push(`${icon} ${secondaryLabel}: ${secondaryRemaining.toFixed(0)}% remaining`);
        }

        // Add reset times
        lines.push('');
        lines.push('Reset Times:');
        if (snapshot.primary?.resetsAt) {
            const primaryLabel = this.formatWindowLabel(snapshot.primary.windowMinutes);
            const resetTime = this.formatResetTime(snapshot.primary.resetsAt);
            lines.push(`  ${primaryLabel}: ${resetTime}`);
        }
        if (snapshot.secondary?.resetsAt) {
            const secondaryLabel = this.formatWindowLabel(snapshot.secondary.windowMinutes);
            const resetTime = this.formatResetTime(snapshot.secondary.resetsAt);
            lines.push(`  ${secondaryLabel}: ${resetTime}`);
        }

        // Add credits info if available
        if (snapshot.credits) {
            lines.push('');
            if (snapshot.credits.unlimited) {
                lines.push('$(star-full) Credits: Unlimited');
            } else if (snapshot.credits.balance) {
                const balance = this.formatCreditBalance(snapshot.credits.balance);
                if (balance) {
                    lines.push(`$(credit-card) Credits: ${balance}`);
                }
            }
        }

        lines.push('');
        lines.push(`Last updated: ${snapshot.capturedAt.toLocaleTimeString()}`);

        // Show as QuickPick for better display
        const items: vscode.QuickPickItem[] = lines.map(line => ({
            label: line || ' ',
            kind: line === '' ? vscode.QuickPickItemKind.Separator : undefined
        }));

        // Add action items at the bottom
        items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
        items.push({ 
            label: '$(gear) Open Account Manager', 
            description: 'Manage accounts and settings'
        });
        items.push({ 
            label: '$(refresh) Refresh', 
            description: 'Refresh rate limit data'
        });

        const selected = await vscode.window.showQuickPick(items, {
            title: 'Codex Rate Limit Details',
            placeHolder: 'Click to view models and refresh'
        });

        if (selected) {
            if (selected.label === '$(gear) Open Account Manager') {
                vscode.commands.executeCommand('chp.accounts.openManager');
            } else if (selected.label === '$(refresh) Refresh') {
                // Trigger a refresh by re-displaying the current data
                this.refreshDisplay();
                vscode.window.showInformationMessage('Rate limit display refreshed');
            }
        }
    }

    dispose(): void {
        this.primaryStatusBarItem.dispose();
        this.secondaryStatusBarItem.dispose();
        if (this.commandDisposable) {
            this.commandDisposable.dispose();
        }
    }
}
