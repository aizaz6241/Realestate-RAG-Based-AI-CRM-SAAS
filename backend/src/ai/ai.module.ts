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
    AiRagService,
    AiRagIngestionService,
    AiRagRetrievalService,
    AiRagRerankerService,
    AiRagCacheService,
    AiRagEvaluatorService,
  ],
})
export class AiModule {}
