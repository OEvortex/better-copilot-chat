import { EventEmitter } from 'node:events';
import type { AcpBridgeOptions, ToolCallEvent } from './types.js';

export class AcpBridge extends EventEmitter {
    public readonly options: AcpBridgeOptions;
    private started = false;

    public constructor(options: AcpBridgeOptions) {
        super();
        this.options = options;
    }

    public async start(): Promise<void> {
        this.started = true;
    }

    public stop(): void {
        if (!this.started) {
            return;
        }
        this.started = false;
        this.emit('disconnected');
    }

    public sendToolCall(event: ToolCallEvent): void {
        this.emit('toolCall', event);
    }
}
