/*---------------------------------------------------------------------------------------------
 *  Retry Manager
 *  Provides exponential backoff retry mechanism with specialized handling for 429 rate limit errors
 *--------------------------------------------------------------------------------------------*/

import { Logger } from './logger';

/**
 * Retry configuration interface
 * Defines the parameters for controlling retry behavior
 */
export interface RetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitterEnabled: boolean;
}

/**
 * Retryable error type definition
 * Extends Error with optional HTTP status codes
 */
export type RetryableError = Error & {
    status?: number;
    statusCode?: number;
    message: string;
};

/**
 * Default retry configuration
 * Conservative settings suitable for most API rate limiting scenarios
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterEnabled: true
};

/**
 * Default retry configuration for rate limit (429) errors
 * More aggressive retries with longer delays for rate limiting
 */
const RATE_LIMIT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 5,
    initialDelayMs: 2000,
    maxDelayMs: 120000,
    backoffMultiplier: 2.5,
    jitterEnabled: true
};

/**
 * Retry Manager class
 * Implements exponential backoff with optional jitter for resilient API calls
 */
export class RetryManager {
    private config: RetryConfig;

    constructor(config?: Partial<RetryConfig>) {
        this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    }

    /**
     * Execute an operation with automatic retry logic
     * @param operation The async operation to execute
     * @param isRetryable Function to determine if an error is retryable
     * @param providerName Provider name for logging purposes
     * @returns The result of the successful operation
     * @throws The last error if all retry attempts fail
     */
    async executeWithRetry<T>(
        operation: () => Promise<T>,
        isRetryable: (error: RetryableError) => boolean,
        providerName: string
    ): Promise<T> {
        return this.executeWithRetryInternal(
            operation,
            isRetryable,
            providerName,
            this.config
        );
    }

    /**
     * Execute an operation with automatic retry logic specifically for rate limit (429) errors
     * Uses more aggressive retry settings with longer delays
     * @param operation The async operation to execute
     * @param providerName Provider name for logging purposes
     * @returns The result of the successful operation
     * @throws The last error if all retry attempts fail
     */
    async executeWithRateLimitRetry<T>(
        operation: () => Promise<T>,
        providerName: string
    ): Promise<T> {
        return this.executeWithRetryInternal(
            operation,
            (error) => RetryManager.isRateLimitError(error),
            providerName,
            RATE_LIMIT_RETRY_CONFIG
        );
    }

    /**
     * Internal implementation for retry logic
     */
    private async executeWithRetryInternal<T>(
        operation: () => Promise<T>,
        isRetryable: (error: RetryableError) => boolean,
        providerName: string,
        config: RetryConfig
    ): Promise<T> {
        let lastError: RetryableError | undefined;
        let attempt = 0;
        let delayMs = config.initialDelayMs;

        // Initial attempt
        Logger.trace(`[${providerName}] Starting initial request`);
        try {
            const result = await operation();
            return result;
        } catch (error) {
            lastError = error as RetryableError;
            // If the initial request fails and is not retryable, throw immediately
            if (!isRetryable(lastError)) {
                Logger.warn(
                    `[${providerName}] Initial request failed (non-retryable): ${lastError.message}`
                );
                throw lastError;
            }
            Logger.warn(
                `[${providerName}] Initial request failed, initiating retry mechanism: ${lastError.message}`
            );
        }

        // Retry loop
        while (attempt < config.maxAttempts) {
            attempt++;

            // Calculate delay with optional jitter to prevent thundering herd
            const jitter = config.jitterEnabled ? Math.random() * 0.1 : 0;
            const actualDelayMs = Math.min(
                delayMs * (1 + jitter),
                config.maxDelayMs
            );
            Logger.info(
                `[${providerName}] Rate limit retry in ${actualDelayMs / 1000} seconds...`
            );

            // Wait for the calculated delay
            await this.delay(actualDelayMs);

            // Execute retry attempt
            Logger.info(
                `[${providerName}] Retry attempt #${attempt}/${config.maxAttempts}`
            );
            try {
                const result = await operation();
                Logger.info(
                    `[${providerName}] Retry successful after ${attempt} attempt(s)`
                );
                return result;
            } catch (error) {
                lastError = error as RetryableError;

                // If the error is not retryable, stop immediately
                if (!isRetryable(lastError)) {
                    Logger.warn(
                        `[${providerName}] Retry attempt #${attempt} failed (non-retryable): ${lastError.message}`
                    );
                    break;
                }

                Logger.warn(
                    `[${providerName}] Retry attempt #${attempt} failed, preparing next retry: ${lastError.message}`
                );

                // Exponentially increase delay for next attempt
                delayMs *= config.backoffMultiplier;
            }
        }

        // All retry attempts exhausted, throw the last error
        if (lastError) {
            Logger.error(
                `[${providerName}] All retry attempts exhausted: ${lastError.message}`
            );
            throw lastError;
        } else {
            throw new Error(`[${providerName}] Unknown error occurred`);
        }
    }

    /**
     * Check if an error is a rate limit (429) error
     * @param error The error object to check
     * @returns True if the error is a 429 rate limit error
     */
    static isRateLimitError(error: unknown): boolean {
        if (!error) {
            return false;
        }

        const candidate = error as {
            code?: unknown;
            constructor?: { name?: unknown };
            error?: {
                code?: unknown;
                status?: unknown;
                statusCode?: unknown;
            };
            headers?: unknown;
            message?: unknown;
            name?: unknown;
            response?: {
                status?: unknown;
                statusCode?: unknown;
            };
            status?: unknown;
            statusCode?: unknown;
        };

        const statusCandidates = [
            candidate.status,
            candidate.statusCode,
            candidate.response?.status,
            candidate.response?.statusCode,
            candidate.error?.status,
            candidate.error?.statusCode,
            candidate.code,
            candidate.error?.code
        ];

        if (
            statusCandidates.some((value) => value === 429 || value === '429')
        ) {
            return true;
        }

        const name = String(
            candidate.name || candidate.constructor?.name || ''
        );
        if (
            name.toLowerCase().includes('rate') &&
            name.toLowerCase().includes('limit')
        ) {
            return true;
        }

        const message = String(
            candidate.message || (error as Error).message || ''
        );
        return (
            message.includes('429') ||
            /rate\s*limit/i.test(message) ||
            /too many requests/i.test(message) ||
            /RESOURCE_EXHAUSTED/i.test(message) ||
            /Resource has been exhausted/i.test(message)
        );
    }

    /**
     * Delay execution for a specified number of milliseconds
     * @param ms Milliseconds to delay
     * @returns Promise that resolves after the delay
     */
    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
