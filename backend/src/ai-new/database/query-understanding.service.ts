import { Injectable, Logger } from '@nestjs/common';
import { AiNewLlmService } from '../ai-new-llm.service';

export interface QueryUnderstandingResult {
  originalQuery: string;
  cleanedQuery: string;
  intent: 'ANALYTICS' | 'LOOKUP' | 'LIST' | 'ACTION' | 'UNKNOWN';
  entities: {
    locations?: string[];
    metrics?: string[];
    customers?: string[];
    [key: string]: any;
  };
  timeframe: {
    isRelative: boolean;
    originalTerm: string | null;
    startDate: string | null; // ISO Date String
    endDate: string | null;   // ISO Date String
  };
  businessTermsMapped: Record<string, string>;
  requiresClarification: boolean;
  clarificationQuestion: string | null;
  enrichment: {
    appliedDefaults: Record<string, string>; // e.g. { "sales_status": "completed" }
  };
  _metadata?: {
    provider: string;
  };
}

@Injectable()
export class QueryUnderstandingService {
  private readonly logger = new Logger(QueryUnderstandingService.name);

  constructor(private readonly llmService: AiNewLlmService) {}

  /**
   * Sub-layer 1: Text Processing
   * Cleans the query by removing extra spaces, special characters (except essential punctuation),
   * and normalizing case.
   */
  private processText(query: string): string {
    let clean = query.replace(/[^\w\s\u0600-\u06FF\u0900-\u097F.,?!'"-]/g, ' '); // Keep Urdu/Hindi/English chars & basic punctuation
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean;
  }

  /**
   * Main Pipeline Method
   * Executes Sub-layers 2-7 using a single structured LLM call.
   */
  /**
   * Business nouns that make a query concrete enough to execute.
   *
   * If the user named a thing we can query, the request is answerable — worst case
   * we return everything of that type, which is a far better outcome than another
   * question. Missing filters are not ambiguity; they mean "no filter".
   */
  private static readonly CONCRETE_NOUNS =
    /\b(propert(?:y|ies)|listing|flat|apartment|villa|plot|lead|client|customer|buyer|tenant|owner|landlord|employee|staff|agent|user|task|todo|meeting|attendance|leave|chutti|payroll|salary|tankhwa|revenue|sale|expense|invoice|payment|commission|vehicle|driver|document|contract|policy)\b/i;

  /** Asking "what can you do" is a capability question, never a data ambiguity. */
  private static readonly CAPABILITY_QUERY =
    /\b(how can you help|what can you do|what do you do|help me|kya kar sakte|aap kya|tum kya)\b/i;

  async analyzeQuery(
    rawQuery: string,
    organizationId?: string,
    userId?: string,
    history: { role: 'user' | 'model'; content: string }[] = []
  ): Promise<QueryUnderstandingResult> {

    // Layer 1.1: Text Processing
    const cleanedQuery = this.processText(rawQuery);

    const todayDate = new Date().toISOString();

    // Did we already ask this user to clarify? The endpoint used to be stateless,
    // so the model had no memory of having just asked and would ask again on every
    // turn — an infinite clarification loop the user could not escape no matter how
    // specific they got.
    const alreadyAskedForClarification = history
      .slice(-4)
      .some(h => h.role === 'model' && /\?\s*$/.test(h.content.trim()) && h.content.length < 200);

    const systemPrompt = `You are the Query Understanding Layer (Layer 1) of an Enterprise Database Retrieval AI.
Your job is to translate human language queries into a strictly structured JSON format that will be used later to generate SQL.

You must execute the following 6 tasks simultaneously and output ONLY valid JSON without any markdown formatting or extra text.

Tasks:
1. Intent Detection: Classify the user's intent. Must be one of: "LOOKUP" (e.g., find specific user), "LIST" (e.g., show all transactions), "ANALYTICS" (e.g., total sales, average, trends), "ACTION" (e.g., delete transaction 123), "UNKNOWN".
2. Entity Extraction (NER): Extract key entities like locations, metrics, customers, regions, agents, etc. Return them as arrays of strings.
3. Time Understanding: The user may use relative time (e.g., "last month", "previous quarter"). 
   - CURRENT DATE/TIME IS: ${todayDate}. 
   - Calculate the exact ISO 8601 start and end dates based on the current date. If no time is specified, return null for both.
4. Business Term Understanding (Semantic Mapping): Map any user jargon to standard enterprise terms (e.g., if user says "sales", map to "revenue"; if user says "clients", map to "customers").
5. Ambiguity Detection — BE EXTREMELY RELUCTANT TO ASK.
   Default to requiresClarification: false. A missing filter is NOT ambiguity; it
   means "no filter" — answer for all records.
   - "how many properties do i have?" -> ANSWERABLE. Count all properties. Do NOT ask which type.
   - "show me all the properties"     -> ANSWERABLE. List them all. Do NOT ask which ones.
   - "list employees"                 -> ANSWERABLE. List all of them.
   - "sales"                          -> ANSWERABLE. Return all sales; do NOT demand a time period.
   Set requiresClarification: true ONLY when the query names no queryable subject at
   all (e.g. "show me that one", "do the thing"). If the user named ANY business
   entity — properties, leads, clients, employees, tasks, revenue — you MUST answer.
   Asking a question the user has already answered is a failure.${alreadyAskedForClarification ? `

   CRITICAL: You already asked this user for clarification on a previous turn. You
   are FORBIDDEN from asking again. Set requiresClarification: false and make your
   best interpretation of what they want.` : ''}
6. Query Enrichment: Apply intelligent defaults if the user omitted them but the query isn't fully ambiguous (e.g., assuming "status = 'completed'" for sales queries).

Output JSON Schema:
{
  "intent": "ANALYTICS" | "LOOKUP" | "LIST" | "ACTION" | "UNKNOWN",
  "entities": {
    "locations": ["dubai", "london"],
    "metrics": ["sales", "revenue"]
    // add other arrays as needed based on the query
  },
  "timeframe": {
    "isRelative": boolean,
    "originalTerm": "string or null",
    "startDate": "ISO string or null",
    "endDate": "ISO string or null"
  },
  "businessTermsMapped": {
    "user_term": "standard_system_term"
  },
  "requiresClarification": boolean,
  "clarificationQuestion": "string asking for clarification, or null",
  "enrichment": {
    "appliedDefaults": {
      "key": "value"
    }
  }
}

Respond ONLY with the JSON object. Do NOT wrap it in markdown json blocks.`;

    try {
      this.logger.log(`Sending cleaned query to LLM for Query Understanding: ${cleanedQuery}`);
      const llmResponse = await this.llmService.callLLM(
        systemPrompt,
        cleanedQuery,
        [],
        false, // Don't force cloud if it's a simple query, let the router decide. But for JSON schema, maybe better. 
               // Actually, Qwen handles JSON fine.
        organizationId,
        userId
      );

      // Clean the response in case the model added markdown blocks despite instructions
      let jsonString = llmResponse.text.replace(new RegExp('```json', 'gi'), '');
      jsonString = jsonString.replace(new RegExp('```', 'g'), '').trim();
      const parsedData = JSON.parse(jsonString);

      // Deterministic override on top of the model's judgement.
      //
      // Prompt wording alone did not stop the loop: the model kept rating clear
      // requests like "how many properties do i have?" as ambiguous, so the user was
      // asked to clarify four times in a row with no way out. Two hard rules now
      // apply regardless of what the model returns.
      let requiresClarification = parsedData.requiresClarification || false;
      let clarificationQuestion = parsedData.clarificationQuestion || null;

      if (requiresClarification) {
        if (alreadyAskedForClarification) {
          this.logger.warn(`[Anti-loop] Clarification already requested this conversation — proceeding with best effort for: "${cleanedQuery}"`);
          requiresClarification = false;
          clarificationQuestion = null;
        } else if (QueryUnderstandingService.CONCRETE_NOUNS.test(cleanedQuery)) {
          this.logger.warn(`[Anti-loop] Query names a queryable entity — answering instead of asking: "${cleanedQuery}"`);
          requiresClarification = false;
          clarificationQuestion = null;
        }
      }

      // "How can you help me?" is a capability question. Routing it into the SQL
      // pipeline produced "Could you provide more details about what you need help
      // with?" — the assistant asking the user what the assistant can do.
      const isCapabilityQuery = QueryUnderstandingService.CAPABILITY_QUERY.test(cleanedQuery)
        && !QueryUnderstandingService.CONCRETE_NOUNS.test(cleanedQuery);

      return {
        originalQuery: rawQuery,
        cleanedQuery,
        intent: isCapabilityQuery ? 'UNKNOWN' : (parsedData.intent || 'UNKNOWN'),
        entities: parsedData.entities || {},
        timeframe: parsedData.timeframe || { isRelative: false, originalTerm: null, startDate: null, endDate: null },
        businessTermsMapped: parsedData.businessTermsMapped || {},
        requiresClarification: isCapabilityQuery ? false : requiresClarification,
        clarificationQuestion: isCapabilityQuery ? null : clarificationQuestion,
        enrichment: parsedData.enrichment || { appliedDefaults: {} },
        _metadata: { provider: llmResponse.provider }
      };

    } catch (error) {
      this.logger.error(`Failed to parse LLM response in Query Understanding Layer: ${error.message}`);
      
      // Fallback response for safe pipeline failure
      return {
        originalQuery: rawQuery,
        cleanedQuery,
        intent: 'UNKNOWN',
        entities: {},
        timeframe: { isRelative: false, originalTerm: null, startDate: null, endDate: null },
        businessTermsMapped: {},
        requiresClarification: true,
        clarificationQuestion: "Failed to parse query understanding response.",
        enrichment: { appliedDefaults: {} },
        _metadata: { provider: "System Error Fallback" }
      };
    }
  }
}
