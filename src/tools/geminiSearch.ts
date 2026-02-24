/*---------------------------------------------------------------------------------------------
 *  Gemini CLI Web Search Tool
 *  Uses Google's "web-search" utility model via Gemini CLI OAuth credentials
 *  Based on the Gemini CLI's google_web_search implementation
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import crypto from "node:crypto";
import { Logger } from "../utils";
import { GeminiOAuthManager } from "../providers/geminicli/auth";
import {
	extractGeminiResponseCandidates,
	extractGroundingMetadataFromGeminiCandidates,
	extractTextFromGeminiCandidates,
	parseGeminiSSECandidates,
	type GeminiResponseCandidate,
} from "../providers/geminicli/handler";
import { GEMINI_DEFAULT_BASE_URL } from "../providers/geminicli/types";

/**
 * Search request parameters
 */
export interface GeminiSearchRequest {
	query: string;
}

/**
 * Search result item with grounding metadata
 */
export interface GeminiSearchResult {
	content: string;
	sources?: Array<{
		title: string;
		url: string;
	}>;
	citations?: Array<{
		startIndex: number;
		endIndex: number;
		segment: string;
	}>;
}

/**
 * Gemini CLI web search tool
 * Implements the google_web_search tool similar to Gemini CLI
 */
export class GeminiSearchTool {
	private readonly toolName = "google_web_search";
	private readonly searchModel = "web-search";
	private static readonly DEFAULT_USER_AGENT = "gemini-cli/1.0.0";
	private projectIdCache: string | null = null;
	private projectIdPromise: Promise<string> | null = null;

	private buildGenerateContentUrl(baseUrl: string): string {
		const trimmedBaseUrl = baseUrl.replace(/\/+$/, "");
		if (/\/v1internal$/i.test(trimmedBaseUrl)) {
			return `${trimmedBaseUrl}:generateContent`;
		}
		return `${trimmedBaseUrl}/v1internal:generateContent`;
	}

	private buildStreamGenerateContentUrl(baseUrl: string): string {
		const trimmedBaseUrl = baseUrl.replace(/\/+$/, "");
		if (/\/v1internal$/i.test(trimmedBaseUrl)) {
			return `${trimmedBaseUrl}:streamGenerateContent?alt=sse`;
		}
		return `${trimmedBaseUrl}/v1internal:streamGenerateContent?alt=sse`;
	}

	private async fallbackWithoutWebSearch(
		url: string,
		accessToken: string,
		query: string,
		projectId: string,
	): Promise<{
		content: string;
		sources?: Array<{ title: string; url: string }>;
		citations?: Array<{ startIndex: number; endIndex: number; segment: string }>;
	}> {
		const uuid = crypto.randomUUID
			? crypto.randomUUID()
			: crypto.randomBytes(16).toString("hex");
		const requestBody = {
			model: "gemini-2.5-flash",
			user_prompt_id: `tool-fallback-${uuid}`,
			...(projectId ? { project: projectId } : {}),
			request: {
				contents: [
					{
						role: "user",
						parts: [
							{
								text: `Web search tool is temporarily unavailable due to backend errors. Provide the best available answer from model knowledge for: ${query}`,
							},
						],
					},
				],
				generationConfig: {
					temperature: 0.1,
				},
			},
		};

		Logger.warn("[Gemini Search] Falling back to non-grounded completion");
		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
				"User-Agent": GeminiSearchTool.DEFAULT_USER_AGENT,
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			const err = await response.text();
			throw new Error(
				`Search fallback also failed: ${response.status} ${response.statusText} - ${err}`,
			);
		}
		const data = (await response.json()) as {
			candidates?: Array<{
				content?: { parts?: Array<{ text?: string }> };
			}>;
		};
		const content =
			data.candidates?.[0]?.content?.parts?.[0]?.text ||
			"No response available from fallback model.";
		return {
			content: `⚠️ Web-grounded search is temporarily unavailable for this account/backend.\n\n${content}`,
			sources: [],
			citations: [],
		};
	}

	private async getProjectId(
		accessToken: string,
		baseUrl: string,
	): Promise<string> {
		if (this.projectIdCache !== null) {
			return this.projectIdCache;
		}
		if (this.projectIdPromise) {
			return this.projectIdPromise;
		}

		this.projectIdPromise = (async () => {
			try {
				const urlBase = baseUrl.replace(/\/$/, "");
				const loadUrl = /\/v1internal$/i.test(urlBase)
					? `${urlBase}:loadCodeAssist`
					: `${urlBase}/v1internal:loadCodeAssist`;

				const envProject =
					process.env.GOOGLE_CLOUD_PROJECT ||
					process.env.GOOGLE_CLOUD_PROJECT_ID ||
					"";
				const metadata: Record<string, unknown> = {
					ideType: "IDE_UNSPECIFIED",
					platform: "PLATFORM_UNSPECIFIED",
					pluginType: "GEMINI",
				};
				if (envProject) {
					metadata.duetProject = envProject;
				}

				const res = await fetch(loadUrl, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						"Content-Type": "application/json",
						"User-Agent": GeminiSearchTool.DEFAULT_USER_AGENT,
						"Client-Metadata": JSON.stringify(metadata),
					},
					body: JSON.stringify({
						cloudaicompanionProject: envProject || undefined,
						metadata,
					}),
				});

				if (!res.ok) {
					this.projectIdCache = "";
					return "";
				}

				const text = await res.text();
				let data: Record<string, unknown>;
				try {
					data = JSON.parse(text) as Record<string, unknown>;
				} catch {
					this.projectIdCache = "";
					return "";
				}

				const rawProject = data?.cloudaicompanionProject;
				let projectId = "";
				if (typeof rawProject === "string") {
					projectId = rawProject.trim();
				} else if (
					rawProject &&
					typeof rawProject === "object" &&
					typeof (rawProject as { id?: string }).id === "string"
				) {
					projectId = (rawProject as { id: string }).id.trim();
				}

				this.projectIdCache = projectId;
				return projectId;
			} catch {
				this.projectIdCache = "";
				return "";
			} finally {
				this.projectIdPromise = null;
			}
		})();

		return this.projectIdPromise;
	}

	/**
	 * Invoke the search tool
	 */
	async invoke(
		request: vscode.LanguageModelToolInvocationOptions<
			GeminiSearchRequest,
			unknown
		>,
	): Promise<vscode.LanguageModelToolResult> {
		const params = request.input as GeminiSearchRequest;
		const query = params.query;

		if (!query || typeof query !== "string") {
			throw new Error("Missing or invalid 'query' parameter");
		}

		Logger.info(`[Gemini Search] Executing web search: "${query}"`);

		try {
			const result = await this.performSearch(query);

			// Format result with sources
			const formattedResult = this.formatSearchResult(result);

			Logger.info("[Tool Invocation] Gemini CLI web search tool invocation successful");

			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(formattedResult),
			]);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			Logger.error(
				"[Tool Invocation] Gemini CLI web search tool invocation failed",
				error instanceof Error ? error : undefined,
			);

			throw new vscode.LanguageModelError(
				`Gemini search failed: ${errorMessage}`,
			);
		}
	}

	/**
	 * Perform web search using Gemini API with Google Search tool
	 */
	private async performSearch(query: string): Promise<GeminiSearchResult> {
		// Get OAuth credentials from Gemini CLI
		const oauthManager = GeminiOAuthManager.getInstance();
		const credentials = await oauthManager.ensureAuthenticated();

		if (!credentials.accessToken) {
			throw new Error(
				"No access token available. Please run 'gemini auth login' first.",
			);
		}

		// Get base URL from config or use default
		const baseUrl =
			vscode.workspace
				.getConfiguration("chp")
				.get<string>("geminicli.baseUrl") || credentials.baseURL || GEMINI_DEFAULT_BASE_URL;
		const projectId = await this.getProjectId(credentials.accessToken, baseUrl);

		// Use the v1internal endpoint with a real model and the googleSearch tool
		const url = this.buildGenerateContentUrl(baseUrl);

		const searchModels = [
			"web-search",
			"gemini-3-flash-preview",
			"gemini-2.5-flash",
			"gemini-2.5-pro",
		];

		let lastErrorMessage = "Unknown error";
		let candidates: GeminiResponseCandidate[] | null = null;

		for (const model of searchModels) {
			const uuid = crypto.randomUUID
				? crypto.randomUUID()
				: crypto.randomBytes(16).toString("hex");
			
			// web-search alias doesn't need explicit tools - backend handles it
			// Other models need explicit googleSearch tool
			const hasExplicitTools = model !== "web-search";
			const baseRequest = {
				contents: [
					{
						role: "user",
						parts: [{ text: query }],
					},
				],
				generationConfig: {
					temperature: 0.0,
				},
				...(hasExplicitTools ? { tools: [{ googleSearch: {} }] } : {}),
			};

			const requestBody = {
				model,
				user_prompt_id: `tool-${uuid}`,
				...(projectId ? { project: projectId } : {}),
				request: baseRequest,
			};

			Logger.info(`[Gemini Search] Request URL: ${url}`);
			Logger.info(
				`[Gemini Search] Request body: ${JSON.stringify(requestBody, null, 2)}`,
			);

			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${credentials.accessToken}`,
					"User-Agent": GeminiSearchTool.DEFAULT_USER_AGENT,
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				lastErrorMessage = `Search API error: ${response.status} ${response.statusText} - ${errorText}`;

				// Fallback to stream endpoint used by Code Assist chat path
				const streamUrl = this.buildStreamGenerateContentUrl(baseUrl);
				Logger.warn(
					`[Gemini Search] Model ${model} failed on generateContent. Trying stream endpoint fallback: ${streamUrl}`,
				);
				const streamResponse = await fetch(streamUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${credentials.accessToken}`,
						"User-Agent": GeminiSearchTool.DEFAULT_USER_AGENT,
					},
					body: JSON.stringify(requestBody),
				});
				if (!streamResponse.ok) {
					const streamErrorText = await streamResponse.text();
					lastErrorMessage = `Search API error: ${streamResponse.status} ${streamResponse.statusText} - ${streamErrorText}`;
					Logger.warn(
						`[Gemini Search] Model ${model} failed on stream fallback. Trying next fallback model.`,
					);
					continue;
				}
				const sseText = await streamResponse.text();
				const streamCandidates = parseGeminiSSECandidates(sseText);
				if (streamCandidates.length === 0) {
					lastErrorMessage = "Search API error: Stream response was empty or unparsable";
					Logger.warn(
						`[Gemini Search] Model ${model} stream response was empty/unparsable. Trying next fallback model.`,
					);
					continue;
				}
				candidates = streamCandidates;
				break;
			}

			const responseJson = (await response.json()) as unknown;
			const modelCandidates = extractGeminiResponseCandidates(responseJson);
			
			// Log response for debugging
			Logger.info(`[Gemini Search] Model ${model} response: ${JSON.stringify({
				hasCandidates: modelCandidates.length > 0,
				candidateCount: modelCandidates.length,
				hasContent: !!modelCandidates[0]?.content,
				hasParts: !!modelCandidates[0]?.content?.parts,
				partCount: modelCandidates[0]?.content?.parts?.length,
				hasGrounding: !!modelCandidates[0]?.groundingMetadata,
			})}`);
			
			// Check if we got actual content
			const hasContent = extractTextFromGeminiCandidates(modelCandidates);
			if (!hasContent) {
				Logger.warn(`[Gemini Search] Model ${model} returned empty content. Trying next model.`);
				lastErrorMessage = `Model ${model} returned empty response`;
				if (modelCandidates.length === 0) {
					continue;
				}
			}

			if (modelCandidates.length === 0) {
				Logger.warn(`[Gemini Search] Model ${model} returned no candidates. Trying next model.`);
				lastErrorMessage = `Model ${model} returned no candidates`;
				continue;
			}

			candidates = modelCandidates;
			
			break;
		}

		if (!candidates) {
			// Final graceful fallback: avoid hard tool failure when backend rejects web search.
			return await this.fallbackWithoutWebSearch(
				url,
				credentials.accessToken,
				query,
				projectId,
			);
		}

		// Extract response text
		let responseText = extractTextFromGeminiCandidates(candidates);

		Logger.info(`[Gemini Search] Extracted response text length: ${responseText.length}`);

		// Extract grounding metadata for sources/citations
		const groundingMetadata = extractGroundingMetadataFromGeminiCandidates(candidates);
		const sources = this.extractSources(groundingMetadata);
		const citations = this.extractCitations(groundingMetadata);

		Logger.info(`[Gemini Search] Extracted ${sources.length} sources, ${citations.length} citations`);

		if (!responseText && sources.length > 0) {
			responseText = "Found relevant web sources but no summary text was returned by the backend response.";
		}

		if (!responseText && sources.length === 0) {
			Logger.warn("[Gemini Search] No content or sources found, using fallback");
			return await this.fallbackWithoutWebSearch(
				url,
				credentials.accessToken,
				query,
				projectId,
			);
		}

		return {
			content: responseText,
			sources,
			citations,
		};
	}

	/**
	 * Extract sources from grounding metadata
	 */
	private extractSources(
		groundingMetadata?: {
			groundingChunks?: Array<{ web?: { title?: string; url?: string } }>;
		},
	): Array<{ title: string; url: string }> {
		if (!groundingMetadata?.groundingChunks) {
			return [];
		}

		const sources: Array<{ title: string; url: string }> = [];
		const chunks = groundingMetadata.groundingChunks;

		for (const chunk of chunks) {
			if (chunk.web) {
				sources.push({
					title: chunk.web.title || "Untitled",
					url: chunk.web.url || "",
				});
			}
		}

		return sources;
	}

	/**
	 * Extract citation markers from grounding metadata
	 */
	private extractCitations(
		groundingMetadata?: {
			groundingSupports?: Array<{
				startIndex?: number;
				endIndex?: number;
				text?: string;
			}>;
		},
	): Array<{ startIndex: number; endIndex: number; segment: string }> {
		if (!groundingMetadata?.groundingSupports) {
			return [];
		}

		const citations: Array<{
			startIndex: number;
			endIndex: number;
			segment: string;
		}> = [];
		const supports = groundingMetadata.groundingSupports;

		for (const support of supports) {
			citations.push({
				startIndex: support.startIndex || 0,
				endIndex: support.endIndex || 0,
				segment: support.text || "",
			});
		}

		return citations;
	}

	/**
	 * Format search result with citations and sources
	 */
	private formatSearchResult(result: GeminiSearchResult): string {
		let formatted = result.content;

		// Add sources section if available
		if (result.sources && result.sources.length > 0) {
			formatted += "\n\n**Sources:**\n";
			result.sources.forEach((source, index) => {
				formatted += `${index + 1}. [${source.title}](${source.url})\n`;
			});
		}

		return formatted;
	}

	/**
	 * Clean up resources
	 */
	async cleanup(): Promise<void> {
		Logger.info("[Gemini Search] Tool cleanup completed");
	}
}
