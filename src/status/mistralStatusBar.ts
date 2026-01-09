/*---------------------------------------------------------------------------------------------
 *  Mistral AI Status Bar Item
 *  Inherits from ProviderStatusBarItem, displays Mistral AI status
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProviderStatusBarItem, StatusBarItemConfig } from './providerStatusBarItem';

/**
 * Mistral AI Status Data
 */
interface MistralStatusData {
    status: string;
}

/**
 * Mistral AI Status Bar Item
 */
export class MistralStatusBar extends ProviderStatusBarItem<MistralStatusData> {
    constructor() {
        const config: StatusBarItemConfig = {
            id: 'chp.statusBar.mistral',
            name: 'Copilot ++: Mistral AI',
            alignment: vscode.StatusBarAlignment.Right,
            priority: 75,
            refreshCommand: 'chp.mistral.refreshStatus',
            apiKeyProvider: 'mistral',
            cacheKeyPrefix: 'mistral',
            logPrefix: 'Mistral Status Bar',
            icon: '$(chp-mistral)'
        };
        super(config);
    }

    protected getDisplayText(_data: MistralStatusData): string {
        return `${this.config.icon} Mistral`;
    }

    protected generateTooltip(_data: MistralStatusData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown('#### Mistral AI Status\n\n');
        md.appendMarkdown('Mistral AI provider is active.\n');
        return md;
    }

    protected async performApiQuery(): Promise<{ success: boolean; data?: MistralStatusData; error?: string }> {
        return { success: true, data: { status: 'active' } };
    }

    protected shouldHighlightWarning(_data: MistralStatusData): boolean {
        return false;
    }

    protected shouldRefresh(): boolean {
        return false;
    }
}
