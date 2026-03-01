/*---------------------------------------------------------------------------------------------
 *  Gemini CLI OAuth Authentication
 *--------------------------------------------------------------------------------------------*/

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Logger } from "../../utils/logger";
import {
	GEMINI_DEFAULT_BASE_URL,
	GEMINI_OAUTH_CLIENT_ID,
	GEMINI_OAUTH_CLIENT_SECRET,
	GEMINI_OAUTH_SCOPES,
	GEMINI_OAUTH_TOKEN_ENDPOINT,
	type GeminiOAuthCredentials,
	type GeminiTokenResponse,
	TOKEN_REFRESH_BUFFER_MS,
} from "./types";

export class GeminiOAuthManager {
	private static instance: GeminiOAuthManager;
	private credentials: GeminiOAuthCredentials | null = null;
	private refreshTimer: NodeJS.Timeout | null = null;
	private refreshLock = false;
	private refreshInFlight: Promise<GeminiOAuthCredentials | null> | null = null;

	private constructor() {
		// Start proactive refresh timer (every 30 seconds)
		this.startProactiveRefresh();
	}

	static getInstance(): GeminiOAuthManager {
		if (!GeminiOAuthManager.instance) {
			GeminiOAuthManager.instance = new GeminiOAuthManager();
		}
		return GeminiOAuthManager.instance;
	}

	private startProactiveRefresh(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
		}
		this.refreshTimer = setInterval(async () => {
			try {
				// Only refresh if we have credentials and they are close to expiring
				if (this.credentials && !this.isTokenValid(this.credentials)) {
					Logger.debug("Gemini CLI: Proactive token refresh triggered");
					await this.refreshAccessToken(this.credentials);
				}
			} catch (error) {
				Logger.trace(`Gemini CLI: Proactive refresh failed: ${error}`);
			}
		}, 30000); // Check every 30 seconds
	}

	/**
	 * Parses OAuth error payloads returned by Google token endpoints.
	 */
	private parseOAuthError(text: string | undefined): {
		code?: string;
		description?: string;
	} {
		if (!text) return {};
		try {
			const payload = JSON.parse(text) as {
				error?:
					| string
					| { code?: string; status?: string; message?: string };
				error_description?: string;
			};
			if (!payload || typeof payload !== "object") return { description: text };

			let code: string | undefined;
			if (typeof payload.error === "string") {
				code = payload.error;
			} else if (payload.error && typeof payload.error === "object") {
				code = payload.error.status ?? payload.error.code;
				if (!payload.error_description && payload.error.message) {
					return { code, description: payload.error.message };
				}
			}
			return { code, description: payload.error_description };
		} catch {
			return { description: text };
		}
	}

	private getCredentialPath(): string {
		const credentialPath = path.join(
			os.homedir(),
			".gemini",
			"oauth_creds.json",
		);
		// Normalize path to ensure proper separators
		return path.normalize(credentialPath);
	}

	private loadCachedCredentials(): GeminiOAuthCredentials {
		const keyFile = this.getCredentialPath();
		Logger.debug(`Gemini CLI: Checking credentials at: ${keyFile}`);
		Logger.debug(`Gemini CLI: File exists: ${fs.existsSync(keyFile)}`);
		try {
			if (!fs.existsSync(keyFile)) {
				throw new Error(
					`Gemini OAuth credentials not found at ${keyFile}. Please login using the Gemini CLI first: gemini auth login`,
				);
			}
			const data = JSON.parse(fs.readFileSync(keyFile, "utf-8"));
			return {
				access_token: data.access_token,
				refresh_token: data.refresh_token,
				token_type: data.token_type || "Bearer",
				expiry_date: data.expiry_date,
			};
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error("Invalid Gemini OAuth credentials file");
		}
	}

	private async refreshAccessTokenWithRetry(
		credentials: GeminiOAuthCredentials,
		maxAttempts = 3,
	): Promise<GeminiOAuthCredentials | null> {
		let attempt = 1;
		while (attempt <= maxAttempts) {
			try {
				const result = await this.doRefreshAccessToken(credentials);
				if (result) return result;
				// If result is null (e.g., invalid_grant), don't retry
				return null;
			} catch (error) {
				const isRetryable =
					error instanceof Error &&
					(error.message.includes("ECONNRESET") ||
						error.message.includes("ETIMEDOUT") ||
						error.message.includes("ECONNREFUSED") ||
						error.message.includes("socket hang up"));

				if (!isRetryable || attempt >= maxAttempts) {
					throw error;
				}

				// Exponential backoff with jitter
				const delay = Math.min(1000 * 2 ** attempt, 10000) + Math.random() * 1000;
				Logger.debug(`Gemini CLI: Token refresh retry ${attempt}/${maxAttempts} after ${delay.toFixed(0)}ms`);
				await new Promise(resolve => setTimeout(resolve, delay));
				attempt++;
			}
		}
		return null;
	}

	private async doRefreshAccessToken(
		credentials: GeminiOAuthCredentials,
	): Promise<GeminiOAuthCredentials | null> {
		if (!credentials.refresh_token) {
			throw new Error("No refresh token available in credentials.");
		}

		const bodyData = new URLSearchParams();
		bodyData.set("grant_type", "refresh_token");
		bodyData.set("refresh_token", credentials.refresh_token);
		bodyData.set("client_id", GEMINI_OAUTH_CLIENT_ID);
		bodyData.set("client_secret", GEMINI_OAUTH_CLIENT_SECRET);
		bodyData.set("scope", GEMINI_OAUTH_SCOPES.join(" "));

		const response = await fetch(GEMINI_OAUTH_TOKEN_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: bodyData.toString(),
		});

		if (!response.ok) {
			const errorText = await response.text();
			const { code, description } = this.parseOAuthError(errorText);
			const details = [code, description ?? errorText].filter(Boolean).join(": ");

			// Handle invalid_grant - Google revoked the refresh token
			if (code === "invalid_grant") {
				Logger.warn(
					"Gemini CLI: Google revoked the stored refresh token. Please re-authenticate using: gemini auth login",
				);
				// Clear stale credentials to force re-authentication
				this.clearStaleCredentials();
				return null;
			}

			throw new Error(
				details
					? `Token refresh failed (${response.status}): ${details}`
					: `Token refresh failed: ${response.status} ${response.statusText}`,
			);
		}

		const tokenData = (await response.json()) as GeminiTokenResponse;

		if (tokenData.error) {
			throw new Error(
				`Token refresh failed: ${tokenData.error} - ${tokenData.error_description || "Unknown error"}`,
			);
		}

		const newCredentials: GeminiOAuthCredentials = {
			access_token: tokenData.access_token,
			token_type: tokenData.token_type || "Bearer",
			refresh_token: tokenData.refresh_token || credentials.refresh_token,
			expiry_date: Date.now() + tokenData.expires_in * 1000,
		};

		this.saveCredentials(newCredentials);
		this.credentials = newCredentials;

		const rotated = tokenData.refresh_token && tokenData.refresh_token !== credentials.refresh_token;
		Logger.debug(`Gemini CLI: Token refreshed successfully, rotated=${rotated ? "yes" : "no"}`);

		return newCredentials;
	}

	/**
	 * Clears stale credentials when refresh token is revoked or invalid.
	 */
	private clearStaleCredentials(): void {
		this.credentials = null;
		// Try to clear the cached file as well
		try {
			const filePath = this.getCredentialPath();
			if (fs.existsSync(filePath)) {
				// Rename to backup rather than delete (for debugging)
				const backupPath = `${filePath}.invalid.${Date.now()}`;
				fs.renameSync(filePath, backupPath);
				Logger.info(`Gemini CLI: Moved stale credentials to ${backupPath}`);
			}
		} catch (error) {
			Logger.warn(`Gemini CLI: Failed to clear stale credentials: ${error}`);
		}
	}

	private async refreshAccessToken(
		credentials: GeminiOAuthCredentials,
	): Promise<GeminiOAuthCredentials | null> {
		// Return in-flight refresh if one is already happening
		if (this.refreshInFlight) {
			Logger.debug("Gemini CLI: Waiting for in-flight token refresh");
			return this.refreshInFlight;
		}

		// Start new refresh request
		this.refreshInFlight = this.refreshAccessTokenWithRetry(credentials);

		try {
			return await this.refreshInFlight;
		} finally {
			this.refreshInFlight = null;
		}
	}

	private saveCredentials(credentials: GeminiOAuthCredentials): void {
		const filePath = this.getCredentialPath();
		try {
			const dir = path.dirname(filePath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2), "utf-8");
		} catch (error) {
			Logger.warn(`Failed to save refreshed credentials: ${error}`);
		}
	}

	private isTokenValid(credentials: GeminiOAuthCredentials): boolean {
		if (!credentials.expiry_date) {
			return false;
		}
		return Date.now() < credentials.expiry_date - TOKEN_REFRESH_BUFFER_MS;
	}

	async ensureAuthenticated(
		forceRefresh = false,
	): Promise<{ accessToken: string; baseURL: string }> {
		// Always reload credentials from file to pick up external updates (like reference)
		this.credentials = this.loadCachedCredentials();

		if (forceRefresh || !this.isTokenValid(this.credentials)) {
			const refreshed = await this.refreshAccessToken(this.credentials);
			if (!refreshed) {
				throw new Error(
					"Failed to refresh Gemini CLI token. Please re-authenticate using: gemini auth login",
				);
			}
			this.credentials = refreshed;
		}

		return {
			accessToken: this.credentials.access_token,
			baseURL: this.getBaseURL(),
		};
	}

	invalidateCredentials(): void {
		// Invalidate cached credentials to force a refresh on next request
		this.credentials = null;
	}

	private getBaseURL(): string {
		return GEMINI_DEFAULT_BASE_URL;
	}

	async getAccessToken(): Promise<string> {
		const { accessToken } = await this.ensureAuthenticated();
		return accessToken;
	}

	async getBaseURLAsync(): Promise<string> {
		const { baseURL } = await this.ensureAuthenticated();
		return baseURL;
	}

	async forceRefresh(): Promise<{ accessToken: string; baseURL: string }> {
		return await this.ensureAuthenticated(true);
	}
}
