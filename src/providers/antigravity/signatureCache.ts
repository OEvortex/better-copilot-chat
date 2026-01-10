import crypto from "node:crypto";

export interface CachedSignature {
	signature: string;
	textHash: string;
	timestamp: number;
}

export interface SignatureCacheStats {
	hits: number;
	misses: number;
	size: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_SIZE = 100;
const FALLBACK_SIGNATURE = "skip_thought_signature_validator";

class SignatureCache {
	private cache = new Map<string, Map<string, CachedSignature>>();
	private stats: SignatureCacheStats = { hits: 0, misses: 0, size: 0 };

	private hashText(text: string): string {
		return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
	}

	private getSessionCache(sessionId: string): Map<string, CachedSignature> {
		let sessionCache = this.cache.get(sessionId);
		if (!sessionCache) {
			sessionCache = new Map();
			this.cache.set(sessionId, sessionCache);
		}
		return sessionCache;
	}

	getCachedSignature(sessionId: string, text: string): string | null {
		if (!sessionId || !text) {
			return null;
		}
		const sessionCache = this.cache.get(sessionId);
		if (!sessionCache) {
			this.stats.misses++;
			return null;
		}
		const textHash = this.hashText(text);
		const cached = sessionCache.get(textHash);
		if (!cached) {
			this.stats.misses++;
			return null;
		}
		if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
			sessionCache.delete(textHash);
			this.stats.size = this.calculateTotalSize();
			this.stats.misses++;
			return null;
		}
		this.stats.hits++;
		return cached.signature;
	}

	cacheSignature(sessionId: string, text: string, signature: string): void {
		if (!sessionId || !text || !signature) {
			return;
		}
		const sessionCache = this.getSessionCache(sessionId);
		const textHash = this.hashText(text);
		if (sessionCache.size >= MAX_CACHE_SIZE) {
			this.evictOldestEntry(sessionCache);
		}
		sessionCache.set(textHash, {
			signature,
			textHash,
			timestamp: Date.now(),
		});
		this.stats.size = this.calculateTotalSize();
	}

	getSignatureForToolCall(callId: string, sessionId?: string): string {
		if (!callId) {
			return FALLBACK_SIGNATURE;
		}
		if (sessionId) {
			const sessionCache = this.cache.get(sessionId);
			if (sessionCache) {
				for (const cached of sessionCache.values()) {
					if (cached.textHash === callId) {
						return cached.signature;
					}
				}
			}
		}
		const globalCache = this.cache.get("__global__");
		const cached = globalCache?.get(callId);
		if (cached && Date.now() - cached.timestamp <= CACHE_TTL_MS) {
			return cached.signature;
		}
		return FALLBACK_SIGNATURE;
	}

	storeToolCallSignature(callId: string, signature: string): void {
		if (!callId || !signature) {
			return;
		}
		const globalCache = this.getSessionCache("__global__");
		if (globalCache.size >= MAX_CACHE_SIZE) {
			this.evictOldestEntry(globalCache);
		}
		globalCache.set(callId, {
			signature,
			textHash: callId,
			timestamp: Date.now(),
		});
		this.stats.size = this.calculateTotalSize();
	}

	clearSession(sessionId: string): void {
		this.cache.delete(sessionId);
		this.stats.size = this.calculateTotalSize();
	}

	clearAll(): void {
		this.cache.clear();
		this.stats = { hits: 0, misses: 0, size: 0 };
	}

	getStats(): SignatureCacheStats {
		return { ...this.stats };
	}

	private evictOldestEntry(sessionCache: Map<string, CachedSignature>): void {
		let oldest: { key: string; timestamp: number } | null = null;
		for (const [key, entry] of sessionCache) {
			if (!oldest || entry.timestamp < oldest.timestamp) {
				oldest = { key, timestamp: entry.timestamp };
			}
		}
		if (oldest) {
			sessionCache.delete(oldest.key);
		}
	}

	private calculateTotalSize(): number {
		let total = 0;
		for (const sessionCache of this.cache.values()) {
			total += sessionCache.size;
		}
		return total;
	}
}

export const signatureCache = new SignatureCache();

export function getCachedSignature(
	sessionId: string,
	text: string,
): string | null {
	return signatureCache.getCachedSignature(sessionId, text);
}

export function cacheSignature(
	sessionId: string,
	text: string,
	signature: string,
): void {
	signatureCache.cacheSignature(sessionId, text, signature);
}

export function getSignatureForToolCall(
	callId: string,
	sessionId?: string,
): string {
	return signatureCache.getSignatureForToolCall(callId, sessionId);
}

export function storeToolCallSignature(
	callId: string,
	signature: string,
): void {
	signatureCache.storeToolCallSignature(callId, signature);
}

export function clearSessionCache(sessionId: string): void {
	signatureCache.clearSession(sessionId);
}

export { FALLBACK_SIGNATURE };
