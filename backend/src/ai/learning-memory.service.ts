import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiLlmService } from './ai-llm.service';
import * as fs from 'fs';
import * as path from 'path';

export interface LearningInteraction {
  userQuestion: string;
  executionPlan: any;
  retrievedSources: {
    dbTables: string[];
    documents: string[];
  };
  finalResponse: string;
  feedback?: string;
  confidenceScore: number;
  timestamp: string;
}

@Injectable()
export class LearningMemoryService {
  private readonly logger = new Logger(LearningMemoryService.name);
  private readonly logsDir = path.join(process.cwd(), 'src', 'ai', 'logs', 'learning-traces');

  constructor(
    private prisma: PrismaService,
    private llmService: AiLlmService
  ) {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  // Learning Engine - Store every interaction detail for continuous model learning
  async storeInteraction(log: LearningInteraction, organizationId: string): Promise<void> {
    const filename = `interaction-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.json`;
    const filePath = path.join(this.logsDir, filename);

    try {
      fs.writeFileSync(filePath, JSON.stringify({ ...log, organizationId }, null, 2));
      this.logger.log(`[Learning Engine] Saved interaction trace to ${filename}`);
    } catch (e) {
      this.logger.error(`Failed to write learning trace: ${e.message}`);
    }
  }

  // Organizational Memory Engine - Extract patterns and store in memory vectors
  async extractAndStoreOrganizationalMemory(
    responseText: string,
    queryText: string,
    organizationId: string,
    userId: string
  ): Promise<void> {
    this.logger.log(`[Organizational Memory Engine] Scanning response for memories to extract`);

    try {
      const memoryExtractionPrompt = `You are the Zorvex AI V9 Organizational Memory Extraction Engine.
Analyze the user query and compiled response. Extract any repeated business issues, operational trends, executive decisions, or client preferences.
Output these as single-sentence operational memory points.

User Query: "${queryText}"
Compiled Response:
"""
${responseText}
"""

Instructions:
1. Extract at most 2 critical organizational observations.
2. Example memory: "Client budget threshold for Downtown Dubai listings is trending upwards of AED 4,000,000." or "Dubai Marina listings currently exhibit a 15% inventory shortage."
3. Return ONLY a JSON array of strings. Do not include markdown code block tags.`;

      const response = await this.llmService.callLLM(
        memoryExtractionPrompt,
        "Extract operational memories",
        [],
        false,
        organizationId,
        userId
      );

      const cleanJson = response.trim();
      const jsonStart = cleanJson.indexOf('[');
      const jsonEnd = cleanJson.lastIndexOf(']');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const memories = JSON.parse(cleanJson.substring(jsonStart, jsonEnd + 1)) as string[];
        for (const bullet of memories) {
          if (bullet.length < 15 || bullet.length > 500) continue;

          // Check if memory already exists
          const exists = await this.prisma.aiMemoryVector.findFirst({
            where: {
              organizationId,
              content: bullet
            }
          });

          if (!exists) {
            const embedding = await this.llmService.generateEmbedding(bullet, organizationId, userId);
            await this.prisma.aiMemoryVector.create({
              data: {
                category: 'PATTERN:OPERATIONAL',
                content: bullet,
                embedding,
                organizationId
              }
            });
            this.logger.log(`[Memory Engine] Persisted operational memory: "${bullet}"`);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to run background memory extraction: ${err.message}`);
    }
  }
}
