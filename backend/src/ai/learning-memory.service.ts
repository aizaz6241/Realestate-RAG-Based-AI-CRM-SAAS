import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiLlmService } from './ai-llm.service';
import { VectorStoreService } from './vector-store.service';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
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
  // Use DATA_DIR env var for production deployments (configurable). Never write to src/ in prod.
  private readonly logsDir = path.join(
    process.env.DATA_DIR || process.cwd(),
    'ai-logs',
    'learning-traces'
  );

  constructor(
    private prisma: PrismaService,
    private llmService: AiLlmService,
    private vectorStore: VectorStoreService
  ) {
    // Use sync mkdir ONLY at startup — acceptable; production writes use async
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch (e) {
      this.logger.warn(`Could not create learning traces dir: ${e.message}`);
    }
  }

  // Learning Engine - Store every interaction detail for continuous model learning
  async storeInteraction(log: LearningInteraction, organizationId: string): Promise<void> {
    const filename = `interaction-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.json`;
    const filePath = path.join(this.logsDir, filename);

    try {
      // Fix: use async writeFile — sync blocks the NestJS event loop under load
      await fsPromises.writeFile(filePath, JSON.stringify({ ...log, organizationId }, null, 2), 'utf-8');
      this.logger.log(`[Learning Engine] Saved interaction trace to ${filename}`);
    } catch (e) {
      // File write failure is non-fatal — log and continue
      this.logger.warn(`[Learning Engine] Non-fatal: Failed to write learning trace: ${e.message}`);
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
${responseText.slice(0, 2000)}
"""

Instructions:
1. Extract at most 2 critical organizational observations from what is EXPLICITLY stated in the response. Do NOT infer or assume.
2. Return ONLY a JSON array of strings. Do not include markdown code block tags.
3. If no clear operational pattern exists, return an empty array: []`;

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
            // Zero-vector rejection now lives in generateEmbedding, which throws
            // rather than returning a poison vector — so reaching here means the
            // embedding is valid.
            await this.vectorStore.insertMemoryVector(
              bullet,
              'PATTERN:OPERATIONAL',
              organizationId,
              {},
              userId
            );
            this.logger.log(`[Memory Engine] Persisted operational memory: "${bullet}"`);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to run background memory extraction: ${err.message}`);
    }
  }
}
