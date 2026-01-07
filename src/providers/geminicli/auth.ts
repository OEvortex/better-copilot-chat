/*---------------------------------------------------------------------------------------------
 *  Gemini CLI OAuth Authentication
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    GeminiOAuthCredentials,
    GeminiTokenResponse,
    GEMINI_OAUTH_CLIENT_ID,
    GEMINI_OAUTH_CLIENT_SECRET,
    GEMINI_OAUTH_TOKEN_ENDPOINT,
    GEMINI_DEFAULT_BASE_URL,
    TOKEN_REFRESH_BUFFER_MS,
    GEMINI_OAUTH_SCOPES
} from './types';
import { Logger } from '../../utils/logger';

export class GeminiOAuthManager {
    private static instance: GeminiOAuthManager;
    private credentials: GeminiOAuthCredentials | null = null;
    private refreshTimer: NodeJS.Timeout | null = null;
    private refreshLock = false;

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
                    Logger.debug('Gemini CLI: Proactive token refresh triggered');
                    await this.refreshAccessToken(this.credentials);
                }
            } catch (error) {
                Logger.trace(`Gemini CLI: Proactive refresh failed: ${error}`);
            }
        }, 30000); // Check every 30 seconds
    }

    private getCredentialPath(): string {
        const credentialPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
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
                    `Gemini OAuth credentials not found at ${keyFile}. Please login using the Gemini CLI first: gemini auth login`
                );
            }
            const data = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
            return {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                token_type: data.token_type || 'Bearer',
                expiry_date: data.expiry_date
            };
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Invalid Gemini OAuth credentials file');
        }
    }

    private async refreshAccessToken(credentials: GeminiOAuthCredentials): Promise<GeminiOAuthCredentials> {
        if (this.refreshLock) {
            // Wait for ongoing refresh
            while (this.refreshLock) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return this.credentials || credentials;
        }

        this.refreshLock = true;

        try {
            if (!credentials.refresh_token) {
                throw new Error('No refresh token available in credentials.');
            }

            const bodyData = new URLSearchParams();
            bodyData.set('grant_type', 'refresh_token');
            bodyData.set('refresh_token', credentials.refresh_token);
            bodyData.set('client_id', GEMINI_OAUTH_CLIENT_ID);
            bodyData.set('client_secret', GEMINI_OAUTH_CLIENT_SECRET);
            bodyData.set('scope', GEMINI_OAUTH_SCOPES.join(' '));

            const response = await fetch(GEMINI_OAUTH_TOKEN_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                },
                body: bodyData.toString()
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Token refresh failed: ${response.status} ${response.statusText}. Response: ${errorText}`
                );
            }

            const tokenData = (await response.json()) as GeminiTokenResponse;

            if (tokenData.error) {
                throw new Error(
                    `Token refresh failed: ${tokenData.error} - ${tokenData.error_description || 'Unknown error'}`
                );
            }

            const newCredentials: GeminiOAuthCredentials = {
                access_token: tokenData.access_token,
                token_type: tokenData.token_type || 'Bearer',
                refresh_token: tokenData.refresh_token || credentials.refresh_token,
                expiry_date: Date.now() + tokenData.expires_in * 1000
            };

            this.saveCredentials(newCredentials);
            this.credentials = newCredentials;
            return newCredentials;
        } finally {
            this.refreshLock = false;
        }
    }

    private saveCredentials(credentials: GeminiOAuthCredentials): void {
        const filePath = this.getCredentialPath();
        try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2), 'utf-8');
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

    async ensureAuthenticated(forceRefresh = false): Promise<{ accessToken: string; baseURL: string }> {
        // Always reload credentials from file to pick up external updates (like reference)
        this.credentials = this.loadCachedCredentials();

        if (forceRefresh || !this.isTokenValid(this.credentials)) {
            this.credentials = await this.refreshAccessToken(this.credentials);
        }

        return {
            accessToken: this.credentials.access_token,
            baseURL: this.getBaseURL()
        };
    }

    invalidateCredentials(): void {
        // Invalidate cached credentials to force a refresh on next request
        // Call this when receiving authentication errors (401) from the API
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
