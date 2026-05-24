import { Module } from '@nestjs/common';
import { OwnersService } from './owners.service';
import { OwnersController } from './owners.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OwnersController],
  providers: [OwnersService],
  exports: [OwnersService],
})
export class OwnersModule {}
