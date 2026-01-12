import type {
	ModelOverride,
	ProviderConfig,
	ProviderOverride,
} from "../types/sharedTypes";

export interface KnownProviderConfig
	extends Partial<ProviderConfig & ProviderOverride> {
	/** Compatibility strategy for OpenAI SDK */
	openai?: Omit<ModelOverride, "id">;
	/** Compatibility strategy for Anthropic SDK */
	anthropic?: Omit<ModelOverride, "id">;
}

/**
 * Built-in known providers and partial adaptation information
 *
 * Priority when merging model configurations: Model Config > Provider Config > Known Provider Config
 * Merged parameters handled include:
 *   - customHeader,
 *   - override.extraBody
 *
 * @static
 * @type {(Record<string, KnownProviderConfig>)}
 * @memberof CompatibleModelManager
 */
export const KnownProviders: Record<string, KnownProviderConfig> = {
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
	codex: { displayName: "Codex" },
	modelscope: { displayName: "ModelScope" },
	openrouter: { displayName: "OpenRouter" },
	siliconflow: { displayName: "SiliconFlow" },
	tbox: { displayName: "Bailian" },
	chutes: { displayName: "Chutes" },
	opencode: { displayName: "OpenCode" },
	huggingface: { displayName: "Hugging Face" },
	deepinfra: {
		displayName: "DeepInfra",
		openai: {
			baseUrl: "https://api.deepinfra.com/v1/openai",
		},
	},
	mistral: {
		displayName: "Mistral AI",
		openai: {
			baseUrl: "https://api.mistral.ai/v1",
		},
	},
	kiloai: { displayName: "Kilo AI" },
	qwencli: { displayName: "Qwen Code CLI" },
};
