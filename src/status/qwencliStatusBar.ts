/*---------------------------------------------------------------------------------------------
 *  Qwen Code CLI Status Bar Item
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BaseStatusBarItem, BaseStatusBarItemConfig } from './baseStatusBarItem';
import { QwenOAuthManager } from '../providers/qwencli/auth';

/**
 * Qwen CLI status data
 */
export interface QwenCliStatusData {
    lastUpdated: string;
    isLoggedIn: boolean;
}

/**
 * Qwen CLI status bar item
 */
export class QwenCliStatusBar extends BaseStatusBarItem<QwenCliStatusData> {
    constructor() {
        const config: BaseStatusBarItemConfig = {
            id: 'chp.statusBar.qwencli',
            name: 'Copilot ++: Qwen CLI Status',
            alignment: vscode.StatusBarAlignment.Right,
            priority: 73,
            refreshCommand: 'chp.qwencli.refreshStatus',
            cacheKeyPrefix: 'qwencli',
            logPrefix: 'Qwen CLI Status Bar',
            icon: '$(terminal)'
        };
        super(config);
    }

    protected getDisplayText(data: QwenCliStatusData): string {
        return `${this.config.icon} Qwen CLI${data.isLoggedIn ? '' : ' (Login Required)'}`;
    }

    protected generateTooltip(data: QwenCliStatusData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.appendMarkdown('#### Qwen Code CLI Status\n\n');
        md.appendMarkdown(`**Status:** ${data.isLoggedIn ? 'Authenticated' : 'Login Required'}\n\n`);
        md.appendMarkdown(`**Last Updated:** ${data.lastUpdated}\n`);
        md.appendMarkdown('---\n');
        md.appendMarkdown('Click to refresh status\n');
        return md;
    }

    protected async performApiQuery(): Promise<{ success: boolean; data?: QwenCliStatusData; error?: string }> {
        try {
            await QwenOAuthManager.getInstance().ensureAuthenticated();
            return {
                success: true,
                data: {
                    lastUpdated: new Date().toLocaleString(),
                    isLoggedIn: true
                }
            };
        } catch {
            return {
                success: true,
                data: {
                    lastUpdated: new Date().toLocaleString(),
                    isLoggedIn: false
                }
            };
        }
    }

    protected shouldHighlightWarning(data: QwenCliStatusData): boolean {
        return !data.isLoggedIn;
    }

    protected shouldRefresh(): boolean {
        return true;
    }

    protected async shouldShowStatusBar(): Promise<boolean> {
        // Always show if the provider is registered
        return true;
    }
}
