/**
 * @file utils.js
 * @description Contains utility classes used across the extension like
 * ProgressReporter, RateLimiter, and EmbeddingCache.
 */


/**
 * A simple class to manage and broadcast progress updates.
 */
export class ProgressReporter {
    constructor() {
        this.listeners = new Set();
    }

    addListener(listener) {
        this.listeners.add(listener);
    }

    removeListener(listener) {
        this.listeners.delete(listener);
    }

    report(status) {
        for (const listener of this.listeners) {
            try {
                listener(status);
            } catch (e) {
                console.error("Error in progress listener:", e);
            }
        }
    }

    async reportProgress(current, total, message) {
        this.report({
            type: 'progress',
            current,
            total,
            message,
            percentage: total > 0 ? Math.round((current / total) * 100) : 0
        });
    }
    
    async reportComplete(message) {
        this.report({ type: 'complete', message });
    }

    async reportError(error) {
        this.report({
            type: 'error',
            message: error.message || 'An unknown error occurred',
            stack: error.stack
        });
    }
}

/**
 * A class to limit the rate of asynchronous calls.
 */
export class RateLimiter {
    constructor(maxRequests, timeWindowMs) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindowMs;
        this.requestTimestamps = [];
    }

    async throttle() {
        const now = Date.now();
        // Remove timestamps older than the time window
        this.requestTimestamps = this.requestTimestamps.filter(t => now - t < this.timeWindow);

        if (this.requestTimestamps.length >= this.maxRequests) {
            const oldestRequest = this.requestTimestamps[0];
            const waitTime = this.timeWindow - (now - oldestRequest) + 100; // Add a small buffer
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return this.throttle(); // Re-check after waiting
        }

        this.requestTimestamps.push(now);
    }
}

/**
 * A simple in-memory cache with a max size (LRU-like).
 */
export class EmbeddingCache {
    constructor(maxSize = 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    async getKey(text) {
        // Using a hash for the key is more robust for long texts
        const buffer = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async get(text) {
        const key = await this.getKey(text);
        return this.cache.get(key);
    }

    async set(text, embedding) {
        if (this.cache.size >= this.maxSize) {
            // Evict the first (oldest) key
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        const key = await this.getKey(text);
        this.cache.set(key, embedding);
    }
}
