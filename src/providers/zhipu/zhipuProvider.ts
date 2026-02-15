/*---------------------------------------------------------------------------------------------
 *  Zhipu AI Dedicated Provider
 *  Dynamically fetches models from Zhipu API
 *--------------------------------------------------------------------------------------------*/

import * as fs from "node:fs";
import * as path from "node:path";
import type {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatMessage,
	LanguageModelChatProvider,
	Progress,
	ProvideLanguageModelChatResponseOptions,
} from "vscode";
import * as vscode from "vscode";
import type { ModelConfig, ProviderConfig } from "../../types/sharedTypes";
import { ConfigManager } from "../../utils/configManager";
import { Logger } from "../../utils/logger";
import { RateLimiter } from "../../utils/rateLimiter";
import { GenericModelProvider } from "../common/genericModelProvider";
import { ZhipuWizard } from "./zhipuWizard";

const DEFAULT_MAX_OUTPUT_TOKENS = 16000;
const DEFAULT_CONTEXT_LENGTH = 186000;
const HIGH_CONTEXT_THRESHOLD = 200000;
const HIGH_CONTEXT_MAX_OUTPUT_TOKENS = 32000;
const FIXED_256K_MAX_INPUT_TOKENS = 224000;
const FIXED_256K_MAX_OUTPUT_TOKENS = 32000;

// API endpoints based on plan
const CODING_PLAN_BASE_URL = "https://api.z.ai/api/coding/paas/v4";
const NORMAL_PLAN_BASE_URL = "https://api.z.ai/api/paas/v4";

interface ZhipuAPIModel {
	id: string;
	object: string;
	created: number;
	owned_by: string;
}

interface ZhipuModelsResponse {
	object: string;
	data: ZhipuAPIModel[];
}

const HARDCODED_MODELS: ZhipuAPIModel[] = [
	{
		id: "glm-4.7-flash",
		object: "model",
		created: 0,
		owned_by: "zhipu",
	},
	{
		id: "glm-4.7-flashx",
		object: "model",
		created: 0,
		owned_by: "zhipu",
	},
];

type ZhipuThinkingType = "enabled" | "disabled";

import {
	getDefaultMaxOutputTokensForContext,
	isMinimaxModel,
	resolveGlobalCapabilities,
	resolveGlobalTokenLimits,
} from "../../utils";


/**
 * Zhipu AI Dedicated Model Provider Class
 * Dynamically fetches models from Zhipu API
 */
export class ZhipuProvider
	extends GenericModelProvider
	implements LanguageModelChatProvider
{
	private readonly configFilePath: string;

	constructor(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	) {
		super(context, providerKey, providerConfig);
		this.configFilePath = path.join(
			context.extensionPath,
			"src",
			"providers",
			"config",
			"zhipu.json",
		);
	}

	/**
	 * Get base URL based on plan setting
	 */
	private getBaseUrl(): string {
		const plan = ConfigManager.getZhipuPlan();
		// Check for custom base URL first
		const customBaseUrl = this.cachedProviderConfig.baseUrl;
		if (customBaseUrl) {
			return customBaseUrl;
		}
		return plan === "coding" ? CODING_PLAN_BASE_URL : NORMAL_PLAN_BASE_URL;
	}

	/**
	 * Override refreshHandlers to clear cache when config changes
	 */
	protected override refreshHandlers(): void {
		super.refreshHandlers();
		Logger.debug("[Zhipu] Handlers refreshed due to config change");
	}

	/**
	 * Fetch models from Zhipu API
	 */
	private async fetchModels(apiKey: string): Promise<ZhipuAPIModel[]> {
		const baseUrl = this.getBaseUrl();
		Logger.info(`[Zhipu] Fetching models from ${baseUrl}/models`);

		const resp = await fetch(`${baseUrl}/models`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});

		if (!resp.ok) {
			let text = "";
			try {
				text = await resp.text();
			} catch {
				// ignore
			}
			const err = new Error(
				`Failed to fetch Zhipu models: ${resp.status} ${resp.statusText}${text ? `\n${text}` : ""}`,
			);
			Logger.error("[Zhipu Model Provider] Failed to fetch Zhipu models", err);
			throw err;
		}

		const parsed = (await resp.json()) as ZhipuModelsResponse;
		return parsed.data ?? [];
	}

	private mergeHardcodedModels(models: ZhipuAPIModel[]): ZhipuAPIModel[] {
		const seen = new Set(models.map((m) => m.id));
		const merged = [...models];
		for (const hardcoded of HARDCODED_MODELS) {
			if (!seen.has(hardcoded.id)) {
				merged.push(hardcoded);
			}
		}
		return merged;
	}

	private supportsThinking(modelId: string): boolean {
		const normalized = modelId.toLowerCase();
		return /^glm-(5|4\.(5|6|7))(?:[^\d].*)?$/.test(normalized);
	}

	private buildThinkingExtraBody(
		modelId: string,
		existingExtraBody?: Record<string, unknown>,
	): Record<string, unknown> | undefined {
		if (!this.supportsThinking(modelId)) {
			return existingExtraBody;
		}

		const thinkingMode = ConfigManager.getZhipuThinking();
		if (thinkingMode === "auto") {
			if (!existingExtraBody) {
				return undefined;
			}
			const next = { ...existingExtraBody };
			delete next.thinking;
			return Object.keys(next).length > 0 ? next : undefined;
		}

		const merged: Record<string, unknown> = {
			...(existingExtraBody || {}),
			thinking: {
				type: thinkingMode as ZhipuThinkingType,
				clear_thinking: ConfigManager.getZhipuClearThinking(),
			},
		};

		return merged;
	}

	/**
	 * Get metadata for known models
	 */
	private getModelMetadata(modelId: string): {
		name: string;
		maxInputTokens: number;
		maxOutputTokens: number;
		toolCalling: boolean;
		imageInput: boolean;
	} {
		const normalizedCapabilities = resolveGlobalCapabilities(modelId);

		if (isMinimaxModel(modelId)) {
		const tokens = resolveGlobalTokenLimits(modelId, 256000, {
			defaultContextLength: DEFAULT_CONTEXT_LENGTH,
			defaultMaxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
		});
		return {
			name: modelId,
			maxInputTokens: tokens.maxInputTokens,
			maxOutputTokens: tokens.maxOutputTokens,
			toolCalling: normalizedCapabilities.toolCalling,
			imageInput: normalizedCapabilities.imageInput,
		};
	}

	// Default metadata
	const defaultMeta = {
		name: modelId,
		maxInputTokens: DEFAULT_CONTEXT_LENGTH,
		maxOutputTokens: getDefaultMaxOutputTokensForContext(DEFAULT_CONTEXT_LENGTH, DEFAULT_MAX_OUTPUT_TOKENS),
		toolCalling: normalizedCapabilities.toolCalling,
		imageInput: normalizedCapabilities.imageInput,
	};

	// Model-specific metadata (200K+ context = 32K output, <200K context = 16K output)
	const modelMetadata: Record<string, typeof defaultMeta> = {
		"glm-5": {
			name: "GLM-5 (Latest)",
			maxInputTokens: 224000,
			maxOutputTokens: getDefaultMaxOutputTokensForContext(224000, DEFAULT_MAX_OUTPUT_TOKENS),
			toolCalling: true,
			imageInput: false,
		},
		"glm-4.7": {
			name: "GLM-4.7",
			maxInputTokens: 224000,
			maxOutputTokens: getDefaultMaxOutputTokensForContext(224000, DEFAULT_MAX_OUTPUT_TOKENS),
			toolCalling: true,
			imageInput: false,
		},
		"glm-4.6": {
			name: "GLM-4.6",
			maxInputTokens: 224000,
			maxOutputTokens: getDefaultMaxOutputTokensForContext(224000, DEFAULT_MAX_OUTPUT_TOKENS),
			toolCalling: true,
			imageInput: false,
		},
		"glm-4.5": {
			name: "GLM-4.5",
			maxInputTokens: 112000,
			maxOutputTokens: getDefaultMaxOutputTokensForContext(112000, DEFAULT_MAX_OUTPUT_TOKENS),
			toolCalling: true,
			imageInput: false,
		},
		"glm-4.5-air": {
			name: "GLM-4.5-Air",
			maxInputTokens: 112000,
			maxOutputTokens: getDefaultMaxOutputTokensForContext(112000, DEFAULT_MAX_OUTPUT_TOKENS),
			toolCalling: true,
			imageInput: false,
		},
		"glm-4.7-flash": {
			name: "GLM-4.7-Flash (Free, 1 Concurrent)",
			maxInputTokens: 224000,
			maxOutputTokens: getDefaultMaxOutputTokensForContext(224000, DEFAULT_MAX_OUTPUT_TOKENS),
			toolCalling: true,
			imageInput: false,
		},
		"glm-4.7-flashx": {
			name: "GLM-4.7-FlashX (Paid)",
			maxInputTokens: 224000,
			maxOutputTokens: getDefaultMaxOutputTokensForContext(224000, DEFAULT_MAX_OUTPUT_TOKENS),
			toolCalling: true,
			imageInput: false,
		},

	};

	return modelMetadata[modelId] || defaultMeta;
	}

	/**
	 * Override provideLanguageModelChatInformation to fetch models dynamically
	 */
	override async provideLanguageModelChatInformation(
		options: { silent: boolean },
		token: CancellationToken,
	): Promise<LanguageModelChatInformation[]> {
		// First check if API key is available
		const apiKey = await this.getApiKeyFromManager();
		if (!apiKey) {
			// If no API key, fall back to config models
			return super.provideLanguageModelChatInformation(options, token);
		}

		try {
			const apiModels = await this.fetchModels(apiKey);
			const models = this.mergeHardcodedModels(apiModels);

			// Auto-update config file in background (non-blocking)
			this.updateConfigFileAsync(models);

			// Map API models to LanguageModelChatInformation
			const infos = models.map((m) => {
				const modelMeta = this.getModelMetadata(m.id);
				return {
					id: m.id,
					name: modelMeta.name,
					tooltip: `${m.id} by ZhipuAI`,
					family: "zhipu",
					version: "1.0.0",
					maxInputTokens: modelMeta.maxInputTokens,
					maxOutputTokens: modelMeta.maxOutputTokens,
					capabilities: {
						toolCalling: modelMeta.toolCalling,
						imageInput: modelMeta.imageInput,
					},
				} as LanguageModelChatInformation;
			});

			this._chatEndpoints = infos.map((info) => ({
				model: info.id,
				modelMaxPromptTokens: info.maxInputTokens + info.maxOutputTokens,
			}));

			return infos;
		} catch (err) {
			// On error, fall back to config models
			Logger.warn(
				"[Zhipu] Failed to fetch models from API, falling back to config:",
				err instanceof Error ? err.message : String(err),
			);
			return super.provideLanguageModelChatInformation(options, token);
		}
	}

	/**
	 * Get API key from ApiKeyManager
	 */
	private async getApiKeyFromManager(): Promise<string | null> {
		try {
			const { ApiKeyManager } = await import("../../utils/apiKeyManager.js");
			const key = await ApiKeyManager.getApiKey(this.providerKey);
			return key === undefined ? null : key;
		} catch (err) {
			Logger.warn("[Zhipu] Failed to get API key:", err);
			return null;
		}
	}

	/**
	 * Update config file asynchronously in background
	 */
	private updateConfigFileAsync(models: ZhipuAPIModel[]): void {
		(async () => {
			try {
				if (!fs.existsSync(this.configFilePath)) {
					Logger.debug(
						`[Zhipu] Config file not found at ${this.configFilePath}, skipping auto-update`,
					);
					return;
				}

				const modelConfigs: ModelConfig[] = models.map((m) => {
					const meta = this.getModelMetadata(m.id);
					return {
						id: m.id,
						name: meta.name,
						tooltip: `${m.id} by ZhipuAI`,
						maxInputTokens: meta.maxInputTokens,
						maxOutputTokens: meta.maxOutputTokens,
						model: m.id,
						sdkMode: "openai" as const,
						baseUrl: this.getBaseUrl(),
						extraBody: this.buildThinkingExtraBody(m.id),
						capabilities: {
							toolCalling: meta.toolCalling,
							imageInput: meta.imageInput,
						},
					};
				});

				// Read existing config to preserve displayName and apiKeyTemplate
				let existingConfig: ProviderConfig;
				try {
					const configContent = fs.readFileSync(this.configFilePath, "utf8");
					existingConfig = JSON.parse(configContent);
				} catch {
					existingConfig = {
						displayName: "ZhipuAI",
						baseUrl: this.getBaseUrl(),
						apiKeyTemplate: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx",
						models: [],
					};
				}

				// Update config with new models
				const updatedConfig: ProviderConfig = {
					displayName: existingConfig.displayName || "ZhipuAI",
					baseUrl: existingConfig.baseUrl || this.getBaseUrl(),
					apiKeyTemplate:
						existingConfig.apiKeyTemplate ||
						"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx",
					models: modelConfigs,
				};

				fs.writeFileSync(
					this.configFilePath,
					JSON.stringify(updatedConfig, null, 4),
					"utf8",
				);
				Logger.info(
					`[Zhipu] Auto-updated config file with ${modelConfigs.length} models`,
				);
			} catch (err) {
				Logger.warn(
					`[Zhipu] Background config update failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		})();
	}

	/**
	 * Static factory method - Create and activate Zhipu provider
	 */
	static createAndActivate(
		context: vscode.ExtensionContext,
		providerKey: string,
		providerConfig: ProviderConfig,
	): { provider: ZhipuProvider; disposables: vscode.Disposable[] } {
		Logger.trace(
			`${providerConfig.displayName} dedicated model extension activated!`,
		);
		// Create provider instance
		const provider = new ZhipuProvider(context, providerKey, providerConfig);
		// Register language model chat provider
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			`chp.${providerKey}`,
			provider,
		);
		// Register configuration command
		const setApiKeyCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.setApiKey`,
			async () => {
				await ZhipuWizard.startWizard(
					providerConfig.displayName,
					providerConfig.apiKeyTemplate,
				);
				// Clear cache after configuration change
				await provider.modelInfoCache?.invalidateCache(providerKey);
				// Trigger model information change event
				provider._onDidChangeLanguageModelChatInformation.fire();
			},
		);

		// Register configuration wizard command
		const configWizardCommand = vscode.commands.registerCommand(
			`chp.${providerKey}.configWizard`,
			async () => {
				Logger.info(
					`Starting ${providerConfig.displayName} configuration wizard`,
				);
				await ZhipuWizard.startWizard(
					providerConfig.displayName,
					providerConfig.apiKeyTemplate,
				);
			},
		);

		const disposables = [
			providerDisposable,
			setApiKeyCommand,
			configWizardCommand,
		];
		for (const disposable of disposables) {
			context.subscriptions.push(disposable);
		}
		return { provider, disposables };
	}

	/**
	 * Override provideChatResponse to update status bar after request completion
	 */
	override async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: Array<LanguageModelChatMessage>,
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<vscode.LanguageModelResponsePart>,
		token: CancellationToken,
	): Promise<void> {
		// Apply rate limiting: 2 requests per 1 second
		await RateLimiter.getInstance(this.providerKey, 2, 1000).throttle(
			this.providerConfig.displayName,
		);

		const modelConfig = this.providerConfig.models.find((m) => m.id === model.id);
		if (modelConfig) {
			modelConfig.sdkMode = "openai";
			modelConfig.baseUrl = modelConfig.baseUrl || this.getBaseUrl();
			modelConfig.extraBody = this.buildThinkingExtraBody(
				model.id,
				modelConfig.extraBody,
			);
		}

		// Call parent class implementation
		await super.provideLanguageModelChatResponse(
			model,
			messages,
			options,
			progress,
			token,
		);
	}
}
