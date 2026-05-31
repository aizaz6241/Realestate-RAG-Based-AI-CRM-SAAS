import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Bulletproof require for pdf-parse to avoid TypeScript build issues
const pdfParser = require('pdf-parse');

@Injectable()
export class AiLlmService {
  private readonly logger = new Logger(AiLlmService.name);

  constructor(private prisma: PrismaService) {}

  // -----------------------------------------------------------------------------
  // Helpers: API Key & AI Settings Retrieval
  // -----------------------------------------------------------------------------
  getGeminiKey(): string {
    const key = process.env.GEMINI_API_KEY || '';
    return key.replace(/^["']|["']$/g, '').trim();
  }

  getOpenAIKey(): string {
    const key = process.env.OPENAI_API_KEY || '';
    return key.replace(/^["']|["']$/g, '').trim();
  }

  getOpenRouterKey(): string {
    const key = process.env.OPENROUTER_API_KEY || '';
    return key.replace(/^["']|["']$/g, '').trim();
  }

  getRouterMode(): 'hybrid' | 'local_only' | 'cloud_only' {
    const mode = (process.env.AI_ROUTER_MODE || 'hybrid').toLowerCase();
    if (mode === 'local_only' || mode === 'cloud_only' || mode === 'hybrid') {
      return mode as 'hybrid' | 'local_only' | 'cloud_only';
    }
    return 'hybrid';
  }

  getLocalLlmUrl(): string {
    const url = process.env.LOCAL_LLM_URL || 'http://localhost:11434/v1';
    return url.replace(/^["']|["']$/g, '').trim();
  }

  getLocalLlmModel(): string {
    const model = process.env.LOCAL_LLM_MODEL || 'llama3.1';
    return model.replace(/^["']|["']$/g, '').trim();
  }

  getLocalLlmEmbeddingModel(): string {
    const model = process.env.LOCAL_LLM_EMBEDDING_MODEL || 'nomic-embed-text';
    return model.replace(/^["']|["']$/g, '').trim();
  }

  // -----------------------------------------------------------------------------
  // Helpers: Local Model Connection Helpers
  // -----------------------------------------------------------------------------
  async callLocalLLM(
    systemPrompt: string,
    userPrompt: string,
    history: { role: 'user' | 'model'; content: string }[] = []
  ): Promise<string> {
    const localUrl = this.getLocalLlmUrl();
    const localModel = this.getLocalLlmModel();
    const openrouterKey = this.getOpenRouterKey();
 
    const messages = [{ role: 'system', content: systemPrompt }];
    for (const h of history) {
      messages.push({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content,
      });
    }
    messages.push({ role: 'user', content: userPrompt });
 
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (openrouterKey) {
      headers['Authorization'] = `Bearer ${openrouterKey}`;
      headers['HTTP-Referer'] = 'http://localhost:3000';
      headers['X-Title'] = 'RENS ERP Chatbot';
    }
 
    const attempts = 3;
    const delayMs = 1500;
 
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await fetch(`${localUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: localModel,
            messages,
            temperature: 0.1,
          }),
        });
 
        if (response.ok) {
          const data = await response.json();
          const text = data?.choices?.[0]?.message?.content;
          if (text) {
            this.logger.log(`Successfully generated completion via Local/OpenRouter LLM (${localModel})`);
            return text;
          }
        }
        
        // If it returns a non-200 status (like rate limits or gateway delays), wait and retry
        this.logger.warn(`OpenRouter/Local LLM returned status ${response.status}. Attempt ${i + 1} of ${attempts} in progress...`);
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
        }
      } catch (err) {
        this.logger.warn(`OpenRouter/Local LLM attempt ${i + 1} failed: ${err.message}`);
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
        } else if (i === attempts - 1) {
          throw err;
        }
      }
    }
    throw new Error('Local/OpenRouter LLM failed after maximum retry attempts.');
  }

  async generateLocalEmbedding(text: string): Promise<number[] | null> {
    const localUrl = this.getLocalLlmUrl();
    const embeddingModel = this.getLocalLlmEmbeddingModel();

    try {
      const response = await fetch(`${localUrl}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          model: embeddingModel,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const embedding = data?.data?.[0]?.embedding;
        if (embedding && Array.isArray(embedding)) {
          this.logger.log(`Successfully generated local embedding via ${embeddingModel}`);
          return embedding;
        }
      }
    } catch (err) {
      this.logger.warn(`Local embedding generation failed: ${err.message}`);
    }
    return null;
  }

  // -----------------------------------------------------------------------------
  // Helpers: Cognitive Hybrid Router & Classifier
  // -----------------------------------------------------------------------------
  determineExecutionTier(
    userMessage: string,
    history: { role: 'user' | 'model'; content: string }[] = []
  ): 'local' | 'cloud' {
    const mode = this.getRouterMode();
    if (mode === 'local_only') return 'local';
    if (mode === 'cloud_only') return 'cloud';

    const historyLength = history.reduce((sum, h) => sum + h.content.length, 0);
    const totalApproxLength = userMessage.length + historyLength;
    if (totalApproxLength > 8000) {
      this.logger.log(`Routing to Cloud: Context length is very large (${totalApproxLength} characters).`);
      return 'cloud';
    }

    const complexPatterns = [
      /deep (?:financial|operational)?\s*audit/i,
      /quarterly\s*(?:growth|financial|operational)?\s*plan/i,
      /long(?:-|\s+)term\s*strategy/i,
      /complete\s*analysis/i,
      /predict\s*(?:growth|revenue|sales|future)/i,
      /forecast/i,
    ];
    for (const pattern of complexPatterns) {
      if (pattern.test(userMessage)) {
        this.logger.log(`Routing to Cloud: Query matches high-cognition complexity pattern: "${pattern.source}"`);
        return 'cloud';
      }
    }

    this.logger.log(`Routing to Local LLM: Standard lookup or dialogue detected.`);
    return 'local';
  }

  // -----------------------------------------------------------------------------
  // Embeddings Generator (Ollama Local, Gemini Primary, OpenAI Fallback)
  // -----------------------------------------------------------------------------
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text.trim()) {
      return new Array(3072).fill(0);
    }

    const mode = this.getRouterMode();

    if (mode === 'hybrid' || mode === 'local_only') {
      const localEmbedding = await this.generateLocalEmbedding(text);
      if (localEmbedding) {
        return localEmbedding;
      }
    }

    const geminiKey = this.getGeminiKey();
    const openaiKey = this.getOpenAIKey();

    if (geminiKey && mode !== 'local_only') {
      for (const model of ['gemini-embedding-001', 'gemini-embedding-2']) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: `models/${model}`,
                content: { parts: [{ text }] },
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data?.embedding?.values) {
              return data.embedding.values;
            }
          } else {
            this.logger.warn(`Gemini embedding with ${model} failed with status ${response.status}.`);
          }
        } catch (err) {
          this.logger.warn(`Gemini embedding error with ${model}: ${err.message}`);
        }
      }
    }

    if (openaiKey && mode !== 'local_only') {
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            input: text,
            model: 'text-embedding-3-small',
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data?.data?.[0]?.embedding) {
            return data.data[0].embedding;
          }
        }
      } catch (err) {
        this.logger.error(`OpenAI embedding fallback failed: ${err.message}`);
      }
    }

    this.logger.error('Failed to generate embeddings via all configured (Local, Gemini, OpenAI) APIs.');
    return new Array(3072).fill(0);
  }

  // -----------------------------------------------------------------------------
  // PDF Parsing & Text Chunking Utilities
  // -----------------------------------------------------------------------------
  async parsePdf(fileBuffer: Buffer): Promise<string> {
    try {
      const data = await pdfParser(fileBuffer);
      return data.text || '';
    } catch (err) {
      this.logger.error(`Failed to parse PDF document: ${err.message}`);
      throw new Error(`PDF Parsing Error: ${err.message}`);
    }
  }

  chunkText(text: string, chunkSize = 600, overlap = 100): string[] {
    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (!cleanText) return [];

    const chunks: string[] = [];
    let index = 0;

    while (index < cleanText.length) {
      let end = index + chunkSize;
      if (end >= cleanText.length) {
        chunks.push(cleanText.substring(index));
        break;
      }

      const lastSpace = cleanText.lastIndexOf(' ', end);
      if (lastSpace > index + chunkSize / 2) {
        end = lastSpace;
      }

      chunks.push(cleanText.substring(index, end));
      index = end - overlap;
    }

    return chunks;
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    const minLength = Math.min(vecA.length, vecB.length);
    if (minLength === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < minLength; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // -----------------------------------------------------------------------------
  // Unstructured RAG Search
  // -----------------------------------------------------------------------------
  async searchUnstructuredKnowledge(
    query: string,
    organizationId: string,
    limit = 5
  ): Promise<any[]> {
    try {
      const chunkCount = await this.prisma.aiDocumentChunk.count({
        where: {
          document: {
            organizationId,
          },
        },
      });

      if (chunkCount === 0) {
        return [];
      }

      const queryVector = await this.generateEmbedding(query);
      
      const chunks = await this.prisma.aiDocumentChunk.findMany({
        where: {
          document: {
            organizationId,
          },
        },
        include: {
          document: {
            select: { id: true, name: true, fileType: true },
          },
        },
      });

      const scoredChunks = chunks
        .map((chunk) => {
          const semanticScore = this.cosineSimilarity(queryVector, chunk.embedding);
          
          const queryWords = query.toLowerCase().split(/[\s_\-\.\,\?\!]+/);
          const chunkWords = chunk.content.toLowerCase();
          let matchCount = 0;
          for (const word of queryWords) {
            if (word.length > 2 && chunkWords.includes(word)) {
              matchCount++;
            }
          }
          const keywordScore = matchCount / Math.max(queryWords.length, 1);
          
          const score = 0.7 * semanticScore + 0.3 * keywordScore;

          return {
            id: chunk.id,
            content: chunk.content,
            documentId: chunk.documentId,
            documentName: chunk.document.name,
            fileType: chunk.document.fileType,
            score,
          };
        })
        .filter((chunk) => chunk.score > 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scoredChunks;
    } catch (err) {
      this.logger.error(`Error in unstructured similarity search: ${err.message}`);
      return [];
    }
  }

  // -----------------------------------------------------------------------------
  // Resilient LLM Text Generation with Fallback (Local Llama, Gemini, OpenAI)
  // -----------------------------------------------------------------------------
  async callLLM(
    systemPrompt: string,
    userPrompt: string,
    history: { role: 'user' | 'model'; content: string }[] = []
  ): Promise<string> {
    const tier = this.determineExecutionTier(userPrompt, history);
    
    if (tier === 'local') {
      try {
        const localResult = await this.callLocalLLM(systemPrompt, userPrompt, history);
        return localResult;
      } catch (err) {
        this.logger.warn(`Local LLM failed or offline. Falling back to Cloud suite...`);
      }
    }

    const geminiKey = this.getGeminiKey();
    const openaiKey = this.getOpenAIKey();

    if (geminiKey) {
      for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash']) {
        try {
          const contents: any[] = [];
          
          for (const h of history) {
            contents.push({
              role: h.role === 'user' ? 'user' : 'model',
              parts: [{ text: h.content }],
            });
          }

          contents.push({
            role: 'user',
            parts: [{ text: userPrompt }],
          });

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents,
                systemInstruction: {
                  parts: [{ text: systemPrompt }],
                },
                generationConfig: {
                  temperature: 0.1,
                },
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              return text;
            }
          } else {
            this.logger.warn(`Gemini generation with ${model} failed with status ${response.status}. trying next...`);
          }
        } catch (err) {
          this.logger.warn(`Gemini generation error with ${model}: ${err.message}. trying next...`);
        }
      }
    }

    if (openaiKey) {
      try {
        const messages = [{ role: 'system', content: systemPrompt }];

        for (const h of history) {
          messages.push({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.content,
          });
        }

        messages.push({ role: 'user', content: userPrompt });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            temperature: 0.1,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const text = data?.choices?.[0]?.message?.content;
          if (text) {
            return text;
          }
        }
      } catch (err) {
        this.logger.error(`OpenAI generation fallback failed: ${err.message}`);
      }
    }

    try {
      this.logger.warn(`Cloud suite completely failed. Attempting last resort fallback to Local/OpenRouter LLM...`);
      const localResult = await this.callLocalLLM(systemPrompt, userPrompt, history);
      return localResult;
    } catch (err) {
      this.logger.error(`Last resort Local/OpenRouter LLM fallback failed: ${err.message}`);
    }

    return "🤖 System Alert: RENS AI is currently experiencing API connection delays. Please verify your keys and network status.";
  }
}
