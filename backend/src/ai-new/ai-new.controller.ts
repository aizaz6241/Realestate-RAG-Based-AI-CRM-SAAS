import { Controller, Post, Get, Body, UseGuards, Request, HttpException, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AiNewLlmService } from './ai-new-llm.service';
import { QueryUnderstandingService } from './database/query-understanding.service';
import { SchemaUnderstandingService } from './database/schema-understanding.service';
import { PermissionValidationService } from './database/permission-validation.service';
import { SqlGenerationService } from './database/sql-generation.service';
import { SqlValidationService } from './database/sql-validation.service';
import { QueryOptimizationService } from './database/query-optimization.service';
import { DatabaseRetrievalService } from './database/database-retrieval.service';
import { ResultVerificationService } from './database/result-verification.service';
import { ConfidenceScoringService } from './database/confidence-scoring.service';
import { GroundedResponseService } from './database/grounded-response.service';
import { CitationTraceService } from './database/citation-trace.service';
import { HallucinationFallbackService } from './database/hallucination-fallback.service';
import { IntelligentCacheService } from './cache/intelligent-cache.service';
import { ObservabilityService } from './observability/observability.service';

@UseGuards(JwtAuthGuard)
@Controller('ai-new')
export class AiNewController {
  constructor(
    private readonly aiNewLlmService: AiNewLlmService,
    private readonly queryUnderstandingService: QueryUnderstandingService,
    private readonly schemaUnderstandingService: SchemaUnderstandingService,
    private readonly permissionValidationService: PermissionValidationService,
    private readonly sqlGenerationService: SqlGenerationService,
    private readonly sqlValidationService: SqlValidationService,
    private readonly queryOptimizationService: QueryOptimizationService,
    private readonly databaseRetrievalService: DatabaseRetrievalService,
    private readonly resultVerificationService: ResultVerificationService,
    private readonly confidenceScoringService: ConfidenceScoringService,
    private readonly groundedResponseService: GroundedResponseService,
    private readonly citationTraceService: CitationTraceService,
    private readonly hallucinationFallbackService: HallucinationFallbackService,
    private readonly cacheService: IntelligentCacheService,
    private readonly observabilityService: ObservabilityService,
    private readonly prisma: PrismaService
  ) {}

  /** Prior turns for this session, tenant-scoped. Empty when there's no session. */
  private async loadHistory(
    sessionId: string | undefined,
    userId: string | undefined,
    organizationId: string | undefined
  ): Promise<{ role: 'user' | 'model'; content: string }[]> {
    if (!sessionId || !userId || !organizationId) return [];

    try {
      const session = await this.prisma.aiChatSession.findFirst({
        where: { id: sessionId, userId, organizationId },
        select: { messages: true },
      });
      if (!session || !Array.isArray(session.messages)) return [];

      return (session.messages as any[])
        .slice(-8)
        .map(m => ({
          role: m.role === 'user' ? 'user' as const : 'model' as const,
          content: String(m.content ?? ''),
        }))
        .filter(m => m.content);
    } catch (err) {
      // History is an optimisation, not a requirement — never fail the request for it.
      return [];
    }
  }

  @Post('chat')
  async chat(
    @Body('message') message: string,
    @Request() req: any,
    @Body('sessionId') sessionId?: string,
    @Body('debug') debug?: boolean
  ) {
    if (!message || !message.trim()) {
      throw new HttpException('Message cannot be empty', HttpStatus.BAD_REQUEST);
    }

    // Load prior turns. Without this the endpoint was stateless, so Layer 1 could
    // not know it had just asked for clarification and would ask again every turn —
    // the user could answer four times and never get past it.
    const history = await this.loadHistory(sessionId, req.user?.id, req.user?.organizationId);

    const startTimeMs = Date.now();
    const traceId = crypto.randomUUID();
    this.observabilityService.startTrace(traceId);

    let dbTimeMs = 0;
    let llmTimeMs = 0;

    const query = message.trim();
    // Step 1: Query Understanding Layer
    this.observabilityService.startSpan(traceId, 'Layer 1: Query Understanding');
    const queryUnderstandingResult = await this.queryUnderstandingService.analyzeQuery(
      message,
      req.user?.organizationId,
      req.user?.id,
      history
    );
    this.observabilityService.endSpan(traceId, 'Layer 1: Query Understanding');

    // Fast-Path for Conversational / Unclear Queries
    if (queryUnderstandingResult.requiresClarification) {
      const totalLatency = Date.now() - startTimeMs;
      this.observabilityService.endTrace(traceId, 'CLARIFICATION_REQUIRED', 0, false, totalLatency);
      return {
        status: 'SUCCESS',
        response: queryUnderstandingResult.clarificationQuestion || "I didn't quite catch that. Could you please specify what data you are looking for?",
        toolExecuted: null,
        toolData: null,
        workspaceState: { activeTab: 'ai', previewData: null }
      };
    }

    if (queryUnderstandingResult.intent === 'UNKNOWN') {
      const totalLatency = Date.now() - startTimeMs;
      this.observabilityService.endTrace(traceId, 'UNKNOWN_INTENT', 0, false, totalLatency);
      return {
        status: 'SUCCESS',
        // Answer the capability question concretely. The previous reply asked
        // "What would you like to know today?" — which, in response to
        // "how can you help me?", is the assistant asking the user what it can do.
        response: [
          "I can query your live business data and answer from it directly. For example:",
          '',
          '- **Properties** — "how many properties do we have?", "listings in Dubai Marina under 2 million"',
          '- **Leads & clients** — "show unassigned leads", "clients in the offer stage"',
          '- **Staff & HR** — "list all employees", "who was absent yesterday", "pending leave requests"',
          '- **Finance** — "total payroll this month", "revenue by agent"',
          '- **Tasks & meetings** — "overdue tasks", "what is scheduled this week"',
          '',
          'Ask in plain English or Roman Urdu — both work.',
        ].join('\n'),
        toolExecuted: null,
        toolData: null,
        workspaceState: { activeTab: 'ai', previewData: null }
      };
    }

    // Step 2: Schema Understanding Layer
    this.observabilityService.startSpan(traceId, 'Layer 2: Schema Understanding');
    const schemaUnderstandingResult = await this.schemaUnderstandingService.analyzeSchemaContext(
      queryUnderstandingResult,
      req.user?.organizationId,
      req.user?.id
    );
    this.observabilityService.endSpan(traceId, 'Layer 2: Schema Understanding');

    // Step 3: Permission Validation Layer (Security Gatekeeper)
    this.observabilityService.startSpan(traceId, 'Layer 3: Permission Validation');
    const userContext = {
      id: req.user?.id || 'unknown',
      role: req.user?.role || 'VIEWER', // Fallback to lowest privilege
      organizationId: req.user?.organizationId || 'unknown'
    };

    const permissionResult = this.permissionValidationService.validatePermissions(
      userContext,
      schemaUnderstandingResult
    );
    this.observabilityService.endSpan(traceId, 'Layer 3: Permission Validation');

    if (!permissionResult.isAuthorized) {
      const totalLatency = Date.now() - startTimeMs;
      this.observabilityService.endTrace(traceId, 'PERMISSION_DENIED', 0, false, totalLatency);
      return {
        status: 'SUCCESS',
        response: `**Access Denied**: ${permissionResult.reason}`,
        toolExecuted: null,
        toolData: null,
        workspaceState: { activeTab: 'ai', previewData: null }
      };
    }

    // Step 4: SQL Generation Layer (Natural Language to SQL Translation)
    this.observabilityService.startSpan(traceId, 'Layer 4: SQL Generation');
    const sqlGenerationResult = await this.sqlGenerationService.generateSql(
      queryUnderstandingResult,
      permissionResult,
      userContext
    );
    this.observabilityService.endSpan(traceId, 'Layer 4: SQL Generation');

    // Step 5: SQL Validation Layer (Multi-Stage Security & Performance Check)
    this.observabilityService.startSpan(traceId, 'Layer 5: SQL Validation');
    let sqlValidationResult: any = null;
    if (sqlGenerationResult.sql) {
      sqlValidationResult = await this.sqlValidationService.validateSql(
        sqlGenerationResult.sql,
        permissionResult.schema
      );
    }
    this.observabilityService.endSpan(traceId, 'Layer 5: SQL Validation');

    // Step 6: Query Optimization Layer (Performance, CBO, Index Check)
    this.observabilityService.startSpan(traceId, 'Layer 6: Query Optimization');
    let sqlOptimizationResult: any = null;
    if (sqlValidationResult && sqlValidationResult.valid) {
      sqlOptimizationResult = await this.queryOptimizationService.optimizeQuery(
        sqlGenerationResult.sql,
        permissionResult.schema
      );
    }
    this.observabilityService.endSpan(traceId, 'Layer 6: Query Optimization');

    // For now, we will return the JSON stringified as the response so the user can see it in the chat UI.
    const provider = queryUnderstandingResult._metadata?.provider || 'Unknown';
    let responseText = `**[Model Used: ${provider}]**\n\n**[Layer 1: Query Understanding Result]**\n\n\`\`\`json\n${JSON.stringify(queryUnderstandingResult, null, 2)}\n\`\`\``;
    responseText += `\n\n**[Layer 2: Schema Understanding Result]**\n\n\`\`\`json\n${JSON.stringify(schemaUnderstandingResult, null, 2)}\n\`\`\``;
    responseText += `\n\n**[Layer 3: Permission Validation Result]**\n\n\`\`\`json\n${JSON.stringify(permissionResult, null, 2)}\n\`\`\``;
    responseText += `\n\n**[Layer 4: SQL Generation Result]**\n\n**Query Plan:**\n${sqlGenerationResult.queryPlan}\n\n**Generated SQL:**\n\`\`\`sql\n${sqlGenerationResult.sql}\n\`\`\``;
    
    if (sqlValidationResult) {
      responseText += `\n\n**[Layer 5: SQL Validation Result]**\n\n\`\`\`json\n${JSON.stringify(sqlValidationResult, null, 2)}\n\`\`\``;
    }
    
    if (sqlOptimizationResult) {
      responseText += `\n\n**[Layer 6: Query Optimization Result]**\n\n\`\`\`json\n${JSON.stringify(sqlOptimizationResult, null, 2)}\n\`\`\``;
    }

    // Step 7: Database Retrieval Layer
    this.observabilityService.startSpan(traceId, 'Layer 7: Database Retrieval');
    let databaseRetrievalResult: any = null;
    const dbStart = Date.now();
    if (sqlOptimizationResult && sqlOptimizationResult.optimized && sqlOptimizationResult.finalSql) {
      databaseRetrievalResult = await this.databaseRetrievalService.executeSql(
        sqlOptimizationResult.finalSql,
        sqlOptimizationResult,
        sqlValidationResult
      );
      responseText += `\n\n**[Layer 7: Database Retrieval Result]**\n\n\`\`\`json\n${JSON.stringify(databaseRetrievalResult, null, 2)}\n\`\`\``;
    } else if (sqlValidationResult && sqlValidationResult.valid) {
      // Fallback if optimization didn't change SQL but it's valid
      databaseRetrievalResult = await this.databaseRetrievalService.executeSql(
        sqlGenerationResult.sql,
        null,
        sqlValidationResult
      );
      responseText += `\n\n**[Layer 7: Database Retrieval Result]**\n\n\`\`\`json\n${JSON.stringify(databaseRetrievalResult, null, 2)}\n\`\`\``;
    }
    dbTimeMs = Date.now() - dbStart;
    this.observabilityService.endSpan(traceId, 'Layer 7: Database Retrieval');

    // Step 8: Result Verification Layer
    this.observabilityService.startSpan(traceId, 'Layer 8: Result Verification');
    let resultVerificationReport: any = null;
    if (databaseRetrievalResult) {
      resultVerificationReport = this.resultVerificationService.verifyResult(
        databaseRetrievalResult,
        queryUnderstandingResult,
        userContext
      );
      responseText += `\n\n**[Layer 8: Result Verification Engine]**\n\n\`\`\`json\n${JSON.stringify(resultVerificationReport, null, 2)}\n\`\`\``;
    }
    this.observabilityService.endSpan(traceId, 'Layer 8: Result Verification');

    // Step 9: Confidence Scoring Layer
    this.observabilityService.startSpan(traceId, 'Layer 9: Confidence Scoring');
    let confidenceScoringResult: any = null;
    confidenceScoringResult = this.confidenceScoringService.calculateConfidence(
      queryUnderstandingResult,
      schemaUnderstandingResult,
      sqlGenerationResult,
      sqlValidationResult,
      databaseRetrievalResult,
      resultVerificationReport
    );
    responseText += `\n\n**[Layer 9: Confidence Scoring Engine]**\n\n\`\`\`json\n${JSON.stringify(confidenceScoringResult, null, 2)}\n\`\`\``;
    this.observabilityService.endSpan(traceId, 'Layer 9: Confidence Scoring');

    // Step 10: Grounded Response Generation Layer
    this.observabilityService.startSpan(traceId, 'Layer 10: Grounded Response');
    const llmStart = Date.now();
    const finalResponseResult = await this.groundedResponseService.generateResponse(
      query,
      queryUnderstandingResult,
      databaseRetrievalResult,
      confidenceScoringResult,
      resultVerificationReport
    );
    llmTimeMs = Date.now() - llmStart;
    this.observabilityService.endSpan(traceId, 'Layer 10: Grounded Response');

    // Step 11: Citation & Query Trace Layer
    this.observabilityService.startSpan(traceId, 'Layer 11: Citation & Query Trace');
    const citationTraceResult = this.citationTraceService.generateTrace(
      startTimeMs,
      dbTimeMs,
      llmTimeMs,
      finalResponseResult,
      confidenceScoringResult,
      resultVerificationReport,
      databaseRetrievalResult,
      sqlOptimizationResult,
      sqlValidationResult,
      sqlGenerationResult,
      permissionResult,
      schemaUnderstandingResult,
      queryUnderstandingResult
    );
    this.observabilityService.endSpan(traceId, 'Layer 11: Citation & Query Trace');

    // Step 12: Hallucination Fallback Layer
    this.observabilityService.startSpan(traceId, 'Layer 12: Hallucination Fallback');
    const fallbackResult = this.hallucinationFallbackService.evaluateFallback(
      confidenceScoringResult,
      resultVerificationReport,
      databaseRetrievalResult,
      sqlValidationResult,
      finalResponseResult
    );
    this.observabilityService.endSpan(traceId, 'Layer 12: Hallucination Fallback');

    const finalHumanText = fallbackResult.isFallback ? fallbackResult.message : finalResponseResult.answer;

    const totalLatencyMs = Date.now() - startTimeMs;
    this.observabilityService.endTrace(
      traceId, 
      fallbackResult.status, 
      confidenceScoringResult.confidence, 
      fallbackResult.isFallback, 
      totalLatencyMs
    );

    // Attach cache metrics to trace
    const enrichedTrace = {
      ...citationTraceResult,
      traceId,
      observabilityMetrics: this.observabilityService.getMetrics(),
      cacheMetrics: this.cacheService.getMetrics()
    };

    return {
      status: fallbackResult.status,
      response: finalHumanText,
      toolExecuted: 'citationTrace',
      toolData: enrichedTrace, // Pass the full trace metadata to frontend
      workspaceState: { activeTab: 'ai', previewData: null }
    };
  }

  @Get('metrics')
  getMetrics() {
    return {
      status: 'SUCCESS',
      observability: this.observabilityService.getMetrics(),
      caching: this.cacheService.getMetrics()
    };
  }
}
