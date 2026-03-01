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
	/** Provider icon for settings and UI metadata */
	icon?: string;
	/** Provider ordering index for settings and UI metadata */
	order?: number;
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
export const KnownProviders: Record<string, KnownProviderConfig> = {
	antigravity: {
		displayName: "Antigravity",
		description: "Google Cloud Code integration",
		icon: "☁️",
		order: 10,
		settingsPrefix: "chp.antigravity",
	},
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
	codex: {
		displayName: "Codex",
		description: "OpenAI Codex specialized coding provider",
		icon: "🤖",
		order: 20,
		settingsPrefix: "chp.codex",
	},
	zhipu: {
		displayName: "Zhipu AI",
		description: "GLM family models and coding plan features",
		icon: "🧠",
		order: 30,
		settingsPrefix: "chp.zhipu",
		specializedFactory: true,
	},
	moonshot: {
		displayName: "Moonshot AI",
		description: "MoonshotAI Kimi model family",
		icon: "🌙",
		order: 40,
		settingsPrefix: "chp.moonshot",
		specializedFactory: true,
	},
	minimax: {
		displayName: "MiniMax",
		description: "MiniMax family models with coding endpoint options",
		icon: "⚡",
		order: 50,
		settingsPrefix: "chp.minimax",
		specializedFactory: true,
	},
	deepseek: {
		displayName: "DeepSeek",
		description: "DeepSeek model family",
		icon: "🔍",
		order: 60,
		settingsPrefix: "chp.deepseek",
	},
	modelscope: { displayName: "ModelScope" },
	openrouter: { displayName: "OpenRouter" },
	siliconflow: { displayName: "SiliconFlow" },
	tbox: { displayName: "Bailian" },
	chutes: {
		displayName: "Chutes",
		description: "Chutes AI endpoint integration",
		icon: "📦",
		order: 100,
		settingsPrefix: "chp.chutes",
		specializedFactory: true,
	},
	opencode: {
		displayName: "OpenCode",
		description: "OpenCode endpoint integration",
		icon: "🧩",
		order: 110,
		settingsPrefix: "chp.opencode",
		specializedFactory: true,
	},
	blackbox: {
		displayName: "Blackbox AI",
		description: "Blackbox AI - works without API key",
		icon: "⬛",
		order: 120,
		settingsPrefix: "chp.blackbox",
		specializedFactory: true,
		openai: { baseUrl: "https://oi-vscode-server-985058387028.europe-west1.run.app" }
	},
	chatjimmy: {
		displayName: "ChatJimmy",
		description: "ChatJimmy - free public API, no auth required",
		icon: "💬",
		order: 125,
		settingsPrefix: "chp.chatjimmy",
	},
	huggingface: {
		displayName: "Hugging Face",
		description: "Hugging Face Router endpoint integration",
		icon: "🤗",
		order: 130,
		settingsPrefix: "chp.huggingface",
		specializedFactory: true,
	},
	lightningai: {
		displayName: "Lightning AI",
		description: "LightningAI endpoint integration",
		icon: "⚡",
		order: 140,
		settingsPrefix: "chp.lightningai",
		specializedFactory: true,
		openai: {
			baseUrl: "https://lightning.ai/api/v1",
		},
	},
	kilo: {
		displayName: "Kilo AI",
		icon: "⚙️",
		order: 145,
		settingsPrefix: "chp.kilo",
		specializedFactory: true,
		openai: {
			baseUrl: "https://api.kilo.ai/api/gateway",
		},
	},
	zenmux: {
		displayName: "Zenmux",
		description: "Zenmux endpoint integration",
		icon: "🧬",
		order: 150,
		settingsPrefix: "chp.zenmux",
		specializedFactory: true,
		openai: {
			baseUrl: "https://zenmux.ai/api/v1",
		},
	},
	deepinfra: {
		displayName: "DeepInfra",
		description: "OpenAI-compatible endpoints from DeepInfra",
		icon: "🛰️",
		order: 70,
		settingsPrefix: "chp.deepinfra",
		specializedFactory: true,
		openai: {
			baseUrl: "https://api.deepinfra.com/v1/openai",
		},
	},
	nvidia: {
		displayName: "NVIDIA NIM",
		description: "NVIDIA NIM hosted model endpoints",
		icon: "🟢",
		order: 80,
		settingsPrefix: "chp.nvidia",
		specializedFactory: true,
		openai: {
			baseUrl: "https://integrate.api.nvidia.com/v1",
		},
	},
	mistral: {
		displayName: "Mistral AI",
		description: "Mistral AI model endpoints",
		icon: "🌪️",
		order: 90,
		settingsPrefix: "chp.mistral",
		specializedFactory: true,
		openai: {
			baseUrl: "https://api.mistral.ai/v1",
		},
	},
	qwencli: {
		displayName: "Qwen Code CLI",
		description: "Qwen CLI OAuth provider",
		icon: "🪄",
		order: 160,
		settingsPrefix: "chp.qwencli",
		specializedFactory: true,
	},
	geminicli: {
		displayName: "Gemini CLI",
		description: "Gemini CLI OAuth provider",
		icon: "💎",
		order: 170,
		settingsPrefix: "chp.geminicli",
		specializedFactory: true,
	},
	ollama: {
		displayName: "Ollama",
		description:
			"Ollama - use Ollama's OpenAI compatible API (v1/chat/completions)",
		icon: "🦙",
		order: 180,
		settingsPrefix: "chp.ollama",
		specializedFactory: true,
	},
	compatible: {
		displayName: "OpenAI/Anthropic Compatible",
		description: "Custom OpenAI/Anthropic compatible models",
		icon: "🔌",
		order: 190,
		settingsPrefix: "chp.compatibleModels",
	},
};

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

const specializedProviderFactories: Record<string, ProviderFactory> = {
	zhipu: async (context, providerKey, providerConfig) => {
		const { ZhipuProvider } = await import("../providers/zhipu/zhipuProvider.js");
		return ZhipuProvider.createAndActivate(context, providerKey, providerConfig);
	},
	minimax: async (context, providerKey, providerConfig) => {
		const { MiniMaxProvider } = await import("../providers/minimax/minimaxProvider.js");
		return MiniMaxProvider.createAndActivate(context, providerKey, providerConfig);
	},
	chutes: async (context, providerKey, providerConfig) => {
		const { ChutesProvider } = await import("../providers/chutes/chutesProvider.js");
		return ChutesProvider.createAndActivate(context, providerKey, providerConfig);
	},
	zenmux: async (context, providerKey, providerConfig) => {
		const { ZenmuxProvider } = await import("../providers/zenmux/provider.js");
		return ZenmuxProvider.createAndActivate(context, providerKey, providerConfig);
	},
	lightningai: async (context, providerKey, providerConfig) => {
		const { LightningAIProvider } = await import("../providers/lightningai/provider.js");
		return LightningAIProvider.createAndActivate(
			context,
			providerKey,
			providerConfig,
		);
	},
	opencode: async (context, providerKey, providerConfig) => {
		const { OpenCodeProvider } = await import("../providers/opencode/opencodeProvider.js");
		return OpenCodeProvider.createAndActivate(context, providerKey, providerConfig);
	},
	qwencli: async (context, providerKey, providerConfig) => {
		const { QwenCliProvider } = await import("../providers/qwencli/provider.js");
		return QwenCliProvider.createAndActivate(context, providerKey, providerConfig);
	},
	geminicli: async (context, providerKey, providerConfig) => {
		const { GeminiCliProvider } = await import("../providers/geminicli/provider.js");
		return GeminiCliProvider.createAndActivate(context, providerKey, providerConfig);
	},
	huggingface: async (context, providerKey, providerConfig) => {
		const { HuggingfaceProvider } = await import("../providers/huggingface/provider.js");
		return HuggingfaceProvider.createAndActivate(
			context,
			providerKey,
			providerConfig,
		);
	},
	kilo: async (context, providerKey, providerConfig) => {
		const { KiloProvider } = await import("../providers/kilo/provider.js");
		return KiloProvider.createAndActivate(context, providerKey, providerConfig);
	},
	deepinfra: async (context, providerKey, providerConfig) => {
		const { DeepInfraProvider } = await import("../providers/deepinfra/deepinfraProvider.js");
		return DeepInfraProvider.createAndActivate(
			context,
			providerKey,
			providerConfig,
		);
	},
	mistral: async (context, providerKey, providerConfig) => {
		const { MistralProvider } = await import("../providers/mistral/mistralProvider.js");
		return MistralProvider.createAndActivate(context, providerKey, providerConfig);
	},
	moonshot: async (context, providerKey, providerConfig) => {
		const { MoonshotProvider } = await import("../providers/moonshot/moonshotProvider.js");
		return MoonshotProvider.createAndActivate(context, providerKey, providerConfig);
	},
	nvidia: async (context, providerKey, providerConfig) => {
		const { NvidiaProvider } = await import("../providers/nvidia/index.js");
		return NvidiaProvider.createAndActivate(context, providerKey, providerConfig);
	},
	ollama: async (context, providerKey, providerConfig) => {
		const { OllamaProvider } = await import("../providers/ollama/index.js");
		return OllamaProvider.createAndActivate(context, providerKey, providerConfig);
	},
	blackbox: async (context, providerKey, providerConfig) => {
		const { BlackboxProvider } = await import("../providers/blackbox/index.js");
		return BlackboxProvider.createAndActivate(context, providerKey, providerConfig);
	},
};

async function registerProvider(
	context: vscode.ExtensionContext,
	providerKey: string,
	providerConfig: ProviderConfig,
): Promise<
	| {
			providerKey: string;
			provider: RegisteredProvider;
			disposables: vscode.Disposable[];
	  }
	| null
> {
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
					knownProvider?.displayName || providerConfig.displayName || providerId,
				category: resolveCategory(providerId, features),
				sdkMode: getSdkMode(providerId),
				description: knownProvider?.description,
				icon: knownProvider?.icon || "🤖",
				settingsPrefix: knownProvider?.settingsPrefix || `chp.${providerId}`,
				baseUrl:
					providerConfig.baseUrl ||
					knownProvider?.baseUrl ||
					knownProvider?.openai?.baseUrl,
				features,
				order: knownProvider?.order || 999,
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
			icon: compatibleProvider?.icon || "🔌",
			settingsPrefix:
				compatibleProvider?.settingsPrefix || "chp.compatibleModels",
			baseUrl: "",
			features: getDefaultFeatures(ProviderKey.Compatible),
			order: compatibleProvider?.order || 999,
		});
	}

	metadata.sort(
		(a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName),
	);
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
