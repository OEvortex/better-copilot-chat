import { DingtalkChannel } from './DingtalkAdapter.js';
import type { ChannelPlugin } from '@aether/channel-base';

export { DingtalkChannel } from './DingtalkAdapter.js';
export { downloadMedia } from './media.js';

export const plugin: ChannelPlugin = {
    channelType: 'dingtalk',
    displayName: 'DingTalk',
    requiredConfigFields: ['clientId', 'clientSecret'],
    createChannel: (name, config, bridge, options) => new DingtalkChannel(name, config, bridge, options),
};
