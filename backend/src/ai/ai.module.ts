import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [PrismaModule, CalendarModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
