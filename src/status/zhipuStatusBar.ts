/*---------------------------------------------------------------------------------------------
 *  Zhipu AI Usage Status Bar Item
 *  Inherits from ProviderStatusBarItem, displays Zhipu AI Coding Plan usage information
 *  - Only displays TOKENS_LIMIT: 5-hour token usage limit (automatically resets at nextResetTime)
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProviderStatusBarItem, StatusBarItemConfig } from './providerStatusBarItem';
import { StatusLogger } from '../utils/statusLogger';
import { Logger } from '../utils/logger';
import { ConfigManager, ApiKeyManager, VersionManager } from '../utils';

/**
 * Usage Limit Item Data Structure
 */
export interface UsageLimitItem {
    /** Limit type:
     *  - TOKENS_LIMIT: Token usage (every 5 hours cycle, resets at nextResetTime)
     *  - TIME_LIMIT: MCP search usage count
     */
    type: 'TIME_LIMIT' | 'TOKENS_LIMIT';
    /** Time unit (minute, hour, etc.) */
    unit: number;
    /** Number of time periods */
    number: number;
    /** Total quota/limit */
    usage: number;
    /** Currently used */
    currentValue: number;
    /** Remaining quota */
    remaining: number;
    /** Usage percentage */
    percentage: number;
    /** Next reset timestamp (ms, only valid for TOKENS_LIMIT) */
    nextResetTime?: number;
    /** Usage details (divided by model or feature) */
    usageDetails?: Array<{
        modelCode: string;
        usage: number;
    }>;
}

/**
 * Zhipu Status Data
 */
interface ZhipuStatusData {
    /** Usage limit list */
    limits: UsageLimitItem[];
    /** Limit with highest usage rate */
    maxUsageLimit: UsageLimitItem;
}

/**
 * Zhipu AI Coding Plan Status Bar Item
 * - Display format: Remaining available
 * - Unit: Million tokens (M)
 * - Every 5 hours cycle, automatically resets at nextResetTime
 */
export class ZhipuStatusBar extends ProviderStatusBarItem<ZhipuStatusData> {
    constructor() {
        const config: StatusBarItemConfig = {
            id: 'chp.statusBar.zhipu',
            name: 'Copilot ++: GLM Coding Plan',
            alignment: vscode.StatusBarAlignment.Right,
            priority: 99,
            refreshCommand: 'chp.refreshZhipuUsage',
            apiKeyProvider: 'zhipu',
            cacheKeyPrefix: 'zhipu',
            logPrefix: 'ZhipuStatusBar',
            icon: '$(chp-zhipu)'
        };
        super(config);
    }

    /**
     * Get display text
     * Only display TOKENS_LIMIT (5-hour remaining available tokens), in millions
     */
    protected getDisplayText(data: ZhipuStatusData): string {
        const { remaining } = data.maxUsageLimit;
        // Remaining tokens displayed in millions (M)
        const remainingMillions = (remaining / 1000000).toFixed(1);
        return `${this.config.icon} ${remainingMillions}M`;
    }

    /**
     * Generate Tooltip content
     * Display summary table of all limit types
     */
    protected generateTooltip(data: ZhipuStatusData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.appendMarkdown('#### Zhipu AI GLM Coding Plan Usage\n\n');

        // Display summary table: all limit types
        md.appendMarkdown('| Type | Limit | Used | Remaining | \n');
        md.appendMarkdown('| :--- | ---: | ---: | ---: | \n');
        for (const limit of data.limits) {
            let typeLabel = '';
            let usage = '';
            let used = '';
            let remaining = '';

            if (limit.type === 'TOKENS_LIMIT') {
                // 5-hour usage limit
                typeLabel = '5-Hour Limit';
                usage = (limit.usage / 1000000).toFixed(1) + 'M';
                used = (limit.currentValue / 1000000).toFixed(1) + 'M';
                remaining = (limit.remaining / 1000000).toFixed(1) + 'M';
            } else {
                // MCP monthly quota
                typeLabel = 'MCP Monthly Quota';
                usage = String(limit.usage);
                used = String(limit.currentValue);
                remaining = String(limit.remaining);
            }

            md.appendMarkdown(`| ${typeLabel} | ${usage} | ${used} | ${remaining} |\n`);
        }
        md.appendMarkdown('\n');

        // Display reset time information
        const tokensLimit = data.limits.find(l => l.type === 'TOKENS_LIMIT');
        if (tokensLimit?.nextResetTime) {
            const resetDate = new Date(tokensLimit.nextResetTime);
            const resetTime = resetDate.toLocaleString('en-US', { hour12: false });
            md.appendMarkdown(`**Reset Time** ${resetTime}\n\n`);
        }

        md.appendMarkdown('---\n');
        md.appendMarkdown('Click status bar to refresh manually\n');
        return md;
    }

    /**
     * Execute API query
     * Directly implement Zhipu AI usage query logic
     */
    protected async performApiQuery(): Promise<{ success: boolean; data?: ZhipuStatusData; error?: string }> {
        const QUOTA_QUERY_URL = 'https://bigmodel.cn/api/monitor/usage/quota/limit';
        const PROVIDER_KEY = 'zhipu';

        try {
            // Check if API Key exists
            const hasApiKey = await ApiKeyManager.hasValidApiKey(PROVIDER_KEY);
            if (!hasApiKey) {
                return {
                    success: false,
                    error: 'Zhipu AI API key not configured, please set API key first'
                };
            }

            // Get API Key
            const apiKey = await ApiKeyManager.getApiKey(PROVIDER_KEY);
            if (!apiKey) {
                return {
                    success: false,
                    error: 'Unable to retrieve Zhipu AI API key'
                };
            }

            Logger.debug('Triggering Zhipu AI usage query');
            StatusLogger.debug(`[${this.config.logPrefix}] Starting Zhipu AI usage query...`);

            // Get current endpoint
            const endpoint = ConfigManager.getZhipuEndpoint();
            let requestUrl = QUOTA_QUERY_URL;

            // If using international site, adjust URL
            if (endpoint === 'api.z.ai') {
                requestUrl = 'https://api.z.ai/api/monitor/usage/quota/limit';
            }

            // Build request
            const requestOptions: RequestInit = {
                method: 'GET',
                headers: {
                    Authorization: apiKey,
                    'Content-Type': 'application/json',
                    'User-Agent': VersionManager.getUserAgent('Zhipu')
                }
            };

            // Send request
            Logger.debug(`[Zhipu AI] Sending request to: ${requestUrl}`);
            const response = await fetch(requestUrl, requestOptions);
            const responseText = await response.text();
            Logger.debug(`[Zhipu AI] Response status: ${response.status}, Response length: ${responseText.length}`);
            Logger.debug(`[Zhipu AI] Response content: ${responseText.substring(0, 500)}`);

            StatusLogger.debug(
                `[${this.config.logPrefix}] Usage query response status: ${response.status} ${response.statusText}`
            );

            // Parse response
            interface QuotaLimitResponse {
                code: number;
                msg: string;
                data: {
                    limits: Array<{
                        type: 'TIME_LIMIT' | 'TOKENS_LIMIT';
                        unit: number;
                        number: number;
                        usage: number;
                        currentValue: number;
                        remaining: number;
                        percentage: number;
                        nextResetTime?: number;
                        usageDetails?: Array<{
                            modelCode: string;
                            usage: number;
                        }>;
                    }>;
                };
                success: boolean;
            }

            let parsedResponse: QuotaLimitResponse;
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
            if (!response.ok || !parsedResponse.success || parsedResponse.code !== 200) {
                let errorMessage = `HTTP ${response.status}`;
                if (parsedResponse.msg) {
                    errorMessage = parsedResponse.msg;
                }
                Logger.error(`Usage query failed: ${errorMessage}`);
                return {
                    success: false,
                    error: `Query failed: ${errorMessage}`
                };
            }

            // Parse successful response
            StatusLogger.debug(`[${this.config.logPrefix}] Usage query successful`);

            const limits = parsedResponse.data?.limits;
            if (!limits || !Array.isArray(limits) || limits.length === 0) {
                return {
                    success: false,
                    error: 'No usage limit data obtained'
                };
            }

            // Get TOKENS_LIMIT (5-hour token usage)
            const maxUsageLimit = limits.find((limit: UsageLimitItem) => limit.type === 'TOKENS_LIMIT');
            if (!maxUsageLimit) {
                return {
                    success: false,
                    error: 'TOKENS_LIMIT data not obtained'
                };
            }

            return {
                success: true,
                data: {
                    limits,
                    maxUsageLimit
                }
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            Logger.error(`Usage query exception: ${errorMessage}`);
            return {
                success: false,
                error: `Query exception: ${errorMessage}`
            };
        }
    }

    /**
     * Check if warning highlight is needed
     * Highlight when usage rate is above threshold
     */
    protected shouldHighlightWarning(data: ZhipuStatusData): boolean {
        return data.maxUsageLimit.percentage >= this.HIGH_USAGE_THRESHOLD;
    }

    /**
     * Check if cache needs to be refreshed
     * TOKENS_LIMIT: Determine based on nextResetTime
     * TIME_LIMIT: Use fixed 5-minute cache expiration time
     */
    protected shouldRefresh(): boolean {
        if (!this.lastStatusData) {
            return false;
        }

        const dataAge = Date.now() - this.lastStatusData.timestamp;
        const CACHE_EXPIRY_THRESHOLD = (5 * 60 - 10) * 1000; // Cache expiry threshold 5 minutes

        // 1. Check if TOKENS_LIMIT needs to trigger refresh based on nextResetTime
        const tokensLimit = this.lastStatusData.data.limits.find(l => l.type === 'TOKENS_LIMIT');
        if (tokensLimit?.nextResetTime) {
            const resetTime = tokensLimit.nextResetTime;
            const timeUntilReset = resetTime - Date.now();

            if (timeUntilReset > 0 && dataAge > timeUntilReset) {
                StatusLogger.debug(
                    `[${this.config.logPrefix}] Cache time (${(dataAge / 1000).toFixed(1)} seconds) exceeds token reset time difference (${(timeUntilReset / 1000).toFixed(1)} seconds), triggering API refresh`
                );
                return true;
            }
        }

        // 2. Check if cache exceeds 5-minute fixed expiration time
        if (dataAge > CACHE_EXPIRY_THRESHOLD) {
            StatusLogger.debug(
                `[${this.config.logPrefix}] Cache time (${(dataAge / 1000).toFixed(1)} seconds) exceeds 5-minute fixed expiration time, triggering API refresh`
            );
            return true;
        }

        return false;
    }

    /**
     * Accessor: Get the last status data (for testing and debugging)
     */
    getLastStatusData(): { data: ZhipuStatusData; timestamp: number } | null {
        return this.lastStatusData;
    }
}
