import { Module } from '@nestjs/common';
import { SaasAdminService } from './saas-admin.service';
import { SaasAdminController } from './saas-admin.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SaasAdminService],
  controllers: [SaasAdminController],
  exports: [SaasAdminService]
})
export class SaasAdminModule {}
