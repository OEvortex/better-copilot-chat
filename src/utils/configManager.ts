/*---------------------------------------------------------------------------------------------
 *  Configuration Manager
 *  Used to manage global configuration settings and provider configurations for the Copilot ++ extension
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { configProviders } from "../providers/config";
import type {
	ConfigProvider,
	ModelConfig,
	ProviderConfig,
	UserConfigOverrides,
} from "../types/sharedTypes";
import { Logger } from "./logger";

/**
 * ZhipuAI Search Configuration
 */
export interface ZhipuSearchConfig {
	/** Whether to enable SSE communication mode (only Pro+ plans support) */
	enableMCP: boolean;
}

/**
 * ZhipuAI Unified Configuration
 */
export interface ZhipuConfig {
	/** Search function configuration */
	search: ZhipuSearchConfig;
	/** Access site */
	endpoint: "open.bigmodel.cn" | "api.z.ai";
}

/**
 * MiniMax Configuration
 */
export interface MiniMaxConfig {
	/** Coding Plan access point */
	endpoint: "minimaxi.com" | "minimax.io";
}

/**
 * NES Completion Configuration
 */
export interface NESCompletionConfig {
	enabled: boolean;
	debounceMs: number;
	timeoutMs: number; // Request timeout
	manualOnly: boolean; // Manual trigger only mode
	modelConfig: {
		provider: string;
		baseUrl: string;
		model: string;
		maxTokens: number;
		extraBody?: Record<string, unknown>;
	};
}
export type FIMCompletionConfig = Omit<NESCompletionConfig, "manualOnly">;

/**
 * Copilot ++ Configuration Interface
 */
export interface CHPConfig {
	/** Temperature parameter, controls output randomness (0.0-2.0) */
	temperature: number;
	/** Top-p parameter, controls output diversity (0.0-1.0) */
	topP: number;
	/** Maximum output token count */
	maxTokens: number;
	/** Whether to remember the last selected model */
	rememberLastModel: boolean;
	/** ZhipuAI configuration */
	zhipu: ZhipuConfig;
	/** MiniMax configuration */
	minimax: MiniMaxConfig;
	/** FIM completion configuration */
	fimCompletion: FIMCompletionConfig;
	/** NES completion configuration */
	nesCompletion: NESCompletionConfig;
	/** Provider configuration override */
	providerOverrides: UserConfigOverrides;
}

/**
 * Configuration Manager Class
 * Responsible for reading and managing Copilot ++ in VS Code settings and provider configuration in package.json
 */
export class ConfigManager {
	private static readonly CONFIG_SECTION = "chp";
	private static cache: CHPConfig | null = null;
	private static configListener: vscode.Disposable | null = null;

	/**
	 * Initialize configuration manager
	 * Set up configuration change listener
	 */
	static initialize(): vscode.Disposable {
		// Clean up previous listener
		if (ConfigManager.configListener) {
			ConfigManager.configListener.dispose();
		}

		// Set up configuration change listener
		ConfigManager.configListener = vscode.workspace.onDidChangeConfiguration(
			(event) => {
				if (event.affectsConfiguration(ConfigManager.CONFIG_SECTION)) {
					ConfigManager.cache = null; // Clear cache, force re-read
					Logger.info("Copilot ++ updated, cache cleared");
				}
			},
		);

		Logger.debug("Configuration manager initialized");
		return ConfigManager.configListener;
	}

	/**
	 * Get current configuration
	 * Use caching mechanism to improve performance
	 */
	static getConfig(): CHPConfig {
		if (ConfigManager.cache) {
			return ConfigManager.cache;
		}

		const config = vscode.workspace.getConfiguration(
			ConfigManager.CONFIG_SECTION,
		);

		ConfigManager.cache = {
			temperature: ConfigManager.validateTemperature(
				config.get<number>("temperature", 0.1),
			),
			topP: ConfigManager.validateTopP(config.get<number>("topP", 1.0)),
			maxTokens: ConfigManager.validateMaxTokens(
				config.get<number>("maxTokens", 256000),
			),
			rememberLastModel: config.get<boolean>("rememberLastModel", true),
			zhipu: {
				search: {
					enableMCP: config.get<boolean>("zhipu.search.enableMCP", true), // Default enable MCP mode (Coding Plan exclusive)
				},
				endpoint: config.get<ZhipuConfig["endpoint"]>(
					"zhipu.endpoint",
					"open.bigmodel.cn",
				),
			},
			minimax: {
				endpoint: config.get<MiniMaxConfig["endpoint"]>(
					"minimax.endpoint",
					"minimaxi.com",
				),
			},
			fimCompletion: {
				enabled: config.get<boolean>("fimCompletion.enabled", false),
				debounceMs: ConfigManager.validateNESDebounceMs(
					config.get<number>("fimCompletion.debounceMs", 500),
				),
				timeoutMs: ConfigManager.validateNESTimeoutMs(
					config.get<number>("fimCompletion.timeoutMs", 5000),
				),
				modelConfig: {
					provider: config.get<string>(
						"fimCompletion.modelConfig.provider",
						"",
					),
					baseUrl: config.get<string>("fimCompletion.modelConfig.baseUrl", ""),
					model: config.get<string>("fimCompletion.modelConfig.model", ""),
					maxTokens: ConfigManager.validateNESMaxTokens(
						config.get<number>("fimCompletion.modelConfig.maxTokens", 200),
					),
					extraBody: config.get("fimCompletion.modelConfig.extraBody"),
				},
			},
			nesCompletion: {
				enabled: config.get<boolean>("nesCompletion.enabled", false),
				debounceMs: ConfigManager.validateNESDebounceMs(
					config.get<number>("nesCompletion.debounceMs", 500),
				),
				timeoutMs: ConfigManager.validateNESTimeoutMs(
					config.get<number>("nesCompletion.timeoutMs", 5000),
				),
				manualOnly: config.get<boolean>("nesCompletion.manualOnly", false),
				modelConfig: {
					provider: config.get<string>(
						"nesCompletion.modelConfig.provider",
						"",
					),
					baseUrl: config.get<string>("nesCompletion.modelConfig.baseUrl", ""),
					model: config.get<string>("nesCompletion.modelConfig.model", ""),
					maxTokens: ConfigManager.validateNESMaxTokens(
						config.get<number>("nesCompletion.modelConfig.maxTokens", 200),
					),
					extraBody: config.get("nesCompletion.modelConfig.extraBody"),
				},
			},
			providerOverrides: config.get<UserConfigOverrides>(
				"providerOverrides",
				{},
			),
		};

		Logger.debug("Configuration loaded", ConfigManager.cache);
		return ConfigManager.cache;
	}

	/**
	 * Get temperature parameter
	 */
	static getTemperature(): number {
		return ConfigManager.getConfig().temperature;
	}

	/**
	 * Get Top-p parameter
	 */
	static getTopP(): number {
		return ConfigManager.getConfig().topP;
	}

	/**
	 * Get maximum token count
	 */
	static getMaxTokens(): number {
		return ConfigManager.getConfig().maxTokens;
	}

	/**
	 * Get whether to remember last selected model
	 */
	static getRememberLastModel(): boolean {
		return ConfigManager.getConfig().rememberLastModel;
	}

	/**
	 * Get ZhipuAI search configuration
	 */
	static getZhipuSearchConfig(): ZhipuSearchConfig {
		return ConfigManager.getConfig().zhipu.search;
	}

	/**
	 * Get ZhipuAI unified configuration
	 */
	static getZhipuConfig(): ZhipuConfig {
		return ConfigManager.getConfig().zhipu;
	}

	/**
	 * Get ZhipuAI access point configuration
	 * @returns 'open.bigmodel.cn' or 'api.z.ai', default 'open.bigmodel.cn'
	 */
	static getZhipuEndpoint(): "open.bigmodel.cn" | "api.z.ai" {
		return ConfigManager.getConfig().zhipu.endpoint;
	}

	/**
	 * Get MiniMax Coding Plan access point configuration
	 * @returns 'minimaxi.com' or 'minimax.io', default 'minimaxi.com'
	 */
	static getMinimaxEndpoint(): "minimaxi.com" | "minimax.io" {
		return ConfigManager.getConfig().minimax.endpoint;
	}

	/**
	 * Get FIM completion configuration
	 */
	static getFIMConfig(): FIMCompletionConfig {
		return ConfigManager.getConfig().fimCompletion;
	}

	/**
	 * Get NES completion configuration
	 */
	static getNESConfig(): NESCompletionConfig {
		return ConfigManager.getConfig().nesCompletion;
	}

	/**
	 * Get maximum token count suitable for model
	 * Consider model limits and user configuration
	 */
	static getMaxTokensForModel(modelMaxTokens: number): number {
		const configMaxTokens = ConfigManager.getMaxTokens();
		return Math.min(modelMaxTokens, configMaxTokens);
	}

	/**
	 * Validate temperature parameter
	 */
	private static validateTemperature(value: number): number {
		if (Number.isNaN(value) || value < 0 || value > 2) {
			Logger.warn(
				`Invalid temperature value: ${value}, using default value 0.1`,
			);
			return 0.1;
		}
		return value;
	}

	/**
	 * Validate Top-p parameter
	 */
	private static validateTopP(value: number): number {
		if (Number.isNaN(value) || value < 0 || value > 1) {
			Logger.warn(`Invalid topP value: ${value}, using default value 1.0`);
			return 1.0;
		}
		return value;
	}

	/**
	 * Validate maximum token count
	 */
	private static validateMaxTokens(value: number): number {
		if (Number.isNaN(value) || value < 32 || value > 256000) {
			Logger.warn(
				`Invalid maxTokens value: ${value}, using default value 8192`,
			);
			return 8192;
		}
		return Math.floor(value);
	}

	/**
	 * Validate debounce delay time
	 */
	private static validateNESDebounceMs(value: number): number {
		if (Number.isNaN(value) || value < 50 || value > 2000) {
			Logger.warn(
				`Invalid debounceMs value: ${value}, using default value 500`,
			);
			return 500;
		}
		return Math.floor(value);
	}

	/**
	 * Validate timeout time
	 */
	private static validateNESTimeoutMs(value: number): number {
		if (Number.isNaN(value) || value < 1000 || value > 30000) {
			Logger.warn(
				`Invalid timeoutMs value: ${value}, using default value 5000`,
			);
			return 5000;
		}
		return Math.floor(value);
	}

	/**
	 * Validate NES completion's maxTokens parameter
	 */
	private static validateNESMaxTokens(value: number): number {
		if (Number.isNaN(value) || value < 50 || value > 16000) {
			Logger.warn(
				`Invalid NES maxTokens value: ${value}, using default value 200`,
			);
			return 200;
		}
		return Math.floor(value);
	}

	/**
	 * Get provider configuration (new mode: directly import configProviders)
	 */
	static getConfigProvider(): ConfigProvider {
		return configProviders;
	}

	/**
	 * Get configuration override settings
	 */
	static getProviderOverrides(): UserConfigOverrides {
		return ConfigManager.getConfig().providerOverrides;
	}

	/**
	 * Apply configuration override to original provider configuration
	 */
	static applyProviderOverrides(
		providerKey: string,
		originalConfig: ProviderConfig,
	): ProviderConfig {
		const overrides = ConfigManager.getProviderOverrides();
		const override = overrides[providerKey];

		if (!override) {
			return originalConfig;
		}

		Logger.info(`Applying provider ${providerKey} configuration override`);

		// Create deep copy of configuration
		const config: ProviderConfig = JSON.parse(JSON.stringify(originalConfig));

		// Apply provider-level override
		if (override.baseUrl) {
			config.baseUrl = override.baseUrl;
			Logger.debug(`  Override baseUrl: ${override.baseUrl}`);
		}

		// Apply model-level override
		if (override.models && override.models.length > 0) {
			for (const modelOverride of override.models) {
				const existingModelIndex = config.models.findIndex(
					(m) => m.id === modelOverride.id,
				);
				if (existingModelIndex >= 0) {
					// Override existing model
					const existingModel = config.models[existingModelIndex];
					if (modelOverride.model !== undefined) {
						existingModel.model = modelOverride.model;
						Logger.debug(
							`  Model ${modelOverride.id}: Override model = ${modelOverride.model}`,
						);
					}
					if (modelOverride.maxInputTokens !== undefined) {
						existingModel.maxInputTokens = modelOverride.maxInputTokens;
						Logger.debug(
							`  Model ${modelOverride.id}: Override maxInputTokens = ${modelOverride.maxInputTokens}`,
						);
					}
					if (modelOverride.maxOutputTokens !== undefined) {
						existingModel.maxOutputTokens = modelOverride.maxOutputTokens;
						Logger.debug(
							`  Model ${modelOverride.id}: Override maxOutputTokens = ${modelOverride.maxOutputTokens}`,
						);
					}
					// Override sdkMode
					if (modelOverride.sdkMode !== undefined) {
						existingModel.sdkMode = modelOverride.sdkMode;
						Logger.debug(
							`  Model ${modelOverride.id}: Override sdkMode = ${modelOverride.sdkMode}`,
						);
					}
					if (modelOverride.baseUrl !== undefined) {
						existingModel.baseUrl = modelOverride.baseUrl;
						Logger.debug(
							`  Model ${modelOverride.id}: Override baseUrl = ${modelOverride.baseUrl}`,
						);
					}
					// Merge capabilities
					if (modelOverride.capabilities) {
						existingModel.capabilities = {
							...existingModel.capabilities,
							...modelOverride.capabilities,
						};
						Logger.debug(
							`  Model ${modelOverride.id}: Merge capabilities = ${JSON.stringify(existingModel.capabilities)}`,
						);
					}
					// Merge customHeader (model level takes priority over provider level)
					if (modelOverride.customHeader) {
						existingModel.customHeader = {
							...existingModel.customHeader,
							...modelOverride.customHeader,
						};
						Logger.debug(
							`  Model ${modelOverride.id}: Merge customHeader = ${JSON.stringify(existingModel.customHeader)}`,
						);
					}
					// Merge extraBody
					if (modelOverride.extraBody) {
						existingModel.extraBody = {
							...existingModel.extraBody,
							...modelOverride.extraBody,
						};
						Logger.debug(
							`  Model ${modelOverride.id}: Merge extraBody = ${JSON.stringify(existingModel.extraBody)}`,
						);
					}
					// Override outputThinking
					if (modelOverride.outputThinking !== undefined) {
						existingModel.outputThinking = modelOverride.outputThinking;
						Logger.debug(
							`  Model ${modelOverride.id}: Override outputThinking = ${modelOverride.outputThinking}`,
						);
					}
				} else {
					const fullConfig = modelOverride as ModelConfig;
					// Add new model
					const newModel: ModelConfig = {
						id: modelOverride.id,
						name: fullConfig?.name || modelOverride.id, // Default use ID as name
						tooltip:
							fullConfig?.tooltip || `User custom model: ${modelOverride.id}`,
						maxInputTokens: modelOverride.maxInputTokens || 128000,
						maxOutputTokens: modelOverride.maxOutputTokens || 8192,
						capabilities: {
							toolCalling: modelOverride.capabilities?.toolCalling ?? false,
							imageInput: modelOverride.capabilities?.imageInput ?? false,
						},
						...(modelOverride.model && { model: modelOverride.model }),
						...(modelOverride.sdkMode && { sdkMode: modelOverride.sdkMode }),
						...(modelOverride.baseUrl && { baseUrl: modelOverride.baseUrl }),
						...(modelOverride.customHeader && {
							customHeader: modelOverride.customHeader,
						}),
						...(modelOverride.extraBody && {
							extraBody: modelOverride.extraBody,
						}),
						...(modelOverride.outputThinking !== undefined && {
							outputThinking: modelOverride.outputThinking,
						}),
					};
					config.models.push(newModel);
					Logger.info(`  Add new model: ${modelOverride.id}`);
				}
			}
		}

		// Merge provider-level customHeader into all models (model level customHeader takes priority)
		if (override.customHeader) {
			for (const model of config.models) {
				if (model.customHeader) {
					// If model already has customHeader, provider level as default merge
					model.customHeader = {
						...override.customHeader,
						...model.customHeader,
					};
				} else {
					// If model doesn't have customHeader, use provider level directly
					model.customHeader = { ...override.customHeader };
				}
			}
			Logger.debug(
				`  Provider ${providerKey}: Merge provider level customHeader into all models`,
			);
		}

		return config;
	}

	/**
	 * Clean up resources
	 */
	static dispose(): void {
		if (ConfigManager.configListener) {
			ConfigManager.configListener.dispose();
			ConfigManager.configListener = null;
		}
		ConfigManager.cache = null;
		Logger.trace("Configuration manager disposed");
	}
}
