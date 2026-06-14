import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

export interface TraceRecord {
  traceId: string;
  timestamp: string;
  query: string;
  intent: string;
  classification: string;
  latencyMs: number;
  confidenceScore: number;
  dbAccuracy: number;           // 0 or 100
  ragAccuracy: number;          // 0 or 100
  hallucinationRate: number;    // 0 or 100
  fusionAccuracy: number;       // 0 or 100
  tokenUsage: number;
  cost: number;                 // estimated USD cost
  securityViolations: string[];
  workflowSuccess: boolean;
  plannerDuplicateRate?: number;
  fallbackRate?: number;
  confidenceFailureRate?: number;
  roleContaminationIncidents?: number;
  executionRetries?: number;
  queryRewriteCount?: number;
  intentMisclassificationRate?: number;
}

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);
  // Use DATA_DIR env var for production deployments (configurable). Never write to src/ in prod.
  private readonly tracesDir = path.join(
    process.env.DATA_DIR || process.cwd(),
    'ai-logs',
    'observability-traces'
  );

  constructor() {
    // Sync mkdir at startup only — acceptable
    try {
      if (!fs.existsSync(this.tracesDir)) {
        fs.mkdirSync(this.tracesDir, { recursive: true });
      }
    } catch (e) {
      this.logger.warn(`Could not create observability traces dir: ${e.message}`);
    }
  }

  // Layer 18: Observability & Tracing Layer
  async logTrace(record: TraceRecord, organizationId: string): Promise<void> {
    const filePath = path.join(this.tracesDir, `${record.traceId}.json`);

    try {
      // Fix: use async writeFile — sync blocks the NestJS event loop under load
      await fsPromises.writeFile(
        filePath,
        JSON.stringify({ ...record, organizationId }, null, 2),
        'utf-8'
      );
      this.logger.log(`[Observability] Trace logged: ID=${record.traceId}, Latency=${record.latencyMs}ms, Confidence=${record.confidenceScore}`);
    } catch (e) {
      // File write failure is non-fatal
      this.logger.warn(`[Observability] Non-fatal: Failed to write trace ${record.traceId}: ${e.message}`);
    }
  }

  async getObservabilityTraces(organizationId?: string): Promise<TraceRecord[]> {
    try {
      const files = fs.readdirSync(this.tracesDir);
      const traces = files
        .map(file => {
          try {
            const data = fs.readFileSync(path.join(this.tracesDir, file), 'utf-8');
            const parsed = JSON.parse(data) as TraceRecord & { organizationId?: string };
            // Security: If caller provides an organizationId, only return matching traces
            if (organizationId && parsed.organizationId && parsed.organizationId !== organizationId) {
              return null;
            }
            return parsed as TraceRecord;
          } catch (e) {
            return null;
          }
        })
        .filter(t => t !== null) as TraceRecord[];

      return traces.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (err) {
      this.logger.error(`Failed to list observability traces: ${err.message}`);
      return [];
    }
  }
}
