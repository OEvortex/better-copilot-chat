import { ProviderConfig } from '../../types/sharedTypes';
// Export all model configurations uniformly for easy import
import zhipu from './zhipu.json';
import minimax from './minimax.json';
import moonshot from './moonshot.json';
import deepseek from './deepseek.json';
import codex from './codex.json';
import antigravity from './antigravity.json';
import chutes from './chutes.json';
import opencode from './opencode.json';

const providers = {
    zhipu,
    minimax,
    moonshot,
    deepseek,
    codex,
    antigravity,
    chutes,
    opencode
};

export type ProviderName = keyof typeof providers;

export const configProviders = providers as Record<ProviderName, ProviderConfig>;
