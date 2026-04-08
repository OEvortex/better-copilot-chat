export interface GroupCheckResult {
    allowed: boolean;
    reason?: string;
}

export class GroupGate {
    public check(): GroupCheckResult {
        return { allowed: true };
    }
}
