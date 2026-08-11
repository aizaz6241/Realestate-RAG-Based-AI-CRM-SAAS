import { Module } from '@nestjs/common';
import { AiNewController } from './ai-new.controller';
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

@Module({
  controllers: [AiNewController],
  providers: [
    AiNewLlmService,
    QueryUnderstandingService,
    SchemaUnderstandingService,
    PermissionValidationService,
    SqlGenerationService,
    SqlValidationService,
    QueryOptimizationService,
    DatabaseRetrievalService,
    ResultVerificationService,
    ConfidenceScoringService,
    GroundedResponseService,
    CitationTraceService,
    HallucinationFallbackService,
    IntelligentCacheService,
    ObservabilityService,
  ],
  exports: [AiNewLlmService],
})
export class AiNewModule {}
