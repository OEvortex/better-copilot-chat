/*---------------------------------------------------------------------------------------------
 *  ZhipuAI Web Search Tool
 *  Supports switching between MCP and standard billing interfaces
 *--------------------------------------------------------------------------------------------*/

import * as https from "node:https";
import * as vscode from "vscode";
import { Logger } from "../utils";
import { ApiKeyManager } from "../utils/apiKeyManager";
import { ConfigManager } from "../utils/configManager";
import {
	MCPWebSearchClient,
	type WebSearchRequest,
} from "../utils/mcpWebSearchClient";
import { VersionManager } from "../utils/versionManager";

/**
 * ZhipuAI search engine type
 */
export type ZhipuSearchEngine =
	| "search_std"
	| "search_pro"
	| "search_pro_sogou"
	| "search_pro_quark";

/**
 * Search request parameters
 */
export interface ZhipuSearchRequest {
	search_query: string;
	search_engine?: ZhipuSearchEngine;
	search_intent?: boolean;
	count?: number;
	search_domain_filter?: string;
	search_recency_filter?: "noLimit" | "day" | "week" | "month" | "year";
	content_size?: "low" | "medium" | "high";
	request_id?: string;
	user_id?: string;
}

/**
 * Search result item
 */
export interface ZhipuSearchResult {
	title: string;
	link: string;
	content: string;
	media?: string;
	icon?: string;
	refer?: string;
	publish_date?: string;
}

/**
 * Search response
 */
export interface ZhipuSearchResponse {
	id: string;
	created: number;
	request_id?: string;
	search_intent?: Array<{
		query: string;
		intent: string;
		keywords: string;
	}>;
	search_result: ZhipuSearchResult[];
}

/**
 * ZhipuAI web search tool
 */
export class ZhipuSearchTool {
	private readonly baseURL = "https://open.bigmodel.cn/api/paas/v4";
	// MCP client uses singleton pattern, not instantiated directly here

	/**
	 * Check if MCP mode is enabled
	 */
	private isMCPEnabled(): boolean {
		const config = ConfigManager.getZhipuSearchConfig();
		return config.enableMCP;
	}

	/**
	 * Search via MCP
	 */
	private async searchViaMCP(
		params: ZhipuSearchRequest,
	): Promise<ZhipuSearchResult[]> {
		Logger.info(
			`[Zhipu Search] Using MCP mode search: "${params.search_query}"`,
		);

		// Get MCP client instance (singleton pattern, with cache)
		const mcpClient = await MCPWebSearchClient.getInstance();

		const searchRequest: WebSearchRequest = {
			search_query: params.search_query,
			search_engine: params.search_engine,
			search_intent: params.search_intent,
			count: params.count,
			search_domain_filter: params.search_domain_filter,
			search_recency_filter: params.search_recency_filter,
			content_size: params.content_size,
		};

		return await mcpClient.search(searchRequest);
	}

	/**
	 * Execute search (standard billing interface)
	 */
	async search(params: ZhipuSearchRequest): Promise<ZhipuSearchResponse> {
		const apiKey = await ApiKeyManager.getApiKey("zhipu");
		if (!apiKey) {
			throw new Error(
				'ZhipuAI API key not set, please run command "Copilot ++: Set ZhipuAI API Key" first',
			);
		}

		// Determine baseURL based on endpoint configuration
		let baseURL = this.baseURL;
		const endpoint = ConfigManager.getZhipuEndpoint();
		if (endpoint === "api.z.ai") {
			baseURL = baseURL.replace("open.bigmodel.cn", "api.z.ai");
		}

		const url = `${baseURL}/web_search`;

		const requestData = JSON.stringify({
			search_query: params.search_query,
			search_engine: params.search_engine || "search_std",
			search_intent:
				params.search_intent !== undefined ? params.search_intent : false,
			count: params.count || 10,
			search_domain_filter: params.search_domain_filter,
			search_recency_filter: params.search_recency_filter || "noLimit",
			content_size: params.content_size || "medium",
			request_id: params.request_id,
			user_id: params.user_id,
		});

		const options = {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
				"Content-Length": Buffer.byteLength(requestData),
				"User-Agent": VersionManager.getUserAgent("ZhipuSearch"),
			},
		};

		Logger.info(
			`[Zhipu Search] Starting search: "${params.search_query}" using engine ${params.search_engine || "search_std"}`,
		);
		Logger.debug(`[Zhipu Search] Request data: ${requestData}`);

		return new Promise((resolve, reject) => {
			const req = https.request(url, options, (res) => {
				let data = "";

				res.on("data", (chunk) => {
					data += chunk;
				});

				res.on("end", () => {
					try {
						Logger.debug(
							`[Zhipu Search] Response status code: ${res.statusCode}`,
						);
						Logger.debug(`[Zhipu Search] Response data: ${data}`);

						if (res.statusCode !== 200) {
							let errorMessage = `ZhipuAI search API error ${res.statusCode}`;
							try {
								const errorData = JSON.parse(data);
								errorMessage += `: ${errorData.error?.message || JSON.stringify(errorData)}`;
							} catch {
								errorMessage += `: ${data}`;
							}
							Logger.error(
								"[Zhipu Search] API returned error",
								new Error(errorMessage),
							);
							reject(new Error(errorMessage));
							return;
						}

						const response = JSON.parse(data) as ZhipuSearchResponse;
						Logger.info(
							`[Zhipu Search] Search complete: found ${response.search_result?.length || 0} results`,
						);
						resolve(response);
					} catch (error) {
						Logger.error(
							"[Zhipu Search] Failed to parse response",
							error instanceof Error ? error : undefined,
						);
						reject(
							new Error(
								`Failed to parse ZhipuAI search response: ${error instanceof Error ? error.message : "Unknown error"}`,
							),
						);
					}
				});
			});

			req.on("error", (error) => {
				Logger.error("[Zhipu Search] Request failed", error);
				reject(new Error(`ZhipuAI search request failed: ${error.message}`));
			});

			req.write(requestData);
			req.end();
		});
	}

	/**
	 * Tool invocation handler
	 */
	async invoke(
		request: vscode.LanguageModelToolInvocationOptions<ZhipuSearchRequest, unknown>,
	): Promise<vscode.LanguageModelToolResult> {
		try {
			Logger.info(
				`[Tool Invocation] ZhipuAI web search tool invoked: ${JSON.stringify(request.input)}`,
			);

			const params = request.input as ZhipuSearchRequest;
			if (!params.search_query) {
				throw new Error("Missing required parameter: search_query");
			}

			// Select search mode based on configuration
			let searchResults: ZhipuSearchResult[];
			if (this.isMCPEnabled()) {
				Logger.info("[Zhipu Search] Using MCP mode search");
				searchResults = await this.searchViaMCP(params);
			} else {
				Logger.info(
					"[Zhipu Search] Using standard billing interface search (pay-per-use)",
				);
				const response = await this.search(params);
				searchResults = response.search_result || [];
			}

			Logger.info(
				"[Tool Invocation] ZhipuAI web search tool invocation successful",
			);

			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(JSON.stringify(searchResults)),
			]);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			Logger.error(
				"[Tool Invocation] ZhipuAI web search tool invocation failed",
				error instanceof Error ? error : undefined,
			);

			throw new vscode.LanguageModelError(
				`ZhipuAI search failed: ${errorMessage}`,
			);
		}
	}

	/**
	 * Get search mode status
	 */
	getSearchModeStatus(): { mode: "MCP" | "Standard"; description: string } {
		const isMCP = this.isMCPEnabled();
		return {
			mode: isMCP ? "MCP" : "Standard",
			description: isMCP
				? "MCP mode (Coding Plan exclusive)"
				: "Standard billing interface mode (pay-per-use)",
		};
	}

	/**
	 * Clean up tool resources
	 */
	async cleanup(): Promise<void> {
		try {
			// MCP client uses singleton pattern, no need to clean up here
			// If all MCP client caches need to be cleared, call MCPWebSearchClient.clearCache()
			Logger.info("[Zhipu Search] Tool resources cleaned up");
		} catch (error) {
			Logger.error(
				"[Zhipu Search] Resource cleanup failed",
				error instanceof Error ? error : undefined,
			);
		}
	}

	/**
	 * Get MCP client cache statistics
	 */
	getMCPCacheStats() {
		return MCPWebSearchClient.getCacheStats();
	}

	/**
	 * Clear MCP client cache
	 */
	async clearMCPCache(apiKey?: string): Promise<void> {
		await MCPWebSearchClient.clearCache(apiKey);
	}
}
