import * as path from 'path';
import { create, FlatCache } from 'flat-cache';

interface CacheEntry {
  value: any;
  expiresAt: number;
}

/**
 * File-based cache with TTL support.
 * Wraps flat-cache for persistence.
 */
export class FileCache {
  private cache: FlatCache;

  constructor() {
    const cacheDir = path.join(process.cwd(), 'var', '.cache');
    this.cache = create({ cacheId: 'cache', cacheDir });
    console.log('[FileCache] Initialized with file persistence');
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
   */
  set(key: string, value: any, ttlSeconds: number): boolean {
    this.cache.setKey(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
    this.cache.save();
    return true;
  }
}
