import type { AcpBridge, ChannelConfig, Envelope, ToolCallEvent } from './types.js';
import type { ChannelBaseOptions } from './types.js';

export abstract class ChannelBase {
    protected bridge: AcpBridge;

    public constructor(
        public readonly name: string,
        protected readonly config: ChannelConfig,
        bridge: AcpBridge,
        protected readonly options?: ChannelBaseOptions,
    ) {
        this.bridge = bridge;
    }

    public setBridge(bridge: AcpBridge): void {
        this.bridge = bridge;
    }

    public abstract connect(): Promise<void>;

    public disconnect(): void {}

    public async handleInbound(_envelope: Envelope): Promise<void> {}

    public onToolCall(_chatId: string, _event: ToolCallEvent): void {}

    protected onPromptStart(_chatId: string, _sessionId?: string, _messageId?: string): void {}

    protected onPromptEnd(_chatId: string, _sessionId?: string, _messageId?: string): void {}

    public abstract sendMessage(chatId: string, text: string): Promise<void>;
}
