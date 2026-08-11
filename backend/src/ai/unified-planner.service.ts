import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiLlmService } from './ai-llm.service';
import { SCHEMA_REGISTRY } from './database-pipeline.service';
import { buildTableCatalogue } from './schema-registry';
import { IntentObject, CognitiveGatewayOutput } from './cognitive-gateway.service';
import { ExecutionPlan, PlanNode } from './planning-engine.service';

export interface UnifiedPlanResult {
  gateway: CognitiveGatewayOutput;
  intent: IntentObject;
  plan: ExecutionPlan;
  _meta: {
    llmCalls: number;
    fastPath: string | null;
    latencyMs: number;
  };
}

/**
 * Replaces three sequential LLM calls (Cognitive Gateway -> Query Understanding ->
 * Planning Engine) with one.
 *
 * Those three layers all read the same inputs — the user's message, the history,
 * the workspace state — and each produced one slice of a single decision: what did
 * the user mean, and what should we go fetch. Splitting that across three round
 * trips tripled the latency and gave each stage a lossy summary of the last, so a
 * mistake in normalisation silently corrupted the plan downstream.
 *
 * Cheap intents (greetings, help, thanks) never reach the model at all — they are
 * matched deterministically, which takes a whole class of queries from ~4s to ~0ms.
 */
@Injectable()
export class UnifiedPlannerService {
  private readonly logger = new Logger(UnifiedPlannerService.name);

  constructor(
    private prisma: PrismaService,
    private llmService: AiLlmService
  ) {}

  // ---------------------------------------------------------------------------
  // Deterministic fast paths
  // ---------------------------------------------------------------------------

  /**
   * Matches queries that provably need no data retrieval. Kept deliberately tight:
   * a false positive here means a real question gets answered as small talk, which
   * is far worse than paying for one LLM call. Anything with a business noun in it
   * falls through to the model.
   */
  private detectFastPath(message: string): 'CONVERSATIONAL' | 'SYSTEM_HELP' | null {
    const q = message.toLowerCase().trim().replace(/[!?.،,]+$/g, '');

    // Bail out if the message references anything we could look up.
    const businessTerms = /\b(propert|listing|lead|client|agent|employee|staff|task|salary|payroll|attendance|leave|revenue|sales|report|invoice|vehicle|owner|meeting|tenant|commission|target|expense|budget|contract|policy|document|kitne|kitna|dikhao|batao|list|show|find|how many|total)\b/i;
    if (businessTerms.test(q)) return null;

    const greetings = [
      'hi', 'hii', 'hello', 'hey', 'yo', 'salam', 'salaam', 'assalam o alaikum',
      'assalamualaikum', 'aoa', 'good morning', 'good afternoon', 'good evening',
      'kya haal hai', 'kaise ho', 'kaisay ho', 'how are you', 'whats up',
      'thanks', 'thank you', 'shukriya', 'thx', 'ok', 'okay', 'theek hai',
      'bye', 'goodbye', 'allah hafiz', 'khuda hafiz',
      'test', 'testing', 'mic check', 'hello?',
    ];
    if (greetings.includes(q)) return 'CONVERSATIONAL';
    if (q.length <= 24 && greetings.some(g => q === g || q.startsWith(g + ' '))) return 'CONVERSATIONAL';

    const helpPatterns = [
      /^(what can you do|what do you do|help|kya kar sakte ho|kya karta hai|aap kya kar sakte)/i,
      /^(who are you|tum kaun ho|ap kon ho)/i,
      /^(commands?|features?|capabilities)$/i,
    ];
    if (helpPatterns.some(p => p.test(q))) return 'SYSTEM_HELP';

    return null;
  }

  /**
   * Compact table catalogue for the planner: names, descriptions and synonyms.
   *
   * The planner chooses which tables to touch, not how to query them, so it never
   * needed column lists — sending the full registry cost ~2,800 tokens per request
   * and buried the signal. Column detail is injected later, scoped to the tables
   * actually selected.
   *
   * Synonyms come from the schema dictionary and are the reason this is worth the
   * tokens: they map how users actually speak ("real estate", "units", "inventory",
   * "personnel") onto table keys, which is exactly where entity selection used to
   * go wrong.
   */
  private buildTableCatalogue(): string {
    return buildTableCatalogue();
  }

  // ---------------------------------------------------------------------------
  // Main entry point
  // ---------------------------------------------------------------------------
  async planQuery(
    userMessage: string,
    userId: string,
    organizationId: string,
    userRole: string,
    history: { role: 'user' | 'model'; content: string }[],
    workspaceState: any,
    opts: { allowFastPath?: boolean } = {}
  ): Promise<UnifiedPlanResult> {
    const allowFastPath = opts.allowFastPath !== false;
    const started = Date.now();
    const chatHistory = (history || []).slice(-6); // 12 was pure token cost; 6 turns is ample for pronoun resolution
    const nowIso = new Date().toISOString();

    const buildGateway = (query: string): CognitiveGatewayOutput => ({
      query,
      userRole,
      organizationId,
      userId,
      timestamp: nowIso,
      conversationContext: { history: chatHistory, workspaceState },
    });

    // --- Fast path: no model, no database ---
    const fastPath = allowFastPath ? this.detectFastPath(userMessage) : null;
    if (fastPath) {
      this.logger.log(`[Unified Planner] Fast path "${fastPath}" — skipping LLM entirely.`);
      return {
        gateway: buildGateway(userMessage),
        intent: {
          intent: fastPath,
          entities: {},
          classification: 'MEMORY_ONLY',
          complexity: 'low',
          confidence: 100,
        },
        plan: { nodes: [], edges: [], sensitiveAction: false, requiredRoles: [] },
        _meta: { llmCalls: 0, fastPath, latencyMs: Date.now() - started },
      };
    }

    // --- Single combined call ---
    let userName = 'Admin';
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      if (user) userName = `${user.firstName} ${user.lastName || ''}`.trim();
    } catch (e) {
      this.logger.warn(`Failed to fetch username for identity resolution: ${e.message}`);
    }

    const nowLabel = new Date().toLocaleString([], {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });

    const systemPrompt = `You are the Zorvex AI Query Planner. In ONE pass you must normalize the user's query, classify it, extract entities, and produce an execution plan.

=== CURRENT DATE & TIME ===
${nowLabel}
Resolve every relative date ("kal", "last month", "is hafte", "yesterday", "this quarter") against this timestamp into concrete ISO dates.

=== SESSION USER (authorization context ONLY — never use as a query filter) ===
Name: "${userName}"
Id: "${userId}"
Role: "${userRole}"

CRITICAL: The user's Role tells you what they are ALLOWED to see. It is NOT a search
filter. Never emit filters like {"role": "${userRole}"} unless the user explicitly
asked to filter by that role.

=== ACTIVE WORKSPACE STATE (for resolving "it", "that one", "usko", "iski") ===
${JSON.stringify(workspaceState || {}, null, 2).slice(0, 1200)}

=== RECENT CONVERSATION ===
${chatHistory.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.content.slice(0, 250)}`).join('\n') || '(none)'}

=== AVAILABLE TABLES ===
${this.buildTableCatalogue()}

=== AVAILABLE TOOLS ===
- SQL_ENGINE: structured data in Postgres. Emit EXACTLY ONE SQL_ENGINE node — push all filters into its params.filters. Never emit separate LIST/JOIN/FILTER nodes.
- RAG_ENGINE: unstructured documents, policies, handbooks, contracts. params: { "queryText": "..." }
- MEMORY_ENGINE: past observations from earlier conversations.

=== YOUR TASKS ===
1. normalizedQuery: rewrite the raw query with pronouns and self-references resolved
   to real names, spelling cleaned, relative dates made concrete. KEEP the user's
   language (English / Roman Urdu / Urdu script) — do not translate.
2. intent: one of LOOKUP, ANALYTICS, COMPOSITE, ACTION, TREND, REPORTING, POLICY,
   COMPARISON, FORECAST, MIXED, CONVERSATIONAL, SYSTEM_HELP.
3. entities: extract dates, regions, communities, properties, agents, departments,
   customers, projects, revenueMetrics. Omit empty arrays.
4. classification: DOCUMENT_ONLY, DATABASE_ONLY, MEMORY_ONLY, or HYBRID —
   which retrieval pipeline(s) are actually required.
5. confidence: 0-100. Be strict; lower it when the query is ambiguous or
   key details are missing.
6. nodes: the execution plan. Use lowercase table keys from the list above in
   params.entities. For SQL_ENGINE, params.operation is "fetch" or "aggregate".
7. sensitiveAction: true when the request touches salary, payroll, bonus,
   termination, or moves money.

Respond with ONLY this JSON object — no prose, no markdown fences:
{
  "normalizedQuery": "string",
  "intent": "LOOKUP",
  "entities": { "agents": [], "dates": [] },
  "classification": "DATABASE_ONLY",
  "complexity": "low|medium|high",
  "confidence": 90,
  "nodes": [
    { "id": "step_1", "type": "LIST|COUNT|AUDIT", "description": "...", "tool": "SQL_ENGINE",
      "params": { "operation": "fetch", "entities": ["property"], "filters": {} } }
  ],
  "sensitiveAction": false
}`;

    let parsed: any = null;
    try {
      const raw = await this.llmService.callLLM(
        systemPrompt,
        `Raw query: "${userMessage}"`,
        [],
        false,
        organizationId,
        userId,
        { jsonMode: true, maxTokens: 1200 }
      );
      parsed = this.llmService.extractJson(raw);
    } catch (err) {
      this.logger.error(`[Unified Planner] LLM call failed: ${err.message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      this.logger.warn('[Unified Planner] Falling back to deterministic plan.');
      return {
        ...this.buildDeterministicFallback(userMessage, buildGateway(userMessage)),
        _meta: { llmCalls: 1, fastPath: null, latencyMs: Date.now() - started },
      };
    }

    const normalizedQuery = (parsed.normalizedQuery || '').trim() || userMessage;

    const intent: IntentObject = {
      intent: parsed.intent || 'LOOKUP',
      subIntents: parsed.subIntents,
      executionMode: parsed.executionMode,
      aggregationStrategy: parsed.aggregationStrategy,
      entities: parsed.entities || {},
      classification: parsed.classification || 'DATABASE_ONLY',
      complexity: parsed.complexity || 'medium',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 70,
    };

    const plan = this.normalizePlan(parsed, normalizedQuery, intent);

    this.logger.log(
      `[Unified Planner] 1 LLM call: intent=${intent.intent} class=${intent.classification} ` +
      `confidence=${intent.confidence} nodes=${plan.nodes.length} (${Date.now() - started}ms)`
    );

    return {
      gateway: buildGateway(normalizedQuery),
      intent,
      plan,
      _meta: { llmCalls: 1, fastPath: null, latencyMs: Date.now() - started },
    };
  }

  // ---------------------------------------------------------------------------
  // Plan normalization & guardrails
  // ---------------------------------------------------------------------------
  private normalizePlan(parsed: any, query: string, intent: IntentObject): ExecutionPlan {
    const validTables = new Set(Object.keys(SCHEMA_REGISTRY.tables));
    const seen = new Set<string>();
    const nodes: PlanNode[] = [];
    let sqlNodeCount = 0;

    for (const raw of (parsed.nodes || [])) {
      if (nodes.length >= 5) break;
      if (!raw?.tool) continue;

      const node: PlanNode = {
        id: raw.id || `step_${nodes.length + 1}`,
        type: raw.type || 'LIST',
        description: raw.description || `Retrieval for: ${query}`,
        tool: raw.tool,
        params: raw.params || {},
      };

      if (node.tool === 'SQL_ENGINE') {
        // Push-down design: exactly one SQL node. Extra ones were the main source
        // of duplicated queries and contradictory row sets during fusion.
        if (sqlNodeCount >= 1) continue;

        const entities: string[] = Array.isArray(node.params.entities) ? node.params.entities : [];
        const clean = entities
          .map((e: string) => String(e).toLowerCase().trim())
          .filter((e: string) => validTables.has(e));

        if (clean.length === 0) {
          // The model named tables that do not exist — recover with the keyword
          // heuristic rather than emitting a query that is guaranteed to fail.
          clean.push(this.deduceEntityFromQuery(query));
        }

        node.params.entities = clean;
        if (!node.params.operation) node.params.operation = 'fetch';
        if (!node.params.filters) node.params.filters = {};
        sqlNodeCount++;
      }

      if (node.tool === 'RAG_ENGINE' && !node.params.queryText) {
        node.params.queryText = query;
      }

      const sig = `${node.tool}_${JSON.stringify(node.params)}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      nodes.push(node);
    }

    // The classification and the plan must agree. If the model said it needs the
    // database but emitted no SQL node (or vice versa), the request would silently
    // retrieve nothing — so repair it here.
    const hasSql = nodes.some(n => n.tool === 'SQL_ENGINE');
    const hasRag = nodes.some(n => n.tool === 'RAG_ENGINE');

    if (!hasSql && (intent.classification === 'DATABASE_ONLY' || intent.classification === 'HYBRID')) {
      nodes.unshift({
        id: 'step_sql',
        type: 'LIST',
        description: `Database retrieval for: ${query}`,
        tool: 'SQL_ENGINE',
        params: { operation: 'fetch', entities: [this.deduceEntityFromQuery(query)], filters: {} },
      });
    }
    if (!hasRag && (intent.classification === 'DOCUMENT_ONLY' || intent.classification === 'HYBRID')) {
      nodes.push({
        id: 'step_rag',
        type: 'AUDIT',
        description: `Document retrieval for: ${query}`,
        tool: 'RAG_ENGINE',
        params: { queryText: query },
      });
    }

    const lower = query.toLowerCase();
    const sensitiveByKeyword = /\b(salary|payroll|bonus|terminate|termination|increment|compensation|tankhwa)\b/i.test(lower);

    return {
      nodes,
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      sensitiveAction: Boolean(parsed.sensitiveAction) || sensitiveByKeyword,
      requiredRoles: Array.isArray(parsed.requiredRoles) ? parsed.requiredRoles : [],
    };
  }

  private buildDeterministicFallback(
    query: string,
    gateway: CognitiveGatewayOutput
  ): Omit<UnifiedPlanResult, '_meta'> {
    const lower = query.toLowerCase();
    let intentName: IntentObject['intent'] = 'LOOKUP';
    let classification: IntentObject['classification'] = 'DATABASE_ONLY';

    if (/\b(policy|rule|guideline|contract|handbook|sop)\b/i.test(lower)) {
      intentName = 'POLICY';
      classification = 'DOCUMENT_ONLY';
    } else if (/\b(compare|vs|versus|target)\b/i.test(lower)) {
      intentName = 'COMPARISON';
      classification = 'HYBRID';
    } else if (/\b(how many|count|total|kitne|kitna|average|sum)\b/i.test(lower)) {
      intentName = 'ANALYTICS';
    }

    const tool = classification === 'DOCUMENT_ONLY' ? 'RAG_ENGINE' as const : 'SQL_ENGINE' as const;

    return {
      gateway,
      intent: {
        intent: intentName,
        entities: {},
        classification,
        complexity: 'medium',
        // Deliberately below the 85 confidence gate downstream: this path means the
        // planner failed, and the answer should be treated as low-trust.
        confidence: 60,
      },
      plan: {
        nodes: [{
          id: 'step_1',
          type: 'DIRECT_RETRIEVAL',
          description: 'Deterministic fallback retrieval',
          tool,
          params: tool === 'RAG_ENGINE'
            ? { queryText: query }
            : { operation: 'fetch', entities: [this.deduceEntityFromQuery(query)], filters: {} },
        }],
        edges: [],
        sensitiveAction: /\b(salary|terminate|payroll)\b/i.test(lower),
        requiredRoles: [],
      },
    };
  }

  /** Keyword -> table heuristic. Mirrors PlanningEngineService.deduceEntityFromQuery. */
  private deduceEntityFromQuery(query: string): string {
    const q = query.toLowerCase();
    if (q.includes('leave') || q.includes('chutti') || q.includes('vacation')) return 'leaverequest';
    if (q.includes('attendance') || q.includes('hazri') || q.includes('late') || q.includes('absent') || q.includes('present')) return 'attendance';
    if (q.includes('payroll') || q.includes('salary') || q.includes('tankhwa') || q.includes('pay')) return 'payroll';
    if (q.includes('vehicle') || q.includes('gari') || q.includes('car')) {
      if (q.includes('maintenance') || q.includes('repair') || q.includes('kharcha')) return 'vehiclemaintenance';
      return 'vehicle';
    }
    if (q.includes('maintenance') || q.includes('repair')) return 'vehiclemaintenance';
    if (q.includes('logistics') || q.includes('delivery') || q.includes('route')) return 'logisticsschedule';
    if (q.includes('owner') || q.includes('landlord') || q.includes('malik')) return 'owner';
    if (q.includes('viewing') || q.includes('visit') || q.includes('dikhana')) return 'clientviewing';
    if (q.includes('event') || q.includes('meeting') || q.includes('calendar')) return 'calendarevent';
    if (q.includes('performance') || q.includes('appraisal') || q.includes('rating')) return 'performancereview';
    if (q.includes('task') || q.includes('todo') || q.includes('checklist')) return 'task';
    if (q.includes('lead')) return 'lead';
    if (q.includes('client') || q.includes('buyer') || q.includes('investor') || q.includes('budget')) return 'client';
    if (q.includes('employee') || q.includes('staff') || q.includes('agent') || q.includes('designation')) return 'employeeprofile';
    return 'property';
  }
}
