import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env file manually from root folder
dotenv.config({ path: path.join(process.cwd(), '.env') });

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    console.log("CWD IS:", process.cwd());
    console.log("DATABASE_URL IS:", process.env.DATABASE_URL);
    super();
  }

  async onModuleInit() {
    try {
      await this.$connect();
      console.log("🟢 Successfully connected to database via Prisma.");
    } catch (err) {
      console.warn("⚠️ [RENS Startup Alert] Database is unreachable at module initialization.");
      console.warn("⚠️ NestJS will continue starting up. Prisma will reconnect automatically on the first query.");
      console.warn(err);
    }
  }
}
