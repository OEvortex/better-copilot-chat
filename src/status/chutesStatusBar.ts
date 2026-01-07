/*---------------------------------------------------------------------------------------------
 *  Chutes Status Bar Item
 *  Inherits ProviderStatusBarItem, displays Chutes status
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProviderStatusBarItem, StatusBarItemConfig } from './providerStatusBarItem';
import { ApiKeyManager } from '../utils/apiKeyManager';

/**
 * Chutes status data
 */
export interface ChutesStatusData {
    currentValue: number;
    usage: number;
    remaining: number;
    percentage: number;
    lastUpdated: string;
}

/**
 * Chutes status bar item
 */
export class ChutesStatusBar extends ProviderStatusBarItem<ChutesStatusData> {
    constructor() {
        const config: StatusBarItemConfig = {
            id: 'chp.statusBar.chutes',
            name: 'Copilot ++: Chutes Status',
            alignment: vscode.StatusBarAlignment.Right,
            priority: 75,
            refreshCommand: 'chp.chutes.refreshStatus',
            apiKeyProvider: 'chutes',
            cacheKeyPrefix: 'chutes',
            logPrefix: 'Chutes Status Bar',
            icon: '$(hubot)'
        };
        super(config);
    }

    /**
     * Get display text
     */
    protected getDisplayText(data: ChutesStatusData): string {
        return `${this.config.icon} ${data.remaining}`;
    }

    /**
     * Generate Tooltip content
     */
    protected generateTooltip(data: ChutesStatusData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.appendMarkdown('#### Chutes Global Request Limit\n\n');
        md.appendMarkdown(`**Daily Limit:** ${data.usage}\n`);
        md.appendMarkdown(`**Used Today:** ${data.currentValue}\n`);
        md.appendMarkdown(`**Remaining:** **${data.remaining}**\n\n`);
        md.appendMarkdown(`**Usage:** ${data.percentage.toFixed(1)}%\n\n`);
        md.appendMarkdown(`**Last Updated:** ${data.lastUpdated}\n`);
        md.appendMarkdown('---\n');
        md.appendMarkdown('Click to refresh status\n');
        return md;
    }

    /**
     * Execute API query
     */
    protected async performApiQuery(): Promise<{ success: boolean; data?: ChutesStatusData; error?: string }> {
        const hasApiKey = await ApiKeyManager.hasValidApiKey('chutes');
        if (!hasApiKey) {
            return {
                success: false,
                error: 'Chutes API key not configured'
            };
        }

        const cacheKey = 'chutes.requestCount';
        const lastResetKey = 'chutes.lastResetDate';
        const today = new Date().toDateString();

        let count = this.context?.globalState.get<number>(cacheKey) || 0;
        const lastReset = this.context?.globalState.get<string>(lastResetKey);

        if (lastReset !== today) {
            count = 0;
            // Note: We don't update globalState here to avoid side effects in query
        }

        const totalLimit = 5000;
        const remaining = Math.max(0, totalLimit - count);
        const percentage = (count / totalLimit) * 100;

        return {
            success: true,
            data: {
                currentValue: count,
                usage: totalLimit,
                remaining: remaining,
                percentage: percentage,
                lastUpdated: new Date().toLocaleString()
            }
        };
    }

    protected shouldHighlightWarning(data: ChutesStatusData): boolean {
        return data.percentage >= 80;
    }

    protected shouldRefresh(): boolean {
        return true;
    }
}
