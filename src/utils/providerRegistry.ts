import { AccountManager } from "../accounts/accountManager";
import { configProviders } from "../providers/config";
import {
	ProviderCategory,
	ProviderKey,
	type ProviderMetadata,
} from "../types/providerKeys";
import type { ModelConfig } from "../types/sharedTypes";

const providerOrderMap: Record<string, number> = {
	antigravity: 10,
	codex: 20,
	zhipu: 30,
	moonshot: 40,
	minimax: 50,
	deepseek: 60,
	deepinfra: 70,
	nvidia: 80,
	mistral: 90,
	chutes: 100,
	opencode: 110,
	blackbox: 120,
	huggingface: 130,
	lightningai: 140,
	zenmux: 150,
	qwencli: 160,
	geminicli: 170,
	ollama: 180,
	compatible: 190,
};

const providerDescriptionMap: Record<string, string> = {
	antigravity: "Google Cloud Code integration",
	codex: "OpenAI Codex specialized coding provider",
	zhipu: "GLM family models and coding plan features",
	moonshot: "MoonshotAI Kimi model family",
	minimax: "MiniMax family models with coding endpoint options",
	deepseek: "DeepSeek model family",
	deepinfra: "OpenAI-compatible endpoints from DeepInfra",
	nvidia: "NVIDIA NIM hosted model endpoints",
	mistral: "Mistral AI model endpoints",
	chutes: "Chutes AI endpoint integration",
	opencode: "OpenCode endpoint integration",
	blackbox: "Blackbox AI - works without API key",
	chatjimmy: "ChatJimmy - free public API, no auth required",
	huggingface: "Hugging Face Router endpoint integration",
	lightningai: "LightningAI endpoint integration",
	zenmux: "Zenmux endpoint integration",
	qwencli: "Qwen CLI OAuth provider",
	geminicli: "Gemini CLI OAuth provider",
	ollama: "Ollama local or hosted compatible endpoint",
	compatible: "Custom OpenAI/Anthropic compatible models",
};

const providerIconMap: Record<string, string> = {
	antigravity: "☁️",
	codex: "🤖",
	zhipu: "🧠",
	moonshot: "🌙",
	minimax: "⚡",
	deepseek: "🔍",
	deepinfra: "🛰️",
	nvidia: "🟢",
	mistral: "🌪️",
	chutes: "📦",
	opencode: "🧩",
	blackbox: "⬛",
	chatjimmy: "💬",
	huggingface: "🤗",
	lightningai: "⚡",
	zenmux: "🧬",
	qwencli: "🪄",
	geminicli: "💎",
	ollama: "🦙",
	compatible: "🔌",
};

function toProviderKey(providerId: string): ProviderKey | undefined {
	const values = Object.values(ProviderKey) as string[];
	if (values.includes(providerId)) {
		return providerId as ProviderKey;
	}
	return undefined;
}

function getSdkMode(providerId: string): "openai" | "anthropic" | "mixed" {
	const providerConfig = (
		configProviders as Record<string, { models: ModelConfig[] }>
	)[providerId];
	const modes = new Set<string>(
		(providerConfig?.models || []).map((model) => model.sdkMode || "openai"),
	);
	const hasAnthropic = modes.has("anthropic");
	const hasOpenAI = modes.has("openai") || modes.has("openai-sse");

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
	if (features.supportsOAuth && !features.supportsApiKey) {
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
	// Providers that don't need any configuration (no API key, no base URL)
	// - OAuth providers: qwencli, geminicli (use OAuth)
	// - No-config providers: blackbox, chatjimmy (work without any auth)
	// - Codex: supports both OAuth and API key (special case)
	// - Antigravity: OAuth-only but has login wizard
	const isNoConfigProvider =
		providerId === ProviderKey.QwenCli ||
		providerId === ProviderKey.GeminiCli ||
		providerId === ProviderKey.Blackbox ||
		providerId === "chatjimmy";
	// Special cases for OAuth providers with login wizards
	const isCodex = providerId === ProviderKey.Codex;
	const isAntigravity = providerId === ProviderKey.Antigravity;
	return {
		supportsApiKey: (accountConfig.supportsApiKey && !isNoConfigProvider) || isCodex,
		supportsOAuth: accountConfig.supportsOAuth || isCodex || isAntigravity,
		supportsMultiAccount: accountConfig.supportsMultiAccount,
		supportsBaseUrl: !isNoConfigProvider && providerId !== ProviderKey.Compatible && !isCodex && !isAntigravity,
		supportsConfigWizard: !isNoConfigProvider || isCodex || isAntigravity,
	};
}

/**
 * Central provider registry used by the unified settings UX.
 * This consolidates provider metadata in one place so UI layers do not maintain hard-coded lists.
 */
let providerRegistryCache: ProviderMetadata[] | null = null;

export function getAllProviders(): ProviderMetadata[] {
	if (providerRegistryCache) {
		return providerRegistryCache;
	}

	const metadata: ProviderMetadata[] = Object.entries(configProviders).map(
		([providerId, providerConfig]) => {
			const features = getDefaultFeatures(providerId);
			return {
				id: providerId,
				key: toProviderKey(providerId),
				displayName: providerConfig.displayName || providerId,
				category: resolveCategory(providerId, features),
				sdkMode: getSdkMode(providerId),
				description: providerDescriptionMap[providerId],
				icon: providerIconMap[providerId] || "🤖",
				settingsPrefix: `chp.${providerId}`,
				features,
				order: providerOrderMap[providerId] || 999,
			};
		},
	);

	if (!metadata.some((provider) => provider.id === ProviderKey.Compatible)) {
		metadata.push({
			id: ProviderKey.Compatible,
			key: ProviderKey.Compatible,
			displayName: "OpenAI/Anthropic Compatible",
			category: ProviderCategory.OpenAI,
			sdkMode: "mixed",
			description: providerDescriptionMap.compatible,
			icon: providerIconMap.compatible,
			settingsPrefix: "chp.compatibleModels",
			features: getDefaultFeatures(ProviderKey.Compatible),
			order: providerOrderMap.compatible,
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
