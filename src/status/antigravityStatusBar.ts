/*---------------------------------------------------------------------------------------------
 *  Antigravity (Cloud Code) Quota Status Bar
 *  Displays Antigravity/Cloud Code API quota information
 *  Shows remaining quota and usage details
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AntigravityAuth } from '../providers/antigravity/auth';
import { Logger } from '../utils/logger';
import { StatusLogger } from '../utils/statusLogger';
import { ProviderStatusBarItem, StatusBarItemConfig } from './providerStatusBarItem';
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
    // New fields for detailed model quota
    geminiQuota?: number; // Gemini models min quota percentage
    claudeQuota?: number; // Claude models min quota percentage
    modelQuotas: ModelQuotaInfo[]; // All model quotas for tooltip
}

export class AntigravityStatusBar extends ProviderStatusBarItem<AntigravityQuotaData> {
    private geminiStatusBarItem: vscode.StatusBarItem;
    private claudeStatusBarItem: vscode.StatusBarItem;
    private shouldShowPopupAfterRefresh = false;

    constructor() {
        const config: StatusBarItemConfig = {
            id: 'chp.statusBar.antigravity',
            name: 'Copilot ++: Antigravity Quota',
            alignment: vscode.StatusBarAlignment.Right,
            priority: 98,
            refreshCommand: 'chp.antigravity.refreshAndShowQuota', // Use custom command
            apiKeyProvider: ProviderKey.Antigravity,
            cacheKeyPrefix: ProviderKey.Antigravity,
            logPrefix: 'Antigravity Status Bar',
            icon: '$(cloud)'
        };
        super(config);

        // Create separate status bar items for Gemini and Claude
        this.geminiStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
        this.geminiStatusBarItem.name = 'Antigravity Gemini Quota';
        this.geminiStatusBarItem.command = 'chp.showAntigravityQuota'; // Registered in package.json

        this.claudeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);
        this.claudeStatusBarItem.name = 'Antigravity Claude Quota';
        this.claudeStatusBarItem.command = 'chp.showAntigravityQuota'; // Registered in package.json
    }

    /**
     * Override shouldShowStatusBar to use AntigravityAuth.isLoggedIn()
     * instead of checking API key directly
     */
    protected override async shouldShowStatusBar(): Promise<boolean> {
        return await AntigravityAuth.isLoggedIn();
    }

    protected getDisplayText(data: AntigravityQuotaData): string {
        // Update separate status bar items
        this.updateSeparateStatusBars(data);

        // Return empty string as we're using separate status bars now
        return '';
    }

    private updateSeparateStatusBars(data: AntigravityQuotaData): void {
        const tooltip = this.generateTooltip(data);

        // Update Gemini status bar
        if (data.geminiQuota !== undefined) {
            const geminiText = `$(arrow-up) Gemini: ${data.geminiQuota}%  `;
            this.geminiStatusBarItem.text = geminiText;
            this.geminiStatusBarItem.tooltip = tooltip;
            this.applyQuotaStyle(this.geminiStatusBarItem, data.geminiQuota);
            this.geminiStatusBarItem.show();
        } else {
            this.geminiStatusBarItem.hide();
        }

        // Update Claude status bar
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

        // Hide the main status bar item since we're using separate ones
        if (this.statusBarItem) {
            this.statusBarItem.hide();
        }
    }

    private applyQuotaStyle(item: vscode.StatusBarItem, quota: number): void {
        // Apply color based on quota percentage (similar to Codex)
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

        // Normal state - use green to differentiate from Codex
        item.backgroundColor = undefined;
        item.color = new vscode.ThemeColor('charts.green');
    }

    private getStatusIndicator(percentage: number): string {
        if (percentage >= 50) {
            return '$(check)'; // Green indicator
        } else if (percentage >= 20) {
            return '$(warning)'; // Yellow/warning indicator
        } else {
            return '$(error)'; // Red/error indicator
        }
    }

    private getStatusEmoji(percentage: number): string {
        if (percentage >= 50) {
            return 'OK';
        } else if (percentage >= 20) {
            return 'WARN';
        } else {
            return 'FAIL';
        }
    }

    protected generateTooltip(data: AntigravityQuotaData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.appendMarkdown('#### $(cloud) Antigravity Quota\n\n');

        if (data.email) {
            md.appendMarkdown(`**Account:** ${data.email}\n\n`);
        }

        // Show Gemini and Claude summary
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

        // Show detailed model quotas
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
        // Fetch models với quota info
        const models = await AntigravityAuth.getModels();

        const projectId = await AntigravityAuth.getProjectId();
        const stored = await this.getStoredAuthData();

        // Collect all model quotas for tooltip
        const modelQuotas: ModelQuotaInfo[] = [];
        let minRemainingFraction = 1.0;
        let resetTime: string | undefined;

        // Separate quotas for Gemini and Claude
        let geminiMinQuota = 1.0;
        let gemini3ProQuota: number | null = null;
        let claudeMinQuota = 1.0;
        let hasGemini = false;
        let hasClaude = false;

        // Process each model's quota
        for (const model of models) {
            if (model.quotaInfo?.remainingFraction !== undefined) {
                const fraction = model.quotaInfo.remainingFraction;

                // Add to model quotas list
                modelQuotas.push({
                    modelId: model.id,
                    displayName: model.displayName || model.name,
                    remainingFraction: fraction,
                    resetTime: model.quotaInfo.resetTime
                });

                // Track overall minimum
                if (fraction < minRemainingFraction) {
                    minRemainingFraction = fraction;
                    resetTime = model.quotaInfo.resetTime;
                }

                // Categorize by provider (Gemini vs Claude)
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

        // Convert remainingFraction to percentage format
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

    private formatLimitType(type: string): string {
        switch (type) {
            case 'API_REQUESTS':
                return 'API Requests';
            case 'TOKENS':
                return 'Tokens';
            case 'TOKENS_LIMIT':
                return 'Token Limit';
            default:
                return type
                    .replace(/_/g, ' ')
                    .toLowerCase()
                    .replace(/\b\w/g, c => c.toUpperCase());
        }
    }

    private formatNumber(num: number): string {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    protected shouldHighlightWarning(data: AntigravityQuotaData): boolean {
        return data.maxUsageLimit.percentage >= this.HIGH_USAGE_THRESHOLD;
    }

    protected shouldRefresh(): boolean {
        if (!this.lastStatusData) {
            return false;
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
        // Register the command declared in package.json for showing quota popup
        // This is separate from the base class refresh command

        if (this.context) {
            // Register popup command (declared in package.json as chp.showAntigravityQuota)
            this.context.subscriptions.push(
                vscode.commands.registerCommand('chp.showAntigravityQuota', async () => {
                    Logger.info('[Antigravity] showAntigravityQuota command triggered');
                    await this.refreshAndShowQuota();
                })
            );
        }
    }

    /**
     * Custom method that refreshes quota AND shows popup
     */
    private async refreshAndShowQuota(): Promise<void> {
        Logger.info('[Antigravity] refreshAndShowQuota called');

        // Show popup FIRST (immediately)
        Logger.info('[Antigravity] Showing popup...');
        const popupPromise = this.showQuotaQuickPick();

        // Start refresh in background while popup is showing
        if (!this.isLoading) {
            Logger.info('[Antigravity] Starting background refresh...');
            this.executeApiQuery(true).catch(err => {
                Logger.error('[Antigravity] Refresh failed:', err);
            });
        }

        // Wait for popup to complete
        await popupPromise;
    }

    /**
     * Override executeApiQuery to show "Refreshing..." on both status bars
     */
    protected override async executeApiQuery(isManualRefresh = false): Promise<void> {
        try {
            // Show refreshing state on both status bars
            this.showRefreshingState();

            // Call parent's executeApiQuery
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

    /**
     * Show "Refreshing..." state on both status bars
     */
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

        // Return a promise that resolves when the quickPick is hidden
        return new Promise<void>(async resolve => {
            try {
                Logger.info('[Antigravity] Fetching models and quota...');
                const [models, quotaData] = await Promise.all([
                    AntigravityAuth.getCachedModels().then(cached =>
                        cached.length > 0 ? cached : AntigravityAuth.getModels()
                    ),
                    this.lastStatusData?.data || this.fetchQuotaData()
                ]);
                Logger.info(`[Antigravity] Got ${models.length} models, quotaData: ${quotaData ? 'yes' : 'no'}`);

                const items: vscode.QuickPickItem[] = [];

                items.push({
                    label: '$(info) Quota Information',
                    kind: vscode.QuickPickItemKind.Separator
                });

                if (quotaData) {
                    if (quotaData.email) {
                        items.push({
                            label: `$(account) ${quotaData.email}`,
                            description: quotaData.projectId ? `Project: ${quotaData.projectId}` : ''
                        });
                    }

                    // Hiển thị tổng quota
                    const percentage = quotaData.maxUsageLimit.remaining;
                    const icon = percentage > 50 ? '$(check)' : percentage > 20 ? '$(warning)' : '$(error)';
                    items.push({
                        label: `${icon} Overall Quota`,
                        description: `${percentage}% remaining`,
                        detail: quotaData.maxUsageLimit.resetTime
                            ? `Resets at ${new Date(quotaData.maxUsageLimit.resetTime).toLocaleString()}`
                            : undefined
                    });
                }

                if (models.length > 0) {
                    items.push({
                        label: '$(symbol-class) Available Models',
                        kind: vscode.QuickPickItemKind.Separator
                    });

                    for (const model of models) {
                        let description = model.id;
                        let detail = `Provider: ${model.ownedBy}`;

                        // Hiển thị quota info của từng model nếu có
                        if (model.quotaInfo?.remainingFraction !== undefined) {
                            const modelQuota = Math.round(model.quotaInfo.remainingFraction * 100);
                            const quotaIcon = modelQuota > 50 ? 'OK' : modelQuota > 20 ? 'WARN' : 'FAIL';
                            description = `${model.id} (${quotaIcon} ${modelQuota}%)`;

                            if (model.quotaInfo.resetTime) {
                                const resetDate = new Date(model.quotaInfo.resetTime);
                                detail = `${detail} • Resets: ${resetDate.toLocaleString()}`;
                            }
                        }

                        items.push({
                            label: `$(sparkle) ${model.displayName || model.name}`,
                            description: description,
                            detail: detail
                        });
                    }
                }

                items.push({
                    label: '$(gear) Actions',
                    kind: vscode.QuickPickItemKind.Separator
                });

                items.push({
                    label: '$(refresh) Refresh Quota',
                    description: 'Update quota information'
                });

                items.push({
                    label: '$(sync) Refresh Models',
                    description: 'Fetch latest available models'
                });

                items.push({
                    label: '$(sign-out) Logout',
                    description: 'Sign out from Antigravity'
                });

                quickPick.busy = false;
                quickPick.placeholder = 'Select an action or view details';
                quickPick.items = items;

                quickPick.onDidAccept(async () => {
                    const selected = quickPick.selectedItems[0];
                    quickPick.hide();

                    if (!selected) return;

                    if (selected.label.includes('Refresh Quota')) {
                        await this.executeApiQuery(true);
                        vscode.window.showInformationMessage('Antigravity quota refreshed');
                    } else if (selected.label.includes('Refresh Models')) {
                        const newModels = await AntigravityAuth.refreshModels();
                        vscode.window.showInformationMessage(`Refreshed ${newModels.length} Antigravity models`);
                    } else if (selected.label.includes('Logout')) {
                        await AntigravityAuth.logout();
                        this.statusBarItem?.hide();
                    }
                });

                quickPick.onDidHide(() => {
                    quickPick.dispose();
                    resolve();
                });
            } catch (error) {
                quickPick.hide();
                Logger.error('[Antigravity] Failed to show quota quick pick:', error);
                vscode.window.showErrorMessage(`Failed to load Antigravity data: ${error}`);
                resolve();
            }
        });
    }

    private async fetchQuotaData(): Promise<AntigravityQuotaData | null> {
        const result = await this.performApiQuery();
        return result.success ? result.data || null : null;
    }

    override dispose(): void {
        this.geminiStatusBarItem.dispose();
        this.claudeStatusBarItem.dispose();
        super.dispose();
    }
}
