/*---------------------------------------------------------------------------------------------
 *  Codex Types
 *  Type definitions for Codex provider
 *--------------------------------------------------------------------------------------------*/

export interface PKCECodes {
	codeVerifier: string;
	codeChallenge: string;
}

export interface TokenResponse {
	access_token: string;
	refresh_token: string;
	id_token: string;
	token_type: string;
	expires_in: number;
}

export interface JWTClaims {
	email?: string;
	email_verified?: boolean;
	sub?: string;
	"https://api.openai.com/auth"?: {
		chatgpt_account_id?: string;
		chatgpt_user_id?: string;
		user_id?: string;
		project_id?: string;
		organizations?: Array<{
			id: string;
			name: string;
			role: string;
			project_id?: string;
		}>;
	};
}

export interface CodexAuthResult {
	accessToken: string;
	refreshToken: string;
	idToken: string;
	email: string;
	accountId: string;
	organizationId?: string;
	projectId?: string;
	organizations?: Array<{
		id: string;
		name: string;
		role: string;
		project_id?: string;
	}>;
	expiresAt: string;
}

export interface CodexModel {
	id: string;
	name: string;
	displayName: string;
	ownedBy: string;
}

export interface UsageLimitError {
	type: "usage_limit_reached";
	message: string;
	plan_type: string;
	resets_at: number; // Unix timestamp
	resets_in_seconds: number;
}
