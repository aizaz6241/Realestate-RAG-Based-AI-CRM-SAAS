import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface TraceRecord {
  traceId: string;
  timestamp: string;
  query: string;
  intent: string;
  classification: string;
  latencyMs: number;
  confidenceScore: number;
  dbAccuracy: number; // 0 or 100
  ragAccuracy: number; // 0 or 100
  hallucinationRate: number; // 0 or 100
  fusionAccuracy: number; // 0 or 100
  tokenUsage: number;
  cost: number; // estimated USD cost
  securityViolations: string[];
  workflowSuccess: boolean;
}

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);
  private readonly tracesDir = path.join(process.cwd(), 'src', 'ai', 'logs', 'observability-traces');

  constructor() {
    if (!fs.existsSync(this.tracesDir)) {
      fs.mkdirSync(this.tracesDir, { recursive: true });
    }
  }

  // Layer 18: Observability & Tracing Layer
  async logTrace(record: TraceRecord, organizationId: string): Promise<void> {
    const filePath = path.join(this.tracesDir, `${record.traceId}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify({ ...record, organizationId }, null, 2));
      this.logger.log(`[Observability] Trace logged: ID=${record.traceId}, Latency=${record.latencyMs}ms, Confidence=${record.confidenceScore}`);
    } catch (e) {
      this.logger.error(`Failed to write observability trace: ${e.message}`);
    }
  }

  async getObservabilityTraces(): Promise<TraceRecord[]> {
    try {
      const files = fs.readdirSync(this.tracesDir);
      const traces = files
        .map(file => {
          try {
            const data = fs.readFileSync(path.join(this.tracesDir, file), 'utf-8');
            return JSON.parse(data) as TraceRecord;
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
