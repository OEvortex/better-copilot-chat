/*---------------------------------------------------------------------------------------------
 *  Qwen Code CLI Provider Types
 *--------------------------------------------------------------------------------------------*/

export interface QwenOAuthCredentials {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expiry_date: number; // Timestamp in milliseconds
    resource_url?: string;
}

export interface QwenTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    error?: string;
    error_description?: string;
}

export const QWEN_OAUTH_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56';
export const QWEN_OAUTH_TOKEN_ENDPOINT = 'https://chat.qwen.ai/api/v1/oauth2/token';
export const QWEN_DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const TOKEN_REFRESH_BUFFER_MS = 30 * 1000;
