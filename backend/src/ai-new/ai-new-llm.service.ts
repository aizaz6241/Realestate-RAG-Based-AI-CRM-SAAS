import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from './observability/observability.service';

@Injectable()
export class AiNewLlmService {
  private readonly logger = new Logger(AiNewLlmService.name);

  constructor(
    private prisma: PrismaService,
    private observabilityService: ObservabilityService
  ) {}

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
  getOpenRouterKey(): string {
    const key = process.env.OPENROUTER_API_KEY || '';
    return key.replace(/^["']|["']$/g, '').trim();
  }

  getLocalLlmUrl(): string {
    const url = process.env.LOCAL_LLM_URL || 'https://openrouter.ai/api/v1';
    return url.replace(/^["']|["']$/g, '').trim();
  }

  getLocalLlmModel(): string {
    const model = process.env.LOCAL_LLM_MODEL || 'meta-llama/llama-3.3-70b-instruct';
    return model.replace(/^["']|["']$/g, '').trim();
  }

  getFallbackModel(): string {
    const model = process.env.LLM_FALLBACK_MODEL || 'deepseek/deepseek-chat';
    return model.replace(/^["']|["']$/g, '').trim();
  }

  // Per-call budget. Keeps a single hung provider from stalling the whole request.
  getTimeoutMs(): number {
    const raw = parseInt(process.env.LLM_TIMEOUT_MS || '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 20000;
  }

  // -----------------------------------------------------------------------------
  // Helpers: Local Model Connection Helpers
  // -----------------------------------------------------------------------------
  async callOpenRouterModel(
    systemPrompt: string,
    userPrompt: string,
    history: { role: 'user' | 'model'; content: string }[] = [],
    modelOverride?: string,
    timeoutMs?: number,
    opts: { jsonMode?: boolean; maxTokens?: number } = {}
  ): Promise<{ text: string, provider: string }> {
    const localUrl = this.getLocalLlmUrl();
    const localModel = modelOverride || this.getLocalLlmModel();
    const openrouterKey = this.getOpenRouterKey();
    const budgetMs = timeoutMs ?? this.getTimeoutMs();

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
    // Structured output where the provider supports it — removes most JSON parse failures.
    if (opts.jsonMode) body.response_format = { type: 'json_object' };

    // 3 attempts with exponential backoff. Rate limits (429) and 5xx are the
    // common failure mode on shared inference endpoints, and both are transient.
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

          if (data?.usage) {
            const totalTokens = data.usage.total_tokens || 0;
            // Dummy cost estimate for tracking (e.g., $0.001 per 1k tokens)
            const estimatedCost = (totalTokens / 1000) * 0.001;
            this.observabilityService.recordLlmUsage(totalTokens, estimatedCost);
          }

          if (text) {
            this.logger.log(`Successfully generated completion via Local/OpenRouter LLM (${localModel})`);
            return { text, provider: localModel };
          }
          lastError = new Error('LLM returned an empty completion.');
        } else {
          const errData = await response.json().catch(() => null);
          const errorMsg = errData?.error?.message || errData?.error?.metadata?.raw || `Status ${response.status}`;
          lastError = new Error(`OpenRouter Error: ${errorMsg}`);

          // 4xx other than 429 is a bad request / bad key — retrying cannot help.
          const isRetryable = response.status === 429 || response.status >= 500;
          if (!isRetryable) throw lastError;

          this.logger.warn(`OpenRouter transient error (${response.status}): ${errorMsg}. Attempt ${i + 1}/${attempts}.`);
        }
      } catch (err) {
        // AbortError means we blew the per-call budget; treat as retryable but
        // do not let retries multiply the wall clock beyond the caller's patience.
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

  // -----------------------------------------------------------------------------
  // Resilient LLM Text Generation with Qwen / DeepSeek
  // -----------------------------------------------------------------------------
  async callLLM(
    systemPrompt: string,
    userPrompt: string,
    history: { role: 'user' | 'model'; content: string }[] = [],
    forceCloud = false,
    organizationId?: string,
    userId?: string,
    opts: { jsonMode?: boolean; maxTokens?: number; timeoutMs?: number } = {}
  ): Promise<{ text: string, provider: string }> {
    history = history || [];
    const totalPromptLength = systemPrompt.length + userPrompt.length + history.reduce((sum, h) => sum + h.content.length, 0);

    const primaryModel = this.getLocalLlmModel();
    const fallbackModel = this.getFallbackModel();
    const budgetMs = opts.timeoutMs ?? this.getTimeoutMs();

    try {
      this.logger.log(`Attempting to use primary model: ${primaryModel}`);
      const result = await this.callOpenRouterModel(systemPrompt, userPrompt, history, primaryModel, budgetMs, opts);
      await this.logApiUsage(organizationId, userId, "OpenRouter", primaryModel, "TEXT_GENERATION", totalPromptLength, result.text.length);
      return result;
    } catch (primaryErr) {
      this.logger.warn(`Primary model (${primaryModel}) failed: ${primaryErr.message}. Falling back to ${fallbackModel}...`);

      if (fallbackModel === primaryModel) throw primaryErr;

      try {
        const fallbackResult = await this.callOpenRouterModel(systemPrompt, userPrompt, history, fallbackModel, budgetMs, opts);
        await this.logApiUsage(organizationId, userId, "OpenRouter", fallbackModel, "TEXT_GENERATION", totalPromptLength, fallbackResult.text.length);
        return fallbackResult;
      } catch (fallbackErr) {
        this.logger.error(`Fallback model (${fallbackModel}) also failed: ${fallbackErr.message}`);
        return {
          text: `🤖 System Alert: Zorvex AI encountered an error while connecting to the LLM providers. Details: ${fallbackErr.message}`,
          provider: "System Error"
        };
      }
    }
  }
}
