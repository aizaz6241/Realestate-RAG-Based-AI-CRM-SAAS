import { Injectable, Logger } from '@nestjs/common';
import { ConfidenceScoringResult } from './confidence-scoring.service';
import { ResultVerificationReport } from './result-verification.service';
import { DatabaseRetrievalResult } from './database-retrieval.service';
import { SqlValidationResult } from './sql-validation.service';
import { GroundedResponseResult } from './grounded-response.service';

export interface FallbackResult {
  status: 'SUCCESS' | 'CLARIFICATION_REQUIRED' | 'NO_DATA' | 'PERMISSION_DENIED' | 'VALIDATION_FAILED' | 'INTERNAL_ERROR';
  message: string;
  isFallback: boolean;
}

@Injectable()
export class HallucinationFallbackService {
  private readonly logger = new Logger(HallucinationFallbackService.name);

  public evaluateFallback(
    confidenceScoring: ConfidenceScoringResult | null,
    resultVerification: ResultVerificationReport | null,
    dbRetrieval: DatabaseRetrievalResult | null,
    sqlValidation: SqlValidationResult | null,
    groundedResponse: GroundedResponseResult | null
  ): FallbackResult {
    this.logger.log('Starting Layer 12: Hallucination Fallback Engine');

    // Rule 1: SQL Validation Failed (Layer 5)
    if (sqlValidation && !sqlValidation.valid) {
      this.logger.warn('Fallback Triggered: VALIDATION_FAILED');
      return {
        status: 'VALIDATION_FAILED',
        message: 'Unable to process your request due to an internal query validation failure. Please try asking differently.',
        isFallback: true
      };
    }

    // Rule 2: Database Internal Error or Timeout (Layer 7)
    if (dbRetrieval && !dbRetrieval.success) {
      this.logger.warn('Fallback Triggered: INTERNAL_ERROR (Database Retrieval Failed)');
      return {
        status: 'INTERNAL_ERROR',
        message: 'The database encountered an error or timed out. Please retry your request.',
        isFallback: true
      };
    }

    // Rule 3: Empty Result (Layer 7 / Layer 8)
    // We treat this as a safe, successful execution, but we intercept it to provide a clean message.
    if (resultVerification?.action === 'RETURN_EMPTY_RESPONSE' || (dbRetrieval && dbRetrieval.rows && dbRetrieval.rows.length === 0)) {
      this.logger.log('Fallback Triggered: NO_DATA');
      return {
        status: 'NO_DATA',
        message: 'No matching records were found in the database.',
        isFallback: true
      };
    }

    // Rule 4: Permission Denied (Layer 8)
    if (resultVerification?.action === 'PERMISSION_LEAK_DETECTED') {
      this.logger.warn('Fallback Triggered: PERMISSION_DENIED (Security Violation)');
      return {
        status: 'PERMISSION_DENIED',
        message: 'Access Denied: You do not have permission to view these records.',
        isFallback: true
      };
    }

    // Rule 5: Ambiguous Result (Layer 8)
    if (resultVerification?.reason === 'AMBIGUOUS_RESULT') {
      this.logger.warn('Fallback Triggered: CLARIFICATION_REQUIRED (Ambiguous Result)');
      return {
        status: 'CLARIFICATION_REQUIRED',
        message: 'I found multiple matching records for your query. Please be more specific (e.g., provide a full name or ID).',
        isFallback: true
      };
    }

    // Rule 6: Confidence Threshold < 60% (Layer 9)
    if (confidenceScoring && confidenceScoring.confidence < 0.60) {
      this.logger.warn(`Fallback Triggered: CLARIFICATION_REQUIRED (Low Confidence: ${confidenceScoring.confidence})`);
      return {
        status: 'CLARIFICATION_REQUIRED',
        message: 'I cannot answer this confidently based on the available data. Could you please clarify or rephrase your request?',
        isFallback: true
      };
    }

    // Rule 7: Fallback if Grounded Response Failed completely
    if (!groundedResponse || !groundedResponse.answer) {
      return {
        status: 'INTERNAL_ERROR',
        message: 'An error occurred while generating the text response.',
        isFallback: true
      };
    }

    // No fallback needed - The response is safe and trustworthy
    this.logger.log('No fallback triggered. Proceeding with Grounded Response.');
    return {
      status: 'SUCCESS',
      message: groundedResponse.answer,
      isFallback: false
    };
  }
}
