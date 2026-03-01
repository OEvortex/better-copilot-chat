import * as vscode from 'vscode';
import { AccountQuotaCache } from '../../accounts/accountQuotaCache';
import type { ModelConfig } from '../../types/sharedTypes';
import { Logger } from '../../utils/logger';
import { QuotaNotificationManager } from '../../utils/quotaNotificationManager';
import { RateLimiter } from '../../utils/rateLimiter';
import { TokenCounter } from '../../utils/tokenCounter';
import { TokenTelemetryTracker } from '../../utils/tokenTelemetryTracker';
import { OpenAIStreamProcessor } from '../openai/openaiStreamProcessor';
import { AntigravityAuth } from './auth';
import { aliasToModelName, prepareAntigravityRequest } from './requestHelpers';
import { storeToolCallSignature } from './signatureCache';
import { AntigravityStreamProcessor } from './streamProcessor';
import {
    type AntigravityPayload,
    ErrorCategory,
    type QuotaState,
    RateLimitAction
} from './types';

export const DEFAULT_BASE_URLS = [
    'https://daily-cloudcode-pa.sandbox.googleapis.com',
    'https://cloudcode-pa.googleapis.com'
];
export const DEFAULT_USER_AGENT = 'antigravity/1.18.3';
const RATE_LIMIT_MAX_RETRIES = 5;
const RATE_LIMIT_BASE_DELAY_MS = 1000;
const RATE_LIMIT_MAX_DELAY_MS = 30000;
const QUOTA_BACKOFF_BASE_MS = 1000;
const QUOTA_BACKOFF_MAX_MS = 30 * 60 * 1000;
export const QUOTA_EXHAUSTED_THRESHOLD_MS = 10 * 60 * 1000;
export const QUOTA_COOLDOWN_WAIT_MAX_MS = 2 * 60 * 1000;

export function storeThoughtSignature(callId: string, signature: string): void {
    if (callId && signature) {
        storeToolCallSignature(callId, signature);
    }
}

export function categorizeHttpStatus(statusCode: number): ErrorCategory {
    switch (statusCode) {
        case 400:
            return ErrorCategory.UserError;
        case 401:
            return ErrorCategory.AuthError;
        case 402:
        case 403:
        case 429:
            return ErrorCategory.QuotaError;
        case 404:
            return ErrorCategory.NotFound;
        case 500:
        case 502:
        case 503:
        case 504:
            return ErrorCategory.Transient;
        default:
            return ErrorCategory.Unknown;
    }
}

export function shouldFallback(category: ErrorCategory): boolean {
    return (
        category === ErrorCategory.QuotaError ||
        category === ErrorCategory.Transient ||
        category === ErrorCategory.AuthError
    );
}

export function isPermissionDeniedError(statusCode: number | undefined, bodyText: string | undefined): boolean {
    if (statusCode !== 403 || !bodyText) {
        return false;
    }
    if (bodyText.toLowerCase().includes('permission denied')) {
        return true;
    }
    try {
        const parsed = JSON.parse(bodyText);
        if (parsed?.error?.status === 'PERMISSION_DENIED') {
            return true;
        }
        const details = parsed?.error?.details;
        if (Array.isArray(details)) {
            for (const detail of details) {
                if (
                    detail['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' &&
                    detail.reason === 'CONSUMER_INVALID'
                ) {
                    return true;
                }
            }
        }
    } catch {
        /* Ignore JSON parse errors */
    }
    return false;
}

function parseSecondsDuration(duration: string): number | null {
    const match = duration.match(/^(\d+(?:\.\d+)?)s$/);
    return match ? Math.round(parseFloat(match[1]) * 1000) : null;
}

function parseDurationFormat(duration: string): number | null {
    const simpleSeconds = parseSecondsDuration(duration);
    if (simpleSeconds !== null) {
        return simpleSeconds;
    }
    let totalMs = 0;
    const hourMatch = duration.match(/(\d+)h/);
    const minMatch = duration.match(/(\d+)m/);
    const secMatch = duration.match(/(\d+(?:\.\d+)?)s/);
    if (hourMatch) {
        totalMs += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
    }
    if (minMatch) {
        totalMs += parseInt(minMatch[1], 10) * 60 * 1000;
    }
    if (secMatch) {
        totalMs += Math.round(parseFloat(secMatch[1]) * 1000);
    }
    return totalMs > 0 ? totalMs : null;
}

export function parseQuotaRetryDelay(errorBody: string): number | null {
    try {
        const parsed = JSON.parse(errorBody);
        // Handle nested error structure: { "error": { "code": 429, ... } }
        const errorObj = parsed?.error || parsed;
        const details = errorObj?.details || (Array.isArray(parsed) ? parsed[0]?.error?.details : null);
        if (!details) {
            // Try to extract retry delay from error message or metadata
            if (errorObj?.metadata?.quotaResetDelay) {
                const d = parseDurationFormat(errorObj.metadata.quotaResetDelay);
                if (d !== null && d > 0) {
                    return d;
                }
            }
            return null;
        }
        for (const detail of details) {
            if (detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo' && detail.retryDelay) {
                const d = parseSecondsDuration(detail.retryDelay);
                if (d !== null && d > 0) {
                    return d;
                }
            }
            if (detail['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' && detail.metadata?.quotaResetDelay) {
                const d = parseDurationFormat(detail.metadata.quotaResetDelay);
                if (d !== null && d > 0) {
                    return d;
                }
            }
        }
    } catch {
        /* Ignore JSON parse errors */
    }
    return null;
}

export function sleepWithCancellation(ms: number, token: vscode.CancellationToken): Promise<void> {
    return new Promise(resolve => {
        if (ms <= 0) {
            resolve();
            return;
        }
        const timeout = setTimeout(resolve, ms);
        const disposable = token.onCancellationRequested(() => {
            clearTimeout(timeout);
            resolve();
        });
        setTimeout(() => disposable.dispose(), ms + 100);
    });
}

export class QuotaStateManager {
    private static instance: QuotaStateManager;
    private modelStates = new Map<string, QuotaState>();
    static getInstance(): QuotaStateManager {
        if (!QuotaStateManager.instance) {
            QuotaStateManager.instance = new QuotaStateManager();
        }
        return QuotaStateManager.instance;
    }

    markQuotaExceeded(modelId: string, retryAfterMs?: number): void {
        const existing = this.modelStates.get(modelId) || {
            isExhausted: false,
            resetsAt: 0,
            lastUpdated: 0,
            exceeded: false,
            nextRecoverAt: 0,
            backoffLevel: 0
        };
        let cooldown = QUOTA_BACKOFF_BASE_MS * 2 ** (existing.backoffLevel || 0);
        if (cooldown > QUOTA_BACKOFF_MAX_MS) {
            cooldown = QUOTA_BACKOFF_MAX_MS;
        }
        const actualCooldown = retryAfterMs && retryAfterMs > cooldown ? retryAfterMs : cooldown;
        this.modelStates.set(modelId, {
            isExhausted: true,
            resetsAt: Date.now() + actualCooldown,
            lastUpdated: Date.now(),
            exceeded: true,
            nextRecoverAt: Date.now() + actualCooldown,
            backoffLevel: (existing.backoffLevel || 0) + 1,
            lastError: `Quota exceeded, retry after ${Math.round(actualCooldown / 1000)}s`
        });
    }

    clearQuotaExceeded(modelId: string): void {
        const existing = this.modelStates.get(modelId);
        if (existing) {
            existing.exceeded = false;
            existing.backoffLevel = 0;
            existing.lastError = undefined;
        }
    }

    isInCooldown(modelId: string): boolean {
        const state = this.modelStates.get(modelId);
        if (!state || !state.exceeded) {
            return false;
        }
        if (Date.now() >= (state.nextRecoverAt || 0)) {
            this.clearQuotaExceeded(modelId);
            return false;
        }
        return true;
    }

    getRemainingCooldown(modelId: string): number {
        const state = this.modelStates.get(modelId);
        if (!state || !state.exceeded) {
            return 0;
        }
        const remaining = (state.nextRecoverAt || 0) - Date.now();
        return remaining > 0 ? remaining : 0;
    }
}

export class RateLimitRetrier {
    private retryCount = 0;
    async handleRateLimit(
        hasNextUrl: boolean,
        errorBody: string,
        token: vscode.CancellationToken
    ): Promise<RateLimitAction> {
        if (hasNextUrl) {
            return RateLimitAction.Continue;
        }
        if (this.retryCount >= RATE_LIMIT_MAX_RETRIES) {
            return RateLimitAction.MaxExceeded;
        }
        let delay = RATE_LIMIT_BASE_DELAY_MS * 2 ** this.retryCount;
        const serverDelay = parseQuotaRetryDelay(errorBody);
        if (serverDelay !== null) {
            delay = Math.min(serverDelay + 500, RATE_LIMIT_MAX_DELAY_MS);
        } else if (delay > RATE_LIMIT_MAX_DELAY_MS) {
            delay = RATE_LIMIT_MAX_DELAY_MS;
        }
        this.retryCount++;
        await sleepWithCancellation(delay, token);
        return token.isCancellationRequested ? RateLimitAction.MaxExceeded : RateLimitAction.Retry;
    }
}


export function extractToolCallFromGeminiResponse(part: Record<string, unknown>): {
    callId?: string;
    name?: string;
    args?: unknown;
    thoughtSignature?: string;
} | null {
    const functionCall = part.functionCall as { name?: string; args?: unknown; id?: string } | undefined;
    if (!functionCall?.name) {
        return null;
    }
    return {
        callId: functionCall.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        name: functionCall.name,
        args: functionCall.args,
        thoughtSignature: part.thoughtSignature as string | undefined
    };
}

export class AntigravityHandler {
    private readonly quotaManager = QuotaStateManager.getInstance();
    private readonly accountQuotaCache = AccountQuotaCache.getInstance();
    private readonly quotaNotificationManager = new QuotaNotificationManager();
    private cacheUpdateTimers = new Map<string, NodeJS.Timeout>();
    private pendingCacheUpdates = new Map<string, () => Promise<void>>();
    private projectIdCache: string | null = null;
    private projectIdPromise: Promise<string> | null = null;

    constructor(private readonly displayName: string) {}

    async handleRequest(
        model: vscode.LanguageModelChatInformation,
        modelConfig: ModelConfig,
        messages: readonly vscode.LanguageModelChatMessage[],
        options: vscode.ProvideLanguageModelChatResponseOptions,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
        token: vscode.CancellationToken,
        accessToken?: string,
        accountId?: string,
        loadBalanceEnabled?: boolean
    ): Promise<void> {
        // Apply rate limiting: 2 requests per 1 second
        await RateLimiter.getInstance('antigravity', 2, 1000).throttle(this.displayName);

        const authToken = accessToken || (await AntigravityAuth.getAccessToken());
        if (!authToken) {
            throw new Error('Not logged in to Antigravity. Please login first.');
        }
        const requestModel = modelConfig.model || model.id;
        const resolvedModel = aliasToModelName(requestModel);
        const effectiveAccountId = accountId || 'default-antigravity';
        const quotaKey = `${effectiveAccountId}:${resolvedModel}`;

        if (this.quotaManager.isInCooldown(quotaKey)) {
            const remaining = this.quotaManager.getRemainingCooldown(quotaKey);
            if (remaining > 5000) {
                this.quotaNotificationManager.notifyQuotaExceeded(
                    remaining,
                    resolvedModel,
                    accountId,
                    this.displayName
                );
            }
            if (remaining > QUOTA_COOLDOWN_WAIT_MAX_MS) {
                this.debouncedCacheUpdate(
                    `quota-${effectiveAccountId}`,
                    () =>
                        this.accountQuotaCache.markQuotaExceeded(effectiveAccountId, 'antigravity', {
                            accountName: this.displayName,
                            resetDelayMs: remaining,
                            affectedModel: resolvedModel,
                            error: 'Quota cooldown exceeds max wait threshold'
                        }),
                    50
                );
                await this.quotaNotificationManager.notifyQuotaTooLong(
                    remaining,
                    resolvedModel,
                    accountId,
                    this.displayName
                );
                throw new Error(
                    `Quota wait too long (${this.quotaNotificationManager.formatDuration(remaining)}). Please add another account or try again later.`
                );
            }
            await sleepWithCancellation(remaining, token);
            if (token.isCancellationRequested) {
                throw new vscode.CancellationError();
            }
        }

        const projectId = await this.getProjectId(authToken);
        const { payload } = prepareAntigravityRequest(
            model,
            modelConfig,
            messages,
            options,
            projectId
        );
        const baseUrls = modelConfig.baseUrl
            ? [modelConfig.baseUrl.replace(/\/v1internal\/?$/, '')]
            : [...DEFAULT_BASE_URLS];
        const abortController = new AbortController();
        const cancelListener = token.onCancellationRequested(() => abortController.abort());
        const retrier = new RateLimitRetrier();
        progress.report(new vscode.LanguageModelTextPart(''));
        let lastStatus = 0,
            lastBody = '',
            lastError: Error | null = null;

        try {
            for (let idx = 0; idx < baseUrls.length; idx++) {
                const url = `${baseUrls[idx].replace(/\/$/, '')}/v1internal:streamGenerateContent?alt=sse`;
                if (token.isCancellationRequested) {
                    throw new vscode.CancellationError();
                }
                try {
                    const result = await this.streamRequest(
                        url,
                        authToken,
                        payload,
                        modelConfig,
                        progress,
                        token,
                        abortController
                    );
                    if (result.success) {
                        this.quotaManager.clearQuotaExceeded(quotaKey);
                        this.quotaNotificationManager.clearQuotaCountdown();
                        this.debouncedCacheUpdate(
                            `success-${effectiveAccountId}`,
                            () =>
                                this.accountQuotaCache.recordSuccess(
                                    effectiveAccountId,
                                    'antigravity',
                                    this.displayName
                                ),
                            50
                        );
                        
                        try {
                            const promptTokens = await TokenCounter.getInstance().countMessagesTokens(
                                model,
                                [...messages],
                                { sdkMode: modelConfig.sdkMode || 'gemini' },
                                options
                            );
                            TokenTelemetryTracker.getInstance().recordSuccess({
                                modelId: model.id,
                                modelName: model.name,
                                providerId: 'antigravity',
                                promptTokens,
                                completionTokens: 0,
                                totalTokens: promptTokens,
                                maxInputTokens: model.maxInputTokens,
                                maxOutputTokens: model.maxOutputTokens,
                                estimatedPromptTokens: true
                            });
                        } catch (e) {
                            Logger.trace(`[Antigravity] Failed to estimate prompt tokens: ${String(e)}`);
                        }
                        return;
                    }
                    if (isPermissionDeniedError(result.status, result.body)) {
                        this.debouncedCacheUpdate(
                            `failure-${effectiveAccountId}`,
                            () =>
                                this.accountQuotaCache.recordFailure(
                                    effectiveAccountId,
                                    'antigravity',
                                    `HTTP ${result.status || 403}: ${result.body || 'Permission denied'}`,
                                    this.displayName
                                ),
                            50
                        );
                        throw new Error(result.body || 'Permission denied on Antigravity project.');
                    }
                    const category = categorizeHttpStatus(result.status || 0);
                    if (category === ErrorCategory.QuotaError) {
                        lastStatus = result.status || 0;
                        lastBody = result.body || '';
                        const quotaDelay = parseQuotaRetryDelay(lastBody);
                        this.quotaManager.markQuotaExceeded(quotaKey, quotaDelay || undefined);
                        const cooldownRemaining = this.quotaManager.getRemainingCooldown(quotaKey);
                        if (cooldownRemaining > 5000) {
                            this.quotaNotificationManager.notifyQuotaExceeded(
                                cooldownRemaining,
                                resolvedModel,
                                effectiveAccountId,
                                this.displayName
                            );
                        }
                        this.debouncedCacheUpdate(
                            `quota-${effectiveAccountId}`,
                            () =>
                                this.accountQuotaCache.markQuotaExceeded(effectiveAccountId, 'antigravity', {
                                    accountName: this.displayName,
                                    resetDelayMs: quotaDelay || cooldownRemaining,
                                    affectedModel: resolvedModel,
                                    error: `HTTP ${lastStatus}: Quota exceeded`
                                }),
                            50
                        );
                        if (cooldownRemaining > QUOTA_COOLDOWN_WAIT_MAX_MS) {
                            await this.quotaNotificationManager.notifyQuotaTooLong(
                                cooldownRemaining,
                                resolvedModel,
                                effectiveAccountId,
                                this.displayName
                            );
                            throw new Error(
                                `Quota wait too long (${this.quotaNotificationManager.formatDuration(cooldownRemaining)}). Please add another account or try again later.`
                            );
                        }
                        if (quotaDelay && quotaDelay > QUOTA_EXHAUSTED_THRESHOLD_MS) {
                            throw new Error(
                                `Account quota exhausted (quota resets in ${this.quotaNotificationManager.formatDuration(quotaDelay)}). Please wait or use a different account.`
                            );
                        }
                        if (idx + 1 < baseUrls.length) {
                            continue;
                        }
                        if (loadBalanceEnabled !== false) {
                            const action = await retrier.handleRateLimit(false, lastBody, token);
                            if (action === RateLimitAction.Retry) {
                                idx--;
                                continue;
                            }
                        }
                        throw new Error(
                            `Quota exceeded${quotaDelay ? ` (quota resets in ${this.quotaNotificationManager.formatDuration(quotaDelay)})` : ''}: ${lastBody || `HTTP ${result.status}`}`
                        );
                    }
                    if (category === ErrorCategory.Transient && shouldFallback(category)) {
                        lastStatus = result.status || 0;
                        lastBody = result.body || '';
                        const retryDelay = parseQuotaRetryDelay(lastBody);

                        if (idx + 1 < baseUrls.length) {
                            Logger.warn(
                                `[antigravity] Transient HTTP ${lastStatus} on ${baseUrls[idx]}. Trying fallback endpoint${retryDelay ? ` after ${this.quotaNotificationManager.formatDuration(retryDelay)}` : ''}.`
                            );
                            continue;
                        }

                        const action = await retrier.handleRateLimit(false, lastBody, token);
                        if (action === RateLimitAction.Retry) {
                            Logger.warn(
                                `[antigravity] Transient HTTP ${lastStatus}. Retrying request${retryDelay ? ` after ${this.quotaNotificationManager.formatDuration(retryDelay)}` : ''}.`
                            );
                            idx--;
                            continue;
                        }

                        throw new Error(
                            `HTTP ${lastStatus}${retryDelay ? ` (retry in ${this.quotaNotificationManager.formatDuration(retryDelay)})` : ''}: ${lastBody || result.statusText || 'Transient server error'}`
                        );
                    }
                    if (category === ErrorCategory.AuthError) {
                        throw new Error('Authentication failed. Please re-login to Antigravity.');
                    }
                    if (result.status === 404 && idx + 1 < baseUrls.length) {
                        lastStatus = result.status;
                        lastBody = result.body || '';
                        continue;
                    }
                    throw new Error(result.body || `HTTP ${result.status} ${result.statusText}`);
                } catch (error) {
                    if (error instanceof vscode.CancellationError) {
                        throw error;
                    }
                    if (
                        error instanceof Error &&
                        (error.message.startsWith('Quota exceeded') ||
                            error.message.startsWith('Rate limited') ||
                            error.message.startsWith('HTTP') ||
                            error.message.startsWith('Authentication failed'))
                    ) {
                        throw error;
                    }
                    lastStatus = 0;
                    lastBody = '';
                    lastError = error instanceof Error ? error : new Error(String(error));
                    if (idx + 1 < baseUrls.length) {
                        continue;
                    }
                    throw error;
                }
            }
            if (lastStatus !== 0) {
                const retryDelay = parseQuotaRetryDelay(lastBody);
                throw new Error(
                    `HTTP ${lastStatus}${retryDelay ? ` (retry in ${this.quotaNotificationManager.formatDuration(retryDelay)})` : ''}: ${lastBody}`
                );
            }
            if (lastError) {
                throw lastError;
            }
            throw new Error('All Antigravity endpoints unavailable');
        } finally {
            cancelListener.dispose();
        }
    }

    private async streamRequest(
        url: string,
        accessToken: string,
        payload: AntigravityPayload,
        modelConfig: ModelConfig,
        progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
        token: vscode.CancellationToken,
        abortController: AbortController
    ): Promise<{
        success: boolean;
        status?: number;
        statusText?: string;
        body?: string;
    }> {
        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                    'User-Agent': DEFAULT_USER_AGENT
                },
                body: JSON.stringify(payload),
                signal: abortController.signal
            });
        } catch (error) {
            if (token.isCancellationRequested || abortController.signal.aborted) {
                throw new vscode.CancellationError();
            }
            throw error;
        }
        if (!response.ok) {
            return {
                success: false,
                status: response.status,
                statusText: response.statusText,
                body: await response.text()
            };
        }
        if (modelConfig.sdkMode === 'openai') {
            await new OpenAIStreamProcessor().processStream({
                response,
                modelConfig,
                progress,
                token
            });
        } else {
            await new AntigravityStreamProcessor().processStream({
                response,
                modelConfig,
                progress,
                token
            });
        }
        return { success: true };
    }

    private async getProjectId(accessToken?: string): Promise<string> {
        if (this.projectIdCache) {
            return this.projectIdCache;
        }
        if (this.projectIdPromise) {
            return this.projectIdPromise;
        }
        this.projectIdPromise = AntigravityAuth.ensureProjectId(accessToken)
            .then(projectId => {
                this.projectIdCache = projectId;
                this.projectIdPromise = null;
                return projectId;
            })
            .catch(err => {
                this.projectIdPromise = null;
                throw err;
            });
        return this.projectIdPromise;
    }

    isInCooldown(modelId: string, accountId?: string): boolean {
        return this.quotaManager.isInCooldown(`${accountId || 'default-antigravity'}:${aliasToModelName(modelId)}`);
    }
    getRemainingCooldown(modelId: string, accountId?: string): number {
        return this.quotaManager.getRemainingCooldown(
            `${accountId || 'default-antigravity'}:${aliasToModelName(modelId)}`
        );
    }

    private debouncedCacheUpdate(key: string, updateFn: () => Promise<void>, delayMs: number): void {
        const existingTimer = this.cacheUpdateTimers.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        this.pendingCacheUpdates.set(key, updateFn);
        const timer = setTimeout(() => {
            const fn = this.pendingCacheUpdates.get(key);
            if (fn) {
                void fn().catch(() => {});
                this.pendingCacheUpdates.delete(key);
            }
            this.cacheUpdateTimers.delete(key);
        }, delayMs);
        this.cacheUpdateTimers.set(key, timer);
    }
}
