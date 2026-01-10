/*---------------------------------------------------------------------------------------------
 *  Codex Authentication Handler
 *  Handles OAuth login flow for OpenAI Codex API (similar to Antigravity)
 *--------------------------------------------------------------------------------------------*/

import * as crypto from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import { URL, URLSearchParams } from "node:url";
import * as vscode from "vscode";
import { ApiKeyManager } from "../../utils/apiKeyManager";
import { Logger } from "../../utils/logger";
import type {
	CodexAuthResult,
	JWTClaims,
	PKCECodes,
	TokenResponse,
} from "./codexTypes";

// OpenAI Codex OAuth Configuration
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_AUTH_URL = "https://auth.openai.com/oauth/authorize";
const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CODEX_CALLBACK_PORT = 1455;
const CODEX_REDIRECT_URI = `http://localhost:${CODEX_CALLBACK_PORT}/auth/callback`;

const CODEX_SCOPES = "openid email profile offline_access";

/**
 * Generate PKCE codes for OAuth2 flow
 */
function generatePKCECodes(): PKCECodes {
	// Generate 96 random bytes for code verifier
	const codeVerifier = crypto.randomBytes(96).toString("base64url");

	// Generate code challenge using SHA256
	const hash = crypto.createHash("sha256").update(codeVerifier).digest();
	const codeChallenge = hash.toString("base64url");

	return { codeVerifier, codeChallenge };
}

/**
 * Generate random state for CSRF protection
 */
function generateRandomState(): string {
	return crypto.randomBytes(32).toString("hex");
}

/**
 * Build OAuth authorization URL
 */
function buildAuthURL(state: string, pkceCodes: PKCECodes): string {
	const params = new URLSearchParams();
	params.set("client_id", CODEX_CLIENT_ID);
	params.set("response_type", "code");
	params.set("redirect_uri", CODEX_REDIRECT_URI);
	params.set("scope", CODEX_SCOPES);
	params.set("state", state);
	params.set("code_challenge", pkceCodes.codeChallenge);
	params.set("code_challenge_method", "S256");
	params.set("prompt", "login");
	params.set("id_token_add_organizations", "true");
	params.set("codex_cli_simplified_flow", "true");

	return `${CODEX_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCode(
	code: string,
	pkceCodes: PKCECodes,
): Promise<TokenResponse> {
	return new Promise((resolve, reject) => {
		const data = new URLSearchParams();
		data.set("grant_type", "authorization_code");
		data.set("client_id", CODEX_CLIENT_ID);
		data.set("code", code);
		data.set("redirect_uri", CODEX_REDIRECT_URI);
		data.set("code_verifier", pkceCodes.codeVerifier);

		const postData = data.toString();
		const url = new URL(CODEX_TOKEN_URL);

		const options = {
			hostname: url.hostname,
			port: 443,
			path: url.pathname,
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
				"Content-Length": Buffer.byteLength(postData),
			},
		};

		const req = https.request(options, (res) => {
			let body = "";
			res.on("data", (chunk) => {
				body += chunk;
			});
			res.on("end", () => {
				try {
					const token = JSON.parse(body) as TokenResponse;
					if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
						resolve(token);
					} else {
						reject(new Error(`Token exchange failed: ${body}`));
					}
				} catch (_e) {
					reject(new Error(`Failed to parse token response: ${body}`));
				}
			});
		});

		req.on("error", reject);
		req.write(postData);
		req.end();
	});
}

/**
 * Parse JWT token to extract claims (without signature verification)
 */
function parseJWTToken(token: string): JWTClaims | null {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) {
			return null;
		}

		// Decode the payload (second part)
		const payload = parts[1];
		// Add padding if necessary
		const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
		const decoded = Buffer.from(padded, "base64url").toString("utf-8");

		return JSON.parse(decoded) as JWTClaims;
	} catch (e) {
		Logger.error("Failed to parse JWT token:", e);
		return null;
	}
}

/**
 * Start local OAuth callback server
 */
function startCallbackServer(): Promise<{
	server: http.Server;
	port: number;
	resultPromise: Promise<{ code: string; state: string }>;
}> {
	return new Promise((resolve, reject) => {
		let resultResolver: (value: { code: string; state: string }) => void;
		let resultRejecter: (reason: Error) => void;

		const resultPromise = new Promise<{ code: string; state: string }>(
			(res, rej) => {
				resultResolver = res;
				resultRejecter = rej;
			},
		);

		const server = http.createServer((req, res) => {
			if (req.url?.startsWith("/auth/callback")) {
				const url = new URL(req.url, `http://localhost:${CODEX_CALLBACK_PORT}`);
				const code = url.searchParams.get("code") || "";
				const state = url.searchParams.get("state") || "";
				const error = url.searchParams.get("error") || "";

				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				if (error) {
					res.end(`
                        <html>
                        <head><title>Authentication Failed</title></head>
                        <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
                            <div style="text-align: center; color: white;">
                                <h1 style="color: #ff6b6b;">Authentication Failed</h1>
                                <p>Error: ${error}</p>
                                <p style="color: #888;">You can close this window.</p>
                            </div>
                        </body>
                        </html>
                    `);
					resultRejecter(new Error(`Authentication failed: ${error}`));
				} else {
					res.end(`
                        <html>
                        <head><title>Authentication Successful</title></head>
                        <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
                            <div style="text-align: center; color: white;">
                                <h1 style="color: #4ade80;">Authentication Successful</h1>
                                <p>You can close this window and return to VS Code.</p>
                            </div>
                        </body>
                        </html>
                    `);
					resultResolver({ code, state });
				}
			} else if (req.url?.startsWith("/success")) {
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(`
                    <html>
                    <head><title>Success</title></head>
                    <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
                        <div style="text-align: center; color: white;">
                            <h1 style="color: #4ade80;">Success</h1>
                            <p>You can close this window.</p>
                        </div>
                    </body>
                    </html>
                `);
			} else {
				res.writeHead(404);
				res.end("Not Found");
			}
		});

		server.listen(CODEX_CALLBACK_PORT, "localhost", () => {
			resolve({ server, port: CODEX_CALLBACK_PORT, resultPromise });
		});

		server.on("error", (err) => {
			reject(new Error(`Failed to start callback server: ${err.message}`));
		});
	});
}

/**
 * Perform Codex OAuth login
 */
export async function doCodexLogin(): Promise<CodexAuthResult | null> {
	const state = generateRandomState();
	const pkceCodes = generatePKCECodes();

	let serverInfo: {
		server: http.Server;
		port: number;
		resultPromise: Promise<{ code: string; state: string }>;
	};

	try {
		serverInfo = await startCallbackServer();
	} catch (err) {
		Logger.error("Failed to start OAuth callback server:", err);
		vscode.window.showErrorMessage(
			`Failed to start OAuth server: ${err instanceof Error ? err.message : "Unknown error"}`,
		);
		return null;
	}

	const authURL = buildAuthURL(state, pkceCodes);

	Logger.info("Opening browser for Codex authentication...");
	const opened = await vscode.env.openExternal(vscode.Uri.parse(authURL));

	if (!opened) {
		Logger.warn("Could not open browser automatically");
		const action = await vscode.window.showInformationMessage(
			"Could not open browser. Copy the authentication URL to clipboard?",
			"Copy URL",
			"Cancel",
		);
		if (action === "Copy URL") {
			await vscode.env.clipboard.writeText(authURL);
			vscode.window.showInformationMessage(
				"URL copied to clipboard. Paste it in your browser to continue.",
			);
		} else {
			serverInfo.server.close();
			return null;
		}
	}

	vscode.window.showInformationMessage(
		"Waiting for Codex authentication... Please complete the login in your browser.",
	);

	try {
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(
				() => reject(new Error("Authentication timed out after 5 minutes")),
				5 * 60 * 1000,
			);
		});

		const { code, state: returnedState } = await Promise.race([
			serverInfo.resultPromise,
			timeoutPromise,
		]);

		if (returnedState !== state) {
			throw new Error("Invalid state - possible CSRF attack");
		}

		if (!code) {
			throw new Error("Missing authorization code");
		}

		Logger.info("Exchanging code for tokens...");
		const tokenResp = await exchangeCode(code, pkceCodes);

		// Parse JWT to get email, account ID, organizations, and project
		let email = "";
		let accountId = "";
		let organizationId: string | undefined;
		let projectId: string | undefined;
		let organizations:
			| Array<{ id: string; name: string; role: string; project_id?: string }>
			| undefined;
		if (tokenResp.id_token) {
			const claims = parseJWTToken(tokenResp.id_token);
			Logger.info(
				"[codex] Parsed JWT claims:",
				JSON.stringify(claims, null, 2).substring(0, 1000),
			);
			if (claims) {
				email = claims.email || "";
				const authClaims = claims["https://api.openai.com/auth"];
				Logger.info(
					"[codex] Auth claims:",
					JSON.stringify(authClaims, null, 2),
				);
				accountId =
					authClaims?.chatgpt_account_id ||
					authClaims?.user_id ||
					claims.sub ||
					"";
				organizations = authClaims?.organizations;
				projectId = authClaims?.project_id;

				Logger.info("[codex] Extracted values:");
				Logger.info(`  - email: ${email}`);
				Logger.info(`  - accountId: ${accountId}`);
				Logger.info(`  - projectId (direct): ${projectId || "NOT_FOUND"}`);
				Logger.info(`  - organizations count: ${organizations?.length || 0}`);
				if (organizations) {
					organizations.forEach((org, idx) => {
						Logger.info(
							`    [${idx}] ${org.name} - id: ${org.id}, role: ${org.role}, project_id: ${org.project_id || "NONE"}`,
						);
					});
				}

				// If user has organizations, find Business workspace or use first one
				if (organizations && organizations.length > 0) {
					// Try to find Business workspace
					const businessOrg = organizations.find(
						(org) =>
							org.name?.toLowerCase().includes("business") ||
							org.role?.toLowerCase().includes("owner"),
					);
					const selectedOrg = businessOrg || organizations[0];
					organizationId = selectedOrg.id;
					// Use project_id from selected organization if available
					if (selectedOrg.project_id) {
						projectId = selectedOrg.project_id;
					}
					Logger.info("[codex] Organization selection:");
					Logger.info(`  - Found ${organizations.length} organization(s)`);
					Logger.info(`  - Selected: ${selectedOrg.name}`);
					Logger.info(`  - Organization ID: ${organizationId}`);
					Logger.info(
						`  - Project ID (from org): ${selectedOrg.project_id || "NOT_IN_ORG"}`,
					);
					Logger.info(`  - Final Project ID: ${projectId || "NONE"}`);
				}
			} else {
				Logger.warn("[codex] Failed to parse JWT claims");
			}
		} else {
			Logger.warn("[codex] No id_token in token response");
		}

		const expiresAt = new Date(
			Date.now() + tokenResp.expires_in * 1000,
		).toISOString();

		Logger.info(
			`Codex authentication successful! Email: ${email}, Account: ${accountId}, Organization: ${organizationId || "none"}, Project: ${projectId || "none"}`,
		);

		return {
			accessToken: tokenResp.access_token,
			refreshToken: tokenResp.refresh_token,
			idToken: tokenResp.id_token,
			email,
			accountId,
			organizationId,
			projectId,
			organizations,
			expiresAt,
		};
	} catch (err) {
		Logger.error("Codex authentication failed:", err);
		vscode.window.showErrorMessage(
			`Authentication failed: ${err instanceof Error ? err.message : "Unknown error"}`,
		);
		return null;
	} finally {
		serverInfo.server.close();
	}
}

/**
 * Codex login command handler
 */
export async function codexLoginCommand(): Promise<void> {
	const isLoggedIn = await CodexAuth.isLoggedIn();

	if (isLoggedIn) {
		const action = await vscode.window.showQuickPick(
			[
				{ label: "$(add) Add Another Account", action: "addAccount" },
				{ label: "$(refresh) Refresh Token", action: "refresh" },
				{ label: "$(sign-out) Logout", action: "logout" },
			],
			{ placeHolder: "Codex - Already logged in" },
		);

		if (!action) {
			return;
		}

		if (action.action === "addAccount") {
			await doCodexLoginAndSave(true);
			return;
		}

		if (action.action === "logout") {
			await CodexAuth.logout();
			return;
		}

		if (action.action === "refresh") {
			const stored = await ApiKeyManager.getApiKey("codex");
			if (stored) {
				try {
					const authData = JSON.parse(stored);
					const newToken = await CodexAuth.refreshToken(authData.refresh_token);
					if (newToken) {
						vscode.window.showInformationMessage(
							"Codex token refreshed successfully",
						);
					} else {
						vscode.window.showErrorMessage("Failed to refresh Codex token");
					}
				} catch (_err) {
					vscode.window.showErrorMessage("Failed to refresh token");
				}
			}
			return;
		}
		return;
	}

	await doCodexLoginAndSave(false);
}

/**
 * Perform login and save account
 */
async function doCodexLoginAndSave(isAddingNewAccount: boolean): Promise<void> {
	const result = await doCodexLogin();

	if (result) {
		// Import AccountManager for direct account management
		const { AccountManager } = await import("../../accounts/accountManager.js");
		const accountManager = AccountManager.getInstance();

		// Check if account with same email already exists
		const existingAccounts = accountManager.getAccountsByProvider("codex");
		const existingByEmail = existingAccounts.find(
			(acc) => acc.email === result.email,
		);

		if (existingByEmail && !isAddingNewAccount) {
			// Update existing account credentials
			const credentials = {
				accessToken: result.accessToken,
				refreshToken: result.refreshToken,
				idToken: result.idToken,
				expiresAt: result.expiresAt,
			};
			await accountManager.updateCredentials(existingByEmail.id, credentials);
			Logger.info(`Updated existing Codex account: ${result.email}`);
		} else {
			// Add new account directly to AccountManager
			const displayName = result.email
				? isAddingNewAccount
					? `${result.email} (${existingAccounts.length + 1})`
					: result.email
				: `Codex Account ${existingAccounts.length + 1}`;

			const credentials = {
				accessToken: result.accessToken,
				refreshToken: result.refreshToken,
				idToken: result.idToken,
				expiresAt: result.expiresAt,
			};

			await accountManager.addOAuthAccount(
				"codex",
				displayName,
				result.email || "",
				credentials,
				{ accountId: result.accountId },
			);
			Logger.info(`Added new Codex account: ${displayName}`);
		}

		// Also update ApiKeyManager for backward compatibility
		const authData = {
			type: "codex",
			access_token: result.accessToken,
			refresh_token: result.refreshToken,
			id_token: result.idToken,
			email: result.email,
			account_id: result.accountId,
			organization_id: result.organizationId,
			project_id: result.projectId,
			organizations: result.organizations,
			expires_at: result.expiresAt,
			timestamp: Date.now(),
		};

		Logger.info("[codex] Saving to storage:");
		Logger.info(`  - account_id: ${authData.account_id || "EMPTY"}`);
		Logger.info(`  - organization_id: ${authData.organization_id || "EMPTY"}`);
		Logger.info(`  - project_id: ${authData.project_id || "EMPTY"}`);
		Logger.info(
			`  - organizations: ${authData.organizations?.length || 0} items`,
		);

		await ApiKeyManager.setApiKey("codex", JSON.stringify(authData));

		const message = result.email
			? `Codex login successful! Authenticated as ${result.email}`
			: "Codex login successful!";

		vscode.window.showInformationMessage(message);
		Logger.info("Codex credentials saved successfully");
	}
}

/**
 * Force add a new Codex account (for Account Manager Page)
 */
export async function doCodexLoginForNewAccount(): Promise<void> {
	await doCodexLoginAndSave(true);
}

/**
 * CodexAuth class for managing Codex authentication
 */
export class CodexAuth {
	static async getAccessToken(): Promise<string | null> {
		const stored = await ApiKeyManager.getApiKey("codex");
		if (!stored) {
			return null;
		}

		try {
			const authData = JSON.parse(stored) as {
				access_token: string;
				refresh_token: string;
				expires_at: string;
			};

			const expiresAt = new Date(authData.expires_at);
			const now = new Date();
			const fiveMinutes = 5 * 60 * 1000;

			if (expiresAt.getTime() - now.getTime() > fiveMinutes) {
				return authData.access_token;
			}

			Logger.info("Codex token expired, refreshing...");
			const newToken = await CodexAuth.refreshToken(authData.refresh_token);
			return newToken?.accessToken || null;
		} catch (err) {
			Logger.error("Failed to parse Codex auth data:", err);
			return null;
		}
	}

	static async refreshToken(
		refreshToken: string,
		options?: { persist?: boolean },
	): Promise<{ accessToken: string; expiresAt: string } | null> {
		return new Promise((resolve) => {
			const data = new URLSearchParams();
			data.set("client_id", CODEX_CLIENT_ID);
			data.set("grant_type", "refresh_token");
			data.set("refresh_token", refreshToken);
			data.set("scope", "openid profile email");

			const postData = data.toString();
			const url = new URL(CODEX_TOKEN_URL);

			const reqOptions = {
				hostname: url.hostname,
				port: 443,
				path: url.pathname,
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Accept: "application/json",
					"Content-Length": Buffer.byteLength(postData),
				},
			};

			const req = https.request(reqOptions, (res) => {
				let body = "";
				res.on("data", (chunk) => {
					body += chunk;
				});
				res.on("end", async () => {
					try {
						const token = JSON.parse(body) as TokenResponse;
						if (
							res.statusCode &&
							res.statusCode >= 200 &&
							res.statusCode < 300
						) {
							const stored = await ApiKeyManager.getApiKey("codex");
							const expiresAt = new Date(
								Date.now() + token.expires_in * 1000,
							).toISOString();
							if (options?.persist !== false && stored) {
								const authData = JSON.parse(stored);
								authData.access_token = token.access_token;
								if (token.refresh_token) {
									authData.refresh_token = token.refresh_token;
								}
								if (token.id_token) {
									authData.id_token = token.id_token;
								}
								authData.expires_at = expiresAt;
								authData.timestamp = Date.now();
								// IMPORTANT: Preserve account_id, organization_id, project_id, organizations
								// Don't overwrite these fields during token refresh
								Logger.info(
									"[codex] Token refreshed - preserving account/organization data",
								);
								await ApiKeyManager.setApiKey(
									"codex",
									JSON.stringify(authData),
								);
							}
							resolve({ accessToken: token.access_token, expiresAt });
						} else {
							Logger.error("Token refresh failed:", body);
							resolve(null);
						}
					} catch (_e) {
						Logger.error("Failed to parse refresh token response:", body);
						resolve(null);
					}
				});
			});

			req.on("error", (err) => {
				Logger.error("Token refresh request failed:", err);
				resolve(null);
			});
			req.write(postData);
			req.end();
		});
	}

	static async logout(): Promise<void> {
		await ApiKeyManager.deleteApiKey("codex");
		vscode.window.showInformationMessage("Codex logged out successfully");
		Logger.info("Codex credentials cleared");
	}

	static async isLoggedIn(): Promise<boolean> {
		const stored = await ApiKeyManager.getApiKey("codex");
		return !!stored;
	}

	static async getEmail(): Promise<string> {
		const stored = await ApiKeyManager.getApiKey("codex");
		if (!stored) {
			return "";
		}

		try {
			const authData = JSON.parse(stored) as { email?: string };
			return authData.email || "";
		} catch (_err) {
			return "";
		}
	}

	static async getAccountId(): Promise<string> {
		const stored = await ApiKeyManager.getApiKey("codex");
		Logger.info(`[codex] getAccountId - stored data exists: ${!!stored}`);
		if (!stored) {
			Logger.warn("[codex] getAccountId: No stored auth data");
			return "";
		}

		try {
			const authData = JSON.parse(stored);
			Logger.info(
				`[codex] Full stored auth data keys: ${Object.keys(authData).join(", ")}`,
			);
			Logger.info(
				`[codex] account_id from storage: ${authData.account_id || "UNDEFINED"}`,
			);
			return authData.account_id || "";
		} catch (err) {
			Logger.error("[codex] getAccountId: Failed to parse auth data", err);
			return "";
		}
	}

	static async getOrganizationId(): Promise<string> {
		const stored = await ApiKeyManager.getApiKey("codex");
		if (!stored) {
			Logger.warn("[codex] getOrganizationId: No stored auth data");
			return "";
		}

		try {
			const authData = JSON.parse(stored);
			Logger.info(
				`[codex] organization_id from storage: ${authData.organization_id || "UNDEFINED"}`,
			);
			return authData.organization_id || "";
		} catch (err) {
			Logger.error("[codex] getOrganizationId: Failed to parse auth data", err);
			return "";
		}
	}

	static async getProjectId(): Promise<string> {
		const stored = await ApiKeyManager.getApiKey("codex");
		if (!stored) {
			Logger.warn("[codex] getProjectId: No stored auth data");
			return "";
		}

		try {
			const authData = JSON.parse(stored) as { project_id?: string };
			Logger.debug(
				`[codex] getProjectId: ${authData.project_id || "NOT_FOUND"}`,
			);
			return authData.project_id || "";
		} catch (err) {
			Logger.error("[codex] getProjectId: Failed to parse auth data", err);
			return "";
		}
	}

	static async getOrganizations(): Promise<
		Array<{ id: string; name: string; role: string; project_id?: string }>
	> {
		const stored = await ApiKeyManager.getApiKey("codex");
		if (!stored) {
			return [];
		}

		try {
			const authData = JSON.parse(stored) as {
				organizations?: Array<{
					id: string;
					name: string;
					role: string;
					project_id?: string;
				}>;
			};
			return authData.organizations || [];
		} catch (_err) {
			return [];
		}
	}
}
