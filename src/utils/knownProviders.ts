import * as vscode from "vscode";
import { AccountManager } from "../accounts/accountManager";
import { configProviders } from "../providers/config";
import {
	ProviderCategory,
	ProviderKey,
	type ProviderMetadata,
} from "../types/providerKeys";
import type {
	ConfigProvider,
	ModelConfig,
	ModelOverride,
	ProviderConfig,
	ProviderOverride,
} from "../types/sharedTypes";
import { Logger } from "./logger";

export interface KnownProviderConfig
	extends Partial<ProviderConfig & ProviderOverride> {
	/** Compatibility strategy for OpenAI SDK */
	openai?: Omit<ModelOverride, "id">;
	/** Compatibility strategy for Anthropic SDK */
	anthropic?: Omit<ModelOverride, "id">;
	/** Provider description for settings and UI metadata */
	description?: string;
	/** Provider settings prefix override */
	settingsPrefix?: string;
	/** Whether provider uses a specialized provider implementation */
	specializedFactory?: boolean;
}

/**
 * Central provider registry and compatibility adaptation information
 *
 * Priority when merging model configurations: Model Config > Provider Config > Known Provider Config
 * Merged parameters handled include:
 *   - customHeader,
 *   - override.extraBody
 *
 * This file is the single source of truth for provider metadata shared by:
 *   - compatible model flows
 *   - provider metadata registry
 *   - provider factory specialized-provider capability checks
 *
 * @static
 * @type {(Record<string, KnownProviderConfig>)}
 * @memberof CompatibleModelManager
 */
const SPECIALIZED_PROVIDER_KEYS = new Set<string>([
	"blackbox",
	"chutes",
	"deepinfra",
	"geminicli",
	"huggingface",
	"kilo",
	"lightningai",
	"minimax",
	"mistral",
	"moonshot",
	"nvidia",
	"ollama",
	"opencode",
	"qwencli",
	"zenmux",
	"zhipu",
]);

const knownProviderOverrides: Record<string, KnownProviderConfig> = {
	aihubmix: {
		displayName: "AIHubMix",
		customHeader: { "APP-Code": "TFUV4759" },
		openai: {
			baseUrl: "https://aihubmix.com/v1",
		},
		anthropic: {
			baseUrl: "https://aihubmix.com",
			extraBody: {
				top_p: null,
			},
		},
	},
	aiping: { displayName: "AIPing" },
	antigravity: {
		description: "Google Cloud Code integration",
	},
	blackbox: {
		description: "Blackbox AI - works without API key",
	},
	chatjimmy: {
		description: "ChatJimmy - free public API, no auth required",
	},
	chutes: {
		description: "Chutes AI endpoint integration",
	},
	codex: {
		description: "OpenAI Codex specialized coding provider",
	},
	compatible: {
		displayName: "OpenAI/Anthropic Compatible",
		description: "Custom OpenAI/Anthropic compatible models",
		settingsPrefix: "chp.compatibleModels",
	},
	deepinfra: {
		description: "OpenAI-compatible endpoints from DeepInfra",
	},
	deepseek: {
		description: "DeepSeek model family",
	},
	geminicli: {
		description: "Gemini CLI OAuth provider",
	},
	huggingface: {
		description: "Hugging Face Router endpoint integration",
	},
	kilo: {
		description: "Kilo AI endpoint integration",
	},
	lightningai: {
		description: "LightningAI endpoint integration",
	},
	minimax: {
		description: "MiniMax family models with coding endpoint options",
	},
	mistral: {
		description: "Mistral AI model endpoints",
	},
	modelscope: { displayName: "ModelScope" },
	moonshot: {
		description: "MoonshotAI Kimi model family",
	},
	nvidia: {
		description: "NVIDIA NIM hosted model endpoints",
	},
	ollama: {
		description:
			"Ollama - use Ollama's OpenAI compatible API (v1/chat/completions)",
	},
	opencode: {
		description: "OpenCode endpoint integration",
	},
	openrouter: { displayName: "OpenRouter" },
	qwencli: {
		description: "Qwen CLI OAuth provider",
	},
	siliconflow: { displayName: "SiliconFlow" },
	tbox: { displayName: "Bailian" },
	zenmux: {
		description: "Zenmux endpoint integration",
	},
	zhipu: {
		displayName: "Zhipu AI",
		description: "GLM family models and coding plan features",
	},
};

export const KnownProviders: Record<string, KnownProviderConfig> =
	Object.fromEntries(
		Object.entries(knownProviderOverrides)
			.sort((left, right) => left[0].localeCompare(right[0]))
			.map(([providerId, config]) => {
				const normalizedConfig: KnownProviderConfig = { ...config };
				if (normalizedConfig.specializedFactory === undefined) {
					normalizedConfig.specializedFactory =
						SPECIALIZED_PROVIDER_KEYS.has(providerId);
				}
				return [providerId, normalizedConfig];
			}),
	);

export type RegisteredProvider = {
	dispose?: () => void;
};

interface ProviderFactoryResult {
	provider: RegisteredProvider;
	disposables: vscode.Disposable[];
}

type ProviderFactory = (
	context: vscode.ExtensionContext,
	providerKey: string,
	providerConfig: ProviderConfig,
) => Promise<ProviderFactoryResult>;

type ProviderFactoryModule = Record<string, unknown>;

function createLazyFactory(
	loadFactoryModule: () => Promise<ProviderFactoryModule>,
	exportName: string,
): ProviderFactory {
	return async (context, providerKey, providerConfig) => {
		const providerModule = await loadFactoryModule();
		const providerFactory = providerModule[exportName] as {
			createAndActivate: (
				context: vscode.ExtensionContext,
				providerKey: string,
				providerConfig: ProviderConfig,
			) => ProviderFactoryResult;
		};
		return providerFactory.createAndActivate(
			context,
			providerKey,
			providerConfig,
		);
	};
}

const specializedProviderFactories: Record<string, ProviderFactory> = {
	blackbox: createLazyFactory(
		() => import("../providers/blackbox/index.js"),
		"BlackboxProvider",
	),
	chutes: createLazyFactory(
		() => import("../providers/chutes/chutesProvider.js"),
		"ChutesProvider",
	),
	deepinfra: createLazyFactory(
		() => import("../providers/deepinfra/deepinfraProvider.js"),
		"DeepInfraProvider",
	),
	geminicli: createLazyFactory(
		() => import("../providers/geminicli/provider.js"),
		"GeminiCliProvider",
	),
	huggingface: createLazyFactory(
		() => import("../providers/huggingface/provider.js"),
		"HuggingfaceProvider",
	),
	kilo: createLazyFactory(
		() => import("../providers/kilo/provider.js"),
		"KiloProvider",
	),
	lightningai: createLazyFactory(
		() => import("../providers/lightningai/provider.js"),
		"LightningAIProvider",
	),
	minimax: createLazyFactory(
		() => import("../providers/minimax/minimaxProvider.js"),
		"MiniMaxProvider",
	),
	mistral: createLazyFactory(
		() => import("../providers/mistral/mistralProvider.js"),
		"MistralProvider",
	),
	moonshot: createLazyFactory(
		() => import("../providers/moonshot/moonshotProvider.js"),
		"MoonshotProvider",
	),
	nvidia: createLazyFactory(
		() => import("../providers/nvidia/index.js"),
		"NvidiaProvider",
	),
	ollama: createLazyFactory(
		() => import("../providers/ollama/index.js"),
		"OllamaProvider",
	),
	opencode: createLazyFactory(
		() => import("../providers/opencode/opencodeProvider.js"),
		"OpenCodeProvider",
	),
	qwencli: createLazyFactory(
		() => import("../providers/qwencli/provider.js"),
		"QwenCliProvider",
	),
	zenmux: createLazyFactory(
		() => import("../providers/zenmux/provider.js"),
		"ZenmuxProvider",
	),
	zhipu: createLazyFactory(
		() => import("../providers/zhipu/zhipuProvider.js"),
		"ZhipuProvider",
	),
};

async function registerProvider(
	context: vscode.ExtensionContext,
	providerKey: string,
	providerConfig: ProviderConfig,
): Promise<{
	providerKey: string;
	provider: RegisteredProvider;
	disposables: vscode.Disposable[];
} | null> {
	try {
		const providerDisplayName =
			providerConfig.displayName ||
			KnownProviders[providerKey]?.displayName ||
			providerKey;

		Logger.trace(
			`Registering provider: ${providerDisplayName} (${providerKey})`,
		);
		const startTime = Date.now();

		const specializedFactory = specializedProviderFactories[providerKey];
		let result: ProviderFactoryResult;

		if (specializedFactory) {
			result = await specializedFactory(context, providerKey, providerConfig);
		} else {
			const { GenericModelProvider } = await import(
				"../providers/common/genericModelProvider.js"
			);
			result = GenericModelProvider.createAndActivate(
				context,
				providerKey,
				providerConfig,
			);
		}

		const elapsed = Date.now() - startTime;
		Logger.info(
			`${providerDisplayName} provider registered successfully (time: ${elapsed}ms)`,
		);

		return {
			providerKey,
			provider: result.provider,
			disposables: result.disposables,
		};
	} catch (error) {
		Logger.error(`Failed to register provider ${providerKey}:`, error);
		return null;
	}
}

export async function registerProvidersFromConfig(
	context: vscode.ExtensionContext,
	configProvider: ConfigProvider,
	excludeKeys: string[] = [],
): Promise<{
	providers: Record<string, RegisteredProvider>;
	disposables: vscode.Disposable[];
}> {
	const startTime = Date.now();
	const registeredProviders: Record<string, RegisteredProvider> = {};
	const registeredDisposables: vscode.Disposable[] = [];

	const providerEntries = Object.entries(configProvider).filter(
		([providerKey]) => !excludeKeys.includes(providerKey),
	);

	Logger.info(
		`⏱️ Starting parallel registration of ${providerEntries.length} providers...`,
	);

	const registrationPromises = providerEntries.map(
		async ([providerKey, providerConfig]) =>
			registerProvider(context, providerKey, providerConfig),
	);

	const results = await Promise.all(registrationPromises);

	for (const result of results) {
		if (result) {
			registeredProviders[result.providerKey] = result.provider;
			registeredDisposables.push(...result.disposables);
		}
	}

	const totalTime = Date.now() - startTime;
	const successCount = results.filter((result) => result !== null).length;
	Logger.info(
		`⏱️ Provider registration completed: ${successCount}/${providerEntries.length} successful (total time: ${totalTime}ms)`,
	);

	return { providers: registeredProviders, disposables: registeredDisposables };
}

export function getRegisteredProviderKeys(): string[] {
	return Object.entries(KnownProviders)
		.filter(
			([providerKey, providerConfig]) =>
				providerConfig.specializedFactory === true &&
				providerKey in specializedProviderFactories,
		)
		.map(([providerKey]) => providerKey);
}

export function hasSpecializedProvider(providerKey: string): boolean {
	return (
		KnownProviders[providerKey]?.specializedFactory === true &&
		providerKey in specializedProviderFactories
	);
}

function toProviderKey(providerId: string): ProviderKey | undefined {
	const values = Object.values(ProviderKey) as string[];
	if (values.includes(providerId)) {
		return providerId as ProviderKey;
	}
	return undefined;
}

function getSdkMode(providerId: string): "openai" | "anthropic" | "mixed" {
	if (providerId === ProviderKey.Compatible) {
		return "mixed";
	}

	const providerConfig = (
		configProviders as Record<string, { models: ModelConfig[] }>
	)[providerId];
	const modes = new Set<string>(
		(providerConfig?.models || []).map((model) => model.sdkMode || "openai"),
	);
	const hasAnthropic = modes.has("anthropic");
	const hasOpenAI = modes.has("openai");

	if (hasAnthropic && hasOpenAI) {
		return "mixed";
	}
	if (hasAnthropic) {
		return "anthropic";
	}
	return "openai";
}

function resolveCategory(
	providerId: string,
	features: ProviderMetadata["features"],
): ProviderCategory {
	const isOAuthProvider =
		providerId === ProviderKey.Codex ||
		providerId === ProviderKey.Antigravity ||
		providerId === ProviderKey.QwenCli ||
		providerId === ProviderKey.GeminiCli;

	if (features.supportsOAuth && !features.supportsApiKey) {
		return ProviderCategory.OAuth;
	}

	if (isOAuthProvider && features.supportsOAuth) {
		return ProviderCategory.OAuth;
	}

	const sdkMode = getSdkMode(providerId);
	if (sdkMode === "anthropic") {
		return ProviderCategory.Anthropic;
	}

	return ProviderCategory.OpenAI;
}

function getDefaultFeatures(providerId: string): ProviderMetadata["features"] {
	const accountConfig = AccountManager.getProviderConfig(providerId);
	const isNoConfigProvider =
		providerId === ProviderKey.QwenCli ||
		providerId === ProviderKey.GeminiCli ||
		providerId === ProviderKey.Blackbox ||
		providerId === "chatjimmy";
	const isCodex = providerId === ProviderKey.Codex;
	const isAntigravity = providerId === ProviderKey.Antigravity;
	const isCompatible = providerId === ProviderKey.Compatible;
	return {
		supportsApiKey:
			(accountConfig.supportsApiKey && !isNoConfigProvider) ||
			isCodex ||
			isCompatible,
		supportsOAuth: accountConfig.supportsOAuth || isCodex || isAntigravity,
		supportsMultiAccount: accountConfig.supportsMultiAccount,
		supportsBaseUrl: !isNoConfigProvider && !isCodex && !isAntigravity,
		supportsConfigWizard: !isNoConfigProvider || isCodex || isAntigravity,
	};
}

let providerRegistryCache: ProviderMetadata[] | null = null;

export function getAllProviders(): ProviderMetadata[] {
	if (providerRegistryCache) {
		return providerRegistryCache;
	}

	const metadata: ProviderMetadata[] = Object.entries(configProviders).map(
		([providerId, providerConfig]) => {
			const knownProvider = KnownProviders[providerId];
			const features = getDefaultFeatures(providerId);
			return {
				id: providerId,
				key: toProviderKey(providerId),
				displayName:
					knownProvider?.displayName ||
					providerConfig.displayName ||
					providerId,
				category: resolveCategory(providerId, features),
				sdkMode: getSdkMode(providerId),
				description: knownProvider?.description,
				settingsPrefix: knownProvider?.settingsPrefix || `chp.${providerId}`,
				baseUrl:
					providerConfig.baseUrl ||
					knownProvider?.baseUrl ||
					knownProvider?.openai?.baseUrl,
				features,
				order: 0,
			};
		},
	);

	if (!metadata.some((provider) => provider.id === ProviderKey.Compatible)) {
		const compatibleProvider = KnownProviders[ProviderKey.Compatible];
		metadata.push({
			id: ProviderKey.Compatible,
			key: ProviderKey.Compatible,
			displayName:
				compatibleProvider?.displayName || "OpenAI/Anthropic Compatible",
			category: ProviderCategory.OpenAI,
			sdkMode: "mixed",
			description: compatibleProvider?.description,
			settingsPrefix:
				compatibleProvider?.settingsPrefix || "chp.compatibleModels",
			baseUrl: "",
			features: getDefaultFeatures(ProviderKey.Compatible),
			order: 0,
		});
	}

	metadata.sort((a, b) => a.id.localeCompare(b.id));
	for (const [index, provider] of metadata.entries()) {
		provider.order = index + 1;
	}
	providerRegistryCache = metadata;
	return metadata;
}

export function getProvidersByCategory(
	category: ProviderCategory,
): ProviderMetadata[] {
	return getAllProviders().filter((provider) => provider.category === category);
}

export function getProvider(providerId: string): ProviderMetadata | undefined {
	return getAllProviders().find((provider) => provider.id === providerId);
}

export const ProviderRegistry = {
	getAllProviders,
	getProvidersByCategory,
	getProvider,
};
