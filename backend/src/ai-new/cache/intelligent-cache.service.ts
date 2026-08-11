import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
}

@Injectable()
export class IntelligentCacheService {
  private readonly logger = new Logger(IntelligentCacheService.name);
  
  // Phase 1: L1 In-Memory Cache (Can be swapped with Redis for distributed L2)
  private readonly store = new Map<string, CacheEntry<any>>();

  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  /**
   * Generates a secure, cross-tenant safe cache key.
   */
  public generateKey(prefix: string, orgId: string, userId: string, payload: any): string {
    const dataString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(dataString).digest('hex');
    return `${prefix}:${orgId}:${userId}:${hash}`;
  }

  /**
   * Generates a global cache key (for schema, etc., not tied to user).
   */
  public generateGlobalKey(prefix: string, payload: any): string {
    const dataString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(dataString).digest('hex');
    return `${prefix}:GLOBAL:${hash}`;
  }

  public set<T>(key: string, value: T, ttlSeconds: number): void {
    const expiry = Date.now() + (ttlSeconds * 1000);
    this.store.set(key, { value, expiry });
    // In a real prod environment, we would also clear expired keys periodically
    // or rely on a proper cache store like Redis. For now, lazy eviction is fine.
  }

  public get<T>(key: string): T | null {
    const entry = this.store.get(key);
    
    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      this.metrics.evictions++;
      this.metrics.misses++;
      return null;
    }

    this.metrics.hits++;
    return entry.value as T;
  }

  public getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }
}
