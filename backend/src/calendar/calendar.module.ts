import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CalendarService],
  controllers: [CalendarController],
  exports: [CalendarService]
})
export class CalendarModule {}
