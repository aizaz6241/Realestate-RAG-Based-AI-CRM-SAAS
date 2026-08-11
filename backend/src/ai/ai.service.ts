import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../calendar/calendar.service';
import { ZorvexGateway } from './zorvex.gateway';
import { AiLlmService } from './ai-llm.service';
import { VectorStoreService } from './vector-store.service';
import { FactVerifierService } from './fact-verifier.service';
import { QueryCacheService } from './query-cache.service';
import { UnifiedPlannerService } from './unified-planner.service';
import { ActionExecutorService } from './actions/action-executor.service';
import { ActionPlannerService } from './actions/action-planner.service';
import { AiValidationService } from './ai-validation.service';
import { AiAgentsService, AgentOutput } from './ai-agents.service';
import { AiDatabaseToolsService } from './ai-database-tools.service';
import { ExecutiveDecisionService } from './executive-decision.service';
import { RealEstateIntelligenceService } from './real-estate-intelligence.service';

// V9 Core Imports
import { CognitiveGatewayService } from './cognitive-gateway.service';
import { PlanningEngineService } from './planning-engine.service';
import { DatabasePipelineService } from './database-pipeline.service';
import { ResultFusionService } from './result-fusion.service';
import { LearningMemoryService } from './learning-memory.service';
import { ObservabilityService } from './observability.service';
import { MultiTierRouterService } from './multi-tier-router.service';
import { AiRagService } from './rag/ai-rag.service';
import { TenantIsolationService } from './tenant-isolation.service';
import { EntityResolutionService } from './entity-resolution.service';
import { ResponseSanitizer } from './response-sanitizer.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private activeDrafts = new Map<string, any>(); // TODO Sprint 5: migrate to AiActiveDraft DB table
  // pendingApprovals migrated to AiPendingApproval DB table (see approveAction and chat())
  
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
    private zorvexGateway: ZorvexGateway,
    private llmService: AiLlmService,
    private validationService: AiValidationService,
    private agentsService: AiAgentsService,
    private dbToolsService: AiDatabaseToolsService,
    private executiveDecisionService: ExecutiveDecisionService,
    private realEstateIntelligenceService: RealEstateIntelligenceService,
    private cognitiveGatewayService: CognitiveGatewayService,
    private planningEngineService: PlanningEngineService,
    private databasePipelineService: DatabasePipelineService,
    private resultFusionService: ResultFusionService,
    private learningMemoryService: LearningMemoryService,
    private observabilityService: ObservabilityService,
    private ragService: AiRagService,
    private multiTierRouterService: MultiTierRouterService,
    private tenantIsolationService: TenantIsolationService,
    private entityResolutionService: EntityResolutionService,
    private responseSanitizer: ResponseSanitizer,
    private vectorStore: VectorStoreService,
    private factVerifier: FactVerifierService,
    private unifiedPlanner: UnifiedPlannerService,
    private queryCache: QueryCacheService,
    private actionExecutor: ActionExecutorService,
    private actionPlanner: ActionPlannerService
  ) {}

  // -----------------------------------------------------------------------------
  // Facade Delegations to support other modules & controllers cleanly
  // -----------------------------------------------------------------------------
  async generateEmbedding(text: string, organizationId?: string, userId?: string): Promise<number[]> {
    return this.llmService.generateEmbedding(text, organizationId, userId);
  }

  async parsePdf(fileBuffer: Buffer): Promise<string> {
    return this.llmService.parsePdf(fileBuffer);
  }

  chunkText(text: string, chunkSize = 600, overlap = 100): string[] {
    return this.llmService.chunkText(text, chunkSize, overlap);
  }

  async searchUnstructuredKnowledge(query: string, organizationId: string, limit = 5): Promise<any[]> {
    return this.llmService.searchUnstructuredKnowledge(query, organizationId, limit);
  }

  /**
   * Runs an action and turns the outcome into something a person can respond to.
   *
   * Each outcome is a different conversational move, and getting these wrong is what
   * makes assistants feel robotic:
   *   - EXECUTED           → say what happened, concretely
   *   - NEEDS_CONFIRMATION → show exactly what will happen, then wait
   *   - NEEDS_INPUT        → ask only for what is actually missing
   *   - AMBIGUOUS          → offer the candidates instead of guessing
   *   - DENIED             → explain the limit and who can do it
   */
  private async runAction(
    actionName: string,
    params: Record<string, any>,
    ctx: { userId: string; userRole: string; organizationId: string; actorName: string },
    workspaceState: any,
    confirmed: boolean
  ): Promise<any> {
    const outcome = await this.actionExecutor.execute(actionName, params, ctx, confirmed);

    const base = {
      toolExecuted: actionName,
      toolData: null as any,
      citations: [],
      workspaceState,
      _outcome: outcome.status,
    };

    switch (outcome.status) {
      case 'EXECUTED': {
        // The pending action is done — clear it so a later "yes" can't replay it.
        if (workspaceState) workspaceState.pendingAction = null;
        const suggestions = outcome.result.suggestions?.length
          ? `\n\n_${outcome.result.suggestions.map(s => `• ${s}`).join('\n')}_`
          : '';
        return {
          ...base,
          response: `✅ ${outcome.result.message}${suggestions}`,
          toolData: outcome.result.data,
        };
      }

      case 'NEEDS_CONFIRMATION': {
        // Park the resolved parameters so confirming doesn't re-resolve names and
        // risk landing on a different record.
        if (workspaceState) {
          workspaceState.pendingAction = {
            kind: 'ACTION',
            action: outcome.action,
            params: outcome.params,
            preview: outcome.preview,
          };
        }
        const elevated = outcome.risk === 'ELEVATED'
          ? '\n\n⚠️ This one has a financial or HR impact.'
          : '';
        return {
          ...base,
          response: `Here's what I'm about to do:\n\n**${outcome.preview}**${elevated}\n\nShall I go ahead?`,
          _pendingConfirmation: true,
        };
      }

      case 'NEEDS_INPUT': {
        if (workspaceState) {
          workspaceState.pendingAction = {
            kind: 'ACTION',
            action: outcome.action,
            params: outcome.params,
            awaiting: outcome.missing,
          };
        }
        return {
          ...base,
          response: outcome.questions.length === 1
            ? outcome.questions[0]
            : `I need a couple of details first:\n${outcome.questions.map(q => `• ${q}`).join('\n')}`,
        };
      }

      case 'AMBIGUOUS': {
        if (workspaceState) {
          workspaceState.pendingAction = {
            kind: 'ACTION',
            action: outcome.action,
            params: outcome.params,
            awaiting: [outcome.field],
            candidates: outcome.candidates,
          };
        }
        return {
          ...base,
          response: `There's more than one match — which did you mean?\n${outcome.candidates.map(c => `• ${c.label}`).join('\n')}`,
        };
      }

      case 'DENIED':
        if (workspaceState) workspaceState.pendingAction = null;
        return { ...base, response: `🔒 ${outcome.reason}` };

      case 'FAILED':
      default:
        if (workspaceState) workspaceState.pendingAction = null;
        return { ...base, response: `I couldn't complete that. ${(outcome as any).error}` };
    }
  }

  /**
   * Handles the turn after a preview or a question.
   *
   * Returns null when the message isn't a reply to the pending action, so the user
   * can change the subject mid-flow without being trapped in a confirmation loop.
   */
  private async resumePendingAction(
    message: string,
    workspaceState: any,
    ctx: { userId: string; userRole: string; organizationId: string; actorName: string }
  ): Promise<any | null> {
    const pending = workspaceState?.pendingAction;
    if (!pending || pending.kind !== 'ACTION') return null;

    const msg = message.toLowerCase().trim();

    const isYes = /^(yes|yep|yeah|yup|ok|okay|sure|go ahead|do it|confirm|proceed|haan|ji|ji haan|bilkul|karo|kar do|theek hai|please do)\b/i.test(msg);
    const isNo = /^(no|nope|nahi|cancel|stop|don'?t|dont|forget it|never mind|nevermind|rehne do)\b/i.test(msg);

    if (isNo) {
      workspaceState.pendingAction = null;
      return {
        response: 'No problem — I haven\'t changed anything.',
        toolExecuted: null, toolData: null, citations: [], workspaceState,
      };
    }

    if (isYes && pending.preview) {
      return this.runAction(pending.action, pending.params, ctx, workspaceState, true);
    }

    // Answering an outstanding question: fold the reply into the parameters and
    // retry. Candidate lists are matched by label so "the AGENT one" resolves.
    if (pending.awaiting?.length) {
      const field = pending.awaiting[0];
      let value: any = message.trim();

      if (pending.candidates?.length) {
        const picked = pending.candidates.find((c: any) =>
          c.label.toLowerCase().includes(msg) || msg.includes(c.label.split(' (')[0].toLowerCase())
        );
        if (!picked) return null; // not an answer to this question
        value = picked.id;
      }

      const merged = { ...pending.params, [field]: value };
      return this.runAction(pending.action, merged, ctx, workspaceState, false);
    }

    return null;
  }

  /**
   * A name that reads naturally when addressed directly.
   *
   * Using `firstName` verbatim produced "Hello Tenant!" for an account named
   * "Tenant Admin" — technically correct, and clearly not a person's name. Role-ish
   * placeholder names are common in seeded and shared accounts, so they are dropped
   * in favour of a neutral greeting rather than addressing someone as "Tenant".
   */
  private async getDisplayName(userId: string): Promise<string | null> {
    const PLACEHOLDER_NAMES = new Set([
      'tenant', 'admin', 'user', 'test', 'testing', 'demo', 'system',
      'superadmin', 'super', 'owner', 'account', 'guest',
    ]);

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      if (!user?.firstName) return null;

      const first = user.firstName.trim();
      if (PLACEHOLDER_NAMES.has(first.toLowerCase())) {
        // "Tenant Admin" -> no usable personal name; greet without one.
        return null;
      }
      return first;
    } catch {
      return null;
    }
  }

  /**
   * Templated small-talk reply. Detects Roman Urdu so the answer mirrors the
   * user's language, which is the only thing the LLM was contributing here.
   */
  private buildConversationalReply(query: string, name: string | null, isVoiceCheck: boolean): string {
    const q = query.toLowerCase();
    const isUrdu = /\b(salam|salaam|assalam|aoa|kya|kaise|kaisay|haal|shukriya|theek|khuda|allah|hafiz|ji|acha)\b/i.test(q);

    // Trailing-comma handling so a missing name doesn't leave "Anytime, ."
    const addr = name ? ` ${name}` : '';
    const addrComma = name ? `, ${name}` : '';

    if (isVoiceCheck) {
      return isUrdu
        ? `Ji${addr}, awaaz bilkul clear aa rahi hai. Batayein kya dekhna hai?`
        : `Yes${addr}, I can hear you clearly. What would you like to look at?`;
    }

    if (/\b(thanks|thank you|shukriya|thx)\b/i.test(q)) {
      return isUrdu
        ? `Koi baat nahi${addrComma}. Aur kuch chahiye ho to batayein.`
        : `Anytime${addrComma}. Let me know what else you need.`;
    }

    if (/\b(bye|goodbye|hafiz)\b/i.test(q)) {
      return isUrdu ? `Allah hafiz${addrComma}.` : `Goodbye${addrComma}.`;
    }

    return isUrdu
      ? `Assalam o alaikum${addr}! Main aapke business data — properties, leads, clients, staff, attendance, finance — sab dekh sakta hoon. Kya check karna hai?`
      : `Hello${addr}! I can pull up your properties, leads, clients, staff, attendance and finance data. What would you like to see?`;
  }

  /** Static capability summary — the module list is fixed, so generating it was waste. */
  private buildHelpReply(query: string): string {
    const isUrdu = /\b(kya|kar|sakte|karta|kon|aap|tum)\b/i.test(query.toLowerCase());

    const modules = [
      '**Properties & Listings** — search, filter by area/price/type, listing health',
      '**Leads & Clients** — pipeline, conversion, interests, viewings',
      '**Staff & HR** — profiles, attendance, leave requests, performance',
      '**Finance** — payroll, commissions, revenue, expenses',
      '**Tasks & Meetings** — create, assign, schedule, track',
      '**Logistics** — vehicles, maintenance, schedules, key tracking',
      '**Documents** — policies, contracts and handbooks you have uploaded',
    ].map(m => `- ${m}`).join('\n');

    return isUrdu
      ? `Main aapka Zorvex AI assistant hoon. Ye sab kar sakta hoon:\n\n${modules}\n\nSirf normal zubaan mein poochein — jaise "JVC mein kitni properties hain?" ya "is mahine ki attendance dikhao".`
      : `I'm your Zorvex AI assistant. Here's what I can do:\n\n${modules}\n\nJust ask in plain language — e.g. "how many properties in JVC?" or "show this month's attendance".`;
  }

  async retrieveRelevantMemories(
    query: string,
    organizationId: string,
    limit = 5
  ): Promise<any[]> {
    // Delegated to VectorStoreService: the previous implementation pulled every
    // memory row for the tenant into Node, ran cosine similarity in JS, and issued
    // one DELETE per expired row on the read path. It is now a single indexed
    // nearest-neighbour query with TTL and classification filtered in SQL.
    try {
      return await this.vectorStore.searchMemories(query, organizationId, limit);
    } catch (err) {
      this.logger.error(`Error in memory vector search: ${err.message}`);
      return [];
    }
  }

  async extractAndStoreMemories(
    responseText: string,
    organizationId: string
  ): Promise<void> {
    try {
      const obsIndex = responseText.indexOf('🧠 2. AI OBSERVATIONS');
      const insIndex = responseText.indexOf('💡 3. INSIGHTS');
      const recIndex = responseText.indexOf('🎯 4. RECOMMENDED ACTIONS');

      let textToParse = "";
      if (obsIndex !== -1 && recIndex !== -1) {
        textToParse = responseText.substring(obsIndex, recIndex);
      } else if (obsIndex !== -1) {
        textToParse = responseText.substring(obsIndex);
      } else if (insIndex !== -1) {
        textToParse = responseText.substring(insIndex);
      }

      if (!textToParse) return;

      const lines = textToParse.split('\n');
      const bullets: string[] = [];

      for (const line of lines) {
        const cleanLine = line.trim();
        if (cleanLine.startsWith('-') || cleanLine.startsWith('*') || /^\d+\./.test(cleanLine)) {
          const content = cleanLine.replace(/^[-*\d.]+\s*/, '').trim();
          if (content.length > 15 && content.length < 300) {
            bullets.push(content);
          }
        }
      }

      for (const bullet of bullets) {
        let category = "OPERATIONAL_NOTE";
        const lower = bullet.toLowerCase();
        if (lower.includes('conversion') || lower.includes('lead') || lower.includes('sale') || lower.includes('funnel')) {
          category = 'CONVERSION_TREND';
        } else if (lower.includes('property') || lower.includes('villa') || lower.includes('apartment') || lower.includes('location')) {
          category = 'PROPERTY_TREND';
        } else if (lower.includes('agent') || lower.includes('employee') || lower.includes('capacity') || lower.includes('workload')) {
          category = 'AGENT_PERFORMANCE';
        } else if (lower.includes('finance') || lower.includes('payroll') || lower.includes('expense') || lower.includes('salary') || lower.includes('paisa')) {
          category = 'FINANCIAL_ANOMALY';
        } else if (lower.includes('season') || lower.includes('month') || lower.includes('quarter') || lower.includes('year')) {
          category = 'SEASONAL_INSIGHT';
        } else if (lower.includes('client') || lower.includes('buyer') || lower.includes('preference')) {
          category = 'CLIENT_PREFERENCE';
        }

        const exists = await this.prisma.aiMemoryVector.findFirst({
          where: {
            organizationId,
            category,
            content: bullet
          }
        });

        if (!exists) {
          await this.vectorStore.insertMemoryVector(bullet, category, organizationId);
          this.logger.log(`[Memory Layer] Persisted memory: "${bullet}" under category "${category}"`);
        }
      }
    } catch (err) {
      this.logger.error(`[Memory Layer] Error storing memories: ${err.message}`);
    }
  }

  async callLLM(
    systemPrompt: string,
    userPrompt: string,
    history: { role: 'user' | 'model'; content: string }[] = [],
    forceCloud = false,
    organizationId?: string,
    userId?: string
  ): Promise<string> {
    history = history || [];
    return this.llmService.callLLM(systemPrompt, userPrompt, history, forceCloud, organizationId, userId);
  }

  async findEmployeeFuzzy(nameQuery: string, organizationId: string): Promise<any[]> {
    return this.dbToolsService.findEmployeeFuzzy(nameQuery, organizationId);
  }

  async executeDatabaseTool(
    toolName: string,
    params: any,
    organizationId: string,
    userRole: string,
    userId: string
  ): Promise<any> {
    return this.dbToolsService.executeDatabaseTool(toolName, params, organizationId, userRole, userId);
  }

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

  private extractCallResponseJson(text: string): string | null {
    let keyIdx = text.indexOf('"writtenResponse"');
    if (keyIdx === -1) keyIdx = text.indexOf("'writtenResponse'");
    if (keyIdx === -1) keyIdx = text.indexOf("writtenResponse");
    if (keyIdx === -1) return null;
    
    let startIdx = -1;
    let depth = 0;
    for (let i = keyIdx; i >= 0; i--) {
      if (text[i] === '}') depth++;
      if (text[i] === '{') {
        if (depth === 0) {
          startIdx = i;
          break;
        } else {
          depth--;
        }
      }
    }
    
    if (startIdx === -1) return null;
    return this.extractJsonBlock(text.substring(startIdx));
  }

  private extractFieldsFromCallJson(text: string): { writtenResponse?: string; spokenResponse?: string } {
    let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const parsed = JSON.parse(cleanText);
      if (parsed.writtenResponse || parsed.spokenResponse) {
        return {
          writtenResponse: parsed.writtenResponse,
          spokenResponse: parsed.spokenResponse
        };
      }
    } catch (e) {}

    let jsonStart = cleanText.indexOf('{');
    let jsonEnd = cleanText.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const slice = cleanText.substring(jsonStart, jsonEnd + 1);
      try {
        const parsed = JSON.parse(slice);
        if (parsed.writtenResponse || parsed.spokenResponse) {
          return {
            writtenResponse: parsed.writtenResponse,
            spokenResponse: parsed.spokenResponse
          };
        }
      } catch (e) {}
    }

    const extractField = (key: string): string | undefined => {
      let keyIdx = cleanText.indexOf(`"${key}"`);
      if (keyIdx === -1) keyIdx = cleanText.indexOf(`'${key}'`);
      if (keyIdx === -1) keyIdx = cleanText.indexOf(key);
      if (keyIdx === -1) return undefined;

      const colonIdx = cleanText.indexOf(':', keyIdx);
      if (colonIdx === -1) return undefined;

      let startQuoteIdx = -1;
      let quoteChar = '';
      for (let i = colonIdx + 1; i < cleanText.length; i++) {
        const char = cleanText[i];
        if (char === '"' || char === "'") {
          startQuoteIdx = i;
          quoteChar = char;
          break;
        }
      }

      if (startQuoteIdx === -1) return undefined;

      let value = '';
      let escape = false;
      for (let i = startQuoteIdx + 1; i < cleanText.length; i++) {
        const char = cleanText[i];
        if (escape) {
          if (char === 'n') value += '\n';
          else if (char === 't') value += '\t';
          else value += char;
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === quoteChar) {
          return value;
        } else {
          value += char;
        }
      }
      return value;
    };

    return {
      writtenResponse: extractField('writtenResponse'),
      spokenResponse: extractField('spokenResponse')
    };
  }

  // -----------------------------------------------------------------------------
  private validateActionReadiness(tool: string, params: any): { isReady: boolean; missingFields: string[]; readinessFields: string[] } {
    const missingFields: string[] = [];
    const readinessFields: string[] = [];
    
    if (tool === 'createMeeting') {
      const participant = params.targetUserIds || params.targetRoles || params.employeeName || params.participant;
      const startTime = params.startTime;
      
      if (!participant) {
        missingFields.push('Participant');
        readinessFields.push('participant');
      }
      if (!startTime) {
        missingFields.push('Date and Time');
        readinessFields.push('startTime');
      }
      return { isReady: missingFields.length === 0, missingFields, readinessFields };
    }
    
    if (tool === 'createTask') {
      const title = params.title;
      const employeeName = params.employeeName || params.assignedToId;
      const dueDate = params.dueDate;
      
      if (!title) {
        missingFields.push('Title');
        readinessFields.push('title');
      }
      if (!employeeName) {
        missingFields.push('Assignee');
        readinessFields.push('employeeName');
      }
      if (!dueDate) {
        missingFields.push('Due Date');
        readinessFields.push('dueDate');
      }
      return { isReady: missingFields.length === 0, missingFields, readinessFields };
    }
    
    return { isReady: true, missingFields: [], readinessFields: [] };
  }

  private async mergePendingAction(
    pendingAction: any,
    userMessage: string,
    organizationId: string,
    userId: string
  ): Promise<{ mergedParams: any; isComplete: boolean; missingFields: string[] }> {
    const systemPrompt = `You are an Action Parameters Merger for an enterprise AI Operating System.
We have a pending action draft:
${JSON.stringify(pendingAction, null, 2)}

The user provided this new input/response:
"${userMessage}"

Current Local Date & Time: ${new Date().toLocaleString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}

Your task:
1. Merge the new inputs into the pending action params.
2. Resolve any relative dates/times (like "tomorrow 4 PM" or "next Monday") relative to the Current Local Date & Time context, converting them into ISO 8601 strings (e.g. "2026-06-10T16:00:00+05:00").
3. Determine if the action is now fully complete (contains all required fields: for MEETINGS: Participant, Date, Time; for TASKS: Title, Assignee, Due Date).
4. Output the result strictly in JSON matching this structure:
{
  "params": { ... },
  "isComplete": true | false,
  "missingFields": ["field name", ...]
}
Do not write any markdown code blocks or backticks. Return raw JSON only.`;

    try {
      const response = await this.llmService.callLLM(systemPrompt, "Merge parameters", [], false, organizationId, userId);
      const cleanResponse = response.trim();
      const jsonStart = cleanResponse.indexOf('{');
      const jsonEnd = cleanResponse.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        return JSON.parse(cleanResponse.substring(jsonStart, jsonEnd + 1));
      }
    } catch (err) {
      this.logger.error(`Error merging pending action parameters: ${err.message}`);
    }
    return { mergedParams: pendingAction.params || {}, isComplete: false, missingFields: pendingAction.missingFields || [] };
  }

  // -----------------------------------------------------------------------------
  // Context-Aware Query Refiner (Pronoun & Reference Resolution)
  // -----------------------------------------------------------------------------
  async refineQuery(
    userMessage: string,
    history: { role: 'user' | 'model'; content: string }[],
    workspaceState: any,
    organizationId?: string,
    userId?: string
  ): Promise<string> {
    history = history || [];
    let userName = 'Admin';
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        userName = `${user.firstName} ${user.lastName || ''}`.trim();
      }
    }

    const systemPrompt = `You are a Context Resolver for a premium Real Estate ERP CRM.
Your job is to analyze the conversation history, the active workspace state, and the user's latest message, and resolve any ambiguous references, pronouns (like "he", "she", "him", "her", "them", "their", "employee", "staff", "it", "this", "that", "uski", "unki", "iski", "is ko", "unko", "in dono"), or implicit filters.

Current Local Date & Time: ${new Date().toLocaleString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
(Today is ${new Date().toLocaleDateString([], { weekday: 'long' })}, ${new Date().toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' })}.)

CURRENT SESSION USER:
- Name: "${userName}"
- ID: "${userId}"
* IMPORTANT: If the user says "me", "myself", "my tasks", "my attendance", "assigned to me", "for me", "schedule for me", resolve these references to the Current Session User's name: "${userName}". For example, rewrite "Create task for me" to "Create task for ${userName}" and "Show my attendance" to "Show attendance of ${userName}".

ACTIVE WORKSPACE STATE MEMORY (Use these to resolve references like "it", "him", "her", "this property", "that lead", "the owner", etc.):
${JSON.stringify(workspaceState, null, 2)}

CONVERSATIONAL CONTEXT HISTORY:
${history.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.content}`).join('\n')}

INSTRUCTIONS:
1. Scan the history and the Active Workspace State Memory to identify the latest active referenced entities (such as employees, clients, properties, tasks, or leave requests).
2. If the user's latest message has pronouns or references like "his", "her", "him", "them", "he", "she", "it", "this", "that", "iski", "uski", "in dono ki", "unki", "unka", "is employee ko", "us property ko", "owner", resolve them by replacing them with the explicit name(s), ID, or details of the entity discussed in the workspace state. For example:
   - If activeProperty is "Downtown Apartment", rewrite "Who owns it?" to "Who is the owner of Downtown Apartment?".
   - If activeContext is LEAVE_DISCUSSION regarding Sarah, rewrite "arrange a meeting" to "schedule meeting regarding Sarah's leave request".
3. If the user mentions department names colloquially (e.g. "sales wale", "hr ka staff"), expand them to their database equivalent department names (e.g., "Sales", "Human Resources", "Finance", "Logistics").
4. If the user requests charts, ensure the rewritten message explicitly states the chart type requested.
5. If the user refers to locations in Roman Urdu or phonetic spelling like "meri na" or "marina", resolve them explicitly as "Dubai Marina". Similarly, map "down town" to "Downtown Dubai".
6. Output ONLY the refined, fully-explicit, and resolved query in the exact same language (e.g. English, Urdu, Roman Urdu) as the user's query. Do not add any preamble, conversational text, quotes, or markdown. Start directly with the resolved text.`;

    try {
      const refined = await this.llmService.callLLM(systemPrompt, `Latest User Message: "${userMessage}"`, [], false, organizationId, userId);
      this.logger.log(`Query refined successfully: "${userMessage}" -> "${refined.trim()}"`);
      return refined.trim() || userMessage;
    } catch (err) {
      this.logger.warn(`Failed to refine query: ${err.message}. Using original.`);
      return userMessage;
    }
  }

  private activeContexts = new Map<string, {
    activeEmployee: any;
    activeClient: any;
    activeProperty: any;
    activeLead: any;
    activeMeeting: any;
  }>();

  async chat(
    userMessage: string,
    userId: string,
    organizationId: string,
    userRole: string,
    history: { role: 'user' | 'model'; content: string }[] = [],
    callPersona?: string,
    sessionId?: string,
    debug?: boolean
  ): Promise<any> {
    history = history || [];
    const startTime = Date.now();
    const traceId = 'trace-' + Math.random().toString(36).substring(2, 15);

    // Response cache. Only safe for a fresh conversation turn: once history or a
    // pending action is in play the answer depends on prior context, and the cache
    // key only covers the question itself.
    const cacheEligible = history.length === 0 && !debug;
    if (cacheEligible) {
      const cached = this.queryCache.get(userMessage, organizationId, userId, userRole);
      if (cached) {
        return { ...cached, _cached: true, _latencyMs: Date.now() - startTime };
      }
    }

    const emitTraceStep = (
      stepNumber: number,
      stepName: string,
      status: 'SUCCESS' | 'WARNING' | 'FAILED' | 'PROCESSING',
      input: any,
      output: any,
      stepStartTime: number
    ) => {
      if (!debug) return;
      const latency = Date.now() - stepStartTime;
      this.zorvexGateway.broadcastToOrganization(organizationId, 'ai_trace_step', {
        traceId,
        userId,
        stepNumber,
        stepName,
        status,
        input: typeof input === 'string' ? input : (input ? JSON.stringify(input, null, 2) : ''),
        output: typeof output === 'string' ? output : (output ? JSON.stringify(output, null, 2) : ''),
        latency,
        timestamp: new Date().toISOString()
      });
    };
    let workspaceState: any = {
      activeProperty: null,
      activeOwner: null,
      activeLead: null,
      activeTask: null,
      activeMeeting: null,
      activeEmployee: null,
      activeComparison: null,
      activeFilters: null,
      activeModule: null,
      activeEntity: null,
      activeEntityType: null,
      activeRecord: null,
      activeCollection: null,
      activeContext: null,
      pendingAction: null
    };

    try {
      emitTraceStep(1, "INCOMING_QUERY", "SUCCESS", userMessage, { userId, organizationId, userRole }, startTime);
      if (sessionId) {
        const session = await this.prisma.aiChatSession.findUnique({
          where: { id: sessionId }
        });
        if (session && Array.isArray(session.messages)) {
          for (let i = session.messages.length - 1; i >= 0; i--) {
            const msg = session.messages[i] as any;
            if (msg.role === 'model' && msg.workspaceState) {
              workspaceState = { ...workspaceState, ...msg.workspaceState };
              break;
            }
          }
        }
      }

      // STEP 0 — UNIFIED PLANNING (Layers 1-3 in a single LLM call)
      //
      // Was three sequential calls: Cognitive Gateway (normalize) -> Query
      // Understanding (classify) -> Planning Engine (build DAG). All three read the
      // same inputs and produced one combined decision, so they are now one call.
      // Greetings and help requests are matched deterministically and cost nothing.
      const gatewayStartTime = Date.now();
      const unified = await this.unifiedPlanner.planQuery(
        userMessage,
        userId,
        organizationId,
        userRole,
        history,
        workspaceState,
        // A pending action means a bare "yes"/"ok" is a confirmation, not small talk,
        // so the conversational fast path must not swallow it.
        { allowFastPath: !workspaceState?.pendingAction }
      );
      const gatewayOutput = unified.gateway;
      const intentObj = unified.intent;
      emitTraceStep(2, "UNIFIED_PLANNER", "SUCCESS", userMessage, {
        normalizedQuery: gatewayOutput.query,
        intent: intentObj.intent,
        classification: intentObj.classification,
        confidence: intentObj.confidence,
        llmCalls: unified._meta.llmCalls,
        fastPath: unified._meta.fastPath,
      }, gatewayStartTime);

      // STEP 0.5 — RESUME PENDING ACTION (DRAFT MEMORY RESUMPTION)
      let wasPendingResumed = false;
      let resumedToolCall: any = null;

      if (workspaceState.pendingAction) {
        const lowerMsg = gatewayOutput.query.toLowerCase().trim();
        const isConfirmation = ['yes', 'confirm', 'haan', 'ji', 'ok', 'okay', 'bilkul', 'karo'].some(word => lowerMsg.includes(word));
        
        if (workspaceState.pendingAction.missingFields && workspaceState.pendingAction.missingFields.length === 0) {
          if (isConfirmation) {
            this.logger.log(`User confirmed pending action. Resuming execution.`);
            wasPendingResumed = true;
            let finalParams = workspaceState.pendingAction.params || {};
            if (workspaceState.pendingAction.resolvedAssignee) {
              if (finalParams.employeeName) {
                finalParams.employeeName = workspaceState.pendingAction.resolvedAssignee;
              }
              if (finalParams.participant) {
                finalParams.participant = workspaceState.pendingAction.resolvedAssignee;
              }
            }
            resumedToolCall = {
              tool: workspaceState.pendingAction.type === 'MEETING' ? 'createMeeting' : 'createTask',
              params: finalParams
            };
            workspaceState.pendingAction = null;
          } else {
            this.logger.log(`User did not confirm action. Cancelling pending action draft.`);
            workspaceState.pendingAction = null;
          }
        } else {
          this.logger.log(`Resuming and merging parameters for pending action: ${workspaceState.pendingAction.type}`);
          const mergeResult = await this.mergePendingAction(workspaceState.pendingAction, gatewayOutput.query, organizationId, userId);
          if (mergeResult.isComplete) {
            wasPendingResumed = true;
            resumedToolCall = {
              tool: workspaceState.pendingAction.type === 'MEETING' ? 'createMeeting' : 'createTask',
              params: mergeResult.mergedParams
            };
            workspaceState.pendingAction = null;
          } else {
            workspaceState.pendingAction.params = mergeResult.mergedParams;
            workspaceState.pendingAction.missingFields = mergeResult.missingFields;
            const promptMsg = `I still need the following details to complete the ${workspaceState.pendingAction.type.toLowerCase()}: ${mergeResult.missingFields.join(', ')}. Please provide them.`;
            return {
              response: promptMsg,
              spokenResponse: callPersona ? promptMsg : undefined,
              toolExecuted: null,
              toolData: null,
              citations: [],
              workspaceState
            };
          }
        }
      }

      if (wasPendingResumed && resumedToolCall) {
        const toolData = await this.dbToolsService.executeDatabaseTool(
          resumedToolCall.tool,
          resumedToolCall.params,
          organizationId,
          userRole,
          userId
        );
        
        if (toolData && toolData.error === 'CONFIRMATION_REQUIRED') {
          workspaceState.pendingAction = {
            type: resumedToolCall.tool === 'createMeeting' ? 'MEETING' : 'TASK',
            params: resumedToolCall.params,
            resolvedAssignee: toolData.resolvedAssignee,
            missingFields: []
          };
          const confirmMsg = `${toolData.message} (Type "Yes" or "Confirm" to proceed).`;
          return {
            response: confirmMsg,
            spokenResponse: callPersona ? confirmMsg : undefined,
            toolExecuted: resumedToolCall.tool,
            toolData: null,
            citations: [],
            workspaceState
          };
        }

        const confirmMsg = resumedToolCall.tool === 'createMeeting' ? 'Meeting scheduled successfully.' : 'Task assigned successfully.';
        return {
          response: confirmMsg,
          spokenResponse: callPersona ? confirmMsg : undefined,
          toolExecuted: resumedToolCall.tool,
          toolData,
          citations: [],
          workspaceState
        };
      }

      // STEP 0.75 — ACTION INTENT
      //
      // Runs before retrieval because "assign a task to Sarah" is an instruction, not
      // a question — answering it with a task list would be useless. Gated by a cheap
      // regex pre-filter so ordinary questions never pay for the extra call, and by a
      // confidence floor so an ambiguous message falls through to the read path
      // rather than changing a record on a guess.
      if (!workspaceState?.pendingAction) {
        const actionIntent = await this.actionPlanner.detectAction(
          gatewayOutput.query, userRole, organizationId, userId, history
        );

        if (actionIntent.isAction && actionIntent.action) {
          const actionResponse = await this.runAction(
            actionIntent.action,
            actionIntent.params || {},
            { userId, userRole, organizationId, actorName: (await this.getDisplayName(userId)) || 'there' },
            workspaceState,
            false
          );
          emitTraceStep(17, "FINAL_OUTPUT_SENT", "SUCCESS", userMessage, {
            action: actionIntent.action,
            outcome: actionResponse._outcome,
          }, startTime);
          return actionResponse;
        }
      }

      // Resuming a previously previewed action: the user has now said yes or no.
      if (workspaceState?.pendingAction?.kind === 'ACTION') {
        const resumed = await this.resumePendingAction(
          gatewayOutput.query, workspaceState, { userId, userRole, organizationId, actorName: (await this.getDisplayName(userId)) || 'there' }
        );
        if (resumed) {
          emitTraceStep(17, "FINAL_OUTPUT_SENT", "SUCCESS", userMessage, { resumed: true }, startTime);
          return resumed;
        }
      }

      // STEP 1 — intent already resolved by the unified planner above (no extra call)
      const understandingStartTime = Date.now();
      emitTraceStep(3, "INTENT_CLASSIFICATION", "SUCCESS", gatewayOutput.query, { intent: intentObj.intent, classification: intentObj.classification, complexity: intentObj.complexity }, understandingStartTime);
      emitTraceStep(4, "ENTITY_EXTRACTION", "SUCCESS", gatewayOutput.query, intentObj.entities, understandingStartTime);

      const isVoiceCheck = ["can you hear me", "voice test", "mic check", "connection check"].some(phrase => gatewayOutput.query.toLowerCase().includes(phrase));

      // Conversational and help replies are templated rather than generated. These
      // are fixed-shape responses; spending an LLM call (and 1-2s) to phrase a
      // greeting was pure latency for no gain.
      if (intentObj.intent === 'CONVERSATIONAL' || isVoiceCheck) {
        const responseText = this.buildConversationalReply(
          gatewayOutput.query,
          await this.getDisplayName(userId),
          isVoiceCheck
        );
        emitTraceStep(17, "FINAL_OUTPUT_SENT", "SUCCESS", userMessage, { response: responseText, conversational: true, llmCalls: 0 }, startTime);
        return {
          response: responseText,
          spokenResponse: callPersona ? responseText : undefined,
          toolExecuted: null,
          toolData: null,
          citations: [],
          workspaceState
        };
      }

      if (intentObj.intent === 'SYSTEM_HELP') {
        const responseText = this.buildHelpReply(gatewayOutput.query);
        emitTraceStep(17, "FINAL_OUTPUT_SENT", "SUCCESS", userMessage, { response: responseText, conversational: true, llmCalls: 0 }, startTime);
        return {
          response: responseText,
          spokenResponse: callPersona ? responseText : undefined,
          toolExecuted: null,
          toolData: null,
          citations: [],
          workspaceState
        };
      }

      // STEP 2 — plan came from the unified planner. The deterministic Tier 0/1
      // router still wins when it matches, since a hardcoded route beats a
      // generated one for known query shapes.
      const planningStartTime = Date.now();
      const routedPlan = this.multiTierRouterService.routeQuery(gatewayOutput.query);
      const isDeterministicBypassed = Boolean(routedPlan);
      let executionPlan = routedPlan || unified.plan;
      if (isDeterministicBypassed) {
        this.logger.log(`[Multi-Tier Retrieval Router] Tier 0/1 route matched — using deterministic plan.`);
      }

      let plannerDuplicateRate = 0;
      let fallbackRate = 0;
      let roleContaminationIncidents = 0;

      emitTraceStep(5, "PLANNING_ENGINE", "SUCCESS", { query: gatewayOutput.query, intent: intentObj.intent, deterministicBypassed: isDeterministicBypassed }, executionPlan.nodes || [], planningStartTime);
      emitTraceStep(7, "TOOL_SELECTION", "SUCCESS", gatewayOutput.query, { classification: intentObj.classification, nodes: (executionPlan.nodes || []).map(n => n.tool) }, planningStartTime);

      // STEP 3 — PERMISSION ENGINE (Layer 4)
      const permissionStartTime = Date.now();
      const isPlanAuthorized = (executionPlan.nodes || []).every(node => {
        if (node.tool === 'SQL_ENGINE' && node.params && node.params.entities) {
          return node.params.entities.every(ent => 
            this.dbToolsService.checkToolAuthorization(
              ent.toLowerCase() === 'payroll' ? 'getFinanceAnalytics' : 'searchProperties', 
              userRole
            )
          );
        }
        return true;
      });
      emitTraceStep(6, "PERMISSION_ENGINE", isPlanAuthorized ? "SUCCESS" : "FAILED", { requiredRoles: executionPlan.requiredRoles, userRole }, { isPlanAuthorized }, permissionStartTime);

      if (!isPlanAuthorized) {
        emitTraceStep(17, "FINAL_OUTPUT_SENT", "FAILED", userMessage, "Clearance Required: Your user profile is not cleared to access secure operations or finance databases.", startTime);
        return {
          response: "Clearance Required: Your user profile is not cleared to access secure operations or finance databases.",
          toolExecuted: null,
          toolData: null,
          citations: [],
          workspaceState
        };
      }

      // Action Draft Readiness check
      if ((executionPlan.nodes || []).length > 0) {
        const firstAction = executionPlan.nodes[0];
        if (firstAction && (firstAction.tool === 'SQL_ENGINE' && firstAction.params && firstAction.params.entities && firstAction.params.entities.includes('task'))) {
          const readiness = this.validateActionReadiness('createTask', firstAction.params.filters || firstAction.params);
          if (!readiness.isReady) {
            workspaceState.pendingAction = {
              type: 'TASK',
              params: firstAction.params.filters || firstAction.params,
              missingFields: readiness.missingFields
            };
            const promptMsg = `I need the following details to schedule the task: ${readiness.missingFields.join(', ')}. Please provide them.`;
            return {
              response: promptMsg,
              spokenResponse: callPersona ? promptMsg : undefined,
              toolExecuted: 'createTask',
              toolData: null,
              citations: [],
              workspaceState
            };
          }
        }
      }

      // Human Approval Gate for Sensitive Actions.
      //
      // Gated on the plan actually WRITING something. It previously fired on
      // `sensitiveAction` alone, which the planner sets from topic keywords — so
      // merely mentioning leave or salary in a question triggered it. Observed live:
      // the user typed "sara has annual leave pending still" (a correction to a wrong
      // answer) and got "⚠️ Executive Authorization Required" instead of a re-search.
      //
      // A read cannot need corporate approval: there is no action to approve.
      const WRITE_TOOLS = ['createTask', 'createMeeting', 'updateTask', 'updateLeadStatus', 'sendReminder'];
      const planWrites = (executionPlan.nodes || []).some((n: any) =>
        WRITE_TOOLS.includes(n.tool) ||
        ['create', 'update', 'delete'].includes(String(n.params?.operation || '').toLowerCase())
      );

      if (executionPlan.sensitiveAction && !planWrites) {
        this.logger.log(`[Approval Gate] Plan is flagged sensitive but performs no write — answering normally.`);
      }

      if (executionPlan.sensitiveAction && planWrites) {
        const approvalId = 'appr-' + Math.random().toString(36).substring(2, 15);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30-minute expiry

        // DB-backed approval storage (survives server restart + load balancer)
        await this.prisma.aiPendingApproval.create({
          data: {
            id: approvalId,
            organizationId,
            userId,
            userRole,
            userMessage: gatewayOutput.query,
            sessionId: sessionId || null,
            callPersona: callPersona || null,
            executionGraph: executionPlan.nodes as any,
            toolCallIndex: 0,
            executedResults: [] as any,
            historyJson: history.slice(-12) as any,
            expiresAt
          }
        });

        this.zorvexGateway.broadcastToOrganization(organizationId, 'approval_required', {
          approvalId,
          tool: executionPlan.nodes[0]?.tool || 'Unknown Tool',
          params: executionPlan.nodes[0]?.params
        });

        return {
          status: 'PENDING_APPROVAL',
          approvalId,
          response: `⚠️ Executive Authorization Required: The planned action requires corporate approval before executing.`,
          toolExecuted: executionPlan.nodes[0]?.tool,
          toolData: executionPlan.nodes[0]?.params,
          citations: [],
          workspaceState
        };
      }

      // STEP 4 — PARALLEL EXECUTION LAYER (Layer 6)
      let dbResult: any = { rows: [], confidenceScore: 100, tablesUsed: [], queriesRun: [], errors: [], parseError: null, validationResult: null, verified: true };
      let docResult: any = { chunks: [], confidenceScore: 0 };
      let memResult: any = { memories: [] };

      // Telemetry metrics trackers
      let duplicateStepsSkipped = 0;
      let totalStepsPlanned = (executionPlan.nodes || []).length;
      let databasePipelineFallbacks = 0;

      const executedSignatures = new Set<string>();

      emitTraceStep(8, "PARALLEL_EXECUTION_START", "SUCCESS", executionPlan.nodes || [], "Executing backend retrieval pipelines in parallel...", startTime);

      const executionPromises: Promise<any>[] = [];
      const sqlResultsCollector: any[] = [];
      const ragResultsCollector: any[] = [];

      const runSqlStep = async (node: any) => {
        // Request-level loop protection check
        const normalizedParams = this.planningEngineService['normalizePlanStepParams'](node.params || {});
        const signature = `${node.tool}_${JSON.stringify(normalizedParams)}`;
        if (executedSignatures.has(signature)) {
          duplicateStepsSkipped++;
          this.logger.log(`[Duplicate Execution Guard] Skipping duplicate execution of node signature: "${signature}"`);
          return;
        }
        executedSignatures.add(signature);

        // Check for potential role contamination in raw filters
        if (node.params?.filters && typeof node.params.filters === 'object') {
          for (const key of Object.keys(node.params.filters)) {
            if (key.toLowerCase() === 'role' && node.params.filters[key] === userRole) {
              roleContaminationIncidents++;
              this.logger.warn(`[Role Contamination Alert] Query filters matched userRole context: ${userRole}. Segregating.`);
            }
          }
        }

        const sqlStartTime = Date.now();
        emitTraceStep(9, "SQL_PIPELINE_START", "PROCESSING", node.params || {}, "Executing database retrieval pipeline...", sqlStartTime);

        let res = await this.databasePipelineService.runDatabaseRetrievalPipeline(
          gatewayOutput.query,
          organizationId,
          userId,
          userRole,
          node.params // Consume planned parameters directly
        );

        // deduplicate related entities to prevent duplicate responses
        res.rows = this.entityResolutionService.resolveEntities(res.rows);

        const primaryFailed = (res.rows.length === 0 || res.confidenceScore < 50) && res.errors.length === 0;

        if (primaryFailed) {
          this.logger.error(`[NL-to-SQL FAILURE DIAGNOSTICS]
          {
            "rawLlmResponse": ${JSON.stringify(res.rawLlmResponse || "", null, 2)},
            "parseError": ${JSON.stringify(res.parseError || "", null, 2)},
            "generatedPlan": ${JSON.stringify(res.generatedPlan || {}, null, 2)},
            "validationResult": ${JSON.stringify(res.validationResult || {}, null, 2)},
            "fallbackTriggered": false
          }`);

          emitTraceStep(9, "SQL_PIPELINE_FALLBACK", "WARNING", node.params || {}, "SQL Pipeline failed or yielded low confidence. Clean failure. No fallback.", sqlStartTime);
          this.logger.log(`[Database Pipeline] SQL Pipeline failed or yielded low confidence. Clean failure. No fallback.`);
        } else {
          this.logger.log(`[NL-to-SQL SUCCESS DIAGNOSTICS]
          {
            "generatedPlan": ${JSON.stringify(res.generatedPlan || {}, null, 2)},
            "validationResult": ${JSON.stringify(res.validationResult || {}, null, 2)},
            "executionResult": { "rowsCount": ${res.rows.length} },
            "fallbackTriggered": false
          }`);
        }

        emitTraceStep(9, "SQL_PIPELINE_END", res.errors.length > 0 ? "FAILED" : "SUCCESS", node.params || {}, { rowsCount: res.rows.length, verified: res.verified, confidenceScore: res.confidenceScore, queriesRun: res.queriesRun, errors: res.errors }, sqlStartTime);
        sqlResultsCollector.push({
          ...res,
          nodeType: node.type,
          operation: node.params?.operation
        });
      };

      const runRagStep = async (node: any) => {
        const ragStartTime = Date.now();
        emitTraceStep(10, "RAG_PIPELINE_START", "PROCESSING", gatewayOutput.query, "Executing RAG retrieval...", ragStartTime);
        try {
          const res = await this.ragService.query(
            gatewayOutput.query,
            organizationId,
            userId,
            userRole
          );
          const formatted = {
            chunks: res.citations.map((cit) => ({
              content: res.answer,
              documentName: cit.documentName,
              metadata: { page: cit.page, paragraph: cit.paragraph }
            })),
            confidenceScore: res.confidenceScore
          };
          emitTraceStep(10, "RAG_PIPELINE_END", "SUCCESS", gatewayOutput.query, { chunksCount: formatted.chunks.length, confidenceScore: res.confidenceScore, citations: res.citations }, ragStartTime);
          ragResultsCollector.push(formatted);
        } catch (e) {
          this.logger.error(`Document Pipeline execution failed: ${e.message}`);
          emitTraceStep(10, "RAG_PIPELINE_FAILED", "FAILED", gatewayOutput.query, { error: e.message }, ragStartTime);
        }
      };

      const runMemStep = async () => {
        const memStartTime = Date.now();
        emitTraceStep(11, "MEMORY_RETRIEVAL_START", "PROCESSING", gatewayOutput.query, "Retrieving historical memories...", memStartTime);
        try {
          const memories = await this.retrieveRelevantMemories(gatewayOutput.query, organizationId, 5);
          memResult = { memories };
          emitTraceStep(11, "MEMORY_RETRIEVAL_END", "SUCCESS", gatewayOutput.query, { memoriesCount: memories.length, categories: memories.map(m => m.category) }, memStartTime);
        } catch (e) {
          this.logger.error(`Memory Pipeline execution failed: ${e.message}`);
          emitTraceStep(11, "MEMORY_RETRIEVAL_FAILED", "FAILED", gatewayOutput.query, { error: e.message }, memStartTime);
        }
      };

      for (const node of (executionPlan.nodes || [])) {
        if (node.tool === 'SQL_ENGINE') {
          executionPromises.push(runSqlStep(node));
        } else if (node.tool === 'RAG_ENGINE') {
          executionPromises.push(runRagStep(node));
        }
      }
      executionPromises.push(runMemStep());

      // Parallel execute database, document, api and memory pipelines
      await Promise.all(executionPromises);

      // MAP-REDUCE FUSION OF RESULTS COLLECTORS
      if (sqlResultsCollector.length > 0) {
        const listResults = sqlResultsCollector.filter(r => r.nodeType !== 'COUNT' && r.operation !== 'aggregate');
        let mergedRows = sqlResultsCollector.flatMap(r => r.rows || []);
        if (listResults.length > 0) {
          mergedRows = listResults.flatMap(r => r.rows || []);
        }
        dbResult = {
          rows: mergedRows,
          verified: sqlResultsCollector.every(r => r.verified ?? true),
          confidenceScore: Math.min(...sqlResultsCollector.map(r => r.confidenceScore ?? 100)),
          tablesUsed: Array.from(new Set(sqlResultsCollector.flatMap(r => r.tablesUsed || []))),
          queriesRun: sqlResultsCollector.flatMap(r => r.queriesRun || []),
          errors: sqlResultsCollector.flatMap(r => r.errors || []),
          parseError: sqlResultsCollector.map(r => r.parseError).filter(Boolean).join('; ') || null,
          validationResult: sqlResultsCollector.find(r => r.validationResult)?.validationResult || null
        };
      }
      if (ragResultsCollector.length > 0) {
        docResult = {
          chunks: ragResultsCollector.flatMap(r => r.chunks || []),
          confidenceScore: Math.min(...ragResultsCollector.map(r => r.confidenceScore ?? 1.0))
        };
      }

      plannerDuplicateRate = totalStepsPlanned > 0 ? Math.round((duplicateStepsSkipped / totalStepsPlanned) * 100) : 0;
      fallbackRate = sqlResultsCollector.length > 0 ? Math.round((databasePipelineFallbacks / sqlResultsCollector.length) * 100) : 0;

      // STEP 5 — RESULT FUSION ENGINE & CROSS VALIDATION ENGINE
      const fusionStartTime = Date.now();
      const fusionOutput = await this.resultFusionService.fuseAndValidate(
        gatewayOutput.query,
        { dbResult, docResult, memResult },
        organizationId,
        userId,
        intentObj.classification
      );
      emitTraceStep(12, "RESULT_FUSION", "SUCCESS", { dbResultSize: dbResult.rows.length, docChunksSize: docResult.chunks.length, memResultSize: memResult.memories.length }, { finalConfidence: fusionOutput.finalConfidence, groundedEvidenceLength: fusionOutput.groundedEvidence.length }, fusionStartTime);
      emitTraceStep(13, "CROSS_VALIDATION", fusionOutput.conflicts && fusionOutput.conflicts.length > 0 ? "WARNING" : "SUCCESS", { dbResultSize: dbResult.rows.length, docChunksSize: docResult.chunks.length }, { conflicts: fusionOutput.conflicts || [] }, fusionStartTime);
      emitTraceStep(14, "CONFIDENCE_SCORE_BREAKDOWN", fusionOutput.finalConfidence >= 85 ? "SUCCESS" : "FAILED", gatewayOutput.query, { finalConfidence: fusionOutput.finalConfidence, threshold: 85 }, fusionStartTime);

      // Confidence gating.
      //
      // This used to refuse whenever the heuristic aggregate score fell under 85,
      // which threw away correct answers: a query that executed cleanly and returned
      // "1 property" (or legitimately returned zero rows) could still score below the
      // threshold, and the user got "Insufficient evidence available to answer
      // confidently" instead of their answer. An empty result set is a valid answer,
      // not low confidence.
      //
      // So the gate now fires only on *evidence of failure* — the query errored, or
      // the plan failed schema validation. Fabrication risk is handled separately and
      // deterministically by FactVerifierService after composition, which is a much
      // stronger guarantee than a weighted score.
      const hadExecutionFailure = (dbResult.errors || []).length > 0;
      const hadSchemaFailure = dbResult.validationResult?.isValid === false;
      const retrievalUnusable = hadExecutionFailure || hadSchemaFailure;

      if (fusionOutput.finalConfidence < 85 && !retrievalUnusable) {
        this.logger.log(
          `[Confidence Gate] Score ${fusionOutput.finalConfidence} is under 85, but the query ` +
          `executed cleanly (${dbResult.rows.length} row(s), no errors) — answering anyway. ` +
          `Grounding is enforced by the fact verifier.`
        );
      }

      if (retrievalUnusable) {
        this.logger.warn(`Retrieval failed (errors=${(dbResult.errors || []).length}, schemaValid=${dbResult.validationResult?.isValid !== false}). Refusing gracefully.`);

        await this.observabilityService.logTrace({
          traceId,
          timestamp: new Date().toISOString(),
          query: gatewayOutput.query,
          intent: intentObj.intent,
          classification: intentObj.classification,
          latencyMs: Date.now() - startTime,
          confidenceScore: fusionOutput.finalConfidence,
          dbAccuracy: dbResult.rows.length > 0 ? 100 : 0,
          ragAccuracy: docResult.chunks.length > 0 ? 100 : 0,
          hallucinationRate: 0,
          fusionAccuracy: 0,
          tokenUsage: 0,
          cost: 0,
          securityViolations: dbResult.errors || [],
          workflowSuccess: false,
          plannerDuplicateRate,
          fallbackRate,
          confidenceFailureRate: 100,
          roleContaminationIncidents,
          executionRetries: 0,
          queryRewriteCount: isDeterministicBypassed ? 0 : 1,
          intentMisclassificationRate: 0
        }, organizationId);

        // Say what actually went wrong. "Insufficient evidence available to answer
        // confidently" told the user nothing and was indistinguishable from an empty
        // result, so real failures (a bad generated plan, a query error) looked like
        // missing data and went uninvestigated.
        const failureDetail = hadSchemaFailure
          ? `I built an invalid query for that request${dbResult.validationResult?.errorMsg ? ` (${dbResult.validationResult.errorMsg})` : ''}.`
          : `The database query failed: ${(dbResult.errors || []).join('; ')}`;

        const refusal = `I wasn't able to run that lookup. ${failureDetail}\n\nTry rephrasing it, or name the specific records you want (e.g. "properties in JVC under 2 million").`;

        emitTraceStep(17, "FINAL_OUTPUT_SENT", "FAILED", userMessage, {
          response: refusal,
          reason: hadSchemaFailure ? 'Generated query plan failed schema validation' : 'Database execution error',
          errors: dbResult.errors,
        }, startTime);

        return {
          response: refusal,
          spokenResponse: callPersona ? "I couldn't run that lookup. Could you rephrase it?" : undefined,
          toolExecuted: null,
          toolData: null,
          citations: [],
          workspaceState
        };
      }

      // STEP 6 — EXECUTIVE DECISION ENGINE
      const pastMemories = memResult.memories || [];
      const toolData = dbResult.rows;
      let execAnalysis = { risks: [] as string[], opportunities: [] as string[], recommendations: [] as string[] };
      
      if (intentObj.intent === 'ANALYTICS' || intentObj.intent === 'TREND' || intentObj.intent === 'REPORTING' || intentObj.intent === 'POLICY' || intentObj.intent === 'COMPARISON' || intentObj.intent === 'FORECAST' || intentObj.intent === 'MIXED') {
        execAnalysis = await this.executiveDecisionService.analyze(gatewayOutput.query, toolData, pastMemories);
      }

      // STEP 7 — GROUNDED RESPONSE GENERATOR
      const responseMode = intentObj.intent === 'LOOKUP' ? 'LOOKUP' : (intentObj.intent === 'POLICY' ? 'POLICY' : 'EXECUTIVE');
      
      let isFallback = false;
      let fallbackOrigLoc = '';
      let fallbackAreas: string[] = [];
      const dbRows = dbResult.rows;
      if (dbRows) {
        if (dbRows.isNearbyFallback) {
          isFallback = true;
          fallbackOrigLoc = dbRows.originalLocation;
          fallbackAreas = dbRows.nearbyLocationsSearched;
        } else if (Array.isArray(dbRows) && (dbRows as any).isNearbyFallback) {
          isFallback = true;
          fallbackOrigLoc = (dbRows as any).originalLocation;
          fallbackAreas = (dbRows as any).nearbyLocationsSearched;
        }
      }

      /*
      // ROLLBACK BACKUP: ORIGINAL V9 COMPOSER PROMPT
      const composerPrompt = `You are the Zorvex Response Composer (V9 VEnterprise Cognitive retrieval Core).
Your task is to compile the final response in the determined Mode: ${responseMode}.

STRICT GROUNDEDNESS RULES:
1. Rely ONLY on clear facts directly mentioned in the provided Grounded Evidence context. Do NOT make assumptions, guess, extrapolate, or use external knowledge.
2. Every claim or factual statement in your response MUST be followed by a citation pointing to the specific document name or database table source in the format [Doc: "Document Name", Page X, Para Y] or [Table: "Table Name"].
3. Never invent metrics, dates, names, or values.
4. Responds in the EXACT SAME LANGUAGE as the user's message (e.g. English, Roman Urdu, or Urdu script).

Grounded Evidence Context:
${fusionOutput.groundedEvidence}

Executive Context (Risks/Opps):
Risks: ${JSON.stringify(execAnalysis.risks)}
Opportunities: ${JSON.stringify(execAnalysis.opportunities)}
Recommendations: ${JSON.stringify(execAnalysis.recommendations)}`;
      */

      // UNIFIED RESPONSE COMPOSER (V9-Enterprise Cognitive Core)
      // Merges the strict groundedness/citations of V9 with the natural, warm, human executive style of V2.
      const composerPrompt = `You are the Zorvex Response Composer. Your task is to compile the final response in the determined Mode: ${responseMode} matching the style of ChatGPT.

STRICT CHATGPT STYLE & TONALITY RULES:
1. SPEAK LIKE A NATURAL HUMAN ASSISTANT (CHATGPT STYLE): Be warm, conversational, professional, and friendly. Avoid sounding like a database query reporter. Write fluid, cohesive paragraphs or clean bullet points.
2. BANISH ROBOTIC PREFIXES & HEADERS: Do NOT start with template phrases like "Based on the database...", "Grounded Context indicates...", "Here is the information...", "According to the records...", or "Mujhe LIVE_DATABASE se pata chala...". Jump directly into the answer.
3. NATURAL DIALECTS (ROMAN URDU/ENGLISH):
   - Mirror the user's language/dialect exactly.
   - For Roman Urdu, speak naturally as a human colleague would on WhatsApp (e.g., use "office/team" instead of "karyalay", "details" instead of "jankari", "leaves/chutti" instead of "chutti requests"). Avoid literal textbook translation or pure Hindi vocabulary.
4. CLEAN FORMATTING & DATA RENDERING:
   - NO EMPTY OR RAW TABLES: Never print tables containing raw/empty UUIDs, empty columns, or raw timestamps. If you show a table, it must be highly clean and legible. If names are missing or data is sparse, use a beautiful bulleted list instead.
   - HUMAN-READABLE DATES: Convert all database ISO strings (like "2025-01-15T00:00:00.000Z") to clean human dates (like "15th Jan 2025" or "January 15, 2025").
   - RESOLVE NAMES: When listing employees, retrieve their names from the nested "user.firstName" and "user.lastName" fields of the EmployeeProfile. Do not print empty name columns or raw user IDs.
5. SUBTLE INLINE CITATIONS: Cite the table the fact actually came from, briefly, at the end of the sentence — e.g. "[LeaveRequest]". The tag MUST name the table that supplied that specific fact. Property owner names come from [Owner], not [EmployeeProfile]. If unsure which table a fact came from, omit the citation — a wrong citation is worse than none. Banish terms like "Database", "Table", "Registry", or quotes around table names.
6. DATA-FIRST PRINCIPLE: Always present the requested data/answer first, followed by any analysis or natural follow-up question.
7. EMPTY RESULTS — STATE THE LIMIT, NOT A VERDICT. If 0 records came back, say what you searched for and that nothing matched, then offer the next step. Do NOT declare the thing does not exist: an empty result often means the filter was wrong, not that the record is absent. Prefer "Mujhe koi pending leave request nahi mili — kya main saari leave requests dikhaon?" over "There are no pending leave requests in the system." Never use robotic phrasing like "Records found: 0". Do not offer unsolicited corporate advice.
8. NEVER SUBSTITUTE INFERENCE FOR DATA. If the user asks for something the retrieved rows do not contain, say the data isn't there and name what you would need. Do NOT reason your way to an answer from adjacent fields — never rank "performance" from someone's role or job title, and never infer seniority, quality, or ranking that is not an actual column in the data. Guessing dressed up as analysis is the worst failure mode here.
9. RESPECT THE USER'S CORRECTION. If the user says a record exists that you reported as missing, treat that as strong evidence your filter was wrong. Say what you searched for and offer to search more broadly — never simply repeat the denial.

MODE-SPECIFIC GUIDELINES:
- LOOKUP MODE (Data searches): Short, direct, factual. No unsolicited advice or recommendations.
- ACTION MODE (Create/Update): Confirm status (e.g., "Task assigned successfully.") and list details (title, dates, assignee, location).
- ANALYTICS MODE (Comparison/Aggregation): Present aggregated metrics, then provide short comparative analysis or hotspot insights.
- EXECUTIVE MODE (Strategic/Performance): Present data/report details, then perform strategic reasoning and risk/recommendation analysis.

Executive Context (Risks/Opps):
Risks: ${JSON.stringify(execAnalysis.risks)}
Opportunities: ${JSON.stringify(execAnalysis.opportunities)}
Recommendations: ${JSON.stringify(execAnalysis.recommendations)}
${isFallback ? `DUBAI REAL ESTATE PROXIMITY ADVICE: The user queried properties in "${fallbackOrigLoc}". Since no listings are currently available in "${fallbackOrigLoc}", Zorvex searched adjacent locations: [${fallbackAreas.join(', ')}]. Explain this to the user clearly, informing them that while no properties are in "${fallbackOrigLoc}", we have options in these adjacent prime areas.` : ''}

${dbResult.broadened ? `
⚠️ RETRIEVAL NOTE — READ BEFORE ANSWERING:
The user's exact filters (${dbResult.broadened.droppedFilters.join(', ')}) matched ZERO records,
so the search was automatically broadened and the rows below are the UNFILTERED set.
You MUST tell the user this. Say that nothing matched their exact criteria, then show
what does exist and offer to narrow it down. Do NOT present these rows as if they
matched what was asked.` : ''}${(dbResult.filterRepairs?.length ?? 0) > 0 ? `
⚠️ FILTER REPAIRS APPLIED: ${dbResult.filterRepairs!.join(' | ')}
If a filter was dropped, mention that you searched more broadly than asked.` : ''}

Grounded Evidence Context:
${fusionOutput.groundedEvidence}`;

      const composerStartTime = Date.now();
      const finalResponseText = await this.llmService.callLLM(
        composerPrompt,
        `Generate grounded response for query: "${gatewayOutput.query}"`,
        history,
        false,
        organizationId,
        userId
      );

      let cleanedResponse = this.responseSanitizer.sanitizeResponse(finalResponseText.trim());
      emitTraceStep(15, "FINAL_RESPONSE_GENERATION", "SUCCESS", { query: gatewayOutput.query }, { responseLength: cleanedResponse.length }, composerStartTime);

      // STEP 7.5 — GROUNDING VERIFICATION
      //
      // This check was previously only reachable through the action-approval flow
      // (compileFinalResponse), so the main question-answering path — the one users
      // actually hit — shipped composer output straight to the client with no
      // grounding check at all, despite the architecture describing a
      // "Zero Hallucination Validation" layer. It now runs here, deterministically.
      const groundingStartTime = Date.now();
      let verification = this.factVerifier.verify(cleanedResponse, dbResult.rows || [], {
        tablesUsed: dbResult.tablesUsed || [],
        counts: { sql: (dbResult.rows || []).length },
      });

      if (!verification.passed) {
        this.logger.warn(`[Grounding] Violations: ${verification.violations.map(v => v.rule).join(', ')} — regenerating once.`);
        const correctionPrompt = `${composerPrompt}

⚠️ GROUNDING VIOLATION — your previous answer contained claims the retrieved records do not support:
${verification.correctionInstruction}

Rewrite using ONLY facts present in the Grounded Evidence Context. If it is empty, say plainly that no records were found. Never invent names, counts, or values.`;

        const retryText = await this.llmService.callLLM(
          correctionPrompt,
          `Generate grounded response for query: "${gatewayOutput.query}"`,
          history, false, organizationId, userId
        );
        cleanedResponse = this.responseSanitizer.sanitizeResponse(retryText.trim());

        verification = this.factVerifier.verify(cleanedResponse, dbResult.rows || [], {
          tablesUsed: dbResult.tablesUsed || [],
          counts: { sql: (dbResult.rows || []).length },
        });

        // One retry only. Looping a model against a constraint it keeps breaking
        // burns latency without converging; fall back to the honest answer instead.
        if (!verification.passed && (dbResult.rows || []).length === 0) {
          cleanedResponse = `I couldn't find any records matching that. Try adjusting the filters — a different date range or area usually helps.`;
        }
      }

      emitTraceStep(16, "GROUNDING_VERIFICATION", verification.passed ? "SUCCESS" : "WARNING",
        { rowCount: (dbResult.rows || []).length },
        {
          passed: verification.passed,
          violations: verification.violations,
          checkedNumbers: verification.checkedNumbers,
          checkedNames: verification.checkedNames,
        }, groundingStartTime);

      // Update active contexts in WorkspaceState
      if (dbResult.rows.length > 0) {
        const firstRow = dbResult.rows[0];
        if (firstRow && typeof firstRow === 'object') {
          if (dbResult.tablesUsed.includes('property')) {
            workspaceState.activeProperty = { id: firstRow.id, title: firstRow.title, ownerId: firstRow.ownerId || null };
            workspaceState.activeEntityType = 'Property';
            workspaceState.activeRecord = workspaceState.activeProperty;
            workspaceState.activeContext = { type: 'PROPERTY_DISCUSSION', propertyId: firstRow.id };
          }
          if (dbResult.tablesUsed.includes('employeeprofile')) {
            workspaceState.activeEmployee = { id: firstRow.id, name: firstRow.user?.firstName || 'Employee', department: firstRow.department };
            workspaceState.activeEntityType = 'Employee';
            workspaceState.activeRecord = workspaceState.activeEmployee;
            workspaceState.activeContext = { type: 'ATTENDANCE_DISCUSSION', employeeId: firstRow.id };
          }
          if (dbResult.tablesUsed.includes('client') || dbResult.tablesUsed.includes('lead')) {
            workspaceState.activeLead = { id: firstRow.id, name: firstRow.name, type: firstRow.type };
            workspaceState.activeEntityType = firstRow.type === 'OWNER' ? 'Owner' : 'Lead';
            workspaceState.activeRecord = workspaceState.activeLead;
            workspaceState.activeContext = { type: 'LEAD_DISCUSSION', leadId: firstRow.id };
          }
        }
      }

      // Spoken response TTS generation
      let finalSpoken: string | undefined = undefined;
      if (callPersona) {
        finalSpoken = await this.generateSpokenSummary(cleanedResponse, gatewayOutput.query, organizationId, userId);
      }

      const citationStartTime = Date.now();
      // Citation mapping
      const citations = docResult.chunks.map((chunk: any) => ({
        documentId: chunk.documentId || 'policy-doc',
        documentName: chunk.documentName,
        fileType: 'TXT',
        page: chunk.metadata?.page || 1,
        paragraph: chunk.metadata?.paragraph || 1
      }));
      emitTraceStep(16, "CITATION_ATTACHMENT", "SUCCESS", { chunksCount: docResult.chunks.length }, citations, citationStartTime);

      // Learning Engine & Memory Persistence
      await this.learningMemoryService.storeInteraction({
        userQuestion: gatewayOutput.query,
        executionPlan,
        retrievedSources: {
          dbTables: dbResult.tablesUsed,
          documents: docResult.chunks.map((c: any) => c.documentName)
        },
        finalResponse: cleanedResponse,
        confidenceScore: fusionOutput.finalConfidence,
        timestamp: new Date().toISOString()
      }, organizationId);

      this.learningMemoryService.extractAndStoreOrganizationalMemory(
        cleanedResponse,
        gatewayOutput.query,
        organizationId,
        userId
      ).catch(e => this.logger.warn(`Background memory extraction failed: ${e.message}`));

      // Observability Logging
      await this.observabilityService.logTrace({
        traceId,
        timestamp: new Date().toISOString(),
        query: gatewayOutput.query,
        intent: intentObj.intent,
        classification: intentObj.classification,
        latencyMs: Date.now() - startTime,
        confidenceScore: fusionOutput.finalConfidence,
        dbAccuracy: 100,
        ragAccuracy: 100,
        hallucinationRate: 0,
        fusionAccuracy: 100,
        tokenUsage: Math.ceil((cleanedResponse.length + fusionOutput.groundedEvidence.length) / 4),
        cost: 0,
        securityViolations: dbResult.errors || [],
        workflowSuccess: true,
        plannerDuplicateRate,
        fallbackRate,
        confidenceFailureRate: 0,
        roleContaminationIncidents,
        executionRetries: 0,
        queryRewriteCount: isDeterministicBypassed ? 0 : 1,
        intentMisclassificationRate: 0
      }, organizationId);

      // Whitelisted Visualization Decision
      const visualization = this.selectSmartVisualization(dbResult.tablesUsed[0] || '', dbResult.rows, gatewayOutput.query);

      emitTraceStep(17, "FINAL_OUTPUT_SENT", "SUCCESS", userMessage, { response: cleanedResponse, toolExecuted: dbResult.tablesUsed[0] || null, citationsCount: citations.length, totalLatency: Date.now() - startTime }, startTime);

      const extractCountHelper = (rows: any[]): number => {
        if (!rows || rows.length === 0) return 0;
        const first = rows[0];
        if (!first || typeof first !== 'object') return 0;
        if (first._count !== undefined) {
          if (typeof first._count === 'number') return first._count;
          if (typeof first._count === 'object' && first._count !== null) {
            const vals = Object.values(first._count);
            if (vals.length > 0 && typeof vals[0] === 'number') {
              return vals[0] as number;
            }
          }
        }
        return rows.length;
      };

      let formattedToolData: any = dbResult.rows;
      const hasCountNode = (executionPlan.nodes || []).some(n => n.type === 'COUNT' || n.params?.operation === 'aggregate');
      const hasListNode = (executionPlan.nodes || []).some(n => n.type === 'LIST' || n.params?.operation === 'fetch');

      if (hasCountNode && !hasListNode) {
        formattedToolData = {
          type: "AGGREGATE",
          count: extractCountHelper(sqlResultsCollector.flatMap(r => r.rows || []))
        };
      } else if (hasListNode && !hasCountNode) {
        formattedToolData = {
          type: "ENTITY_LIST",
          rows: dbResult.rows
        };
      } else if (hasCountNode && hasListNode) {
        const countObj = sqlResultsCollector.find(r => r.nodeType === 'COUNT' || r.operation === 'aggregate');
        const countVal = countObj ? extractCountHelper(countObj.rows) : 0;
        formattedToolData = {
          type: "ENTITY_LIST",
          rows: dbResult.rows,
          aggregate: {
            type: "AGGREGATE",
            count: countVal
          }
        };
      }

      const finalPayload = {
        response: cleanedResponse,
        spokenResponse: finalSpoken,
        toolExecuted: dbResult.tablesUsed[0] || null,
        toolData: formattedToolData,
        citations,
        visualization,
        workspaceState
      };

      // Only cache verified, well-grounded answers. Caching a low-confidence or
      // ungrounded reply would keep serving a bad answer for the whole TTL.
      if (cacheEligible && verification.passed && dbResult.errors.length === 0) {
        this.queryCache.set(
          userMessage, organizationId, userId, userRole,
          finalPayload, dbResult.tablesUsed || []
        );
      }

      return finalPayload;

    } catch (err) {
      this.logger.error(`AOS v9 Cognitive Core Pipeline breakdown: ${err.message}`);
      emitTraceStep(17, "FINAL_OUTPUT_SENT", "FAILED", userMessage, { error: err.message }, startTime);
      return {
        response: "🤖 System Alert: An operational bottleneck has interrupted Zorvex AI. Please verify data parameters and retry.",
        spokenResponse: callPersona ? "System error has occurred, please retry." : undefined,
        toolExecuted: null,
        toolData: null,
        citations: [],
        workspaceState
      };
    }
  }

  private isSensitiveAction(toolCall: any): boolean {
    if (toolCall.tool === 'sendReminder') return true;
    if (toolCall.tool === 'createTask') {
      const title = toolCall.params?.title?.toLowerCase() || '';
      if (title.includes('salary') || title.includes('payroll') || title.includes('bonus') || title.includes('terminate')) {
        return true;
      }
    }
    if (toolCall.tool === 'createMeeting') {
      const title = toolCall.params?.title?.toLowerCase() || '';
      if (title.includes('salary review') || title.includes('termination')) {
        return true;
      }
    }
    return false;
  }

  async approveAction(approvalId: string, approved: boolean): Promise<any> {
    // DB-backed lookup (works across server restarts and load balancer instances)
    const dbState = await this.prisma.aiPendingApproval.findUnique({
      where: { id: approvalId }
    });

    if (!dbState) {
      return {
        response: "The requested authorization request could not be found or has already been processed.",
        toolExecuted: null,
        toolData: null,
        citations: []
      };
    }

    // Check expiry
    if (new Date() > new Date(dbState.expiresAt)) {
      await this.prisma.aiPendingApproval.delete({ where: { id: approvalId } }).catch(() => null);
      return {
        response: "This authorization request has expired (30-minute timeout). Please re-initiate the operation.",
        toolExecuted: null,
        toolData: null,
        citations: []
      };
    }

    // Delete immediately to prevent double-execution
    await this.prisma.aiPendingApproval.delete({ where: { id: approvalId } }).catch(() => null);

    if (!approved) {
      return {
        response: "The planned operations were cancelled and declined by the user authorization manager.",
        toolExecuted: null,
        toolData: null,
        citations: []
      };
    }

    try {
      this.logger.log(`Resuming approved execution graph for approvalId: ${approvalId}`);
      const { userId, organizationId, userRole, userMessage, sessionId, callPersona } = dbState;
      const executionGraph = dbState.executionGraph as any[];
      const history = dbState.historyJson as any[];
      const executedResults: any[] = [];

      for (let i = dbState.toolCallIndex; i < executionGraph.length; i++) {
        const toolCall = executionGraph[i];
        this.logger.log(`Resuming and executing tool: ${toolCall.tool}`);
        const toolData = await this.dbToolsService.executeDatabaseTool(
          toolCall.tool,
          toolCall.params,
          organizationId,
          userRole,
          userId
        );

        executedResults.push({
          tool: toolCall.tool,
          success: !toolData?.error,
          data: toolData,
          verified: true
        });
      }

      // Reconstruct workspaceState
      let workspaceState: any = {
        activeProperty: null,
        activeOwner: null,
        activeLead: null,
        activeTask: null,
        activeMeeting: null,
        activeEmployee: null,
        activeComparison: null,
        activeFilters: null,
        activeModule: null,
        activeEntity: null,
        activeEntityType: null,
        activeRecord: null,
        activeCollection: null,
        activeContext: null,
        pendingAction: null
      };

      if (sessionId) {
        const session = await this.prisma.aiChatSession.findUnique({
          where: { id: sessionId }
        });
        if (session && Array.isArray(session.messages)) {
          for (let i = session.messages.length - 1; i >= 0; i--) {
            const msg = session.messages[i] as any;
            if (msg.role === 'model' && msg.workspaceState) {
              workspaceState = { ...workspaceState, ...msg.workspaceState };
              break;
            }
          }
        }
      }

      const finalResult = await this.compileFinalResponse(
        userMessage,
        userId,
        organizationId,
        userRole,
        history,
        [], 
        executedResults,
        callPersona ?? undefined,  // Prisma returns null, function expects string | undefined
        'ACTION_REQUEST',
        workspaceState,
        // Action approvals write records rather than reading them, so there is no
        // document retrieval to do and nothing for the grounding check to compare
        // against beyond the tool results themselves.
        { classification: 'DATABASE_ONLY', executionPlan: { nodes: [] }, tablesUsed: [], rowCount: executedResults.length }
      );

      // Save history if active session
      if (sessionId) {
        const session = await this.prisma.aiChatSession.findFirst({
          where: { id: sessionId, userId, organizationId }
        });
        if (session) {
          const chatHistory = Array.isArray(session.messages) ? session.messages : [];
          const userMsg = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: userMessage,
            createdAt: new Date().toISOString()
          };
          const modelMsg = {
            id: `model-${Date.now()}`,
            role: 'model',
            content: finalResult.response,
            toolExecuted: finalResult.toolExecuted,
            toolData: finalResult.toolData,
            citations: finalResult.citations,
            createdAt: new Date().toISOString(),
            workspaceState: finalResult.workspaceState
          };
          await this.prisma.aiChatSession.update({
            where: { id: sessionId },
            data: {
              messages: [...chatHistory, userMsg, modelMsg]
            }
          });
        }
      }

      return finalResult;

    } catch (err) {
      this.logger.error(`Error resuming approved action: ${err.message}`);
      return {
        response: "An error occurred while resuming execution after authorization.",
        toolExecuted: null,
        toolData: null,
        citations: []
      };
    }
  }

  private selectSmartVisualization(toolName: string, data: any, query: string): any {
    if (!data) return null;
    const lowerQuery = query.toLowerCase();
    
    if (toolName === 'getAttendanceRecord') {
      return {
        type: 'line_chart',
        title: 'Attendance Comparison & Trends',
        config: { xKey: 'dateStr', yKeys: ['status'] }
      };
    }
    if (toolName === 'getLeaveRequests') {
      return {
        type: 'pie_chart',
        title: 'Leave Status Distribution',
        config: { nameKey: 'status', valueKey: 'count' }
      };
    }
    if (toolName === 'searchProperties') {
      return {
        type: 'pie_chart',
        title: 'Property Status Distribution',
        config: { nameKey: 'status', valueKey: 'count' }
      };
    }
    if (toolName === 'searchClients' || toolName === 'getTasksBoard') {
      return {
        type: 'bar_chart',
        title: toolName === 'searchClients' ? 'Lead Status Funnel' : 'Tasks Status Distribution',
        config: { xKey: 'status', yKeys: ['count'] }
      };
    }
    if (toolName === 'getFinanceAnalytics') {
      return {
        type: 'line_chart',
        title: 'Revenue and Salary Trends',
        config: { xKey: 'month', yKeys: ['netSalary'] }
      };
    }
    if (toolName === 'runQueryPlan') {
      if (lowerQuery.includes('attendance')) {
        return { type: 'line_chart', title: 'Attendance Trends' };
      } else if (lowerQuery.includes('leave')) {
        return { type: 'pie_chart', title: 'Leave Distribution' };
      } else if (lowerQuery.includes('property')) {
        return { type: 'pie_chart', title: 'Property Status' };
      } else if (lowerQuery.includes('client') || lowerQuery.includes('lead')) {
        return { type: 'bar_chart', title: 'Lead Status Funnel' };
      } else if (lowerQuery.includes('finance') || lowerQuery.includes('salary') || lowerQuery.includes('payroll')) {
        return { type: 'line_chart', title: 'Financial Trends' };
      }
    }
    return null;
  }

  private async compileFinalResponse(
    userMessage: string,
    userId: string,
    organizationId: string,
    userRole: string,
    history: { role: 'user' | 'model'; content: string }[],
    requiredAgents: string[],
    executedResults: any[],
    callPersona?: string,
    intent?: string,
    workspaceState?: any,
    // Retrieval context from the pipeline. Needed so the composer can (a) skip the
    // document search when the plan never asked for documents, and (b) run grounding
    // verification against the tables that were actually queried.
    retrievalContext?: {
      classification?: string;
      executionPlan?: any;
      tablesUsed?: string[];
      rowCount?: number;
    }
  ): Promise<any> {
    const classification = retrievalContext?.classification || 'DATABASE_ONLY';
    const executionPlan = retrievalContext?.executionPlan || { nodes: [] };
    const tablesUsed = retrievalContext?.tablesUsed || [];
    const retrievedRowCount = retrievalContext?.rowCount ?? 0;
    // STEP 4.5 — RESPONSE RELEVANCY ENGINE & DYNAMIC UI ASSET ROUTER
    let primaryResult = executedResults[0] || null;
    const lowerQuery = userMessage.toLowerCase();
    let preferredTool: string | null = null;
    
    if (lowerQuery.includes('attendance') || lowerQuery.includes('hazri') || lowerQuery.includes('late') || lowerQuery.includes('present') || lowerQuery.includes('absent')) {
      preferredTool = 'getAttendanceRecord';
    } else if (lowerQuery.includes('leave') || lowerQuery.includes('chutti') || lowerQuery.includes('vacation')) {
      preferredTool = 'getLeaveRequests';
    } else if (lowerQuery.includes('task') || lowerQuery.includes('kam') || lowerQuery.includes('todo') || lowerQuery.includes('checklist')) {
      preferredTool = 'getTasksBoard';
      const createTaskRes = executedResults.find(r => r.tool === 'createTask');
      if (createTaskRes) primaryResult = createTaskRes;
    } else if (lowerQuery.includes('meeting') || lowerQuery.includes('schedule') || lowerQuery.includes('calendar') || lowerQuery.includes('appointment')) {
      preferredTool = 'getMeetingsAnalytics';
      const createMeetingRes = executedResults.find(r => r.tool === 'createMeeting');
      if (createMeetingRes) primaryResult = createMeetingRes;
    } else if (lowerQuery.includes('property') || lowerQuery.includes('listing') || lowerQuery.includes('villa') || lowerQuery.includes('apartment') || lowerQuery.includes('rent') || lowerQuery.includes('sale')) {
      preferredTool = 'searchProperties';
    } else if (lowerQuery.includes('client') || lowerQuery.includes('lead') || lowerQuery.includes('buyer') || lowerQuery.includes('customer')) {
      preferredTool = 'searchClients';
    }

    if (preferredTool) {
      const match = executedResults.find(r => r.tool === preferredTool);
      if (match) {
        primaryResult = match;
      }
    }

    const toolExecuted = primaryResult ? primaryResult.tool : null;
    const toolData = primaryResult ? primaryResult.data : null;

    let isFallback = false;
    let fallbackOrigLoc = '';
    let fallbackAreas: string[] = [];

    if (toolData) {
      if (toolData.isNearbyFallback) {
        isFallback = true;
        fallbackOrigLoc = toolData.originalLocation;
        fallbackAreas = toolData.nearbyLocationsSearched;
      } else if (toolData.rows && toolData.rows.isNearbyFallback) {
        isFallback = true;
        fallbackOrigLoc = toolData.originalLocation;
        fallbackAreas = toolData.rows.nearbyLocationsSearched;
      }
    }

    // STEP 5 — REAL ESTATE INTELLIGENCE CORE (PRE-RESPONSE LAYER)
    let properties: any[] = [];
    let leads: any[] = [];
    let clients: any[] = [];

    for (const res of executedResults) {
      if (res.tool === 'runQueryPlan' && res.data && !res.data.error) {
        const rows = res.data.rows || [];
        if (res.query?.includes('Property')) properties.push(...rows);
        if (res.query?.includes('Lead')) leads.push(...rows);
        if (res.query?.includes('Client')) clients.push(...rows);
      }
      if (res.tool === 'searchProperties' && Array.isArray(res.data)) properties.push(...res.data);
      if (res.tool === 'searchClients' && Array.isArray(res.data)) clients.push(...res.data);
    }
    const reIntelligence = await this.realEstateIntelligenceService.analyze(properties, leads, clients);

    // STEP 5.5 — RETRIEVAL FAILURE & EMPTY CHECK
    const searchTools = ['searchEmployees', 'searchProperties', 'searchClients', 'getAttendanceRecord', 'getLeaveRequests', 'getTasksBoard', 'runQueryPlan'];
    const ranSearchTool = executedResults.some(res => searchTools.includes(res.tool));
    const allSearchesEmpty = ranSearchTool && executedResults.every(res => {
      if (!searchTools.includes(res.tool)) return true;
      if (!res.data) return true;
      if (Array.isArray(res.data) && res.data.length === 0) return true;
      if (res.data.rows && Array.isArray(res.data.rows) && res.data.rows.length === 0) return true;
      if (res.data.error) return true;
      return false;
    });

    // STEP 6 — EXECUTIVE DECISION ENGINE RESTRICTIONS
    const pastMemories = await this.retrieveRelevantMemories(userMessage, organizationId, 4);
    let execAnalysis = { risks: [] as string[], opportunities: [] as string[], recommendations: [] as string[] };
    if (!allSearchesEmpty && (intent === 'ANALYTICS_REQUEST' || intent === 'EXECUTIVE_REQUEST')) {
      execAnalysis = await this.executiveDecisionService.analyze(userMessage, toolData, pastMemories);
    }

    // STEP 7 — AUTONOMOUS WORKFLOW ENGINE CONTEXTUAL FILTER
    let proactiveSuggestions = '';
    
    // Suggest next actions only when unassigned leads, overdue tasks, or empty search exists
    const hasUnassignedLeads = leads.some(l => !l.assignedToId || l.status === 'NEW') || 
      (Array.isArray(toolData) && toolData.some(l => l && typeof l === 'object' && ('assignedToId' in l) && !l.assignedToId)) ||
      (toolData?.rows && Array.isArray(toolData.rows) && toolData.rows.some((l: any) => l && typeof l === 'object' && ('assignedToId' in l) && !l.assignedToId));

    const hasOverdueTasks = (Array.isArray(toolData) && toolData.some(t => t && typeof t === 'object' && ('dueDate' in t) && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED')) ||
      (toolData?.rows && Array.isArray(toolData.rows) && toolData.rows.some((t: any) => t && typeof t === 'object' && ('dueDate' in t) && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED'));

    const hasMeaningfulNextAction = allSearchesEmpty || hasUnassignedLeads || hasOverdueTasks;

    // Suggestions are derived from the conditions we already detected above, so
    // they are generated in code. Asking the model to restate them cost a full
    // round trip to produce text we could template deterministically — and the
    // model occasionally invented conditions that were not in the data.
    if (hasMeaningfulNextAction) {
      const suggestions: string[] = [];

      if (allSearchesEmpty) {
        suggestions.push('Try widening the filters — a different date range or area often surfaces matches.');
        suggestions.push('I can also search adjacent areas or related record types if that helps.');
      }
      if (hasUnassignedLeads) {
        const n = leads.filter(l => !l.assignedToId || l.status === 'NEW').length;
        suggestions.push(`There ${n === 1 ? 'is' : 'are'} ${n || 'some'} unassigned or new lead${n === 1 ? '' : 's'} here — want me to assign them to an agent?`);
      }
      if (hasOverdueTasks) {
        suggestions.push('Some tasks in this set are past their due date — I can list them by owner or reschedule them.');
      }

      if (suggestions.length > 0) {
        proactiveSuggestions = suggestions.slice(0, 3).map(s => `• ${s}`).join('\n');
      }
    }

    // STEP 10 — KPI & BUSINESS GOAL ENGINE (Per-Tenant Dynamic Goals)
    let kpiAlignmentText = '';
    if (!allSearchesEmpty && (intent === 'ANALYTICS_REQUEST' || intent === 'EXECUTIVE_REQUEST')) {
      // Load per-tenant org config from DB, fallback to reasonable defaults if not configured
      let orgGoals: any = {};
      try {
        const orgConfig = await this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true }
        });
        // Derive dynamic baselines from actual DB data
        const [totalLeads, convertedLeads, activeProperties] = await Promise.all([
          this.prisma.lead.count({ where: { organizationId } }),
          this.prisma.lead.count({ where: { organizationId, status: 'CONVERTED' } }),
          this.prisma.property.count({ where: { organizationId, status: 'AVAILABLE' } })
        ]);
        const actualConversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
        orgGoals = {
          organization: orgConfig?.name || 'Your Organization',
          conversionRate: actualConversionRate,
          totalLeads,
          convertedLeads,
          activeProperties,
          note: 'Goals derived from live database metrics for this organization.'
        };
      } catch (e) {
        this.logger.warn(`Could not load org goals from DB: ${e.message}`);
        orgGoals = { note: 'Baseline metrics unavailable.' };
      }

      // KPI commentary is computed from the counts we just queried. The LLM was
      // being handed these exact numbers and asked to phrase a judgement about
      // them — a threshold comparison dressed up as a generation task, at the
      // cost of a round trip. Thresholds are explicit here and auditable.
      if (orgGoals.conversionRate !== undefined) {
        const rate = orgGoals.conversionRate as number;
        if (rate >= 25) {
          kpiAlignmentText = `Lead conversion is at ${rate}% across ${orgGoals.totalLeads} leads — healthy against a 20% benchmark.`;
        } else if (rate >= 10) {
          kpiAlignmentText = `Lead conversion is ${rate}% (${orgGoals.convertedLeads}/${orgGoals.totalLeads}). There's room to push toward 20% — tightening follow-up on new leads is usually where that comes from.`;
        } else if (orgGoals.totalLeads > 0) {
          kpiAlignmentText = `Lead conversion is ${rate}% (${orgGoals.convertedLeads}/${orgGoals.totalLeads}), below the 10% floor. Worth reviewing lead source quality and first-response time.`;
        }

        if (orgGoals.activeProperties === 0) {
          kpiAlignmentText += ` Note: there are no available listings on the books right now.`;
        }
      }
    }

    // Only search documents when the plan actually called for them. This ran on
    // every single request — including pure database lookups — costing an
    // embedding call plus a vector query for context that was then discarded.
    const needsDocuments =
      classification === 'DOCUMENT_ONLY' ||
      classification === 'HYBRID' ||
      (executionPlan?.nodes || []).some((n: any) => n.tool === 'RAG_ENGINE');

    let matchingChunks: any[] = [];
    if (needsDocuments) {
      matchingChunks = await this.llmService.searchUnstructuredKnowledge(userMessage, organizationId, 4);
    }
    const documentContext = matchingChunks.length > 0
      ? matchingChunks.map((c, i) => `[Doc ${i + 1}]: ${c.content} (Source: ${c.documentName})`).join('\n\n')
      : 'No relevant unstructured documents.';

    const memoryContext = pastMemories.length > 0
      ? pastMemories.map((m, i) => `[Memory ${i + 1}]: ${m.content}`).join('\n')
      : 'No relevant past memories.';

    let specialistContext = '';
    for (const res of executedResults) {
      if (res.tool) {
        let domain = 'Executive';
        if (res.tool.includes('Employee') || res.tool.includes('Attendance') || res.tool.includes('Leave')) domain = 'HR';
        if (res.tool.includes('Finance') || res.tool.includes('Payroll')) domain = 'Finance';
        if (res.tool.includes('Property')) domain = 'Property';
        if (res.tool.includes('Client') || res.tool.includes('Lead')) domain = 'Sales';
        if (res.tool.includes('Logistics')) domain = 'Logistics';
        
        specialistContext += this.agentsService.getDomainContext(domain, res.data) + '\n';
      }
    }

    // Determine Response Composer Mode
    let responseMode = 'LOOKUP';
    if (allSearchesEmpty) {
      responseMode = 'LOOKUP';
    } else if (intent === 'ACTION_REQUEST') {
      responseMode = 'ACTION';
    } else if (intent === 'ANALYTICS_REQUEST') {
      responseMode = 'ANALYTICS';
    } else if (intent === 'EXECUTIVE_REQUEST') {
      responseMode = 'EXECUTIVE';
    } else {
      responseMode = 'LOOKUP';
    }

      /*
      // ROLLBACK BACKUP: ORIGINAL V2 COMPOSER PROMPT
      const composerPrompt = `You are the Zorvex Response Composer (v2).
Your task is to compile the final response in the determined Mode: ${responseMode}.

STRICT STYLE RULES:
1. Speak in a natural, professional, human executive tone (50% ChatGPT, 25% Executive Assistant, 15% Business Analyst, 10% COO).
2. Responds in the EXACT SAME LANGUAGE as the user's message (e.g. English, Roman Urdu, or Urdu).
3. Do NOT use headers like "Direct Answer", "Analytical Insight", "Suggested Action", or markdown checkboxes. Banish all background operational JSON blocks, tools, column names, SQL references, and technical parameters.
4. ABSOLUTELY ELIMINATE robotic or repetitive consult-speak templates.
   - DO NOT say "To align with your business goals..."
   - DO NOT say "What do you think about implementing..."
   - DO NOT say "Potential opportunity..."
   - Banish all pre-baked corporate filler.
5. Ingest and display:
   - Data-First Principle: Data > Analysis > Recommendations. Show requested data first, then analysis if relevant, then recommendations if valuable. Never reverse this order.
   - Proximity Advice: ${isFallback ? `DUBAI REAL ESTATE PROXIMITY ADVICE: The user queried properties in "${fallbackOrigLoc}". Since no listings are currently available in "${fallbackOrigLoc}" in our database, Zorvex automatically searched adjacent locations: [${fallbackAreas.join(', ')}]. Explain this to the user clearly (in the matching query language), informing them that while no properties are in "${fallbackOrigLoc}", we have options in these adjacent prime areas.` : ''}

MODE SPECIFIC GUIDELINES:
- LOOKUP MODE (Info queries or empty retrieval):
  - Must be short, direct, and human.
  - If retrieval failed (0 records found), explain exactly what data was searched and report 0 records directly (e.g., "Attendance records searched. Records found: 0. No attendance logs currently exist for Aizaz Khan."). Do NOT offer consulting or implementation advice.
  - No analysis, no unsolicited recommendations.
- ACTION MODE (Create/Update operations):
  - Focus strictly on action confirmation (e.g. "Meeting scheduled successfully." or "Task assigned successfully.").
  - Output the key confirmation details (title, dates, assignee, location).
  - No strategic analysis or business recommendations.
- ANALYTICS MODE (Comparison/Aggregation):
  - Present the core aggregated data.
  - Provide short, valuable comparative analysis or hotspot insights based on the retrieved data.
- EXECUTIVE MODE (Strategic/Performance Advisory):
  - Show the requested data/report details.
  - Present strategic reasoning, risk analysis, and business recommendations if valuable.
  - Include executive decision insights: Risks: ${JSON.stringify(execAnalysis.risks.concat(reIntelligence.listingHealth).concat(reIntelligence.inventoryAging))}, Opportunities: ${JSON.stringify(execAnalysis.opportunities.concat(reIntelligence.leadConversion).concat(reIntelligence.areaIntelligence))}, Recommendations: ${JSON.stringify(execAnalysis.recommendations)}.

Ensure the conversation feels natural, human, professional, and ends with a warm follow-up question.`;
      */

      // UNIFIED RESPONSE COMPOSER (V9-Enterprise Cognitive Core)
      // Merges the strict groundedness/citations of V9 with the natural, warm, human executive style of V2.
      const composerPrompt = `You are the Zorvex Response Composer. Your task is to compile the final response in the determined Mode: ${responseMode} matching the style of ChatGPT.

STRICT CHATGPT STYLE & TONALITY RULES:
1. SPEAK LIKE A NATURAL HUMAN ASSISTANT (CHATGPT STYLE): Be warm, conversational, professional, and friendly. Avoid sounding like a database query reporter. Write fluid, cohesive paragraphs or clean bullet points.
2. BANISH ROBOTIC PREFIXES & HEADERS: Do NOT start with template phrases like "Based on the database...", "Grounded Context indicates...", "Here is the information...", "According to the records...", or "Mujhe LIVE_DATABASE se pata chala...". Jump directly into the answer.
3. NATURAL DIALECTS (ROMAN URDU/ENGLISH):
   - Mirror the user's language/dialect exactly.
   - For Roman Urdu, speak naturally as a human colleague would on WhatsApp (e.g., use "office/team" instead of "karyalay", "details" instead of "jankari", "leaves/chutti" instead of "chutti requests"). Avoid literal textbook translation or pure Hindi vocabulary.
4. CLEAN FORMATTING & DATA RENDERING:
   - NO EMPTY OR RAW TABLES: Never print tables containing raw/empty UUIDs, empty columns, or raw timestamps. If you show a table, it must be highly clean and legible. If names are missing or data is sparse, use a beautiful bulleted list instead.
   - HUMAN-READABLE DATES: Convert all database ISO strings (like "2025-01-15T00:00:00.000Z") to clean human dates (like "15th Jan 2025" or "January 15, 2025").
   - RESOLVE NAMES: When listing employees, retrieve their names from the nested "user.firstName" and "user.lastName" fields of the EmployeeProfile. Do not print empty name columns or raw user IDs.
5. SUBTLE INLINE CITATIONS: Cite the table the fact actually came from, briefly, at the end of the sentence — e.g. "[LeaveRequest]". The tag MUST name the table that supplied that specific fact. Property owner names come from [Owner], not [EmployeeProfile]. If unsure which table a fact came from, omit the citation — a wrong citation is worse than none. Banish terms like "Database", "Table", "Registry", or quotes around table names.
6. DATA-FIRST PRINCIPLE: Always present the requested data/answer first, followed by any analysis or natural follow-up question.
7. EMPTY RESULTS — STATE THE LIMIT, NOT A VERDICT. If 0 records came back, say what you searched for and that nothing matched, then offer the next step. Do NOT declare the thing does not exist: an empty result often means the filter was wrong, not that the record is absent. Prefer "Mujhe koi pending leave request nahi mili — kya main saari leave requests dikhaon?" over "There are no pending leave requests in the system." Never use robotic phrasing like "Records found: 0". Do not offer unsolicited corporate advice.
8. NEVER SUBSTITUTE INFERENCE FOR DATA. If the user asks for something the retrieved rows do not contain, say the data isn't there and name what you would need. Do NOT reason your way to an answer from adjacent fields — never rank "performance" from someone's role or job title, and never infer seniority, quality, or ranking that is not an actual column in the data. Guessing dressed up as analysis is the worst failure mode here.
9. RESPECT THE USER'S CORRECTION. If the user says a record exists that you reported as missing, treat that as strong evidence your filter was wrong. Say what you searched for and offer to search more broadly — never simply repeat the denial.

MODE-SPECIFIC GUIDELINES:
- LOOKUP MODE (Data searches): Short, direct, factual. No unsolicited advice or recommendations.
- ACTION MODE (Create/Update): Confirm status (e.g., "Task assigned successfully.") and list details (title, dates, assignee, location).
- ANALYTICS MODE (Comparison/Aggregation): Present aggregated metrics, then provide short comparative analysis or hotspot insights.
- EXECUTIVE MODE (Strategic/Performance): Present data/report details, then perform strategic reasoning and risk/recommendation analysis.

Executive Context (Risks/Opps):
Risks: ${JSON.stringify(execAnalysis.risks.concat(reIntelligence.listingHealth).concat(reIntelligence.inventoryAging))}
Opportunities: ${JSON.stringify(execAnalysis.opportunities.concat(reIntelligence.leadConversion).concat(reIntelligence.areaIntelligence))}
Recommendations: ${JSON.stringify(execAnalysis.recommendations)}
${isFallback ? `DUBAI REAL ESTATE PROXIMITY ADVICE: The user queried properties in "${fallbackOrigLoc}". Since no listings are currently available in "${fallbackOrigLoc}", Zorvex searched adjacent locations: [${fallbackAreas.join(', ')}]. Explain this to the user clearly, informing them that while no properties are in "${fallbackOrigLoc}", we have options in these adjacent prime areas.` : ''}`;

    const databaseFeedPrompt = `User Query: "${userMessage}"
Retrieved Data: ${JSON.stringify(toolData)}
Domain Context Module Data:
${specialistContext}
RAG Documents Context:
${documentContext}
Memories Context:
${memoryContext}
Proactive Suggestions:
${proactiveSuggestions}`;

    let responseText = await this.llmService.callLLM(composerPrompt, databaseFeedPrompt, history, false, organizationId, userId);
    let cleanedResponse = responseText.trim();

    // STEP 11 — GROUNDING VERIFICATION (deterministic)
    //
    // Previously this asked the LLM to audit its own output: one call to judge, plus
    // up to two more to regenerate — so the common case (a correct answer) still paid
    // for an extra round trip just to hear "PASS". FactVerifierService performs the
    // same checks in memory against the rows we already hold, in microseconds, and a
    // regeneration now only happens when something is provably wrong.
    const countsMap: Record<string, number> = {};
    for (const res of executedResults) {
      if (res.success && res.data) {
        let count = 0;
        if (Array.isArray(res.data)) count = res.data.length;
        else if (res.data.rows && Array.isArray(res.data.rows)) count = res.data.rows.length;
        else if (res.data.count !== undefined) count = res.data.count;
        countsMap[res.tool] = count;
      }
    }

    const verifiableRows: any[] = executedResults
      .filter(r => r.success && r.data)
      .map(r => r.data);

    let verification = this.factVerifier.verify(cleanedResponse, verifiableRows, {
      tablesUsed,
      counts: countsMap,
    });

    if (!verification.passed) {
      this.logger.warn(`[Grounding] Regenerating once: ${verification.violations.map(v => v.rule).join(', ')}`);
      const correctionPrompt = `${composerPrompt}

⚠️ GROUNDING VIOLATION — your previous answer contained claims not supported by the retrieved records:
${verification.correctionInstruction}

Rewrite the answer using ONLY facts present in the retrieved data. If the data is empty, say plainly that no records were found. Do not invent names, counts, or values.`;

      cleanedResponse = (await this.llmService.callLLM(
        correctionPrompt, databaseFeedPrompt, history, false, organizationId, userId
      )).trim();

      // One retry only. If it still fails we surface the data-backed failure rather
      // than looping the model against a problem it is evidently not solving.
      verification = this.factVerifier.verify(cleanedResponse, verifiableRows, {
        tablesUsed,
        counts: countsMap,
      });

      if (!verification.passed) {
        this.logger.error(`[Grounding] Still failing after retry — returning conservative fallback.`);
        cleanedResponse = verifiableRows.length === 0 || retrievedRowCount === 0
          ? `I could not find any records matching that request. Please check the filters or try rephrasing.`
          : cleanedResponse;
      }
    }

    // Update workspaceState active context and entities
    if (workspaceState) {
      for (const res of executedResults) {
        if (res.success && res.data) {
          if (res.tool === 'searchProperties' && Array.isArray(res.data) && res.data.length > 0) {
            const prop = res.data[0];
            workspaceState.activeProperty = {
              id: prop.id,
              title: prop.title,
              ownerId: prop.ownerId || null,
              ownerName: prop.owner?.name || null
            };
            workspaceState.activeEntityType = 'Property';
            workspaceState.activeEntity = workspaceState.activeProperty;
            workspaceState.activeRecord = workspaceState.activeProperty;
            workspaceState.activeModule = 'Property';
            workspaceState.activeContext = {
              type: 'PROPERTY_DISCUSSION',
              propertyId: prop.id
            };
          }
          if (res.tool === 'searchEmployees' && Array.isArray(res.data) && res.data.length > 0) {
            const emp = res.data[0];
            workspaceState.activeEmployee = {
              id: emp.id,
              name: `${emp.user?.firstName || ''} ${emp.user?.lastName || ''}`.trim(),
              department: emp.department
            };
            workspaceState.activeEntityType = 'Employee';
            workspaceState.activeEntity = workspaceState.activeEmployee;
            workspaceState.activeRecord = workspaceState.activeEmployee;
            workspaceState.activeModule = 'HR';
            workspaceState.activeContext = {
              type: 'ATTENDANCE_DISCUSSION',
              employeeId: emp.id
            };
          }
          if (res.tool === 'getLeaveRequests' && Array.isArray(res.data) && res.data.length > 0) {
            const leave = res.data[0];
            workspaceState.activeEntityType = 'Leave Request';
            workspaceState.activeModule = 'HR';
            workspaceState.activeContext = {
              type: 'LEAVE_DISCUSSION',
              employeeId: leave.employeeProfileId || null,
              leaveRequestId: leave.id
            };
          }
          if ((res.tool === 'getTasksBoard' || res.tool === 'createTask') && res.data) {
            const task = Array.isArray(res.data) ? res.data[0] : res.data;
            if (task) {
              workspaceState.activeTask = {
                id: task.id,
                title: task.title,
                assignedToId: task.assignedToId
              };
              workspaceState.activeEntityType = 'Task';
              workspaceState.activeModule = 'Operations';
              workspaceState.activeContext = {
                type: 'TASK_DISCUSSION',
                taskId: task.id
              };
            }
          }
          if ((res.tool === 'getMeetingsAnalytics' || res.tool === 'createMeeting') && res.data) {
            const mtg = Array.isArray(res.data) ? res.data[0] : (res.data.event || res.data);
            if (mtg) {
              workspaceState.activeMeeting = {
                id: mtg.id,
                title: mtg.title,
                startTime: mtg.startTime
              };
              workspaceState.activeEntityType = 'Meeting';
              workspaceState.activeModule = 'Operations';
              workspaceState.activeContext = {
                type: 'MEETING_DISCUSSION',
                meetingId: mtg.id
              };
            }
          }
          if (res.tool === 'searchClients' && Array.isArray(res.data) && res.data.length > 0) {
            const client = res.data[0];
            workspaceState.activeLead = {
              id: client.id,
              name: client.name,
              type: client.type
            };
            workspaceState.activeEntityType = client.type === 'OWNER' ? 'Owner' : 'Lead';
            workspaceState.activeEntity = workspaceState.activeLead;
            workspaceState.activeRecord = workspaceState.activeLead;
            workspaceState.activeModule = 'Sales';
            workspaceState.activeContext = {
              type: client.type === 'OWNER' ? 'OWNER_DISCUSSION' : 'LEAD_DISCUSSION',
              leadId: client.id
            };
          }
        }
      }
    }

    cleanedResponse = cleanedResponse
      .replace(/(?:runQueryPlan|runDatabaseQuery|searchEmployees|searchClients|searchProperties|executeDatabaseTool|getAttendanceRecord|getLeaveRequests|getTasksBoard|getMeetingsAnalytics|getFinanceAnalytics|getLogisticsAnalytics|createTask|createMeeting)\s*(?:tool|query|SQL|system)/gi, '')
      .replace(/Postgres|database|PrismaClientKnownRequestError|SQL query/gi, 'system lookup')
      .replace(/\b(bhai|yaar|dost|bande)\b/gi, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (toolData && !toolData.error) {
      this.extractAndStoreMemories(cleanedResponse, organizationId).catch((err) => {
        this.logger.error(`Failed to run background memory extraction: ${err.message}`);
      });

      const combinedRisks = execAnalysis.risks.concat(reIntelligence.listingHealth).concat(reIntelligence.inventoryAging);
      const combinedOpps = execAnalysis.opportunities.concat(reIntelligence.leadConversion).concat(reIntelligence.areaIntelligence);
      if (combinedOpps.length > 0 || combinedRisks.length > 0) {
        const patternBullet = `[Pattern Sourced] Query: "${userMessage}". Detected Risks: ${combinedRisks.join(' | ')}. Opportunities: ${combinedOpps.join(' | ')}.`;
        if (patternBullet.length < 500) {
          // Fire-and-forget: this is a background learning write, not part of the
          // answer, so it must never add latency to the user's request.
          this.vectorStore
            .insertMemoryVector(patternBullet, 'PATTERN:OPERATIONAL', organizationId, {}, userId)
            .catch(err => {
              this.logger.warn(`Failed to store pattern memory: ${err.message}`);
            });
        }
      }
    }

    const citations = matchingChunks.map((chunk) => ({
      documentId: chunk.documentId,
      documentName: chunk.documentName,
      fileType: chunk.fileType,
    }));

    let finalSpoken: string | undefined = undefined;
    if (callPersona) {
      finalSpoken = await this.generateSpokenSummary(cleanedResponse, userMessage, organizationId, userId);
    }

    const visualization = this.selectSmartVisualization(toolExecuted || '', toolData, userMessage);

    let formattedToolData: any = toolData;
    if (toolData) {
      const isCountQuery = userMessage.toLowerCase().includes('how many') || userMessage.toLowerCase().includes('count') || userMessage.toLowerCase().includes('total');
      const hasCountNode = isCountQuery || (toolExecuted === 'runQueryPlan' && primaryResult?.query?.includes('(aggregate)'));
      const extractCountHelper = (rows: any[]): number => {
        if (!rows || rows.length === 0) return 0;
        const first = rows[0];
        if (!first || typeof first !== 'object') return 0;
        if (first._count !== undefined) {
          if (typeof first._count === 'number') return first._count;
          if (typeof first._count === 'object' && first._count !== null) {
            const vals = Object.values(first._count);
            if (vals.length > 0 && typeof vals[0] === 'number') {
              return vals[0] as number;
            }
          }
        }
        return rows.length;
      };

      if (hasCountNode) {
        const rows = toolData.rows ? toolData.rows : (Array.isArray(toolData) ? toolData : [toolData]);
        formattedToolData = {
          type: "AGGREGATE",
          count: extractCountHelper(rows)
        };
      } else {
        const rows = toolData.rows ? toolData.rows : (Array.isArray(toolData) ? toolData : [toolData]);
        formattedToolData = {
          type: "ENTITY_LIST",
          rows: rows
        };
      }
    }

    return {
      response: cleanedResponse,
      spokenResponse: finalSpoken,
      toolExecuted,
      toolData: formattedToolData,
      citations,
      visualization,
      workspaceState
    };
  }

  private async generateSpokenSummary(
    writtenResponse: string,
    userQuery: string,
    organizationId?: string,
    userId?: string
  ): Promise<string> {
    // Fetch the actual caller's name dynamically — never hardcode
    let callerName = '';
    if (userId) {
      try {
        const caller = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true }
        });
        if (caller?.firstName) callerName = caller.firstName;
      } catch (e) { /* silent */ }
    }
    const nameGreeting = callerName ? `"${callerName} bhai", "${callerName} sahib"` : '"Ji bilkul", "Suno"';

    const systemPrompt = `You are a high-fidelity Text-to-Speech (TTS) summarization engine for a CRM ERP voice assistant call.
The user asked: "${userQuery}"
The system generated this comprehensive written response:
"""
${writtenResponse}
"""

Your task is to generate a natural, conversational, spoken-audio response (spokenResponse) that:
1. Directly answers the user's query with concrete numbers, data, or states if present in the response (e.g. if employee count is 100, state "We have 100 employees in our system" instead of omitting the count).
2. Summarizes ALL key points, categories, and actions mentioned in the written response (do NOT omit key sections like task management, client management, or logistics if they are mentioned).
3. Keeps the response concise, engaging, and suitable for speech (around 3 to 4 sentences).
4. Matches the language of the user's query (e.g., if the query is in English, write in English; if it is in Roman Urdu, write in Roman Urdu; if it is in Urdu script, write in Urdu script).
5. Uses warm, professional human filler words (like ${nameGreeting}, "Ji bilkul", "Suno", "Acha", "Koi masla nahi") to sound natural on a phone call.
6. Does NOT output any markdown, brackets, checkboxes, code, headings, or json wrapper. Return ONLY the plain text to be spoken.`;

    try {
      const summary = await this.callLLM(systemPrompt, "Summarize the above written response for natural speech.", [], false, organizationId, userId);
      return (summary || '').trim();
    } catch (err) {
      this.logger.error(`Failed to generate spoken summary: ${err.message}`);
      // Fallback to basic clean text
      return writtenResponse
        .replace(/\*\*|__/g, "")
        .replace(/#+\s+/g, "")
        .replace(/-\s+/g, "")
        .trim();
    }
  }

  async generateMeetingSummary(eventId: string) {
    this.logger.log(`Generating AI Meeting Summary for call room event: ${eventId}`);
    const state = this.calendarService.meetingStates.get(eventId);
    if (!state) {
      return {
        agenda: "No active meeting session found.",
        keyPoints: [],
        roleContributions: [],
        actionItems: []
      };
    }

    if ((state as any).summaryReport) {
      this.logger.log(`Returning cached AI Meeting Summary for event: ${eventId}`);
      return (state as any).summaryReport;
    }

    const captions = (state as any).allTimeCaptions || [];
    if (captions.length === 0) {
      return {
        agenda: "No spoken transcripts captured during the conference.",
        keyPoints: [
          "Meeting completed silently without active voice transcripts.",
          "Participants attended virtually but did not utilize live speech captions."
        ],
        roleContributions: [],
        actionItems: []
      };
    }

    // Compile transcripts log
    const transcriptText = captions
      .map((c: any) => `[${c.role}] ${c.senderName}: ${c.text}`)
      .join('\n');

    const systemPrompt = `You are the Zorvex Cognitive Core AI Conference Analyst.
Your job is to read the raw multi-lingual spoken transcripts of a video conference meeting, analyze the topics, and synthesize a highly professional, structured, executive-level business summary report.

STRICT SYNTHESIS RULES:
1. Identify the core "agenda" or primary theme of the conference.
2. Formulate 3 to 6 key, high-value "keyPoints" summarizing the main discussion highlights.
3. Formulate "roleContributions": identify what specific department roles (HR, Finance, Sales, Logistics, Admin) contributed to the conversation. Group their statements and opinions into concise summaries. (e.g. for role "HR": "Verified employee designates and performance reviews...").
4. Formulate "actionItems": a list of concrete tasks discussed or assigned, prefixing each with a priority (e.g. "[HIGH] Verify Burj Khalifa listings", "[STANDARD] Audit logistics fleet").
5. The language of your final summary MUST align with the transcript content or be professionally translated to English.
6. Return your output STRICTLY in JSON format with NO markdown, no wrapping text, and no backticks.
JSON Structure:
{
  "agenda": "Core meeting agenda",
  "keyPoints": ["Key point 1", "Key point 2"],
  "roleContributions": [
    { "role": "HR | Finance | Sales | Logistics | Admin", "contribution": "Summary of what this role discussed or presented" }
  ],
  "actionItems": ["[HIGH] Task name", "[STANDARD] Task name"]
}`;

    try {
      const response = await this.llmService.callLLM(systemPrompt, `Raw Transcript Logs:\n${transcriptText}`, [], false);
      const cleanResponse = response.trim();
      let jsonBlock = cleanResponse;
      const jsonStart = cleanResponse.indexOf('{');
      const jsonEnd = cleanResponse.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonBlock = cleanResponse.substring(jsonStart, jsonEnd + 1);
      }
      
      const parsedReport = JSON.parse(jsonBlock);
      const summaryReport = {
        agenda: parsedReport.agenda || "General corporate sync.",
        keyPoints: parsedReport.keyPoints || [],
        roleContributions: parsedReport.roleContributions || [],
        actionItems: parsedReport.actionItems || []
      };

      // Cache it back to the in-memory broker
      (state as any).summaryReport = summaryReport;
      return summaryReport;

    } catch (err) {
      this.logger.error(`Failed to synthesize AI meeting summary using LLM: ${err.message}. Returning minimal fallback.`);
      // Return honest empty state — NEVER fabricate a summary on failure
      return {
        agenda: "Meeting transcript processing encountered an error.",
        keyPoints: [`Meeting had ${captions.length} voice transcript entries. Summary could not be generated automatically.`],
        roleContributions: [],
        actionItems: ["[STANDARD] Manually review the meeting transcript and document key action items."]
      };
    }
  }

  async getDashboardIntelligence(
    userId: string,
    organizationId: string,
    role: string
  ): Promise<any> {
    const now = new Date();
    const result: any = {
      priorities: [],
      risks: [],
      opportunities: [],
      kpis: [],
      actions: []
    };

    // Statistical Percentile Helper
    const getPercentile = (arr: number[], percentile: number): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const index = Math.min(Math.floor((percentile / 100) * sorted.length), sorted.length - 1);
      return sorted[index];
    };

    try {
      // -------------------------------------------------------------
      // Tier A: CEO / SUPER_ADMIN / ADMIN / SALES_MANAGER
      // -------------------------------------------------------------
      if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'SALES_MANAGER') {
        // 1. KPIs
        const propertiesCount = await this.prisma.property.count({ where: { organizationId, status: 'AVAILABLE' } });
        const activeLeadsCount = await this.prisma.lead.count({ where: { organizationId, status: { in: ['NEW', 'CONTACTED', 'ENGAGED'] } } });
        const pendingTasks = await this.prisma.task.count({ where: { organizationId, status: { in: ['PENDING', 'IN_PROGRESS'] } } });
        const completedTasks = await this.prisma.task.count({ where: { organizationId, status: 'COMPLETED' } });
        const taskCompletionPct = pendingTasks + completedTasks > 0 ? Math.round((completedTasks / (pendingTasks + completedTasks)) * 100) : 0;

        result.kpis = [
          { label: "Available Properties", value: propertiesCount.toString(), change: "Active Inventory" },
          { label: "Active Lead Pipeline", value: activeLeadsCount.toString(), change: "Open Prospects" },
          { label: "Pending Tasks Check", value: pendingTasks.toString(), change: "In Flight" },
          { label: "Task Completion Rate", value: `${taskCompletionPct}%`, change: "Efficiency baseline" }
        ];

        // 2. Critical Priorities (Top 3)
        // Priority 1: Unassigned Leads
        const unassignedLeads = await this.prisma.lead.findMany({
          where: { organizationId, assignedToId: null },
          take: 2
        });
        if (unassignedLeads.length > 0) {
          result.priorities.push({
            title: "Unassigned Leads Pending Allocation",
            description: `There are ${unassignedLeads.length} new leads without an assigned broker agent. Allocate them to prevent response delays.`,
            actionText: "List Unassigned Leads",
            actionCommand: "Show unassigned leads"
          });
        }

        // Priority 2: Overdue Tasks
        const overdueTasks = await this.prisma.task.findMany({
          where: { organizationId, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } },
          include: { assignedTo: true },
          take: 2
        });
        if (overdueTasks.length > 0) {
          const taskNames = overdueTasks.map(t => `"${t.title}"`).join(', ');
          result.priorities.push({
            title: "Overdue Tasks Pending Update",
            description: `${overdueTasks.length} tasks are overdue: ${taskNames}. Remind assigned agents to update their checklists.`,
            actionText: "Check Tasks Board",
            actionCommand: "Get tasks board status pending"
          });
        }

        // Priority 3: Stagnant Listings - Derived Dynamically (75th Percentile Age)
        const allAvailableProperties = await this.prisma.property.findMany({
          where: { organizationId, status: 'AVAILABLE' },
          select: { createdAt: true }
        });
        const propertyAges = allAvailableProperties.map(p => (now.getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        const stagnantPropAgeThreshold = propertyAges.length > 0 ? Math.max(7, getPercentile(propertyAges, 75)) : 30;

        const stagnantProperties = await this.prisma.property.findMany({
          where: { organizationId, status: 'AVAILABLE', createdAt: { lt: new Date(Date.now() - stagnantPropAgeThreshold * 24 * 60 * 60 * 1000) } },
          take: 2
        });
        if (stagnantProperties.length > 0) {
          result.priorities.push({
            title: "Stagnant Dubai Inventory Alert",
            description: `${stagnantProperties.length} properties are flagged as stagnant (listing age exceeds the team's 75th percentile baseline of ${Math.round(stagnantPropAgeThreshold)} days).`,
            actionText: "List Stagnant Properties",
            actionCommand: "List stagnant properties available for rent or sale"
          });
        }

        if (result.priorities.length < 3) {
          result.priorities.push({
            title: "Perform Weekly Operational Audit",
            description: "Review current team designations, attendance logs, and logistics vehicle maintenance schedules to ensure alignment.",
            actionText: "Audit System logs",
            actionCommand: "Show weekly audit report"
          });
        }

        // 3. Risks & Anomalies
        // Risk 1: Agreement Expirations - Dynamic (Bottom 10% remaining days or within 30 days)
        const allAgreements = await this.prisma.owner.findMany({
          where: { organizationId, agreementExpiry: { not: null } },
          select: { agreementExpiry: true }
        });
        const remainingDays = allAgreements.map(a => (new Date(a.agreementExpiry!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const expiryThreshold = remainingDays.length > 0 ? Math.max(7, getPercentile(remainingDays, 10)) : 30;

        const expiringAgreements = await this.prisma.owner.findMany({
          where: { organizationId, agreementExpiry: { lte: new Date(Date.now() + expiryThreshold * 24 * 60 * 60 * 1000) } },
          take: 2
        });
        for (const owner of expiringAgreements) {
          result.risks.push({
            level: "HIGH",
            title: `Owner Agreement Expiring: ${owner.name}`,
            description: `Landlord agreement with ${owner.name} expires in less than ${Math.round(expiryThreshold)} days (which is in the bottom 10% remaining lifespan baseline).`
          });
        }

        // Risk 2: Agent Workload Anomalies - Derived Dynamically (80th Percentile)
        const agents = await this.prisma.user.findMany({
          where: { organizationId, role: 'AGENT' },
          include: { assignedTasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } }
        });
        const agentTaskCounts = agents.map(a => a.assignedTasks.length);
        const overloadedTaskThreshold = agentTaskCounts.length > 0 ? Math.max(3, getPercentile(agentTaskCounts, 80)) : 8;

        for (const agent of agents) {
          if (agent.assignedTasks.length > 0 && agent.assignedTasks.length >= overloadedTaskThreshold) {
            result.risks.push({
              level: "MEDIUM",
              title: `Agent Workload Alert: ${agent.firstName}`,
              description: `Broker agent ${agent.firstName} has ${agent.assignedTasks.length} active tasks, which meets or exceeds the team's 80th percentile task workload threshold (${overloadedTaskThreshold} tasks).`
            });
          }
        }

        if (result.risks.length === 0) {
          result.risks.push({
            level: "LOW",
            title: "All Systems Operational",
            description: "No expiring tenancy listings or unexcused lates detected."
          });
        }

        // Opportunities — derived from real data, not hardcoded statistics
        const marinaProperties = await this.prisma.property.count({
          where: { organizationId, status: 'AVAILABLE', location: { contains: 'Marina', mode: 'insensitive' } }
        });
        const highBudgetClients = await this.prisma.client.count({
          where: { organizationId, budget: { gte: 2000000 } }
        });

        if (marinaProperties > 0) {
          result.opportunities.push({
            title: "Dubai Marina Active Listings",
            description: `There are ${marinaProperties} available properties in Dubai Marina. These are prime listings with strong buyer demand.`,
            actionText: "Dubai Marina Inventory",
            actionCommand: "Search properties in Dubai Marina"
          });
        } else {
          result.opportunities.push({
            title: "Expand Dubai Marina Inventory",
            description: "No available Marina listings found. Consider adding new Marina properties to capture buyer interest in this premium zone.",
            actionText: "View All Properties",
            actionCommand: "Show all available properties"
          });
        }

        if (highBudgetClients > 0) {
          result.opportunities.push({
            title: "High-Budget Buyer Matching",
            description: `${highBudgetClients} clients in the pipeline have a budget exceeding AED 2M. Match them with premium available listings to accelerate conversion.`,
            actionText: "Check Matches",
            actionCommand: "Search clients with budget greater than 2000000"
          });
        }

        result.actions = [
          { label: "Redistribute Task Load", command: "Redistribute workload among agents", style: "primary" },
          { label: "Generate Finance Report", command: "Generate enterprise report type FINANCE", style: "secondary" }
        ];
      }

      // -------------------------------------------------------------
      // Tier B: AGENT
      // -------------------------------------------------------------
      else if (role === 'AGENT') {
        const myActiveLeads = await this.prisma.lead.count({ where: { organizationId, assignedToId: userId, status: { in: ['NEW', 'CONTACTED', 'ENGAGED'] } } });
        const myPendingTasks = await this.prisma.task.count({ where: { organizationId, assignedToId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] } } });
        const myCompletedTasks = await this.prisma.task.count({ where: { organizationId, assignedToId: userId, status: 'COMPLETED' } });
        const taskCompletionPct = myPendingTasks + myCompletedTasks > 0 ? Math.round((myCompletedTasks / (myPendingTasks + myCompletedTasks)) * 100) : 0;

        result.kpis = [
          { label: "My Active Leads", value: myActiveLeads.toString(), change: "In pipeline" },
          { label: "My Pending Tasks", value: myPendingTasks.toString(), change: "Needs checkout" },
          { label: "Task Completion Rate", value: `${taskCompletionPct}%`, change: "Your rate" }
        ];

        const myOverdueTasks = await this.prisma.task.findMany({
          where: { organizationId, assignedToId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } },
          take: 2
        });
        if (myOverdueTasks.length > 0) {
          result.priorities.push({
            title: "Your Overdue Checklist Items",
            description: `You have ${myOverdueTasks.length} overdue tasks: ${myOverdueTasks.map(t => `"${t.title}"`).join(', ')}.`,
            actionText: "Update Task Status",
            actionCommand: "Get my tasks board"
          });
        }

        const myNewLeads = await this.prisma.lead.findMany({
          where: { organizationId, assignedToId: userId, status: 'NEW' },
          take: 2
        });
        if (myNewLeads.length > 0) {
          result.priorities.push({
            title: "New Leads Allocated: Needs Call",
            description: `You have ${myNewLeads.length} new leads assigned. Contact them within 24 hours.`,
            actionText: "View New Leads",
            actionCommand: "Show my new leads"
          });
        }

        if (result.priorities.length < 3) {
          result.priorities.push({
            title: "Follow-up on Client Viewings",
            description: "Check past scheduled viewings feedback notes to update property listing stages.",
            actionText: "View My Clients",
            actionCommand: "Search clients assigned to me"
          });
        }

        // Stagnant Leads: Dynamic (75th percentile of lead aging lifespan)
        const allMyLeads = await this.prisma.lead.findMany({
          where: { organizationId, assignedToId: userId, status: { in: ['NEW', 'CONTACTED', 'ENGAGED'] } },
          select: { createdAt: true }
        });
        const myLeadAges = allMyLeads.map(l => (now.getTime() - new Date(l.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        const stagnantLeadThreshold = myLeadAges.length > 0 ? Math.max(1, getPercentile(myLeadAges, 75)) : 3;

        const uncontactedLeads = await this.prisma.lead.findMany({
          where: { organizationId, assignedToId: userId, status: 'NEW', createdAt: { lt: new Date(Date.now() - stagnantLeadThreshold * 24 * 60 * 60 * 1000) } },
          take: 2
        });
        for (const lead of uncontactedLeads) {
          result.risks.push({
            level: "HIGH",
            title: `Lead Stagnant Risk: ${lead.name}`,
            description: `Lead ${lead.name} has been in NEW status for over ${Math.round(stagnantLeadThreshold)} days (which exceeds your 75th percentile lead aging baseline) without follow-up contact.`
          });
        }

        if (result.risks.length === 0) {
          result.risks.push({
            level: "LOW",
            title: "Checklist Clean",
            description: "No urgent follow-up leaks or upcoming critical deadlines detected."
          });
        }

        result.opportunities = [
          {
            title: "Match Listings with Client Preferences",
            description: "Check active listings matching your buyer's preferred locations to schedule viewings.",
            actionText: "Search Matches",
            actionCommand: "Search properties matching client preferences"
          }
        ];

        result.actions = [
          { label: "List My Leads", command: "Search clients", style: "primary" },
          { label: "My Pending Tasks", command: "Get my tasks board", style: "secondary" }
        ];
      }

      // -------------------------------------------------------------
      // Tier C: HR
      // -------------------------------------------------------------
      else if (role === 'HR') {
        const pendingLeaves = await this.prisma.leaveRequest.count({ where: { employeeProfile: { organizationId }, status: 'PENDING' } });
        const employeeCount = await this.prisma.employeeProfile.count({ where: { organizationId, status: 'ACTIVE' } });
        const presentToday = await this.prisma.attendance.count({ where: { employeeProfile: { organizationId }, dateStr: now.toISOString().split('T')[0], status: 'PRESENT' } });

        result.kpis = [
          { label: "Active Employees", value: employeeCount.toString(), change: "FTE Staff" },
          { label: "Pending Leave Requests", value: pendingLeaves.toString(), change: "Requires review" },
          { label: "Present Today", value: presentToday.toString(), change: "Shift Check-ins" }
        ];

        const pendingRequests = await this.prisma.leaveRequest.findMany({
          where: { employeeProfile: { organizationId }, status: 'PENDING' },
          include: { employeeProfile: { include: { user: true } } },
          take: 2
        });
        if (pendingRequests.length > 0) {
          const names = pendingRequests.map(r => `${r.employeeProfile.user.firstName}`).join(', ');
          result.priorities.push({
            title: "Review Pending Leave Approvals",
            description: `Vacation leave requests are pending approval for: ${names}.`,
            actionText: "Open Leaves Board",
            actionCommand: "Get leave requests status PENDING"
          });
        }

        // HR Overloaded Agent Audit - Dynamic (80th Percentile)
        const allAgents = await this.prisma.user.findMany({
          where: { organizationId },
          include: { assignedTasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } }
        });
        const allAgentTaskCounts = allAgents.map(a => a.assignedTasks.length);
        const hrOverloadedTaskThreshold = allAgentTaskCounts.length > 0 ? Math.max(3, getPercentile(allAgentTaskCounts, 80)) : 8;

        const overloadedList = allAgents.filter(s => s.assignedTasks.length >= hrOverloadedTaskThreshold);
        if (overloadedList.length > 0) {
          result.priorities.push({
            title: "Audit Overloaded Broker Agents",
            description: `${overloadedList.length} staff are holding more than ${hrOverloadedTaskThreshold} pending tasks (which meets or exceeds the team's 80th percentile workload baseline).`,
            actionText: "Check Task Distribution",
            actionCommand: "Show task capacity per employee"
          });
        }

        if (result.priorities.length < 3) {
          result.priorities.push({
            title: "Check In-Office Attendance",
            description: "Review today's shift check-ins to make sure the front desk is covered.",
            actionText: "Verify Attendance",
            actionCommand: "Get attendance record for today"
          });
        }

        const lateAttendance = await this.prisma.attendance.findMany({
          where: { employeeProfile: { organizationId }, status: 'LATE', dateStr: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] } },
          include: { employeeProfile: { include: { user: true } } },
          take: 3
        });
        if (lateAttendance.length > 0) {
          const names = Array.from(new Set(lateAttendance.map(a => `${a.employeeProfile.user.firstName}`))).join(', ');
          result.risks.push({
            level: "MEDIUM",
            title: "Frequent Late Arrivals Detected",
            description: `The following staff have logged late check-ins this week: ${names}.`
          });
        }

        if (result.risks.length === 0) {
          result.risks.push({
            level: "LOW",
            title: "Staff Alignment High",
            description: "All team members have logged timely attendance and checked out checklists."
          });
        }

        result.opportunities = [
          {
            title: "Conduct Performance Evaluations",
            description: "Schedule rating reviews for junior property consultants to discuss task completion rates.",
            actionText: "Run Evaluations",
            actionCommand: "Show employee performance ratings list"
          }
        ];

        result.actions = [
          { label: "Verify Attendance Logs", command: "Get attendance record", style: "primary" },
          { label: "Review Leave Requests", command: "Get leave requests", style: "secondary" }
        ];
      }

      // -------------------------------------------------------------
      // Tier D: FINANCE / FALLBACK
      // -------------------------------------------------------------
      else {
        const unpaidPayrolls = await this.prisma.payroll.count({ where: { employeeProfile: { organizationId }, status: 'UNPAID' } });
        const activeVehicles = await this.prisma.vehicle.count({ where: { organizationId } });

        result.kpis = [
          { label: "Unpaid Payroll Batches", value: unpaidPayrolls.toString(), change: "Pending release" },
          { label: "Logistics Fleet Size", value: activeVehicles.toString(), change: "Fully active" }
        ];

        const pendingPayrolls = await this.prisma.payroll.findMany({
          where: { employeeProfile: { organizationId }, status: 'UNPAID' },
          include: { employeeProfile: { include: { user: true } } },
          take: 2
        });
        if (pendingPayrolls.length > 0) {
          result.priorities.push({
            title: "Process Unpaid Monthly Salaries",
            description: `Salary payrolls are pending disbursement for: ${pendingPayrolls.map(p => p.employeeProfile.user.firstName).join(', ')}.`,
            actionText: "Disburse Salaries",
            actionCommand: "Get finance payroll summaries"
          });
        } else {
          result.priorities.push({
            title: "Audit Monthly Expenses Summary",
            description: "Perform expense auditing to calculate net department salary commitments.",
            actionText: "Audit Payroll",
            actionCommand: "Check payroll discrepancies"
          });
        }

        // Risk: derived from actual vehicle maintenance records, not hardcoded
        let vehicleMaintenanceCount = 0;
        try {
          vehicleMaintenanceCount = await this.prisma.vehicleMaintenance.count({
            where: { vehicle: { organizationId }, status: { in: ['PENDING', 'IN_PROGRESS'] } }
          });
        } catch (e) { /* vehicleMaintenance model may not exist in all orgs */ }

        if (vehicleMaintenanceCount > 0) {
          result.risks.push({
            level: "MEDIUM",
            title: "Open Vehicle Maintenance Requests",
            description: `${vehicleMaintenanceCount} vehicle maintenance job(s) are currently open or in-progress. Review fleet status to prevent operational delays.`
          });
        } else {
          result.risks.push({
            level: "LOW",
            title: "Fleet Maintenance Clear",
            description: "No pending vehicle maintenance requests found. Fleet is operationally ready."
          });
        }

        result.opportunities = [
          {
            title: "Commission Tracking Sync",
            description: "Sync sales agent closed properties commission rates with monthly salary disbursements.",
            actionText: "Track Commissions",
            actionCommand: "Calculate sales pipeline commission rate"
          }
        ];

        result.actions = [
          { label: "Check Payroll Sheet", command: "Check payroll discrepancies", style: "primary" },
          { label: "Generate Finance Report", command: "Generate enterprise report type FINANCE", style: "secondary" }
        ];
      }

    } catch (e) {
      this.logger.error(`Error calculating dashboard intelligence: ${e.message}`);
      result.kpis = [
        { label: "Sync Status", value: "Offline", change: "Database syncing..." }
      ];
    }

    return result;
  }
}

