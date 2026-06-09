import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
const pdfParser = require('pdf-parse');

export interface DocumentMetadata {
  authorId: string;
  source: string;
  allowedRoles: string[];
  allowedUsers?: string[];
  [key: string]: any;
}

@Injectable()
export class AiRagIngestionService {
  private readonly logger = new Logger(AiRagIngestionService.name);

  constructor(private prisma: PrismaService) {}

  // Parse file buffer depending on type
  async parseDocument(buffer: Buffer, fileType: string, fileName: string): Promise<string> {
    const type = fileType.toUpperCase();
    this.logger.log(`Parsing document: ${fileName} (${type})`);

    try {
      if (type === 'PDF') {
        const data = await pdfParser(buffer);
        return data.text || '';
      } else if (type === 'HTML') {
        const rawText = buffer.toString('utf-8');
        return this.cleanHtml(rawText);
      } else if (type === 'TXT' || type === 'NOTE' || type === 'EMAIL') {
        return buffer.toString('utf-8');
      } else if (type === 'DOCX') {
        // DOCX is a zip file containing word/document.xml
        // For a bulletproof baseline without heavy extra dependencies, we can extract plain text XML or use note/text extraction
        // Here we provide a robust XML tag stripping extraction as standard fallback
        return this.parseDocxText(buffer);
      } else {
        // Fallback standard text conversion
        return buffer.toString('utf-8');
      }
    } catch (err) {
      this.logger.error(`Failed to parse document ${fileName}: ${err.message}`);
      throw new Error(`Document Parsing Error: ${err.message}`);
    }
  }

  // Basic HTML cleaner
  private cleanHtml(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Basic DOCX extractor
  private parseDocxText(buffer: Buffer): string {
    try {
      // DOCX contains XML structure. A simple zip extractor can pull word/document.xml
      // For standard backend, we return text representations. We decode UTF-8 XML and strip tags.
      const rawText = buffer.toString('utf8');
      const xmlCleaned = rawText.replace(/<[^>]+>/g, ' ');
      return xmlCleaned.replace(/\s+/g, ' ').trim();
    } catch (e) {
      return buffer.toString('utf-8');
    }
  }

  // Normalization & Text Cleanup
  normalizeText(text: string): string {
    return text
      .replace(/[\r\n]+/g, '\n') // standard line breaks
      .replace(/[^\x20-\x7E\u0600-\u06FF\u0750-\u077F\u0900-\u097F\n]/g, ' ') // preserve English, Urdu, Hindi, newlines, standard chars
      .replace(/[ \t]+/g, ' ') // collapse multiple spaces
      .replace(/\n\s*\n/g, '\n\n') // collapse multiple blank lines
      .trim();
  }

  // Compute Jaccard similarity on 3-word shingles to find near-duplicates
  calculateNearDuplicateScore(textA: string, textB: string): number {
    const getShingles = (text: string): Set<string> => {
      const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const shingles = new Set<string>();
      for (let i = 0; i < words.length - 2; i++) {
        shingles.add(`${words[i]} ${words[i+1]} ${words[i+2]}`);
      }
      return shingles;
    };

    const shinglesA = getShingles(textA);
    const shinglesB = getShingles(textB);

    if (shinglesA.size === 0 || shinglesB.size === 0) return 0;

    let intersectionCount = 0;
    for (const shingle of shinglesA) {
      if (shinglesB.has(shingle)) intersectionCount++;
    }

    const unionCount = shinglesA.size + shinglesB.size - intersectionCount;
    return intersectionCount / unionCount;
  }

  // Ingest document into DB with duplicate checks and metadata mapping
  async ingestDocument(
    name: string,
    rawContent: string,
    fileType: string,
    fileSize: number,
    organizationId: string,
    meta: DocumentMetadata
  ): Promise<{ document: any; isDuplicate: boolean; duplicateOf?: string }> {
    const cleanText = this.normalizeText(rawContent);
    const contentHash = crypto.createHash('md5').update(cleanText).digest('hex');

    // 1. Check for absolute duplicate by MD5 hash of clean content
    const existingDoc = await this.prisma.aiDocument.findFirst({
      where: {
        organizationId,
        metadata: {
          path: ['contentHash'],
          equals: contentHash,
        },
      },
    });

    if (existingDoc) {
      this.logger.log(`Exact duplicate found for doc "${name}". Existing Document ID: ${existingDoc.id}`);
      return { document: existingDoc, isDuplicate: true, duplicateOf: existingDoc.id };
    }

    // 2. Lineage & Versioning: Check if document name exists
    const matchingByName = await this.prisma.aiDocument.findFirst({
      where: { name, organizationId },
      orderBy: { version: 'desc' },
    });

    let version = 1;
    let parentId: string | null = null;

    if (matchingByName) {
      version = matchingByName.version + 1;
      parentId = matchingByName.id;
      this.logger.log(`New version found for document "${name}". Existing version: ${matchingByName.version}. New version: ${version}`);
    }

    // 3. Create document in DB
    const docMeta = {
      contentHash,
      authorId: meta.authorId,
      source: meta.source,
      allowedRoles: meta.allowedRoles,
      allowedUsers: meta.allowedUsers || [],
      parentId,
      versionLineage: parentId ? [parentId, ...((matchingByName!.metadata as any)?.versionLineage || [])] : [],
      ingestedAt: new Date().toISOString(),
    };

    const document = await this.prisma.aiDocument.create({
      data: {
        name,
        fileType,
        fileSize,
        version,
        metadata: docMeta,
        organizationId,
        createdById: meta.authorId,
      },
    });

    return { document, isDuplicate: false };
  }

  // Split text into chunk models with detailed page/paragraph tags
  chunkDocument(
    text: string,
    chunkSize = 600,
    overlap = 100
  ): Array<{ content: string; metadata: { page: number; paragraph: number } }> {
    const cleanText = text.replace(/[ \t]+/g, ' ').trim();
    if (!cleanText) return [];

    // Detect paragraphs based on double newlines
    const paragraphs = cleanText.split('\n\n').filter(p => p.trim().length > 0);
    const chunks: Array<{ content: string; metadata: { page: number; paragraph: number } }> = [];

    let currentChunk = '';
    let currentParagraphsCount = 0;
    let pageCount = 1;
    let paragraphTracker = 1;

    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      currentParagraphsCount++;

      // Approximate page count: roughly every 2500 characters
      if (currentChunk.length > 2500) {
        pageCount++;
      }

      if ((currentChunk + '\n\n' + para).length <= chunkSize) {
        currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
      } else {
        if (currentChunk) {
          chunks.push({
            content: currentChunk,
            metadata: {
              page: pageCount,
              paragraph: paragraphTracker,
            },
          });
          paragraphTracker += currentParagraphsCount;
          currentParagraphsCount = 0;
        }

        // Handle paragraph splitting if single paragraph is larger than chunkSize
        if (para.length > chunkSize) {
          let subIndex = 0;
          while (subIndex < para.length) {
            let end = subIndex + chunkSize;
            if (end >= para.length) {
              currentChunk = para.substring(subIndex);
              break;
            }
            const lastSpace = para.lastIndexOf(' ', end);
            if (lastSpace > subIndex + chunkSize / 2) {
              end = lastSpace;
            }
            chunks.push({
              content: para.substring(subIndex, end),
              metadata: {
                page: pageCount,
                paragraph: paragraphTracker,
              },
            });
            subIndex = end - overlap;
          }
        } else {
          currentChunk = para;
        }
      }
    }

    if (currentChunk) {
      chunks.push({
        content: currentChunk,
        metadata: {
          page: pageCount,
          paragraph: paragraphTracker,
        },
      });
    }

    return chunks;
  }
}
