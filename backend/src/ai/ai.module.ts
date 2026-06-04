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
  ],
})
export class AiModule {}
