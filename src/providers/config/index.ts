import type { ProviderConfig } from "../../types/sharedTypes";
import antigravity from "./antigravity.json";
import chutes from "./chutes.json";
import codex from "./codex.json";
import deepinfra from "./deepinfra.json";
import deepseek from "./deepseek.json";
import geminicli from "./geminicli.json";
import huggingface from "./huggingface.json";
import lightningai from "./lightningai.json";
import minimax from "./minimax.json";
import mistral from "./mistral.json";
import moonshot from "./moonshot.json";
import opencode from "./opencode.json";
import qwencli from "./qwencli.json";
import zenmux from "./zenmux.json";
// Export all model configurations uniformly for easy import
import zhipu from "./zhipu.json";

const providers = {
	zhipu,
	minimax,
	moonshot,
	deepseek,
	codex,
	antigravity,
	chutes,
	opencode,
	qwencli,
	geminicli,
	huggingface,
	lightningai,
	deepinfra,
	mistral,
	zenmux,
};

export type ProviderName = keyof typeof providers;

export const configProviders = providers as Record<
	ProviderName,
	ProviderConfig
>;
