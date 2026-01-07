/*---------------------------------------------------------------------------------------------
 *  DeepSeek Balance Query Status Bar Item
 *  Inherits ProviderStatusBarItem, displays DeepSeek balance information
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProviderStatusBarItem, StatusBarItemConfig } from './providerStatusBarItem';
import { StatusLogger } from '../utils/statusLogger';
import { Logger } from '../utils/logger';
import { ApiKeyManager } from '../utils/apiKeyManager';
import { VersionManager } from '../utils/versionManager';

/**
 * DeepSeek balance information data structure
 */
export interface DeepSeekBalanceInfo {
    /** Currency code */
    currency: string;
    /** Total balance */
    total_balance: string;
    /** Granted balance */
    granted_balance: string;
    /** Topped up balance */
    topped_up_balance: string;
}

/**
 * DeepSeek balance data structure (API response format)
 */
export interface DeepSeekBalanceResponse {
    /** Whether available */
    is_available: boolean;
    /** Balance information array */
    balance_infos: DeepSeekBalanceInfo[];
}

/**
 * DeepSeek status data
 */
export interface DeepSeekStatusData {
    /** Primary balance information (for status bar display) */
    primaryBalance: DeepSeekBalanceInfo;
    /** All balance information (for tooltip display) */
    allBalances: DeepSeekBalanceInfo[];
    /** Last updated time */
    lastUpdated: string;
}

/**
 * DeepSeek balance query status bar item
 * Displays DeepSeek balance information, including:
 * - Available balance (status bar display)
 * - Used amount (tooltip display)
 * - Top-up total (tooltip display)
 * - Auto refresh every 5 minutes
 */
export class DeepSeekStatusBar extends ProviderStatusBarItem<DeepSeekStatusData> {
    constructor() {
        const config: StatusBarItemConfig = {
            id: 'chp.statusBar.deepseek',
            name: 'Copilot ++: DeepSeek Balance',
            alignment: vscode.StatusBarAlignment.Right,
            priority: 80,
            refreshCommand: 'chp.deepseek.refreshBalance',
            apiKeyProvider: 'deepseek',
            cacheKeyPrefix: 'deepseek',
            logPrefix: 'DeepSeek Status Bar',
            icon: '$(chp-deepseek)'
        };
        super(config);
    }

    /**
     * Return currency symbol based on currency code
     * Supports: CNY (¥) and USD ($)
     */
    private getCurrencySymbol(currency?: string): string {
        if (currency === 'USD') {
            return '$';
        }
        return '¥'; // Default to RMB symbol
    }

    /**
     * Get display text (display primary balance)
     */
    protected getDisplayText(data: DeepSeekStatusData): string {
        const currencySymbol = this.getCurrencySymbol(data.primaryBalance.currency);
        const balance = parseFloat(data.primaryBalance.total_balance);
        const balanceText = balance.toFixed(2);
        return `${this.config.icon} ${currencySymbol}${balanceText}`;
    }

    /**
     * Generate Tooltip content (display all balance information)
     */
    protected generateTooltip(data: DeepSeekStatusData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;

        md.appendMarkdown('#### DeepSeek User Balance Details\n\n');

        md.appendMarkdown('| Currency | Recharge Balance | Gift Balance | Available Balance |\n');
        md.appendMarkdown('| :---: | ---: | ---: | ---: |\n');
        for (const balanceInfo of data.allBalances) {
            md.appendMarkdown(
                `| **${balanceInfo.currency}** | ${balanceInfo.topped_up_balance} | ${balanceInfo.granted_balance} | **${balanceInfo.total_balance}** |\n`
            );
        }

        md.appendMarkdown('---\n');
        md.appendMarkdown(`**Last Updated** ${data.lastUpdated}\n`);
        md.appendMarkdown('\n');
        md.appendMarkdown('---\n');
        md.appendMarkdown('Click status bar to manually refresh\n');
        return md;
    }

    /**
     * Execute API query
     * Implement DeepSeek balance query logic
     */
    protected async performApiQuery(): Promise<{ success: boolean; data?: DeepSeekStatusData; error?: string }> {
        const BALANCE_QUERY_URL = 'https://api.deepseek.com/v1/user/balance';
        const DEEPSEEK_KEY = 'deepseek';

        try {
            // Check if DeepSeek key exists
            const hasApiKey = await ApiKeyManager.hasValidApiKey(DEEPSEEK_KEY);
            if (!hasApiKey) {
                return {
                    success: false,
                    error: 'DeepSeek API key not configured, please set DeepSeek API key first'
                };
            }

            // Get DeepSeek key
            const apiKey = await ApiKeyManager.getApiKey(DEEPSEEK_KEY);
            if (!apiKey) {
                return {
                    success: false,
                    error: 'Unable to get DeepSeek API key'
                };
            }

            Logger.debug('Trigger query DeepSeek balance');
            StatusLogger.debug(`[${this.config.logPrefix}] Starting DeepSeek balance query...`);

            // Build request
            const requestOptions: RequestInit = {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': VersionManager.getUserAgent('DeepSeek')
                }
            };

            // Send request
            const response = await fetch(BALANCE_QUERY_URL, requestOptions);
            const responseText = await response.text();

            StatusLogger.debug(
                `[${this.config.logPrefix}] Balance query response status: ${response.status} ${response.statusText}`
            );

            // Parse response
            let parsedResponse: DeepSeekBalanceResponse;
            try {
                parsedResponse = JSON.parse(responseText);
            } catch (parseError) {
                Logger.error(`Failed to parse response JSON: ${parseError}`);
                return {
                    success: false,
                    error: `Response format error: ${responseText.substring(0, 200)}`
                };
            }

            // Check response status
            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}`;
                if (responseText) {
                    try {
                        const errorData = JSON.parse(responseText);
                        if (errorData.error) {
                            errorMessage = errorData.error.message || errorData.error;
                        }
                    } catch {
                        // If parsing error response fails, use default error message
                    }
                }
                Logger.error(`Balance query failed: ${errorMessage}`);
                return {
                    success: false,
                    error: `Query failed: ${errorMessage}`
                };
            }

            // Check if contains valid balance data
            if (
                !parsedResponse.balance_infos ||
                !Array.isArray(parsedResponse.balance_infos) ||
                parsedResponse.balance_infos.length === 0
            ) {
                Logger.error('No balance data obtained');
                return {
                    success: false,
                    error: 'No balance data obtained'
                };
            }

            // Format last updated time
            const lastUpdated = new Date().toLocaleString('zh-CN');

            // Select primary balance (prefer CNY, then USD, finally first)
            let primaryBalance = parsedResponse.balance_infos.find(b => b.currency === 'CNY');
            if (!primaryBalance) {
                primaryBalance =
                    parsedResponse.balance_infos.find(b => b.currency === 'USD') || parsedResponse.balance_infos[0];
            }

            // Parse successful response
            StatusLogger.debug(`[${this.config.logPrefix}] Balance query successful`);

            return {
                success: true,
                data: {
                    primaryBalance,
                    allBalances: parsedResponse.balance_infos,
                    lastUpdated
                }
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            Logger.error(`Balance query exception: ${errorMessage}`);
            return {
                success: false,
                error: `Query exception: ${errorMessage}`
            };
        }
    }

    /**
     * Check if warning highlight is needed
     * Highlight when primary balance is below threshold
     */
    protected shouldHighlightWarning(_data: DeepSeekStatusData): boolean {
        return false; // DeepSeek does not set balance warning
    }

    /**
     * Check if cache needs to be refreshed
     * Fixed refresh every 5 minutes
     */
    protected shouldRefresh(): boolean {
        if (!this.lastStatusData) {
            return false;
        }

        const dataAge = Date.now() - this.lastStatusData.timestamp;
        const REFRESH_INTERVAL = (5 * 60 - 10) * 1000; // Cache expiration threshold 5 minutes

        // Check if exceeds 5-minute refresh interval
        if (dataAge > REFRESH_INTERVAL) {
            StatusLogger.debug(
                `[${this.config.logPrefix}] Cache time (${(dataAge / 1000).toFixed(1)}s) exceeds 5-minute refresh interval, trigger API refresh`
            );
            return true;
        }

        return false;
    }

    /**
     * Accessor: Get last status data (for testing and debugging)
     */
    getLastStatusData(): { data: DeepSeekStatusData; timestamp: number } | null {
        return this.lastStatusData;
    }
}
