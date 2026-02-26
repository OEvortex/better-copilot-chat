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
    constructor() {
        super(CONFIG);
    }

    protected override async shouldShowStatusBar(): Promise<boolean> {
        return await AntigravityAuth.isLoggedIn();
    }

    protected getDisplayText(data: AntigravityQuotaData): string {
        // Calculate combined quota (use the minimum of gemini and claude to show the limiting factor)
        const minQuota = this.getMinQuota(data);
        if (minQuota === undefined) {
            return '$(cloud) Antigravity';
        }
        
        // Compact progress bar (just 5 chars)
        const bar = this.getCompactBar(minQuota);
        return `$(cloud) ${bar} ${minQuota}%`;
    }

    private getMinQuota(data: AntigravityQuotaData): number | undefined {
        const quotas: number[] = [];
        if (data.geminiQuota !== undefined) quotas.push(data.geminiQuota);
        if (data.claudeQuota !== undefined) quotas.push(data.claudeQuota);
        if (quotas.length === 0) return undefined;
        return Math.min(...quotas);
    }

    private getCompactBar(percentage: number): string {
        // Simple 5-char bar: ▰▰▰▱▱
        const filled = Math.round(percentage / 20);
        return '▰'.repeat(filled) + '▱'.repeat(5 - filled);
    }

    protected override updateStatusBarUI(data: AntigravityQuotaData): void {
        if (!this.statusBarItem) return;

        // Set text and tooltip from base
        this.statusBarItem.text = this.getDisplayText(data);
        this.statusBarItem.tooltip = this.generateTooltip(data);

        // Apply custom quota styling
        const minQuota = this.getMinQuota(data);
        if (minQuota !== undefined) {
            this.applyQuotaStyle(minQuota);
        } else {
            this.statusBarItem.backgroundColor = undefined;
            this.statusBarItem.color = undefined;
        }
    }

    private applyQuotaStyle(quota: number): void {
        if (!this.statusBarItem) return;
        
        if (quota < 10) {
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
            return;
        }

        if (quota < 30) {
            this.statusBarItem.backgroundColor = undefined;
            this.statusBarItem.color = new vscode.ThemeColor('charts.orange');
            return;
        }

        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = new vscode.ThemeColor('charts.green');
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
        
        // Header with icon and title
        md.appendMarkdown(`<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
<span style="font-size: 16px;">☁️</span>
<span style="font-size: 14px; font-weight: 600;">Antigravity Quota</span>
</div>`);

        if (data.email) {
            md.appendMarkdown(`<div style="margin-bottom: 8px;">
<span style="color: #8b949e;">Account:</span> <code>${data.email}</code>
</div>`);
        }

        md.appendMarkdown('<hr style="border: none; border-top: 1px solid #30363d; margin: 8px 0;">');
        
        // Usage section
        md.appendMarkdown('<div style="margin-bottom: 8px;"><strong>📊 Usage</strong></div>');

        if (data.geminiQuota !== undefined) {
            const bar = this.getCompactBar(data.geminiQuota);
            const color = data.geminiQuota >= 30 ? '#3fb950' : data.geminiQuota >= 10 ? '#d29922' : '#f85149';
            const bgColor = data.geminiQuota >= 30 ? '#238636' : data.geminiQuota >= 10 ? '#9e6a03' : '#da3633';
            md.appendMarkdown(`<div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
<span style="color: #58a6ff; font-weight: 500;">🌙 Gemini</span>
<span style="font-family: monospace; background: ${bgColor}; color: white; padding: 2px 6px; border-radius: 4px;">${bar} ${data.geminiQuota}%</span>
</div>`);
        }

        if (data.claudeQuota !== undefined) {
            const bar = this.getCompactBar(data.claudeQuota);
            const bgColor = data.claudeQuota >= 30 ? '#238636' : data.claudeQuota >= 10 ? '#9e6a03' : '#da3633';
            md.appendMarkdown(`<div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
<span style="color: #58a6ff; font-weight: 500;">🤖 Claude</span>
<span style="font-family: monospace; background: ${bgColor}; color: white; padding: 2px 6px; border-radius: 4px;">${bar} ${data.claudeQuota}%</span>
</div>`);
        }

        if (data.modelQuotas && data.modelQuotas.length > 0) {
            md.appendMarkdown('<hr style="border: none; border-top: 1px solid #30363d; margin: 8px 0;">');
            md.appendMarkdown('<div style="margin-bottom: 8px;"><strong>📑 Models</strong></div>');
            
            md.appendMarkdown('<table style="width: 100%; border-collapse: collapse; font-size: 12px;">');
            md.appendMarkdown('<tr style="color: #8b949e; text-align: left;"><th style="padding: 4px;">Model</th><th style="padding: 4px;">Quota</th></tr>');

            for (const model of data.modelQuotas.slice(0, 5)) {
                const pct = Math.round(model.remainingFraction * 100);
                const bar = this.getCompactBar(pct);
                const color = pct >= 30 ? '#3fb950' : pct >= 10 ? '#d29922' : '#f85149';
                
                md.appendMarkdown(`<tr>
<td style="padding: 4px; color: #c9d1d9;">${model.displayName}</td>
<td style="padding: 4px;"><code style="color: ${color};">${bar} ${pct}%</code></td>
</tr>`);
            }
            md.appendMarkdown('</table>');
            
            if (data.modelQuotas.length > 5) {
                md.appendMarkdown(`<div style="color: #8b949e; font-size: 11px; margin-top: 4px;">+${data.modelQuotas.length - 5} more models</div>`);
            }
        }

        const lastUpdated = new Date(data.lastUpdated);
        md.appendMarkdown(`<div style="color: #8b949e; font-size: 11px; margin-top: 8px;">
⏰ Updated: ${lastUpdated.toLocaleTimeString()} • Click for details
</div>`);
        
        return md;
    }

    private renderBlock(width: number, fillRatio: number, fillChar: string, emptyChar: string): string {
        if (width <= 0) { return ''; }
        const filled = Math.round(Math.max(0, Math.min(width, fillRatio * width)));
        return fillChar.repeat(filled) + emptyChar.repeat(width - filled);
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
            if (this.statusBarItem) {
                this.statusBarItem.text = '$(cloud) Antigravity: ERR';
            }
        }
    }

    private showRefreshingState(): void {
        if (this.statusBarItem) {
            this.statusBarItem.text = '$(sync~spin) Antigravity...';
            this.statusBarItem.tooltip = 'Refreshing quota data...';
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
