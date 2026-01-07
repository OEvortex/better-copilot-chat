/*---------------------------------------------------------------------------------------------
 *  OpenCode Status Bar Item
 *  Inherits ProviderStatusBarItem, displays OpenCode status
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProviderStatusBarItem, StatusBarItemConfig } from './providerStatusBarItem';
import { ApiKeyManager } from '../utils/apiKeyManager';

/**
 * OpenCode status data
 */
export interface OpenCodeStatusData {
    lastUpdated: string;
}

/**
 * OpenCode status bar item
 */
export class OpenCodeStatusBar extends ProviderStatusBarItem<OpenCodeStatusData> {
    constructor() {
        const config: StatusBarItemConfig = {
            id: 'chp.statusBar.opencode',
            name: 'Copilot ++: OpenCode Status',
            alignment: vscode.StatusBarAlignment.Right,
            priority: 74,
            refreshCommand: 'chp.opencode.refreshStatus',
            apiKeyProvider: 'opencode',
            cacheKeyPrefix: 'opencode',
            logPrefix: 'OpenCode Status Bar',
            icon: '$(code)'
        };
        super(config);
    }

    /**
     * Get display text
     */
    protected getDisplayText(_data: OpenCodeStatusData): string {
        return `${this.config.icon} OpenCode`;
    }

    /**
     * Generate Tooltip content
     */
    protected generateTooltip(data: OpenCodeStatusData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.appendMarkdown('#### OpenCode Provider Status\n\n');
        md.appendMarkdown(`**Status:** Active\n\n`);
        md.appendMarkdown(`**Last Updated:** ${data.lastUpdated}\n`);
        md.appendMarkdown('---\n');
        md.appendMarkdown('Click to refresh status\n');
        return md;
    }

    /**
     * Execute API query
     */
    protected async performApiQuery(): Promise<{ success: boolean; data?: OpenCodeStatusData; error?: string }> {
        const hasApiKey = await ApiKeyManager.hasValidApiKey('opencode');
        if (!hasApiKey) {
            return {
                success: false,
                error: 'OpenCode API key not configured'
            };
        }

        return {
            success: true,
            data: {
                lastUpdated: new Date().toLocaleString()
            }
        };
    }

    protected shouldHighlightWarning(_data: OpenCodeStatusData): boolean {
        return false;
    }

    protected shouldRefresh(): boolean {
        return false;
    }
}
