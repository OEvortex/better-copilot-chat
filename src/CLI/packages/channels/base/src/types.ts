export interface ChannelBaseOptions {
    router?: SessionRouter;
}

export interface AcpBridgeOptions {
    cliEntryPath: string;
    cwd: string;
    model?: string;
}

export interface ToolCallEvent {
    sessionId: string;
    [key: string]: unknown;
}

export interface SessionTarget {
    channelName: string;
    chatId: string;
}

export interface PairingRequest {
    code: string;
    senderName: string;
    senderId: string;
    createdAt: number;
}

export interface Envelope {
    channelName: string;
    senderId: string;
    senderName: string;
    chatId: string;
    text: string;
    isGroup: boolean;
    isMentioned: boolean;
    isReplyToBot: boolean;
    referencedText?: string;
    attachments?: Array<Record<string, unknown>>;
    imageBase64?: string;
    imageMimeType?: string;
    messageId?: string;
}

export interface ChannelConfig {
    type: string;
    token?: string;
    clientId?: string;
    clientSecret?: string;
    cwd: string;
    model?: string;
    sessionScope: SessionScope;
    senderPolicy: SenderPolicy;
    allowedUsers: string[];
    approvalMode?: string;
    instructions?: string;
    groupPolicy: GroupPolicy;
    groups: Record<string, string[]>;
}

export type ChannelType = string;
export type SessionScope = 'user' | 'channel';
export type SenderPolicy = 'allowlist' | 'blocklist';
export type GroupPolicy = 'disabled' | 'enabled';
export type DispatchMode = 'direct';
export type GroupConfig = Record<string, unknown>;
export type BlockStreamingChunkConfig = Record<string, unknown>;
export type BlockStreamingCoalesceConfig = Record<string, unknown>;

export interface ChannelPlugin {
    channelType: string;
    displayName: string;
    requiredConfigFields?: string[];
    createChannel: (
        name: string,
        config: ChannelConfig,
        bridge: AcpBridge,
        options?: ChannelBaseOptions,
    ) => import('./ChannelBase.js').ChannelBase;
}

export interface AvailableCommand {
    name: string;
    description?: string;
}

export interface AcpBridgeEventMap {
    toolCall: [ToolCallEvent];
    disconnected: [];
}

export interface SessionRouterState {
    restored: number;
    failed: number;
}

export type SessionRouter = import('./SessionRouter.js').SessionRouter;
export type AcpBridge = import('./AcpBridge.js').AcpBridge;
