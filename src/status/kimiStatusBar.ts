/*---------------------------------------------------------------------------------------------
 *  Kimi For Coding Status Bar Item
 *  Inherits ProviderStatusBarItem, displays Kimi For Coding usage information
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProviderStatusBarItem, StatusBarItemConfig } from './providerStatusBarItem';
import { StatusLogger } from '../utils/statusLogger';
import { Logger } from '../utils/logger';
import { ApiKeyManager } from '../utils/apiKeyManager';
import { VersionManager } from '../utils/versionManager';

/**
 * Kimi usage window data
 */
export interface KimiUsageWindow {
    /** Duration */
    duration: number;
    /** Time unit */
    timeUnit: string;
    /** Detailed information */
    detail: {
        /** Limit count */
        limit: number;
        /** Used count */
        used: number;
        /** Remaining count */
        remaining: number;
    };
}

/**
 * Kimi usage summary data
 */
export interface KimiUsageSummary {
    /** Total limit count */
    limit: number;
    /** Used count */
    used: number;
    /** Remaining count */
    remaining: number;
    /** Usage percentage */
    usage_percentage: number;
    /** Reset time */
    resetTime: string;
}

/**
 * Kimi status data
 */
export interface KimiStatusData {
    /** Overall usage information */
    summary: KimiUsageSummary;
    /** Detailed usage limits */
    windows: KimiUsageWindow[];
}

/**
 * Kimi For Coding status bar item
 * Displays Kimi For Coding usage information, including:
 * - Remaining/Total
 * - Used percentage
 * - Supports multi-time window display
 */
export class KimiStatusBar extends ProviderStatusBarItem<KimiStatusData> {
    constructor() {
        const config: StatusBarItemConfig = {
            id: 'chp.statusBar.kimi',
            name: 'Copilot ++: Kimi For Coding',
            alignment: vscode.StatusBarAlignment.Right,
            priority: 90,
            refreshCommand: 'chp.kimi.refreshUsage',
            apiKeyProvider: 'kimi',
            cacheKeyPrefix: 'kimi',
            logPrefix: 'Kimi Status Bar',
            icon: '$(chp-kimi)'
        };
        super(config);
    }

    /**
     * Get display text
     */
    protected getDisplayText(data: KimiStatusData): string {
        const remaining = data.summary.remaining;
        let displayText = `${this.config.icon} ${remaining}`;

        // If there is window data, add remaining count for each window
        if (data.windows.length > 0) {
            const windowTexts = data.windows.map(window => {
                // const timeUnit = this.translateTimeUnit(window.timeUnit);
                // return `${window.duration}${timeUnit}: ${window.detail.remaining}`;
                return `${window.detail.remaining}`;
            });
            displayText += ` (${windowTexts.join(',')})`;
        }

        return displayText;
    }

    /**
     * Generate Tooltip content
     */
    protected generateTooltip(data: KimiStatusData): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;

        const { summary } = data;
        md.appendMarkdown('#### Kimi For Coding Usage\n\n');
        md.appendMarkdown('| Package Limit | Quota Limit | Remaining Quota |\n');
        md.appendMarkdown('| :----: | ----: | ----: |\n');
        md.appendMarkdown(`| **Weekly Quota** | ${summary.limit} | ${summary.remaining} |\n`);

        if (data.windows.length > 0) {
            for (const window of data.windows) {
                const timeUnit = this.translateTimeUnit(window.timeUnit);
                const { detail, duration } = window;
                md.appendMarkdown(`| **${duration} ${timeUnit}** | ${detail.limit} | ${detail.remaining} |\n`);
            }
        }

        md.appendMarkdown('\n');
        if (summary.resetTime) {
            md.appendMarkdown('---\n');
            const resetTime = new Date(summary.resetTime);
            const resetTimeStr = resetTime.toLocaleString('zh-CN');
            md.appendMarkdown(`**Weekly Reset** ${resetTimeStr}\n`);
            md.appendMarkdown('\n');
        }

        md.appendMarkdown('---\n');
        md.appendMarkdown('Click status bar to manually refresh\n');
        return md;
    }

    /**
     * Execute API query
     * Directly implement Kimi For Coding remaining query logic
     */
    protected async performApiQuery(): Promise<{ success: boolean; data?: KimiStatusData; error?: string }> {
        const REMAIN_QUERY_URL = 'https://api.kimi.com/coding/v1/usages';
        const KIMI_KEY = 'kimi';

        try {
            // Check if Kimi For Coding key exists
            const hasCodingKey = await ApiKeyManager.hasValidApiKey(KIMI_KEY);
            if (!hasCodingKey) {
                return {
                    success: false,
                    error: 'Kimi For Coding dedicated key not configured, please set Kimi For Coding API key first'
                };
            }

            // Get Kimi For Coding key
            const apiKey = await ApiKeyManager.getApiKey(KIMI_KEY);
            if (!apiKey) {
                return {
                    success: false,
                    error: 'Unable to get Kimi For Coding dedicated key'
                };
            }

            Logger.debug('Trigger query Kimi For Coding remaining');
            StatusLogger.debug(`[${this.config.logPrefix}] Starting Kimi For Coding remaining query...`);

            // Build request
            const requestOptions: RequestInit = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': VersionManager.getUserAgent('Kimi'),
                    Authorization: `Bearer ${apiKey}`
                }
            };

            // Send request
            const response = await fetch(REMAIN_QUERY_URL, requestOptions);
            const responseText = await response.text();

            StatusLogger.debug(
                `[${this.config.logPrefix}] Remaining query response status: ${response.status} ${response.statusText}`
            );

            // Parse response
            interface KimiBillingResponse {
                user?: {
                    userId: string;
                    region: string;
                    membership: {
                        level: string;
                    };
                };
                usage?: {
                    limit: number;
                    used?: number;
                    remaining?: number;
                    resetTime: string;
                };
                limits?: {
                    window: {
                        duration: number;
                        timeUnit: string;
                    };
                    detail: {
                        limit: number;
                        used?: number;
                        remaining?: number;
                    };
                }[];
                code?: string;
                details?: {
                    type: string;
                    value: string;
                    debug?: {
                        reason: string;
                        localizedMessage?: {
                            locale: string;
                            message: string;
                        };
                    };
                }[];
            }

            let parsedResponse: KimiBillingResponse;
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
                const errorMessage = `HTTP ${response.status}`;
                Logger.error(`Remaining query failed: ${errorMessage}`);
                return {
                    success: false,
                    error: `Query failed: ${errorMessage}`
                };
            }

            // Check specific authentication error
            if (parsedResponse.code === 'unauthenticated') {
                const errorMessage = 'API key invalid or expired, please check your Kimi API key';
                Logger.error(`Authentication failed: ${errorMessage}`);
                return {
                    success: false,
                    error: `Authentication failed: ${errorMessage}`
                };
            }

            // Check other API errors
            if (parsedResponse.code !== undefined && parsedResponse.code !== 'unauthenticated') {
                const errorMessage = `API error: ${parsedResponse.code}`;
                Logger.error(`Remaining query API failed: ${errorMessage}`);
                return {
                    success: false,
                    error: `API query failed: ${errorMessage}`
                };
            }

            // Parse successful response
            StatusLogger.debug(`[${this.config.logPrefix}] Remaining query successful`);

            // Calculate formatted information
            if (!parsedResponse.usage) {
                return {
                    success: false,
                    error: 'No usage data obtained'
                };
            }

            const usage = parsedResponse.usage;

            // Calculate usage percentage
            const used = typeof usage.used === 'string' ? parseInt(usage.used, 10) : (usage.used ?? 0);
            const limit = typeof usage.limit === 'string' ? parseInt(usage.limit, 10) : usage.limit;
            const remaining =
                typeof usage.remaining === 'string' ? parseInt(usage.remaining, 10) : (usage.remaining ?? 0);
            const percentage = limit > 0 ? parseFloat(((used / limit) * 100).toFixed(1)) : 0;

            // Overall usage information
            const summary: KimiUsageSummary = {
                limit,
                used,
                remaining,
                usage_percentage: percentage,
                resetTime: usage.resetTime
            };

            // Detailed usage limits
            const windows: KimiUsageWindow[] = [];
            if (parsedResponse.limits && parsedResponse.limits.length > 0) {
                for (const limitItem of parsedResponse.limits) {
                    const detail = limitItem.detail;
                    const detailUsed = typeof detail.used === 'string' ? parseInt(detail.used, 10) : (detail.used ?? 0);
                    const detailLimit = typeof detail.limit === 'string' ? parseInt(detail.limit, 10) : detail.limit;
                    const detailRemaining =
                        typeof detail.remaining === 'string' ? parseInt(detail.remaining, 10) : (detail.remaining ?? 0);

                    windows.push({
                        duration: limitItem.window.duration,
                        timeUnit: limitItem.window.timeUnit,
                        detail: {
                            limit: detailLimit,
                            used: detailUsed,
                            remaining: detailRemaining
                        }
                    });
                }
            }

            return {
                success: true,
                data: {
                    summary,
                    windows
                }
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            Logger.error(`Remaining query exception: ${errorMessage}`);
            return {
                success: false,
                error: `Query exception: ${errorMessage}`
            };
        }
    }

    /**
     * Check if highlight warning is needed (used percentage above threshold or any window used above threshold)
     */
    protected shouldHighlightWarning(data: KimiStatusData): boolean {
        const { summary, windows } = data;

        // Check if overall percentage is above threshold
        if (summary.usage_percentage >= this.HIGH_USAGE_THRESHOLD) {
            return true;
        }

        // Check if any window used is above threshold
        if (windows.length > 0) {
            for (const window of windows) {
                const windowPercentage = window.detail.limit > 0 ? (window.detail.used / window.detail.limit) * 100 : 0;
                if (windowPercentage >= this.HIGH_USAGE_THRESHOLD) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if cache needs to be refreshed
     * Refresh if cache exceeds 5-minute fixed expiration time
     */
    protected shouldRefresh(): boolean {
        if (!this.lastStatusData) {
            return false;
        }

        const dataAge = Date.now() - this.lastStatusData.timestamp;
        const CACHE_EXPIRY_THRESHOLD = (5 * 60 - 10) * 1000; // Cache expiry threshold 5 minutes

        // Check if cache exceeds 5-minute fixed expiration time
        if (dataAge > CACHE_EXPIRY_THRESHOLD) {
            StatusLogger.debug(
                `[${this.config.logPrefix}] Cache time (${(dataAge / 1000).toFixed(1)} seconds) exceeds 5-minute fixed expiration time, triggering API refresh`
            );
            return true;
        }

        return false;
    }

    /**
     * Convert time unit to English
     */
    private translateTimeUnit(timeUnit: string): string {
        const unitMap: Record<string, string> = {
            TIME_UNIT_SECOND: 'second',
            TIME_UNIT_MINUTE: 'minute',
            TIME_UNIT_HOUR: 'hour',
            TIME_UNIT_DAY: 'day',
            TIME_UNIT_MONTH: 'month',
            TIME_UNIT_YEAR: 'year'
        };
        return unitMap[timeUnit] || timeUnit;
    }

    /**
     * Accessor: Get the last status data (for testing and debugging)
     */
    getLastStatusData(): { data: KimiStatusData; timestamp: number } | null {
        return this.lastStatusData;
    }
}
