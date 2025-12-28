import { LRUCache } from 'lru-cache';
import { config } from '../config/index.js';

/**
 * Generic LRU cache factory
 * Replaces the manual Map-based caching with proper eviction
 */
export function createCache<K extends string | number, V extends NonNullable<unknown>>(options?: {
  max?: number;
  ttl?: number;
}): LRUCache<K, V> {
  return new LRUCache<K, V>({
    max: options?.max ?? config.cache.maxSize,
    ttl: options?.ttl ?? config.cache.ttlMs,
  });
}

/**
 * Response cache for API responses
 */
export const responseCache = createCache<string, { data: unknown; timestamp: number }>({
  max: config.cache.maxSize,
  ttl: config.cache.ttlMs,
});

/**
 * Auth cache for token validation results
 */
export const authCache = createCache<string, { userId: string; email: string }>({
  max: 500,
  ttl: config.cache.authTtlMs,
});

/**
 * Generate a cache key from request parameters
 */
export function generateCacheKey(userId: string, action: string, params?: Record<string, unknown>): string {
  const paramStr = params ? JSON.stringify(params) : '';
  return `${userId}:${action}:${paramStr}`;
}
