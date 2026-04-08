import type { AcpBridge, SessionScope, SessionTarget, SessionRouterState } from './types.js';

export class SessionRouter {
    private readonly targets = new Map<string, SessionTarget>();
    private readonly sessionScopes = new Map<string, SessionScope>();

    public constructor(
        _bridge: AcpBridge,
        _cwd: string,
        _sessionScope: SessionScope,
        _sessionsPath: string,
    ) {
        this.sessionScopes.set('*', _sessionScope);
    }

    public getTarget(sessionId: string): SessionTarget | undefined {
        return this.targets.get(sessionId);
    }

    public setBridge(_bridge: AcpBridge): void {}

    public setChannelScope(channelName: string, sessionScope: SessionScope): void {
        this.sessionScopes.set(channelName, sessionScope);
    }

    public clearAll(): void {
        this.targets.clear();
    }

    public async restoreSessions(): Promise<SessionRouterState> {
        return { restored: 0, failed: 0 };
    }
}
