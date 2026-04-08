import { WeixinChannel } from './WeixinAdapter.js';
import type { ChannelPlugin } from '@aether/channel-base';

export { WeixinChannel } from './WeixinAdapter.js';

export const plugin: ChannelPlugin = {
    channelType: 'weixin',
    displayName: 'WeChat',
    createChannel: (name, config, bridge, options) => new WeixinChannel(name, config, bridge, options),
};
