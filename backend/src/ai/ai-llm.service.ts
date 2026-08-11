import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AsyncLocalStorage } from 'async_hooks';

// Bulletproof require for pdf-parse to avoid TypeScript build issues
const pdfParser = require('pdf-parse');

export interface LlmCallAccount {
  calls: number;
  totalMs: number;
  models: string[];
}

@Injectable()
export class AiLlmService {
  private readonly logger = new Logger(AiLlmService.name);

  /**
   * Per-request LLM call accounting.
   *
   * The pipeline's cost and latency are dominated by how many times it talks to the
   * model, and that number was previously invisible — the calls were spread across a
   * dozen services, so nothing reported that one question triggered a dozen round
   * trips.
   *
   * AsyncLocalStorage rather than a requestId parameter: the counter then works
   * without threading an id through every intermediate service, and stays correct
   * when requests overlap.
   */
  private static readonly callContext = new AsyncLocalStorage<LlmCallAccount>();

  constructor(private prisma: PrismaService) {}

  /** Runs `fn` with LLM call accounting active, returning the result and the tally. */
  async withCallAccounting<T>(fn: () => Promise<T>): Promise<{ result: T; account: LlmCallAccount }> {
    const account: LlmCallAccount = { calls: 0, totalMs: 0, models: [] };
    const result = await AiLlmService.callContext.run(account, fn);
    return { result, account };
  }

  /** Current tally, if accounting is active for this async context. */
  getCallAccount(): LlmCallAccount | undefined {
    return AiLlmService.callContext.getStore();
  }

  private recordCall(model: string, ms: number): void {
    const account = AiLlmService.callContext.getStore();
    if (!account) return;
    account.calls++;
    account.totalMs += ms;
    account.models.push(model);
  }

  private async logApiUsage(
    organizationId: string | undefined,
    userId: string | undefined,
    serviceName: string,
    modelName: string,
    type: 'TEXT_GENERATION' | 'EMBEDDING',
    promptLength: number,
    completionLength: number
  ) {
    if (!organizationId) return;
    
    // Estimate tokens: roughly 1 token per 4 characters
    const promptTokens = Math.ceil(promptLength / 4);
    const completionTokens = Math.ceil(completionLength / 4);
    const totalTokens = promptTokens + completionTokens;

    try {
      await this.prisma.apiUsageLog.create({
        data: {
          organizationId,
          userId,
          serviceName,
          modelName,
          type,
          promptTokens,
          completionTokens,
          totalTokens,
          requestCount: 1
        }
      });
    } catch (err) {
      this.logger.error(`[ApiUsageLog] Failed to log API usage: ${err.message}`);
    }
  }

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
    const url = process.env.LOCAL_LLM_URL || 'https://openrouter.ai/api/v1';
    return url.replace(/^["']|["']$/g, '').trim();
  }

  getLocalLlmModel(): string {
    const model = process.env.LOCAL_LLM_MODEL || 'meta-llama/llama-3.3-70b-instruct';
    return model.replace(/^["']|["']$/g, '').trim();
  }

  // Stronger tier used when a caller passes forceCloud — SQL generation, executive
  // reasoning and RAG answer synthesis are the calls that actually justify the cost.
  getStrongLlmModel(): string {
    const model = process.env.STRONG_LLM_MODEL || process.env.LOCAL_LLM_MODEL || 'deepseek/deepseek-chat';
    return model.replace(/^["']|["']$/g, '').trim();
  }

  getFallbackModel(): string {
    const model = process.env.LLM_FALLBACK_MODEL || 'deepseek/deepseek-chat';
    return model.replace(/^["']|["']$/g, '').trim();
  }

  getTimeoutMs(): number {
    const raw = parseInt(process.env.LLM_TIMEOUT_MS || '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 20000;
  }

  // -----------------------------------------------------------------------------
  // Embedding configuration — ONE model, ONE dimension, everywhere.
  //
  // Mixing providers here silently corrupts the index: a 768-dim query vector
  // compared against 3072-dim stored vectors produces meaningless scores rather
  // than an error. So the model and its dimension are pinned together and every
  // writer/reader must agree.
  // -----------------------------------------------------------------------------
  getEmbeddingProvider(): 'ollama' | 'gemini' | 'openai' {
    const p = (process.env.EMBEDDING_PROVIDER || 'ollama').toLowerCase();
    if (p === 'gemini' || p === 'openai') return p;
    return 'ollama';
  }

  getEmbeddingModel(): string {
    const explicit = process.env.EMBEDDING_MODEL || process.env.LOCAL_LLM_EMBEDDING_MODEL;
    if (explicit) return explicit.replace(/^["']|["']$/g, '').trim();
    switch (this.getEmbeddingProvider()) {
      case 'gemini': return 'text-embedding-004';
      case 'openai': return 'text-embedding-3-small';
      default: return 'nomic-embed-text';
    }
  }

  // Must match the vector(N) column width in the database.
  getEmbeddingDimensions(): number {
    const raw = parseInt(process.env.EMBEDDING_DIMENSIONS || '', 10);
    if (Number.isFinite(raw) && raw > 0) return raw;
    switch (this.getEmbeddingProvider()) {
      case 'gemini': return 768;   // text-embedding-004
      case 'openai': return 1536;  // text-embedding-3-small
      default: return 768;         // nomic-embed-text
    }
  }

  // Ollama exposes an OpenAI-compatible /v1 surface; embeddings live on the native API.
  getOllamaUrl(): string {
    const url = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
    return url.replace(/^["']|["']$/g, '').replace(/\/+$/, '').trim();
  }

  getLocalLlmEmbeddingModel(): string {
    return this.getEmbeddingModel();
  }

  // -----------------------------------------------------------------------------
  // Helpers: Local Model Connection Helpers
  // -----------------------------------------------------------------------------
  async callLocalLLM(
    systemPrompt: string,
    userPrompt: string,
    history: { role: 'user' | 'model'; content: string }[] = [],
    opts: { model?: string; jsonMode?: boolean; maxTokens?: number; timeoutMs?: number } = {}
  ): Promise<string> {
    const localUrl = this.getLocalLlmUrl();
    const localModel = opts.model || this.getLocalLlmModel();
    const openrouterKey = this.getOpenRouterKey();
    const budgetMs = opts.timeoutMs ?? this.getTimeoutMs();

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
      headers['X-Title'] = 'Zorvex ERP Chatbot';
    }

    const body: Record<string, any> = {
      model: localModel,
      messages,
      temperature: 0.1,
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (opts.jsonMode) body.response_format = { type: 'json_object' };

    const attempts = 3;
    const baseDelayMs = 600;
    let lastError: Error | null = null;

    for (let i = 0; i < attempts; i++) {
      try {
        const response = await fetch(`${localUrl}/chat/completions`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(budgetMs),
          body: JSON.stringify(body),
        });

        if (response.ok) {
          const data = await response.json();
          const text = data?.choices?.[0]?.message?.content;
          if (text) {
            this.logger.log(`Successfully generated completion via Local/OpenRouter LLM (${localModel})`);
            return text;
          }
          lastError = new Error('LLM returned an empty completion.');
        } else {
          const errData = await response.json().catch(() => null);
          const errorMsg = errData?.error?.message || errData?.error?.metadata?.raw || `Status ${response.status}`;
          lastError = new Error(`OpenRouter Error: ${errorMsg}`);

          // Only 429 / 5xx are worth retrying; a 400 or 401 will fail identically.
          const isRetryable = response.status === 429 || response.status >= 500;
          if (!isRetryable) throw lastError;

          this.logger.warn(`OpenRouter transient error (${response.status}): ${errorMsg}. Attempt ${i + 1}/${attempts}.`);
        }
      } catch (err) {
        if (err.message?.startsWith('OpenRouter Error:')) throw err;
        lastError = err;
        this.logger.warn(`OpenRouter/Local LLM attempt ${i + 1}/${attempts} failed: ${err.message}`);
      }

      if (i < attempts - 1) {
        const jitter = Math.floor(Math.random() * 250);
        await new Promise(resolve => setTimeout(resolve, baseDelayMs * Math.pow(2, i) + jitter));
      }
    }

    throw lastError ?? new Error('Local/OpenRouter LLM failed after maximum retry attempts.');
  }

  // Embeddings via Ollama's native endpoint. OpenRouter does NOT serve /embeddings,
  // so pointing this at LOCAL_LLM_URL was guaranteed to fail on every call.
  async generateLocalEmbedding(text: string): Promise<number[] | null> {
    const embeddingModel = this.getEmbeddingModel();
    const expectedDims = this.getEmbeddingDimensions();

    try {
      const response = await fetch(`${this.getOllamaUrl()}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ model: embeddingModel, prompt: text }),
      });

      if (response.ok) {
        const data = await response.json();
        const embedding = data?.embedding;
        if (Array.isArray(embedding) && embedding.length > 0) {
          if (embedding.length !== expectedDims) {
            // Loud failure: writing this would corrupt the index for every future query.
            this.logger.error(
              `[Embedding DIMENSION MISMATCH] ${embeddingModel} returned ${embedding.length} dims, ` +
              `EMBEDDING_DIMENSIONS is ${expectedDims}. Refusing to use this vector.`
            );
            return null;
          }
          return embedding;
        }
      } else {
        this.logger.warn(`Ollama embedding failed with status ${response.status}.`);
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

    history = history || [];
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
  // Throws on failure by design. The previous behaviour — returning a 3072-dim
  // zero vector — silently poisoned the index: every zero-vector chunk is
  // equidistant from every query, so it pollutes results forever and the upload
  // that caused it reports success. A hard failure is recoverable; bad data is not.
  async generateEmbedding(
    text: string,
    organizationId?: string,
    userId?: string
  ): Promise<number[]> {
    if (!text.trim()) {
      throw new Error('Cannot embed empty text.');
    }

    const provider = this.getEmbeddingProvider();
    const model = this.getEmbeddingModel();
    const expectedDims = this.getEmbeddingDimensions();

    const validate = (vec: any): number[] | null => {
      if (!Array.isArray(vec) || vec.length === 0) return null;
      if (vec.length !== expectedDims) {
        this.logger.error(
          `[Embedding DIMENSION MISMATCH] ${provider}/${model} returned ${vec.length} dims but ` +
          `EMBEDDING_DIMENSIONS=${expectedDims}. Fix the config or re-index; refusing this vector.`
        );
        return null;
      }
      if (vec.every((v: number) => v === 0)) {
        this.logger.error('[Embedding] Provider returned an all-zero vector. Refusing it.');
        return null;
      }
      return vec;
    };

    if (provider === 'ollama') {
      const local = await this.generateLocalEmbedding(text);
      const ok = validate(local);
      if (ok) {
        await this.logApiUsage(organizationId, userId, 'Ollama', model, 'EMBEDDING', text.length, 0);
        return ok;
      }
      throw new Error(
        `Embedding failed: Ollama (${model}) at ${this.getOllamaUrl()} is unreachable or returned ` +
        `an unusable vector. Start Ollama and run: ollama pull ${model}`
      );
    }

    if (provider === 'gemini') {
      const geminiKey = this.getGeminiKey();
      if (!geminiKey) throw new Error('EMBEDDING_PROVIDER=gemini but GEMINI_API_KEY is not set.');
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text }] } }),
        }
      );
      if (!response.ok) {
        throw new Error(`Gemini embedding (${model}) failed with status ${response.status}.`);
      }
      const data = await response.json();
      const ok = validate(data?.embedding?.values);
      if (!ok) throw new Error(`Gemini embedding (${model}) returned an unusable vector.`);
      await this.logApiUsage(organizationId, userId, 'Gemini', model, 'EMBEDDING', text.length, 0);
      return ok;
    }

    const openaiKey = this.getOpenAIKey();
    if (!openaiKey) throw new Error('EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set.');
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ input: text, model }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI embedding (${model}) failed with status ${response.status}.`);
    }
    const data = await response.json();
    const ok = validate(data?.data?.[0]?.embedding);
    if (!ok) throw new Error(`OpenAI embedding (${model}) returned an unusable vector.`);
    await this.logApiUsage(organizationId, userId, 'OpenAI', model, 'EMBEDDING', text.length, 0);
    return ok;
  }

  // Batch variant — one HTTP round trip per chunk is what made a 50-page PDF take
  // minutes. Concurrency is bounded so we don't stampede the provider.
  async generateEmbeddingsBatch(
    texts: string[],
    organizationId?: string,
    userId?: string,
    concurrency = 8
  ): Promise<number[][]> {
    const out: number[][] = new Array(texts.length);
    for (let i = 0; i < texts.length; i += concurrency) {
      const slice = texts.slice(i, i + concurrency);
      const vectors = await Promise.all(
        slice.map(t => this.generateEmbedding(t, organizationId, userId))
      );
      vectors.forEach((v, j) => { out[i + j] = v; });
    }
    return out;
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

  public cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA?.length || !vecB?.length) return 0;

    // Truncating to the shorter vector (the old behaviour) turns a config error
    // into plausible-looking garbage scores. Mismatched dimensions mean the two
    // vectors came from different models and are not comparable at all.
    if (vecA.length !== vecB.length) {
      this.logger.error(
        `[cosineSimilarity] Dimension mismatch: ${vecA.length} vs ${vecB.length}. ` +
        `Vectors are from different embedding models — re-index required. Scoring as 0.`
      );
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
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
  /**
   * Hybrid semantic + keyword search over indexed document chunks.
   *
   * Previously this did `findMany()` with no limit — pulling every chunk for the
   * tenant, each carrying a 768-float array, across the wire to Neon — then scored
   * them in JavaScript. Both halves of the score are now computed in Postgres
   * against the HNSW and GIN indexes, so only the top `limit` rows are transferred.
   */
  async searchUnstructuredKnowledge(
    query: string,
    organizationId: string,
    limit = 5
  ): Promise<any[]> {
    try {
      const queryVector = await this.generateEmbedding(query, organizationId);
      const vectorString = `[${queryVector.join(',')}]`;

      return await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT c.id, c.content, c."documentId",
               d.name AS "documentName", d."fileType",
               -- Same 0.7 semantic / 0.3 keyword blend as before, evaluated in SQL.
               (0.7 * (1 - (c.embedding <=> $1::vector))
                + 0.3 * LEAST(ts_rank_cd(to_tsvector('simple', c.content),
                                         plainto_tsquery('simple', $2)), 1.0)) AS score
        FROM "AiDocumentChunk" c
        JOIN "AiDocument" d ON c."documentId" = d.id
        WHERE d."organizationId" = $3
          AND c.embedding IS NOT NULL
          AND (0.7 * (1 - (c.embedding <=> $1::vector))
               + 0.3 * LEAST(ts_rank_cd(to_tsvector('simple', c.content),
                                        plainto_tsquery('simple', $2)), 1.0)) > 0.25
        ORDER BY score DESC
        LIMIT $4
      `, vectorString, query, organizationId, limit);
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
    history: { role: 'user' | 'model'; content: string }[] = [],
    forceCloud = false,
    organizationId?: string,
    userId?: string,
    opts: { jsonMode?: boolean; maxTokens?: number; timeoutMs?: number } = {}
  ): Promise<string> {
    history = history || [];
    const totalPromptLength = systemPrompt.length + userPrompt.length + history.reduce((sum, h) => sum + h.content.length, 0);

    // forceCloud used to be accepted and then ignored, so every caller that asked
    // for the strong tier (SQL generation, RAG synthesis, executive reasoning)
    // silently got the small model. Honour it now.
    const primaryModel = forceCloud ? this.getStrongLlmModel() : this.getLocalLlmModel();
    const fallbackModel = this.getFallbackModel();
    const startedAt = Date.now();

    try {
      const result = await this.callLocalLLM(systemPrompt, userPrompt, history, { ...opts, model: primaryModel });
      this.recordCall(primaryModel, Date.now() - startedAt);
      await this.logApiUsage(organizationId, userId, "OpenRouter", primaryModel, "TEXT_GENERATION", totalPromptLength, result.length);
      return result;
    } catch (primaryErr) {
      this.logger.warn(`Primary model (${primaryModel}) failed: ${primaryErr.message}.`);

      if (fallbackModel === primaryModel) {
        return `🤖 System Alert: Zorvex AI could not reach the language model. Details: ${primaryErr.message}`;
      }

      try {
        this.logger.warn(`Falling back to ${fallbackModel}...`);
        const result = await this.callLocalLLM(systemPrompt, userPrompt, history, { ...opts, model: fallbackModel });
        this.recordCall(fallbackModel, Date.now() - startedAt);
        await this.logApiUsage(organizationId, userId, "OpenRouter", fallbackModel, "TEXT_GENERATION", totalPromptLength, result.length);
        return result;
      } catch (fallbackErr) {
        this.logger.error(`Fallback model (${fallbackModel}) also failed: ${fallbackErr.message}`);
        return `🤖 System Alert: Zorvex AI could not reach the language model. Details: ${fallbackErr.message}`;
      }
    }
  }

  // -----------------------------------------------------------------------------
  // Robust JSON extraction for LLM output
  //
  // Small models wrap JSON in prose or markdown fences, and reasoning models emit
  // <think> blocks first. Every layer was re-implementing indexOf('{') by hand;
  // this centralises it so a parse failure is a caught, reportable event.
  // -----------------------------------------------------------------------------
  extractJson<T = any>(raw: string): T | null {
    if (!raw) return null;

    let text = raw.trim();
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    try {
      return JSON.parse(text) as T;
    } catch {
      // Fall through to bracket scanning.
    }

    // Scan for the first balanced {...} or [...], respecting string literals.
    for (const [open, close] of [['{', '}'], ['[', ']']] as const) {
      const start = text.indexOf(open);
      if (start === -1) continue;

      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === open) depth++;
        else if (ch === close) {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(text.substring(start, i + 1)) as T;
            } catch {
              break;
            }
          }
        }
      }
    }

    this.logger.warn(`[extractJson] Could not parse JSON from LLM output: ${raw.slice(0, 200)}`);
    return null;
  }
}
