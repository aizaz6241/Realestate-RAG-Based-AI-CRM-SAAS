import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [PrismaModule, UsersModule, ChatModule],
  providers: [EmployeesService],
  controllers: [EmployeesController]
})
export class EmployeesModule {}
