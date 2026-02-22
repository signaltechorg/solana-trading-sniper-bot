import * as path from 'path';
import { create, FlatCache } from 'flat-cache';

interface CacheEntry {
  value: any;
  expiresAt: number;
}

/**
 * File-based cache with TTL support.
 * Wraps flat-cache for persistence.
 *
 * NOTE: Only JSON-serializable values are supported!
 * Unsupported types that will cause issues:
 *   - Map (use Record<string, T> instead)
 *   - Set (use T[] instead)
 *   - Date (serialize to ISO string)
 *   - undefined (use null instead)
 *   - Function
 *   - Symbol
 */
export class FileCache {
  private cache: FlatCache;

  constructor() {
    const cacheDir = path.join(process.cwd(), 'var', '.cache');
    this.cache = create({ cacheId: 'cache', cacheDir });
  }

  /**
   * Get a value from cache
   */
  get(key: string): any | undefined {
    const entry = this.cache.getKey(key) as CacheEntry | undefined;
    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.cache.removeKey(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set a value in cache with TTL in seconds
   * @throws Error if value contains non-JSON-serializable types (Map, Set, etc.)
   */
  set(key: string, value: any, ttlSeconds: number): boolean {
    // Validate that value is JSON-serializable
    if (value instanceof Map) {
      throw new Error('FileCache: Map is not JSON-serializable. Use Record<string, T> instead.');
    }
    if (value instanceof Set) {
      throw new Error('FileCache: Set is not JSON-serializable. Use T[] instead.');
    }

    this.cache.setKey(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
    this.cache.save();
    return true;
  }
}
