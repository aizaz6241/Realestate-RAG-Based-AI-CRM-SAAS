import { Injectable, Logger } from '@nestjs/common';
import { DatabaseRetrievalResult } from './database-retrieval.service';
import { QueryUnderstandingResult } from './query-understanding.service';

export interface ResultVerificationReport {
  verified: boolean;
  reason?: string;
  action?: 'PROCEED' | 'RETURN_EMPTY_RESPONSE' | 'ASK_FOR_CLARIFICATION' | 'PERMISSION_LEAK_DETECTED' | 'DATA_QUALITY_ISSUE';
  verificationPassed: string[];
  warnings: string[];
  confidence: number;
  rows: any[];
}

@Injectable()
export class ResultVerificationService {
  private readonly logger = new Logger(ResultVerificationService.name);

  public verifyResult(
    retrievalResult: DatabaseRetrievalResult,
    queryUnderstanding: QueryUnderstandingResult,
    userContext: { organizationId: string }
  ): ResultVerificationReport {
    this.logger.log('Starting Layer 8: Result Verification Engine');

    const passedChecks: string[] = [];
    const warnings: string[] = [];
    let isVerified = true;
    let finalAction: ResultVerificationReport['action'] = 'PROCEED';
    let finalReason: string | undefined;
    let confidence = 1.0;

    const rows = retrievalResult.rows || [];

    // 1. Empty Result Verification
    if (rows.length === 0) {
      this.logger.log('Empty result detected. Action: RETURN_EMPTY_RESPONSE');
      return {
        verified: false,
        reason: 'NO_DATA_FOUND',
        action: 'RETURN_EMPTY_RESPONSE',
        verificationPassed: ['EmptyCheck'],
        warnings: [],
        confidence: 1.0,
        rows: []
      };
    }
    passedChecks.push('NotEmpty');

    // 2. Cardinality Verification (Ambiguity Check)
    // If the query asks for a single lookup but multiple rows are returned
    const isSingleLookupExpected = queryUnderstanding.intent === 'LOOKUP' && !queryUnderstanding.originalQuery.toLowerCase().includes('all');
    if (isSingleLookupExpected && rows.length > 1) {
      this.logger.warn(`Cardinality mismatch: Expected 1 row for LOOKUP, found ${rows.length} rows.`);
      warnings.push(`Ambiguous result: Found ${rows.length} rows when 1 was expected.`);
      
      // If it's vastly off, flag it for clarification
      if (rows.length > 5) {
        return {
          verified: false,
          reason: 'AMBIGUOUS_RESULT',
          action: 'ASK_FOR_CLARIFICATION',
          verificationPassed: passedChecks,
          warnings,
          confidence: 0.5,
          rows
        };
      } else {
        confidence -= 0.2;
      }
    } else {
      passedChecks.push('Cardinality');
    }

    // 3. Permission Leakage Check
    let permissionLeak = false;
    for (const row of rows) {
      if (row.organizationId && row.organizationId !== userContext.organizationId) {
        permissionLeak = true;
        break;
      }
      if (row.orgId && row.orgId !== userContext.organizationId) {
        permissionLeak = true;
        break;
      }
    }

    if (permissionLeak) {
      this.logger.error('CRITICAL: Permission leakage detected! Row belongs to a different organization.');
      return {
        verified: false,
        reason: 'PERMISSION_LEAKAGE',
        action: 'PERMISSION_LEAK_DETECTED',
        verificationPassed: passedChecks,
        warnings: ['Critical security violation: Cross-tenant data returned.'],
        confidence: 0.0,
        rows: [] // Wipe rows for security
      };
    }
    passedChecks.push('PermissionBoundary');

    // 4. Duplicate Detection
    if (rows.length > 1) {
      const uniqueRows = new Set(rows.map(r => JSON.stringify(r)));
      if (uniqueRows.size === 1) {
        warnings.push('All returned rows are identical duplicates.');
        confidence -= 0.1;
      } else {
        passedChecks.push('UniqueRows');
      }
    } else {
      passedChecks.push('UniqueRows');
    }

    // 5. Data Completeness & Business Rule Validation
    let incompleteCount = 0;
    let businessRuleViolations = 0;

    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        // Completeness check
        if (value === null || value === undefined || value === '') {
          incompleteCount++;
        }

        // Business rules check (No negative financial values)
        const lowerKey = key.toLowerCase();
        if (
          (lowerKey.includes('salary') || lowerKey.includes('amount') || lowerKey.includes('total')) &&
          typeof value === 'number' && value < 0
        ) {
          businessRuleViolations++;
        }
      }
    }

    if (incompleteCount > 0) {
      warnings.push(`${incompleteCount} fields contained null or empty values.`);
      confidence -= 0.1;
    } else {
      passedChecks.push('DataCompleteness');
    }

    if (businessRuleViolations > 0) {
      warnings.push(`${businessRuleViolations} fields violated basic business rules (e.g. negative salary/amount).`);
      confidence -= 0.2;
      if (businessRuleViolations > rows.length / 2) {
        isVerified = false;
        finalReason = 'BUSINESS_RULE_VIOLATION';
        finalAction = 'DATA_QUALITY_ISSUE';
      }
    } else {
      passedChecks.push('BusinessRules');
    }

    this.logger.log(`Result verification completed. Confidence: ${confidence}`);

    return {
      verified: isVerified,
      reason: finalReason,
      action: finalAction,
      verificationPassed: passedChecks,
      warnings,
      confidence: Math.max(0, confidence),
      rows
    };
  }
}
