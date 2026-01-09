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
import qwencli from './qwencli.json';
import geminicli from './geminicli.json';
import huggingface from './huggingface.json';
import deepinfra from './deepinfra.json';
import mistral from './mistral.json';

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
    deepinfra,
    mistral
};

export type ProviderName = keyof typeof providers;

export const configProviders = providers as Record<ProviderName, ProviderConfig>;
