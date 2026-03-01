import * as http from 'node:http';
import { URL, URLSearchParams } from 'node:url';
import * as vscode from 'vscode';
import { ProviderKey } from '../../types/providerKeys';
import { ApiKeyManager } from '../../utils/apiKeyManager';
import { ConfigManager } from '../../utils/configManager';
import { configProviders } from '../config';
import type { AntigravityAuthResult, AntigravityModel, ModelQuickPickItem, TokenResponse, UserInfo } from './types';

// TODO FIX: Replace with your own Google Cloud Project credentials
const ANTIGRAVITY_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const ANTIGRAVITY_CLIENT_SECRET = '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';
const ANTIGRAVITY_CALLBACK_PORT = 51121;
const ANTIGRAVITY_SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs'
];
const PROVIDER_KEY = ProviderKey.Antigravity;

import { resolveGlobalTokenLimits, isKimiK25Model, isKimiModel } from '../../utils';

function resolveTokenLimits(
    modelId: string,
    contextLength: number
): { maxInputTokens: number; maxOutputTokens: number } {
    return resolveGlobalTokenLimits(modelId, contextLength, {
        defaultContextLength: 128000,
        defaultMaxOutputTokens: 16000
    });
}

function generateRandomState(): string {
    const array = new Uint8Array(32);
    for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(array)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function buildAuthURL(redirectURI: string, state: string): string {
    const params = new URLSearchParams();
    params.set('access_type', 'offline');
    params.set('client_id', ANTIGRAVITY_CLIENT_ID);
    params.set('prompt', 'consent');
    params.set('redirect_uri', redirectURI);
    params.set('response_type', 'code');
    params.set('scope', ANTIGRAVITY_SCOPES.join(' '));
    params.set('state', state);
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function parseJsonSafe<T>(text: string): T | null {
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

async function exchangeCode(code: string, redirectURI: string): Promise<TokenResponse> {
    const data = new URLSearchParams();
    data.set('code', code);
    data.set('client_id', ANTIGRAVITY_CLIENT_ID);
    data.set('client_secret', ANTIGRAVITY_CLIENT_SECRET);
    data.set('redirect_uri', redirectURI);
    data.set('grant_type', 'authorization_code');
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: data.toString()
    });
    const body = await response.text();
    const token = parseJsonSafe<TokenResponse>(body);
    if (!token) {
        throw new Error(`Failed to parse token response: ${body}`);
    }
    if (!response.ok) {
        throw new Error(`Token exchange failed: ${body}`);
    }
    return token;
}

async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) {
            return { email: '' };
        }
        const body = await response.text();
        return parseJsonSafe<UserInfo>(body) || { email: '' };
    } catch {
        return { email: '' };
    }
}

async function fetchProjectId(accessToken: string): Promise<string> {
    const reqBody = JSON.stringify({
        metadata: {
            ideType: 'IDE_UNSPECIFIED',
            platform: 'PLATFORM_UNSPECIFIED',
            pluginType: 'GEMINI'
        }
    });
    try {
        const response = await fetch('https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'User-Agent': 'google-api-nodejs-client/9.15.1',
                'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
                'Client-Metadata':
                    '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}'
            },
            body: reqBody
        });
        if (!response.ok) {
            return '';
        }
        const body = await response.text();
        const data = parseJsonSafe<{
            cloudaicompanionProject?: string | { id?: string };
        }>(body);
        if (!data) {
            return '';
        }
        if (typeof data.cloudaicompanionProject === 'string') {
            return data.cloudaicompanionProject.trim();
        }
        if (data.cloudaicompanionProject?.id) {
            return data.cloudaicompanionProject.id.trim();
        }
        return '';
    } catch {
        return '';
    }
}

function startCallbackServer(): Promise<{
    server: http.Server;
    port: number;
    resultPromise: Promise<{ code: string; state: string }>;
}> {
    return new Promise((resolve, reject) => {
        let resultResolver: (value: { code: string; state: string }) => void;
        let resultRejecter: (reason: Error) => void;
        const resultPromise = new Promise<{ code: string; state: string }>((res, rej) => {
            resultResolver = res;
            resultRejecter = rej;
        });
        const server = http.createServer((req, res) => {
            if (req.url?.startsWith('/oauth-callback')) {
                const url = new URL(req.url, `http://localhost:${ANTIGRAVITY_CALLBACK_PORT}`);
                const code = url.searchParams.get('code') || '';
                const state = url.searchParams.get('state') || '';
                const error = url.searchParams.get('error') || '';
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                if (error) {
                    res.end(
                        `<html><head><title>Authentication Failed</title></head><body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;"><div style="text-align: center;"><h1 style="color: #dc3545;">Authentication Failed</h1><p>Error: ${error}</p><p>You can close this window.</p></div></body></html>`
                    );
                    resultRejecter(new Error(`Authentication failed: ${error}`));
                } else {
                    res.end(
                        '<html><head><title>Authentication Successful</title></head><body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;"><div style="text-align: center;"><h1 style="color: #28a745;">Authentication Successful</h1><p>You can close this window and return to VS Code.</p></div></body></html>'
                    );
                    resultResolver({ code, state });
                }
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });
        server.listen(ANTIGRAVITY_CALLBACK_PORT, 'localhost', () =>
            resolve({ server, port: ANTIGRAVITY_CALLBACK_PORT, resultPromise })
        );
        server.on('error', err => reject(new Error(`Failed to start callback server: ${err.message}`)));
    });
}

export async function doAntigravityLogin(): Promise<AntigravityAuthResult | null> {
    const state = generateRandomState();
    let serverInfo: {
        server: http.Server;
        port: number;
        resultPromise: Promise<{ code: string; state: string }>;
    };
    try {
        serverInfo = await startCallbackServer();
    } catch (err) {
        vscode.window.showErrorMessage(
            `Failed to start OAuth server: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
        return null;
    }
    const redirectURI = `http://localhost:${serverInfo.port}/oauth-callback`;
    const authURL = buildAuthURL(redirectURI, state);
    const opened = await vscode.env.openExternal(vscode.Uri.parse(authURL));
    if (!opened) {
        const action = await vscode.window.showInformationMessage(
            'Could not open browser. Copy the authentication URL to clipboard?',
            'Copy URL',
            'Cancel'
        );
        if (action === 'Copy URL') {
            await vscode.env.clipboard.writeText(authURL);
            vscode.window.showInformationMessage('URL copied to clipboard. Paste it in your browser to continue.');
        } else {
            serverInfo.server.close();
            return null;
        }
    }
    vscode.window.showInformationMessage('Waiting for authentication... Please complete the login in your browser.');
    try {
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Authentication timed out after 5 minutes')), 5 * 60 * 1000)
        );
        const { code, state: returnedState } = await Promise.race([serverInfo.resultPromise, timeoutPromise]);
        if (returnedState !== state) {
            throw new Error('Invalid state - possible CSRF attack');
        }
        if (!code) {
            throw new Error('Missing authorization code');
        }
        const tokenResp = await exchangeCode(code, redirectURI);
        let email = '';
        if (tokenResp.access_token) {
            const userInfo = await fetchUserInfo(tokenResp.access_token);
            email = userInfo.email?.trim() || '';
        }
        let projectId = '';
        if (tokenResp.access_token) {
            projectId = await fetchProjectId(tokenResp.access_token);
        }
        const expiresAt = new Date(Date.now() + tokenResp.expires_in * 1000).toISOString();
        return {
            accessToken: tokenResp.access_token,
            refreshToken: tokenResp.refresh_token,
            email,
            projectId,
            expiresAt
        };
    } catch (err) {
        vscode.window.showErrorMessage(
            `Authentication failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
        return null;
    } finally {
        serverInfo.server.close();
    }
}

async function addAllAntigravityModelsToCompatible(models: AntigravityModel[]): Promise<void> {
    const { CompatibleModelManager } = await import('../../utils/compatibleModelManager.js');
    const baseUrlOverride =
        ConfigManager.getProviderOverrides().antigravity?.baseUrl || 'https://cloudcode-pa.googleapis.com/v1internal';
    let addedCount = 0;
    for (const model of models) {
        try {
            const totalContext = model.maxTokens || 128000;
            const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(model.id, totalContext);

            await CompatibleModelManager.addModel({
                id: `${PROVIDER_KEY}:${model.id}`,
                name: `${model.displayName} (Antigravity)`,
                provider: PROVIDER_KEY,
                sdkMode: 'gemini' as const,
                baseUrl: baseUrlOverride,
                model: model.id,
                maxInputTokens,
                maxOutputTokens,
                capabilities: { toolCalling: true, imageInput: true }
            });
            addedCount++;
        } catch {
            /* Ignore duplicate model errors */
        }
    }
    if (addedCount > 0) {
        vscode.window.showInformationMessage(
            `Automatically added ${addedCount} Antigravity model(s) to Compatible Provider`
        );
    }
}

async function _showAntigravityModelsQuickPick(models: AntigravityModel[]): Promise<void> {
    const items: ModelQuickPickItem[] = models.map(model => ({
        label: model.displayName || model.name,
        description: model.id,
        detail: `Provider: ${model.ownedBy}`,
        model: model
    }));
    const quickPick = vscode.window.createQuickPick<ModelQuickPickItem>();
    quickPick.title = 'Antigravity Models';
    quickPick.placeholder = 'Select models to add to Compatible Provider (multi-select supported)';
    quickPick.items = items;
    quickPick.canSelectMany = true;
    quickPick.ignoreFocusOut = true;
    const selected = await new Promise<ModelQuickPickItem[] | undefined>(resolve => {
        quickPick.onDidAccept(() => {
            resolve([...quickPick.selectedItems]);
            quickPick.hide();
        });
        quickPick.onDidHide(() => resolve(undefined));
        quickPick.show();
    });
    if (selected && selected.length > 0) {
        const { CompatibleModelManager } = await import('../../utils/compatibleModelManager.js');
        const baseUrlOverride =
            ConfigManager.getProviderOverrides().antigravity?.baseUrl ||
            'https://cloudcode-pa.googleapis.com/v1internal';
        let addedCount = 0;
        for (const item of selected) {
            try {
                const totalContext = item.model.maxTokens || 128000;
                const { maxInputTokens, maxOutputTokens } = resolveTokenLimits(item.model.id, totalContext);

                await CompatibleModelManager.addModel({
                    id: `${PROVIDER_KEY}:${item.model.id}`,
                    name: item.model.displayName,
                    provider: PROVIDER_KEY,
                    sdkMode: 'gemini' as const,
                    baseUrl: baseUrlOverride,
                    model: item.model.id,
                    maxInputTokens,
                    maxOutputTokens,
                    capabilities: { toolCalling: true, imageInput: true }
                });
                addedCount++;
            } catch {
                /* Ignore duplicate model errors */
            }
        }
        if (addedCount > 0) {
            vscode.window.showInformationMessage(`Added ${addedCount} Antigravity model(s) to Compatible Provider`);
        }
    }
}

async function doAntigravityLoginAndSave(isAddingNewAccount: boolean): Promise<void> {
    const result = await doAntigravityLogin();
    if (!result) {
        return;
    }
    const models = await AntigravityAuth.fetchModels(result.accessToken);
    const { AccountManager } = await import('../../accounts/accountManager.js');
    const accountManager = AccountManager.getInstance();
    const existingAccounts = accountManager.getAccountsByProvider(PROVIDER_KEY);
    const existingByEmail = existingAccounts.find((acc: { email?: string }) => acc.email === result.email);
    const credentials = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt
    };
    if (existingByEmail && !isAddingNewAccount) {
        await accountManager.updateCredentials(existingByEmail.id, credentials);
    } else {
        const displayName = result.email
            ? isAddingNewAccount
                ? `${result.email} (${existingAccounts.length + 1})`
                : result.email
            : `Antigravity Account ${existingAccounts.length + 1}`;
        await accountManager.addOAuthAccount(PROVIDER_KEY, displayName, result.email || '', credentials, {
            projectId: result.projectId,
            models: models
        });
    }
    await ApiKeyManager.setApiKey(
        PROVIDER_KEY,
        JSON.stringify({
            type: PROVIDER_KEY,
            access_token: result.accessToken,
            refresh_token: result.refreshToken,
            email: result.email,
            project_id: result.projectId,
            expires_at: result.expiresAt,
            timestamp: Date.now(),
            models: models
        })
    );
    const message = result.email
        ? `Antigravity login successful! Authenticated as ${result.email}`
        : 'Antigravity login successful!';
    const modelsInfo = models.length > 0 ? ` | ${models.length} models available` : '';
    vscode.window.showInformationMessage(
        result.projectId ? `${message} (Project: ${result.projectId})${modelsInfo}` : `${message}${modelsInfo}`
    );
    if (models.length > 0) {
        await addAllAntigravityModelsToCompatible(models);
    }
}

export async function antigravityLoginCommand(): Promise<void> {
    const isLoggedIn = await AntigravityAuth.isLoggedIn();
    if (isLoggedIn) {
        const action = await vscode.window.showQuickPick(
            [
                { label: '$(add) Add Another Account', action: 'addAccount' },
                { label: '$(list-unordered) Show Available Models', action: 'models' },
                { label: '$(refresh) Refresh Models', action: 'refresh' },
                { label: '$(sign-out) Logout', action: 'logout' }
            ],
            { placeHolder: 'Antigravity - Already logged in' }
        );
        if (!action) {
            return;
        }
        if (action.action === 'addAccount') {
            await doAntigravityLoginAndSave(true);
            return;
        }
        if (action.action === 'logout') {
            await AntigravityAuth.logout();
            return;
        }
        if (action.action === 'refresh') {
            const models = await AntigravityAuth.refreshModels();
            if (models.length > 0) {
                vscode.window.showInformationMessage(`Refreshed ${models.length} Antigravity models`);
            } else {
                vscode.window.showWarningMessage('No models found from Antigravity');
            }
            return;
        }
        if (action.action === 'models') {
            let models = await AntigravityAuth.getCachedModels();
            if (models.length === 0) {
                models = await AntigravityAuth.getModels();
            }
            if (models.length > 0) {
                const modelList = models.map(m => `• ${m.displayName}`).join('\n');
                vscode.window.showInformationMessage(`Available Antigravity models (${models.length}):\n${modelList}`, {
                    modal: false
                });
            } else {
                vscode.window.showWarningMessage('No models available from Antigravity');
            }
            return;
        }
        return;
    }
    await doAntigravityLoginAndSave(false);
}

export async function doAntigravityLoginForNewAccount(): Promise<void> {
    await doAntigravityLoginAndSave(true);
}

function modelName2Alias(originalName: string): string {
    return originalName.startsWith('models/') ? originalName.substring(7) : originalName;
}

export class AntigravityAuth {
    static async getProjectId(): Promise<string> {
        const stored = await ApiKeyManager.getApiKey(PROVIDER_KEY);
        if (!stored) {
            return '';
        }
        try {
            return ((JSON.parse(stored) as { project_id?: string }).project_id || '').trim();
        } catch {
            return '';
        }
    }

    static async ensureProjectId(accessToken?: string): Promise<string> {
        const existing = await AntigravityAuth.getProjectId();
        if (existing) {
            return existing;
        }
        const token = accessToken || (await AntigravityAuth.getAccessToken());
        if (!token) {
            return '';
        }
        const projectId = await fetchProjectId(token);
        if (!projectId) {
            return '';
        }
        const stored = await ApiKeyManager.getApiKey(PROVIDER_KEY);
        if (stored) {
            try {
                const authData = JSON.parse(stored);
                authData.project_id = projectId;
                await ApiKeyManager.setApiKey(PROVIDER_KEY, JSON.stringify(authData));
            } catch {
                /* Ignore parse errors */
            }
        }
        return projectId;
    }

    static async getAccessToken(): Promise<string | null> {
        const stored = await ApiKeyManager.getApiKey(PROVIDER_KEY);
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
            if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
                return authData.access_token;
            }
            const newToken = await AntigravityAuth.refreshToken(authData.refresh_token);
            return newToken?.accessToken || null;
        } catch {
            return null;
        }
    }

    static async refreshToken(
        refreshToken: string,
        options?: { persist?: boolean }
    ): Promise<{ accessToken: string; expiresAt: string } | null> {
        try {
            const data = new URLSearchParams();
            data.set('client_id', ANTIGRAVITY_CLIENT_ID);
            data.set('client_secret', ANTIGRAVITY_CLIENT_SECRET);
            data.set('refresh_token', refreshToken);
            data.set('grant_type', 'refresh_token');
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: data.toString()
            });
            const body = await response.text();
            const token = parseJsonSafe<TokenResponse>(body);
            if (!token || !response.ok) {
                return null;
            }
            const stored = await ApiKeyManager.getApiKey(PROVIDER_KEY);
            const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
            if (options?.persist !== false && stored) {
                const authData = JSON.parse(stored);
                authData.access_token = token.access_token;
                authData.expires_at = expiresAt;
                authData.timestamp = Date.now();
                await ApiKeyManager.setApiKey(PROVIDER_KEY, JSON.stringify(authData));
            }
            return { accessToken: token.access_token, expiresAt };
        } catch {
            return null;
        }
    }

    static async logout(): Promise<void> {
        await ApiKeyManager.deleteApiKey(PROVIDER_KEY);
        vscode.window.showInformationMessage('Antigravity logged out successfully');
    }
    static async isLoggedIn(): Promise<boolean> {
        return !!(await ApiKeyManager.getApiKey(PROVIDER_KEY));
    }

    static async fetchModels(accessToken: string): Promise<AntigravityModel[]> {
        const antigravityConfig = configProviders[PROVIDER_KEY];
        const hardcodedModels: AntigravityModel[] = antigravityConfig.models.map(m => ({
            id: m.id,
            name: m.name,
            displayName: m.name,
            ownedBy: 'antigravity',
            maxTokens: m.maxInputTokens,
            maxOutputTokens: m.maxOutputTokens,
            quotaInfo: undefined
        }));
        const endpoints = ['daily-cloudcode-pa.sandbox.googleapis.com', 'cloudcode-pa.googleapis.com'];
        let quotaMap = new Map<string, { remainingFraction?: number; resetTime?: string }>();
        for (const hostname of endpoints) {
            quotaMap = await AntigravityAuth.tryFetchQuotaFromEndpoint(accessToken, hostname);
            if (quotaMap.size > 0) {
                break;
            }
        }
        return hardcodedModels.map(model => ({
            ...model,
            quotaInfo: quotaMap.get(model.id.toLowerCase())
        }));
    }

    private static async tryFetchQuotaFromEndpoint(
        accessToken: string,
        hostname: string
    ): Promise<Map<string, { remainingFraction?: number; resetTime?: string }>> {
        try {
            const response = await fetch(`https://${hostname}/v1internal:fetchAvailableModels`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'antigravity/1.18.3'
                },
                body: JSON.stringify({})
            });
            if (!response.ok) {
                return new Map();
            }
            const body = await response.text();
            const data = parseJsonSafe<{
                models?: Record<string, { quotaInfo?: { remainingFraction?: number; resetTime?: string } }>;
            }>(body);
            if (!data?.models) {
                return new Map();
            }
            const quotaMap = new Map<string, { remainingFraction?: number; resetTime?: string }>();
            for (const originalName of Object.keys(data.models)) {
                const aliasName = modelName2Alias(originalName);
                const modelData = data.models[originalName];
                if (aliasName && modelData?.quotaInfo) {
                    quotaMap.set(aliasName.toLowerCase(), {
                        remainingFraction: modelData.quotaInfo.remainingFraction,
                        resetTime: modelData.quotaInfo.resetTime
                    });
                }
            }
            return quotaMap;
        } catch {
            return new Map();
        }
    }

    static async getModels(): Promise<AntigravityModel[]> {
        const token = await AntigravityAuth.getAccessToken();
        return token ? AntigravityAuth.fetchModels(token) : [];
    }

    static async getCachedModels(): Promise<AntigravityModel[]> {
        const stored = await ApiKeyManager.getApiKey(PROVIDER_KEY);
        if (!stored) {
            return [];
        }
        try {
            const authData = JSON.parse(stored) as { models?: AntigravityModel[] };
            const cachedModels = authData.models || [];
            const antigravityConfig = configProviders[PROVIDER_KEY];
            return antigravityConfig.models.map(m => {
                const cached = cachedModels.find(cm => cm.id.toLowerCase() === m.id.toLowerCase());
                return {
                    id: m.id,
                    name: m.name,
                    displayName: m.name,
                    ownedBy: 'antigravity',
                    maxTokens: m.maxInputTokens,
                    maxOutputTokens: m.maxOutputTokens,
                    quotaInfo: cached?.quotaInfo
                };
            });
        } catch {
            return [];
        }
    }

    static async refreshModels(): Promise<AntigravityModel[]> {
        const token = await AntigravityAuth.getAccessToken();
        if (!token) {
            return [];
        }
        const models = await AntigravityAuth.fetchModels(token);
        const stored = await ApiKeyManager.getApiKey(PROVIDER_KEY);
        if (stored) {
            try {
                const authData = JSON.parse(stored);
                authData.models = models;
                await ApiKeyManager.setApiKey(PROVIDER_KEY, JSON.stringify(authData));
            } catch {
                /* Ignore parse errors */
            }
        }
        return models;
    }
}
