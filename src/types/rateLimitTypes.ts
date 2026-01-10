export interface RateLimitWindow {
	usedPercent: number;
	windowMinutes?: number;
	resetsAt?: number;
}

export interface CreditsSnapshot {
	hasCredits: boolean;
	unlimited: boolean;
	balance?: string;
}

export interface RateLimitSnapshot {
	primary?: RateLimitWindow;
	secondary?: RateLimitWindow;
	credits?: CreditsSnapshot;
	capturedAt: Date;
}

export interface RateLimitDisplay {
	primaryUsedPercent?: number;
	primaryResetsAt?: string;
	primaryWindowMinutes?: number;
	secondaryUsedPercent?: number;
	secondaryResetsAt?: string;
	secondaryWindowMinutes?: number;
	creditsBalance?: string;
	creditsUnlimited?: boolean;
	isStale: boolean;
}
