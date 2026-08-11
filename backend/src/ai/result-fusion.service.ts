import { Injectable, Logger } from '@nestjs/common';
import { AiLlmService } from './ai-llm.service';
import { EvidenceAuthorityEngine } from './evidence-authority.service';

export interface FusionInput {
  dbResult: {
    rows: any[];
    confidenceScore: number;
    tablesUsed: string[];
    errors?: string[];
    parseError?: string;
    validationResult?: any;
    verified?: boolean;
    queriesRun?: string[];
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

  constructor(
    private llmService: AiLlmService,
    private evidenceAuthorityEngine: EvidenceAuthorityEngine
  ) {}

  // Result Fusion, Cross-Validation & Confidence Engine
  async fuseAndValidate(
    query: string,
    input: FusionInput,
    organizationId: string,
    userId: string,
    classification?: string
  ): Promise<FusionOutput> {
    this.logger.log(`[Result Fusion & Cross Validation] Fusing results for query: "${query}" (Classification: ${classification})`);

    const dbRows = input.dbResult?.rows || [];
    const docChunks = input.docResult?.chunks || [];
    const memories = input.memResult?.memories || [];

    // 1. Cross Validation: Check for contradictions using LLM context auditing
    // Bypass cross-validation if either database records or document chunks are empty
    let conflicts: string[] = [];
    let isConsistent = true;

    // Off by default: this is an extra LLM round trip on the critical path, and the
    // composer is already instructed that live database rows outrank document text.
    // Enable with AI_CROSS_VALIDATION=true when auditing document/DB drift.
    const crossValidationEnabled = (process.env.AI_CROSS_VALIDATION || '').toLowerCase() === 'true';
    const skipCrossValidation = !crossValidationEnabled || dbRows.length === 0 || docChunks.length === 0;

    if (skipCrossValidation) {
      this.logger.log(`[Cross Validation Skipped] enabled=${crossValidationEnabled}, dbRows=${dbRows.length}, docChunks=${docChunks.length}`);
    } else {
      // Priority: Live Database > Approved Documents > Archived Documents
      const crossValidationPrompt = `You are the Zorvex AI V9 Cross Validation Engine.
Analyze the retrieved structured database records and the unstructured document chunks for any factual contradictions or inconsistencies.

Live Database Records (PRIORITY 1 — showing first 50 rows max):
${JSON.stringify(dbRows.slice(0, 50), null, 2)}

Retrieved Documents Context (PRIORITY 2 — showing first 10 chunks max):
${JSON.stringify(docChunks.slice(0, 10), null, 2)}

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
    }

    // 2. Confidence Engine: Calculate aggregate confidence score using multi-dimensional formula
    const dbConf = input.dbResult?.confidenceScore ?? 0; // already 0-100 from pipeline
    // Fix: docResult.confidenceScore may arrive as 0-1 (vector similarity) or 0-100.
    // Normalize to 0-100 safely: if value <= 1 treat as fraction, else treat as already 0-100.
    const rawDocConf = input.docResult?.confidenceScore ?? 0;
    const docConf = rawDocConf <= 1 ? rawDocConf * 100 : rawDocConf;
    const consistencyScore = isConsistent ? 100 : 50;

    // Dimension 1: queryMatchScore
    let queryMatchScore = 100;
    if (classification === 'DATABASE_ONLY' && input.docResult?.chunks?.length > 0) {
      queryMatchScore = 60; // Penalty for mismatch in expected pipelines
    } else if (classification === 'DOCUMENT_ONLY' && input.dbResult?.rows?.length > 0) {
      queryMatchScore = 60;
    } else if (input.dbResult?.queriesRun?.some((q: string) => q.includes('Fallback'))) {
      queryMatchScore = 90; // Minor deduction for templates fallback query match
    }

    // Dimension 2: executionScore
    let executionScore = 100;
    if (classification === 'DATABASE_ONLY' || classification === 'HYBRID') {
      const dbErrors = input.dbResult?.errors || [];
      const isDbVerified = input.dbResult?.verified ?? false;
      if (dbErrors.length > 0) {
        executionScore = 0;
      } else if (isDbVerified) {
        executionScore = 100; // Verification sets execution to 100
      } else {
        executionScore = dbConf;
      }
    } else if (classification === 'DOCUMENT_ONLY') {
      executionScore = docConf;
    }

    // Dimension 3: schemaMatchScore
    let schemaMatchScore = 100;
    if (input.dbResult?.parseError) {
      schemaMatchScore = 70; // JSON comment cleaning parse recovery
    }
    if (input.dbResult?.validationResult?.isValid === false) {
      schemaMatchScore = 0;
    }

    // Dimension 4: consistencyScore
    // Evaluated above as consistencyScore (100 or 50)

    // SUGGESTED FORMULA:
    // finalConfidence = (queryMatchScore * 0.35 + executionScore * 0.35 + schemaMatchScore * 0.15 + consistencyScore * 0.15)
    const finalConfidence = Math.round(
      (queryMatchScore * 0.35) + 
      (executionScore * 0.35) + 
      (schemaMatchScore * 0.15) + 
      (consistencyScore * 0.15)
    );

    // Required Debug Telemetries
    this.logger.log(`[Confidence Engine Breakdown]
    {
      "queryMatchScore": ${queryMatchScore},
      "executionScore": ${executionScore},
      "schemaMatchScore": ${schemaMatchScore},
      "consistencyScore": ${consistencyScore},
      "finalConfidence": ${finalConfidence}
    }`);

    this.logger.log(`[Cross Validation Telemetry]
    {
      "crossValidationExecuted": ${!skipCrossValidation},
      "dbRowsCount": ${dbRows.length},
      "docChunksCount": ${docChunks.length},
      "conflicts": ${JSON.stringify(conflicts)}
    }`);

    // 3. Construct Grounded Evidence string
    //
    // This was `JSON.stringify(dbRows, null, 2)` over every row, uncapped. With
    // take: 50 and nested relations that runs to 10k+ tokens of pretty-printed JSON
    // — the single largest contributor to composer latency, and most of it was
    // padding: two-space indentation, null fields, and UUIDs the composer is
    // explicitly instructed never to print.
    const dbFeed = dbRows.length > 0
      ? `Database Records (${dbRows.length} row(s)):\n${this.compactRowsForPrompt(dbRows)}`
      : 'No relevant database records found.';
    
    const docFeed = docChunks.length > 0
      ? docChunks.map((c, i) => `[Doc-${i + 1}] (Name: ${c.documentName || c.document?.name || 'Policy'}, Page: ${c.metadata?.page || 1}, Paragraph: ${c.metadata?.paragraph || 1}):\n${c.content}`).join('\n\n')
      : 'No relevant policy documents found.';

    const memFeed = memories.length > 0
      ? memories.map((m, i) => `[Memory-${i + 1}]: ${m.content}`).join('\n')
      : 'No relevant past memory patterns found.';

    // Wrap EvidenceAuthorityEngine in try-catch so a failure here doesn't kill fusion output
    let directives = '';
    try {
      directives = this.evidenceAuthorityEngine.generateAuthorityDirectives(query, dbRows, input.dbResult?.tablesUsed || []);
    } catch (e) {
      this.logger.warn(`[Evidence Authority] Failed to generate directives: ${e.message}`);
    }

    const groundedEvidence = `
=== STRUCTURED GROUNDED EVIDENCE ===
${dbFeed}

=== UNSTRUCTURED GROUNDED EVIDENCE ===
${docFeed}

=== HISTORICAL MEMORY EVIDENCE ===
${memFeed}

${directives}
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

  /**
   * Serializes rows for the composer prompt as compactly as possible without
   * losing anything the answer needs.
   *
   * - compact JSON, no indentation
   * - drops null/undefined/empty fields
   * - drops bare UUID values, which the composer is instructed never to print and
   *   which cost ~12 tokens each
   * - caps the row count, stating the true total so the composer can still report it
   *
   * The full row set stays available to the grounding verifier, which checks against
   * `dbResult.rows` rather than this string — so trimming the prompt cannot cause a
   * legitimate value to be flagged as fabricated.
   */
  private compactRowsForPrompt(rows: any[], maxRows = 25): string {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const strip = (value: any, depth = 0): any => {
      if (value == null || depth > 4) return undefined;

      if (typeof value === 'string') {
        if (!value.trim()) return undefined;
        if (UUID_RE.test(value)) return undefined;
        return value;
      }

      if (typeof value === 'number' || typeof value === 'boolean') return value;

      if (value instanceof Date) return value.toISOString().slice(0, 10);

      if (Array.isArray(value)) {
        const out = value.map(v => strip(v, depth + 1)).filter(v => v !== undefined);
        return out.length ? out : undefined;
      }

      if (typeof value === 'object') {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) {
          // Foreign keys are UUIDs by another name — the joined object carries the
          // human-readable data the answer actually needs.
          if (/Id$/.test(k) && typeof v === 'string' && UUID_RE.test(v)) continue;
          const cleaned = strip(v, depth + 1);
          if (cleaned !== undefined) out[k] = cleaned;
        }
        return Object.keys(out).length ? out : undefined;
      }

      return undefined;
    };

    const shown = rows.slice(0, maxRows).map(r => strip(r)).filter(r => r !== undefined);
    const json = JSON.stringify(shown);

    return rows.length > maxRows
      ? `${json}\n(Showing the first ${maxRows} of ${rows.length} rows. The true total is ${rows.length} — report that figure, not ${maxRows}.)`
      : json;
  }
}
