/*---------------------------------------------------------------------------------------------
 *  Multi-Account Types
 *  Type definitions for the multi-account management system
 *--------------------------------------------------------------------------------------------*/

/**
 * Account status
 */
export type AccountStatus = "active" | "inactive" | "expired" | "error";

/**
 * Authentication type
 */
export type AuthType = "apiKey" | "oauth" | "token";

/**
 * Basic account information
 */
export interface Account {
	/** Unique account ID */
	id: string;
	/** Account display name */
	displayName: string;
	/** Linked provider (zhipu, moonshot, minimax, compatible, antigravity, codex, etc.) */
	provider: string;
	/** Authentication type */
	authType: AuthType;
	/** Email (if present, for OAuth) */
	email?: string;
	/** Account status */
	status: AccountStatus;
	/** Creation timestamp */
	createdAt: string;
	/** Last updated timestamp */
	updatedAt: string;
	/** Expiration timestamp (for OAuth tokens) */
	expiresAt?: string;
	/** Additional metadata */
	metadata?: Record<string, unknown>;
	/** Mark as default account for the provider */
	isDefault?: boolean;
}

/**
 * OAuth credentials information
 */
export interface OAuthCredentials {
	accessToken: string;
	refreshToken: string;
	expiresAt: string;
	tokenType?: string;
	scope?: string[];
}

/**
 * API Key credentials information
 */
export interface ApiKeyCredentials {
	apiKey: string;
	/** Custom endpoint (if any) */
	endpoint?: string;
	/** Custom headers */
	customHeaders?: Record<string, string>;
}

/**
 * Union type cho credentials
 */
export type AccountCredentials = OAuthCredentials | ApiKeyCredentials;

/**
 * Full account with credentials
 */
export interface AccountWithCredentials extends Account {
	credentials: AccountCredentials;
}

/**
 * Login result
 */
export interface LoginResult {
	success: boolean;
	account?: Account;
	error?: string;
}

/**
 * Account change event
 */
export interface AccountChangeEvent {
	type: "added" | "removed" | "updated" | "switched";
	account: Account;
	provider: string;
}

/**
 * Provider configuration for multi-account support
 */
export interface ProviderAccountConfig {
	/** Whether provider supports multi-account */
	supportsMultiAccount: boolean;
	/** Whether provider supports OAuth */
	supportsOAuth: boolean;
	/** Whether provider supports API Key */
	supportsApiKey: boolean;
	/** Maximum number of accounts */
	maxAccounts?: number;
}

/**
 * Provider routing configuration for assigning accounts to models
 */
export interface ProviderRoutingConfig {
	/** Mapping modelId -> accountId */
	modelAssignments: Record<string, string>;
	/** Enable/disable load balancing for provider */
	loadBalanceEnabled?: boolean;
}

/**
 * Account routing configuration by provider
 */
export type AccountRoutingConfig = Record<string, ProviderRoutingConfig>;

/**
 * Accounts grouped by provider
 */
export type AccountsByProvider = Record<string, Account[]>;

/**
 * Active accounts by provider
 */
export type ActiveAccounts = Record<string, string>;

/**
 * Storage schema for accounts
 */
export interface AccountStorageData {
	version: number;
	accounts: Account[];
	activeAccounts: ActiveAccounts;
	routingConfig?: AccountRoutingConfig;
}

/**
 * Quick pick item for accounts
 */
export interface AccountQuickPickItem {
	label: string;
	description?: string;
	detail?: string;
	account: Account;
}
