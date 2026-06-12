import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiLlmService } from './ai-llm.service';

export interface CognitiveGatewayOutput {
  query: string;
  userRole: string;
  organizationId: string;
  userId: string;
  timestamp: string;
  conversationContext: {
    history: { role: 'user' | 'model'; content: string }[];
    workspaceState: any;
  };
}

export interface IntentObject {
  intent: 'LOOKUP' | 'ANALYTICS' | 'TREND' | 'REPORTING' | 'POLICY' | 'COMPARISON' | 'FORECAST' | 'MIXED' | 'CONVERSATIONAL' | 'SYSTEM_HELP';
  entities: {
    dates?: string[];
    regions?: string[];
    communities?: string[];
    properties?: string[];
    agents?: string[];
    departments?: string[];
    customers?: string[];
    projects?: string[];
    revenueMetrics?: string[];
  };
  classification: 'DOCUMENT_ONLY' | 'DATABASE_ONLY' | 'API_ONLY' | 'MEMORY_ONLY' | 'HYBRID';
  complexity: 'low' | 'medium' | 'high';
  confidence: number;
}

@Injectable()
export class CognitiveGatewayService {
  private readonly logger = new Logger(CognitiveGatewayService.name);

  constructor(
    private prisma: PrismaService,
    private llmService: AiLlmService
  ) {}

  // Layer 1: Cognitive Gateway - Normalize incoming requests
  async cognitiveGateway(
    userMessage: string,
    userId: string,
    organizationId: string,
    userRole: string,
    history: { role: 'user' | 'model'; content: string }[],
    workspaceState: any
  ): Promise<CognitiveGatewayOutput> {
    this.logger.log(`[Layer 1: Cognitive Gateway] Normalizing incoming request: "${userMessage}"`);

    let userName = 'Admin';
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        userName = `${user.firstName} ${user.lastName || ''}`.trim();
      }
    } catch (e) {
      this.logger.warn(`Failed to fetch username for identity resolution: ${e.message}`);
    }

    const currentLocalTime = new Date().toISOString();
    const currentLocalDateStr = new Date().toLocaleString([], { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short' 
    });

    const normalizationPrompt = `You are the Zorvex AI V9 Cognitive Gateway (Layer 1).
Your task is to normalize the incoming query:
1. Normalize language: Standardize spelling and clean grammatical noise. Keep the language (English, Roman Urdu, Urdu script) consistent, but resolve spelling anomalies.
2. Enrich context: Identify implicit pronouns or relative references (e.g. "me", "myself", "my tasks", "usko", "unki", "iski", "it", "this property") and resolve them using the User profile or the Active Workspace State Memory.
3. Clean query: Strip greeting fluff if mixed with business intent, but preserve intent details.
4. Time Context Detection: Resolve relative dates/times (e.g., "tomorrow", "this month", "past week") relative to the current local time context: ${currentLocalDateStr}.

Current Session User:
- Name: "${userName}"
- ID: "${userId}"
- Role: "${userRole}"

Active Workspace State Memory:
${JSON.stringify(workspaceState || {}, null, 2)}

Conversational History Context:
${history.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.content}`).join('\n')}

Output ONLY the resolved and fully normalized query text in the matching language. Do not add markdown quotes, preface explanation, or wrappers.`;

    let cleanedQuery = userMessage;
    try {
      const refined = await this.llmService.callLLM(
        normalizationPrompt,
        `Raw Query: "${userMessage}"`,
        [],
        false,
        organizationId,
        userId
      );
      if (refined && refined.trim()) {
        cleanedQuery = refined.trim();
        this.logger.log(`Query normalized: "${userMessage}" -> "${cleanedQuery}"`);
      }
    } catch (err) {
      this.logger.warn(`Normalization LLM call failed: ${err.message}. Using original.`);
    }

    return {
      query: cleanedQuery,
      userRole,
      organizationId,
      userId,
      timestamp: currentLocalTime,
      conversationContext: {
        history,
        workspaceState
      }
    };
  }

  // Layer 2: Query Understanding Engine - Perform intent, entity, and pipeline classification
  async queryUnderstanding(gatewayOutput: CognitiveGatewayOutput): Promise<IntentObject> {
    this.logger.log(`[Layer 2: Query Understanding] Analyzing query: "${gatewayOutput.query}"`);

    const queryUnderstandingPrompt = `You are the Zorvex AI V9 Query Understanding Engine (Layer 2).
Analyze the query and produce a structured intent and entity extraction output in JSON.

Query: "${gatewayOutput.query}"
User Role: "${gatewayOutput.userRole}"
Timestamp: "${gatewayOutput.timestamp}"

Instructions:
1. Intent Detection: Classify the intent into one of the following:
   - "LOOKUP": Simple database retrieval (e.g., "find agent Sarah", "show DHA properties").
   - "ANALYTICS": Metric calculation or aggregation (e.g., "average sales in JVC", "how many tasks completed").
   - "TREND": Pattern analysis over time (e.g., "sales trend this year").
   - "REPORTING": Structured summaries or status reports (e.g., "weekly audit report", "leave balance report").
   - "POLICY": Guidelines, regulations, or contract-based queries (e.g., "commission split policy", "what is DHA listing policy").
   - "COMPARISON": Side-by-side metric comparison (e.g., "target revenue vs actual revenue").
   - "FORECAST": Predictive or future analysis (e.g., "expected sales next quarter").
   - "MIXED": Combines multiple of the above.
   - "CONVERSATIONAL": General chit-chat or greetings ("hi", "how are you").
   - "SYSTEM_HELP": Asking what the assistant can do ("what can you do?", "help").

2. Entity Extraction: Extract any relevant parameters into:
   - dates (relative or concrete dates/months/years)
   - regions (e.g., Dubai, UAE, Lahore)
   - communities (e.g., JVC, Dubai Marina, Downtown, DHA Phase 6)
   - properties (specific listing IDs or titles)
   - agents (employee names)
   - departments (e.g., Sales, HR, Finance, Logistics)
   - customers (client/owner/lead names)
   - projects (real estate project titles)
   - revenueMetrics (e.g., commission, price, salary, net revenue, target)

3. Query Classification: Decide which retrieval pipeline(s) are needed:
   - "DOCUMENT_ONLY": Requires unstructured documents/policies (e.g. "listing guidelines").
   - "DATABASE_ONLY": Requires structured relational tables (e.g. "sales reports", "payroll lists").
   - "API_ONLY": Requires external systems (mocked/stubbed in V9).
   - "MEMORY_ONLY": Requires historical conversations/past observations.
   - "HYBRID": Requires a combination of the above (e.g., "compare target from policy document with actual sales from database").

4. Complexity & Confidence: Rate complexity ("low", "medium", "high") and confidence score (0-100). Be strict: if key details are missing or ambiguous, lower the confidence score.

Return strictly valid JSON matching this schema:
{
  "intent": "LOOKUP | ANALYTICS | TREND | REPORTING | POLICY | COMPARISON | FORECAST | MIXED | CONVERSATIONAL | SYSTEM_HELP",
  "entities": {
    "dates": [],
    "regions": [],
    "communities": [],
    "properties": [],
    "agents": [],
    "departments": [],
    "customers": [],
    "projects": [],
    "revenueMetrics": []
  },
  "classification": "DOCUMENT_ONLY | DATABASE_ONLY | API_ONLY | MEMORY_ONLY | HYBRID",
  "complexity": "low | medium | high",
  "confidence": 95
}
Do not include markdown wrappers (like \`\`\`json) or any extra text. Return raw JSON only.`;

    try {
      const resText = await this.llmService.callLLM(
        queryUnderstandingPrompt,
        `Understand query: "${gatewayOutput.query}"`,
        [],
        false,
        gatewayOutput.organizationId,
        gatewayOutput.userId
      );
      
      const cleanJson = resText.trim();
      const jsonStart = cleanJson.indexOf('{');
      const jsonEnd = cleanJson.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(cleanJson.substring(jsonStart, jsonEnd + 1)) as IntentObject;
        this.logger.log(`Query Classified: Intent=${parsed.intent}, Classification=${parsed.classification}, Confidence=${parsed.confidence}`);
        return parsed;
      }
    } catch (err) {
      this.logger.error(`Query Understanding parsing failed: ${err.message}`);
    }

    // Safe fallback classification
    const lowerQuery = gatewayOutput.query.toLowerCase();
    let intent: IntentObject['intent'] = 'LOOKUP';
    let classification: IntentObject['classification'] = 'DATABASE_ONLY';

    if (lowerQuery.includes('policy') || lowerQuery.includes('rule') || lowerQuery.includes('guideline') || lowerQuery.includes('contract')) {
      intent = 'POLICY';
      classification = 'DOCUMENT_ONLY';
    } else if (lowerQuery.includes('compare') || lowerQuery.includes('vs') || lowerQuery.includes('target')) {
      intent = 'COMPARISON';
      classification = 'HYBRID';
    }

    return {
      intent,
      entities: {},
      classification,
      complexity: 'medium',
      confidence: 70
    };
  }
}
