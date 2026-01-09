import * as vscode from 'vscode';
import { BaseStatusBarItem, BaseStatusBarItemConfig } from './baseStatusBarItem';
import { StatusLogger } from '../utils/statusLogger';
import { TokenUsageStatusBar } from './tokenUsageStatusBar';
import { ApiKeyManager } from '../utils/apiKeyManager';

export interface CopilotStatusData {
    timestamp: number;
    providers?: Record<string, string>;
    tokenUsage?: {
        modelName: string;
        percentage: number;
    } | null;
    inlineEnabled?: boolean;
    fimEnabled?: boolean;
    nesEnabled?: boolean;
}

export class CopilotStatusBar extends BaseStatusBarItem<CopilotStatusData> {
    constructor() {
        const config: BaseStatusBarItemConfig = {
            id: 'chp.statusBar.copilot',
            name: 'Copilot ++: Unified Status',
            alignment: vscode.StatusBarAlignment.Right,
            priority: 100,
            refreshCommand: 'chp.copilot.refreshStatus',
            cacheKeyPrefix: 'copilot',
            logPrefix: 'Copilot Status Bar',
            icon: '$(copilot)'
        };
        super(config);
    }

    protected getDisplayText(_data: CopilotStatusData): string {
        // Keep compact display text - icon only
        return `${this.config.icon}`;
    }

    protected generateTooltip(_data: CopilotStatusData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;

        // Header
        md.appendMarkdown('#### Copilot ++ Overview\n\n');

        // Token usage (from TokenUsageStatusBar)
        const tokenBar = TokenUsageStatusBar.getInstance();
        if (tokenBar) {
            const tokenData = tokenBar.getCurrentData();
            if (tokenData) {
                md.appendMarkdown(`**Context Usage:** ${tokenData.modelName} — **${tokenData.percentage.toFixed(1)}%** \n\n`);
            } else {
                md.appendMarkdown('**Context Usage:** No requests yet\n\n');
            }
        } else {
            md.appendMarkdown('**Context Usage:** N/A\n\n');
        }

        // Inline Suggestions and Chat (approximate from settings)
        const editorCfg = vscode.workspace.getConfiguration('editor');
        const inlineEnabled = editorCfg.get<boolean>('inlineSuggest.enabled', true);
        md.appendMarkdown(`**Inline Suggestions:** ${inlineEnabled ? 'Included' : 'Disabled'}\n\n`);

        // FIM/NES settings
        const fimEnabled = vscode.workspace.getConfiguration('chp').get<boolean>('fimCompletion.enabled', false);
        const nesEnabled = vscode.workspace.getConfiguration('chp').get<boolean>('nesCompletion.enabled', false);
        md.appendMarkdown(`**FIM (Fill In the Middle):** ${fimEnabled ? 'Enabled' : 'Disabled'}  
`);
        md.appendMarkdown(`**NES (Next Edit Suggestions):** ${nesEnabled ? 'Enabled' : 'Disabled'}\n\n`);

        // Workspace Index (best-effort)
        md.appendMarkdown('**Workspace Index:** Locally indexed\n\n');

        // Providers summary
        md.appendMarkdown('---\n');
        md.appendMarkdown('#### Providers\n\n');
        const knownProviders = ['deepseek', 'chutes', 'opencode', 'huggingface', 'deepinfra', 'minimax', 'zhipu', 'antigravity', 'codex', 'compatible'];
        for (const p of knownProviders) {
            md.appendMarkdown(`- **${this.titleCase(p)}**\n`);
        }

        md.appendMarkdown('\n---\n');
        md.appendMarkdown('Click to refresh or open settings.');

        return md;
    }

    protected async performApiQuery(): Promise<{ success: boolean; data?: CopilotStatusData; error?: string }> {
        try {
            const knownProviders = ['deepseek', 'chutes', 'opencode', 'huggingface', 'deepinfra', 'minimax', 'zhipu', 'antigravity', 'codex', 'compatible'];

            // Gather provider configuration status
            const providerStatuses: Record<string, string> = {};
            await Promise.all(
                knownProviders.map(async p => {
                    try {
                        const hasKey = await ApiKeyManager.hasValidApiKey(p);
                        providerStatuses[p] = hasKey ? 'Configured' : 'Not configured';
                    } catch {
                        providerStatuses[p] = 'Unknown';
                    }
                })
            );

            // Token usage
            const tokenBar = TokenUsageStatusBar.getInstance();
            const tokenData = tokenBar?.getCurrentData();

            // Local settings
            const inlineEnabled = vscode.workspace.getConfiguration('editor').get<boolean>('inlineSuggest.enabled', true);
            const fimEnabled = vscode.workspace.getConfiguration('chp').get<boolean>('fimCompletion.enabled', false);
            const nesEnabled = vscode.workspace.getConfiguration('chp').get<boolean>('nesCompletion.enabled', false);

            const data: CopilotStatusData = {
                timestamp: Date.now(),
                providers: providerStatuses,
                tokenUsage: tokenData ? { modelName: tokenData.modelName, percentage: tokenData.percentage } : null,
                inlineEnabled,
                fimEnabled,
                nesEnabled
            };

            return { success: true, data };
        } catch (e) {
            StatusLogger.error('[CopilotStatusBar] performApiQuery failed', e);
            return { success: false, error: 'Internal error' };
        }
    }

    protected shouldHighlightWarning(_data: CopilotStatusData): boolean {
        // Add highlight if any provider is missing API key? For now, false
        return false;
    }

    protected shouldRefresh(): boolean {
        // Refresh periodically every minute
        return true;
    }

    protected async shouldShowStatusBar(): Promise<boolean> {
        // Always show unified status bar
        return true;
    }

    private titleCase(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
}
