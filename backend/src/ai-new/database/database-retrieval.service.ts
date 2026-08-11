import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntelligentCacheService } from '../cache/intelligent-cache.service';

export interface DatabaseRetrievalResult {
  success: boolean;
  rows: any[];
  metadata: {
    rowCount: number;
    executionTimeMs: number;
    database: string;
    queryCost: number | null;
    error?: string;
  };
}

@Injectable()
export class DatabaseRetrievalService {
  private readonly logger = new Logger(DatabaseRetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: IntelligentCacheService
  ) {}

  public async executeSql(
    finalSql: string,
    optimizationResult: any,
    validationResult: any
  ): Promise<DatabaseRetrievalResult> {
    this.logger.log('Starting Layer 7: Database Retrieval Engine');

    const startTime = Date.now();
    let rows: any[] = [];
    let success = false;
    let errorMessage: string | undefined;

    const cacheKey = this.cacheService.generateGlobalKey('db_result', finalSql);
    const cachedResult = this.cacheService.get<DatabaseRetrievalResult>(cacheKey);
    if (cachedResult) {
      this.logger.log('Cache Hit: Database Retrieval returned from L1 Cache.');
      return cachedResult;
    }

    // We simulate routing to a read replica here by logging and tagging it
    const targetDatabase = 'read-replica-1';
    this.logger.log(`Routing query to: ${targetDatabase}`);

    try {
      // Execute the query using Prisma's transaction with a strict local timeout
      // Note: Setting statement_timeout inside a transaction ensures it only affects this specific query
      rows = await this.prisma.$transaction(async (tx) => {
        // Set timeout to 5000ms (5 seconds) to prevent runaway queries
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '5s'`);
        return await tx.$queryRawUnsafe<any[]>(finalSql);
      });

      // Normalize results (e.g. converting BigInts from COUNT or raw outputs to numbers)
      rows = this.normalizeResults(rows);
      success = true;

      // Handle Empty Result case as requested
      if (rows.length === 0) {
        this.logger.log('Query executed successfully but returned 0 rows. This is normal behavior.');
      } else {
        this.logger.log(`Query executed successfully, returned ${rows.length} rows.`);
      }

    } catch (error) {
      this.logger.error(`Query Execution Failed: ${error.message}`, error.stack);
      
      // Check for timeout specific error
      if (error.message?.includes('statement timeout') || error.message?.includes('canceling statement due to statement timeout')) {
        errorMessage = 'QUERY_TIMEOUT: Query execution exceeded the maximum allowed time of 5 seconds.';
      } else {
        errorMessage = `EXECUTION_ERROR: ${error.message}`;
      }
      
      // Partial Failure / Fallback: In a true enterprise setup, we could retry on another replica here
    }

    const executionTimeMs = Date.now() - startTime;

    const result: DatabaseRetrievalResult = {
      success,
      rows,
      metadata: {
        rowCount: rows.length,
        executionTimeMs,
        database: targetDatabase,
        queryCost: optimizationResult?.optimizedCost || optimizationResult?.originalCost || validationResult?.cost || null,
        error: errorMessage
      }
    };

    if (success) {
      this.cacheService.set(cacheKey, result, 30); // Cache for 30 seconds
    }

    return result;
  }

  /**
   * Normalizes raw database responses:
   * - Converts BigInt to Number (Prisma returns BigInt for aggregations like COUNT)
   * - Ensures Dates are properly serialized (Prisma usually returns JS Date objects, we let JSON.stringify handle it, but can be formatted here if needed)
   */
  private normalizeResults(rows: any[]): any[] {
    if (!rows || !Array.isArray(rows)) return [];

    return rows.map(row => {
      const normalizedRow: any = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'bigint') {
          normalizedRow[key] = Number(value);
        } else {
          normalizedRow[key] = value;
        }
      }
      return normalizedRow;
    });
  }
}
