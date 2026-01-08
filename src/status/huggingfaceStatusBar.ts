/*---------------------------------------------------------------------------------------------
 *  Hugging Face Status Bar Item
 *  Inherits ProviderStatusBarItem, displays Hugging Face status
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProviderStatusBarItem, StatusBarItemConfig } from './providerStatusBarItem';
import { ApiKeyManager } from '../utils/apiKeyManager';

/**
 * Hugging Face status data
 */
export interface HuggingFaceStatusData {
    lastUpdated: string;
}

/**
 * Hugging Face status bar item
 */
export class HuggingFaceStatusBar extends ProviderStatusBarItem<HuggingFaceStatusData> {
    constructor() {
        const config: StatusBarItemConfig = {
            id: 'chp.statusBar.huggingface',
            name: 'Copilot ++: Hugging Face Status',
            alignment: vscode.StatusBarAlignment.Right,
            priority: 73,
            refreshCommand: 'chp.huggingface.refreshStatus',
            apiKeyProvider: 'huggingface',
            cacheKeyPrefix: 'huggingface',
            logPrefix: 'Hugging Face Status Bar',
            icon: '$(hubot)'
        };
        super(config);
    }

    /**
     * Get display text
     */
    protected getDisplayText(_data: HuggingFaceStatusData): string {
        return `${this.config.icon} HF`;
    }

    /**
     * Generate Tooltip content
     */
    protected generateTooltip(data: HuggingFaceStatusData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.appendMarkdown('#### Hugging Face Provider Status\n\n');
        md.appendMarkdown('**Status:** Active\n\n');
        md.appendMarkdown(`**Last Updated:** ${data.lastUpdated}\n`);
        md.appendMarkdown('---\n');
        md.appendMarkdown('Click to refresh status\n');
        return md;
    }

    /**
     * Execute API query
     */
    protected async performApiQuery(): Promise<{ success: boolean; data?: HuggingFaceStatusData; error?: string }> {
        const hasApiKey = await ApiKeyManager.hasValidApiKey('huggingface');
        if (!hasApiKey) {
            return {
                success: false,
                error: 'Hugging Face API key not configured'
            };
        }

        return {
            success: true,
            data: {
                lastUpdated: new Date().toLocaleString()
            }
        };
    }

    protected shouldHighlightWarning(_data: HuggingFaceStatusData): boolean {
        return false;
    }

    protected shouldRefresh(): boolean {
        return false;
    }
}
