/*---------------------------------------------------------------------------------------------
 *  Model Context Window Usage Status Bar
 *  Displays the model context window usage of the most recent request
 *  Independent implementation, does not use cache mechanism
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { StatusLogger } from '../utils/statusLogger';

/**
 * Model Context Window Usage Data Interface
 */
export interface TokenUsageData {
    /** Model ID */
    modelId: string;
    /** Model Name */
    modelName: string;
    /** Input token count */
    inputTokens: number;
    /** Max input token count */
    maxInputTokens: number;
    /** Usage percentage */
    percentage: number;
    /** Request timestamp */
    timestamp: number;
    /** Provider key (extracted from modelId) */
    providerKey?: string;
}

/**
 * Model Context Window Usage Status Bar
 * Independent implementation, does not rely on cache mechanism
 * Updates status directly via updateTokenUsage only on request
 */
export class TokenUsageStatusBar {
    // Static instance for global access
    private static instance: TokenUsageStatusBar | undefined;

    // Status bar item
    private statusBarItem: vscode.StatusBarItem | undefined;

    // Current status data
    private currentData: TokenUsageData | undefined;

    // Event emitter for model usage changes
    private static _onDidChangeActiveModel = new vscode.EventEmitter<TokenUsageData>();
    static readonly onDidChangeActiveModel = TokenUsageStatusBar._onDidChangeActiveModel.event;

    // Default data, displays 0%
    private readonly defaultData: TokenUsageData = {
        modelId: '',
        modelName: 'No requests yet',
        inputTokens: 0,
        maxInputTokens: 0,
        percentage: 0,
        timestamp: 0
    };

    constructor() {
        // Save instance reference
        TokenUsageStatusBar.instance = this;
    }

    /**
     * Get global instance
     */
    static getInstance(): TokenUsageStatusBar | undefined {
        return TokenUsageStatusBar.instance;
    }

    /**
     * Initialize status bar
     */
    async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.statusBarItem = vscode.window.createStatusBarItem(
            'chp.statusBar.tokenUsage',
            vscode.StatusBarAlignment.Right,
            11
        );

        this.statusBarItem.name = 'Copilot ++: Model Context Window Usage';

        // Initial display
        this.updateUI(this.defaultData);
        this.statusBarItem.show();

        context.subscriptions.push(this.statusBarItem);
        StatusLogger.debug('[TokenUsageStatusBar] Initialization completed');
    }

    /**
     * Update token usage data (external call)
     */
    updateTokenUsage(data: TokenUsageData): void {
        StatusLogger.debug(
            `[TokenUsageStatusBar] Update token usage data: ${data.inputTokens}/${data.maxInputTokens}`
        );

        // Extract provider key from modelId (format: "provider:model-name")
        const providerKey = this.extractProviderKey(data.modelId);
        const enrichedData: TokenUsageData = {
            ...data,
            providerKey
        };

        // Save current data
        this.currentData = enrichedData;

        // Directly update UI (no cache)
        this.updateUI(enrichedData);

        // Fire event for model change
        TokenUsageStatusBar._onDidChangeActiveModel.fire(enrichedData);

        // Ensure status bar is visible
        if (this.statusBarItem) {
            this.statusBarItem.show();
        }
    }

    /**
     * Extract provider key from modelId
     * Format: "provider:model-name" -> "provider"
     */
    private extractProviderKey(modelId: string): string | undefined {
        if (!modelId) {return undefined;}
        const colonIndex = modelId.indexOf(':');
        if (colonIndex > 0) {
            return modelId.substring(0, colonIndex);
        }
        // Try to detect provider from model name patterns
        const lowerModelId = modelId.toLowerCase();
        if (lowerModelId.includes('codex') || lowerModelId.includes('gpt')) {
            return 'codex';
        }
        if (lowerModelId.includes('gemini') || lowerModelId.includes('claude')) {
            return 'antigravity';
        }
        return undefined;
    }

    /**
     * Get current active model data
     */
    getCurrentData(): TokenUsageData | undefined {
        return this.currentData;
    }

    /**
     * Update status bar UI
     */
    private updateUI(data: TokenUsageData): void {
        if (!this.statusBarItem) {
            return;
        }

        // Update text
        this.statusBarItem.text = this.getDisplayText(data);

        // Update Tooltip
        this.statusBarItem.tooltip = this.generateTooltip(data);
    }

    /**
     * Get icon based on percentage
     */
    private getPieChartIcon(percentage: number): string {
        if (percentage === 0) {
            return '$(chp-tokens)'; // 0%
        } else if (percentage <= 25) {
            return '$(chp-token1)'; // 1/8
        } else if (percentage <= 35) {
            return '$(chp-token2)'; // 2/8
        } else if (percentage <= 45) {
            return '$(chp-token3)'; // 3/8
        } else if (percentage <= 55) {
            return '$(chp-token4)'; // 4/8
        } else if (percentage <= 65) {
            return '$(chp-token5)'; // 5/8
        } else if (percentage <= 75) {
            return '$(chp-token6)'; // 6/8
        } else if (percentage <= 85) {
            return '$(chp-token7)'; // 7/8
        } else {
            return '$(chp-token8)'; // 8/8 (Full)
        }
    }

    /**
     * Format token count to readable format (e.g., 2K, 96K)
     */
    private formatTokens(tokens: number): string {
        if (tokens >= 1000000) {
            return (tokens / 1000000).toFixed(1) + 'M';
        } else if (tokens >= 1000) {
            return (tokens / 1000).toFixed(1) + 'K';
        } else {
            return tokens.toString();
        }
    }

    /**
     * Get display text
     */
    protected getDisplayText(data: TokenUsageData): string {
        // const percentage = data.percentage.toFixed(1);
        const icon = this.getPieChartIcon(data.percentage);
        // return data.percentage === 0 ? icon : `${icon} ${percentage}%`;
        return icon;
    }

    /**
     * Generate Tooltip content
     */
    private generateTooltip(data: TokenUsageData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;

        md.appendMarkdown('#### Model Context Window Usage\n\n');

        // If default data (no request), show hint
        if (data.inputTokens === 0 && data.maxInputTokens === 0) {
            md.appendMarkdown('💡 Displayed after sending any request provided by Copilot ++\n');
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

    /**
     * Check and show status
     * Token usage status bar is always shown
     */
    async checkAndShowStatus(): Promise<void> {
        if (this.statusBarItem) {
            this.statusBarItem.show();
        }
    }

    /**
     * Delayed update (not used, Token usage is externally driven)
     */
    delayedUpdate(_delayMs?: number): void {
        // Token usage status bar does not need periodic updates
        // Data is driven externally via updateTokenUsage()
    }

    /**
     * Dispose status bar
     */
    dispose(): void {
        this.statusBarItem?.dispose();
        StatusLogger.debug('[TokenUsageStatusBar] Disposed');
    }
}
