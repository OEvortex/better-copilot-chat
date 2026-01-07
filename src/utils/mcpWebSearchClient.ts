/*---------------------------------------------------------------------------------------------
 *  Standard WebSearch Client based on MCP SDK
 *  Uses official @modelcontextprotocol/sdk to replace custom SSE implementation
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Logger } from './logger';
import { ConfigManager } from './configManager';
import { ApiKeyManager } from './apiKeyManager';
import { VersionManager } from './versionManager';
import { ZhipuSearchResult } from '../tools/zhipuSearch';

/**
 * Search request parameters
 */
export interface WebSearchRequest {
    search_query: string;
    search_engine?: 'search_std' | 'search_pro' | 'search_pro_sogou' | 'search_pro_quark';
    search_intent?: boolean;
    count?: number;
    search_domain_filter?: string;
    search_recency_filter?: 'noLimit' | 'day' | 'week' | 'month' | 'year';
    content_size?: 'low' | 'medium' | 'high';
}

/**
 * MCP WebSearch Client - uses standard MCP SDK
 */
export class MCPWebSearchClient {
    // Static cache: cache client instances based on API key
    private static clientCache = new Map<string, MCPWebSearchClient>();

    private client: Client | null = null;
    private transport: StreamableHTTPClientTransport | null = null;
    private readonly userAgent: string;
    private currentApiKey: string | null = null;
    private isConnecting = false;
    private connectionPromise: Promise<void> | null = null;

    private constructor() {
        this.userAgent = VersionManager.getUserAgent('MCPWebSearch');
    }

    /**
     * Get or create client instance (singleton mode, based on API key)
     */
    static async getInstance(apiKey?: string): Promise<MCPWebSearchClient> {
        const key = apiKey || (await ApiKeyManager.getApiKey('zhipu'));
        if (!key) {
            throw new Error('ZhipuAI API key not set');
        }

        // Check if a client for this API key exists in cache
        let instance = MCPWebSearchClient.clientCache.get(key);

        if (!instance) {
            Logger.debug(`📦 [MCP WebSearch] Creating new client instance (API key: ${key.substring(0, 8)}...)`);
            instance = new MCPWebSearchClient();
            instance.currentApiKey = key;
            MCPWebSearchClient.clientCache.set(key, instance);
        } else {
            Logger.debug(`♻️ [MCP WebSearch] Reusing cached client instance (API key: ${key.substring(0, 8)}...)`);
        }

        // Ensure client is initialized and connected
        await instance.ensureConnected();

        return instance;
    }

    /**
     * Clear cache for specified API key
     */
    static async clearCache(apiKey?: string): Promise<void> {
        if (apiKey) {
            const instance = MCPWebSearchClient.clientCache.get(apiKey);
            if (instance) {
                await instance.cleanup();
                MCPWebSearchClient.clientCache.delete(apiKey);
                Logger.info(`🗑️ [MCP WebSearch] Cleared cache for API key ${apiKey.substring(0, 8)}...`);
            }
        } else {
            // Clear all caches
            for (const [key, instance] of MCPWebSearchClient.clientCache.entries()) {
                await instance.cleanup();
                Logger.info(`🗑️ [MCP WebSearch] Cleared cache for API key ${key.substring(0, 8)}...`);
            }
            MCPWebSearchClient.clientCache.clear();
            Logger.info('🗑️ [MCP WebSearch] Cleared all client caches');
        }
    }

    /**
     * Get cache statistics
     */
    static getCacheStats(): { totalClients: number; connectedClients: number; apiKeys: string[] } {
        const stats = {
            totalClients: MCPWebSearchClient.clientCache.size,
            connectedClients: 0,
            apiKeys: [] as string[]
        };

        for (const [key, instance] of MCPWebSearchClient.clientCache.entries()) {
            if (instance.isConnected()) {
                stats.connectedClients++;
            }
            stats.apiKeys.push(key.substring(0, 8) + '...');
        }

        return stats;
    }

    /**
     * Process error response
     */
    private async handleErrorResponse(error: Error): Promise<void> {
        const errorMessage = error.message;

        // Check if it is a 403 permission error
        if (errorMessage.includes('403') || errorMessage.includes('You do not have access')) {
            // Special handling for MCP 403 permission error
            if (errorMessage.includes('search-prime') || errorMessage.includes('web_search_prime')) {
                Logger.warn(`⚠️ [MCP WebSearch] Detected insufficient MCP permissions for web search: ${errorMessage}`);

                // Pop up user dialog asking whether to deactivate MCP mode
                const shouldDisableMCP = await this.showMCPDisableDialog();

                if (shouldDisableMCP) {
                    // User chooses to deactivate MCP mode, update configuration
                    await this.disableMCPMode();
                    throw new Error('Insufficient ZhipuAI search permissions: MCP mode disabled, please try searching again.');
                } else {
                    throw new Error(
                        'Insufficient ZhipuAI search permissions: Your account does not have access to web search MCP features. Please check your ZhipuAI subscription status.'
                    );
                }
            } else {
                throw new Error('Insufficient ZhipuAI search permissions: 403 error. Please check your API key permissions or subscription status.');
            }
        } else if (errorMessage.includes('MCP error')) {
            // Extract MCP error message
            const mcpErrorMatch = errorMessage.match(/MCP error (\d+): (.+)/);
            if (mcpErrorMatch) {
                const [, errorCode, errorDesc] = mcpErrorMatch;
                throw new Error(`ZhipuAI MCP protocol error ${errorCode}: ${errorDesc}`);
            }
        }

        // Other errors thrown directly
        throw error;
    }

    /**
     * Show MCP disable dialog
     */
    private async showMCPDisableDialog(): Promise<boolean> {
        const message =
            'Detected that your ZhipuAI account does not have access to web search MCP features. This could be because:\n\n' +
            '1. Your account does not support MCP features (requires Coding Plan subscription)\n' +
            '2. Insufficient API key permissions\n\n' +
            'Switch to standard billing mode (pay-per-use)?';

        const result = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Switch to Standard Mode',
            'Keep MCP Mode'
        );

        return result === 'Switch to Standard Mode';
    }

    /**
     * Disable MCP mode
     */
    private async disableMCPMode(): Promise<void> {
        try {
            // Update configuration: disable MCP mode
            const config = vscode.workspace.getConfiguration('chp.zhipu.search');
            await config.update('enableMCP', false, vscode.ConfigurationTarget.Global);

            Logger.info('✅ [MCP WebSearch] MCP mode disabled, switched to standard billing mode');

            // Show notification
            vscode.window.showInformationMessage(
                'ZhipuAI search has switched to standard billing mode (pay-per-use). You can re-enable MCP mode in settings.'
            );

            // Clean up current client
            await this.internalCleanup();
        } catch (error) {
            Logger.error('❌ [MCP WebSearch] Failed to disable MCP mode', error instanceof Error ? error : undefined);
            throw new Error(`Failed to disable MCP mode: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check if available
     */
    async isEnabled(): Promise<boolean> {
        const apiKey = await ApiKeyManager.getApiKey('zhipu');
        return !!apiKey;
    }

    /**
     * Check if connected
     */
    private isConnected(): boolean {
        return this.client !== null && this.transport !== null;
    }

    /**
     * Ensure client is connected (with auto-reconnect)
     */
    private async ensureConnected(): Promise<void> {
        // If already connected, return directly
        if (this.isConnected()) {
            Logger.debug('✅ [MCP WebSearch] Client connected');
            return;
        }

        // If connecting, wait for connection to complete
        if (this.isConnecting && this.connectionPromise) {
            Logger.debug('⏳ [MCP WebSearch] Waiting for connection to complete...');
            return this.connectionPromise;
        }

        // Start new connection
        this.isConnecting = true;
        this.connectionPromise = this.initializeClient().finally(() => {
            this.isConnecting = false;
            this.connectionPromise = null;
        });

        return this.connectionPromise;
    }

    /**
     * Initialize MCP client connection
     */
    private async initializeClient(): Promise<void> {
        if (this.client && this.transport) {
            Logger.debug('✅ [MCP WebSearch] Client initialized');
            return;
        }

        const apiKey = this.currentApiKey || (await ApiKeyManager.getApiKey('zhipu'));
        if (!apiKey) {
            throw new Error('ZhipuAI API key not set');
        }

        // Update current API key
        this.currentApiKey = apiKey;

        Logger.info('🔗 [MCP WebSearch] Initializing MCP client...');

        try {
            // Use StreamableHTTP transport, pass Authorization token via requestInit.headers
            // Determine MCP URL based on endpoint configuration
            let httpUrl = 'https://open.bigmodel.cn/api/mcp/web_search_prime/mcp';
            const endpoint = ConfigManager.getZhipuEndpoint();
            if (endpoint === 'api.z.ai') {
                httpUrl = httpUrl.replace('open.bigmodel.cn', 'api.z.ai');
            }

            this.client = new Client(
                {
                    name: 'CHP-WebSearch-Client',
                    version: VersionManager.getVersion()
                },
                {
                    capabilities: {
                        tools: {}
                    }
                }
            );

            // Use StreamableHTTP transport, pass authentication headers via requestInit
            // This is the MCP SDK recommended way: pass custom headers via requestInit.headers
            this.transport = new StreamableHTTPClientTransport(new URL(httpUrl), {
                requestInit: {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'User-Agent': this.userAgent
                    }
                }
            });

            await this.client.connect(this.transport);
            Logger.info('✅ [MCP WebSearch] Connected successfully using StreamableHTTP transport (authenticated via Authorization header)');
        } catch (error) {
            Logger.error('❌ [MCP WebSearch] Client initialization failed', error instanceof Error ? error : undefined);
            await this.internalCleanup();
            throw new Error(`MCP client connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Execute search
     */
    async search(params: WebSearchRequest): Promise<ZhipuSearchResult[]> {
        Logger.info(`🔍 [MCP WebSearch] Starting search: "${params.search_query}"`);

        // Ensure client is connected (auto-reconnect)
        await this.ensureConnected();

        if (!this.client) {
            throw new Error('MCP client not initialized');
        }

        try {
            // List available tools
            const tools = await this.client.listTools();
            Logger.debug(`📋 [MCP WebSearch] Available tools: ${tools.tools.map(t => t.name).join(', ')}`);

            // Find webSearchPrime tool
            const webSearchTool = tools.tools.find(t => t.name === 'webSearchPrime');
            if (!webSearchTool) {
                throw new Error('webSearchPrime tool not found');
            }

            // Call search tool
            const result = await this.client.callTool({
                name: 'webSearchPrime',
                arguments: {
                    search_query: params.search_query,
                    search_engine: params.search_engine || 'search_std',
                    search_intent: params.search_intent || false,
                    count: params.count || 10,
                    search_domain_filter: params.search_domain_filter,
                    search_recency_filter: params.search_recency_filter || 'noLimit',
                    content_size: params.content_size || 'medium'
                }
            });

            if (Array.isArray(result.content)) {
                const [{ text }] = result.content as { type: 'text'; text: string }[];
                if (text.startsWith('MCP error')) {
                    throw new Error(text);
                }
                const searchResults = JSON.parse(JSON.parse(text) as string) as ZhipuSearchResult[];
                Logger.debug(`📊 [MCP WebSearch] Tool invocation successful: ${searchResults?.length || 0} results`);
                return searchResults;
            }

            Logger.debug('📊 [MCP WebSearch] Tool invocation finished: no results');
            return [];
        } catch (error) {
            Logger.error('❌ [MCP WebSearch] Search failed', error instanceof Error ? error : undefined);

            // Use unified error handling
            if (error instanceof Error) {
                await this.handleErrorResponse(error);
            }

            // Check if it is a connection error, if so, mark as disconnected for next auto-reconnect
            if (error instanceof Error && (error.message.includes('connection') || error.message.includes('connect'))) {
                Logger.warn('⚠️ [MCP WebSearch] Connection error detected, will auto-reconnect on next search');
                await this.internalCleanup();
            }

            throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get client status
     */
    getStatus(): { name: string; version: string; enabled: boolean; connected: boolean } {
        return {
            name: 'CHP-MCP-WebSearch-Client',
            version: VersionManager.getVersion(),
            enabled: true,
            connected: this.isConnected()
        };
    }

    /**
     * Internal cleanup method (does not remove from cache)
     */
    private async internalCleanup(): Promise<void> {
        Logger.debug('🔌 [MCP WebSearch] Cleaning up client connection...');

        try {
            if (this.transport) {
                await this.transport.close();
                this.transport = null;
            }

            this.client = null;

            Logger.debug('✅ [MCP WebSearch] Client connection cleaned up');
        } catch (error) {
            Logger.error('❌ [MCP WebSearch] Connection cleanup failed', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Cleanup resources (public method, removes from cache)
     */
    async cleanup(): Promise<void> {
        Logger.info('🔌 [MCP WebSearch] Cleaning up client resources...');

        try {
            await this.internalCleanup();

            // Remove from cache
            if (this.currentApiKey) {
                MCPWebSearchClient.clientCache.delete(this.currentApiKey);
                Logger.info(
                    `🗑️ [MCP WebSearch] Removed client from cache (API key: ${this.currentApiKey.substring(0, 8)}...)`
                );
            }

            Logger.info('✅ [MCP WebSearch] Client resources cleaned up');
        } catch (error) {
            Logger.error('❌ [MCP WebSearch] Resource cleanup failed', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Reconnect
     */
    async reconnect(): Promise<void> {
        Logger.info('🔄 [MCP WebSearch] Reconnecting client...');
        await this.internalCleanup();
        await this.ensureConnected();
    }
}
