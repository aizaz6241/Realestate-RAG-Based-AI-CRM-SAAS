import { Injectable, Logger } from '@nestjs/common';

export enum EvidencePriority {
  LIVE_DATABASE = 100,
  VERIFIED_DOCUMENT = 80,
  MEMORY = 40,
  LLM_INFERENCE = 10
}

@Injectable()
export class EvidenceAuthorityEngine {
  private readonly logger = new Logger(EvidenceAuthorityEngine.name);

  isMetricOrCountQuery(query: string): boolean {
    const q = query.toLowerCase();
    return [
      'how many', 'total', 'count', 'sum', 'average', 'avg', 'salary', 
      'salary details', 'net salary', 'netSalary', 'price', 'pricing', 
      'budget', 'headcount', 'number of'
    ].some(term => q.includes(term));
  }

  generateAuthorityDirectives(
    query: string,
    dbRows: any[],
    tablesUsed: string[]
  ): string {
    if (!this.isMetricOrCountQuery(query)) {
      return '';
    }

    this.logger.log(`[Evidence Authority Engine] Enforcing Database priority for metric/count query.`);
    
    // Calculate accurate counts from database rows
    const dbRowsCount = dbRows.length;
    
    // Build direct authority directive instructions
    return `
=== CRITICAL EVIDENCE AUTHORITY DIRECTIVE ===
- The user query involves counts, totals, or numeric metrics.
- As the Evidence Authority, the structured LIVE_DATABASE records are the absolute primary source of truth (Priority: 100).
- Unstructured documents (Priority: 80) and historical memory vector observations (Priority: 40) are secondary and MUST NEVER override database facts.
- **Fact**: The database contains exactly ${dbRowsCount} verified records for model(s) [${tablesUsed.join(', ')}].
- You MUST report ${dbRowsCount} as the correct count/headcount/total in your response. 
- Ignore any conflicting numbers in the historical memory (such as statements claiming there are 10 employees, or other counts).
`;
  }
}
