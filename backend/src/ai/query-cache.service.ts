import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

interface CacheEntry {
  value: any;
  expiresAt: number;
  /** Tables the cached answer was derived from — used for write invalidation. */
  tables: string[];
}

export interface QueryCacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  invalidations: number;
  size: number;
  hitRate: number;
}

/**
 * Response cache for the AI query pipeline.
 *
 * An `IntelligentCacheService` already existed but nothing on the query path ever
 * called `get` on it — only `getMetrics()` — so repeat questions paid full price
 * every time. This one is wired into the pipeline and differs in three ways that
 * matter:
 *
 *  1. **Tenant and identity scoped.** The key includes organizationId AND userId.
 *     RBAC rewrites queries per user (an AGENT gets `assignedToId` injected), so a
 *     shared key would leak another user's rows. Correctness over hit rate.
 *
 *  2. **Bounded.** LRU eviction with a hard cap. The previous store grew without
 *     limit, which is a slow memory leak in a long-running process.
 *
 *  3. **Invalidated by writes.** Caching reads while the assistant also creates
 *     tasks and meetings means a stale answer contradicts an action the user just
 *     took. Mutations invalidate the tables they touch.
 */
@Injectable()
export class QueryCacheService {
  private readonly logger = new Logger(QueryCacheService.name);

  private readonly store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  private metrics = { hits: 0, misses: 0, evictions: 0, invalidations: 0 };

  constructor() {
    this.maxEntries = parseInt(process.env.AI_CACHE_MAX_ENTRIES || '500', 10);
    this.defaultTtlMs = parseInt(process.env.AI_CACHE_TTL_SECONDS || '180', 10) * 1000;
  }

  private enabled(): boolean {
    return (process.env.AI_CACHE_ENABLED || 'true').toLowerCase() !== 'false';
  }

  /**
   * Normalizes a question so trivially different phrasings share an entry:
   * case, punctuation, and whitespace are not semantically meaningful here.
   */
  private normalize(query: string): string {
    return query
      .toLowerCase()
      .replace(/[?!.,؟،]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildKey(query: string, organizationId: string, userId: string, userRole: string): string {
    const payload = `${this.normalize(query)}|${organizationId}|${userId}|${userRole}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Returns a cached response, or null.
   *
   * Queries whose answer depends on "now" are never served from cache — a cached
   * "today's attendance" is wrong the moment the day rolls over, and relative dates
   * are exactly where stale answers are most misleading.
   */
  get(query: string, organizationId: string, userId: string, userRole: string): any | null {
    if (!this.enabled()) return null;
    if (this.isTimeSensitive(query)) return null;

    const key = this.buildKey(query, organizationId, userId, userRole);
    const entry = this.store.get(key);

    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.metrics.evictions++;
      this.metrics.misses++;
      return null;
    }

    // Refresh recency for LRU: delete + re-insert moves it to the end of the
    // Map's insertion order, which is what eviction scans.
    this.store.delete(key);
    this.store.set(key, entry);

    this.metrics.hits++;
    this.logger.log(`[Query Cache] HIT for "${query.slice(0, 50)}"`);
    return entry.value;
  }

  set(
    query: string,
    organizationId: string,
    userId: string,
    userRole: string,
    value: any,
    tables: string[] = [],
    ttlSeconds?: number
  ): void {
    if (!this.enabled()) return;
    if (this.isTimeSensitive(query)) return;

    // Never cache an error or a provider outage message — it would pin the failure
    // in place for the whole TTL.
    const text = typeof value?.response === 'string' ? value.response : '';
    if (/System Alert|could not reach the language model|Zorvex AI encountered an error/i.test(text)) {
      return;
    }

    const key = this.buildKey(query, organizationId, userId, userRole);
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds ? ttlSeconds * 1000 : this.defaultTtlMs),
      tables: tables.map(t => t.toLowerCase()),
    });

    this.evictIfNeeded();
  }

  /** Drops cached answers derived from any of the given tables. */
  invalidateTables(tables: string[]): number {
    if (tables.length === 0) return 0;
    const targets = tables.map(t => t.toLowerCase());
    let removed = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.tables.some(t => targets.includes(t))) {
        this.store.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.metrics.invalidations += removed;
      this.logger.log(`[Query Cache] Invalidated ${removed} entr(ies) for tables: ${targets.join(', ')}`);
    }
    return removed;
  }

  /** Drops everything for one tenant. Use after bulk imports or permission changes. */
  invalidateOrganization(organizationId: string): number {
    // Keys are hashed, so the org cannot be recovered from them. Rather than store
    // a reverse index for a rare operation, clear the whole cache — it is bounded
    // and repopulates in seconds.
    const size = this.store.size;
    this.store.clear();
    this.metrics.invalidations += size;
    this.logger.log(`[Query Cache] Cleared ${size} entr(ies) (org ${organizationId} invalidation).`);
    return size;
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.maxEntries) {
      // Map preserves insertion order; the first key is the least recently used.
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
      this.metrics.evictions++;
    }
  }

  /**
   * Anything anchored to the current time. These must always re-run.
   */
  private isTimeSensitive(query: string): boolean {
    return /\b(today|todays|now|current|currently|this (?:hour|morning|week|month|year)|aaj|abhi|is hafte|is mahine|is waqt|latest|recent|live|pending|overdue)\b/i.test(query);
  }

  getMetrics(): QueryCacheMetrics {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      ...this.metrics,
      size: this.store.size,
      hitRate: total > 0 ? Math.round((this.metrics.hits / total) * 100) : 0,
    };
  }
}
