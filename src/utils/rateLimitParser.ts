import type {
	CreditsSnapshot,
	RateLimitDisplay,
	RateLimitSnapshot,
	RateLimitWindow,
} from "../types/rateLimitTypes";
import { Logger } from "./logger";

const RATE_LIMIT_STALE_THRESHOLD_MINUTES = 15;

export function parseRateLimitFromHeaders(
	headers: Record<string, string | string[] | undefined>,
): RateLimitSnapshot | null {
	const primary = parseRateLimitWindow(
		headers,
		"x-codex-primary-used-percent",
		"x-codex-primary-window-minutes",
		"x-codex-primary-reset-at",
	);

	const secondary = parseRateLimitWindow(
		headers,
		"x-codex-secondary-used-percent",
		"x-codex-secondary-window-minutes",
		"x-codex-secondary-reset-at",
	);

	const credits = parseCreditsSnapshot(headers);

	if (!primary && !secondary && !credits) {
		return null;
	}

	const snapshot: RateLimitSnapshot = {
		primary,
		secondary,
		credits,
		capturedAt: new Date(),
	};

	Logger.info(
		`[RateLimit] Parsed: primary=${primary?.usedPercent}%, secondary=${secondary?.usedPercent}%, credits=${credits?.balance}`,
	);

	return snapshot;
}

function parseRateLimitWindow(
	headers: Record<string, string | string[] | undefined>,
	usedPercentHeader: string,
	windowMinutesHeader: string,
	resetsAtHeader: string,
): RateLimitWindow | undefined {
	const usedPercent = parseHeaderFloat(headers, usedPercentHeader);

	if (usedPercent === undefined) {
		return undefined;
	}

	const windowMinutes = parseHeaderInt(headers, windowMinutesHeader);
	const resetsAt = parseHeaderInt(headers, resetsAtHeader);

	const hasData =
		usedPercent !== 0 || windowMinutes !== undefined || resetsAt !== undefined;

	if (!hasData) {
		return undefined;
	}

	return {
		usedPercent,
		windowMinutes,
		resetsAt,
	};
}

function parseCreditsSnapshot(
	headers: Record<string, string | string[] | undefined>,
): CreditsSnapshot | undefined {
	const hasCredits = parseHeaderBool(headers, "x-codex-credits-has-credits");
	const unlimited = parseHeaderBool(headers, "x-codex-credits-unlimited");

	if (hasCredits === undefined || unlimited === undefined) {
		return undefined;
	}

	const balance = parseHeaderStr(headers, "x-codex-credits-balance")?.trim();

	return {
		hasCredits,
		unlimited,
		balance: balance && balance.length > 0 ? balance : undefined,
	};
}

function parseHeaderFloat(
	headers: Record<string, string | string[] | undefined>,
	name: string,
): number | undefined {
	const raw = parseHeaderStr(headers, name);
	if (!raw) {
		return undefined;
	}

	const value = parseFloat(raw);
	if (Number.isNaN(value) || !Number.isFinite(value)) {
		return undefined;
	}

	return value;
}

function parseHeaderInt(
	headers: Record<string, string | string[] | undefined>,
	name: string,
): number | undefined {
	const raw = parseHeaderStr(headers, name);
	if (!raw) {
		return undefined;
	}

	const value = parseInt(raw, 10);
	if (Number.isNaN(value)) {
		return undefined;
	}

	return value;
}

function parseHeaderBool(
	headers: Record<string, string | string[] | undefined>,
	name: string,
): boolean | undefined {
	const raw = parseHeaderStr(headers, name);
	if (!raw) {
		return undefined;
	}

	if (raw.toLowerCase() === "true" || raw === "1") {
		return true;
	}
	if (raw.toLowerCase() === "false" || raw === "0") {
		return false;
	}

	return undefined;
}

function parseHeaderStr(
	headers: Record<string, string | string[] | undefined>,
	name: string,
): string | undefined {
	const value = headers[name] || headers[name.toLowerCase()];
	if (!value) {
		return undefined;
	}

	if (Array.isArray(value)) {
		return value[0];
	}

	return value;
}

export function formatRateLimitDisplay(
	snapshot: RateLimitSnapshot | null,
): RateLimitDisplay | null {
	if (!snapshot) {
		return null;
	}

	const now = new Date();
	const isStale =
		now.getTime() - snapshot.capturedAt.getTime() >
		RATE_LIMIT_STALE_THRESHOLD_MINUTES * 60 * 1000;

	const display: RateLimitDisplay = {
		isStale,
	};

	if (snapshot.primary) {
		display.primaryUsedPercent = snapshot.primary.usedPercent;
		display.primaryWindowMinutes = snapshot.primary.windowMinutes;
		if (snapshot.primary.resetsAt) {
			display.primaryResetsAt = formatResetTime(snapshot.primary.resetsAt);
		}
	}

	if (snapshot.secondary) {
		display.secondaryUsedPercent = snapshot.secondary.usedPercent;
		display.secondaryWindowMinutes = snapshot.secondary.windowMinutes;
		if (snapshot.secondary.resetsAt) {
			display.secondaryResetsAt = formatResetTime(snapshot.secondary.resetsAt);
		}
	}

	if (snapshot.credits) {
		display.creditsUnlimited = snapshot.credits.unlimited;
		display.creditsBalance = snapshot.credits.balance;
	}

	return display;
}

function formatResetTime(timestampSeconds: number): string {
	const resetDate = new Date(timestampSeconds * 1000);
	const now = new Date();
	const diffMs = resetDate.getTime() - now.getTime();

	if (diffMs <= 0) {
		return "now";
	}

	const diffMinutes = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMinutes / 60);

	if (diffMinutes < 60) {
		return `${diffMinutes}m`;
	}

	if (diffHours < 24) {
		const mins = diffMinutes % 60;
		if (mins > 0) {
			return `${diffHours}h ${mins}m`;
		}
		return `${diffHours}h`;
	}

	return resetDate.toLocaleString();
}

export function formatRateLimitSummary(
	snapshot: RateLimitSnapshot | null,
): string {
	if (!snapshot) {
		return "";
	}

	const parts: string[] = [];

	if (snapshot.primary) {
		const remaining = 100 - snapshot.primary.usedPercent;
		const windowLabel = formatWindowDuration(snapshot.primary.windowMinutes);
		parts.push(`${windowLabel}: ${remaining.toFixed(0)}% left`);
	}

	if (snapshot.secondary) {
		const remaining = 100 - snapshot.secondary.usedPercent;
		const windowLabel = formatWindowDuration(snapshot.secondary.windowMinutes);
		parts.push(`${windowLabel}: ${remaining.toFixed(0)}% left`);
	}

	if (snapshot.credits) {
		if (snapshot.credits.unlimited) {
			parts.push("Credits: Unlimited");
		} else if (snapshot.credits.balance) {
			const balance = formatCreditBalance(snapshot.credits.balance);
			if (balance) {
				parts.push(`Credits: ${balance}`);
			}
		}
	}

	return parts.join(" | ");
}

function formatWindowDuration(minutes?: number): string {
	if (!minutes) {
		return "5h";
	}

	if (minutes < 60) {
		return `${minutes}m`;
	}

	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h`;
	}

	const days = Math.floor(hours / 24);
	if (days === 7) {
		return "Weekly";
	}

	return `${days}d`;
}

function formatCreditBalance(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) {
		return null;
	}

	const intValue = parseInt(trimmed, 10);
	if (!Number.isNaN(intValue) && intValue > 0) {
		return intValue.toString();
	}

	const floatValue = parseFloat(trimmed);
	if (!Number.isNaN(floatValue) && floatValue > 0) {
		return Math.round(floatValue).toString();
	}

	return null;
}

export function renderRateLimitProgressBar(
	percentUsed: number,
	segments: number = 20,
): string {
	const percentRemaining = 100 - percentUsed;
	const ratio = Math.max(0, Math.min(1, percentRemaining / 100));
	const filled = Math.round(ratio * segments);
	const empty = segments - filled;

	return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}
