/*---------------------------------------------------------------------------------------------
 *  Retry Manager
 *  Provides exponential backoff retry mechanism with specialized handling for 429 rate limit errors
 *--------------------------------------------------------------------------------------------*/

import { Logger } from "./logger";

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
	jitterEnabled: true,
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
		providerName: string,
	): Promise<T> {
		let lastError: RetryableError | undefined;
		let attempt = 0;
		let delayMs = this.config.initialDelayMs;

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
					`[${providerName}] Initial request failed (non-retryable): ${lastError.message}`,
				);
				throw lastError;
			}
			Logger.warn(
				`[${providerName}] Initial request failed, initiating retry mechanism: ${lastError.message}`,
			);
		}

		// Retry loop
		while (attempt < this.config.maxAttempts) {
			attempt++;

			// Calculate delay with optional jitter to prevent thundering herd
			const jitter = this.config.jitterEnabled ? Math.random() * 0.1 : 0;
			const actualDelayMs = Math.min(
				delayMs * (1 + jitter),
				this.config.maxDelayMs,
			);
			Logger.info(
				`[${providerName}] Retrying in ${actualDelayMs / 1000} seconds...`,
			);

			// Wait for the calculated delay
			await this.delay(actualDelayMs);

			// Execute retry attempt
			Logger.info(
				`[${providerName}] Retry attempt #${attempt}/${this.config.maxAttempts}`,
			);
			try {
				const result = await operation();
				Logger.info(
					`[${providerName}] Retry successful after ${attempt} attempt(s)`,
				);
				return result;
			} catch (error) {
				lastError = error as RetryableError;

				// If the error is not retryable, stop immediately
				if (!isRetryable(lastError)) {
					Logger.warn(
						`[${providerName}] Retry attempt #${attempt} failed (non-retryable): ${lastError.message}`,
					);
					break;
				}

				Logger.warn(
					`[${providerName}] Retry attempt #${attempt} failed, preparing next retry: ${lastError.message}`,
				);

				// Exponentially increase delay for next attempt
				delayMs *= this.config.backoffMultiplier;
			}
		}

		// All retry attempts exhausted, throw the last error
		if (lastError) {
			Logger.error(
				`[${providerName}] All retry attempts exhausted: ${lastError.message}`,
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
	static isRateLimitError(error: RetryableError): boolean {
		if (error instanceof Error) {
			// Check if error message contains '429'
			if (error.message.includes("429")) {
				return true;
			}
			// Check OpenAI error object format
			if ("status" in error && error.status === 429) {
				return true;
			}
			// Check for statusCode property
			if ("statusCode" in error && error.statusCode === 429) {
				return true;
			}
		}
		return false;
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
