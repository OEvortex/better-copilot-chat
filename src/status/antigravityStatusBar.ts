/*---------------------------------------------------------------------------------------------
 *  Antigravity (Cloud Code) Quota Status Bar
 *  Displays Antigravity/Cloud Code API quota information
 *  Shows remaining quota and usage details
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AntigravityAuth } from '../providers/antigravity/auth.js';
import { Logger } from '../utils/logger';
import { StatusLogger } from '../utils/statusLogger';
import { ProviderStatusBarItem, StatusBarItemConfig } from './providerStatusBarItem.js';
import { ProviderKey } from '../types/providerKeys';

export interface AntigravityQuotaLimit {
    limitType: string;
    limit: number;
    remaining: number;
    used: number;
    percentage: number;
    resetTime?: number;
}

export interface ModelQuotaInfo {
    modelId: string;
    displayName: string;
    remainingFraction: number;
    resetTime?: string;
}

export interface AntigravityQuotaData {
    email: string;
    projectId: string;
    limits: AntigravityQuotaLimit[];
    maxUsageLimit: AntigravityQuotaLimit;
    lastUpdated: number;
    geminiQuota?: number;
    claudeQuota?: number;
    modelQuotas: ModelQuotaInfo[];
}

const CONFIG: StatusBarItemConfig = {
    id: 'chp.statusBar.antigravity',
    name: 'Copilot Helper: Antigravity Quota',
    alignment: vscode.StatusBarAlignment.Right,
    priority: 98,
    refreshCommand: 'chp.antigravity.refreshAndShowQuota',
    apiKeyProvider: ProviderKey.Antigravity,
    cacheKeyPrefix: ProviderKey.Antigravity,
    logPrefix: 'AntigravityStatusBar',
    icon: '$(cloud)'
};

export class AntigravityStatusBar extends ProviderStatusBarItem<AntigravityQuotaData> {
    private geminiStatusBarItem: vscode.StatusBarItem;
    private claudeStatusBarItem: vscode.StatusBarItem;

    constructor() {
        super(CONFIG);

        this.geminiStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
        this.geminiStatusBarItem.name = 'Antigravity Gemini Quota';
        this.geminiStatusBarItem.command = 'chp.showAntigravityQuota';

        this.claudeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);
        this.claudeStatusBarItem.name = 'Antigravity Claude Quota';
        this.claudeStatusBarItem.command = 'chp.showAntigravityQuota';
    }

    protected override async shouldShowStatusBar(): Promise<boolean> {
        return await AntigravityAuth.isLoggedIn();
    }

    protected getDisplayText(data: AntigravityQuotaData): string {
        this.updateSeparateStatusBars(data);
        return '';
    }

    private updateSeparateStatusBars(data: AntigravityQuotaData): void {
        const tooltip = this.generateTooltip(data);

        if (data.geminiQuota !== undefined) {
            const geminiText = `$(arrow-up) Gemini: ${data.geminiQuota}%  `;
            this.geminiStatusBarItem.text = geminiText;
            this.geminiStatusBarItem.tooltip = tooltip;
            this.applyQuotaStyle(this.geminiStatusBarItem, data.geminiQuota);
            this.geminiStatusBarItem.show();
        } else {
            this.geminiStatusBarItem.hide();
        }

        if (data.claudeQuota !== undefined) {
            const prefix = data.geminiQuota !== undefined ? '' : '$(arrow-up) ';
            const claudeText = `${prefix}Claude: ${data.claudeQuota}%`;
            this.claudeStatusBarItem.text = claudeText;
            this.claudeStatusBarItem.tooltip = tooltip;
            this.applyQuotaStyle(this.claudeStatusBarItem, data.claudeQuota);
            this.claudeStatusBarItem.show();
        } else {
            this.claudeStatusBarItem.hide();
        }

        if (this.statusBarItem) {
            this.statusBarItem.hide();
        }
    }

    private applyQuotaStyle(item: vscode.StatusBarItem, quota: number): void {
        if (quota < 10) {
            item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
            return;
        }

        if (quota < 30) {
            item.backgroundColor = undefined;
            item.color = new vscode.ThemeColor('charts.orange');
            return;
        }

        item.backgroundColor = undefined;
        item.color = new vscode.ThemeColor('charts.green');
    }

    private getStatusIndicator(percentage: number): string {
        if (percentage >= 50) {
            return '$(check)';
        } else if (percentage >= 20) {
            return '$(warning)';
        } else {
            return '$(error)';
        }
    }

    private getStatusEmoji(percentage: number): string {
        if (percentage >= 50) {
            return '✅';
        } else if (percentage >= 20) {
            return '⚠️';
        } else {
            return '❌';
        }
    }

    protected generateTooltip(data: AntigravityQuotaData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.appendMarkdown('#### $(cloud) Antigravity Quota\n\n');

        if (data.email) {
            md.appendMarkdown(`**Account:** ${data.email}\n\n`);
        }

        md.appendMarkdown('---\n');
        md.appendMarkdown('**Summary:**\n\n');

        if (data.geminiQuota !== undefined) {
            const geminiEmoji = this.getStatusEmoji(data.geminiQuota);
            md.appendMarkdown(`${geminiEmoji} **Gemini:** ${data.geminiQuota}% remaining\n\n`);
        }

        if (data.claudeQuota !== undefined) {
            const claudeEmoji = this.getStatusEmoji(data.claudeQuota);
            md.appendMarkdown(`${claudeEmoji} **Claude:** ${data.claudeQuota}% remaining\n\n`);
        }

        if (data.modelQuotas && data.modelQuotas.length > 0) {
            md.appendMarkdown('---\n');
            md.appendMarkdown('**Model Details:**\n\n');

            for (const model of data.modelQuotas) {
                const pct = Math.round(model.remainingFraction * 100);
                const emoji = this.getStatusEmoji(pct);
                let resetInfo = '';
                if (model.resetTime) {
                    const resetDate = new Date(model.resetTime);
                    resetInfo = ` *(resets: ${resetDate.toLocaleString()})*`;
                }
                md.appendMarkdown(`${emoji} **${model.displayName}:** ${pct}%${resetInfo}\n\n`);
            }
        }

        const lastUpdated = new Date(data.lastUpdated);
        md.appendMarkdown('---\n');
        md.appendMarkdown(`*Last updated: ${lastUpdated.toLocaleTimeString()}*\n\n`);
        md.appendMarkdown('*Click to refresh*\n');
        return md;
    }

    protected async performApiQuery(): Promise<{ success: boolean; data?: AntigravityQuotaData; error?: string }> {
        try {
            const isLoggedIn = await AntigravityAuth.isLoggedIn();
            if (!isLoggedIn) {
                return {
                    success: false,
                    error: 'Not logged in to Antigravity. Please login first.'
                };
            }

            const accessToken = await AntigravityAuth.getAccessToken();
            if (!accessToken) {
                return {
                    success: false,
                    error: 'Failed to get Antigravity access token'
                };
            }

            Logger.debug('[Antigravity] Fetching quota information...');
            StatusLogger.debug(`[${this.config.logPrefix}] Starting quota query...`);

            const quotaData = await this.fetchQuotaFromApi(accessToken);

            if (!quotaData) {
                return {
                    success: false,
                    error: 'Failed to fetch quota data'
                };
            }

            return {
                success: true,
                data: quotaData
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            Logger.error(`[Antigravity] Quota query failed: ${errorMessage}`);
            return {
                success: false,
                error: `Query failed: ${errorMessage}`
            };
        }
    }

    private async fetchQuotaFromApi(accessToken: string): Promise<AntigravityQuotaData | null> {
        const models = await AntigravityAuth.getModels();
        const projectId = await AntigravityAuth.getProjectId();
        const stored = await this.getStoredAuthData();

        const modelQuotas: ModelQuotaInfo[] = [];
        let minRemainingFraction = 1.0;
        let resetTime: string | undefined;

        let geminiMinQuota = 1.0;
        let gemini3ProQuota: number | null = null;
        let claudeMinQuota = 1.0;
        let hasGemini = false;
        let hasClaude = false;

        for (const model of models) {
            if (model.quotaInfo && model.quotaInfo.remainingFraction !== undefined) {
                const fraction = model.quotaInfo.remainingFraction;

                modelQuotas.push({
                    modelId: model.id,
                    displayName: model.displayName || model.name,
                    remainingFraction: fraction,
                    resetTime: model.quotaInfo.resetTime
                });

                if (fraction < minRemainingFraction) {
                    minRemainingFraction = fraction;
                    resetTime = model.quotaInfo.resetTime;
                }

                const modelIdLower = model.id.toLowerCase();
                if (modelIdLower.includes('gemini') || modelIdLower.includes('gpt')) {
                    hasGemini = true;
                    if (fraction < geminiMinQuota) {
                        geminiMinQuota = fraction;
                    }
                    if (modelIdLower.includes('gemini-3-pro')) {
                        gemini3ProQuota = fraction;
                    }
                } else if (modelIdLower.includes('claude')) {
                    hasClaude = true;
                    if (fraction < claudeMinQuota) {
                        claudeMinQuota = fraction;
                    }
                }
            }
        }

        const remainingPercentage = Math.round(minRemainingFraction * 100);
        const limit = 100;
        const remaining = remainingPercentage;
        const used = limit - remaining;

        const quotaLimit: AntigravityQuotaLimit = {
            limitType: 'MODEL_QUOTA',
            limit: limit,
            remaining: remaining,
            used: used,
            percentage: used,
            resetTime: resetTime ? new Date(resetTime).getTime() : undefined
        };

        return {
            email: stored?.email || '',
            projectId: projectId,
            limits: [quotaLimit],
            maxUsageLimit: quotaLimit,
            lastUpdated: Date.now(),
            geminiQuota:
                gemini3ProQuota !== null
                    ? Math.round(gemini3ProQuota * 100)
                    : hasGemini
                      ? Math.round(geminiMinQuota * 100)
                      : undefined,
            claudeQuota: hasClaude ? Math.round(claudeMinQuota * 100) : undefined,
            modelQuotas: modelQuotas
        };
    }

    private async getStoredAuthData(): Promise<{ email?: string; project_id?: string } | null> {
        try {
            const { ApiKeyManager } = await import('../utils/apiKeyManager.js');
            const stored = await ApiKeyManager.getApiKey(ProviderKey.Antigravity);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch {
            // Ignore parse errors
        }
        return null;
    }

    protected shouldHighlightWarning(data: AntigravityQuotaData): boolean {
        return data.maxUsageLimit.percentage >= this.HIGH_USAGE_THRESHOLD;
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

    getLastStatusData(): { data: AntigravityQuotaData; timestamp: number } | null {
        return this.lastStatusData;
    }

    protected override async onInitialized(): Promise<void> {
        if (this.context) {
            this.context.subscriptions.push(
                vscode.commands.registerCommand('chp.showAntigravityQuota', async () => {
                    Logger.info('[Antigravity] showAntigravityQuota command triggered');
                    await this.refreshAndShowQuota();
                })
            );
        }
    }

    private async refreshAndShowQuota(): Promise<void> {
        Logger.info('[Antigravity] refreshAndShowQuota called');
        const popupPromise = this.showQuotaQuickPick();

        if (!this.isLoading) {
            Logger.info('[Antigravity] Starting background refresh...');
            this.executeApiQuery(true).catch(err => {
                Logger.error('[Antigravity] Refresh failed:', err);
            });
        }

        await popupPromise;
    }

    protected override async executeApiQuery(isManualRefresh = false): Promise<void> {
        try {
            this.showRefreshingState();
            await super.executeApiQuery(isManualRefresh);
        } catch (error) {
            StatusLogger.error(`[${this.config.logPrefix}] Refresh failed`, error);

            if (this.geminiStatusBarItem) {
                this.geminiStatusBarItem.text = `$(arrow-up) Gemini: ERR`;
            }
            if (this.claudeStatusBarItem) {
                this.claudeStatusBarItem.text = `Claude: ERR`;
            }
        }
    }

    private showRefreshingState(): void {
        if (this.geminiStatusBarItem) {
            this.geminiStatusBarItem.text = `$(sync~spin) Gemini: Refreshing...  `;
            this.geminiStatusBarItem.tooltip = 'Refreshing quota data...';
        }
        if (this.claudeStatusBarItem) {
            this.claudeStatusBarItem.text = `$(sync~spin) Claude: Refreshing...`;
            this.claudeStatusBarItem.tooltip = 'Refreshing quota data...';
        }
    }

    private async showQuotaQuickPick(): Promise<void> {
        Logger.info('[Antigravity] showQuotaQuickPick started');

        const isLoggedIn = await AntigravityAuth.isLoggedIn();
        Logger.info(`[Antigravity] isLoggedIn: ${isLoggedIn}`);

        if (!isLoggedIn) {
            const action = await vscode.window.showWarningMessage(
                'Not logged in to Antigravity. Please login first.',
                'Login'
            );
            if (action === 'Login') {
                await vscode.commands.executeCommand('chp.antigravityLogin');
            }
            return;
        }

        const quickPick = vscode.window.createQuickPick();
        quickPick.title = 'Antigravity (Cloud Code)';
        quickPick.placeholder = 'Loading models and quota...';
        quickPick.busy = true;
        quickPick.show();
        Logger.info('[Antigravity] QuickPick shown');

        try {
            const models = await AntigravityAuth.getModels();
            const items: vscode.QuickPickItem[] = [];

            for (const model of models) {
                let description = '';
                let detail = '';

                if (model.quotaInfo && model.quotaInfo.remainingFraction !== undefined) {
                    const pct = Math.round(model.quotaInfo.remainingFraction * 100);
                    const emoji = this.getStatusEmoji(pct);
                    description = `${emoji} ${pct}% remaining`;

                    if (model.quotaInfo.resetTime) {
                        const resetDate = new Date(model.quotaInfo.resetTime);
                        detail = `Resets: ${resetDate.toLocaleString()}`;
                    }
                }

                items.push({
                    label: model.displayName || model.name,
                    description: description,
                    detail: detail
                });
            }

            quickPick.busy = false;
            quickPick.items = items;

            quickPick.onDidHide(() => {
                quickPick.dispose();
            });
        } catch (error) {
            Logger.error('[Antigravity] Failed to load models:', error);
            quickPick.busy = false;
            quickPick.placeholder = 'Failed to load models';
        }
    }
}
