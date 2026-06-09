import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

@Injectable()
export class AiRagCacheService {
  private readonly logger = new Logger(AiRagCacheService.name);
  private cache = new Map<string, CacheEntry<any>>();

  // Get cached item
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.logger.log(`Cache expired for key: ${key}`);
      return null;
    }

    return entry.value as T;
  }

  // Set cached item with TTL in seconds
  set<T>(key: string, value: T, ttlSeconds = 600): void {
    const expiry = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { value, expiry });
    this.logger.log(`Cached key: ${key} for ${ttlSeconds}s`);
  }

  // Clear cache
  clear(): void {
    this.cache.clear();
    this.logger.log('RAG cache cleared.');
  }

  // Generate cache key for query
  generateKey(query: string, orgId: string, limit: number): string {
    const hash = require('crypto').createHash('md5').update(query.trim().toLowerCase()).digest('hex');
    return `rag:${orgId}:${limit}:${hash}`;
  }
}
