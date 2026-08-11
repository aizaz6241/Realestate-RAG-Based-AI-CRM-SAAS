import { Injectable, Logger } from '@nestjs/common';
import { QueryUnderstandingResult } from './query-understanding.service';
import { SchemaUnderstandingResult } from './schema-understanding.service';
import { SqlGenerationResult } from './sql-generation.service';
import { SqlValidationResult } from './sql-validation.service';
import { DatabaseRetrievalResult } from './database-retrieval.service';
import { ResultVerificationReport } from './result-verification.service';

export interface ConfidenceScoringResult {
  confidence: number;
  level: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';
  breakdown: {
    intent: number;
    schema: number;
    validation: number;
    retrieval: number;
    verification: number;
    ontology: number;
  };
  warnings: string[];
  recommendedAction: 'PROCEED' | 'PROCEED_WITH_WARNING' | 'RECOMMEND_VERIFICATION' | 'ASK_FOR_CLARIFICATION';
}

@Injectable()
export class ConfidenceScoringService {
  private readonly logger = new Logger(ConfidenceScoringService.name);

  public calculateConfidence(
    queryUnderstanding: QueryUnderstandingResult,
    schemaUnderstanding: SchemaUnderstandingResult,
    sqlGeneration: SqlGenerationResult | null,
    sqlValidation: SqlValidationResult | null,
    dbRetrieval: DatabaseRetrievalResult | null,
    resultVerification: ResultVerificationReport | null
  ): ConfidenceScoringResult {
    this.logger.log('Starting Layer 9: Confidence Scoring Engine');

    const warnings: string[] = [];

    // --- 1. Intent Score (Weight: 15%) ---
    // If clarification was required in Layer 1, intent confidence is lower.
    let intentScore = 1.0;
    if (queryUnderstanding.requiresClarification) {
      intentScore = 0.5;
      warnings.push('Layer 1: User intent required clarification.');
    } else if (queryUnderstanding.intent === 'UNKNOWN') {
      intentScore = 0.2;
    }

    // --- 2. Schema Score (Weight: 15%) ---
    // Inherited from schema understanding
    let schemaScore = 1.0;
    if (!schemaUnderstanding.tables || schemaUnderstanding.tables.length === 0) {
      schemaScore = 0.0;
      warnings.push('Layer 2: Failed to confidently map query to any database tables.');
    }

    // --- 3. Validation Score (Weight: 15%) ---
    let validationScore = 1.0;
    if (!sqlValidation) {
      validationScore = 0.0;
    } else if (!sqlValidation.valid) {
      validationScore = 0.0;
      warnings.push(`Layer 5: SQL Validation failed. Reason: ${sqlValidation.reason}`);
    } else if (sqlValidation.estimatedCost && sqlValidation.estimatedCost > 10000) {
      validationScore = 0.8; // High cost reduces confidence slightly
      warnings.push('Layer 5: Query execution cost is unusually high.');
    }

    // --- 4. Retrieval Score (Weight: 10%) ---
    let retrievalScore = 1.0;
    if (!dbRetrieval) {
      retrievalScore = 0.0;
    } else if (!dbRetrieval.success) {
      retrievalScore = 0.0;
      warnings.push(`Layer 7: Database retrieval failed. Error: ${dbRetrieval.metadata.error}`);
    } else if (dbRetrieval.metadata.error?.includes('TIMEOUT')) {
      retrievalScore = 0.2;
    }

    // --- 5. Verification Score (Weight: 30%) ---
    let verificationScore = 1.0;
    if (!resultVerification) {
      verificationScore = 0.0;
    } else {
      verificationScore = resultVerification.confidence; // Inherit mathematical confidence from Layer 8
      if (!resultVerification.verified) {
        warnings.push(`Layer 8: Result verification failed. Reason: ${resultVerification.reason}`);
      }
      if (resultVerification.warnings && resultVerification.warnings.length > 0) {
        warnings.push(...resultVerification.warnings);
      }
    }

    // --- 6. Ontology/Freshness Score (Weight: 15%) ---
    let ontologyScore = 1.0;
    if (sqlGeneration && sqlGeneration.confidence) {
      ontologyScore = sqlGeneration.confidence;
    }

    // --- Apply Weights ---
    const finalScore = 
      (intentScore * 0.15) +
      (schemaScore * 0.15) +
      (validationScore * 0.15) +
      (retrievalScore * 0.10) +
      (verificationScore * 0.30) +
      (ontologyScore * 0.15);

    // Ensure score is bounded between 0 and 1
    const boundedScore = Math.max(0, Math.min(1, finalScore));

    // --- Threshold Classification ---
    let level: ConfidenceScoringResult['level'] = 'HIGH';
    let recommendedAction: ConfidenceScoringResult['recommendedAction'] = 'PROCEED';

    if (boundedScore >= 0.95) {
      level = 'HIGH';
      recommendedAction = 'PROCEED';
    } else if (boundedScore >= 0.80) {
      level = 'MEDIUM';
      recommendedAction = 'PROCEED_WITH_WARNING';
    } else if (boundedScore >= 0.60) {
      level = 'LOW';
      recommendedAction = 'RECOMMEND_VERIFICATION';
    } else {
      level = 'CRITICAL';
      recommendedAction = 'ASK_FOR_CLARIFICATION';
    }

    // Force critical classification if any hard verification failed
    if (resultVerification?.action === 'PERMISSION_LEAK_DETECTED') {
      level = 'CRITICAL';
      recommendedAction = 'ASK_FOR_CLARIFICATION';
      warnings.push('CRITICAL: Permission leakage overrides all other confidence metrics.');
    } else if (resultVerification?.action === 'ASK_FOR_CLARIFICATION') {
      level = 'CRITICAL';
      recommendedAction = 'ASK_FOR_CLARIFICATION';
    }

    this.logger.log(`Confidence calculation completed. Final Score: ${(boundedScore * 100).toFixed(1)}% (${level})`);

    return {
      confidence: Number(boundedScore.toFixed(4)),
      level,
      breakdown: {
        intent: intentScore,
        schema: schemaScore,
        validation: validationScore,
        retrieval: retrievalScore,
        verification: verificationScore,
        ontology: ontologyScore
      },
      warnings: Array.from(new Set(warnings)), // deduplicate warnings
      recommendedAction
    };
  }
}
