/*---------------------------------------------------------------------------------------------
 *  Model Context Window Usage Status Bar
 *  Displays the model context window usage of the most recent request
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { StatusLogger } from '../utils/statusLogger';

export interface TokenUsageData {
    modelId: string;
    modelName: string;
    inputTokens: number;
    maxInputTokens: number;
    percentage: number;
    timestamp: number;
    providerKey?: string;
}

export class TokenUsageStatusBar {
    private static instance: TokenUsageStatusBar | undefined;
    private statusBarItem: vscode.StatusBarItem | undefined;
    private currentData: TokenUsageData | undefined;
    private static _onDidChangeActiveModel = new vscode.EventEmitter<TokenUsageData>();
    static readonly onDidChangeActiveModel = TokenUsageStatusBar._onDidChangeActiveModel.event;

    private readonly defaultData: TokenUsageData = {
        modelId: '',
        modelName: 'No requests yet',
        inputTokens: 0,
        maxInputTokens: 0,
        percentage: 0,
        timestamp: 0
    };

    constructor() {
        TokenUsageStatusBar.instance = this;
    }

    static getInstance(): TokenUsageStatusBar | undefined {
        return TokenUsageStatusBar.instance;
    }

    async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.statusBarItem = vscode.window.createStatusBarItem(
            'chp.statusBar.tokenUsage',
            vscode.StatusBarAlignment.Right,
            11
        );

        this.statusBarItem.name = 'Copilot Helper: Model Context Window Usage';
        this.updateUI(this.defaultData);
        this.statusBarItem.show();

        context.subscriptions.push(this.statusBarItem);
        StatusLogger.debug('[TokenUsageStatusBar] Initialization completed');
    }

    updateTokenUsage(data: TokenUsageData): void {
        StatusLogger.debug(
            `[TokenUsageStatusBar] Update token usage data: ${data.inputTokens}/${data.maxInputTokens}`
        );

        const providerKey = this.extractProviderKey(data.modelId);
        const enrichedData: TokenUsageData = {
            ...data,
            providerKey
        };

        this.currentData = enrichedData;
        this.updateUI(enrichedData);

        TokenUsageStatusBar._onDidChangeActiveModel.fire(enrichedData);

        if (this.statusBarItem) {
            this.statusBarItem.show();
        }
    }

    private extractProviderKey(modelId: string): string | undefined {
        if (!modelId) return undefined;
        const colonIndex = modelId.indexOf(':');
        if (colonIndex > 0) {
            return modelId.substring(0, colonIndex);
        }
        const lowerModelId = modelId.toLowerCase();
        if (lowerModelId.includes('codex') || lowerModelId.includes('gpt')) {
            return 'codex';
        }
        if (lowerModelId.includes('gemini') || lowerModelId.includes('claude')) {
            return 'antigravity';
        }
        return undefined;
    }

    getCurrentData(): TokenUsageData | undefined {
        return this.currentData;
    }

    private updateUI(data: TokenUsageData): void {
        if (!this.statusBarItem) {
            return;
        }

        this.statusBarItem.text = this.getDisplayText(data);
        this.statusBarItem.tooltip = this.generateTooltip(data);
    }

    private getPieChartIcon(percentage: number): string {
        if (percentage === 0) {
            return '$(chp-tokens)';
        } else if (percentage <= 25) {
            return '$(chp-token1)';
        } else if (percentage <= 35) {
            return '$(chp-token2)';
        } else if (percentage <= 45) {
            return '$(chp-token3)';
        } else if (percentage <= 55) {
            return '$(chp-token4)';
        } else if (percentage <= 65) {
            return '$(chp-token5)';
        } else if (percentage <= 75) {
            return '$(chp-token6)';
        } else if (percentage <= 85) {
            return '$(chp-token7)';
        } else {
            return '$(chp-token8)';
        }
    }

    private formatTokens(tokens: number): string {
        if (tokens >= 1000000) {
            return (tokens / 1000000).toFixed(1) + 'M';
        } else if (tokens >= 1000) {
            return (tokens / 1000).toFixed(1) + 'K';
        } else {
            return tokens.toString();
        }
    }

    protected getDisplayText(data: TokenUsageData): string {
        const icon = this.getPieChartIcon(data.percentage);
        return icon;
    }

    private generateTooltip(data: TokenUsageData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;

        md.appendMarkdown('#### Model Context Window Usage\n\n');

        if (data.inputTokens === 0 && data.maxInputTokens === 0) {
            md.appendMarkdown('💡 Displayed after sending any request provided by Copilot Helper\n');
            return md;
        }

        md.appendMarkdown('|  Item  | Value |\n');
        md.appendMarkdown('| :----: | :---- |\n');
        md.appendMarkdown(`| **Model Name** | ${data.modelName} |\n`);

        const usageString = `${this.formatTokens(data.inputTokens)}/${this.formatTokens(data.maxInputTokens)}`;
        md.appendMarkdown(`| **Usage** | **${data.percentage.toFixed(1)}%** ${usageString} |\n`);

        const requestTime = new Date(data.timestamp);
        const requestTimeStr = requestTime.toLocaleString('en-US', { hour12: false });
        md.appendMarkdown(`| **Request Time** | ${requestTimeStr} |\n`);

        md.appendMarkdown('\n---\n');
        md.appendMarkdown('💡 This data shows the context usage of the most recent request\n');

        return md;
    }

    async checkAndShowStatus(): Promise<void> {
        if (this.statusBarItem) {
            this.statusBarItem.show();
        }
    }

    delayedUpdate(_delayMs?: number): void {
    }

    dispose(): void {
        this.statusBarItem?.dispose();
        StatusLogger.debug('[TokenUsageStatusBar] Disposed');
    }
}
