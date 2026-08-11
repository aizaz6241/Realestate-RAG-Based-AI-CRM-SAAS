import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { GroundedResponseResult } from './grounded-response.service';
import { ConfidenceScoringResult } from './confidence-scoring.service';
import { ResultVerificationReport } from './result-verification.service';
import { DatabaseRetrievalResult } from './database-retrieval.service';
import { OptimizationResult } from './query-optimization.service';
import { SqlValidationResult } from './sql-validation.service';
import { SqlGenerationResult } from './sql-generation.service';
import { PermissionValidationResult } from './permission-validation.service';
import { SchemaUnderstandingResult } from './schema-understanding.service';
import { QueryUnderstandingResult } from './query-understanding.service';

export interface CitationTraceResult {
  traceId: string;
  answer: string;
  citations: {
    table: string;
    description?: string;
  }[];
  performance: {
    totalLatencyMs: number;
    databaseMs: number;
    llmMs: number;
    pipelineMs: number;
  };
  auditTrail: {
    timestamp: string;
    layer1_QueryUnderstanding: any;
    layer2_SchemaUnderstanding: any;
    layer3_PermissionValidation: any;
    layer4_SqlGeneration: any;
    layer5_SqlValidation: any;
    layer6_QueryOptimization: any;
    layer7_DatabaseRetrieval: any;
    layer8_ResultVerification: any;
    layer9_ConfidenceScoring: any;
  };
}

@Injectable()
export class CitationTraceService {
  private readonly logger = new Logger(CitationTraceService.name);

  public generateTrace(
    startTimeMs: number,
    dbTimeMs: number,
    llmTimeMs: number,
    groundedResponse: GroundedResponseResult,
    confidenceScoring: ConfidenceScoringResult,
    resultVerification: ResultVerificationReport | null,
    dbRetrieval: DatabaseRetrievalResult | null,
    queryOptimization: OptimizationResult | null,
    sqlValidation: SqlValidationResult | null,
    sqlGeneration: SqlGenerationResult | null,
    permissionValidation: PermissionValidationResult | null,
    schemaUnderstanding: SchemaUnderstandingResult | null,
    queryUnderstanding: QueryUnderstandingResult | null
  ): CitationTraceResult {
    this.logger.log('Starting Layer 11: Citation & Query Trace Generation');

    const endTimeMs = Date.now();
    const totalLatencyMs = endTimeMs - startTimeMs;
    // Everything else is pipeline time (parsing, validating, TS execution)
    const pipelineMs = totalLatencyMs - dbTimeMs - llmTimeMs;

    const traceId = `TRC-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    // Extract Citations
    const citations: { table: string; description?: string }[] = [];
    if (schemaUnderstanding?.tables) {
      schemaUnderstanding.tables.forEach(table => {
        citations.push({
          table,
          description: `Data retrieved using ${dbRetrieval?.metadata?.database || 'primary'} database.`
        });
      });
    }

    return {
      traceId,
      answer: groundedResponse.answer,
      citations,
      performance: {
        totalLatencyMs,
        databaseMs: dbTimeMs,
        llmMs: llmTimeMs,
        pipelineMs: Math.max(0, pipelineMs)
      },
      auditTrail: {
        timestamp: new Date().toISOString(),
        layer1_QueryUnderstanding: queryUnderstanding,
        layer2_SchemaUnderstanding: schemaUnderstanding,
        layer3_PermissionValidation: permissionValidation,
        layer4_SqlGeneration: sqlGeneration,
        layer5_SqlValidation: sqlValidation,
        layer6_QueryOptimization: queryOptimization,
        layer7_DatabaseRetrieval: {
          success: dbRetrieval?.success,
          metadata: dbRetrieval?.metadata // Don't log full rows to avoid huge audit trails
        },
        layer8_ResultVerification: {
          verified: resultVerification?.verified,
          action: resultVerification?.action,
          warnings: resultVerification?.warnings,
          confidence: resultVerification?.confidence
        },
        layer9_ConfidenceScoring: confidenceScoring
      }
    };
  }
}
