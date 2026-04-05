import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './rateLimiter';

vi.mock('./logger', () => ({
    Logger: {
        trace: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

describe('RateLimiter', () => {
    beforeEach(() => {
        vi.useFakeTimers({
            toFake: [
                'Date',
                'setTimeout',
                'clearTimeout',
                'setInterval',
                'clearInterval',
                'setImmediate',
                'clearImmediate',
                'queueMicrotask'
            ]
        });
        vi.setSystemTime(0);
        // Clear singleton instances between tests by accessing the private map
        (
            RateLimiter as unknown as { instances: Map<string, RateLimiter> }
        ).instances.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('getInstance', () => {
        it('creates a new instance for a new key', () => {
            const limiter = RateLimiter.getInstance('provider-a');
            expect(limiter).toBeInstanceOf(RateLimiter);
        });

        it('returns the same instance for the same key', () => {
            const a = RateLimiter.getInstance('provider-b');
            const b = RateLimiter.getInstance('provider-b');
            expect(a).toBe(b);
        });

        it('returns different instances for different keys', () => {
            const a = RateLimiter.getInstance('provider-c');
            const b = RateLimiter.getInstance('provider-d');
            expect(a).not.toBe(b);
        });

        it('accepts custom maxRequests and windowMs', () => {
            const limiter = RateLimiter.getInstance('custom', 5, 2000);
            expect(limiter).toBeInstanceOf(RateLimiter);
        });
    });

    describe('throttle', () => {
        it('allows first request immediately', async () => {
            const limiter = RateLimiter.getInstance('throttle-test-1', 2, 1000);

            const start = Date.now();
            await limiter.throttle('test-provider');
            const elapsed = Date.now() - start;

            expect(elapsed).toBe(0);
        });

        it('allows requests within the rate limit', async () => {
            const limiter = RateLimiter.getInstance('throttle-test-2', 3, 1000);

            // All 3 requests within the window should pass without waiting
            await limiter.throttle('test-provider');
            await limiter.throttle('test-provider');
            await limiter.throttle('test-provider');

            // All completed without delay
            expect(Date.now()).toBe(0);
        });

        it('throttles when rate limit is exceeded', async () => {
            const limiter = RateLimiter.getInstance('throttle-test-3', 2, 1000);

            // First 2 requests pass immediately
            await limiter.throttle('test-provider');
            await limiter.throttle('test-provider');

            // 3rd request should trigger a wait
            const throttlePromise = limiter.throttle('test-provider');

            // Advance time to cover the wait
            await vi.advanceTimersByTimeAsync(1100);

            // Should resolve after waiting
            await expect(throttlePromise).resolves.toBeUndefined();
        });

        it('resets window after windowMs elapses', async () => {
            const limiter = RateLimiter.getInstance('throttle-test-4', 2, 1000);

            // Exhaust the window
            await limiter.throttle('test-provider');
            await limiter.throttle('test-provider');

            // Advance past the window
            await vi.advanceTimersByTimeAsync(1500);

            // Should allow new requests without throttling
            await limiter.throttle('test-provider');
            await limiter.throttle('test-provider');

            expect(Date.now()).toBe(1500);
        });

        it('handles rapid sequential requests correctly', async () => {
            const limiter = RateLimiter.getInstance('throttle-test-5', 1, 500);

            // First request passes
            await limiter.throttle('test-provider');

            // Second request waits for window reset
            const p2 = limiter.throttle('test-provider');
            await vi.advanceTimersByTimeAsync(600);
            await p2;

            // Third request waits again
            const p3 = limiter.throttle('test-provider');
            await vi.advanceTimersByTimeAsync(600);
            await p3;

            expect(Date.now()).toBe(1200);
        });

        it('uses default parameters when not specified', async () => {
            // Default: 2 requests per 1000ms
            const limiter = RateLimiter.getInstance('throttle-test-6');

            await limiter.throttle('test-provider');
            await limiter.throttle('test-provider');

            // 3rd should throttle
            const p = limiter.throttle('test-provider');
            await vi.advanceTimersByTimeAsync(1100);
            await p;
        });
    });

    describe('window behavior', () => {
        it('counts requests within the same window', async () => {
            const limiter = RateLimiter.getInstance('window-test-1', 2, 1000);

            // At t=0: request 1
            await limiter.throttle('p');

            // At t=400: request 2 (same window)
            await vi.advanceTimersByTimeAsync(400);
            await limiter.throttle('p');

            // At t=400: request 3 (should throttle, limit reached)
            const p3 = limiter.throttle('p');

            // Window resets at t=1000, so wait until then
            await vi.advanceTimersByTimeAsync(700);
            await p3;

            expect(Date.now()).toBe(1100);
        });

        it('does not throttle requests in different windows', async () => {
            const limiter = RateLimiter.getInstance('window-test-2', 1, 500);

            // Window 1
            await limiter.throttle('p');

            // Advance past window
            await vi.advanceTimersByTimeAsync(600);

            // Window 2 - should not throttle
            await limiter.throttle('p');

            expect(Date.now()).toBe(600);
        });
    });

    describe('executeWithRetry', () => {
        it('executes operation successfully on first attempt', async () => {
            const limiter = RateLimiter.getInstance('retry-test-1', 10, 1000);
            const operation = vi.fn().mockResolvedValue('success');

            const result = await limiter.executeWithRetry(
                operation,
                'test-provider'
            );

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('retries on rate limit error and succeeds', async () => {
            const limiter = RateLimiter.getInstance('retry-test-2', 10, 1000);
            const error429 = new Error('Rate limit exceeded: 429');
            (error429 as any).status = 429;

            const operation = vi
                .fn()
                .mockRejectedValueOnce(error429)
                .mockRejectedValueOnce(error429)
                .mockResolvedValue('success-after-retry');

            // Mock the retry delay to complete immediately
            const originalSetTimeout = global.setTimeout;
            vi.spyOn(global, 'setTimeout').mockImplementation(
                (cb: any, ms?: any) => {
                    if (ms && ms > 0) {
                        // Execute callback immediately for test
                        (cb as Function)();
                        return originalSetTimeout(() => {}, 0);
                    }
                    return originalSetTimeout(cb, ms);
                }
            );

            const result = await limiter.executeWithRetry(
                operation,
                'test-provider'
            );

            expect(result).toBe('success-after-retry');
            expect(operation).toHaveBeenCalledTimes(3);

            vi.restoreAllMocks();
        });

        it('throws non-rate-limit errors immediately', async () => {
            const limiter = RateLimiter.getInstance('retry-test-3', 10, 1000);
            const nonRetryableError = new Error('Invalid API key: 401');

            const operation = vi.fn().mockRejectedValue(nonRetryableError);

            await expect(
                limiter.executeWithRetry(operation, 'test-provider')
            ).rejects.toThrow('Invalid API key: 401');

            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('throws after exhausting all retry attempts for rate limit errors', async () => {
            const limiter = RateLimiter.getInstance('retry-test-4', 10, 1000);
            const error429 = new Error('Rate limit exceeded: 429');
            (error429 as any).status = 429;

            const operation = vi.fn().mockRejectedValue(error429);

            // Mock the retry delay to complete immediately
            const originalSetTimeout = global.setTimeout;
            vi.spyOn(global, 'setTimeout').mockImplementation(
                (cb: any, ms?: any) => {
                    if (ms && ms > 0) {
                        (cb as Function)();
                        return originalSetTimeout(() => {}, 0);
                    }
                    return originalSetTimeout(cb, ms);
                }
            );

            await expect(
                limiter.executeWithRetry(operation, 'test-provider')
            ).rejects.toThrow('Rate limit exceeded: 429');

            // Should have tried maxAttempts (5) + 1 initial = 6 times
            expect(operation).toHaveBeenCalledTimes(6);

            vi.restoreAllMocks();
        });
    });
});
