import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { EmployeesModule } from './employees/employees.module';
import { PropertiesModule } from './properties/properties.module';
import { LeadsModule } from './leads/leads.module';
import { ClientsModule } from './clients/clients.module';
import { TasksModule } from './tasks/tasks.module';
import { OwnersModule } from './owners/owners.module';
import { DocumentsModule } from './documents/documents.module';
import { LogisticsModule } from './logistics/logistics.module';
import { ChatModule } from './chat/chat.module';
import { CalendarModule } from './calendar/calendar.module';
import { AiModule } from './ai/ai.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [AuthModule, UsersModule, PrismaModule, EmployeesModule, PropertiesModule, LeadsModule, ClientsModule, TasksModule, OwnersModule, DocumentsModule, LogisticsModule, ChatModule, CalendarModule, AiModule, IntegrationsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
