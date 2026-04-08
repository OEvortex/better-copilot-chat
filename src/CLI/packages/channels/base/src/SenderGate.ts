export interface SenderCheckResult {
    allowed: boolean;
    reason?: string;
}

export class SenderGate {
    public check(): SenderCheckResult {
        return { allowed: true };
    }
}
