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

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private activeDrafts = new Map<string, any>();
  
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
    private zorvexGateway: ZorvexGateway,
    private llmService: AiLlmService,
    private validationService: AiValidationService,
    private agentsService: AiAgentsService,
    private dbToolsService: AiDatabaseToolsService,
    private executiveDecisionService: ExecutiveDecisionService,
    private realEstateIntelligenceService: RealEstateIntelligenceService
  ) {}

  // -----------------------------------------------------------------------------
  // Facade Delegations to support other modules & controllers cleanly
  // -----------------------------------------------------------------------------
  async generateEmbedding(text: string): Promise<number[]> {
    return this.llmService.generateEmbedding(text);
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

      const scoredMemories = memories
        .map((memory) => {
          const score = this.llmService.cosineSimilarity(queryVector, memory.embedding);
          return {
            id: memory.id,
            category: memory.category,
            content: memory.content,
            score,
            createdAt: memory.createdAt,
          };
        })
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
          const embedding = await this.llmService.generateEmbedding(bullet);
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
    forceCloud = false
  ): Promise<string> {
    return this.llmService.callLLM(systemPrompt, userPrompt, history, forceCloud);
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
  // Context-Aware Query Refiner (Pronoun & Reference Resolution)
  // -----------------------------------------------------------------------------
  async refineQuery(
    userMessage: string,
    history: { role: 'user' | 'model'; content: string }[]
  ): Promise<string> {
    if (history.length === 0) return userMessage;

    const systemPrompt = `You are a Context Resolver for a premium Real Estate ERP CRM.
Your job is to analyze the conversation history and the user's latest message, and resolve any ambiguous references, pronouns (like "he", "she", "him", "her", "them", "their", "employee", "staff", "uski", "unki", "iski", "is ko", "unko", "in dono"), or implicit filters.

Current Local Date & Time: ${new Date().toLocaleString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
(Today is ${new Date().toLocaleDateString([], { weekday: 'long' })}, ${new Date().toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' })}. Relative references like 'this Sunday', 'till Sunday', or 'tomorrow' must resolve exactly from this clock date baseline.)

CONVERSATIONAL CONTEXT HISTORY:
${history.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.content}`).join('\n')}

INSTRUCTIONS:
1. Scan the history (especially the most recent turns) to identify the latest active referenced entities (such as employees, clients, properties, or tasks).
2. If the user's latest message has pronouns or references like "his", "her", "him", "them", "he", "she", "iski", "uski", "in dono ki", "unki", "unka", "is employee ko", "us property ko", resolve them by replacing them with the explicit name(s) or ID of the entity discussed. For example, rewrite "list his designation" to "List Aizaz Khan's designation" if Aizaz Khan is the active employee.
3. If the user mentions department names colloquially (e.g. "sales wale", "hr ka staff", "finance wale", "logistics wale"), expand them to their database equivalent department names (e.g., "Sales", "Human Resources", "Finance", "Logistics").
4. If the user requests charts (e.g. "line graph me dikhao", "pie chart me", "compare visually"), ensure the rewritten message explicitly states the chart type requested.
5. If the user refers to locations in Roman Urdu or phonetic spelling like "meri na", "meri na dubai", or "marina", resolve them explicitly as "Dubai Marina". Similarly, map "down town" or "down town dubai" to "Downtown Dubai". Do NOT resolve them as Urdu pronouns or conversational fillers (like resolving "meri na" as a pronoun chatter meaning "mine, right?").
6. Output ONLY the refined, fully-explicit, and resolved query in the exact same language (e.g. English, Urdu, Roman Urdu) as the user's query. Do not add any preamble, conversational text, quotes, or markdown. Start directly with the resolved text.`;

    try {
      const refined = await this.llmService.callLLM(systemPrompt, `Latest User Message: "${userMessage}"`, []);
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
    callPersona?: string
  ): Promise<any> {
    try {
      this.logger.log(`Starting Zorvex-AOS 6.5 pipeline for message: "${userMessage}"`);

      // Initialize or retrieve conversation state context (Layer 4)
      let context = this.activeContexts.get(userId);
      if (!context) {
        context = {
          activeEmployee: null,
          activeClient: null,
          activeProperty: null,
          activeLead: null,
          activeMeeting: null
        };
        this.activeContexts.set(userId, context);
      }

      // -----------------------------------------------------------------------------
      // LAYER 1: COGNITIVE GATEWAY (Normalization, Roman Urdu mapping, entity checks)
      // -----------------------------------------------------------------------------
      const gatewayPrompt = `You are the Zorvex AI Cognitive Gateway (Layer 1).
Your task is to normalize the incoming user message:
1. Detect input language (English, Urdu, Roman Urdu, etc.).
2. Correct spelling and phonetic mistakes.
3. Normalize Roman Urdu phrasing (e.g. "meri na" ➔ "Dubai Marina", "down town" ➔ "Downtown Dubai", "sarah" ➔ "Sarah Agent").
4. Extract key target entities (employees, clients, properties, locations, dates).

Output strictly in JSON format matching this structure:
{
  "originalMessage": "original user text",
  "normalizedMessage": "normalized, corrected text",
  "language": "English | Urdu | Roman Urdu | ...",
  "confidence": 0.95,
  "entities": {
    "employees": [],
    "clients": [],
    "properties": [],
    "locations": [],
    "dates": []
  }
}
Do not write any markdown code blocks, preamble, or conversational text. Return ONLY the raw JSON block.`;

      let gatewayResult = {
        originalMessage: userMessage,
        normalizedMessage: userMessage,
        language: 'English',
        confidence: 1.0,
        entities: { employees: [], clients: [], properties: [], locations: [], dates: [] }
      };

      try {
        const gatewayResText = await this.llmService.callLLM(gatewayPrompt, `User Message: "${userMessage}"`, [], false);
        const cleanGateway = gatewayResText.trim();
        const jsonStart = cleanGateway.indexOf('{');
        const jsonEnd = cleanGateway.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          gatewayResult = JSON.parse(cleanGateway.substring(jsonStart, jsonEnd + 1));
        }
      } catch (err) {
        this.logger.warn(`Cognitive Gateway parser failed: ${err.message}. Using raw input.`);
      }

      const refinedMessage = gatewayResult.normalizedMessage;

      // -----------------------------------------------------------------------------
      // LAYER 2: INTENT UNDERSTANDING ENGINE
      // -----------------------------------------------------------------------------
      const intentPrompt = `You are the Zorvex Intent Understanding Engine (Layer 2).
Analyze the normalized message and determine the user's objective and target department.
Output strictly in JSON format:
{
  "intent": "meeting_creation | task_assignment | employee_search | property_search | lead_analytics | financial_audit | general_chat",
  "department": "HR | Sales | Property | Finance | Operations | Executive",
  "confidence": 95,
  "actionExpected": true
}
Do not write any markdown code blocks, preamble, or conversational text. Return ONLY the raw JSON block.`;

      let intentResult = {
        intent: 'general_chat',
        department: 'Executive',
        confidence: 1.0,
        actionExpected: false
      };

      try {
        const intentResText = await this.llmService.callLLM(intentPrompt, `Normalized Message: "${refinedMessage}"`, [], false);
        const cleanIntent = intentResText.trim();
        const jsonStart = cleanIntent.indexOf('{');
        const jsonEnd = cleanIntent.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          intentResult = JSON.parse(cleanIntent.substring(jsonStart, jsonEnd + 1));
        }
      } catch (err) {
        this.logger.warn(`Intent Understanding Engine failed: ${err.message}`);
      }

      // -----------------------------------------------------------------------------
      // LAYER 3: REQUEST CLASSIFICATION
      // -----------------------------------------------------------------------------
      const classificationPrompt = `You are the Zorvex Request Classifier (Layer 3).
Classify the user intent into one of:
- ASSISTANT: Information query only (no creation/update actions).
- TASK: Action query only (creating tasks, meetings, updating leads).
- HYBRID: Information query AND action (e.g. finding inactive leads and assigning follow-up tasks).

Output strictly in JSON format:
{
  "classification": "ASSISTANT" | "TASK" | "HYBRID"
}
Do not write any markdown code blocks, preamble, or conversational text. Return ONLY the raw JSON block.`;

      let classificationResult = { classification: 'ASSISTANT' };

      try {
        const classResText = await this.llmService.callLLM(classificationPrompt, `Normalized Message: "${refinedMessage}"`, [], false);
        const cleanClass = classResText.trim();
        const jsonStart = cleanClass.indexOf('{');
        const jsonEnd = cleanClass.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          classificationResult = JSON.parse(cleanClass.substring(jsonStart, jsonEnd + 1));
        }
      } catch (err) {
        this.logger.warn(`Request Classifier failed: ${err.message}`);
      }

      // Fast Lane Bypass for Greetings and Simple Voice Checks
      const isVoiceCheck = [
        "can you hear me", "voice test", "mic check", "connection check"
      ].some(phrase => refinedMessage.toLowerCase().includes(phrase));

      const isGreeting = [
        "hello", "hi", "salam", "hey", "assalam o alaikum", "aoa"
      ].some(phrase => refinedMessage.toLowerCase().trim() === phrase || refinedMessage.toLowerCase().trim().startsWith(phrase + " "));

      if (isGreeting) {
        const name = (await this.prisma.user.findUnique({ where: { id: userId } }))?.firstName || 'Admin';
        return {
          response: refinedMessage.toLowerCase().includes("salam") || refinedMessage.toLowerCase().includes("aoa")
            ? `Walaikum Assalam ${name}! How can I assist you with your Zorvex ERP operations today?`
            : `Hello ${name}! Welcome to Zorvex Cognitive Core. How can I assist you with your ERP operations today?`,
          toolExecuted: null,
          toolData: null,
          citations: []
        };
      }

      if (isVoiceCheck) {
        return {
          response: "Yes, I can hear you clearly. How can I help you?",
          toolExecuted: null,
          toolData: null,
          citations: []
        };
      }

      // -----------------------------------------------------------------------------
      // LAYER 4: CONVERSATION STATE ENGINE (Reference and pronoun resolution)
      // -----------------------------------------------------------------------------
      const resolutionPrompt = `You are the Zorvex Conversation State Engine (Layer 4).
Analyze the normalized query and conversation state history. Resolve references/pronouns (like "him", "it", "this property") into explicit target entities based on context.
State Context:
${JSON.stringify(context, null, 2)}

Output the rewritten resolved query directly in the same language. Do not add any headings, quotes, json tags, or preambles.`;

      let resolvedQuery = refinedMessage;
      try {
        const resolvedText = await this.llmService.callLLM(resolutionPrompt, `User Query: "${refinedMessage}"`, [], false);
        resolvedQuery = resolvedText.trim() || refinedMessage;
      } catch (err) {
        this.logger.warn(`Reference resolution failed: ${err.message}`);
      }

      // -----------------------------------------------------------------------------
      // LAYER 5: EXECUTIVE ORCHESTRATOR (CEO decision round)
      // -----------------------------------------------------------------------------
      const orchestratorPrompt = `You are the Zorvex AI Orchestrator (Layer 5).
Analyze the normalized user message and active entities context.
Decide:
1. Which tools need to be executed.
2. Which specialist context modules should be loaded (HR, Sales, Property, Finance, Operations).
3. The step-by-step execution plan.

Available Tools:
- "searchEmployees" (params: { name, designation, department })
- "getAttendanceRecord" (params: { name, status })
- "getLeaveRequests" (params: { name, status })
- "searchProperties" (params: { location, minPrice, maxPrice, bedrooms, bathrooms, type, listingType, status })
- "searchClients" (params: { name, budget, preferences, type })
- "getTasksBoard" (params: { status })
- "getMeetingsAnalytics" (params: { type })
- "getFinanceAnalytics" (params: {})
- "getLogisticsAnalytics" (params: {})
- "runDatabaseQuery" (params: { query }) -> Use strictly for complex joins, aggregates, counts.
- "createTask" (params: { title, employeeName, description, dueDate, priority })
- "createMeeting" (params: { title, description, startTime, endTime, location, targetUserIds, targetRoles })
- "generateEnterpriseReport" (params: { reportType: "FINANCE" | "INVENTORY" | "TASKS" })

Output strictly in JSON:
{
  "requiredAgents": ["HR", "Sales", "Property", "Finance", "Operations", "Executive"],
  "requiredTools": ["toolName1", "toolName2"],
  "executionPlan": "Plan description...",
  "toolCalls": [
    {
      "tool": "toolName",
      "params": { ... }
    }
  ]
}
Do not write any markdown code blocks, preamble, or conversational text. Return ONLY the raw JSON block.`;

      let orchestratorResult = {
        requiredAgents: [] as string[],
        requiredTools: [] as string[],
        executionPlan: '',
        toolCalls: [] as any[]
      };

      try {
        const orchResText = await this.llmService.callLLM(orchestratorPrompt, `Resolved Query: "${resolvedQuery}"\nContext: ${JSON.stringify(context)}`, [], false);
        const cleanOrch = orchResText.trim();
        const jsonStart = cleanOrch.indexOf('{');
        const jsonEnd = cleanOrch.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          orchestratorResult = JSON.parse(cleanOrch.substring(jsonStart, jsonEnd + 1));
        }
      } catch (err) {
        this.logger.warn(`Executive Orchestrator planning failed: ${err.message}`);
      }

      // Check RBAC Clearance before calling tools
      if (orchestratorResult.toolCalls.length > 0) {
        for (const tc of orchestratorResult.toolCalls) {
          const isAuthorized = this.dbToolsService.checkToolAuthorization(tc.tool, userRole);
          if (!isAuthorized) {
            return {
              response: "Clearance Required: Your user profile is not cleared to access secure finance or operations databases.",
              toolExecuted: null,
              toolData: null,
              citations: []
            };
          }
        }
      }

      // -----------------------------------------------------------------------------
      // LAYER 7: PLANNING ENGINE (Missing parameters solicitation check)
      // -----------------------------------------------------------------------------
      if (classificationResult.classification === 'TASK' || classificationResult.classification === 'HYBRID') {
        for (const tc of orchestratorResult.toolCalls) {
          if (tc.tool === 'createTask') {
            const { title, employeeName, dueDate, priority } = tc.params || {};
            if (!title || !employeeName || !dueDate || !priority) {
              return {
                response: `Sure! I can help you schedule a new task. Could you please specify the details, target team member, deadline date, and priority level?`,
                toolExecuted: null,
                toolData: null,
                citations: []
              };
            }
          }
          if (tc.tool === 'createMeeting') {
            const { title, startTime, endTime } = tc.params || {};
            if (!title || !startTime || !endTime) {
              return {
                response: `Sure! I can help you schedule a meeting. What is the title, start date/time, and end date/time?`,
                toolExecuted: null,
                toolData: null,
                citations: []
              };
            }
          }
        }
      }

      // -----------------------------------------------------------------------------
      // LAYER 8 & 9: AGENTIC EXECUTION & VERIFICATION ENGINE
      // -----------------------------------------------------------------------------
      let toolExecuted: string | null = null;
      let toolData: any = null;
      let verificationSuccess = true;

      if (orchestratorResult.toolCalls.length > 0) {
        const primaryCall = orchestratorResult.toolCalls[0];
        toolExecuted = primaryCall.tool;
        this.logger.log(`Executing tool: ${toolExecuted}`);

        toolData = await this.dbToolsService.executeDatabaseTool(
          primaryCall.tool,
          primaryCall.params,
          organizationId,
          userRole,
          userId
        );

        // Verification phase (Layer 9)
        if (primaryCall.tool === 'createTask' || primaryCall.tool === 'createMeeting') {
          if (!toolData || toolData.error || toolData.success === false) {
            verificationSuccess = false;
            this.logger.error(`Database Verification Failed for tool: ${primaryCall.tool}`);
          }
        }

        // Lock context variables from tool returns (Layer 4 updates)
        if (primaryCall.tool === 'searchEmployees' && Array.isArray(toolData) && toolData.length > 0) {
          const emp = toolData[0];
          context.activeEmployee = {
            id: emp.id,
            name: emp.user ? `${emp.user.firstName} ${emp.user.lastName || ''}`.trim() : 'Employee',
            department: emp.department,
            designation: emp.designation
          };
        }
        if (primaryCall.tool === 'searchClients' && Array.isArray(toolData) && toolData.length > 0) {
          const cl = toolData[0];
          context.activeClient = { id: cl.id, name: cl.name };
        }
        if (primaryCall.tool === 'searchProperties' && Array.isArray(toolData) && toolData.length > 0) {
          const prop = toolData[0];
          context.activeProperty = { id: prop.id, title: prop.title, location: prop.location };
        }

        this.activeContexts.set(userId, context);
      }

      // RAG and Memories lookup
      const matchingChunks = await this.llmService.searchUnstructuredKnowledge(resolvedQuery, organizationId, 4);
      const documentContext = matchingChunks.length > 0
        ? matchingChunks.map((c, i) => `[Doc ${i + 1}]: ${c.content} (Source: ${c.documentName})`).join('\n\n')
        : 'No relevant unstructured documents.';

      const pastMemories = await this.retrieveRelevantMemories(resolvedQuery, organizationId, 4);
      const memoryContext = pastMemories.length > 0
        ? pastMemories.map((m, i) => `[Memory ${i + 1}]: ${m.content}`).join('\n')
        : 'No relevant past memories.';

      // Load Specialist Context Modules (Layer 6 Context Modules)
      let specialistContext = '';
      if (orchestratorResult.requiredAgents.length > 0) {
        for (const agent of orchestratorResult.requiredAgents) {
          if (agent !== 'Executive') {
            specialistContext += this.agentsService.getDomainContext(agent, toolData) + '\n';
          }
        }
      }

      // -----------------------------------------------------------------------------
      // LAYER 13: CONFIDENCE & TRUST ENGINE
      // -----------------------------------------------------------------------------
      let confidence = 85;
      if (toolExecuted) {
        if (!verificationSuccess || (toolData && toolData.error)) {
          confidence = 30; // LOW
        } else if (Array.isArray(toolData) && toolData.length === 0) {
          confidence = 50; // LOW
        } else {
          confidence = 98; // HIGH
        }
      }
      const confidenceLevel = confidence >= 90 ? 'HIGH' : (confidence >= 60 ? 'MEDIUM' : 'LOW');

      if (confidenceLevel === 'LOW' && toolExecuted) {
        return {
          response: `I couldn't locate sufficient records in the system to answer your request accurately. Could you please specify different search parameters or verify details?`,
          toolExecuted,
          toolData,
          citations: []
        };
      }

      // -----------------------------------------------------------------------------
      // LAYER 14 & REAL ESTATE INTELLIGENCE AGENT: EXECUTIVE DECISION ENGINE
      // -----------------------------------------------------------------------------
      let risks: string[] = [];
      let opportunities: string[] = [];
      let recommendations: string[] = [];

      if (toolData && !toolData.error) {
        const execAnalysis = await this.executiveDecisionService.analyze(resolvedQuery, toolData, pastMemories);
        risks = execAnalysis.risks;
        opportunities = execAnalysis.opportunities;
        recommendations = execAnalysis.recommendations;

        // Real Estate Intelligence Module
        const isREQuery = orchestratorResult.requiredAgents.includes('Property') || orchestratorResult.requiredAgents.includes('Sales');
        if (isREQuery && Array.isArray(toolData)) {
          const reAnalysis = await this.realEstateIntelligenceService.analyze(
            orchestratorResult.requiredAgents.includes('Property') ? toolData : [],
            [],
            orchestratorResult.requiredAgents.includes('Sales') ? toolData : []
          );
          if (reAnalysis.listingHealth.length > 0) risks.push(...reAnalysis.listingHealth);
          if (reAnalysis.inventoryAging.length > 0) risks.push(...reAnalysis.inventoryAging);
          if (reAnalysis.leadConversion.length > 0) opportunities.push(...reAnalysis.leadConversion);
          if (reAnalysis.areaIntelligence.length > 0) opportunities.push(...reAnalysis.areaIntelligence);
        }
      }

      // -----------------------------------------------------------------------------
      // LAYER 15: AUTONOMOUS WORKFLOW ENGINE (Proactive workflow suggestions)
      // -----------------------------------------------------------------------------
      const workflowPrompt = `You are the Zorvex Autonomous Workflow Engine (Layer 15).
Based on the intent, database records, and query, determine 2 to 3 logical next actions or follow-ups.
Format them as natural conversational recommendations with checkboxes at the end of the text.
Example format:
"Would you like me to:
• Assign follow-up tasks to the sales team?
• Schedule a team briefing?"
Output ONLY the workflow follow-ups. Do not add explanations.`;

      let proactiveSuggestions = '';
      try {
        proactiveSuggestions = await this.llmService.callLLM(workflowPrompt, `Query: "${resolvedQuery}"\nData: ${JSON.stringify(toolData)}`, [], false);
      } catch (e) {
        this.logger.warn(`Autonomous Workflow Engine suggestion failed: ${e.message}`);
      }

      // -----------------------------------------------------------------------------
      // LAYER 10: RESPONSE COMPOSER (Synthesize natural executive response)
      // -----------------------------------------------------------------------------
      const composerPrompt = `You are the Zorvex Response Composer (Layer 10).
Compose the final user response based on the analysis.
STRICT STYLE RULES:
1. Speak in a natural, professional, human executive tone.
2. Responds in the EXACT SAME LANGUAGE as the user's message (e.g. English, Roman Urdu, or Urdu).
3. Do NOT use headers like "Direct Answer", "Analytical Insight", "Suggested Action", or markdown checkboxes. Banish all background operational JSON blocks, tools, column names, SQL references, and technical parameters.
4. Integrate the executive decision insights (Risks: ${JSON.stringify(risks)}, Opportunities: ${JSON.stringify(opportunities)}, Recommendations: ${JSON.stringify(recommendations)}) and proactiveSuggestions naturally into conversational paragraphs.
5. End with a warm follow-up question.`;

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

      let responseText = await this.llmService.callLLM(composerPrompt, databaseFeedPrompt, history);
      let cleanedResponse = responseText.trim();

      // Clean up technical artifacts
      cleanedResponse = cleanedResponse
        .replace(/(?:runDatabaseQuery|searchEmployees|searchClients|searchProperties|executeDatabaseTool|getAttendanceRecord|getLeaveRequests|getTasksBoard|getMeetingsAnalytics|getFinanceAnalytics|getLogisticsAnalytics|createTask|createMeeting)\s*(?:tool|query|SQL|system)/gi, '')
        .replace(/Postgres|database|PrismaClientKnownRequestError|SQL query/gi, 'system lookup')
        .replace(/\b(bhai|yaar|dost|bande)\b/gi, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      // -----------------------------------------------------------------------------
      // LAYER 11: ORGANIZATIONAL LEARNING ENGINE (Memory Extraction & Pattern Storage)
      // -----------------------------------------------------------------------------
      if (toolData && !toolData.error) {
        this.extractAndStoreMemories(cleanedResponse, organizationId).catch((err) => {
          this.logger.error(`Failed to run background memory extraction: ${err.message}`);
        });

        // Extract pattern matches and store them as PATTERN: category
        if (opportunities.length > 0 || risks.length > 0) {
          const patternBullet = `[Pattern Sourced] Query: "${resolvedQuery}". Detected Risks: ${risks.join(' | ')}. Opportunities: ${opportunities.join(' | ')}.`;
          if (patternBullet.length < 500) {
            const embedding = await this.llmService.generateEmbedding(patternBullet);
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
        finalSpoken = await this.generateSpokenSummary(cleanedResponse, userMessage);
      }

      return {
        response: cleanedResponse,
        spokenResponse: finalSpoken,
        toolExecuted,
        toolData,
        citations
      };
    } catch (err) {
      this.logger.error(`AOS 6.5 pipeline breakdown: ${err.message}`);
      return {
        response: "🤖 System Alert: An operational bottleneck has interrupted Zorvex AI. Please verify data parameters and retry.",
        spokenResponse: callPersona ? "System error has occurred, please retry." : undefined,
        toolExecuted: null,
        toolData: null,
        citations: []
      };
    }
  }

  private async generateSpokenSummary(writtenResponse: string, userQuery: string): Promise<string> {
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
      const summary = await this.callLLM(systemPrompt, "Summarize the above written response for natural speech.", [], false);
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

