import type { ChannelPlugin } from '../../../../channels/base/src/index.js';
import { plugin as telegramPlugin } from '../../../../channels/telegram/src/index.js';
import { plugin as weixinPlugin } from '../../../../channels/weixin/src/index.js';
import { plugin as dingtalkPlugin } from '../../../../channels/dingtalk/src/index.js';

const registry = new Map<string, ChannelPlugin>();

// Register built-in channel types
for (const p of [telegramPlugin, weixinPlugin, dingtalkPlugin]) {
  registry.set(p.channelType, p);
}

export function registerPlugin(plugin: ChannelPlugin): void {
  if (registry.has(plugin.channelType)) {
    throw new Error(
      `Channel type "${plugin.channelType}" is already registered.`,
    );
  }
  registry.set(plugin.channelType, plugin);
}

export function getPlugin(channelType: string): ChannelPlugin | undefined {
  return registry.get(channelType);
}

export function supportedTypes(): string[] {
  return [...registry.keys()];
}
