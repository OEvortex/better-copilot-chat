import { TelegramChannel } from './TelegramAdapter.js';
import type { ChannelPlugin } from '@aether/channel-base';

export { TelegramChannel } from './TelegramAdapter.js';

export const plugin: ChannelPlugin = {
    channelType: 'telegram',
    displayName: 'Telegram',
    requiredConfigFields: ['token'],
    createChannel: (name, config, bridge, options) => new TelegramChannel(name, config, bridge, options),
};
