import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../calendar/calendar.service';
import { ZorvexGateway } from './zorvex.gateway';
import { AiLlmService } from './ai-llm.service';
import { AiValidationService } from './ai-validation.service';
import { AiAgentsService, AgentOutput } from './ai-agents.service';
import { AiDatabaseToolsService } from './ai-database-tools.service';

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
    private dbToolsService: AiDatabaseToolsService
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
5. Output ONLY the refined, fully-explicit, and resolved query in the exact same language (e.g. English, Urdu, Roman Urdu) as the user's query. Do not add any preamble, conversational text, quotes, or markdown. Start directly with the resolved text.`;

    try {
      const refined = await this.llmService.callLLM(systemPrompt, `Latest User Message: "${userMessage}"`, []);
      this.logger.log(`Query refined successfully: "${userMessage}" -> "${refined.trim()}"`);
      return refined.trim() || userMessage;
    } catch (err) {
      this.logger.warn(`Failed to refine query: ${err.message}. Using original.`);
      return userMessage;
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
    history: { role: 'user' | 'model'; content: string }[] = [],
    callPersona?: string
  ): Promise<any> {
    try {
      // -----------------------------------------------------------------------------
      // STEP 1 & 2: INTENT CLASSIFICATION & DECIDE RESPONSE TYPE
      // -----------------------------------------------------------------------------
      const normalizedMessage = userMessage.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");

      const isVoiceCheckPhrase = [
        "can you hear me", "are you there", "voice test", "mic check", "connection check",
        "can you hear", "hear me", "you there", "are you listening", "testing testing",
        "voice check", "mic test", "can you hear me now"
      ].some(phrase => normalizedMessage.includes(phrase));

      const isGreetingPhrase = [
        "hello", "hi", "salam", "hey", "hola", "assalam o alaikum", "aoa", "salam alaikum"
      ].some(phrase => normalizedMessage === phrase || normalizedMessage.startsWith(phrase + " "));

      const isSimpleAckPhrase = [
        "thank you", "thanks", "shukriya", "ok", "okay", "cool", "nice", "acha", "fine"
      ].some(phrase => normalizedMessage === phrase);

      // FAST LANE BYPASS
      if (isGreetingPhrase) {
        this.logger.log(`Fast Lane Match: Greeting detected ("${userMessage}"). Responding instantly with personalization.`);
        const userRecord = await this.prisma.user.findUnique({
          where: { id: userId }
        });
        const name = userRecord ? userRecord.firstName : 'Admin';
        const greeting = normalizedMessage.includes("salam") || normalizedMessage.includes("aoa") 
          ? `Walaikum Assalam ${name}! How can I assist you with your Zorvex ERP operations today?`
          : `Hello ${name}! Welcome to Zorvex Cognitive Core. How can I assist you with your ERP operations today?`;
        
        return {
          response: greeting,
          toolExecuted: null,
          toolData: null,
          citations: []
        };
      }

      if (isVoiceCheckPhrase) {
        this.logger.log(`Fast Lane Match: Voice check detected ("${userMessage}"). Responding instantly.`);
        return {
          response: "Yes, I can hear you clearly. How can I help you?",
          toolExecuted: null,
          toolData: null,
          citations: []
        };
      }

      if (isSimpleAckPhrase) {
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
        "property", "properties", "apartment", "villa", "rent", "sale", "price", "location", "bedrooms", "bathrooms",
        "client", "buyer", "seller", "investor", "lead", "budget", "crm", "deal", "deals", "close", "closed", "closing", "transaction", "transactions",
        "employee", "staff", "designation", "department", "salary", "payroll", "joining", "manager", "admin", "admins", "role", "roles", "super_admin",
        "finance", "expense", "allowance", "deduction", "agent", "agents", "broker", "brokers",
        "meeting", "calendar", "event", "attendee", "absent", "viewing", "viewings", "interest", "interests",
        "leave", "vacation", "sick", "annual", "owner", "owners", "landlord", "landlords", "agreement", "agreements",
        "vehicle", "fleet", "logistics", "maintenance", "plate", "driver", "drivers", "key", "keys", "tag",
        "attendance", "checkin", "checkout", "shift", "check-in", "check-out", "present", "late", "absent",
        "query", "table", "database", "db", "search", "find", "list", "show", "get", "calculate", "how many", "how much", "total", "count", "number of", "who", "which", "whom", "whose",
        "analytics", "chart", "graph", "report", "application", "request", "apply", "status", "profile", "record", "history"
      ];
      
      const hasErpKeywords = erpKeywords.some(kw => normalizedMessage.includes(kw)) ||
        /kiraya|bechna|kharidna|daftar|mulazim|tankhaw|paisa|chutti|ghari|gari|haazri|hazri|kam|kitne|kitni|kitna|total/i.test(normalizedMessage);

      const isTaskAssignmentFlow = /assign|task|zimadari|kaam|duty|create task|task assign/i.test(normalizedMessage);

      // Force live query execution for dynamic status check queries (Rule 2 Sync Fix)
      const isDynamicStatusQuery = /status|haal|haalat|kya chal raha|complete|pending|approved|rejected|check-in|checkout/i.test(normalizedMessage);

      const allowDbTools = hasErpKeywords || isTaskAssignmentFlow || isDynamicStatusQuery;
      const skipRefine = !allowDbTools;

      let refinedMessage = userMessage;
      if (!skipRefine) {
        refinedMessage = await this.refineQuery(userMessage, history);
      }

      // -----------------------------------------------------------------------------
      // MEMORY PERSISTENCE
      // -----------------------------------------------------------------------------
      let lastResolvedEmployee: any = null;
      let lastResolvedClient: any = null;
      let lastResolvedTask: any = null;

      // Retrieve stateful task draft from singleton Map
      let activeTaskDraft = this.activeDrafts.get(userId);
      if (!activeTaskDraft) {
        activeTaskDraft = {
          employeeName: null,
          employeeId: null,
          title: null,
          dueDate: null,
          priority: null
        };
        this.activeDrafts.set(userId, activeTaskDraft);
      }

      // 1. Scan conversational history to resolve entities and options
      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i] as any;
        if (msg.role === 'model') {
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
          if (msg.toolExecuted === 'searchClients' && msg.toolData && Array.isArray(msg.toolData) && msg.toolData.length > 0) {
            if (!lastResolvedClient) {
              const cl = msg.toolData[0];
              lastResolvedClient = {
                id: cl.id,
                name: cl.name
              };
            }
          }
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
          const titleMatch = msg.content.match(/(?:title|title is|kaam hai|task is)\s+["']?([^"'\n]+)["']?/i);
          if (titleMatch && !activeTaskDraft.title) {
            activeTaskDraft.title = titleMatch[1].trim();
          }
        }
      }

      // 2. Parse potential properties from the latest user message to update draft
      const textLower = userMessage.toLowerCase();
      if (!activeTaskDraft.dueDate) {
        const dateMatch = textLower.match(/\b\d{4}-\d{2}-\d{2}\b/);
        if (dateMatch) {
          activeTaskDraft.dueDate = dateMatch[0];
        } else if (textLower.includes("tomorrow") || textLower.includes("kal")) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          activeTaskDraft.dueDate = tomorrow.toISOString().split('T')[0];
        }
      }
      if (!activeTaskDraft.priority) {
        if (textLower.includes("urgent") || textLower.includes("fori") || textLower.includes("zaroori")) {
          activeTaskDraft.priority = "URGENT";
        } else if (textLower.includes("high") || textLower.includes("ahmiyat")) {
          activeTaskDraft.priority = "HIGH";
        } else if (textLower.includes("standard") || textLower.includes("normal") || textLower.includes("aam")) {
          activeTaskDraft.priority = "STANDARD";
        }
      }
      const currentTitleMatch = userMessage.match(/(?:title|title is|kaam hai|task is)\s+["']?([^"'\n]+)["']?/i);
      if (currentTitleMatch && !activeTaskDraft.title) {
        activeTaskDraft.title = currentTitleMatch[1].trim();
      }

      // Save the updated stateful task draft
      this.activeDrafts.set(userId, activeTaskDraft);

      const memoryContext = `
ACTIVE CONVERSATIONAL REFERENCE MEMORY (Rule 7):
- Last Resolved Employee: ${lastResolvedEmployee ? `${lastResolvedEmployee.name} (${lastResolvedEmployee.designation} from ${lastResolvedEmployee.department}, Profile ID: ${lastResolvedEmployee.id})` : 'None'}
- Last Resolved Client: ${lastResolvedClient ? `${lastResolvedClient.name} (ID: ${lastResolvedClient.id})` : 'None'}
- Last Resolved Task: ${lastResolvedTask ? `"${lastResolvedTask.title}" (ID: ${lastResolvedTask.id})` : 'None'}
- Active Task Draft State: ${JSON.stringify(activeTaskDraft)}
`;

      const userRecord = await this.prisma.user.findUnique({
        where: { id: userId }
      });
      const userName = userRecord ? `${userRecord.firstName} ${userRecord.lastName || ''}`.trim() : 'User';

      const matchingChunks = await this.llmService.searchUnstructuredKnowledge(refinedMessage, organizationId, 4);
      
      const documentContext = matchingChunks.length > 0
        ? `UNSTRUCTURED KNOWLEDGE DOCUMENTS (RAG):\n${matchingChunks
            .map((c, i) => `[Doc ${i + 1}]: ${c.content} (Source: ${c.documentName})`)
            .join('\n\n')}`
        : 'No unstructured knowledge documents relevant to this query found.';

      const pastMemories = await this.retrieveRelevantMemories(refinedMessage, organizationId, 4);
      const memoryPromptContext = pastMemories.length > 0
        ? `PAST ORGANIZATIONAL MEMORIES & HISTORICAL PATTERNS (Rule 9):\n${pastMemories
            .map((m, i) => `[Memory ${i + 1}] (${m.category}): ${m.content} (Recorded: ${new Date(m.createdAt).toLocaleDateString()})`)
            .join('\n')}`
        : 'No past organizational memories relevant to this query found.';

      let systemPrompt = `You are the Zorvex Multi-Agent Real Estate Intelligence Operating System (Zorvex-AOS 5.0) Orchestrator.
You are NOT a chatbot. You coordinate specialized AI domain agents and manage real estate operations utilizing live database insights.

AVAILABLE LIVE DATABASE TOOLS (STRICT JSON FORMAT ONLY):
If you need to retrieve or write any operational data, employee information, attendance, tasks, or metrics, you MUST output ONLY a single raw JSON block matching this exact structure, with NO surrounding text, no conversational disclaimers, and no markdown:
{
  "tool": "TOOL_NAME",
  "params": { ... }
}

You have access ONLY to the following 12 database tools:
1. "searchEmployees": Search for employee names, profiles, department, or designation.
   - Params: { "name": "Fuzzy employee name", "designation": "Designation", "department": "Department" }
   - Example (Find 'Sara'): {"tool": "searchEmployees", "params": {"name": "Sara"}}
2. "getAttendanceRecord": Fetch daily shift attendance check-ins, check-outs, and shift logs.
   - Params: { "name": "Fuzzy employee name to filter", "status": "PRESENT | ABSENT | LATE | ON_LEAVE" }
3. "getLeaveRequests": Fetch vacation, sick leave, or holiday requests.
   - Params: { "name": "Fuzzy employee name to filter", "status": "PENDING | APPROVED | REJECTED" }
4. "searchProperties": Search real estate property listings.
   - Params: { "location": "Dubai Marina | Downtown | etc", "minPrice": 100000, "maxPrice": 50000000, "bedrooms": 3, "bathrooms": 4, "type": "VILLA | APARTMENT", "listingType": "SALE | RENT", "status": "PUBLISHED | DRAFT | SOLD" }
5. "searchClients": Search CRM buyers, sellers, or investors.
   - Params: { "name": "Fuzzy name", "budget": 10000000, "preferences": "3 Bed", "type": "BUYER | SELLER | INVESTOR" }
6. "getTasksBoard": Get tasks list or Kanban board.
   - Params: { "status": "PENDING | IN_PROGRESS | COMPLETED" }
7. "getMeetingsAnalytics": Get calendar meetings, virtual/physical attendance, present/absent stats.
   - Params: { "type": "VIRTUAL | PHYSICAL" }
8. "getFinanceAnalytics": Get department payroll metrics, net vs base salaries. (Cleared for HR, Finance, Admin).
   - Params: {}
9. "getLogisticsAnalytics": Get fleet vehicles, maintenance costs, plate numbers, logistics schedules. (Cleared for Logistics, Admin).
   - Params: {}
10. "runDatabaseQuery": Run a raw read-only SQL query for complex joins, aggregations, trend analytics, or counts (e.g. total employee counts or owner property distribution).
    - Params: { "query": "SELECT COUNT(*) FROM \"EmployeeProfile\" WHERE ... (Ensure proper double quotes on camelCase table/column names)" }
    - SCHEMA REFERENCE FOR SQL QUERIES (CRITICAL):
      * Table "User" columns: "id", "email", "passwordHash", "firstName", "lastName", "role" (SUPER_ADMIN | ADMIN | SALES_MANAGER | AGENT | HR | LOGISTICS | FINANCE), "isActive", "organizationId", "createdAt", "updatedAt"
        (⚠️ IMPORTANT: "User" does NOT have a "name" column! You must use "firstName" and "lastName"! E.g. SELECT "firstName", "lastName" FROM "User")
      * Table "EmployeeProfile" columns: "id", "userId", "department", "designation", "salary", "status" (ACTIVE | ON_LEAVE | TERMINATED), "organizationId", "joiningDate", "createdAt", "updatedAt"
      * Table "Property" columns: "id", "title", "description", "type", "status" (DRAFT | PUBLISHED | SOLD | RENTED | AVAILABLE), "listingType" (SALE | RENT), "price", "location", "bedrooms", "bathrooms", "areaSqft", "images" (text array), "amenities" (text array), "ownerId", "assignedToId", "organizationId", "createdAt", "updatedAt"
      * Table "Client" columns: "id", "name", "email", "phone", "type" (BUYER | SELLER | INVESTOR), "stage" (INQUIRY | VIEWING | OFFER | CLOSED), "budget", "preferences", "assignedToId", "organizationId", "createdAt", "updatedAt"
      * Table "Lead" columns: "id", "name", "email", "phone", "source", "status" (NEW | CONTACTED | ENGAGED | DISQUALIFIED | CLOSED), "score", "isDuplicate" (boolean), "duplicateOfId", "notes", "assignedToId", "organizationId", "createdAt", "updatedAt"
      * Table "Task" columns: "id", "title", "description", "status" (PENDING | IN_PROGRESS | COMPLETED), "dueDate", "assignedToId", "createdById", "organizationId", "createdAt", "updatedAt"
      * Table "LeaveRequest" columns: "id", "startDate", "endDate", "type" (SICK | CASUAL | ANNUAL | UNPAID), "status" (PENDING | APPROVED | REJECTED), "reason", "approvedAt", "employeeProfileId", "createdAt", "updatedAt"
      * Table "Attendance" columns: "id", "dateStr" (YYYY-MM-DD), "checkIn", "checkOut", "status" (PRESENT | LATE | ABSENT | ON_LEAVE), "checkoutSummary", "employeeProfileId", "createdAt", "updatedAt"
      * Table "PerformanceReview" columns: "id", "reviewDate", "rating" (1-5), "feedback", "reviewedById", "employeeProfileId", "createdAt", "updatedAt"
      * Table "Owner" columns: "id", "name", "email", "phone", "status" (ACTIVE | INACTIVE), "kycVerified" (boolean), "kycNotes", "commissionRate", "agreementExpiry", "assignedToId", "organizationId", "createdAt", "updatedAt"
      * Table "Vehicle" columns: "id", "modelName", "plateNumber", "status" (ACTIVE | MAINTENANCE | OUT_OF_SERVICE), "organizationId", "createdAt", "updatedAt"
      * Table "VehicleMaintenance" columns: "id", "description", "cost", "status" (PENDING | COMPLETED | CANCELLED), "requestDate", "completionDate", "vehicleId"
      * Table "LogisticsSchedule" columns: "id", "visitDate", "pickupLocation", "dropLocation", "status" (SCHEDULED | IN_TRANSIT | COMPLETED | CANCELLED), "driverId", "vehicleId", "viewingId", "createdAt", "updatedAt"
      * Table "Payroll" columns: "id", "month" (YYYY-MM), "baseSalary", "allowances", "deductions", "netSalary", "status" (UNPAID | PAID), "paidAt", "employeeProfileId", "createdAt", "updatedAt"
      * Table "CalendarEvent" columns: "id", "title", "description", "startTime", "endTime", "location", "isPrivate", "targetRoles" (text array), "targetUserIds" (text array), "createdById", "organizationId", "createdAt", "updatedAt"
      * Table "KeyTracker" columns: "id", "keyTag", "status" (IN_OFFICE | CHECKED_OUT | LOST), "propertyId", "createdAt", "updatedAt"
      * Table "KeyCheckout" columns: "id", "checkoutDate", "returnDate", "notes", "keyId", "userId"
      * Table "LeadActivity" columns: "id", "type" (CALL | EMAIL | NOTES | STATUS_CHANGE), "description", "activityDate", "leadId"
      * Table "PropertyPriceHistory" columns: "id", "price", "changeDate", "propertyId"
      * Table "ClientPropertyInterest" columns: "id", "clientId", "propertyId", "createdAt"
      * Table "ClientViewing" columns: "id", "viewingDate", "feedback", "status" (SCHEDULED | COMPLETED | CANCELLED), "clientId", "propertyId", "createdAt"
      * Table "ClientCommunication" columns: "id", "type" (CALL | EMAIL | MEETING | WHATSAPP), "summary", "date", "clientId"

    - DYNAMIC RELATIONAL & TEMPORAL MAPPING GUIDE (AUTONOMOUS THINKING):
      * **Dynamic Temporal Math**: Translate any user-specified duration dynamically (e.g. "unsold for X days", "joined in last Y months", "created Z weeks ago") by performing mathematical date comparisons relative to the current baseline date. E.g. '"createdAt" < NOW() - INTERVAL '\''25 days'\''' or '"joiningDate" >= NOW() - INTERVAL '\''3 months'\'''.
      * **Dynamic Status & Boolean Deductions**: Match descriptive user terms (e.g., "unassigned", "duplicate", "available", "unpaid") dynamically to matching columns and statuses. E.g., unassigned leads/properties means '"assignedToId" IS NULL'; duplicate leads means '"isDuplicate" = true'; unpaid salary means '"status" = '\''UNPAID'\''' in the Payroll table.
      * **Array Cardinality Checks**: If querying properties with "no images" or "no amenities", use PostgreSQL array functions. E.g., 'cardinality(images) = 0' or 'images IS NULL' or 'array_length(images, 1) IS NULL'.
      * **Dynamic Aggregations & High-Cognition Joins**: Calculate indicators (like "low inquiries", "top performing", "overloaded", "at risk") by dynamically joining tables (e.g., Property + ClientPropertyInterest for interests, User + Lead for conversions) and grouping them with standard SQL aggregations (COUNT, SUM, AVG) ordered with 'LIMIT'.
      * **Edge Case & Hypothetical Reasoning**: For stress-test questions (e.g., "What if sales drop 50%?", "What if top agents resign?"), first query the live database to fetch actual statistics (active lead pipeline, top agents by completed tasks or listings), calculate the hypothetical numeric impact, and generate a strategic mitigation report autonomously based on live counts.
      * **Autonomous Parameter Parsing**: Do not rely on static values. Determine dates, budgets, thresholds, locations, and priorities dynamically from the user's natural query context.
    - HIGH COGNITION JOIN/AGGREGATE RULE: If the user asks about complex aggregates, joins, department checks, rankings, or parameters (e.g. "who is our oldest employee", "who is our top performing agent", "are there any payroll discrepancies", "owner property counts", "HR team task completion"), you MUST write a single raw SELECT query using "runDatabaseQuery"! This ensures maximum real-time precision and high cognitive enterprise intelligence.
    - **CRITICAL SCHEMA & POSTGRESQL RULES (CRITICAL)**:
      1. **NEVER query a table named "Employee" or "PropertyInterest"**. The table for employees is strictly "EmployeeProfile". The table for property interests is strictly "ClientPropertyInterest".
      2. When counting or querying employees, always query "EmployeeProfile" (e.g., SELECT COUNT(*) as count FROM "EmployeeProfile" WHERE status = 'ACTIVE'). Do NOT count "User".
      3. When writing SELECT queries, you MUST select specific individual columns (e.g. u."firstName", ep.salary) or aggregated fields. **NEVER select raw whole table records or relation rows (e.g. SELECT u FROM "User" u, SELECT ep FROM "EmployeeProfile" ep)**, as this returns anonymous composite row types which are unsupported by Prisma and throw a fatal SQL exception! All columns from joined tables must be queried individually.
    - SQL REFERENCE EXAMPLES FOR HIGH COGNITION QUERIES (CRITICAL):
      * Oldest Employee (Minimum joining date):
        SELECT u."firstName", u."lastName", ep."joiningDate", ep."designation" FROM "EmployeeProfile" ep JOIN "User" u ON ep."userId" = u.id WHERE ep."joiningDate" IS NOT NULL ORDER BY ep."joiningDate" ASC LIMIT 1
      * Top Performing Agent (By completed tasks count):
        SELECT u."firstName", u."lastName", COUNT(t.id) as "totalTasks", SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END) as "completedTasks" FROM "User" u LEFT JOIN "Task" t ON t."assignedToId" = u.id WHERE u.role = 'AGENT' GROUP BY u.id, u."firstName", u."lastName" ORDER BY "completedTasks" DESC LIMIT 1
      * Payroll Discrepancy Checks:
        SELECT u."firstName", p.month, p."baseSalary", p.allowances, p.deductions, p."netSalary" FROM "Payroll" p JOIN "EmployeeProfile" ep ON p."employeeProfileId" = ep.id JOIN "User" u ON ep."userId" = u.id WHERE ABS(p."baseSalary" + p.allowances - p.deductions - p."netSalary") > 0.01
      * Vehicle Maintenance Alert:
        SELECT v."modelName", v."plateNumber", COUNT(m.id) as "maintenanceCount" FROM "Vehicle" v LEFT JOIN "VehicleMaintenance" m ON m."vehicleId" = v.id GROUP BY v.id, v."modelName", v."plateNumber"
    - Example (Total Employee Count): {"tool": "runDatabaseQuery", "params": {"query": "SELECT COUNT(*) as count FROM \"EmployeeProfile\" WHERE status = 'ACTIVE'"}}
11. "createTask": Create a new task. (Always follow the strict validation flow first!).
    - Params: { "title": "Task title", "employeeName": "Target employee name", "description": "Details", "dueDate": "YYYY-MM-DD", "priority": "STANDARD | HIGH | URGENT" }
12. "generateEnterpriseReport": Generate a premium, dark-themed, glassmorphic styled executive HTML report of operational metrics.
    - Params: { "reportType": "FINANCE | INVENTORY | TASKS" }
    - Example (Generate payroll/salary report): {"tool": "generateEnterpriseReport", "params": {"reportType": "FINANCE"}}

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
- Current Local Date & Time: ${new Date().toLocaleString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
  (System Clock Date: ${new Date().toISOString().split('T')[0]}, Today's Day: ${new Date().toLocaleDateString([], { weekday: 'long' })}. Any relative date reference from the user, such as 'tomorrow', 'this Sunday', 'till Sunday evening', or 'next Monday', MUST be resolved mathematically based on this system baseline!)

${memoryContext}

PERSONALIZATION PROTOCOL:
- You are communicating directly with ${userName}. Greet them contextually and professionally by name (e.g. "Salam ${userRecord?.firstName || 'Admin'}!" or "Hello ${userRecord?.firstName || 'Admin'}!") where appropriate, and keep the interaction highly personalized to their identity and role within the Zorvex.

STRICT ROLE-BASED ACCESS CONTROL (AI-RBAC) POLICY:
1. Access to sensitive records is strictly cleared based on the Security Role (${userRole}):
   - Finance aggregates, payroll, or individual salaries: CLEAR ONLY for "SUPER_ADMIN", "ADMIN", "HR", and "FINANCE". (All other roles are NOT cleared!)
   - Leaves and attendance details of OTHER employees: CLEAR ONLY for "SUPER_ADMIN", "ADMIN", and "HR". (All other roles are NOT cleared!)
   - A user's OWN leaves, profile, and tasks: EVERY role is fully cleared to query their own info! (e.g. an AGENT can check their own leaves, but NOT another employee's leaves).
   - Logistics fleet details, plate numbers, active schedules, or maintenance costs: CLEAR ONLY for "SUPER_ADMIN", "ADMIN", and "LOGISTICS". (All other roles are NOT cleared!)
2. CLEARANCE & FILLER POLICY:
   - If the user asks for details that are NOT cleared for the Security Role (${userRole}), you MUST decline immediately in natural text without calling any tools!
   - Decline politely in their query language: "Your profile is not cleared to access secure finance databases."
   - **CRITICAL: If the user IS cleared (e.g. SUPER_ADMIN or ADMIN), you MUST NOT write any security checks, UAC notices, or talkative phrases like 'Aapka profile cleared hai'. Output ONLY the raw JSON tool call immediately without any natural text filler!**

STRICT INTENT ROUTING & REAL ESTATE INTELLIGENCE LAYER:
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
6. OUT-OF-SCOPE / UNRELATED QUERY PROTOCOL: If the user asks about concepts, sports players (e.g. 'how many players do we have'), gaming, movies, or entities not managed by the ERP system, you MUST NOT execute any database search tools. Answer directly in their language, politely clarifying that you are the Zorvex ERP AI assistant managing properties, CRM clients, employees, tasks, finances, and logistics fleet. Ask if they meant to inquire about one of these instead. E.g. "We do not track players in our ERP database. I only manage properties, CRM clients, employees, finances, tasks, and vehicle fleet. Did you mean employees?" (Translate this politely to match the user's input language, e.g., Roman Urdu or Urdu script).

ZORVEX COGNITIVE CORE DYNAMIC REASONING ENGINE RULES:
- CORE PRINCIPLE: All business logic must be derived dynamically from data distribution, time context, user intent semantics, comparative analysis, and statistical baselines. You are a reasoning analyst, not a rule-based system.
- RULE 1: NO HARD CODED BUSINESS LOGIC: Never assume fixed days (like 90, 30), fixed scores (like 70, 50), or fixed counts (like 8 tasks). Instead, derive thresholds dynamically using percentile ranking, moving averages, historical comparison, and deviation from mean.
- RULE 2: NATURAL LANGUAGE ➔ SEMANTIC TRANSLATION: Convert user input into Entity, Intent, Temporal meaning, Comparative meaning, Risk/Opportunity signal. (Example: "25 days se unsold properties" ➔ Entity: Property, Signal: stagnation, Time: dynamic interval of 25 days, Condition: deviation from normal selling cycle).
- RULE 3: TEMPORAL INTELLIGENCE ENGINE: Interpret time expressions dynamically:
  * "recently" = last 7–14 days (context-based)
  * "long time" = above median lifecycle
  * "overdue" = beyond expected lifecycle (computed dynamically, not fixed)
  * "fast/slow" = relative to dataset distribution
- RULE 4: BEHAVIORAL ANALYTICS ENGINE: For humans (agents, leads), do NOT use fixed thresholds. Instead, compute percentile ranking, performance deviation, trend slope, and momentum score.
- RULE 5: SELF-ADJUSTING SYSTEM: Continuous adjustment of what "hot lead", "overloaded agent", or "slow property" means based on last 30–90 days data, seasonal patterns, and company performance trends.

STRICT ENTITY RESOLUTION & ERROR FLOW FIX:
1. NEVER directly trust raw user names. For any employee lookup or task assignment query, trigger "searchEmployees" to verify their identity and evaluate their "similarityScore":
   - Similarity Score > 0.85 (85%) ➔ High confidence! Auto-select the employee and proceed with the flow.
   - Similarity Score between 0.60 and 0.85 (60%-85%) ➔ Medium confidence! You MUST stop and request user confirmation: "Did you mean Muhammad Aizaz Khan from Human Resources?" Do NOT auto-select or call "createTask" yet!
   - Similarity Score < 0.60 (60%) or no match found ➔ Low confidence! You MUST suggest the closest match and ask: "Did you mean [Closest Match Name] from [Department]?" or request clarification.
2. Never say "no employee found" or "not found" if a similar employee exists. Always keep the conversation flowing by offering closest options!
3. Maintain persistent identity. When pronouns like "he", "she", "him", "her", "uski", "unko" are used, resolve them contextually to the active employee in the "ACTIVE CONVERSATIONAL REFERENCE MEMORY" block.

STRICT LANGUAGE ALIGNMENT POLICY:
1. **You MUST respond in the EXACT same language as the user's message.**
   - If the user writes in English, your response MUST be in English.
   - If the user writes in Urdu script, your response MUST be in Urdu script.
   - If the user writes in Roman Urdu, your response MUST be in Roman Urdu.
   - If the user writes in Persian, Russian, or Turkish, your response MUST be in that exact language.
2. DO NOT mix languages, and never default to Roman Urdu if the user queried in English.
3. **NEVER start your response with any preamble, disclaimer, translation note, or language declaration statement (such as 'Here is the response in the exact same language as...'). Directly start answering the user's question. Forbidding any preamble is absolute!**

STRICT REAL-TIME ACCURACY & TOOL ENFORCEMENT:
1. **You DO NOT know the actual metrics of this database internally.** For example, if the user asks "how many employees we have?", you DO NOT know the count until you execute the corresponding tool!
2. You MUST call the live database tools for any property, task, employee, finance, meeting, client, or leave queries.
3. NEVER guess, estimate, or hallucinate counts or names.
4. If a previous turn in the history contains fake hallucinated numbers, ignore them and ALWAYS execute the live database tool to get the real, actual database records!
5. STRICT ATTENDANCE VS LEAVE DIFFERENTIATION: If the user asks about daily shift attendance, check-in, check-out, or shift logs, you MUST execute "getAttendanceRecord". If they ask about vacations, sick days, or leaves, you MUST execute "getLeaveRequests". Do NOT mix them up!
6. EMPTY DATABASE RESULTS RESOLUTION: If you query a tool like "getAttendanceRecord" or "getLeaveRequests" with a status filter like "ABSENT" or "ON_LEAVE" and it returns an empty array ([]), it means the employee was NEVER absent or on leave for that period! Do NOT claim that their records are incomplete, missing, or require Direct Verification from HR! Simply state clearly that they have no records of absences, meaning they have been fully present.

CONVERSATIONAL RULES & WORKFLOWS:
1. Respond completely like a professional, clear, minimal friendly Operations Coordinator / Executive Assistant. Avoid excessive informal language or chatty filler. Prohibit casual Urdu terms like "bhai" or "yaar" entirely. Keep responses professional, clear, minimal, and highly focused.
2. CONCISE & DIRECT (CRITICAL): Only answer exactly what the user asked. If the user asks if an employee exists (e.g. "Do we have an employee named Sarah?"), reply with a brief, friendly confirmation and let them ask follow-up questions (e.g., "Yes! Sarah Agent is currently active in our Sales department as a Junior Property Consultant. Would you like me to pull up her attendance or leave details?"). Do NOT dump their salary, joining date, shift logs, or long recommendations unless explicitly asked!
3. NO HALLUCINATED RECOMMENDATIONS: Do not propose random administrative tasks, workload audits, or lists of unverified staff names (like Bob, John, Jane) unless they are returned in the tool database records. Stick strictly to facts!
4. PREMIUM VISUALS: Avoid ugly robotic markdown templates. Instead, write in a clean, beautifully spaced human layout with elegant line breaks and clean, meaningful emojis.
4. FOLLOW-UP QUESTIONS: If the user asks a follow-up question and the relevant data is already present in history, you can answer from history ONLY for static company policies. For active operational statuses (like tasks status, vehicle check-ins, leave requests status, attendance, or pipelines), you MUST ALWAYS trigger the database tools to verify the live real-time status!
5. NO ROBOTIC DIRECT-CREATION / STRICT TASK VALIDATION FLOW:
   - NEVER create a task (i.e. do NOT call the "createTask" tool) automatically if important details like the task title/details are missing, or if the target employee has not been verified!
   - DO NOT execute task creation immediately. Follow the step-by-step validation flow: Title/Details ➔ Deadline ➔ Priority ➔ Explicit Confirmation. Never create incomplete tasks!
   - Follow this strict step-by-step operational workflow when the user requests task assignment:
     - STEP 1 (Identify Employee): Call "searchEmployees" to verify the existence and profile of the target employee.
     - STEP 2 (Fast-Track Summary): If the user's initial or recent message ALREADY contains the task title, description, or deadline, you MUST bypass the solicitation phase! Immediately present a clear, beautiful summary block of the task (Task, Employee, Priority, Deadline) and ask the user if they are ready to finalize it (STEP 4). Do NOT ask them to repeat details they already provided!
     - STEP 3 (Solicit Missing Only): If important details (like task title or deadline) are genuinely missing, present the employee's name/department, and ask politely *only* for the specific missing fields.
     - STEP 4 (Confirm Summary): Present a clear summary of the task details (Title, Assigned To, Deadline, Priority) and ask the user if they are ready to finalize it.
     - STEP 5 (Finalize & Create): Trigger the "createTask" tool ONLY after the user explicitly confirms (e.g. "Yes", "Finalize it", "go ahead").
6. ACTIVE ENTITY MEMORY SYSTEM:
    - Actively parse previous turns in the "history" to sustain reference memory.
    - If the user uses a pronoun (e.g. "his designation", "her salary", "is employee ko reminder bhejo"), map it to the active employee, client, or property discussed in the most recent turn. Never lose context immediately after retrieval.
 7. FOLLOW-UP SUGGESTIONS: At the end of your response, always suggest 1 or 2 natural, context-sensitive follow-up questions to guide them nicely.
 8. STRICT 4-LAYER DECISION RESPONSE LAYOUT (Rule 6):
    If the query is business-related, database-related, or analytical, your response MUST follow this exact structure:

    🟢 1. DIRECT ANSWER (Assistant Mode)
    [Direct, precise answer based on live database records or RAG docs]

    🧠 2. ANALYTICAL INSIGHT (Cognitive Layer)
    [Provide high-cognition analysis of patterns, trends, anomalies, performance comparisons, risks, and opportunities from the live data. Explain WHY the data is shaped this way and the business/revenue impact.]

    💡 3. DYNAMIC INTERPRETATION METHOD (Dynamic Baseline & Calculation Explanation)
    [Provide the mathematical and statistical method used to dynamically determine the thresholds (e.g. median lifecycle, 75th percentile of listing age, 80th percentile of task loads, deviation from average). Do NOT assume or write hardcoded rules or fixed numbers (like 90, 30 days, or 8 tasks). Detail how the numbers in the direct answer align with the current dataset distribution.]

    🎯 4. SUGGESTED ACTION (Actionable Advice & Autonomy Layer)
    [Provide categorized actionable advice: Immediate, Short-term, and Strategic actions. You may also include execution options formatted as checkboxes to run direct operations: "- [ ] Run action: <command>". E.g., "- [ ] Create task: 'Verify documents for Zain'"]

If the question CANNOT be answered by database tools, or the tool has already run, answer using:
- The context from retrieved unstructured documents (RAG) attached below.
- General ERP resources:
${documentContext}

${memoryPromptContext}`;

      if (!allowDbTools) {
        systemPrompt += `
\nCRITICAL CONVERSATIONAL PROTOCOL (Rule 4):
- The user is having a general conversational chat (e.g. greetings, simple questions, chit-chat) and has NOT explicitly requested database operations, attendance records, task assignments, CRM queries, or financial analytics.
- **You MUST NOT call any database tools or SQL queries!**
- Do NOT output any JSON tool blocks (like {"tool": "..."}).
- Answer the user's question directly, concisely, and naturally in natural language text only.`;
      }

      if (callPersona) {
        systemPrompt += `
\n🚨 DYNAMIC PHONE CALL CONVERSATIONAL REINFORCEMENT (FIRST ROUND):
- You are currently speaking with the user in a continuous real-time audio PHONE CALL.
- The user is using their Zorvex Voice Live Calling Console to dial the central **Zorvex Operational Intelligence AI Agent** directly.
- **IF YOU NEED TO RUN A DATABASE QUERY OR CALL A TOOL**:
  - You MUST output ONLY the raw tool JSON block (e.g. {"tool": "...", "params": {...}}).
  - Do NOT output any other text, greetings, explanations, or written/spoken responses in this round!
- **IF YOU CAN ANSWER DIRECTLY WITHOUT ANY TOOL**:
  - You MUST output your response as a valid, parsable JSON block containing exactly two fields:
    1. "writtenResponse": (Comprehensive details) This will be displayed in the user's text chat screen history. Include all rich markdown tables, graphs, checklists, and professional guidelines.
    2. "spokenResponse": (Ultra-natural speech) This will be synthesized as spoken audio. Keep it extremely concise, natural, warm, and friendly (at most 2 or 3 short sentences).
  - Use smooth, natural Roman Urdu or English matching the user's query language. Include human conversational filler phrases (like "Aizaz bhai", "Ji bilkul", "Suno", "Haan", "Acha", "Koi masla nahi") to make it sound exactly like a warm, supportive human colleague on a live phone call!
  - Example output format for direct answer:
    \`\`\`json
    {
      "writtenResponse": "**Employees Found:** Muhammad Aizaz Khan from Human Resources... [detailed table]",
      "spokenResponse": "Aizaz bhai, maine Muhammad Aizaz Khan ko HR department mein find kar liya hai! Main unki complete details aapke chat screen par load kar raha hoon. Aur kuch check karna hai?"
    }
    \`\`\`
  - You MUST strictly output this JSON block. Never output raw plain text or raw markdown outside the JSON!`;
      }

      // Step C: LLM decision round
      const initialLLMResponse = await this.llmService.callLLM(systemPrompt, refinedMessage, history);
      
      let toolExecuted: string | null = null;
      let toolData: any = null;
      let finalResponseText = initialLLMResponse;

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
              
              // 2. Execute Primary Domain Agent
              const primaryAgentOutput = await this.agentsService.executeDomainAgent(domain, parsed.tool, parsed.params, organizationId, userRole, userId);
              agents.push(primaryAgentOutput);
              toolData = primaryAgentOutput.records;

              // Stateful draft integration: lock in resolved employee details
              if (parsed.tool === 'searchEmployees' && Array.isArray(toolData) && toolData.length > 0) {
                const emp = toolData[0];
                const activeTaskDraft = this.activeDrafts.get(userId);
                if (activeTaskDraft) {
                  activeTaskDraft.employeeName = emp.user ? `${emp.user.firstName} ${emp.user.lastName || ''}`.trim() : 'Employee';
                  activeTaskDraft.employeeId = emp.id;
                  this.activeDrafts.set(userId, activeTaskDraft);
                }
              }

              // 3. Proactive Cross-Department Intelligence check (Rule 7 & 8)
              const msgLower = (userMessage + ' ' + refinedMessage).toLowerCase();
              if (domain === 'HR' && (msgLower.includes('salary') || msgLower.includes('payroll') || msgLower.includes('paisa') || msgLower.includes('tankhaw') || msgLower.includes('finance'))) {
                try {
                  const financeOutput = await this.agentsService.executeDomainAgent('Finance', 'getFinanceAnalytics', {}, organizationId, userRole, userId);
                  if (financeOutput && !financeOutput.records.error) {
                    agents.push(financeOutput);
                  }
                } catch (e) {
                  this.logger.warn(`Proactive Cross-Department Finance trigger failed: ${e.message}`);
                }
              }

              if (domain === 'Property' && (msgLower.includes('client') || msgLower.includes('buyer') || msgLower.includes('investor') || msgLower.includes('lead') || msgLower.includes('sales'))) {
                try {
                  const salesOutput = await this.agentsService.executeDomainAgent('Sales', 'searchClients', {}, organizationId, userRole, userId);
                  if (salesOutput && !salesOutput.records.error) {
                    agents.push(salesOutput);
                  }
                } catch (e) {
                  this.logger.warn(`Proactive Cross-Department Sales trigger failed: ${e.message}`);
                }
              }

              if (domain === 'HR' && (msgLower.includes('vehicle') || msgLower.includes('driver') || msgLower.includes('fleet') || msgLower.includes('logistics'))) {
                try {
                  const logisticsOutput = await this.agentsService.executeDomainAgent('Logistics', 'getLogisticsAnalytics', {}, organizationId, userRole, userId);
                  if (logisticsOutput && !logisticsOutput.records.error) {
                    agents.push(logisticsOutput);
                  }
                } catch (e) {
                  this.logger.warn(`Proactive Cross-Department Logistics trigger failed: ${e.message}`);
                }
              }

              // 4. Run Multi-Agent Consensus and Alignment Layer (Rule 3 & 6)
              const consensusReport = await this.agentsService.runConsensusAndAlignment(agents, refinedMessage, history);
              
              // Handle database error interceptors
              if (toolExecuted === 'createTask' || toolExecuted === 'updateTask') {
                if (!toolData || (toolData as any).error || (toolData as any).success === false || (toolExecuted === 'createTask' && !(toolData as any).task?.id)) {
                  this.logger.error(`Strict Verification Interceptor: Task action failed or could not be verified in Postgres!`);
                  return {
                    response: "Task could not be verified in the system. Please try again.",
                    toolExecuted,
                    toolData: toolData || { error: 'DATABASE_SYNC_FAILURE' },
                    citations: [],
                  };
                } else if (toolExecuted === 'createTask') {
                  this.activeDrafts.delete(userId);
                  this.logger.log(`Task created successfully in database. Stateful draft buffer cleared for user ${userId}.`);
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

UNSTRUCTURED BUSINESS CONTEXT & REGULATORY POLICIES (RAG):
${documentContext}

${memoryPromptContext}

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
1. EVERY response MUST follow this exact 4-layer structure (Rule 6):

   🟢 1. DIRECT ANSWER (Assistant Mode)
   [Direct, precise answer based on the live database records and consensus details.]

   🧠 2. ANALYTICAL INSIGHT (Cognitive Layer)
   [Provide high-cognition analysis of patterns, trends, anomalies, performance comparisons, risks, and opportunities from the live data. Explain WHY the data is shaped this way and the business/revenue impact.]

   💡 3. DYNAMIC INTERPRETATION METHOD (Dynamic Baseline & Calculation Explanation)
   [Provide the mathematical and statistical method used to dynamically determine the thresholds (e.g. median lifecycle, 75th percentile of listing age, 80th percentile of task loads, deviation from average). Do NOT assume or write hardcoded rules or fixed numbers (like 90, 30 days, or 8 tasks). Detail how the numbers in the direct answer align with the current dataset distribution.]

   🎯 4. SUGGESTED ACTION (Actionable Advice & Autonomy Layer)
   [Provide categorized actionable advice: Immediate, Short-term, and Strategic actions. You may also include execution options formatted as checkboxes to run direct operations: "- [ ] Run action: <command>". E.g., "- [ ] Create task: 'Verify documents for Zain'"]

2. STRICTLY FORBID RAW DATABASE DUMPS: Never print raw, bare lists of database fields or JSON records. You must analyze the records, aggregate them, compute trends, detect rankings, and draw smart business conclusions.
   - Example: Instead of just listing properties, say "3 properties are unsold for 45+ days in the Downtown area."
3. PROACTIVE ANALYTICS MODE: You must actively look for and point out:
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
   - **CRITICAL: NEVER begin your response with any translation notice, language note, or prefix declaring the language choice. Directly start your answer.**
5. NO FILLER OR UAC CHATTER: Do NOT write any filler phrases, authorization notices, database check updates, or greetings. Answer the user's question directly and concisely!
6. CONCISE & DIRECT (CRITICAL): Only answer exactly what the user asked about. Keep details simple, clear, and highly focused. If the user asks a simple question, answer in 1 or 2 brief, beautiful sentences instead of printing their entire folder or suggesting long audit lists. Avoid making up checklists, schedules, or recommendations.
6. Speak completely like a warm, supportive, and friendly human colleague.
7. AVOID cold robotic bullet dumps or double asterisks on every single item. Instead, present details in a premium, beautifully spaced, clean human-style layout. Use elegant spacing, emojis (like 📅, 👤, 📍, 👥, 🚫), and friendly bullet highlights. Make the text look highly readable, natural, and visually premium. At the end of your response, politely add 1 or 2 natural, contextual follow-up question suggestions to guide them nicely.${extraInstructions}
8. If the results contain properties, summarize their occupancy, location trends, pricing changes, or listing age nicely.
9. If the results contain employees or salaries, summarize their performance metrics, payroll trends, or workload balances nicely.
10. If the results contain meetings or attendees, summarize who hosted them, who was present, who was absent, and lists of participants nicely.
11. If the results contain attendance records, summarize their daily statuses, check-in/check-out logs, and total worked hours timeline nicely.
12. If the results contain generic SQL rows from "runDatabaseQuery", analyze and present the joins, aggregates, rankings, or trends dynamically, and describe the dynamic visualization chart plotted below nicely.
13. If no records are found, inform the user politely.
14. **CRITICAL ERROR HANDLER RULE**: If the database results (toolData) contain a query syntax error ("QUERY_ERROR" or "Database query syntax error"), you MUST NOT hallucinate that "there are no employees" or "the database is empty/incomplete"! Instead, politely inform the user in their matching language that there was a temporary system lookup bottleneck, and suggest they retry their question or ask in a simpler way.`;

              let finalSystemPrompt = systemPrompt;
              if (callPersona) {
                finalSystemPrompt += `
\n🚨 DYNAMIC PHONE CALL CONVERSATIONAL REINFORCEMENT (FINAL ROUND):
- Since the database query has completed, you MUST now output your final response as a valid, parsable JSON block containing exactly two fields:
  1. "writtenResponse": (Comprehensive details) This will be displayed in the user's text chat screen history. Include all rich markdown tables, graphs, checklists, and professional guidelines.
  2. "spokenResponse": (Ultra-natural speech) This will be synthesized as spoken audio. Keep it extremely concise, natural, warm, and friendly (at most 2 or 3 short sentences).
- Use smooth, natural Roman Urdu or English matching the user's query language. Include human conversational filler phrases (like "Aizaz bhai", "Ji bilkul", "Suno", "Haan", "Acha", "Koi masla nahi") to make it sound exactly like a warm, supportive human colleague on a live phone call!
- You MUST strictly output this JSON block. Never output raw plain text, markdown, or tool calls outside the JSON!
- Example output format:
  \`\`\`json
  {
    "writtenResponse": "[Comprehensive response detailed table/paragraphs]",
    "spokenResponse": "[Concise natural conversational spoken text]"
  }
  \`\`\`
`;
              }
              finalResponseText = await this.llmService.callLLM(finalSystemPrompt, databaseFeedPrompt, history);
            }
          } catch (e) {
            this.logger.error(`Failed to parse tool execution JSON: ${e.message}. Raw Block: ${jsonBlock}`);
          }
        }
      }

      const citations = matchingChunks.map((chunk) => ({
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        fileType: chunk.fileType,
      }));

      let finalWritten = finalResponseText.trim();
      let finalSpoken: string | undefined = undefined;

      if (callPersona) {
        const extracted = this.extractFieldsFromCallJson(finalWritten);
        if (extracted.writtenResponse) {
          finalWritten = extracted.writtenResponse;
        }
      }

      // Clean up the written response using the strict technical jargon shield
      let cleanedWritten = finalWritten.trim();
      cleanedWritten = cleanedWritten.replace(/(?:I am using the|using the|executed the|I call the|I will execute|executed|calling|triggering)\s*["']?(?:runDatabaseQuery|searchEmployees|searchClients|searchProperties|executeDatabaseTool|getAttendanceRecord|getLeaveRequests|getTasksBoard|getMeetingsAnalytics|getFinanceAnalytics|getLogisticsAnalytics|createTask)["']?\s*(?:tool)?\s*(?:to retrieve|to query|to search|to look up)?/gi, '');
      cleanedWritten = cleanedWritten.replace(/(?:runDatabaseQuery|searchEmployees|searchClients|searchProperties|executeDatabaseTool|getAttendanceRecord|getLeaveRequests|getTasksBoard|getMeetingsAnalytics|getFinanceAnalytics|getLogisticsAnalytics|createTask)\s*(?:tool|query|SQL)/gi, 'system search');
      cleanedWritten = cleanedWritten.replace(/Postgres|database tool|SQL query|PrismaClientKnownRequestError/gi, 'system lookup');

      cleanedWritten = cleanedWritten.replace(/(?:\[?Orchestrator\]?|\*Orchestrator\*)\s*➔\s*Delegating[\s\S]*?(?:Orchestrator\s*(?:\(Main\s*Brain\))?\s*(?:AI)?\s*:\s*|Orchestrator:\s*)/gi, '');
      cleanedWritten = cleanedWritten.replace(/👥?\s*(?:HR|Finance|Property|Sales|Logistics|Orchestrator)\s+Agent:\s*["'].*?["']/gi, '');
      cleanedWritten = cleanedWritten.replace(/(?:\[?Orchestrator\]?|\*Orchestrator\*)\s*➔\s*Delegating[^\n]*/gi, '');
      cleanedWritten = cleanedWritten.replace(/👥?\s*(?:HR|Finance|Property|Sales|Logistics|Orchestrator)\s+Agent:\s*[^\n]*/gi, '');
      
      cleanedWritten = cleanedWritten
        .replace(/\b(bhai|yaar|dost|bande)\b/gi, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      // Always run high-fidelity LLM summarizer if it is a call connection
      if (callPersona) {
        finalSpoken = await this.generateSpokenSummary(cleanedWritten, userMessage);
      }

      // Asynchronously extract and store insights in the long-term organizational memory
      this.extractAndStoreMemories(cleanedWritten, organizationId).catch((err) => {
        this.logger.error(`Failed to run background memory extraction: ${err.message}`);
      });

      return {
        response: cleanedWritten,
        spokenResponse: finalSpoken,
        toolExecuted,
        toolData,
        citations,
      };
    } catch (err) {
      this.logger.error(`Complete breakdown in main Cognitive Chat pipeline: ${err.message}`);
      return {
        response: "🤖 System Alert: An operational bottleneck has interrupted Zorvex AI. Please verify data parameters and retry.",
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

