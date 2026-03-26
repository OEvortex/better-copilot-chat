import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryManager, type RetryableError } from './retryManager';

vi.mock('./logger', () => ({
    Logger: {
        trace: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

describe('RetryManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('executeWithRetry', () => {
        it('returns result on first successful attempt', async () => {
            const manager = new RetryManager();
            const operation = vi.fn().mockResolvedValue('success');

            const result = await manager.executeWithRetry(
                operation,
                () => true,
                'test-provider'
            );

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('throws immediately for non-retryable errors', async () => {
            const manager = new RetryManager();
            const error = new Error('Auth failed') as RetryableError;
            error.status = 401;
            const operation = vi.fn().mockRejectedValue(error);

            await expect(
                manager.executeWithRetry(
                    operation,
                    (e) => e.status !== 401,
                    'test-provider'
                )
            ).rejects.toThrow('Auth failed');

            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('retries on retryable errors and eventually succeeds', async () => {
            const manager = new RetryManager({ maxAttempts: 3, initialDelayMs: 100 });
            const error = new Error('Rate limited') as RetryableError;
            error.status = 429;

            const operation = vi
                .fn()
                .mockRejectedValueOnce(error)
                .mockRejectedValueOnce(error)
                .mockResolvedValue('success');

            const resultPromise = manager.executeWithRetry(
                operation,
                (e) => e.status === 429,
                'test-provider'
            );

            // Advance through delays
            await vi.advanceTimersByTimeAsync(2000);

            const result = await resultPromise;
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(3);
        });

        it('throws after exhausting all retry attempts', async () => {
            const manager = new RetryManager({ maxAttempts: 2, initialDelayMs: 50 });
            const error = new Error('Server error') as RetryableError;
            error.status = 500;
            const operation = vi.fn().mockRejectedValue(error);

            const resultPromise = manager.executeWithRetry(
                operation,
                () => true,
                'test-provider'
            );

            // Catch to prevent unhandled rejection before advancing timers
            resultPromise.catch(() => {});

            await vi.advanceTimersByTimeAsync(5000);

            await expect(resultPromise).rejects.toThrow('Server error');
            // 1 initial + 2 retries
            expect(operation).toHaveBeenCalledTimes(3);
        });

        it('stops retrying when error becomes non-retryable', async () => {
            const manager = new RetryManager({ maxAttempts: 5, initialDelayMs: 50 });
            const retryableError = new Error('Rate limited') as RetryableError;
            retryableError.status = 429;
            const fatalError = new Error('Bad request') as RetryableError;
            fatalError.status = 400;

            const operation = vi
                .fn()
                .mockRejectedValueOnce(retryableError)
                .mockRejectedValueOnce(fatalError);

            const resultPromise = manager.executeWithRetry(
                operation,
                (e) => e.status === 429,
                'test-provider'
            );

            resultPromise.catch(() => {});
            await vi.advanceTimersByTimeAsync(5000);

            await expect(resultPromise).rejects.toThrow('Bad request');
            // 1 initial + 1 retry (second is non-retryable, breaks)
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('applies exponential backoff between retries', async () => {
            const manager = new RetryManager({
                maxAttempts: 3,
                initialDelayMs: 1000,
                backoffMultiplier: 2,
                jitterEnabled: false
            });
            const error = new Error('Error') as RetryableError;
            error.status = 500;

            const timestamps: number[] = [];
            const operation = vi.fn().mockImplementation(() => {
                timestamps.push(Date.now());
                return Promise.reject(error);
            });

            const resultPromise = manager.executeWithRetry(
                operation,
                () => true,
                'test-provider'
            );

            resultPromise.catch(() => {});
            await vi.advanceTimersByTimeAsync(20000);

            await expect(resultPromise).rejects.toThrow();
            expect(operation).toHaveBeenCalledTimes(4); // 1 initial + 3 retries

            // Verify exponential growth: ~1000ms, ~2000ms, ~4000ms gaps
            expect(timestamps.length).toBe(4);
        });

        it('respects maxDelayMs cap', async () => {
            const manager = new RetryManager({
                maxAttempts: 5,
                initialDelayMs: 10000,
                maxDelayMs: 5000,
                backoffMultiplier: 10,
                jitterEnabled: false
            });
            const error = new Error('Error') as RetryableError;
            error.status = 500;
            const operation = vi.fn().mockRejectedValue(error);

            const resultPromise = manager.executeWithRetry(
                operation,
                () => true,
                'test-provider'
            );

            resultPromise.catch(() => {});
            await vi.advanceTimersByTimeAsync(50000);

            await expect(resultPromise).rejects.toThrow();
            expect(operation).toHaveBeenCalledTimes(6);
        });
    });

    describe('isRateLimitError', () => {
        it('detects 429 status code on error object', () => {
            const error = { status: 429, message: 'Too Many Requests' };
            expect(RetryManager.isRateLimitError(error)).toBe(true);
        });

        it('detects 429 as string status', () => {
            const error = { statusCode: '429', message: 'Rate limited' };
            expect(RetryManager.isRateLimitError(error)).toBe(true);
        });

        it('detects 429 in nested response object', () => {
            const error = {
                response: { status: 429 },
                message: 'Rate limited'
            };
            expect(RetryManager.isRateLimitError(error)).toBe(true);
        });

        it('detects 429 in nested error object', () => {
            const error = {
                error: { status: 429, code: 429 },
                message: 'Rate limited'
            };
            expect(RetryManager.isRateLimitError(error)).toBe(true);
        });

        it('detects rate limit in error name', () => {
            const error = new Error('limited');
            error.name = 'RateLimitError';
            expect(RetryManager.isRateLimitError(error)).toBe(true);
        });

        it('detects "429" in error message', () => {
            const error = new Error('HTTP 429: Too Many Requests');
            expect(RetryManager.isRateLimitError(error)).toBe(true);
        });

        it('detects "rate limit" in error message', () => {
            const error = new Error('You have been rate limited');
            expect(RetryManager.isRateLimitError(error)).toBe(true);
        });

        it('detects "too many requests" in error message', () => {
            const error = new Error('Too many requests, please try later');
            expect(RetryManager.isRateLimitError(error)).toBe(true);
        });

        it('detects RESOURCE_EXHAUSTED in error message', () => {
            const error = new Error('RESOURCE_EXHAUSTED: quota exceeded');
            expect(RetryManager.isRateLimitError(error)).toBe(true);
        });

        it('returns false for non-rate-limit errors', () => {
            expect(RetryManager.isRateLimitError(new Error('Not found'))).toBe(false);
            expect(RetryManager.isRateLimitError({ status: 500 })).toBe(false);
            expect(RetryManager.isRateLimitError({ status: 401 })).toBe(false);
        });

        it('returns false for null/undefined', () => {
            expect(RetryManager.isRateLimitError(null)).toBe(false);
            expect(RetryManager.isRateLimitError(undefined)).toBe(false);
        });
    });

    describe('custom configuration', () => {
        it('uses default config when none provided', async () => {
            const manager = new RetryManager();
            const error = new Error('Error') as RetryableError;
            error.status = 500;
            const operation = vi.fn().mockRejectedValue(error);

            const resultPromise = manager.executeWithRetry(
                operation,
                () => true,
                'test-provider'
            );

            resultPromise.catch(() => {});
            await vi.advanceTimersByTimeAsync(100000);

            await expect(resultPromise).rejects.toThrow();
            // Default maxAttempts = 3, so 1 initial + 3 retries = 4
            expect(operation).toHaveBeenCalledTimes(4);
        });

        it('merges partial config with defaults', async () => {
            const manager = new RetryManager({ maxAttempts: 1 });
            const error = new Error('Error') as RetryableError;
            error.status = 500;
            const operation = vi.fn().mockRejectedValue(error);

            const resultPromise = manager.executeWithRetry(
                operation,
                () => true,
                'test-provider'
            );

            resultPromise.catch(() => {});
            await vi.advanceTimersByTimeAsync(10000);

            await expect(resultPromise).rejects.toThrow();
            // 1 initial + 1 retry = 2
            expect(operation).toHaveBeenCalledTimes(2);
        });
    });
});
