import { ChannelBase } from '@aether/channel-base';
import type { AcpBridge, ChannelBaseOptions, ChannelConfig, Envelope } from '@aether/channel-base';
import { extractTitle, normalizeDingTalkMarkdown } from './markdown.js';
import { downloadMedia } from './media.js';

export class DingtalkChannel extends ChannelBase {
    public constructor(
        name: string,
        config: ChannelConfig,
        bridge: AcpBridge,
        options?: ChannelBaseOptions,
    ) {
        super(name, config, bridge, options);
    }

    public async connect(): Promise<void> {}

    public async sendMessage(_chatId: string, _text: string): Promise<void> {
        void normalizeDingTalkMarkdown(_text);
        void extractTitle(_text);
        void downloadMedia();
    }

    public override async handleInbound(_envelope: Envelope): Promise<void> {}
}
