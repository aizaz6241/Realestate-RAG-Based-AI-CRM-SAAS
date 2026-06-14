import { Injectable, Logger } from '@nestjs/common';
import { AiLlmService } from './ai-llm.service';
import { IntentObject } from './cognitive-gateway.service';

export interface PlanNode {
  id: string;
  type: string;
  description: string;
  tool: 'SQL_ENGINE' | 'RAG_ENGINE' | 'CRM_API' | 'ERP_API' | 'WHATSAPP' | 'EMAIL' | 'CALENDAR' | 'WORKFLOW_ENGINE' | 'MEMORY_ENGINE';
  params: any;
}

export interface PlanEdge {
  id: string;
  source: string;
  target: string;
}

export interface ExecutionPlan {
  nodes: PlanNode[];
  edges: PlanEdge[];
  sensitiveAction: boolean;
  requiredRoles: string[];
}

@Injectable()
export class PlanningEngineService {
  private readonly logger = new Logger(PlanningEngineService.name);

  constructor(private llmService: AiLlmService) {}

  private normalizePlanStepParams(params: any): any {
    if (!params || typeof params !== 'object') return params;
    const clean: any = {};
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      const value = params[key];
      if (key === 'description' || key === 'id' || key === 'take') continue;
      if (typeof value === 'object' && value !== null) {
        clean[key] = this.normalizePlanStepParams(value);
      } else if (typeof value === 'string') {
        clean[key] = value.toLowerCase().trim();
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }

  // Layer 3 & 5: Planning Engine & Tool Selection Engine
  async generateExecutionPlan(
    query: string,
    intentObj: IntentObject,
    organizationId: string,
    userId: string,
    userRole: string
  ): Promise<ExecutionPlan> {
    this.logger.log(`[Layer 3 & 5: Planning & Tool Selection] Generating plan for query: "${query}"`);

    const planningPrompt = `You are the Zorvex AI V9 Planning Engine & Tool Selection Engine (Layer 3 & 5).
Based on the intent analysis, compile an execution graph (DAG) consisting of task nodes and dependency edges.

=== CURRENT LOCAL DATE & TIME ===
Today is ${new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
Always resolve relative dates (like "last month", "yesterday", "this week") accurately based on this current date.

=== ACTOR CONTEXT (Identity & Authorization - READ ONLY, NON-QUERYABLE, AUTHORIZATION ONLY) ===
- User Role: "${userRole}"

=== QUERY CONTEXT ===
- User Query: "${query}"
- Intent Analysis: ${JSON.stringify(intentObj, null, 2)}

CRITICAL SECURITY & FILTER BOUNDARY:
The Actor Context (User Role) is provided STRICTLY for security authorization checks.
DO NOT inject the User Role as a search parameter or filter in the node parameters (e.g. do NOT include "role": "SUPER_ADMIN" inside params.filters) unless the user's query explicitly requests it.

Available Tools:
- "SQL_ENGINE": For querying structured data in postgres (Properties, Employees, Payroll, Tasks, Leads, Clients, Attendance, Vehicles, Logistics).
- "RAG_ENGINE": For querying unstructured knowledge and policies (Listing guidelines, commission policies, company handbook).
- "CRM_API": CRM related functions (Mocked in V9).
- "ERP_API": ERP related operations (Mocked in V9).
- "CALENDAR": For meetings, calendar events, schedules.
- "MEMORY_ENGINE": For historical observation retrieval.
- "WORKFLOW_ENGINE": For automated task generation and triggers.
- "WHATSAPP", "EMAIL": Messaging alerts (Mocked in V9).

Strict Guidelines:
1. DAG Graph structure: Return a list of task nodes and dependency edges mapping topological execution order.
2. Sensitive Action Detection: Flag the plan as "sensitiveAction: true" if it involves operations with financial impact.
3. SINGLE DATABASE QUERY NODE (PUSH-DOWN DESIGN): Hamesha SQL database operations ke liye exactly ONE (1) SQL_ENGINE node generate karein. Banish creating separate LIST, JOIN, or FILTER nodes for PostgreSQL. All filters and sorting requirements must be pushed down directly inside the single node's "params.filters" object.
4. Tool mapping: Specify params matching what the tool needs. For SQL_ENGINE hamesha specify "operation": "fetch" or "operation": "aggregate". Banish specifying custom operations like "join" or "filter". Specify "entities" (array of prisma models in lower case, e.g. "leaverequest", "employeeprofile", "property", "task") and "filters" (json object for prisma where clause). For RAG_ENGINE specify "queryText" parameter.

Return strictly JSON matching this schema:
{
  "nodes": [
    {
      "id": "node_id_1",
      "type": "COUNT | LIST | AUDIT | ...",
      "description": "Step description",
      "tool": "SQL_ENGINE | RAG_ENGINE | CRM_API | ERP_API | CALENDAR | MEMORY_ENGINE | WORKFLOW_ENGINE",
      "params": { ... }
    }
  ],
  "edges": [
    {
      "id": "edge_id_1",
      "source": "node_id_1",
      "target": "node_id_2"
    }
  ],
  "sensitiveAction": true | false,
  "requiredRoles": ["SUPER_ADMIN", "ADMIN"]
}
Do not write markdown backticks or wrappers. Return raw JSON only.`;

    try {
      const resText = await this.llmService.callLLM(
        planningPrompt,
        "Plan execution graph",
        [],
        false,
        organizationId,
        userId
      );
      
      const cleanJson = resText.trim();
      const jsonStart = cleanJson.indexOf('{');
      const jsonEnd = cleanJson.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(cleanJson.substring(jsonStart, jsonEnd + 1)) as ExecutionPlan;
        
        // Normalize nodes, prevent duplication, and limit to max 5 nodes
        const seenSignatures = new Set<string>();
        const uniqueNodes: PlanNode[] = [];
        for (const node of parsed.nodes || []) {
          if (uniqueNodes.length >= 5) break;
          
          // Generate unique step representation signature to identify duplicates
          const normalizedParams = this.normalizePlanStepParams(node.params || {});
          const sig = `${node.tool}_${JSON.stringify(normalizedParams)}`;
          if (seenSignatures.has(sig)) continue;
          seenSignatures.add(sig);
          
          uniqueNodes.push(node);
        }
        parsed.nodes = uniqueNodes;

        this.logger.log(`Execution plan generated successfully with ${parsed.nodes.length} nodes and ${parsed.edges?.length || 0} edges. sensitiveAction=${parsed.sensitiveAction}`);
        return parsed;
      }
    } catch (err) {
      this.logger.error(`Planning Engine failed: ${err.message}`);
    }

    // Default plan fallback
    const tool = intentObj.classification === 'DOCUMENT_ONLY' ? 'RAG_ENGINE' as const : 'SQL_ENGINE' as const;
    const params = tool === 'RAG_ENGINE' 
      ? { queryText: query } 
      : { operation: 'fetch', entities: [this.deduceEntityFromQuery(query)], filters: {} };

    return {
      nodes: [
        {
          id: 'step_1',
          type: 'DIRECT_RETRIEVAL',
          description: `Direct retrieval for user query`,
          tool,
          params
        }
      ],
      edges: [],
      sensitiveAction: query.toLowerCase().includes('salary') || query.toLowerCase().includes('terminate') || query.toLowerCase().includes('payroll'),
      requiredRoles: []
    };
  }

  private deduceEntityFromQuery(query: string): string {
    const q = query.toLowerCase();
    if (q.includes('leave') || q.includes('chutti') || q.includes('vacation')) return 'leaverequest';
    if (q.includes('attendance') || q.includes('hazri') || q.includes('late') || q.includes('absent') || q.includes('present')) return 'attendance';
    if (q.includes('payroll') || q.includes('salary') || q.includes('paisa') || q.includes('pay')) return 'payroll';
    if (q.includes('vehicle') || q.includes('gari') || q.includes('car')) {
      if (q.includes('maintenance') || q.includes('repair') || q.includes('kharcha')) return 'vehiclemaintenance';
      return 'vehicle';
    }
    if (q.includes('maintenance') || q.includes('repair')) return 'vehiclemaintenance';
    if (q.includes('logistics') || q.includes('delivery') || q.includes('route') || q.includes('schedule')) return 'logisticsschedule';
    if (q.includes('owner') || q.includes('landlord') || q.includes('malik')) return 'owner';
    if (q.includes('viewing') || q.includes('visit') || q.includes('dikhana')) return 'clientviewing';
    if (q.includes('interest') || q.includes('like') || q.includes('pasand')) return 'clientpropertyinterest';
    if (q.includes('activity') || q.includes('lead timeline')) return 'leadactivity';
    if (q.includes('event') || q.includes('meeting') || q.includes('calendar')) return 'calendarevent';
    if (q.includes('key') || q.includes('chabi')) {
      if (q.includes('checkout') || q.includes('return')) return 'keycheckout';
      return 'keytracker';
    }
    if (q.includes('checkout') || q.includes('return')) return 'keycheckout';
    if (q.includes('employee document') || q.includes('staff file') || q.includes('resume') || q.includes('cv') || q.includes('passport') || q.includes('visa')) return 'employeedocument';
    if (q.includes('performance') || q.includes('appraisal') || q.includes('rating') || q.includes('review')) return 'performancereview';
    if (q.includes('price history') || q.includes('past price') || q.includes('price change')) return 'propertypricehistory';
    if (q.includes('owner document') || q.includes('landlord file') || q.includes('owner paper')) return 'ownerdocument';
    if (q.includes('owner call') || q.includes('owner email') || q.includes('owner communication') || q.includes('owner chat')) return 'ownercommunication';
    if (q.includes('client call') || q.includes('client email') || q.includes('client communication') || q.includes('client chat')) return 'clientcommunication';
    if (q.includes('driver') || q.includes('license')) return 'driverprofile';
    if (q.includes('task') || q.includes('todo') || q.includes('checklist')) return 'task';
    if (q.includes('lead')) return 'lead';
    if (q.includes('client') || q.includes('buyer') || q.includes('investor') || q.includes('budget')) return 'client';
    if (q.includes('employee') || q.includes('staff') || q.includes('agent') || q.includes('designation')) return 'employeeprofile';
    if (q.includes('property') || q.includes('listing') || q.includes('apartment') || q.includes('villa') || q.includes('rent') || q.includes('sale')) return 'property';
    return 'property';
  }
}
