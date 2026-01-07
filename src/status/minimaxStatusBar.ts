/*---------------------------------------------------------------------------------------------
 *  MiniMax Coding Plan Status Bar Item
 *  Inherits from ProviderStatusBarItem, displays MiniMax Coding Plan usage information
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProviderStatusBarItem, StatusBarItemConfig } from './providerStatusBarItem';
import { StatusLogger } from '../utils/statusLogger';
import { Logger } from '../utils/logger';
import { ConfigManager, ApiKeyManager, VersionManager } from '../utils';

/**
 * Model remaining item data structure
 */
export interface ModelRemainItem {
    /** Model ID */
    model: string;
    /** Statistical time period */
    range: string;
    /** Reset remaining time (ms) */
    remainMs: number;
    /** Used (percentage) */
    percentage: number;
    /** Usage status */
    usageStatus: string;
    /** Available count */
    usage: number;
    /** Quota count */
    total: number;
}

/**
 * MiniMax Status Data
 */
interface MiniMaxStatusData {
    /** Model usage list */
    formatted: ModelRemainItem[];
    /** Model with highest usage */
    maxUsageModel: ModelRemainItem;
}

/**
 * MiniMax Coding Plan Status Bar Item
 * Displays MiniMax Coding Plan usage information, including:
 * - Available/Total
 * - Used percentage
 * - Supports multi-model display
 */
export class MiniMaxStatusBar extends ProviderStatusBarItem<MiniMaxStatusData> {
    constructor() {
        const config: StatusBarItemConfig = {
            id: 'chp.statusBar.minimax',
            name: 'Copilot ++: MiniMax Coding Plan',
            alignment: vscode.StatusBarAlignment.Right,
            priority: 100,
            refreshCommand: 'chp.refreshMiniMaxUsage',
            apiKeyProvider: 'minimax-coding',
            cacheKeyPrefix: 'minimax',
            logPrefix: 'MiniMaxStatusBar',
            icon: '$(chp-minimax)'
        };
        super(config);
    }

    /**
     * Get display text
     */
    protected getDisplayText(data: MiniMaxStatusData): string {
        const { usage, percentage } = data.maxUsageModel;
        return `${this.config.icon} ${usage} (${percentage}%)`;
    }

    /**
     * Generate Tooltip content
     */
    protected generateTooltip(data: MiniMaxStatusData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.appendMarkdown('#### MiniMax Coding Plan Usage\n\n');
        md.appendMarkdown('| Model | Limit | Remaining | Usage Rate |\n');
        md.appendMarkdown('| :--- | ----: | ----: | ---: |\n');
        for (const info of data.formatted) {
            md.appendMarkdown(`| ${info.model} | ${info.total} | ${info.usage} | ${info.percentage}% |\n`);
        }
        md.appendMarkdown('\n');
        if (data.maxUsageModel) {
            md.appendMarkdown('---\n');
            md.appendMarkdown(`**Billing Cycle** ${data.maxUsageModel.range}\n`);
            md.appendMarkdown('\n');
        }
        md.appendMarkdown('---\n');
        md.appendMarkdown('Click status bar to refresh manually\n');
        return md;
    }

    /**
     * Execute API query
     * Directly implement MiniMax Coding Plan balance query logic
     */
    protected async performApiQuery(): Promise<{ success: boolean; data?: MiniMaxStatusData; error?: string }> {
        const REMAIN_QUERY_URL = 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains';
        const CODING_PLAN_KEY = 'minimax-coding';

        try {
            // Check if Coding Plan key exists
            const hasCodingKey = await ApiKeyManager.hasValidApiKey(CODING_PLAN_KEY);
            if (!hasCodingKey) {
                return {
                    success: false,
                    error: 'Coding Plan dedicated key not configured, please set Coding Plan API key first'
                };
            }

            // Get Coding Plan key
            const apiKey = await ApiKeyManager.getApiKey(CODING_PLAN_KEY);
            if (!apiKey) {
                return {
                    success: false,
                    error: 'Unable to retrieve Coding Plan dedicated key'
                };
            }

            Logger.debug('Triggering MiniMax Coding Plan balance query');
            StatusLogger.debug(`[${this.config.logPrefix}] Starting MiniMax Coding Plan balance query...`);

            // Build request
            const requestOptions: RequestInit = {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': VersionManager.getUserAgent('MiniMax')
                }
            };

            let requestUrl = REMAIN_QUERY_URL;
            if (ConfigManager.getMinimaxEndpoint() === 'minimax.io') {
                requestUrl = requestUrl.replace('.minimaxi.com', '.minimax.io');
            }
            // Send request
            const response = await fetch(requestUrl, requestOptions);
            const responseText = await response.text();

            StatusLogger.debug(
                `[${this.config.logPrefix}] Balance query response status: ${response.status} ${response.statusText}`
            );

            // Parse response
            interface ModelRemainInfo {
                start_time: number;
                end_time: number;
                remains_time: number;
                current_interval_total_count: number;
                current_interval_usage_count: number;
                model_name: string;
            }

            interface CodingPlanRemainResponse {
                model_remains: ModelRemainInfo[];
                base_resp: {
                    status_code: number;
                    status_msg: string;
                };
            }

            let parsedResponse: CodingPlanRemainResponse;
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
                if (parsedResponse.base_resp?.status_msg) {
                    errorMessage = parsedResponse.base_resp.status_msg;
                }
                Logger.error(`Balance query failed: ${errorMessage}`);
                return {
                    success: false,
                    error: `Query failed: ${errorMessage}`
                };
            }

            // Check business response status
            if (parsedResponse.base_resp && parsedResponse.base_resp.status_code !== 0) {
                const errorMessage = parsedResponse.base_resp.status_msg || 'Unknown business error';
                Logger.error(`Balance query business failure: ${errorMessage}`);
                return {
                    success: false,
                    error: `Business query failed: ${errorMessage}`
                };
            }

            // Parse successful response
            StatusLogger.debug(`[${this.config.logPrefix}] Balance query successful`);

            // Calculate formatted information
            const modelRemains = parsedResponse.model_remains;
            if (!modelRemains || modelRemains.length === 0) {
                return {
                    success: false,
                    error: 'No model balance data obtained'
                };
            }

            const formatted: ModelRemainItem[] = modelRemains.map(modelRemain => {
                const {
                    start_time,
                    end_time,
                    remains_time,
                    current_interval_usage_count,
                    current_interval_total_count,
                    model_name
                } = modelRemain;

                // 1. Statistical time period
                let range = '';
                if (start_time && end_time) {
                    const startTime = new Date(start_time);
                    const endTime = new Date(end_time);
                    const startFormatted = startTime.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                    const endFormatted = endTime.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                    range = `${startFormatted}-${endFormatted} (UTC+8)`;
                }

                // 2. Usage information
                let usageStatus = '';
                let percentage = 0;
                if (current_interval_total_count && current_interval_usage_count !== undefined) {
                    // current_interval_usage_count is remaining available quantity, current_interval_total_count is total available quantity
                    const usedQuantity = current_interval_total_count - current_interval_usage_count; // Calculate used quantity
                    percentage = parseFloat(((usedQuantity / current_interval_total_count) * 100).toFixed(1));
                    usageStatus = `${current_interval_usage_count}/${current_interval_total_count}`;
                }

                return {
                    model: model_name,
                    range,
                    remainMs: remains_time,
                    percentage,
                    usageStatus,
                    usage: current_interval_usage_count || 0,
                    total: current_interval_total_count || 0
                };
            });

            // Find the model with the highest usage
            const maxUsageModel = formatted.reduce((max: ModelRemainItem, current: ModelRemainItem) =>
                current.percentage > max.percentage ? current : max
            );

            return {
                success: true,
                data: {
                    formatted,
                    maxUsageModel
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
     * Highlight when usage rate is above threshold
     */
    protected shouldHighlightWarning(data: MiniMaxStatusData): boolean {
        return data.maxUsageModel.percentage >= this.HIGH_USAGE_THRESHOLD;
    }

    /**
     * Check if cache needs to be refreshed
     * Determine if refresh is needed based on remainMs (reset remaining time)
     * And fixed 5-minute cache expiration time
     */
    protected shouldRefresh(): boolean {
        if (!this.lastStatusData) {
            return false;
        }

        const dataAge = Date.now() - this.lastStatusData.timestamp;
        const CACHE_EXPIRY_THRESHOLD = (5 * 60 - 10) * 1000; // Cache expiry threshold 5 minutes

        // 1. Check if refresh needs to be triggered based on remainMs
        if (this.lastStatusData.data.formatted && this.lastStatusData.data.formatted.length > 0) {
            const minRemainMs = Math.min(...this.lastStatusData.data.formatted.map(m => m.remainMs || 0));

            if (minRemainMs > 0 && dataAge > minRemainMs) {
                StatusLogger.debug(
                    `[${this.config.logPrefix}] Cache time (${(dataAge / 1000).toFixed(1)} seconds) exceeds shortest reset time (${(minRemainMs / 1000).toFixed(1)} seconds), triggering API refresh`
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
    getLastStatusData(): { data: MiniMaxStatusData; timestamp: number } | null {
        return this.lastStatusData;
    }
}
