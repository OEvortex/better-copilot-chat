/*---------------------------------------------------------------------------------------------
 *  Qwen Code CLI OAuth Authentication
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    QwenOAuthCredentials,
    QwenTokenResponse,
    QWEN_OAUTH_CLIENT_ID,
    QWEN_OAUTH_TOKEN_ENDPOINT,
    QWEN_DEFAULT_BASE_URL,
    TOKEN_REFRESH_BUFFER_MS
} from './types';
import { Logger } from '../../utils/logger';

export class QwenOAuthManager {
    private static instance: QwenOAuthManager;
    private credentials: QwenOAuthCredentials | null = null;
    private refreshPromise: Promise<QwenOAuthCredentials> | null = null;
    private refreshTimer: NodeJS.Timeout | null = null;

    private constructor() {
        // Start proactive refresh timer (every 30 seconds)
        this.startProactiveRefresh();
    }

    static getInstance(): QwenOAuthManager {
        if (!QwenOAuthManager.instance) {
            QwenOAuthManager.instance = new QwenOAuthManager();
        }
        return QwenOAuthManager.instance;
    }

    private startProactiveRefresh(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        this.refreshTimer = setInterval(async () => {
            try {
                // Only refresh if we have credentials and they are close to expiring
                if (this.credentials && !this.isTokenValid(this.credentials)) {
                    Logger.debug('Qwen CLI: Proactive token refresh triggered');
                    await this.refreshAccessToken(this.credentials);
                }
            } catch (error) {
                Logger.trace(`Qwen CLI: Proactive refresh failed: ${error}`);
            }
        }, 30000); // Check every 30 seconds
    }

    private getCredentialPath(): string {
        return path.join(os.homedir(), '.qwen', 'oauth_creds.json');
    }

    private loadCachedCredentials(): QwenOAuthCredentials {
        const keyFile = this.getCredentialPath();
        try {
            if (!fs.existsSync(keyFile)) {
                throw new Error(`Qwen OAuth credentials not found at ${keyFile}. Please login using the Qwen Code CLI first: qwen-code auth login`);
            }
            const data = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
            return {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                token_type: data.token_type || 'Bearer',
                expiry_date: data.expiry_date,
                resource_url: data.resource_url
            };
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Invalid Qwen OAuth credentials file');
        }
    }

    private async refreshAccessToken(credentials: QwenOAuthCredentials): Promise<QwenOAuthCredentials> {
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        this.refreshPromise = (async () => {
            try {
                if (!credentials.refresh_token) {
                    throw new Error('No refresh token available in credentials.');
                }

                const bodyData = new URLSearchParams();
                bodyData.set('grant_type', 'refresh_token');
                bodyData.set('refresh_token', credentials.refresh_token);
                bodyData.set('client_id', QWEN_OAUTH_CLIENT_ID);

                const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                    },
                    body: bodyData.toString()
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Token refresh failed: ${response.status} ${response.statusText}. Response: ${errorText}`);
                }

                const tokenData = (await response.json()) as QwenTokenResponse;

                if (tokenData.error) {
                    throw new Error(`Token refresh failed: ${tokenData.error} - ${tokenData.error_description || 'Unknown error'}`);
                }

                const newCredentials: QwenOAuthCredentials = {
                    access_token: tokenData.access_token,
                    token_type: tokenData.token_type || 'Bearer',
                    refresh_token: tokenData.refresh_token || credentials.refresh_token,
                    expiry_date: Date.now() + tokenData.expires_in * 1000,
                    resource_url: credentials.resource_url
                };

                this.saveCredentials(newCredentials);
                this.credentials = newCredentials;
                return newCredentials;
            } finally {
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    }

    private saveCredentials(credentials: QwenOAuthCredentials): void {
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

    private isTokenValid(credentials: QwenOAuthCredentials): boolean {
        if (!credentials.expiry_date) {
            return false;
        }
        return Date.now() < credentials.expiry_date - TOKEN_REFRESH_BUFFER_MS;
    }

    async ensureAuthenticated(forceRefresh = false): Promise<{ accessToken: string; baseURL: string }> {
        // If we already have valid credentials in memory and not forcing refresh, return them
        if (this.credentials && !forceRefresh && this.isTokenValid(this.credentials)) {
            return {
                accessToken: this.credentials.access_token,
                baseURL: this.getBaseURL(this.credentials)
            };
        }

        // Try to load from file if not in memory
        if (!this.credentials) {
            try {
                this.credentials = this.loadCachedCredentials();
            } catch (error) {
                // If file doesn't exist or is invalid, re-throw
                throw error;
            }
        }

        // Check validity and refresh if needed
        if (forceRefresh || !this.isTokenValid(this.credentials)) {
            this.credentials = await this.refreshAccessToken(this.credentials);
        }

        return {
            accessToken: this.credentials.access_token,
            baseURL: this.getBaseURL(this.credentials)
        };
    }

    private getBaseURL(credentials: QwenOAuthCredentials): string {
        let baseURL = credentials.resource_url || QWEN_DEFAULT_BASE_URL;

        if (!baseURL.startsWith('http://') && !baseURL.startsWith('https://')) {
            baseURL = `https://${baseURL}`;
        }

        baseURL = baseURL.replace(/\/$/, '');
        if (!baseURL.endsWith('/v1')) {
            baseURL = `${baseURL}/v1`;
        }

        return baseURL;
    }

    async getAccessToken(): Promise<string> {
        const { accessToken } = await this.ensureAuthenticated();
        return accessToken;
    }

    async getBaseURLAsync(): Promise<string> {
        const { baseURL } = await this.ensureAuthenticated();
        return baseURL;
    }
}
