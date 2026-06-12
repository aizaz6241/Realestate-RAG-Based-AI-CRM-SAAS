import { Injectable, Logger } from '@nestjs/common';
import { AiLlmService } from './ai-llm.service';

export interface FusionInput {
  dbResult: {
    rows: any[];
    confidenceScore: number;
    tablesUsed: string[];
  };
  docResult: {
    chunks: any[];
    confidenceScore: number;
  };
  memResult: {
    memories: any[];
  };
}

export interface FusionOutput {
  fusedData: any;
  conflicts: string[];
  finalConfidence: number;
  groundedEvidence: string;
}

@Injectable()
export class ResultFusionService {
  private readonly logger = new Logger(ResultFusionService.name);

  constructor(private llmService: AiLlmService) {}

  // Result Fusion, Cross-Validation & Confidence Engine
  async fuseAndValidate(
    query: string,
    input: FusionInput,
    organizationId: string,
    userId: string
  ): Promise<FusionOutput> {
    this.logger.log(`[Result Fusion & Cross Validation] Fusing results for query: "${query}"`);

    const dbRows = input.dbResult?.rows || [];
    const docChunks = input.docResult?.chunks || [];
    const memories = input.memResult?.memories || [];

    // 1. Cross Validation: Check for contradictions using LLM context auditing
    // Priority: Live Database > Approved Documents > Archived Documents
    const crossValidationPrompt = `You are the Zorvex AI V9 Cross Validation Engine.
Analyze the retrieved structured database records and the unstructured document chunks for any factual contradictions or inconsistencies.

Live Database Records (PRIORITY 1):
${JSON.stringify(dbRows, null, 2)}

Retrieved Documents Context (PRIORITY 2):
${JSON.stringify(docChunks, null, 2)}

Instructions:
1. Detect if any metric, number, name, or policy contradicts.
2. If a contradiction is found (e.g., Target Revenue in Document is 5M but Database says 7M), resolve the contradiction using the Priority Rule: Live Database overrides Documents.
3. Identify and state any resolved conflicts.

Return strictly JSON matching this structure:
{
  "conflicts": ["Resolved conflict description: Live Database overrides Document on metric X."],
  "isConsistent": true | false
}
Do not write markdown backticks. Return raw JSON only.`;

    let conflicts: string[] = [];
    let isConsistent = true;
    try {
      const resText = await this.llmService.callLLM(
        crossValidationPrompt,
        "Analyze source alignment",
        [],
        false,
        organizationId,
        userId
      );
      const cleanJson = resText.trim();
      const jsonStart = cleanJson.indexOf('{');
      const jsonEnd = cleanJson.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(cleanJson.substring(jsonStart, jsonEnd + 1));
        conflicts = parsed.conflicts || [];
        isConsistent = parsed.isConsistent ?? true;
      }
    } catch (e) {
      this.logger.warn(`Cross Validation check failed: ${e.message}`);
    }

    // 2. Confidence Engine: Calculate aggregate confidence score
    // finalConfidence = (SQLConfidence * 0.40) + (RAGConfidence * 0.40) + (ConsistencyScore * 0.20)
    const dbConf = input.dbResult?.confidenceScore || 0;
    const docConf = (input.docResult?.confidenceScore || 0) * 100; // Convert 0-1.0 scale to 0-100
    const consistencyScore = isConsistent ? 100 : 50;

    const finalConfidence = Math.round(
      (dbConf * 0.45) + (docConf * 0.35) + (consistencyScore * 0.20)
    );

    this.logger.log(`Aggregate Confidence Score: ${finalConfidence} (DB: ${dbConf}, Doc: ${docConf}, Consistency: ${consistencyScore})`);

    // 3. Construct Grounded Evidence string
    const dbFeed = dbRows.length > 0
      ? `Database Records:\n${JSON.stringify(dbRows, null, 2)}`
      : 'No relevant database records found.';
    
    const docFeed = docChunks.length > 0
      ? docChunks.map((c, i) => `[Doc-${i + 1}] (Name: ${c.documentName || c.document?.name || 'Policy'}, Page: ${c.metadata?.page || 1}, Paragraph: ${c.metadata?.paragraph || 1}):\n${c.content}`).join('\n\n')
      : 'No relevant policy documents found.';

    const memFeed = memories.length > 0
      ? memories.map((m, i) => `[Memory-${i + 1}]: ${m.content}`).join('\n')
      : 'No relevant past memory patterns found.';

    const groundedEvidence = `
=== STRUCTURED GROUNDED EVIDENCE ===
${dbFeed}

=== UNSTRUCTURED GROUNDED EVIDENCE ===
${docFeed}

=== HISTORICAL MEMORY EVIDENCE ===
${memFeed}
`.trim();

    return {
      fusedData: {
        dbRows,
        docChunks,
        memories
      },
      conflicts,
      finalConfidence,
      groundedEvidence
    };
  }
}
