import { Injectable, Logger } from '@nestjs/common';
import { AiNewLlmService } from '../ai-new-llm.service';
import { ConfidenceScoringResult } from './confidence-scoring.service';
import { DatabaseRetrievalResult } from './database-retrieval.service';
import { QueryUnderstandingResult } from './query-understanding.service';
import { ResultVerificationReport } from './result-verification.service';
import { IntelligentCacheService } from '../cache/intelligent-cache.service';

export interface GroundedResponseResult {
  answer: string;
  confidence: number;
  grounded: boolean;
  usedRows: number;
}

@Injectable()
export class GroundedResponseService {
  private readonly logger = new Logger(GroundedResponseService.name);

  constructor(
    private readonly llmService: AiNewLlmService,
    private readonly cacheService: IntelligentCacheService
  ) {}

  public async generateResponse(
    userQuery: string,
    queryUnderstanding: QueryUnderstandingResult,
    dbRetrieval: DatabaseRetrievalResult | null,
    confidenceScoring: ConfidenceScoringResult,
    verificationReport: ResultVerificationReport | null
  ): Promise<GroundedResponseResult> {
    this.logger.log('Starting Layer 10: Grounded Response Generation');

    const recommendedAction = confidenceScoring.recommendedAction;
    const isCritical = recommendedAction === 'ASK_FOR_CLARIFICATION';

    // Fast-path: If the system completely lacks confidence or detects permission leakage, refuse immediately.
    if (isCritical) {
      this.logger.warn('Confidence is CRITICAL. Refusing to answer with data.');
      let clarificationMessage = 'I found some ambiguous or unexpected results and need clarification to give you an accurate answer.';
      if (confidenceScoring.warnings.some(w => w.includes('CRITICAL: Permission leakage'))) {
         clarificationMessage = 'For security reasons, I cannot retrieve this data as it belongs to a different organization.';
      } else if (verificationReport?.reason === 'AMBIGUOUS_RESULT') {
         clarificationMessage = 'I found multiple matching records, but you asked for a specific one. Could you please specify which one you mean?';
      }

      return {
        answer: clarificationMessage,
        confidence: confidenceScoring.confidence,
        grounded: true,
        usedRows: 0
      };
    }

    const rows = dbRetrieval?.rows || [];
    const originalRowCount = rows.length;

    // Fast-path: Empty data
    if (originalRowCount === 0) {
      return {
        answer: 'No matching records were found.',
        confidence: confidenceScoring.confidence,
        grounded: true,
        usedRows: 0
      };
    }

    // --- Data Sanitization & Truncation ---
    // Strip sensitive/metadata keys
    const sanitizedRows = rows.map(row => {
      const cleanRow = { ...row };
      delete cleanRow.passwordHash;
      delete cleanRow.token;
      return cleanRow;
    });

    // Truncate to max 20 rows to prevent LLM context overload
    let rowsToSend = sanitizedRows;
    let truncationMessage = '';
    if (sanitizedRows.length > 20) {
      rowsToSend = sanitizedRows.slice(0, 20);
      truncationMessage = `[Note: Only the first 20 records out of ${sanitizedRows.length} are provided below.]`;
    }

    const usedRowsCount = rowsToSend.length;
    const cachePayload = { userQuery, data: rowsToSend };
    const cacheKey = this.cacheService.generateGlobalKey('grounded_response', cachePayload);
    const cachedResult = this.cacheService.get<GroundedResponseResult>(cacheKey);
    if (cachedResult) {
      this.logger.log('Cache Hit: Grounded Response returned from L1 Cache.');
      return cachedResult;
    }

    // --- LLM Prompt Generation ---
    const systemPrompt = `You are a database response generator.
Your ONLY job is to convert the provided JSON database result into a readable, natural language response for the user.

CRITICAL RULES:
1. Use ONLY the provided JSON data.
2. Do NOT use outside knowledge. Do NOT guess. Do NOT infer.
3. If information is missing, clearly say it is not available. Never fabricate values.
4. Reply in the same language the user used.
5. Format the output cleanly. Use tables or bulleted lists if there are multiple rows. Use plain text if it's a single value.
6. Make it human-readable (e.g., convert "netSalary" to "net salary").
7. Do not mention that you are reading from JSON. Just provide the answer.
${recommendedAction === 'PROCEED_WITH_WARNING' ? '\nWARNING: Append this warning to your response: "Note: Some data may be incomplete or violate expected business rules."' : ''}
${recommendedAction === 'RECOMMEND_VERIFICATION' ? '\nWARNING: Append this warning to your response: "Please verify this information as the system confidence is somewhat low."' : ''}
`;

    const userPrompt = `User Query: "${userQuery}"\n\nDatabase Result:\n${truncationMessage}\n\`\`\`json\n${JSON.stringify(rowsToSend, null, 2)}\n\`\`\``;

    this.logger.log('Calling LLM to generate grounded response...');
    
    try {
      const llmResponse = await this.llmService.callLLM(systemPrompt, userPrompt, [], false);
      const text = llmResponse.text;

      const result = {
        answer: text.trim(),
        confidence: confidenceScoring.confidence,
        grounded: true,
        usedRows: usedRowsCount
      };

      this.cacheService.set(cacheKey, result, 30); // Cache for 30 seconds
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to generate grounded response: ${error.message}`);
      return {
        answer: `Data was successfully retrieved (${originalRowCount} rows), but I encountered an error formatting it into text.`,
        confidence: confidenceScoring.confidence,
        grounded: false,
        usedRows: originalRowCount
      };
    }
  }
}
