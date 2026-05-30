import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../calendar/calendar.service';
import { RensGateway } from './rens.gateway';

// Bulletproof require for pdf-parse to avoid TypeScript build issues
const pdfParser = require('pdf-parse');

export interface DataValidationReport {
  completenessScore: number; // 0.0 - 1.0
  consistencyScore: number;  // 0.0 - 1.0
  missingFields: string[];
  inconsistencies: string[];
  anomaliesDetected: string[];
}

export interface AgentOutput {
  domain: string;
  records: any;
  insights: string[];
  validation: DataValidationReport;
  confidence: number;
}

export interface ConsensusReport {
  overallConfidence: number;
  alignedInsights: string[];
  contradictionsResolved: string[];
  proactiveActions: string[];
  reducedCertaintyWarning: string | null;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
    private rensGateway: RensGateway
  ) {}

  // -----------------------------------------------------------------------------
  // Helpers: API Key & AI Settings Retrieval
  // -----------------------------------------------------------------------------
  private getGeminiKey(): string {
    const key = process.env.GEMINI_API_KEY || '';
    return key.replace(/^["']|["']$/g, '').trim();
  }

  private getOpenAIKey(): string {
    const key = process.env.OPENAI_API_KEY || '';
    return key.replace(/^["']|["']$/g, '').trim();
  }

  private getOpenRouterKey(): string {
    const key = process.env.OPENROUTER_API_KEY || '';
    return key.replace(/^["']|["']$/g, '').trim();
  }

  private getRouterMode(): 'hybrid' | 'local_only' | 'cloud_only' {
    const mode = (process.env.AI_ROUTER_MODE || 'hybrid').toLowerCase();
    if (mode === 'local_only' || mode === 'cloud_only' || mode === 'hybrid') {
      return mode as 'hybrid' | 'local_only' | 'cloud_only';
    }
    return 'hybrid';
  }

  private getLocalLlmUrl(): string {
    const url = process.env.LOCAL_LLM_URL || 'http://localhost:11434/v1';
    return url.replace(/^["']|["']$/g, '').trim();
  }

  private getLocalLlmModel(): string {
    const model = process.env.LOCAL_LLM_MODEL || 'llama3.1';
    return model.replace(/^["']|["']$/g, '').trim();
  }

  private getLocalLlmEmbeddingModel(): string {
    const model = process.env.LOCAL_LLM_EMBEDDING_MODEL || 'nomic-embed-text';
    return model.replace(/^["']|["']$/g, '').trim();
  }

  // -----------------------------------------------------------------------------
  // Helpers: Local Model Connection Helpers
  // -----------------------------------------------------------------------------
  private async callLocalLLM(
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
      headers['HTTP-Referer'] = 'http://localhost:3000'; // Required by OpenRouter
      headers['X-Title'] = 'RENS ERP Chatbot';
    }

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
      throw new Error(`Local/OpenRouter LLM responded with status: ${response.status}`);
    } catch (err) {
      this.logger.warn(`Local/OpenRouter LLM generation failed: ${err.message}`);
      throw err;
    }
  }

  private async generateLocalEmbedding(text: string): Promise<number[] | null> {
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
  private determineExecutionTier(
    userMessage: string,
    history: { role: 'user' | 'model'; content: string }[] = []
  ): 'local' | 'cloud' {
    const mode = this.getRouterMode();
    if (mode === 'local_only') return 'local';
    if (mode === 'cloud_only') return 'cloud';

    // 1. Context Size Evaluation (Character limit heuristic ~ approx 2000 tokens)
    const historyLength = history.reduce((sum, h) => sum + h.content.length, 0);
    const totalApproxLength = userMessage.length + historyLength;
    if (totalApproxLength > 8000) {
      this.logger.log(`Routing to Cloud: Context length is very large (${totalApproxLength} characters).`);
      return 'cloud';
    }

    // 2. High-Cognition Keywords for Complex Audits & Deep Forecasting
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

    // 3. Standard queries, Roman Urdu dialogues, general database lookups -> Local Llama
    this.logger.log(`Routing to Local LLM: Standard lookup or dialogue detected.`);
    return 'local';
  }

  // -----------------------------------------------------------------------------
  // Embeddings Generator (Ollama Local, Gemini Primary, OpenAI Fallback)
  // -----------------------------------------------------------------------------
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text.trim()) {
      return new Array(3072).fill(0); // Return empty dummy vector if text empty
    }

    const mode = this.getRouterMode();

    // 1. Try Local Ollama Embedding first if Hybrid or Local Only mode
    if (mode === 'hybrid' || mode === 'local_only') {
      const localEmbedding = await this.generateLocalEmbedding(text);
      if (localEmbedding) {
        return localEmbedding;
      }
    }

    const geminiKey = this.getGeminiKey();
    const openaiKey = this.getOpenAIKey();

    // 2. Try Gemini gemini-embedding-001 first, falling back to gemini-embedding-2
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

    // 3. Fallback to OpenAI text-embedding-3-small
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

    // If both failed, return a basic dummy embedding to prevent crash
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

      // Try to end chunk at a space to avoid cutting words
      const lastSpace = cleanText.lastIndexOf(' ', end);
      if (lastSpace > index + chunkSize / 2) {
        end = lastSpace;
      }

      chunks.push(cleanText.substring(index, end));
      index = end - overlap; // Sliding window overlap
    }

    return chunks;
  }

  // Cosine Similarity calculation (JS math)
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    // If dimensions are different, adjust or pad (Gemini returns 768, OpenAI text-embedding-3-small 1536)
    // We adjust both to the minimum length to make it completely safe and robust
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
      // 1. Check if there are any chunks in the DB first before making the external API embedding call
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

      // Generate embedding only when chunks are present!
      const queryVector = await this.generateEmbedding(query);
      
      // Fetch all chunks for the organization from the DB
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

      // Calculate similarities in memory (highly efficient for thousands of chunks, zero pgvector installation issues)
      // We implement hybrid Dense (semantic cosine similarity) + Sparse (keyword frequency frequency overlap) search!
      const scoredChunks = chunks
        .map((chunk) => {
          const semanticScore = this.cosineSimilarity(queryVector, chunk.embedding);
          
          // Sparse keyword overlap matching
          const queryWords = query.toLowerCase().split(/[\s_\-\.\,\?\!]+/);
          const chunkWords = chunk.content.toLowerCase();
          let matchCount = 0;
          for (const word of queryWords) {
            if (word.length > 2 && chunkWords.includes(word)) {
              matchCount++;
            }
          }
          const keywordScore = matchCount / Math.max(queryWords.length, 1);
          
          // Hybrid combination (70% semantic, 30% keyword)
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
        .filter((chunk) => chunk.score > 0.25) // Similarity threshold (adjusted for hybrid scoring)
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
    
    // 1. Try Local LLM first if routed to local
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

    // 2. Try Google Gemini first, falling back across the flash suite to bypass 429 rate limits
    if (geminiKey) {
      for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite']) {
        try {
          // Construct standard contents format with optional history and systemInstruction
          const contents: any[] = [];
          
          // Map history to Gemini API format
          for (const h of history) {
            contents.push({
              role: h.role === 'user' ? 'user' : 'model',
              parts: [{ text: h.content }],
            });
          }

          // Add user prompt
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
                  temperature: 0.1, // High determinism for analytical queries
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

    // 3. Fallback to OpenAI GPT-4o-mini
    if (openaiKey) {
      try {
        const messages = [{ role: 'system', content: systemPrompt }];

        // Map history to OpenAI format
        for (const h of history) {
          messages.push({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.content,
          });
        }

        // Add user prompt
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

    // 4. Last resort fallback to Local/OpenRouter LLM if Cloud failed
    try {
      this.logger.warn(`Cloud suite completely failed. Attempting last resort fallback to Local/OpenRouter LLM...`);
      const localResult = await this.callLocalLLM(systemPrompt, userPrompt, history);
      return localResult;
    } catch (err) {
      this.logger.error(`Last resort Local/OpenRouter LLM fallback failed: ${err.message}`);
    }

    // 5. Complete failure backup response
    return "🤖 System Alert: RENS AI is currently experiencing API connection delays. Please verify your keys and network status.";
  }

  // Fuzzy matching name resolution helper for EmployeeProfiles
  private async findEmployeeProfileIdByName(name: string, organizationId: string): Promise<string | null> {
    if (!name) return null;
    const cleanQuery = name.toLowerCase().trim();

    // Fetch all employee profiles for the organization
    const profiles = await this.prisma.employeeProfile.findMany({
      where: { organizationId },
      include: { user: true }
    });

    let bestProfile: any = null;
    let highestScore = 0;

    for (const prof of profiles) {
      const first = (prof.user.firstName || '').toLowerCase();
      const last = (prof.user.lastName || '').toLowerCase();
      const fullName = `${first} ${last}`.trim();

      let score = 0;

      // 1. Exact or substring match of full name
      if (fullName === cleanQuery) {
        score = 100;
      } else if (fullName.includes(cleanQuery) || cleanQuery.includes(fullName)) {
        score = 80;
      } else {
        // 2. Split words and check overlap
        const queryWords = cleanQuery.split(/[\s_-]+/);
        const nameWords = fullName.split(/[\s_-]+/);

        let overlapCount = 0;
        for (const qw of queryWords) {
          if (qw.length < 2) continue;
          const matches = nameWords.some(nw => nw.includes(qw) || qw.includes(nw) || this.levenshteinDistance(qw, nw) <= 2);
          if (matches) overlapCount++;
        }
        
        score = (overlapCount / Math.max(queryWords.length, 1)) * 50;
      }

      if (score > highestScore && score > 20) {
        highestScore = score;
        bestProfile = prof;
      }
    }

    return bestProfile ? bestProfile.id : null;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            Math.min(
              matrix[i][j - 1] + 1, // insertion
              matrix[i - 1][j] + 1 // deletion
            )
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }


  // -----------------------------------------------------------------------------
  // Structured Database Tools (Live Postgres fetching)
  // -----------------------------------------------------------------------------
  private checkToolAuthorization(toolName: string, userRole: string): boolean {
    const role = userRole || 'VIEWER';
    
    // 1. Finance aggregates (salaries, monthly payroll balance)
    if (toolName === 'getFinanceAnalytics') {
      return ['SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE'].includes(role);
    }

    // 2. Client databases
    if (toolName === 'searchClients') {
      return ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'AGENT', 'RECEPTIONIST'].includes(role);
    }

    // 3. Logistics aggregates (vehicles, fleet status, maintenance costs)
    if (toolName === 'getLogisticsAnalytics') {
      return ['SUPER_ADMIN', 'ADMIN', 'LOGISTICS'].includes(role);
    }

    // 4. Leave requests (everyone can query, but filtered to their own in the execution block if unauthorized to see all)
    if (toolName === 'getLeaveRequests') {
      return true;
    }
    
    return true; 
  }

  async findEmployeeFuzzy(nameQuery: string, organizationId: string): Promise<any[]> {
    if (!nameQuery) return [];
    
    try {
      // Use pg_trgm similarity to rank employees by name
      const users: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT u.id, u."firstName", u."lastName", u.email, u.role, ep.id as "profileId", ep.department, ep.designation, ep.salary, ep.status,
               similarity(u."firstName" || ' ' || COALESCE(u."lastName", ''), $1) as "similarityScore"
        FROM "User" u
        LEFT JOIN "EmployeeProfile" ep ON ep."userId" = u.id
        WHERE u."organizationId" = $2
          AND (
            similarity(u."firstName" || ' ' || COALESCE(u."lastName", ''), $1) > 0.3
            OR u."firstName" ILIKE $3
            OR COALESCE(u."lastName", '') ILIKE $3
          )
        ORDER BY "similarityScore" DESC
        LIMIT 5;
      `, nameQuery, organizationId, `%${nameQuery}%`);
      
      return users;
    } catch (e) {
      this.logger.warn(`pg_trgm fuzzy match query failed: ${e.message}. Falling back to standard Prisma lookups.`);
      // Fallback: regular Prisma matching
      const employees = await this.prisma.employeeProfile.findMany({
        where: {
          organizationId,
          OR: [
            { user: { firstName: { contains: nameQuery, mode: 'insensitive' } } },
            { user: { lastName: { contains: nameQuery, mode: 'insensitive' } } }
          ]
        },
        include: { user: true }
      });
      return employees.map(emp => ({
        id: emp.user.id,
        firstName: emp.user.firstName,
        lastName: emp.user.lastName,
        email: emp.user.email,
        role: emp.user.role,
        profileId: emp.id,
        department: emp.department,
        designation: emp.designation,
        salary: emp.salary,
        status: emp.status,
        similarityScore: 1.0
      }));
    }
  }

  async executeDatabaseTool(
    toolName: string,
    params: any,
    organizationId: string,
    userRole: string,
    userId: string
  ): Promise<any> {
    this.logger.log(`Executing live Postgres tool: ${toolName} for role ${userRole}`);
    
    const isAuthorized = this.checkToolAuthorization(toolName, userRole);
    if (!isAuthorized) {
      this.logger.warn(`Security Warning: User with role ${userRole} attempted unauthorized execution of tool ${toolName}`);
      return { 
        error: `ACCESS_DENIED`,
        message: `Clearance Required: Your user profile (${userRole}) is not cleared to access secure finance databases.`
      };
    }

    try {
      switch (toolName) {
        case 'searchProperties': {
          const { location, minPrice, maxPrice, bedrooms, bathrooms, type, listingType, status } = params || {};
          return this.prisma.property.findMany({
            where: {
              organizationId,
              status: status || undefined,
              type: type || undefined,
              listingType: listingType || undefined,
              location: location ? { contains: location, mode: 'insensitive' } : undefined,
              price: (minPrice || maxPrice) ? {
                gte: minPrice ? parseFloat(minPrice) : undefined,
                lte: maxPrice ? parseFloat(maxPrice) : undefined,
              } : undefined,
              bedrooms: bedrooms ? parseInt(bedrooms) : undefined,
              bathrooms: bathrooms ? parseInt(bathrooms) : undefined,
            },
            include: {
              owner: {
                select: { name: true, phone: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 8,
          });
        }

        case 'searchClients': {
          const { name, budget, preferences, type } = params || {};
          return this.prisma.client.findMany({
            where: {
              organizationId,
              type: type || undefined,
              name: name ? { contains: name, mode: 'insensitive' } : undefined,
              budget: budget ? { lte: parseFloat(budget) } : undefined,
              preferences: preferences ? { contains: preferences, mode: 'insensitive' } : undefined,
            },
            orderBy: { createdAt: 'desc' },
            take: 8,
          });
        }

        case 'searchEmployees': {
          const { name, designation, department } = params || {};
          const canViewSalaries = ['SUPER_ADMIN', 'ADMIN', 'HR', 'FINANCE'].includes(userRole);

          if (name) {
            const matches = await this.findEmployeeFuzzy(name, organizationId);
            
            // Filter by department and designation if they are also passed
            let filteredMatches = matches;
            if (department) {
              filteredMatches = filteredMatches.filter(m => m.department && m.department.toLowerCase().includes(department.toLowerCase()));
            }
            if (designation) {
              filteredMatches = filteredMatches.filter(m => m.designation && m.designation.toLowerCase().includes(designation.toLowerCase()));
            }

            return filteredMatches.map(emp => {
              const mapped: any = {
                id: emp.profileId || emp.id,
                userId: emp.id,
                designation: emp.designation,
                department: emp.department,
                joiningDate: emp.joiningDate || null,
                status: emp.status || 'ACTIVE',
                similarityScore: emp.similarityScore !== undefined ? parseFloat(emp.similarityScore) : 1.0,
                user: {
                  id: emp.id,
                  firstName: emp.firstName,
                  lastName: emp.lastName,
                  email: emp.email,
                  role: emp.role
                }
              };
              if (canViewSalaries || emp.id === userId) {
                mapped.salary = emp.salary;
              } else {
                mapped.salary = "CONFIDENTIAL (Access Denied)";
              }
              return mapped;
            });
          }

          // Fallback to standard filtering if name is not specified
          const employees = await this.prisma.employeeProfile.findMany({
            where: {
              organizationId,
              designation: designation ? { contains: designation, mode: 'insensitive' } : undefined,
              department: department ? { contains: department, mode: 'insensitive' } : undefined,
            },
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true, role: true },
              },
            },
            take: 10,
          });

          return employees.map(emp => {
            const mapped: any = {
              id: emp.id,
              userId: emp.userId,
              designation: emp.designation,
              department: emp.department,
              joiningDate: emp.joiningDate,
              status: emp.status,
              user: emp.user
            };
            if (canViewSalaries || emp.userId === userId) {
              mapped.salary = emp.salary;
            } else {
              mapped.salary = "CONFIDENTIAL (Access Denied)";
            }
            return mapped;
          });
        }

        case 'getFinanceAnalytics': {
          // Aggregate payroll salaries for organization
          const payrolls = await this.prisma.payroll.findMany({
            where: {
              employeeProfile: {
                organizationId,
              },
            },
            orderBy: { month: 'desc' },
            take: 30, // Aggregate recent payroll cycles
          });

          const totalNetSalary = payrolls.reduce((acc, curr) => acc + curr.netSalary, 0);
          const totalBaseSalary = payrolls.reduce((acc, curr) => acc + curr.baseSalary, 0);
          const totalAllowances = payrolls.reduce((acc, curr) => acc + curr.allowances, 0);
          const totalDeductions = payrolls.reduce((acc, curr) => acc + curr.deductions, 0);

          // Get salaries grouped by designations
          const employeeSalaries = await this.prisma.employeeProfile.findMany({
            where: { organizationId },
            include: { user: { select: { firstName: true } } },
          });

          return {
            recentPayrollCount: payrolls.length,
            totals: {
              netSalary: totalNetSalary,
              baseSalary: totalBaseSalary,
              allowances: totalAllowances,
              deductions: totalDeductions,
            },
            staffDetails: employeeSalaries.map((emp) => ({
              name: emp.user.firstName,
              designation: emp.designation,
              salary: emp.salary || 0,
            })),
          };
        }

        case 'getTasksBoard': {
          const { status } = params || {};
          return this.prisma.task.findMany({
            where: {
              organizationId,
              status: status || undefined,
            },
            include: {
              assignedTo: {
                select: { firstName: true, email: true },
              },
            },
            orderBy: { dueDate: 'asc' },
            take: 15,
          });
        }

        case 'getMeetingsAnalytics': {
          const { type } = params || {};
          let locationFilter: any = {};

          if (type === 'VIRTUAL') {
            locationFilter = {
              OR: [
                { location: { contains: 'http', mode: 'insensitive' } },
                { location: { contains: 'virtual', mode: 'insensitive' } }
              ]
            };
          } else if (type === 'PHYSICAL') {
            locationFilter = {
              NOT: [
                { location: { contains: 'http', mode: 'insensitive' } },
                { location: { contains: 'virtual', mode: 'insensitive' } }
              ]
            };
          }

          // Fetch calendar events in organization
          const events = await this.prisma.calendarEvent.findMany({
            where: { 
              organizationId,
              ...locationFilter
            },
            include: {
              createdBy: {
                select: { id: true, firstName: true, lastName: true, role: true, email: true }
              }
            },
            orderBy: { startTime: 'desc' },
            take: 20
          });

          const analyzedMeetings: any[] = [];

          for (const event of events) {
            if (event.isPrivate) continue;

            const state = this.calendarService.meetingStates.get(event.id) || {
              participants: [] as any[],
              allTimeAttendees: [] as any[],
              messages: [] as any[],
              isTerminated: false
            };

            // Resolve target users invited to this meeting
            const invitees = await this.prisma.user.findMany({
              where: {
                organizationId,
                OR: [
                  { id: { in: event.targetUserIds } },
                  { role: { in: event.targetRoles as any } }
                ]
              },
              select: { id: true, firstName: true, lastName: true, role: true }
            });

            // Calculate who was present
            const present = state.allTimeAttendees.map(a => ({
              id: a.id,
              name: a.name,
              role: a.role,
              joinedAt: new Date(a.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }));

            // Calculate who was absent
            const absent = invitees
              .filter(inv => !state.allTimeAttendees.some(a => a.id === inv.id))
              .map(inv => ({
                id: inv.id,
                name: `${inv.firstName} ${inv.lastName || ''}`.trim(),
                role: inv.role
              }));

            analyzedMeetings.push({
              id: event.id,
              title: event.title,
              description: event.description,
              startTime: event.startTime,
              endTime: event.endTime,
              location: event.location,
              organizer: `${event.createdBy?.firstName || ''} ${event.createdBy?.lastName || ''}`.trim(),
              organizerRole: event.createdBy?.role,
              isTerminated: state.isTerminated,
              attendanceSummary: {
                totalInvited: invitees.length,
                totalAttended: present.length,
                totalAbsent: absent.length
              },
              attendedParticipants: present,
              absentParticipants: absent,
              chatMessagesCount: state.messages.length
            });
          }

          return analyzedMeetings;
        }

        case 'getLeaveRequests': {
          const { name, status } = params || {};
          
          const canViewAllLeaves = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(userRole);

          // If authorized to view all, optionally search by employee name.
          // Otherwise, STRICTLY ignore name and filter by the requester's own userId!
          const whereClause: any = {
            employeeProfile: {
              organizationId,
            },
            status: status || undefined
          };

          if (canViewAllLeaves) {
            if (name) {
              const names = name.split(/,|and|aur|&/i).map((n: string) => n.trim()).filter(Boolean);
              if (names.length > 0) {
                const profileIds: string[] = [];
                for (const singleName of names) {
                  const profileId = await this.findEmployeeProfileIdByName(singleName, organizationId);
                  if (profileId) profileIds.push(profileId);
                }
                if (profileIds.length > 0) {
                  whereClause.employeeProfileId = { in: profileIds };
                } else {
                  whereClause.employeeProfileId = "NON_EXISTENT_ID";
                }
              }
            }
          } else {
            whereClause.employeeProfile.userId = userId;
          }

          const leaves = await this.prisma.leaveRequest.findMany({
            where: whereClause,
            include: {
              employeeProfile: {
                include: {
                  user: {
                    select: { firstName: true, lastName: true, role: true, email: true }
                  }
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 15,
          });

          return leaves.map(l => ({
            id: l.id,
            startDate: l.startDate,
            endDate: l.endDate,
            type: l.type,
            status: l.status,
            reason: l.reason,
            approvedAt: l.approvedAt,
            employeeName: `${l.employeeProfile.user.firstName} ${l.employeeProfile.user.lastName || ''}`.trim(),
            employeeRole: l.employeeProfile.user.role,
            employeeEmail: l.employeeProfile.user.email
          }));
        }

        case 'getAttendanceRecord': {
          const { name, status } = params || {};
          
          const canViewAllAttendance = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(userRole);

          const whereClause: any = {
            employeeProfile: {
              organizationId,
            },
            status: status || undefined
          };

          if (canViewAllAttendance) {
            if (name) {
              const names = name.split(/,|and|aur|&/i).map((n: string) => n.trim()).filter(Boolean);
              if (names.length > 0) {
                const profileIds: string[] = [];
                for (const singleName of names) {
                  const profileId = await this.findEmployeeProfileIdByName(singleName, organizationId);
                  if (profileId) profileIds.push(profileId);
                }
                if (profileIds.length > 0) {
                  whereClause.employeeProfileId = { in: profileIds };
                } else {
                  whereClause.employeeProfileId = "NON_EXISTENT_ID";
                }
              }
            }
          } else {
            whereClause.employeeProfile.userId = userId;
          }

          const attendances = await this.prisma.attendance.findMany({
            where: whereClause,
            include: {
              employeeProfile: {
                include: {
                  user: {
                    select: { firstName: true, lastName: true, role: true, email: true }
                  }
                }
              }
            },
            orderBy: { dateStr: 'desc' },
            take: 30,
          });

          return attendances.map(att => ({
            id: att.id,
            dateStr: att.dateStr,
            checkIn: att.checkIn,
            checkOut: att.checkOut,
            status: att.status,
            checkoutSummary: att.checkoutSummary,
            employeeName: `${att.employeeProfile.user.firstName} ${att.employeeProfile.user.lastName || ''}`.trim(),
            employeeRole: att.employeeProfile.user.role,
            employeeEmail: att.employeeProfile.user.email
          }));
        }

        case 'getLogisticsAnalytics': {
          if (!['SUPER_ADMIN', 'ADMIN', 'LOGISTICS'].includes(userRole)) {
            return {
              error: `ACCESS_DENIED`,
              message: `Clearance Required: Your user profile (${userRole}) is not cleared to access secure logistics databases.`
            };
          }

          const vehicles = await this.prisma.vehicle.findMany({
            where: { organizationId },
            include: {
              maintenanceRequests: true
            }
          });

          const schedules = await this.prisma.logisticsSchedule.findMany({
            where: {
              vehicle: { organizationId }
            },
            include: {
              vehicle: { select: { modelName: true, plateNumber: true } },
              driver: {
                include: {
                  employeeProfile: {
                    include: {
                      user: { select: { firstName: true, lastName: true } }
                    }
                  }
                }
              }
            },
            orderBy: { visitDate: 'desc' },
            take: 15
          });

          return {
            vehiclesCount: vehicles.length,
            vehicles: vehicles.map(v => ({
              id: v.id,
              modelName: v.modelName,
              plateNumber: v.plateNumber,
              status: v.status,
              maintenanceCount: v.maintenanceRequests.length,
              maintenanceCostTotal: v.maintenanceRequests.reduce((sum, req) => sum + (req.cost || 0), 0),
              maintenanceRequests: v.maintenanceRequests.map(r => ({
                description: r.description,
                cost: r.cost,
                status: r.status,
                requestDate: r.requestDate
              }))
            })),
            schedules: schedules.map(s => ({
              id: s.id,
              visitDate: s.visitDate,
              pickupLocation: s.pickupLocation,
              dropLocation: s.dropLocation,
              status: s.status,
              vehicle: s.vehicle ? `${s.vehicle.modelName} (${s.vehicle.plateNumber})` : 'Unassigned',
              driver: s.driver ? `${s.driver.employeeProfile.user.firstName} ${s.driver.employeeProfile.user.lastName || ''}`.trim() : 'Unassigned'
            }))
          };
        }

        case 'runDatabaseQuery': {
          const { query } = params || {};
          if (!query) {
            return { error: "Query is required" };
          }

          // 1. Strict read-only SQL safety checks
          const normalized = query.toLowerCase().trim();
          const forbiddenKeywords = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate', 'grant', 'revoke', 'replace', 'upsert'];
          
          for (const word of forbiddenKeywords) {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            if (regex.test(normalized)) {
              return {
                error: `SECURITY_VIOLATION`,
                message: `Forbidden Operation: Write operations like '${word.toUpperCase()}' are strictly prohibited. Only read-only SELECT queries are allowed.`
              };
            }
          }

          if (normalized.includes(';')) {
            return {
              error: `SECURITY_VIOLATION`,
              message: `Forbidden Operation: Semicolons ';' are prohibited to prevent stacked query execution.`
            };
          }

          // Auto-quote camelCase columns to prevent PostgreSQL unquoted lowercase folding errors
          let virtualizedQuery = query;
          const camelCaseColumns = [
            'organizationId', 'employeeProfileId', 'joiningDate', 'checkIn', 'checkOut',
            'checkoutSummary', 'startDate', 'endDate', 'listingType', 'areaSqft',
            'dueDate', 'assignedToId', 'startTime', 'endTime', 'reviewDate',
            'reviewedById', 'logTime', 'userId', 'firstName', 'lastName',
            'createdAt', 'updatedAt', 'systemUserId', 'chatRoomId', 'isSystem',
            'messageText', 'escalationNotes', 'taskTitle', 'plateNumber',
            'modelName', 'visitDate', 'pickupLocation', 'dropLocation', 'createdById',
            'passwordHash', 'isActive', 'dateStr', 'approvedAt', 'ownerId', 'duplicateOfId',
            'isDuplicate', 'commissionRate', 'agreementUrl', 'agreementExpiry', 'clientId',
            'propertyId', 'viewingDate', 'baseSalary', 'netSalary', 'paidAt', 'changeDate',
            'expiryDate', 'isExpired', 'accessRole', 'targetRoles', 'targetUserIds',
            'writeRoles', 'writeUserIds', 'updatedById', 'documentId', 'licenseNumber',
            'completionDate', 'vehicleId', 'driverId', 'viewingId', 'keyTag', 'checkoutDate',
            'returnDate', 'keyId', 'activityDate', 'leadId', 'isGroup', 'senderId',
            'isPrivate', 'fileUrl', 'fileType', 'fileSize', 'isEnabled', 'errorMessage'
          ];

          for (const col of camelCaseColumns) {
            const colRegex = new RegExp(`"?\\b${col}\\b"?`, 'gi');
            virtualizedQuery = virtualizedQuery.replace(colRegex, `"${col}"`);
          }

          // 2. Dynamic Database Table Virtualization & Auto-Injection (Rule 1, 2, & 5)
          const tenantTables = [
            'User', 'EmployeeProfile', 'Property', 'Lead', 'Client',
            'Task', 'Owner', 'Document', 'Vehicle', 'ChatRoom',
            'CalendarEvent', 'AiDocument', 'AiChatSession', 'AiMemoryVector',
            'IntegrationConfig', 'CommunicationTemplate', 'IntegrationLog'
          ];

          for (const table of tenantTables) {
            // Replace quoted references e.g. "User"
            const quotedRegex = new RegExp(`"${table}"`, 'g');
            virtualizedQuery = virtualizedQuery.replace(quotedRegex, `(SELECT * FROM "${table}" WHERE "organizationId" = '${organizationId}')`);

            // Replace unquoted references e.g. FROM User or JOIN User
            const fromRegex = new RegExp(`\\b(from|join)\\s+${table}\\b`, 'gi');
            virtualizedQuery = virtualizedQuery.replace(fromRegex, `$1 (SELECT * FROM "${table}" WHERE "organizationId" = '${organizationId}')`);
          }

          // 3. Strict tenant-isolation check on the virtualized query
          const checkQuery = virtualizedQuery.toLowerCase();
          if (!checkQuery.includes(organizationId.toLowerCase()) && !checkQuery.includes('organizationid')) {
            return {
              error: `SECURITY_VIOLATION`,
              message: `Multi-Tenant Violation: Your query must filter by the active organizationId ('${organizationId}') to ensure isolated access.`
            };
          }

          try {
            // Execute the raw query safely
            const rows = await this.prisma.$queryRawUnsafe(virtualizedQuery);
            
            // 3. Post-process to automatically guess/recommend visualization if not provided
            let suggestedVis = "table";
            let xKey = "";
            let yKeys: string[] = [];

            if (Array.isArray(rows) && rows.length > 0) {
              const keys = Object.keys(rows[0]);
              // Find numeric and string/date keys to generate chart config
              const numericKeys = keys.filter(k => {
                const val = rows[0][k];
                return typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)));
              });
              const stringKeys = keys.filter(k => !numericKeys.includes(k));

              if (numericKeys.length > 0) {
                xKey = stringKeys[0] || keys[0];
                yKeys = numericKeys;
                
                const hasDateOrMonth = keys.some(k => k.toLowerCase().includes('date') || k.toLowerCase().includes('month'));
                if (hasDateOrMonth) {
                  suggestedVis = "line_chart";
                } else if (keys.some(k => k.toLowerCase().includes('type') || k.toLowerCase().includes('status') || k.toLowerCase().includes('dept'))) {
                  suggestedVis = "pie_chart";
                } else {
                  suggestedVis = "bar_chart";
                }
              }
            }

            return {
              query,
              rows,
              visualization: {
                type: suggestedVis,
                config: {
                  xKey,
                  yKeys,
                  title: "Conversational Analytics Query"
                }
              }
            };
          } catch (e) {
            return {
              error: `QUERY_ERROR`,
              message: `Database query syntax error: ${e.message}. Please double-check schema columns and try again.`
            };
          }
        }

        case 'createTask': {
          const { title, employeeName, description, dueDate, priority } = params || {};
          if (!title || !employeeName) {
            return { error: 'MISSING_PARAMS', message: 'Task title and target employee name are required.' };
          }

          // 1. Fuzzy matching to find the employee
          const matches = await this.findEmployeeFuzzy(employeeName, organizationId);
          if (matches.length === 0) {
            return {
              error: 'CLARIFICATION_REQUIRED',
              message: `I couldn't find any team member named "${employeeName}". Can you please clarify who to assign this task to?`
            };
          }

          if (matches.length > 1 && matches[0].similarityScore - matches[1].similarityScore < 0.15) {
            return {
              error: 'CLARIFICATION_REQUIRED',
              options: matches.slice(0, 3).map(m => `${m.firstName} ${m.lastName || ''}`.trim()),
              message: `I found multiple employees matching "${employeeName}": ${matches.slice(0, 3).map(m => `${m.firstName} ${m.lastName || ''}`.trim()).join(', ')}. Please specify which one you meant.`
            };
          }

          const targetEmployee = matches[0];

          // 2. Smart Workload Balancing Audit
          // Count active PENDING/IN_PROGRESS tasks for this employee
          const activeTasksCount = await this.prisma.task.count({
            where: {
              assignedToId: targetEmployee.id,
              status: { in: ['PENDING', 'IN_PROGRESS'] }
            }
          });

          const WORKLOAD_THRESHOLD = 8;
          if (activeTasksCount >= WORKLOAD_THRESHOLD) {
            // Find an alternative employee in the same department who has fewer tasks
            const alternatives = await this.prisma.user.findMany({
              where: {
                organizationId,
                id: { not: targetEmployee.id },
                employeeProfile: {
                  department: targetEmployee.department || undefined
                }
              },
              include: {
                employeeProfile: true,
                assignedTasks: {
                  where: { status: { in: ['PENDING', 'IN_PROGRESS'] } }
                }
              },
              take: 3
            });

            const recommendations = alternatives
              .map(alt => ({
                id: alt.id,
                name: alt.lastName ? `${alt.firstName} ${alt.lastName}`.trim() : alt.firstName,
                tasksCount: alt.assignedTasks.length
              }))
              .sort((a, b) => a.tasksCount - b.tasksCount);

            return {
              error: 'WORKLOAD_ALERT',
              targetEmployee: `${targetEmployee.firstName} ${targetEmployee.lastName || ''}`.trim(),
              activeTasksCount,
              recommendations,
              message: `⚠️ Workload Alert: ${targetEmployee.firstName} currently has ${activeTasksCount} active tasks (overloaded). I suggest assigning this to ${recommendations[0]?.name || 'someone else'} who has fewer tasks.`
            };
          }

          // 3. Create the task in database
          const task = await this.prisma.task.create({
            data: {
              title,
              description: description || null,
              status: 'PENDING',
              dueDate: dueDate ? new Date(dueDate) : null,
              assignedToId: targetEmployee.id,
              createdById: userId,
              organizationId
            }
          });

          // 4. Log the action in ActivityLog
          if (targetEmployee.profileId) {
            await this.prisma.activityLog.create({
              data: {
                employeeProfileId: targetEmployee.profileId,
                category: 'WORK',
                description: `Assigned new task: "${title}". Priority: ${priority || 'STANDARD'}.`
              }
            });
          }

          // 5. Verify task exists directly in Postgres (Rule 1 & 5 - Task Sync Rule)
          const verifiedTask = await this.prisma.task.findUnique({
            where: { id: task.id }
          });

          if (!verifiedTask || verifiedTask.id !== task.id) {
            this.logger.error(`Database validation failure: Task "${title}" was not verified in Postgres after write!`);
            return {
              error: 'DATABASE_SYNC_FAILURE',
              message: 'Task could not be verified in the system. Please try again.'
            };
          }

          // Emit WebSocket broadcast for real-time dashboard sync
          this.rensGateway.broadcastToOrganization(organizationId, 'task_sync', {
            action: 'create',
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              dueDate: task.dueDate,
              assignedToName: `${targetEmployee.firstName} ${targetEmployee.lastName || ''}`.trim()
            }
          });

          return {
            success: true,
            status: 'ASSIGNED',
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              dueDate: task.dueDate
            },
            assignedTo: `${targetEmployee.firstName} ${targetEmployee.lastName || ''}`.trim()
          };
        }

        case 'updateTask': {
          const { taskId, status } = params || {};
          if (!taskId || !status) {
            return { error: 'MISSING_PARAMS', message: 'taskId and target status are required.' };
          }
          const task = await this.prisma.task.update({
            where: { id: taskId },
            data: { status }
          });

          // Verify updated task exists and matches in database (Task Sync Rule)
          const verifiedTask = await this.prisma.task.findUnique({
            where: { id: task.id }
          });

          if (!verifiedTask || verifiedTask.status !== status) {
            this.logger.error(`Database validation failure: Task "${taskId}" update to "${status}" was not verified in Postgres after write!`);
            return {
              error: 'DATABASE_SYNC_FAILURE',
              message: 'Task could not be verified in the system. Please try again.'
            };
          }

          // Emit WebSocket broadcast for real-time dashboard sync
          this.rensGateway.broadcastToOrganization(organizationId, 'task_sync', {
            action: 'update',
            task
          });

          return { success: true, task };
        }

        case 'updateLeadStatus': {
          const { leadId, status, score } = params || {};
          if (!leadId || !status) {
            return { error: 'MISSING_PARAMS', message: 'leadId and status are required.' };
          }
          const lead = await this.prisma.lead.update({
            where: { id: leadId },
            data: { 
              status,
              score: score ? parseInt(score) : undefined
            }
          });

          // Verify updated lead exists and matches in database (Rule 5 & 6)
          const verifiedLead = await this.prisma.lead.findUnique({
            where: { id: lead.id }
          });

          if (!verifiedLead || verifiedLead.status !== status) {
            this.logger.error(`Database validation failure: Lead "${leadId}" update to "${status}" was not verified in Postgres after write!`);
            return {
              error: 'DATABASE_SYNC_FAILURE',
              message: 'Lead status update could not be verified in the system. Please try again.'
            };
          }

          // Emit WebSocket broadcast for real-time dashboard sync
          this.rensGateway.broadcastToOrganization(organizationId, 'lead_sync', {
            action: 'update',
            lead
          });

          return { success: true, lead };
        }

        case 'sendReminder': {
          const { employeeId, messageText } = params || {};
          if (!employeeId || !messageText) {
            return { error: 'MISSING_PARAMS', message: 'employeeId and messageText are required.' };
          }
          
          // Get employee details
          const empUser = await this.prisma.user.findUnique({
            where: { id: employeeId },
            include: { employeeProfile: true }
          });

          if (!empUser) {
            return { error: 'EMPLOYEE_NOT_FOUND', message: 'Employee user could not be found.' };
          }

          // Create system alert log
          let room = await this.prisma.chatRoom.findFirst({
            where: { organizationId, isSystem: true, systemUserId: employeeId }
          });
          if (!room) {
            room = await this.prisma.chatRoom.create({
              data: { name: "RENS Operational Brain", isSystem: true, systemUserId: employeeId, organizationId }
            });
          }

          await this.prisma.message.create({
            data: {
              content: messageText,
              isSystem: true,
              chatRoomId: room.id
            }
          });

          // Emit WebSocket broadcast for real-time dashboard sync
          this.rensGateway.broadcastToOrganization(organizationId, 'alert_sync', {
            action: 'create',
            message: messageText,
            recipientId: employeeId,
            recipientName: `${empUser.firstName} ${empUser.lastName || ''}`.trim()
          });

          return { 
            success: true, 
            channel: 'IN_APP', 
            recipient: `${empUser.firstName} ${empUser.lastName || ''}`.trim(),
            message: messageText
          };
        }

        case 'fetchEmployeePerformance': {
          const { employeeName } = params || {};
          if (!employeeName) {
            return { error: 'MISSING_PARAMS', message: 'Employee name is required.' };
          }

          const genericKeywords = ['all', 'best', 'top', 'everyone', 'any', 'staff', 'employees', 'performance'];
          const isGeneric = genericKeywords.includes(employeeName.toLowerCase().trim());

          if (isGeneric) {
            // Fetch all active employees
            const profiles = await this.prisma.employeeProfile.findMany({
              where: { organizationId, status: 'ACTIVE' },
              include: { user: true }
            });

            const leaderboard: any[] = [];

            for (const target of profiles) {
              const tasks = await this.prisma.task.findMany({
                where: { assignedToId: target.userId }
              });
              const totalTasks = tasks.length;
              const completed = tasks.filter(t => t.status === 'COMPLETED').length;
              const pending = tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;
              const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

              const reviews = await this.prisma.performanceReview.findMany({
                where: { employeeProfileId: target.id }
              });
              const avgRating = reviews.length > 0 ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)) : 0;

              leaderboard.push({
                profileId: target.id,
                userId: target.userId,
                employee: `${target.user.firstName} ${target.user.lastName || ''}`.trim(),
                department: target.department,
                designation: target.designation,
                email: target.user.email,
                taskStats: {
                  total: totalTasks,
                  completed,
                  pending,
                  completionRate
                },
                avgRating,
                reviewsCount: reviews.length
              });
            }

            // Rank them by average rating, then by completion rate, then by total tasks
            leaderboard.sort((a, b) => {
              if (b.avgRating !== a.avgRating) {
                return b.avgRating - a.avgRating;
              }
              if (b.taskStats.completionRate !== a.taskStats.completionRate) {
                return b.taskStats.completionRate - a.taskStats.completionRate;
              }
              return b.taskStats.total - a.taskStats.total;
            });

            return {
              isRankingsList: true,
              leaderboard
            };
          }

          const matches = await this.findEmployeeFuzzy(employeeName, organizationId);
          if (matches.length === 0) {
            return { error: 'EMPLOYEE_NOT_FOUND', message: `I couldn't find any team member named "${employeeName}".` };
          }
          const target = matches[0];

          // Fetch task completion counts
          const tasks = await this.prisma.task.findMany({
            where: { assignedToId: target.id }
          });
          const totalTasks = tasks.length;
          const completed = tasks.filter(t => t.status === 'COMPLETED').length;
          const pending = tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;
          const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

          // Fetch performance reviews
          const reviews = await this.prisma.performanceReview.findMany({
            where: { employeeProfileId: target.profileId },
            orderBy: { reviewDate: 'desc' }
          });

          const activities = await this.prisma.activityLog.findMany({
            where: { employeeProfileId: target.profileId },
            orderBy: { logTime: 'desc' },
            take: 5
          });

          return {
            employee: `${target.firstName} ${target.lastName || ''}`.trim(),
            department: target.department,
            designation: target.designation,
            taskStats: {
              total: totalTasks,
              completed,
              pending,
              completionRate: `${completionRate}%`
            },
            reviews: reviews.map(r => ({
              rating: r.rating,
              feedback: r.feedback,
              date: r.reviewDate
            })),
            recentActivities: activities.map(a => ({
              description: a.description,
              category: a.category,
              time: a.logTime
            }))
          };
        }

        case 'escalateIssue': {
          const { taskId, escalationNotes, taskTitle } = params || {};
          if (!taskId) {
            return { error: 'MISSING_PARAMS', message: 'taskId is required.' };
          }
          const task = await this.prisma.task.update({
            where: { id: taskId },
            data: { 
              title: `🚨 [URGENT ESCALATION] ${taskTitle || 'Task SLA Overdue'}`,
              description: escalationNotes ? `${escalationNotes} | Urgent escalation logged.` : 'Urgent escalation logged.'
            }
          });
          return { success: true, task };
        }

        default:
          return null;
      }
    } catch (err) {
      this.logger.error(`Error executing tool ${toolName}: ${err.message}`);
      return { error: `Database tool execution error: ${err.message}` };
    }
  }

  // Robust JSON extractor and auto-repair helper to fix truncated or incomplete LLM JSON outputs
  private extractJsonBlock(text: string): string | null {
    const startIdx = text.indexOf('{');
    if (startIdx === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;
    let endIdx = -1;

    for (let i = startIdx; i < text.length; i++) {
      const char = text[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        }
      }
    }

    if (endIdx !== -1) {
      return text.substring(startIdx, endIdx + 1);
    }

    // Auto-repair incomplete or truncated JSON
    if (depth > 0) {
      let repairedText = text.substring(startIdx);
      if (inString) {
        repairedText += '"';
      }
      while (depth > 0) {
        repairedText += '}';
        depth--;
      }
      return repairedText;
    }

    return null;
  }

  // -----------------------------------------------------------------------------
  // Context-Aware Query Refiner (Pronoun & Reference Resolution)
  // -----------------------------------------------------------------------------
  async refineQuery(
    userMessage: string,
    history: { role: 'user' | 'model'; content: string }[]
  ): Promise<string> {
    if (history.length === 0) return userMessage;

    const systemPrompt = `You are a Context Resolver for a premium Real Estate ERP CRM.
Your job is to analyze the conversation history and the user's latest message, and resolve any ambiguous references, pronouns (like "he", "she", "him", "her", "them", "their", "employee", "staff", "uski", "unki", "iski", "is ko", "unko", "in dono"), or implicit filters.

CONVERSATIONAL CONTEXT HISTORY:
${history.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.content}`).join('\n')}

INSTRUCTIONS:
1. Scan the history (especially the most recent turns) to identify the latest active referenced entities (such as employees, clients, properties, or tasks).
2. If the user's latest message has pronouns or references like "his", "her", "him", "them", "he", "she", "iski", "uski", "in dono ki", "unki", "unka", "is employee ko", "us property ko", resolve them by replacing them with the explicit name(s) or ID of the entity discussed. For example, rewrite "list his designation" to "List Aizaz Khan's designation" if Aizaz Khan is the active employee.
3. If the user mentions department names colloquially (e.g. "sales wale", "hr ka staff", "finance wale", "logistics wale"), expand them to their database equivalent department names (e.g., "Sales", "Human Resources", "Finance", "Logistics").
4. If the user requests charts (e.g. "line graph me dikhao", "pie chart me", "compare visually"), ensure the rewritten message explicitly states the chart type requested.
5. Output ONLY the refined, fully-explicit, and resolved query in the exact same language (e.g. English, Urdu, Roman Urdu) as the user's query. Do not add any preamble, conversational text, quotes, or markdown. Start directly with the resolved text.`;

    try {
      const refined = await this.callLLM(systemPrompt, `Latest User Message: "${userMessage}"`, []);
      this.logger.log(`Query refined successfully: "${userMessage}" -> "${refined.trim()}"`);
      return refined.trim() || userMessage;
    } catch (err) {
      this.logger.warn(`Failed to refine query: ${err.message}. Using original.`);
      return userMessage;
    }
  }

  // -----------------------------------------------------------------------------
  // Data Quality & Validation Engine (Rule 4)
  // -----------------------------------------------------------------------------
  private validateDataQuality(domain: string, data: any): DataValidationReport {
    let completenessScore = 1.0;
    let consistencyScore = 1.0;
    const missingFields: string[] = [];
    const inconsistencies: string[] = [];
    const anomaliesDetected: string[] = [];

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return {
        completenessScore: 0.0,
        consistencyScore: 1.0,
        missingFields: ['all'],
        inconsistencies: [],
        anomaliesDetected: [],
      };
    }

    const records = Array.isArray(data) ? data : [data];

    for (const record of records) {
      if (domain === 'HR') {
        if (!record.designation) {
          missingFields.push('designation');
          completenessScore -= 0.1;
        }
        if (!record.department) {
          missingFields.push('department');
          completenessScore -= 0.1;
        }
        if (record.status === 'ON_LEAVE' && record.assignedTasks && Array.isArray(record.assignedTasks)) {
          const activeTasks = record.assignedTasks.filter((t: any) => t.status !== 'COMPLETED');
          if (activeTasks.length > 0) {
            inconsistencies.push(`Employee profile is ON_LEAVE but has ${activeTasks.length} active tasks assigned.`);
            consistencyScore -= 0.25;
          }
        }
      } else if (domain === 'Finance') {
        if (record.baseSalary === null || record.baseSalary === undefined) {
          missingFields.push('baseSalary');
          completenessScore -= 0.2;
        }
        if (record.netSalary === null || record.netSalary === undefined) {
          missingFields.push('netSalary');
          completenessScore -= 0.2;
        }
        if (record.baseSalary !== undefined && record.allowances !== undefined && record.deductions !== undefined && record.netSalary !== undefined) {
          const expectedNet = record.baseSalary + record.allowances - record.deductions;
          if (Math.abs(expectedNet - record.netSalary) > 0.01) {
            inconsistencies.push(`Payroll net salary (${record.netSalary}) does not match formula: base (${record.baseSalary}) + allowances (${record.allowances}) - deductions (${record.deductions}).`);
            consistencyScore -= 0.3;
          }
        }
        if (record.salary === 0) {
          anomaliesDetected.push(`Active staff profile registers base salary of 0.`);
        }
      } else if (domain === 'Property') {
        if (!record.price) {
          missingFields.push('price');
          completenessScore -= 0.2;
        }
        if (!record.location) {
          missingFields.push('location');
          completenessScore -= 0.2;
        }
        if (record.price <= 0) {
          anomaliesDetected.push(`Property listed with invalid price: ${record.price}`);
          consistencyScore -= 0.2;
        }
      } else if (domain === 'Sales') {
        if (record.budget !== undefined && record.budget <= 0) {
          anomaliesDetected.push(`CRM client registers a budget of 0 or negative.`);
          consistencyScore -= 0.1;
        }
        if (record.status === 'CLOSED' && record.score < 50) {
          anomaliesDetected.push(`Lead is closed but qualification rating score is low (${record.score}).`);
        }
      } else if (domain === 'Logistics') {
        if (!record.plateNumber) {
          missingFields.push('plateNumber');
          completenessScore -= 0.2;
        }
        if (record.status === 'MAINTENANCE' && record.schedules && Array.isArray(record.schedules)) {
          const activeScheds = record.schedules.filter((s: any) => s.status === 'SCHEDULED' || s.status === 'IN_TRANSIT');
          if (activeScheds.length > 0) {
            inconsistencies.push(`Vehicle ${record.plateNumber} is in MAINTENANCE but has ${activeScheds.length} active delivery/viewing schedules.`);
            consistencyScore -= 0.4;
          }
        }
      }
    }

    return {
      completenessScore: Math.max(0.0, parseFloat(completenessScore.toFixed(2))),
      consistencyScore: Math.max(0.0, parseFloat(consistencyScore.toFixed(2))),
      missingFields: Array.from(new Set(missingFields)),
      inconsistencies,
      anomaliesDetected,
    };
  }

  // -----------------------------------------------------------------------------
  // Dedicated Domain-Specific Specialized Agents Layer (Rule 3 & 7)
  // -----------------------------------------------------------------------------
  async executeDomainAgent(
    domain: 'HR' | 'Finance' | 'Property' | 'Sales' | 'Logistics',
    toolName: string,
    params: any,
    organizationId: string,
    userRole: string,
    userId: string
  ): Promise<AgentOutput> {
    this.logger.log(`[Domain Agent: ${domain}] Coordinating operational tool: ${toolName}`);
    
    // Fetch live Postgres results using the existing robust database tool
    const rawData = await this.executeDatabaseTool(toolName, params, organizationId, userRole, userId);
    
    // Check raw data quality
    const validation = this.validateDataQuality(domain, rawData);
    
    // Combined domain confidence weighting
    const confidence = parseFloat((0.5 * validation.completenessScore + 0.5 * validation.consistencyScore).toFixed(2));
    
    const insights: string[] = [];
    
    if (validation.missingFields.length > 0) {
      insights.push(`[${domain} Quality Check] Missing database records: ${validation.missingFields.join(', ')}.`);
    }
    for (const inconsistency of validation.inconsistencies) {
      insights.push(`[${domain} Logical Conflict] ${inconsistency}`);
    }
    for (const anomaly of validation.anomaliesDetected) {
      insights.push(`[${domain} Anomaly Detected] ${anomaly}`);
    }
    
    // Basic dynamic data summaries
    if (domain === 'HR') {
      if (Array.isArray(rawData)) {
        insights.push(`Analyzed ${rawData.length} active employee profiles, schedules, or leave cycles.`);
      }
    } else if (domain === 'Finance') {
      if (rawData && rawData.totals) {
        insights.push(`Aggregate base salaries budget calculated: $${rawData.totals.baseSalary}. Net payouts commitment: $${rawData.totals.netSalary}.`);
      }
    } else if (domain === 'Property') {
      if (Array.isArray(rawData)) {
        const sold = rawData.filter(r => r.status === 'SOLD').length;
        const rented = rawData.filter(r => r.status === 'RENTED').length;
        const avail = rawData.filter(r => r.status === 'AVAILABLE').length;
        insights.push(`Calculated listings inventory: ${avail} Available, ${sold} Sold, ${rented} Rented.`);
      }
    } else if (domain === 'Sales') {
      if (Array.isArray(rawData)) {
        insights.push(`Sourced ${rawData.length} active leads or clients funnel progress logs.`);
      }
    } else if (domain === 'Logistics') {
      if (rawData && rawData.vehicles) {
        insights.push(`Fleet status checks complete: managing ${rawData.vehiclesCount} total company vehicles.`);
      }
    }

    return {
      domain,
      records: rawData,
      insights,
      validation,
      confidence,
    };
  }

  // -----------------------------------------------------------------------------
  // Consensus and Consistency Alignment Pipeline (Rule 3, 6 & 7)
  // -----------------------------------------------------------------------------
  async runConsensusAndAlignment(
    agents: AgentOutput[],
    userQuery: string,
    history: { role: 'user' | 'model'; content: string }[]
  ): Promise<ConsensusReport> {
    this.logger.log(`Running Consensus Alignment pipeline for ${agents.length} domain reports.`);
    
    const avgCompleteness = agents.reduce((sum, a) => sum + a.validation.completenessScore, 0) / agents.length;
    const avgConsistency = agents.reduce((sum, a) => sum + a.validation.consistencyScore, 0) / agents.length;
    const overallConfidence = parseFloat((0.5 * avgCompleteness + 0.5 * avgConsistency).toFixed(2));
    
    const agentSummaries = agents.map(a => `
[DOMAIN: ${a.domain}]
Domain Confidence Rating: ${a.confidence}
Agent Observations:
${a.insights.map(i => `- ${i}`).join('\n')}
Validation Details:
- Completeness Score: ${a.validation.completenessScore} (Missing fields: ${a.validation.missingFields.join(', ') || 'None'})
- Consistency Score: ${a.validation.consistencyScore} (Inconsistencies: ${a.validation.inconsistencies.join(', ') || 'None'})
`).join('\n');

    const systemPrompt = `You are the RENS Multi-Agent Consensus Alignment Engine.
Your job is to read observations from specialized domain agents (HR, Finance, Property, Sales, Logistics), identify logical contradictions, resolve conflicts, and synthesize a consistent, unified set of operational insights.

USER QUERY: "${userQuery}"

DOMAIN AGENT OBSERVATIONS:
${agentSummaries}

STRICT CONSENSUS ALIGNMENT RULES:
1. Contradiction Detection: Check if observations between agents contradict each other. For example:
   - HR reports an employee is highly productive, but Sales reports the same employee has zero client closures.
   - Property reports a listing is sold, but Finance reports zero commission generated.
   - Logistics reports a vehicle is in maintenance, but HR/Operations shows it has scheduled shifts.
2. Conflict Resolution: Resolve conflicts strictly prioritizing:
   - Central Database records (raw records) over speculative agent comments.
   - Higher-confidence domain reports over lower-confidence domain reports.
3. Low Confidence Warning: If the overall confidence score is below 0.75, generate a clear, highly professional warning summarizing what data is missing or outdated.
4. Output Format: You MUST respond in a clean JSON format containing exactly the following keys:
   {
     "alignedInsights": ["Insight 1", "Insight 2"],
     "contradictionsResolved": ["Contradiction 1 resolved...", "Contradiction 2 resolved..."],
     "proactiveActions": ["Actionable recommendation 1", "Actionable recommendation 2"],
     "reducedCertaintyWarning": "Warning description..." (or null if confidence is high)
   }
No conversational text, thoughts, or markdown code blocks should be output. Just the raw JSON block.`;

    try {
      const responseText = await this.callLLM(systemPrompt, `Calculate consensus and resolve contradictions.`, []);
      const cleanResponse = responseText.trim();
      const jsonBlock = this.extractJsonBlock(cleanResponse) || cleanResponse;
      
      const parsed = JSON.parse(jsonBlock);
      return {
        overallConfidence,
        alignedInsights: parsed.alignedInsights || [],
        contradictionsResolved: parsed.contradictionsResolved || [],
        proactiveActions: parsed.proactiveActions || [],
        reducedCertaintyWarning: overallConfidence < 0.75 ? (parsed.reducedCertaintyWarning || `Based on partial database records with low confidence rating (${overallConfidence * 100}%), please proceed with caution.`) : null,
      };
    } catch (err) {
      this.logger.error(`Failed to execute Consensus Alignment Engine: ${err.message}. Falling back to default heuristics.`);
      
      const alignedInsights: string[] = [];
      const proactiveActions: string[] = [];
      
      for (const a of agents) {
        alignedInsights.push(...a.insights);
        if (a.validation.inconsistencies.length > 0) {
          proactiveActions.push(`Investigate database inconsistencies in the ${a.domain} domain.`);
        }
      }
      
      return {
        overallConfidence,
        alignedInsights,
        contradictionsResolved: [],
        proactiveActions,
        reducedCertaintyWarning: overallConfidence < 0.75 ? `Warning: Operational data completeness is low (${overallConfidence * 100}%). Some fields are missing.` : null,
      };
    }
  }

  // -----------------------------------------------------------------------------
  // Main Cognitive Chat Pipeline (RAG + SQL Tools)
  // -----------------------------------------------------------------------------
  async chat(
    userMessage: string,
    userId: string,
    organizationId: string,
    userRole: string,
    history: { role: 'user' | 'model'; content: string }[] = []
  ): Promise<any> {
    try {
      // -----------------------------------------------------------------------------
      // STEP 1 & 2: INTENT CLASSIFICATION & DECIDE RESPONSE TYPE (Rule 3, 4, 5)
      // -----------------------------------------------------------------------------
      const normalizedMessage = userMessage.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");

      const isVoiceCheckPhrase = [
        "can you hear me",
        "are you there",
        "voice test",
        "mic check",
        "connection check",
        "can you hear",
        "hear me",
        "you there",
        "are you listening",
        "testing testing",
        "voice check",
        "mic test",
        "can you hear me now"
      ].some(phrase => normalizedMessage.includes(phrase));

      const isGreetingPhrase = [
        "hello",
        "hi",
        "salam",
        "hey",
        "hola",
        "assalam o alaikum",
        "aoa",
        "salam alaikum"
      ].some(phrase => normalizedMessage === phrase || normalizedMessage.startsWith(phrase + " "));

      const isSimpleAckPhrase = [
        "thank you",
        "thanks",
        "shukriya",
        "ok",
        "okay",
        "cool",
        "nice",
        "acha",
        "fine"
      ].some(phrase => normalizedMessage === phrase);

      // FAST LANE BYPASS (Rule 1, 2, 5 - Respond within 1-2 seconds with NO thinking delay)
      if (isVoiceCheckPhrase || isGreetingPhrase) {
        this.logger.log(`Fast Lane Match: Voice check or greeting detected ("${userMessage}"). Responding instantly.`);
        return {
          response: "Yes, I can hear you clearly. How can I help you?",
          toolExecuted: null,
          toolData: null,
          citations: []
        };
      }

      if (isSimpleAckPhrase) {
        // Only fast lane ack if not part of a task assignment confirm flow
        const isTaskConfirmationFlow = history.some(h => h.content.includes("ready to finalize") || h.content.includes("confirm"));
        if (!isTaskConfirmationFlow) {
          this.logger.log(`Fast Lane Match: Simple acknowledgement classified ("${userMessage}"). Responding instantly.`);
          return {
            response: "You're welcome! Let me know if you need help with any properties, tasks, or ERP operations.",
            toolExecuted: null,
            toolData: null,
            citations: []
          };
        }
      }

      // SLOW LANE INTENT CLASSIFICATION
      const erpKeywords = [
        "property", "properties", "apartment", "villa", "rent", "sale", "price", "location", "bedrooms",
        "client", "buyer", "seller", "investor", "lead", "budget", "crm",
        "employee", "staff", "designation", "department", "salary", "payroll", "joining",
        "finance", "expense", "allowance", "deduction",
        "meeting", "calendar", "event", "attendee", "absent",
        "leave", "vacation", "sick", "annual",
        "vehicle", "fleet", "logistics", "maintenance", "plate",
        "attendance", "checkin", "checkout", "shift", "check-in", "check-out", "present", "late", "absent",
        "query", "table", "database", "db", "search", "find", "list", "show", "get", "calculate",
        "analytics", "chart", "graph", "report"
      ];
      
      const hasErpKeywords = erpKeywords.some(kw => normalizedMessage.includes(kw)) ||
        /kiraya|bechna|kharidna|daftar|mulazim|tankhaw|paisa|chutti|ghari|gari|haazri|hazri|kam/i.test(normalizedMessage);

      const isTaskAssignmentFlow = /assign|task|zimadari|kaam|duty|create task|task assign/i.test(normalizedMessage);

      // Force conversational mode unless explicitly requesting ERP data or in active task creation flows (Rule 4)
      const allowDbTools = hasErpKeywords || isTaskAssignmentFlow;
      const skipRefine = !allowDbTools; // Skip refinement LLM call to save 1-2 seconds of latency

      let refinedMessage = userMessage;
      if (!skipRefine) {
        // Refine query to resolve pronouns & implicit references using history context
        refinedMessage = await this.refineQuery(userMessage, history);
      }

      // -----------------------------------------------------------------------------
      // MEMORY PERSISTENCE: Context & Entity Memory Scan (Rule 7)
      // -----------------------------------------------------------------------------
      let lastResolvedEmployee: any = null;
      let lastResolvedClient: any = null;
      let lastResolvedTask: any = null;
      let activeTaskDraft: any = {
        employeeName: null,
        employeeId: null,
        title: null,
        dueDate: null,
        priority: null
      };

      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i] as any;
        if (msg.role === 'model') {
          // Resolve Last Employee from searchEmployees output in toolData
          if (msg.toolExecuted === 'searchEmployees' && msg.toolData && Array.isArray(msg.toolData) && msg.toolData.length > 0) {
            if (!lastResolvedEmployee) {
              const emp = msg.toolData[0];
              lastResolvedEmployee = {
                id: emp.id,
                userId: emp.userId,
                name: emp.user ? `${emp.user.firstName} ${emp.user.lastName || ''}`.trim() : 'Employee',
                department: emp.department,
                designation: emp.designation
              };
              if (!activeTaskDraft.employeeName) {
                activeTaskDraft.employeeName = lastResolvedEmployee.name;
                activeTaskDraft.employeeId = lastResolvedEmployee.id;
              }
            }
          }
          // Resolve Last Client
          if (msg.toolExecuted === 'searchClients' && msg.toolData && Array.isArray(msg.toolData) && msg.toolData.length > 0) {
            if (!lastResolvedClient) {
              const cl = msg.toolData[0];
              lastResolvedClient = {
                id: cl.id,
                name: cl.name
              };
            }
          }
          // Resolve Last Task
          if (msg.toolExecuted === 'createTask' && msg.toolData) {
            if (!lastResolvedTask) {
              lastResolvedTask = {
                id: msg.toolData.id,
                title: msg.toolData.title
              };
            }
          }
        } else if (msg.role === 'user') {
          const text = msg.content.toLowerCase();
          
          // Heuristics to capture task parameters from user messages
          if (!activeTaskDraft.dueDate) {
            const dateMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
            if (dateMatch) {
              activeTaskDraft.dueDate = dateMatch[0];
            } else if (text.includes("tomorrow") || text.includes("kal")) {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              activeTaskDraft.dueDate = tomorrow.toISOString().split('T')[0];
            }
          }
          if (!activeTaskDraft.priority) {
            if (text.includes("urgent") || text.includes("fori") || text.includes("zaroori")) {
              activeTaskDraft.priority = "URGENT";
            } else if (text.includes("high") || text.includes("ahmiyat")) {
              activeTaskDraft.priority = "HIGH";
            } else if (text.includes("standard") || text.includes("normal") || text.includes("aam")) {
              activeTaskDraft.priority = "STANDARD";
            }
          }
        }
      }

      const memoryContext = `
ACTIVE CONVERSATIONAL REFERENCE MEMORY (Rule 7):
- Last Resolved Employee: ${lastResolvedEmployee ? `${lastResolvedEmployee.name} (${lastResolvedEmployee.designation} from ${lastResolvedEmployee.department}, Profile ID: ${lastResolvedEmployee.id})` : 'None'}
- Last Resolved Client: ${lastResolvedClient ? `${lastResolvedClient.name} (ID: ${lastResolvedClient.id})` : 'None'}
- Last Resolved Task: ${lastResolvedTask ? `"${lastResolvedTask.title}" (ID: ${lastResolvedTask.id})` : 'None'}
- Active Task Draft State: ${JSON.stringify(activeTaskDraft)}
`;

      // Fetch user's details for highly personalized interaction
      const userRecord = await this.prisma.user.findUnique({
        where: { id: userId }
      });
      const userName = userRecord ? `${userRecord.firstName} ${userRecord.lastName || ''}`.trim() : 'User';

      // Step A: Search unstructured knowledge base (RAG)
      const matchingChunks = await this.searchUnstructuredKnowledge(refinedMessage, organizationId, 4);
      
      const documentContext = matchingChunks.length > 0
        ? `UNSTRUCTURED KNOWLEDGE DOCUMENTS (RAG):\n${matchingChunks
            .map((c, i) => `[Doc ${i + 1}]: ${c.content} (Source: ${c.documentName})`)
            .join('\n\n')}`
        : 'No unstructured knowledge documents relevant to this query found.';

      // Step B: Set up Cognitive system prompt describing capabilities, user role, and tools
      let systemPrompt = `You are the RENS Multi-Agent Real Estate Intelligence Operating System (RENS-AOS 5.0) Orchestrator.
You are NOT a chatbot. You coordinate specialized AI domain agents and manage real estate operations utilizing live database insights.

MULTI-AGENT ARCHITECTURE BEHAVIOR:
1. THE ORCHESTRATOR AI (Main Brain):
   - Categorizes every user message into the correct domain.
   - Delegates subtasks to specialized domain agents.
   - Merges their deep analytical outputs into a single, cohesive, decision-ready insight.
2. DEDICATED DOMAIN SPECIALIZED AGENTS:
   - HR Agent: Reason deeply on employees, attendance patterns, leave histories, task load distributions, team bottlenecks, and performance rankings.
   - Finance Agent: Audits department payrolls, Net salaries vs base scales, cost expenditures, cost analysis, and financial anomalies.
   - Property Agent: Analyzes listings (SOLD, RENTED, AVAILABLE), owner property distributions, buyer interest tracking, inventory aging (unsold time), price changes, and location-based performance in popular Dubai locations (Dubai Marina, Downtown Dubai, Palm Jumeirah, Business Bay, Jumeirah).
   - Sales Agent: Tracks leads, agent conversion rates, lead-to-sale funnel progress, monthly sales growth, and pipeline health.
   - Logistics Agent: Audits vehicle fleet statuses, maintenance costs, pickup/drop schedules, and driver profiles.
3. SHARED INTELLIGENCE LAYER:
   - All agents read and write directly to the same centralized PostgreSQL database via live tools and raw SQL query aggregations. No duplicated contexts.

STRICT OPERATIONAL INTEGRITY & SINGLE SOURCE OF TRUTH RULES:
1. NO FAKE CONFIRMATIONS: Never confirm any action (task creation, update, assignment) unless the database returns a successful record with a valid ID. If no database confirmation exists, do NOT claim the action succeeded.
2. SINGLE SOURCE OF TRUTH: All operational data, employee information, and task statuses must come ONLY from the live database. Never guess, assume, or hallucinate task or employee details.
3. STRICT TASK CREATION FLOW: Always traverse the exact pipeline: Intent ➔ Entity Match ➔ Task Structuring ➔ DB Write ➔ DB Confirm ➔ Response. Never create incomplete tasks.
4. ABSOLUTE TONE CONSISTENCY: Your tone must be strictly professional, clear, minimal, and friendly. You MUST NOT use any informal language, slang, or casual Urdu words (specifically the slang word "bhai" or "yaar").
5. ERP BEHAVIOR: Behave strictly as a precise enterprise controller, database operator, and workflow manager rather than a talkative chatbot.
6. HIDDEN OPERATIONAL LAYER (UI/UX RULE): All multi-agent delegation, domain routing, and department-specific reasoning MUST run silently behind the scenes. You MUST NEVER output any operational logs, delegating markers (such as "[Orchestrator] ➔ ..."), or direct agent dialogue quotes in the final response. The user must ONLY receive the polished, unified, decision-ready final business insight directly. Banish all background operational chatter from the visible response!

CURRENT USER SECURITY CONTEXT:
- Logged-in User ID: ${userId}
- Security Role: ${userRole}
- User Name: ${userName}

${memoryContext}

PERSONALIZATION PROTOCOL:
- You are communicating directly with ${userName}. Greet them contextually and professionally by name (e.g. "Salam ${userRecord?.firstName || 'Admin'}!" or "Hello ${userRecord?.firstName || 'Admin'}!") where appropriate, and keep the interaction highly personalized to their identity and role within the RENS Ecosystem.

STRICT ROLE-BASED ACCESS CONTROL (AI-RBAC) POLICY:
1. Access to sensitive records is strictly cleared based on the Security Role (${userRole}):
   - Finance aggregates, payroll, or individual salaries: CLEAR ONLY for "SUPER_ADMIN", "ADMIN", "HR", and "FINANCE". (All other roles are NOT cleared!)
   - Leaves and attendance details of OTHER employees: CLEAR ONLY for "SUPER_ADMIN", "ADMIN", and "HR". (All other roles are NOT cleared!)
   - A user's OWN leaves, profile, and tasks: EVERY role is fully cleared to query their own info! (e.g. an AGENT can check their own leaves, but NOT another employee's leaves).
   - Logistics fleet details, plate numbers, active schedules, or maintenance costs: CLEAR ONLY for "SUPER_ADMIN", "ADMIN", and "LOGISTICS". (All other roles are NOT cleared!)
2. CLEARANCE & FILLER POLICY:
   - If the user asks for details that are NOT cleared for the Security Role (${userRole}), you MUST decline immediately in natural text without calling any tools!
   - Decline politely in their query language: "Aapka current profile as ${userRole} is secure database ko access karne ke liye authorized nahi hai." or "Your profile is not cleared."
   - **CRITICAL: If the user IS cleared (e.g. SUPER_ADMIN or ADMIN), you MUST NOT write any security checks, UAC notices, or talkative phrases like 'Aapka profile cleared hai is database ko access karne ke liye' or 'Maine database check kiya'. Output ONLY the raw JSON tool call immediately without any natural text filler!**

STRICT INTENT ROUTING & REAL ESTATE INTELLIGENCE LAYER (Rule 4 & 5):
1. Every user query MUST be classified into one of these strict intelligence categories BEFORE calling any database tools:
   - A) Property Intelligence: Queries about sold vs rented vs available properties, location-specific performance, price trend analyses, client interest level checks, or inventory aging analysis.
   - B) Owner / Buyer Intelligence: Queries about top property owners by volume, high revenue clients, inactive clients, repeat buyers, or investor concentration.
   - C) Sales / Inventory Intelligence: Queries about conversion rates (lead to sale), agent performance rankings, inventory turnover rates, or monthly sales trends.
   - D) Employee / HR Intelligence: Queries about task loads per employee, productivity scores, team bottlenecks, and employee performance rankings.
   - E) Financial Intelligence: Queries about aggregate payrolls, monthly salary budgets, and allowances/deductions.
   - F) General Query: Contextual chit-chat, greetings, voice checks, general company policy clarifications.
2. AI IS NOT A SIMPLE CHATBOT OR Relational Query System. You must act as a Real Estate Intelligence Engine that understands business intent and provides decision-ready insights.
3. MULTI-TABLE REASONING: You are allowed and expected to perform joins, aggregates, rankings, and trend analysis across multiple tables (using "runDatabaseQuery" SELECT queries or structured API results) to answer complex business questions (e.g., Owner + Property aggregation).
4. NEVER mix intents. Do NOT execute a workflow action (like createTask) if the user is asking a database query (like searching employees).
5. RESPONSE CONSISTENCY: Only respond based on user intent. Do NOT randomly show analytics, dashboards, or employee cards unless explicitly aligned to their intent!

STRICT ENTITY RESOLUTION & ERROR FLOW FIX (Rule 1, 2 & 6):
1. NEVER directly trust raw user names. For any employee lookup or task assignment query, trigger "searchEmployees" to verify their identity and evaluate their "similarityScore":
   - Similarity Score > 0.85 (85%) ➔ High confidence! Auto-select the employee and proceed with the flow.
   - Similarity Score between 0.60 and 0.85 (60%-85%) ➔ Medium confidence! You MUST stop and request user confirmation: "Did you mean Muhammad Aizaz Khan from Human Resources?" Do NOT auto-select or call "createTask" yet!
   - Similarity Score < 0.60 (60%) or no match found ➔ Low confidence! You MUST suggest the closest match and ask: "Did you mean [Closest Match Name] from [Department]?" or request clarification.
2. Never say "no employee found" or "not found" if a similar employee exists. Always keep the conversation flowing by offering closest options!
3. Maintain persistent identity. When pronouns like "he", "she", "him", "her", "uski", "unko" are used, resolve them contextually to the active employee in the "ACTIVE CONVERSATIONAL REFERENCE MEMORY" block.

STRICT LANGUAGE ALIGNMENT POLICY:
1. **You MUST respond in the EXACT same language as the user's message.**
   - If the user writes in English, your entire response (including thoughts, questions, and final outputs) MUST be in English.
   - If the user writes in Urdu script, your response MUST be in Urdu script.
   - If the user writes in Roman Urdu, your response MUST be in Roman Urdu.
   - If the user writes in Persian, Russian, or Turkish, your response MUST be in that exact language.
2. DO NOT mix languages, and never default to Roman Urdu if the user queried in English.
3. **NEVER start your response with any preamble, disclaimer, translation note, or language declaration statement (such as 'Here is the response in the exact same language as...'). Directly start answering the user's question. Forbidding any preamble is absolute!**

STRICT REAL-TIME ACCURACY & TOOL ENFORCEMENT:
1. **You DO NOT know the actual metrics of this database internally.** For example, if the user asks "how many employees we have?", you DO NOT know the count (it might be 3, 10, or 250) until you execute the corresponding tool!
2. You MUST call the live database tools for any property, task, employee, finance, meeting, client, or leave queries.
3. NEVER guess, estimate, or hallucinate counts or names.
4. If a previous turn in the history contains fake hallucinated numbers (due to a previous failed tool call), ignore them and ALWAYS execute the live database tool to get the real, actual database records!
5. STRICT ATTENDANCE VS LEAVE DIFFERENTIATION: If the user asks about daily shift attendance, check-in, check-out, or shift logs, you MUST execute "getAttendanceRecord". If they ask about vacations, sick days, or leaves, you MUST execute "getLeaveRequests". Do NOT mix them up!

CONVERSATIONAL RULES & WORKFLOWS:
1. Respond completely like a professional, clear, minimal friendly Operations Coordinator / Executive Assistant. Avoid excessive informal language or chatty filler. Prohibit casual Urdu terms like "bhai" or "yaar" entirely. Keep responses professional, clear, minimal, and highly focused.
2. CONCISE & DIRECT: Only answer what the user asked. Keep details simple, clear, and highly focused.
3. PREMIUM VISUALS: Avoid ugly robotic markdown templates. Instead, write in a clean, beautifully spaced human layout with elegant line breaks and clean, meaningful emojis.
4. FOLLOW-UP QUESTIONS: If the user asks a follow-up question and the relevant data is already present in the previous conversation history, do NOT call any database tools again! Simply answer their question directly from the conversation history naturally.
5. NO ROBOTIC DIRECT-CREATION / STRICT TASK VALIDATION FLOW (Rule 3):
   - NEVER create a task (i.e. do NOT call the "createTask" tool) automatically if important details like the task title/details are missing, or if the target employee has not been verified!
   - DO NOT execute task creation immediately. Follow the step-by-step validation flow: Title/Details ➔ Deadline ➔ Priority ➔ Explicit Confirmation. Never create incomplete tasks!
   - Follow this strict step-by-step operational workflow when the user requests task assignment:
     - STEP 1 (Identify Employee): If the user says "Assign task to [Name]", do NOT call "createTask" yet! Instead, call "searchEmployees" with their name to verify their existence and retrieve their profile.
     - STEP 2 (Solicit Details): Once identified, present their verified name and department/designation, and politely ask the user for the missing details: (1) Task details/title, (2) Deadline, and (3) Priority. Do NOT call "createTask" yet!
     - STEP 3 (Confirm Summary): Once the user provides the task details, present a clear, beautiful summary block of the task (Task, Employee, Priority, Deadline) and ask the user if they are ready to finalize it.
     - STEP 4 (Finalize & Create): Trigger the "createTask" tool ONLY after the user explicitly confirms (e.g. "Yes", "Finalize it", "go ahead").
6. ACTIVE ENTITY MEMORY SYSTEM:
   - Actively parse previous turns in the "history" to sustain reference memory.
   - If the user uses a pronoun (e.g. "his designation", "her salary", "is employee ko reminder bhejo"), map it to the active employee, client, or property discussed in the most recent turn. Never lose context immediately after retrieval.
7. FOLLOW-UP SUGGESTIONS: At the end of your response, always suggest 1 or 2 natural, context-sensitive follow-up questions to guide them nicely (e.g., "Would you like me to show their salary breakdown?" or "Should I check their active viewings?").

You have access to live database query tools to answer questions about Properties, CRM Clients, Employees, Finances, Tasks, Meetings, Leaves, and Logistics.
If a user query requires searching these areas, you MUST invoke a database tool by outputting a JSON command block.
CRITICAL: If you want to use a tool, your entire response MUST consist of a **single JSON block**, exactly like this format:
{"tool": "TOOL_NAME", "params": { ... }}

Ensure the JSON block is perfectly formatted, fully closed with all necessary trailing braces '}', and never omit the closing braces! Do not output any additional conversational text or markdown before or after the JSON block if you are using a tool!

Available live tools:
POSTGRESQL DATABASE SCHEMA (DDL REFERENCE):
1. "User" Table:
   - id: String (UUID, primary key)
   - email: String
   - firstName: String
   - lastName: String
   - role: "SUPER_ADMIN" | "ADMIN" | "HR" | "FINANCE" | "SALES_MANAGER" | "AGENT" | "LOGISTICS"
   - organizationId: String
2. "EmployeeProfile" Table:
   - id: String (UUID, primary key)
   - userId: String (relation to User)
   - department: String
   - designation: String
   - salary: Float
   - joiningDate: DateTime
   - status: "ACTIVE" | "ON_LEAVE" | "TERMINATED"
   - organizationId: String
3. "Attendance" Table:
   - id: String (UUID, primary key)
   - dateStr: String (Format: "YYYY-MM-DD")
   - checkIn: DateTime
   - checkOut: DateTime
   - status: "PRESENT" | "LATE" | "ABSENT" | "ON_LEAVE"
   - checkoutSummary: String
   - employeeProfileId: String (relation to EmployeeProfile)
4. "LeaveRequest" Table:
   - id: String (UUID, primary key)
   - startDate: DateTime
   - endDate: DateTime
   - type: "SICK" | "CASUAL" | "ANNUAL" | "UNPAID"
   - status: "PENDING" | "APPROVED" | "REJECTED"
   - reason: String
   - employeeProfileId: String (relation to EmployeeProfile)
5. "Property" Table:
   - id: String (UUID, primary key)
   - title: String
   - description: String
   - type: "APARTMENT" | "VILLA" | "COMMERCIAL"
   - status: "AVAILABLE" | "SOLD" | "RENTED"
   - listingType: "RENT" | "SALE"
   - price: Float
   - location: String
   - bedrooms: Int
   - bathrooms: Int
   - areaSqft: Float
   - organizationId: String
6. "Client" Table:
   - id: String (UUID, primary key)
   - name: String
   - email: String
   - phone: String
   - type: "BUYER" | "SELLER" | "INVESTOR"
   - budget: Float
   - preferences: String
   - organizationId: String
7. "Task" Table:
   - id: String (UUID, primary key)
   - title: String
   - status: "PENDING" | "IN_PROGRESS" | "COMPLETED"
   - dueDate: DateTime
   - assignedToId: String (relation to User)
   - organizationId: String
8. "CalendarEvent" Table:
   - id: String (UUID, primary key)
   - title: String
   - startTime: DateTime
   - endTime: DateTime
   - location: String
   - organizationId: String
9. "PerformanceReview" Table:
   - id: String (UUID, primary key)
   - reviewDate: DateTime
   - rating: Int (1-5 stars)
   - feedback: String
   - employeeProfileId: String (relation to EmployeeProfile)
   - reviewedById: String
10. "ActivityLog" Table:
   - id: String (UUID, primary key)
   - description: String
   - category: String (WORK, MEETING, CALL, etc.)
   - duration: Int
   - logTime: DateTime
   - employeeProfileId: String (relation to EmployeeProfile)

Available live tools:
1. "searchProperties":
   Search properties listing database.
   Params: {"location": string (optional), "minPrice": number (optional), "maxPrice": number (optional), "bedrooms": number (optional), "bathrooms": number (optional), "type": "APARTMENT"|"VILLA"|"COMMERCIAL" (optional), "listingType": "RENT"|"SALE" (optional), "status": "AVAILABLE"|"SOLD"|"RENTED" (optional)}
2. "searchClients":
   Search active CRM buyers, sellers, or investors.
   Params: {"name": string (optional), "budget": number (optional), "preferences": string (optional), "type": "BUYER"|"SELLER"|"INVESTOR" (optional)}
3. "searchEmployees":
   Search employee directories, profiles, designations, and departments.
   Params: {"name": string (optional), "designation": string (optional), "department": string (optional)}
4. "getFinanceAnalytics":
   Calculates total monthly payroll budget, total base salaries paid, allowances, deductions, and individual staff salaries.
   Params: {} (no params required)
5. "getTasksBoard":
   Search operations and logistics tasks.
   Params: {"status": "PENDING"|"IN_PROGRESS"|"COMPLETED" (optional)}
6. "getMeetingsAnalytics":
   Analyze virtual online meetings, corporate calendar events, hosts/organizers, all-time attendees, and lists of absent or present invitees. Use this to find who created a meeting, who attended it, how many joined, and who was absent.
   Params: {"type": "VIRTUAL" | "PHYSICAL" (optional - use VIRTUAL if the user specifically asks about online/virtual meetings, use PHYSICAL if they ask about in-person/physical meetings)}
7. "getLeaveRequests":
   Retrieves employee leave requests, date ranges, leave type (SICK, CASUAL, ANNUAL, UNPAID), and status (PENDING, APPROVED, REJECTED). Standard users will only retrieve their own. HR/Admin can query anyone by name.
   Params: {"name": string (optional - works only for HR/Admin), "status": "PENDING"|"APPROVED"|"REJECTED" (optional)}
8. "getLogisticsAnalytics":
   Retrieves vehicle fleet details, plate numbers, active logistics schedules (visits, drops, deliveries), drivers, and vehicle maintenance requests with costs.
   Params: {} (no params required)
9. "getAttendanceRecord":
   Retrieves employee shift attendance logs, check-in and check-out timestamps, and daily attendance status (PRESENT, LATE, ABSENT, ON_LEAVE). Normal users will retrieve their own. HR/Admin can query anyone by name.
   Params: {"name": string (optional - works only for HR/Admin), "status": "PRESENT"|"LATE"|"ABSENT"|"ON_LEAVE" (optional)}
10. "runDatabaseQuery":
    Executes a read-only SQL SELECT query against the PostgreSQL database. This is a generic analytics tool. Use it for complex calculations, trends, groupings, averages, department comparative statistics, and when specific features don't have built-in tools!
    Params: {"query": string (a valid read-only SQL SELECT query. CRITICAL: Every query MUST include a filter on "organizationId" matching '${organizationId}')}
11. "createTask":
    Create a new operational task and assign it to an employee using natural language triggers. Standard workload audits (8 active tasks limits) are computed automatically.
    Params: {"title": string (required), "employeeName": string (required), "description": string (optional), "dueDate": string (optional - YYYY-MM-DD), "priority": "STANDARD"|"HIGH"|"URGENT" (optional)}
12. "updateTask":
    Update the status of a specific task.
    Params: {"taskId": string (required), "status": "PENDING"|"IN_PROGRESS"|"COMPLETED" (required)}
13. "updateLeadStatus":
    Update CRM lead status and quality grading score.
    Params: {"leadId": string (required), "status": "NEW"|"CONTACTED"|"ENGAGED"|"DISQUALIFIED"|"CLOSED" (required), "score": number (optional)}
14. "sendReminder":
    Send an autonomous system notification/reminder to an employee chat.
    Params: {"employeeId": string (required), "messageText": string (required)}
15. "fetchEmployeePerformance":
    Analyze a specific employee's task metrics, completion rates, performance reviews, and recent activity logs. Pass "all" or "best" as the employeeName to retrieve a full ranked team performance rankings leaderboard.
    Params: {"employeeName": string (required)}
16. "escalateIssue":
    Escalate a pending task, flag it as urgent, and append operational notes.
    Params: {"taskId": string (required), "taskTitle": string (optional), "escalationNotes": string (optional)}

If the question CANNOT be answered by database tools, or the tool has already run, answer using:
- The context from retrieved unstructured documents (RAG) attached below.
- General ERP operational knowledge.

RESOURCES:
${documentContext}`;

      if (!allowDbTools) {
        systemPrompt += `
\nCRITICAL CONVERSATIONAL PROTOCOL (Rule 4):
- The user is having a general conversational chat (e.g. greetings, simple questions, chit-chat) and has NOT explicitly requested database operations, attendance records, task assignments, CRM queries, or financial analytics.
- **You MUST NOT call any database tools or SQL queries!**
- Do NOT output any JSON tool blocks (like {"tool": "..."}).
- Answer the user's question directly, concisely, and naturally in natural language text only.`;
      }

      // Step C: LLM decision round
      const initialLLMResponse = await this.callLLM(systemPrompt, refinedMessage, history);
      
      let toolExecuted: string | null = null;
      let toolData: any = null;
      let finalResponseText = initialLLMResponse;

      // Extract JSON using robust bracket-matching and auto-repair algorithm
      const cleanResponse = initialLLMResponse.trim();
      const jsonBlock = this.extractJsonBlock(cleanResponse);

      if (jsonBlock && jsonBlock.includes('"tool"')) {
        if (!allowDbTools) {
          this.logger.warn(`AI attempted to execute tool "${jsonBlock}" but database tools are disabled for this query.`);
          toolExecuted = null;
          toolData = null;
          finalResponseText = finalResponseText.replace(jsonBlock, '').trim();
          if (!finalResponseText) {
            finalResponseText = "I am here! How can I help you with our ERP operations, tasks, or properties?";
          }
        } else {
          try {
            const parsed = JSON.parse(jsonBlock);
            if (parsed.tool) {
              toolExecuted = parsed.tool;
              // 1. Primary Domain Classification
              let domain: 'HR' | 'Finance' | 'Property' | 'Sales' | 'Logistics' = 'HR';
              const tLower = parsed.tool.toLowerCase();
              if (tLower.includes('property')) {
                domain = 'Property';
              } else if (tLower.includes('client') || tLower.includes('lead')) {
                domain = 'Sales';
              } else if (tLower.includes('finance')) {
                domain = 'Finance';
              } else if (tLower.includes('logistics')) {
                domain = 'Logistics';
              } else if (parsed.tool === 'runDatabaseQuery') {
                const qLower = (parsed.params?.query || '').toLowerCase();
                if (qLower.includes('payroll') || qLower.includes('salary')) {
                  domain = 'Finance';
                } else if (qLower.includes('property') || qLower.includes('owner')) {
                  domain = 'Property';
                } else if (qLower.includes('client') || qLower.includes('lead')) {
                  domain = 'Sales';
                } else if (qLower.includes('vehicle') || qLower.includes('logistics') || qLower.includes('driver')) {
                  domain = 'Logistics';
                }
              }

              const agents: AgentOutput[] = [];
              
              // 2. Execute Primary Domain Agent (Rule 3)
              const primaryAgentOutput = await this.executeDomainAgent(domain, parsed.tool, parsed.params, organizationId, userRole, userId);
              agents.push(primaryAgentOutput);
              toolData = primaryAgentOutput.records;

              // 3. Proactive Cross-Department Intelligence check (Rule 7 & 8)
              const msgLower = (userMessage + ' ' + refinedMessage).toLowerCase();
              if (domain === 'HR' && (msgLower.includes('salary') || msgLower.includes('payroll') || msgLower.includes('paisa') || msgLower.includes('tankhaw') || msgLower.includes('finance'))) {
                try {
                  const financeOutput = await this.executeDomainAgent('Finance', 'getFinanceAnalytics', {}, organizationId, userRole, userId);
                  if (financeOutput && !financeOutput.records.error) {
                    agents.push(financeOutput);
                  }
                } catch (e) {
                  this.logger.warn(`Proactive Cross-Department Finance trigger failed: ${e.message}`);
                }
              }

              if (domain === 'Property' && (msgLower.includes('client') || msgLower.includes('buyer') || msgLower.includes('investor') || msgLower.includes('lead') || msgLower.includes('sales'))) {
                try {
                  const salesOutput = await this.executeDomainAgent('Sales', 'searchClients', {}, organizationId, userRole, userId);
                  if (salesOutput && !salesOutput.records.error) {
                    agents.push(salesOutput);
                  }
                } catch (e) {
                  this.logger.warn(`Proactive Cross-Department Sales trigger failed: ${e.message}`);
                }
              }

              if (domain === 'HR' && (msgLower.includes('vehicle') || msgLower.includes('driver') || msgLower.includes('fleet') || msgLower.includes('logistics'))) {
                try {
                  const logisticsOutput = await this.executeDomainAgent('Logistics', 'getLogisticsAnalytics', {}, organizationId, userRole, userId);
                  if (logisticsOutput && !logisticsOutput.records.error) {
                    agents.push(logisticsOutput);
                  }
                } catch (e) {
                  this.logger.warn(`Proactive Cross-Department Logistics trigger failed: ${e.message}`);
                }
              }

              // 4. Run Multi-Agent Consensus and Alignment Layer (Rule 3 & 6)
              const consensusReport = await this.runConsensusAndAlignment(agents, refinedMessage, history);
              
              // Strict Database Verification Interceptor & Error Handling (Rule 1, 2, 5 & 6)
              if (toolExecuted === 'createTask' || toolExecuted === 'updateTask') {
                if (!toolData || (toolData as any).error || (toolData as any).success === false || (toolExecuted === 'createTask' && !(toolData as any).task?.id)) {
                  this.logger.error(`Strict Verification Interceptor: Task action failed or could not be verified in Postgres!`);
                  return {
                    response: "Task could not be verified in the system. Please try again.",
                    toolExecuted,
                    toolData: toolData || { error: 'DATABASE_SYNC_FAILURE' },
                    citations: [],
                  };
                }
              }

              if (toolExecuted === 'updateLeadStatus') {
                if (!toolData || (toolData as any).error || (toolData as any).success === false) {
                  this.logger.error(`Strict Verification Interceptor: Lead status update failed or could not be verified in Postgres!`);
                  return {
                    response: "Lead status update could not be verified in the system. Please try again.",
                    toolExecuted,
                    toolData: toolData || { error: 'DATABASE_SYNC_FAILURE' },
                    citations: [],
                  };
                }
              }

              // Re-prompt LLM with the live database results
              const isTaskAssignmentIntent = /assign|task|zimadari|kaam|duty/i.test(userMessage + ' ' + refinedMessage);
              
              let extraInstructions = '';
              if (toolExecuted === 'searchEmployees' && isTaskAssignmentIntent) {
                // Reset toolExecuted for rendering to hide raw employee profile cards
                toolExecuted = null;
                
                extraInstructions = `
CRITICAL CORE WORKFLOW INSTRUCTION:
- The user's core intent is TASK ASSIGNMENT, NOT generic employee search. The employee search was called internally only to verify their existence and retrieve their profile.
- You MUST prioritize the TASK CREATION FLOW. Do NOT ask unrelated questions like "Would you like me to list their designations?" or "Should I check their shift records?".
- Do NOT display profile cards or focus on listing details unless explicitly requested.
- Instead, naturally continue the task creation workflow: warmly inform the user that the employee was found, and ask for:
  1. Task details / title
  2. Deadline (due date)
  3. Priority (standard / high / urgent)
- Make it sound human and highly focused (e.g. "I found Muhammad Aizaz Khan from Human Resources. What task would you like me to assign to him?").`;
              }

              const databaseFeedPrompt = `The user asked: "${userMessage}" (Context resolved: "${refinedMessage}")
You triggered the tool "${parsed.tool}" and retrieved the following live real-time records from Postgres:
${JSON.stringify(toolData, null, 2)}

MULTI-AGENT CONSENSUS & VALIDATION LAYER DETAILS (Rule 3, 4 & 6):
- Combined System Confidence Rating: ${consensusReport.overallConfidence * 100}%
- Aligned Cross-Department Insights:
${consensusReport.alignedInsights.map(i => `  * ${i}`).join('\n') || '  * None'}
- Logical Contradictions Resolved:
${consensusReport.contradictionsResolved.map(c => `  * ${c}`).join('\n') || '  * None'}
- Proactive Business Actions & Recommendations:
${consensusReport.proactiveActions.map(a => `  * ${a}`).join('\n') || '  * None'}
${consensusReport.reducedCertaintyWarning ? `- REDUCED CERTAINTY WARNING (Low Confidence): ${consensusReport.reducedCertaintyWarning}` : ''}

Provide a beautiful, friendly, completely human-like natural language response summarizing these results.
CRITICAL REAL ESTATE INTELLIGENCE & STYLE INSTRUCTIONS:
1. STRICTLY FORBID RAW DATABASE DUMPS: Never print raw, bare lists of database fields or JSON records. You must analyze the records, aggregate them, compute trends, detect rankings, and draw smart business conclusions.
   - Example: Instead of just listing properties, say "3 properties are unsold for 45+ days in the Downtown area."
2. PROACTIVE ANALYTICS MODE: You must actively look for and point out:
   - Slow-moving or stagnant properties (stagnant/available for a long time).
   - Overloaded employees (e.g., holding many active PENDING/IN_PROGRESS tasks).
   - High-performing agents (e.g., high lead-to-sale conversion rates or completed tasks).
   - Inactive clients or leads (e.g., stage is INQUIRY for a long time or not contacted recently).
   - Suggest direct, professional, decision-ready actions for the above (e.g. suggesting reassigning listing/tasks, marking lists as discount, making calls).
3. SILENT MULTI-AGENT ORCHESTRATION (UI/UX RULE): All multi-agent delegation, domain routing, and department-specific reasoning MUST run silently behind the scenes in your thoughts. You MUST NEVER output any operational logs, delegating markers (such as "[Orchestrator] ➔ ..."), or direct agent dialogue quotes in the final response. The user must ONLY receive the polished, unified, decision-ready final business insight directly. Banish all background operational chatter from the visible response!
4. STRICT LANGUAGE MATCHING: You MUST answer in the EXACT same language as the user's message.
   - If the user wrote in English, you MUST answer in English.
   - If the user wrote in Urdu script, you MUST answer in Urdu script.
   - If the user wrote in Roman Urdu, you MUST answer in Roman Urdu.
   - If the user wrote in Persian, Russian, or Turkish, your response MUST be in that exact language.
   - **CRITICAL: NEVER begin your response with any translation notice, language note, or prefix declaring the language choice (e.g. do NOT write 'Here is the response in...'). Directly start your answer.**
5. NO FILLER OR UAC CHATTER: Do NOT write any filler phrases, authorization notices (e.g., 'Aapka profile cleared hai'), database check updates (e.g. 'Maine check kiya'), or greetings. Answer the user's question directly and concisely!
6. CONCISE & DIRECT: Only answer what the user asked about. Summarize the key values in a brief, premium way.
6. Speak completely like a warm, supportive, and friendly human colleague.
7. AVOID cold robotic bullet dumps or double asterisks on every single item. Instead, present details in a premium, beautifully spaced, clean human-style layout. Use elegant spacing, emojis (like 📅, 👤, 📍, 👥, 🚫), and friendly bullet highlights. Make the text look highly readable, natural, and visually premium. At the end of your response, politely add 1 or 2 natural, contextual follow-up question suggestions to guide them nicely (e.g. "Would you like me to show their salary breakdown?" or "Should I check their active viewings?").${extraInstructions}
8. If the results contain properties, summarize their occupancy, location trends, pricing changes, or listing age nicely.
9. If the results contain employees or salaries, summarize their performance metrics, payroll trends, or workload balances nicely.
10. If the results contain meetings or attendees, summarize who hosted them, who was present, who was absent, and lists of participants nicely.
11. If the results contain attendance records, summarize their daily statuses, check-in/check-out logs, and total worked hours timeline nicely.
12. If the results contain generic SQL rows from "runDatabaseQuery", analyze and present the joins, aggregates, rankings, or trends dynamically, and describe the dynamic visualization chart plotted below nicely.
13. If no records are found, inform the user politely.`;

              finalResponseText = await this.callLLM(systemPrompt, databaseFeedPrompt, history);
            }
          } catch (e) {
            this.logger.error(`Failed to parse tool execution JSON: ${e.message}. Raw Block: ${jsonBlock}`);
          }
        }
      }

      // Format citations for the client
      const citations = matchingChunks.map((chunk) => ({
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        fileType: chunk.fileType,
      }));

      // Post-process the response to strip any lingering translation disclaimers/preambles that the LLM might hallucinate
      let cleanedText = finalResponseText.trim();

      // UI/UX Silent Orchestration Rule: Strip background orchestrator logs and agent dialogue quotes programmatically
      // Step 1: Strip delegation log blocks ending with "Orchestrator:" label
      cleanedText = cleanedText.replace(/(?:\[?Orchestrator\]?|\*Orchestrator\*)\s*➔\s*Delegating[\s\S]*?(?:Orchestrator\s*(?:\(Main\s*Brain\))?\s*(?:AI)?\s*:\s*|Orchestrator:\s*)/gi, '');

      // Step 2: Strip any lingering agent dialogue blocks with quotes
      cleanedText = cleanedText.replace(/👥?\s*(?:HR|Finance|Property|Sales|Logistics|Orchestrator)\s+Agent:\s*["'].*?["']/gi, '');

      // Step 3: Strip any single-line delegation logs or headers that remain
      cleanedText = cleanedText.replace(/(?:\[?Orchestrator\]?|\*Orchestrator\*)\s*➔\s*Delegating[^\n]*/gi, '');
      cleanedText = cleanedText.replace(/👥?\s*(?:HR|Finance|Property|Sales|Logistics|Orchestrator)\s+Agent:\s*[^\n]*/gi, '');

      // Clean up multiple newlines or spaces created by deletions
      cleanedText = cleanedText.replace(/\n{2,}/g, '\n\n').trim();
      
      // Strict Tone Consistency: Eliminate Urdu slang and informal terms like "bhai" or "yaar" (Rule 4)
      cleanedText = cleanedText
        .replace(/\b(bhai|yaar|dost|bande)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      const preambles = [
        "Here's the response in the exact same language as the user's message:",
        "Here's the response in the same language as the user's message:",
        "Here is the response in the exact same language as the user's message:",
        "Here is the response in the same language as the user's message:",
        "Here's the response in the exact same language as the user's query:",
        "Here is the response in the exact same language as the user's query:",
        "Here is the response in the exact same language as the user's:",
        "Here's the response in the exact same language as the user's:"
      ];

      for (const preamble of preambles) {
        if (cleanedText.toLowerCase().startsWith(preamble.toLowerCase())) {
          cleanedText = cleanedText.substring(preamble.length).trim();
        }
      }

      // If the remaining text starts with the user's query echoed in quotes, strip it
      if (cleanedText.startsWith('"') || cleanedText.startsWith("'")) {
        const quoteChar = cleanedText[0];
        const nextQuote = cleanedText.indexOf(quoteChar, 1);
        if (nextQuote !== -1 && nextQuote < 200) {
          cleanedText = cleanedText.substring(nextQuote + 1).trim();
          // Clean potential leading colons or newlines
          if (cleanedText.startsWith(':')) {
            cleanedText = cleanedText.substring(1).trim();
          }
        }
      }

      return {
        response: cleanedText,
        toolExecuted,
        toolData,
        citations,
      };
    } catch (err) {
      this.logger.error(`Error in Chat Pipeline: ${err.message}`);
      return {
        response: '🤖 AI Assistant has encountered an operation pipeline conflict. Let\'s try rephrasing your prompt.',
        toolExecuted: null,
        toolData: null,
        citations: [],
      };
    }
  }
}
