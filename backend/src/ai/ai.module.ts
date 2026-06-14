import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiLlmService } from './ai-llm.service';
import { AiValidationService } from './ai-validation.service';
import { AiAgentsService } from './ai-agents.service';
import { AiDatabaseToolsService } from './ai-database-tools.service';
import { AiController } from './ai.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CalendarModule } from '../calendar/calendar.module';
import { AutonomousFollowUpService } from './autonomous-followup.service';
import { ZorvexGateway } from './zorvex.gateway';
import { ExecutiveDecisionService } from './executive-decision.service';
import { RealEstateIntelligenceService } from './real-estate-intelligence.service';

// V9 Core Services
import { CognitiveGatewayService } from './cognitive-gateway.service';
import { PlanningEngineService } from './planning-engine.service';
import { DatabasePipelineService } from './database-pipeline.service';
import { ResultFusionService } from './result-fusion.service';
import { LearningMemoryService } from './learning-memory.service';
import { ObservabilityService } from './observability.service';
import { MultiTierRouterService } from './multi-tier-router.service';

// Remediation & Security Services
import { TenantIsolationService } from './tenant-isolation.service';
import { EvidenceAuthorityEngine } from './evidence-authority.service';
import { EntityResolutionService } from './entity-resolution.service';
import { ResponseSanitizer } from './response-sanitizer.service';

// RAG Services
import { AiRagService } from './rag/ai-rag.service';
import { AiRagIngestionService } from './rag/ai-rag-ingestion.service';
import { AiRagRetrievalService } from './rag/ai-rag-retrieval.service';
import { AiRagRerankerService } from './rag/ai-rag-reranker.service';
import { AiRagCacheService } from './rag/ai-rag-cache.service';
import { AiRagEvaluatorService } from './rag/ai-rag-evaluator.service';

@Module({
  imports: [PrismaModule, CalendarModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiLlmService,
    AiValidationService,
    AiAgentsService,
    AiDatabaseToolsService,
    AutonomousFollowUpService,
    ZorvexGateway,
    ExecutiveDecisionService,
    RealEstateIntelligenceService,
    CognitiveGatewayService,
    PlanningEngineService,
    DatabasePipelineService,
    ResultFusionService,
    LearningMemoryService,
    ObservabilityService,
    MultiTierRouterService,
    TenantIsolationService,
    EvidenceAuthorityEngine,
    EntityResolutionService,
    ResponseSanitizer,
    AiRagService,
    AiRagIngestionService,
    AiRagRetrievalService,
    AiRagRerankerService,
    AiRagCacheService,
    AiRagEvaluatorService,
  ],
  exports: [
    AiService,
    AiLlmService,
    AiValidationService,
    AiAgentsService,
    AiDatabaseToolsService,
    ZorvexGateway,
    ExecutiveDecisionService,
    RealEstateIntelligenceService,
    CognitiveGatewayService,
    PlanningEngineService,
    DatabasePipelineService,
    ResultFusionService,
    LearningMemoryService,
    ObservabilityService,
    MultiTierRouterService,
    TenantIsolationService,
    EvidenceAuthorityEngine,
    EntityResolutionService,
    ResponseSanitizer,
    AiRagService,
    AiRagIngestionService,
    AiRagRetrievalService,
    AiRagRerankerService,
    AiRagCacheService,
    AiRagEvaluatorService,
  ],
})
export class AiModule {}
