import { 
  Controller, 
  Post, 
  Get, 
  Delete, 
  Body, 
  Param, 
  UploadedFile, 
  UseInterceptors, 
  UseGuards, 
  Request, 
  HttpException, 
  HttpStatus 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private prisma: PrismaService
  ) {}

  // -----------------------------------------------------------------------------
  // Chat core endpoint (RAG + Postgres live database tools)
  // -----------------------------------------------------------------------------
  // -----------------------------------------------------------------------------
  // AI Chat Sessions Endpoints (Persistent History)
  // -----------------------------------------------------------------------------
  @Get('sessions')
  async getSessions(@Request() req) {
    return this.prisma.aiChatSession.findMany({
      where: {
        userId: req.user.id,
        organizationId: req.user.organizationId,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Get('sessions/:id')
  async getSession(@Param('id') id: string, @Request() req) {
    const session = await this.prisma.aiChatSession.findFirst({
      where: {
        id,
        userId: req.user.id,
        organizationId: req.user.organizationId,
      },
    });
    if (!session) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }
    return session;
  }

  @Post('sessions')
  async createSession(@Body('title') title: string, @Request() req) {
    return this.prisma.aiChatSession.create({
      data: {
        title: title || 'New Conversation',
        userId: req.user.id,
        organizationId: req.user.organizationId,
        messages: [],
      },
    });
  }

  @Delete('sessions/:id')
  async deleteSession(@Param('id') id: string, @Request() req) {
    const session = await this.prisma.aiChatSession.findFirst({
      where: {
        id,
        userId: req.user.id,
        organizationId: req.user.organizationId,
      },
    });
    if (!session) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }
    await this.prisma.aiChatSession.delete({
      where: { id },
    });
    return { success: true };
  }

  // -----------------------------------------------------------------------------
  // Chat core endpoint (RAG + Postgres live database tools with history session)
  // -----------------------------------------------------------------------------
  @Post('chat')
  async chat(
    @Body('message') message: string,
    @Request() req,
    @Body('sessionId') sessionId?: string
  ) {
    if (!message || !message.trim()) {
      throw new HttpException('Message cannot be empty', HttpStatus.BAD_REQUEST);
    }

    let history: any[] = [];
    let session: any = null;

    if (sessionId) {
      session = await this.prisma.aiChatSession.findFirst({
        where: {
          id: sessionId,
          userId: req.user.id,
          organizationId: req.user.organizationId,
        },
      });

      if (session) {
        history = Array.isArray(session.messages) ? session.messages : [];
      }
    }

    // Convert history objects to AI format
    const aiHistory = history.map(h => ({
      role: h.role === 'user' ? 'user' as const : 'model' as const,
      content: h.content,
    }));

    const result = await this.aiService.chat(
      message, 
      req.user.id, 
      req.user.organizationId, 
      req.user.role,
      aiHistory
    );

    // Save history if active session
    if (session) {
      const userMsg = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
      };

      const modelMsg = {
        id: `model-${Date.now()}`,
        role: 'model',
        content: result.response,
        toolExecuted: result.toolExecuted,
        toolData: result.toolData,
        citations: result.citations,
        createdAt: new Date().toISOString(),
      };

      const updatedMessages = [...history, userMsg, modelMsg];

      // Update session title dynamically on first query
      let title = session.title;
      if (history.length === 0) {
        title = message.length > 25 ? message.substring(0, 22) + '...' : message;
      }

      await this.prisma.aiChatSession.update({
        where: { id: sessionId },
        data: {
          title,
          messages: updatedMessages,
        },
      });
    }

    return result;
  }

  // -----------------------------------------------------------------------------
  // Document Knowledge Base Upload Endpoints
  // -----------------------------------------------------------------------------
  @Post('documents/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @UploadedFile() file: any, // Use any to avoid Express.Multer.File typings conflict
    @Body('name') name: string,
    @Body('noteContent') noteContent: string, // Support pasting plain notes directly
    @Request() req
  ) {
    let docName = name || 'Unnamed Document';
    let fileType = 'NOTE';
    let rawText = '';
    let fileSize = 0;

    // A. Parse Uploaded File
    if (file) {
      docName = file.originalname;
      fileSize = file.size;
      const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
      
      if (isPdf) {
        fileType = 'PDF';
        try {
          rawText = await this.aiService.parsePdf(file.buffer);
        } catch (e) {
          throw new HttpException(`PDF Extraction Failed: ${e.message}`, HttpStatus.UNPROCESSABLE_ENTITY);
        }
      } else {
        fileType = 'TXT';
        rawText = file.buffer.toString('utf-8');
      }
    } 
    // B. Parse custom note paste fallback
    else if (noteContent && noteContent.trim()) {
      fileType = 'NOTE';
      rawText = noteContent;
      fileSize = Buffer.byteLength(noteContent, 'utf8');
      if (!name) docName = `Quick Note - ${new Date().toLocaleDateString()}`;
    } else {
      throw new HttpException('No document file or note content provided', HttpStatus.BAD_REQUEST);
    }

    if (!rawText.trim()) {
      throw new HttpException('No readable text found in document or note', HttpStatus.BAD_REQUEST);
    }

    try {
      // 1. Create document model in database
      const document = await this.prisma.aiDocument.create({
        data: {
          name: docName,
          fileType,
          fileSize,
          organizationId: req.user.organizationId,
          createdById: req.user.id,
        },
      });

      // 2. Split document text into overlapping sliding window chunks
      const chunks = this.aiService.chunkText(rawText);

      // 3. Generate embeddings and save each chunk in database
      for (const chunkText of chunks) {
        const embedding = await this.aiService.generateEmbedding(chunkText);
        await this.prisma.aiDocumentChunk.create({
          data: {
            content: chunkText,
            embedding,
            documentId: document.id,
          },
        });
      }

      return {
        success: true,
        message: `Indexed "${docName}" successfully. Generated ${chunks.length} knowledge vectors.`,
        documentId: document.id,
        chunksCount: chunks.length,
      };
    } catch (err) {
      throw new HttpException(`Vector Indexing Error: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // -----------------------------------------------------------------------------
  // Document Knowledge Base Listing & Deletions
  // -----------------------------------------------------------------------------
  @Get('documents')
  async getDocuments(@Request() req) {
    return this.prisma.aiDocument.findMany({
      where: {
        organizationId: req.user.organizationId,
      },
      select: {
        id: true,
        name: true,
        fileType: true,
        fileSize: true,
        createdAt: true,
        createdBy: {
          select: { firstName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Delete('documents/:id')
  async deleteDocument(@Param('id') id: string, @Request() req) {
    const doc = await this.prisma.aiDocument.findFirst({
      where: {
        id,
        organizationId: req.user.organizationId,
      },
    });

    if (!doc) {
      throw new HttpException('Document index not found', HttpStatus.NOT_FOUND);
    }

    // Cascade deletion handles cleaning up the AiDocumentChunk embedding rows cleanly
    await this.prisma.aiDocument.delete({
      where: { id },
    });

    return {
      success: true,
      message: `Document "${doc.name}" and its vector indices deleted successfully.`,
    };
  }

  @Post('meeting/:id/summary')
  async generateMeetingSummary(@Param('id') eventId: string) {
    // If summary is already cached in memory, return it immediately
    const summary = await this.aiService.generateMeetingSummary(eventId);
    if (summary && (summary as any).agenda && (summary as any).agenda !== "No active meeting session found.") {
      if ((summary as any).keyPoints && (summary as any).keyPoints.length > 0) {
        return summary;
      }
    }

    // Otherwise, trigger the generation in the background so it doesn't block the client UI
    this.aiService.generateMeetingSummary(eventId).catch(err => {
      // Background errors logged inside service
    });

    return { success: true, status: 'generating' };
  }
}
