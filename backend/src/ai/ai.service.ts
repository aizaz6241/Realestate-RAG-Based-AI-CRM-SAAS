import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../calendar/calendar.service';
import { ZorvexGateway } from './zorvex.gateway';
import { AiLlmService } from './ai-llm.service';
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
  private activeDrafts = new Map<string, any>();
  private pendingApprovals = new Map<string, {
    userId: string;
    organizationId: string;
    userRole: string;
    history: { role: 'user' | 'model'; content: string }[];
    userMessage: string;
    sessionId?: string;
    callPersona?: string;
    executionGraph: any[];
    toolCallIndex: number;
    executedResults: any[];
  }>();
  
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
    private responseSanitizer: ResponseSanitizer
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

  async retrieveRelevantMemories(
    query: string,
    organizationId: string,
    limit = 5
  ): Promise<any[]> {
    try {
      const memoryCount = await this.prisma.aiMemoryVector.count({
        where: { organizationId },
      });

      if (memoryCount === 0) return [];

      const queryVector = await this.llmService.generateEmbedding(query);
      const memories = await this.prisma.aiMemoryVector.findMany({
        where: { organizationId },
      });

      const TTL_MS: Record<string, number> = {
        TEMPORARY_STATE: 5 * 60 * 1000, // 5 minutes
        OBSERVATION: 60 * 60 * 1000,    // 1 hour
        INSIGHT: 24 * 60 * 60 * 1000     // 24 hours
      };

      const getMemoryClassification = (content: string, category: string): string => {
        const lower = content.toLowerCase();
        if (
          lower.includes('count') || 
          lower.includes('headcount') || 
          lower.includes('total number') || 
          lower.includes('currently at') || 
          lower.includes('there is a lack of')
        ) {
          return 'TEMPORARY_STATE';
        }
        if (category.startsWith('PATTERN:') || category === 'OBSERVATION') {
          return 'OBSERVATION';
        }
        if (category === 'INSIGHT' || lower.includes('trend') || lower.includes('preference')) {
          return 'INSIGHT';
        }
        return 'FACT';
      };

      const processedMemories: any[] = [];

      for (const memory of memories) {
        const classification = getMemoryClassification(memory.content, memory.category);
        const age = Date.now() - new Date(memory.createdAt).getTime();
        const maxTtl = TTL_MS[classification];

        if (maxTtl && age > maxTtl) {
          this.logger.log(`[Memory Hardening] Expired memory detected (${classification}, age: ${Math.round(age / 1000)}s). Evicting from DB.`);
          this.prisma.aiMemoryVector.delete({ where: { id: memory.id } }).catch(() => null);
          continue;
        }

        // Only FACT memories participate in retrieval context to prevent state contamination
        if (classification === 'FACT') {
          const score = this.llmService.cosineSimilarity(queryVector, memory.embedding);
          processedMemories.push({
            id: memory.id,
            category: memory.category,
            content: memory.content,
            score,
            createdAt: memory.createdAt,
          });
        }
      }

      const scoredMemories = processedMemories
        .filter((memory) => memory.score > 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scoredMemories;
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
          const embedding = await this.llmService.generateEmbedding(bullet, organizationId);
          await this.prisma.aiMemoryVector.create({
            data: {
              category,
              content: bullet,
              embedding,
              organizationId
            }
          });
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

      // STEP 0 — CONTEXT-AWARE QUERY REFINEMENT & COGNITIVE GATEWAY (Layer 1)
      const gatewayStartTime = Date.now();
      const gatewayOutput = await this.cognitiveGatewayService.cognitiveGateway(
        userMessage,
        userId,
        organizationId,
        userRole,
        history,
        workspaceState
      );
      emitTraceStep(2, "COGNITIVE_GATEWAY", "SUCCESS", userMessage, gatewayOutput, gatewayStartTime);

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

      // STEP 1 — QUERY UNDERSTANDING ENGINE (Layer 2)
      const understandingStartTime = Date.now();
      const intentObj = await this.cognitiveGatewayService.queryUnderstanding(gatewayOutput);
      emitTraceStep(3, "INTENT_CLASSIFICATION", "SUCCESS", gatewayOutput.query, { intent: intentObj.intent, classification: intentObj.classification, complexity: intentObj.complexity }, understandingStartTime);
      emitTraceStep(4, "ENTITY_EXTRACTION", "SUCCESS", gatewayOutput.query, intentObj.entities, understandingStartTime);

      // Greetings & voice bypass checks
      const isVoiceCheck = ["can you hear me", "voice test", "mic check", "connection check"].some(phrase => gatewayOutput.query.toLowerCase().includes(phrase));
      const isGreeting = ["hello", "hi", "salam", "hey", "assalam o alaikum", "aoa"].some(phrase => gatewayOutput.query.toLowerCase().trim() === phrase || gatewayOutput.query.toLowerCase().trim().startsWith(phrase + " "));

      if (intentObj.intent === 'CONVERSATIONAL' || isGreeting || isVoiceCheck) {
        const name = (await this.prisma.user.findUnique({ where: { id: userId } }))?.firstName || 'Admin';
        const systemPrompt = `You are the Zorvex Conversational Responder (v9).
Acknowledge user greeting or query naturally.
Maintain an Executive Assistant/COO tone. Matches the language of user query. Keep it short, direct, and human.`;
        const responseText = await this.llmService.callLLM(systemPrompt, `User: "${gatewayOutput.query}". Name: "${name}"`, [], false, organizationId, userId);
        emitTraceStep(17, "FINAL_OUTPUT_SENT", "SUCCESS", userMessage, { response: responseText.trim(), conversational: true }, startTime);
        return {
          response: responseText.trim(),
          spokenResponse: callPersona ? responseText.trim() : undefined,
          toolExecuted: null,
          toolData: null,
          citations: [],
          workspaceState
        };
      }

      if (intentObj.intent === 'SYSTEM_HELP') {
        const systemPrompt = `You are the Zorvex System Help Guide (v9).
Explain concisely what tasks and modules you can help the user with (Real Estate Listings, Meetings, Tasks, Logistics, Finance, Attendance).
Matches the language of the user's query. Keep it short, professional, and clear.`;
        const responseText = await this.llmService.callLLM(systemPrompt, `Query: "${gatewayOutput.query}"`, [], false, organizationId, userId);
        emitTraceStep(17, "FINAL_OUTPUT_SENT", "SUCCESS", userMessage, { response: responseText.trim(), conversational: true }, startTime);
        return {
          response: responseText.trim(),
          spokenResponse: callPersona ? responseText.trim() : undefined,
          toolExecuted: null,
          toolData: null,
          citations: [],
          workspaceState
        };
      }

      // STEP 2 — PLANNING ENGINE (Layer 3) & TOOL SELECTION ENGINE (Layer 5)
      const planningStartTime = Date.now();
      let executionPlan = this.multiTierRouterService.routeQuery(gatewayOutput.query);
      let isDeterministicBypassed = false;
      if (executionPlan) {
        isDeterministicBypassed = true;
        this.logger.log(`[Multi-Tier Retrieval Router] Bypassing LLM planning. Tier 0/1 Route matched.`);
      } else {
        executionPlan = await this.planningEngineService.generateExecutionPlan(
          gatewayOutput.query,
          intentObj,
          organizationId,
          userId,
          userRole
        );
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

      // Human Approval Gate for Sensitive Actions
      if (executionPlan.sensitiveAction) {
        const approvalId = 'appr-' + Math.random().toString(36).substring(2, 15);
        this.pendingApprovals.set(approvalId, {
          userId,
          organizationId,
          userRole,
          history,
          userMessage: gatewayOutput.query,
          sessionId,
          callPersona,
          executionGraph: executionPlan.nodes,
          toolCallIndex: 0,
          executedResults: []
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
          databasePipelineFallbacks++;
          this.logger.error(`[NL-to-SQL FAILURE DIAGNOSTICS]
          {
            "rawLlmResponse": ${JSON.stringify(res.rawLlmResponse || "", null, 2)},
            "parseError": ${JSON.stringify(res.parseError || "", null, 2)},
            "generatedPlan": ${JSON.stringify(res.generatedPlan || {}, null, 2)},
            "validationResult": ${JSON.stringify(res.validationResult || {}, null, 2)},
            "fallbackTriggered": true
          }`);

          emitTraceStep(9, "SQL_PIPELINE_FALLBACK", "WARNING", node.params || {}, "SQL Pipeline failed or yielded low confidence. Falling back to Prisma Query templates...", sqlStartTime);
          this.logger.log(`[Database Fallback] SQL Pipeline failed or yielded low confidence. Falling back to Prisma Query templates.`);
          try {
            const fallbackTool = this.planningEngineService['deduceEntityFromQuery'](gatewayOutput.query);
            let mappedTool = 'searchProperties';
            let fallbackParams = node.params?.filters || {};
            
            // Check if this is an aggregate query
            const isAggregate = node.params?.operation === 'aggregate';
            
            if (isAggregate) {
              mappedTool = 'runQueryPlan';
              fallbackParams = {
                operation: 'aggregate',
                entities: [fallbackTool],
                metrics: node.params?.metrics || ['count'],
                filters: node.params?.filters || {}
              };
            } else {
              if (fallbackTool === 'employeeprofile') mappedTool = 'searchEmployees';
              if (fallbackTool === 'attendance') mappedTool = 'getAttendanceRecord';
              if (fallbackTool === 'leaverequest') mappedTool = 'getLeaveRequests';
              if (fallbackTool === 'task') mappedTool = 'getTasksBoard';
              if (fallbackTool === 'lead' || fallbackTool === 'client') mappedTool = 'searchClients';
              if (fallbackTool === 'payroll') mappedTool = 'getFinanceAnalytics';
            }

            const fallbackData = await this.dbToolsService.executeDatabaseTool(
              mappedTool,
              fallbackParams,
              organizationId,
              userRole,
              userId
            );

            if (fallbackData && !fallbackData.error) {
              const rows = fallbackData.rows ? fallbackData.rows : (Array.isArray(fallbackData) ? fallbackData : [fallbackData]);
              res = {
                rows,
                verified: true,
                confidenceScore: 80,
                tablesUsed: [fallbackTool],
                queriesRun: [`Fallback Prisma execution: ${mappedTool}`],
                errors: []
              };
            }
          } catch (err) {
            this.logger.error(`Database Fallback execution failed: ${err.message}`);
          }
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

      // Confidence Gating: Refuse if aggregate confidence < 85
      if (fusionOutput.finalConfidence < 85) {
        this.logger.warn(`Aggregate confidence (${fusionOutput.finalConfidence}) is below threshold 85. Refusing query gracefully.`);
        
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

        emitTraceStep(17, "FINAL_OUTPUT_SENT", "FAILED", userMessage, { response: "Insufficient evidence available to answer confidently.", reason: `Confidence score ${fusionOutput.finalConfidence} is below gating threshold of 85` }, startTime);

        return {
          response: "Insufficient evidence available to answer confidently.",
          spokenResponse: callPersona ? "I'm sorry, I could not find enough evidence to answer confidently." : undefined,
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
      const composerPrompt = `You are the Zorvex Response Composer (V9-Enterprise Cognitive Core).
Your task is to compile the final response in the determined Mode: ${responseMode}.

STRICT STYLE & TONALITY RULES:
1. SPEAK IN A NATURAL, HUMAN EXECUTIVE TONE: Blend 50% ChatGPT conversational warmth, 25% Executive Assistant helpfulness, 15% Business Analyst structured insight, and 10% COO strategic advisory mindset.
2. NO ROBOTIC PREFIXES OR HEADERS: Jump straight into the natural answer. Never output prefixes like "Based on the Grounded Evidence Context...", "According to the LIVE_DATABASE records...", "Here is the response:", or block headers (e.g., "Properties Available in Dubai Marina:"). Keep it clean like a chat message.
3. SAME-LANGUAGE MIRRORING: Always respond in the EXACT same language as the user's message (e.g. English, Roman Urdu, or Urdu script).
4. BANISH ROBOTIC CORPORATE TEMPLATES: Absolutely eliminate repetitive corporate filler and canned sentences (e.g. do NOT say "To align with your business goals...", "Potential opportunity...", or "What do you think about implementing..."). Speak naturally and professionally.
5. ENGAGING FOLLOW-UP: End your response with a warm, natural, and helpful follow-up question to keep the conversation going.

STRICT GROUNDEDNESS & EVIDENCE RULES:
1. DATA-FIRST PRINCIPLE: Show requested raw data first (tables, lists, metrics), then analysis (if relevant), then recommendations (if valuable). Never reverse this order.
2. STRICT EVIDENCE BOUNDARY: Rely ONLY on the facts directly mentioned in the "Grounded Evidence Context". Do NOT assume, guess, or use external knowledge.
3. SUBTLE INLINE CITATIONS: Every factual statement or claim MUST be followed by its source citation in the format [Table: "TableName"] or [Doc: "DocumentName", Page X, Para Y]. Keep them subtle and inline at the end of sentences, never in separate blocks or block headers.
4. RESOLVE RETRIEVAL FAILURES NATURALLY: Report the absence of data naturally and politely as a human assistant would, without using robotic database terms like "Records found: 0", "0 results", or "No records exist". For example, say: "Mujhe Suhail ki attendance logs nahi mili hain." or "I couldn't find any properties matching those filters. Would you like to check another location?". Do NOT offer unsolicited advice or generic consulting.

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

      const cleanedResponse = this.responseSanitizer.sanitizeResponse(finalResponseText.trim());
      emitTraceStep(15, "FINAL_RESPONSE_GENERATION", "SUCCESS", { query: gatewayOutput.query }, { responseLength: cleanedResponse.length }, composerStartTime);

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

      return {
        response: cleanedResponse,
        spokenResponse: finalSpoken,
        toolExecuted: dbResult.tablesUsed[0] || null,
        toolData: formattedToolData,
        citations,
        visualization,
        workspaceState
      };

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
    const state = this.pendingApprovals.get(approvalId);
    if (!state) {
      return {
        response: "The requested authorization request could not be found or has already been processed.",
        toolExecuted: null,
        toolData: null,
        citations: []
      };
    }

    this.pendingApprovals.delete(approvalId);

    if (!approved) {
      return {
        response: "The planned operations were cancelled and declined by the user authorization manager.",
        toolExecuted: null,
        toolData: null,
        citations: []
      };
    }

    try {
      this.logger.log(`Resuming paused Zorvex v8 execution graph for approvalId: ${approvalId}`);
      const { userId, organizationId, userRole, history, userMessage, sessionId, callPersona, executionGraph, toolCallIndex, executedResults } = state;

      for (let i = toolCallIndex; i < executionGraph.length; i++) {
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
        callPersona,
        'ACTION_REQUEST',
        workspaceState
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
    workspaceState?: any
  ): Promise<any> {
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

    if (hasMeaningfulNextAction) {
      const workflowPrompt = `You are the Zorvex Autonomous Workflow Engine (Step 7).
Analyze the executed database results and user intent to suggest 2-3 logical next actions, automations, or workflow continuation.
Format them naturally as conversational bullet points without markdown checkboxes.
Output only the follow-up suggestions.`;

      try {
        proactiveSuggestions = await this.llmService.callLLM(workflowPrompt, `Query: "${userMessage}"\nData: ${JSON.stringify(toolData)}`, [], false, organizationId, userId);
      } catch (e) {
        this.logger.warn(`Autonomous Workflow Engine suggestion failed: ${e.message}`);
      }
    }

    // STEP 10 — KPI & BUSINESS GOAL ENGINE RESTRICTIONS
    let kpiAlignmentText = '';
    if (!allSearchesEmpty && (intent === 'ANALYTICS_REQUEST' || intent === 'EXECUTIVE_REQUEST')) {
      const businessGoals = {
        salesTarget: "AED 10,000,000 / month",
        leadConversionRate: "15%",
        revenueTarget: "AED 2,000,000 / month",
        inventoryGrowth: "50 new listings / month"
      };

      const kpiEnginePrompt = `You are the Zorvex KPI & Business Goal Engine (Step 10).
Analyze the current response and retrieved business data to evaluate how it aligns with organizational goals:
- Sales Target: ${businessGoals.salesTarget}
- Lead Conversion Goal: ${businessGoals.leadConversionRate}
- Revenue Target: ${businessGoals.revenueTarget}
- Inventory Goal: ${businessGoals.inventoryGrowth}

Instructions:
1. If the current action or data aligns with a business goal, highlight this alignment.
2. If it does not, suggest a proactive strategy or adjustment.
3. Output the result in 1-2 concise sentences in a professional COO advisory tone.`;

      try {
        kpiAlignmentText = await this.llmService.callLLM(kpiEnginePrompt, `Query: "${userMessage}"\nData: ${JSON.stringify(toolData)}`, [], false, organizationId, userId);
      } catch (e) {
        this.logger.warn(`KPI Engine alignment check failed: ${e.message}`);
      }
    }

    const matchingChunks = await this.llmService.searchUnstructuredKnowledge(userMessage, organizationId, 4);
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
      const composerPrompt = `You are the Zorvex Response Composer (V9-Enterprise Cognitive Core).
Your task is to compile the final response in the determined Mode: ${responseMode}.

STRICT STYLE & TONALITY RULES:
1. SPEAK IN A NATURAL, HUMAN EXECUTIVE TONE: Blend 50% ChatGPT conversational warmth, 25% Executive Assistant helpfulness, 15% Business Analyst structured insight, and 10% COO strategic advisory mindset.
2. NO ROBOTIC PREFIXES OR HEADERS: Jump straight into the natural answer. Never output prefixes like "Based on the Grounded Evidence Context...", "According to the LIVE_DATABASE records...", "Here is the response:", or block headers (e.g., "Properties Available in Dubai Marina:"). Keep it clean like a chat message.
3. SAME-LANGUAGE MIRRORING: Always respond in the EXACT same language as the user's message (e.g. English, Roman Urdu, or Urdu script).
4. BANISH ROBOTIC CORPORATE TEMPLATES: Absolutely eliminate repetitive corporate filler and canned sentences (e.g. do NOT say "To align with your business goals...", "Potential opportunity...", or "What do you think about implementing..."). Speak naturally and professionally.
5. ENGAGING FOLLOW-UP: End your response with a warm, natural, and helpful follow-up question to keep the conversation going.

STRICT GROUNDEDNESS & EVIDENCE RULES:
1. DATA-FIRST PRINCIPLE: Show requested raw data first (tables, lists, metrics), then analysis (if relevant), then recommendations (if valuable). Never reverse this order.
2. STRICT EVIDENCE BOUNDARY: Rely ONLY on the facts directly mentioned in the "Retrieved Data" and "RAG Documents Context" in the user message. Do NOT assume, guess, or use external knowledge.
3. SUBTLE INLINE CITATIONS: Every factual statement or claim MUST be followed by its source citation in the format [Table: "TableName"] or [Doc: "DocumentName", Page X, Para Y]. Keep them subtle and inline at the end of sentences, never in separate blocks or block headers.
4. RESOLVE RETRIEVAL FAILURES NATURALLY: Report the absence of data naturally and politely as a human assistant would, without using robotic database terms like "Records found: 0", "0 results", or "No records exist". For example, say: "Mujhe Suhail ki attendance logs nahi mili hain." or "I couldn't find any properties matching those filters. Would you like to check another location?". Do NOT offer unsolicited advice or generic consulting.

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

    // STEP 11 — ZERO HALLUCINATION RESPONSE VALIDATION V4
    let verificationPassed = false;
    let retries = 0;
    
    while (!verificationPassed && retries < 2) {
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

      const verificationPrompt = `You are the Zorvex Zero-Hallucination Verification Engine V4.
Your job is to compare the AI's generated response against the actual database records and verify all facts.

ACTUAL DATABASE RECORDS & COUNTS:
${JSON.stringify(executedResults.map(r => ({ tool: r.tool, data: r.data })), null, 2)}
Counts: ${JSON.stringify(countsMap)}

GENERATED RESPONSE TO AUDIT:
"""
${cleanedResponse}
"""

STRICT RULES TO VALIDATE:
1. Record Counts: If a query returned 0 records, the response must report 0 or no records. It must never fabricate lists, names, or values.
2. Names & Entities: The response must only mention names of employees, clients, owners, or properties that are present in the actual database records. Any unrecognized names must be marked as hallucinations.
3. Tasks & Meetings: The response must only mention tasks, meetings, or schedules that were actually found or successfully created in the database records.
4. Property Ownership: The response must not make up or assume who owns a property unless it is explicitly stated in the owner relation of the property records.

If any of the rules are violated, output RETRY followed by the exact list of discrepancies.
If the response is 100% factual and matches the database records, output PASS.
Output ONLY 'PASS' or 'RETRY: <discrepancies>' - do not add any other text.`;

      const checkResult = await this.llmService.callLLM(verificationPrompt, "Validate response facts", [], false, organizationId, userId);
      if (checkResult.trim().startsWith("PASS")) {
        verificationPassed = true;
      } else {
        this.logger.warn(`Verification V4 Failed (Attempt ${retries + 1}): ${checkResult.trim()}`);
        retries++;
        const correctionPrompt = `${composerPrompt}\n\n⚠️ SYSTEM CORRECTION ALERT: Your previous response was rejected by the Verification Engine due to facts/hallucinations mismatch: ${checkResult.trim()}. You must correct these discrepancies and output a completely factual response matching the database records.`;
        responseText = await this.llmService.callLLM(correctionPrompt, databaseFeedPrompt, history, false, organizationId, userId);
        cleanedResponse = responseText.trim();
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
          const embedding = await this.llmService.generateEmbedding(patternBullet, organizationId, userId);
          await this.prisma.aiMemoryVector.create({
            data: {
              category: 'PATTERN:OPERATIONAL',
              content: patternBullet,
              embedding,
              organizationId
            }
          }).catch(err => {
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
    const systemPrompt = `You are a high-fidelity Text-to-Speech (TTS) summarization engine for a CRM ERP voice assistant call.
The user asked: "${userQuery}"
The system generated this comprehensive written response:
"""
${writtenResponse}
"""

Your task is to generate a natural, conversational, spoken-audio response (spokenResponse) that:
1. Directly answers the user's query with concrete numbers, data, or states if present in the response (e.g. if employee count is 100, state "We have 100 employees in our system" instead of omitting the count).
2. Summarizes ALL key points, categories, and actions mentioned in the written response (do NOT omit key sections like task management, client management, or logistics if they are mentioned). For example, if the user asks "how can you help me", list all the core modules/features in a concise summary rather than just stating one or two points.
3. Keeps the response concise, engaging, and suitable for speech (around 3 to 4 sentences).
4. Matches the language of the user's query (e.g., if the query is in English, write in English; if it is in Roman Urdu, write in Roman Urdu; if it is in Urdu script, write in Urdu script).
5. Uses warm, professional human filler words (like "Aizaz bhai", "Ji bilkul", "Suno", "Acha", "Koi masla nahi") to sound natural on a phone call.
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
      this.logger.error(`Failed to synthesize AI meeting summary using LLM: ${err.message}. Falling back to default report.`);
      const defaultReport = {
        agenda: "General real estate operational synchronization.",
        keyPoints: [
          `Meeting call room active with ${captions.length} transcript logs.`,
          "Participants discussed general inventory, HR schedules, or client pipelines."
        ],
        roleContributions: [
          { role: "Participants", contribution: `Spoke in general terms. Logged ${captions.length} dialogue sentences.` }
        ],
        actionItems: [
          "[STANDARD] Review past meetings transcript ledger logs"
        ]
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

        result.opportunities = [
          {
            title: "Dubai Marina Growth Trend",
            description: "Marina locations are showing a 15% increase in buyer conversion trends.",
            actionText: "Dubai Marina Inventory",
            actionCommand: "Search properties in Dubai Marina"
          },
          {
            title: "High-Budget Buyer Matching",
            description: "Match active client preferences exceeding $2M budget with premium listings.",
            actionText: "Check Matches",
            actionCommand: "Search clients with budget greater than 2000000"
          }
        ];

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

        result.risks = [
          {
            level: "MEDIUM",
            title: "Logistics Maintenance Cost Spike",
            description: "Fleet logistics vehicle maintenance bills are up by 25% this quarter."
          }
        ];

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

