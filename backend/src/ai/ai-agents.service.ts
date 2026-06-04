import { Injectable, Logger } from '@nestjs/common';
import { AiLlmService } from './ai-llm.service';
import { AiDatabaseToolsService } from './ai-database-tools.service';
import { AiValidationService, DataValidationReport } from './ai-validation.service';

export interface AgentOutput {
  domain: string;
  records: any;
  insights: string[];
  validation: DataValidationReport;
  confidence: number;
}

export interface ConsensusReport {
  overallConfidence: number;
  alignedInsights: string[];
  contradictionsResolved: string[];
  proactiveActions: string[];
  reducedCertaintyWarning: string | null;
}

@Injectable()
export class AiAgentsService {
  private readonly logger = new Logger(AiAgentsService.name);

  constructor(
    private llmService: AiLlmService,
    private dbToolsService: AiDatabaseToolsService,
    private validationService: AiValidationService
  ) {}

  // Specialist Context Modules: Formats domain-specific database records into structured contexts
  getDomainContext(domain: string, rawData: any): string {
    if (!rawData || (Array.isArray(rawData) && rawData.length === 0)) {
      return `[${domain} Context]: No records found in the database.`;
    }

    let context = `[${domain} Context]:\n`;

    if (domain === 'HR') {
      if (Array.isArray(rawData)) {
        context += rawData.map(r => 
          `- Employee ${r.user?.firstName || ''} ${r.user?.lastName || ''} (Role: ${r.user?.role || 'None'}, Dept: ${r.department || 'None'}, Desig: ${r.designation || 'None'}, Status: ${r.status || 'ACTIVE'}, Salary: ${r.salary || 'Confidential'})`
        ).join('\n');
      } else {
        context += JSON.stringify(rawData);
      }
    } else if (domain === 'Finance') {
      if (rawData.totals) {
        context += `- Net payout commitment: AED ${rawData.totals.netSalary}\n- Base salary budget: AED ${rawData.totals.baseSalary}\n- Allowances: AED ${rawData.totals.allowances}\n- Deductions: AED ${rawData.totals.deductions}`;
      } else {
        context += JSON.stringify(rawData);
      }
    } else if (domain === 'Property') {
      if (Array.isArray(rawData)) {
        context += rawData.map(r => 
          `- Property: "${r.title}" in ${r.location} (Type: ${r.type}, Price: AED ${r.price}, Bed: ${r.bedrooms}, Bath: ${r.bathrooms}, Status: ${r.status}, Owner: ${r.owner?.name || 'Unassigned'})`
        ).join('\n');
      } else {
        context += JSON.stringify(rawData);
      }
    } else if (domain === 'Sales') {
      if (Array.isArray(rawData)) {
        context += rawData.map(r => 
          `- Client/Lead: "${r.name}" (Type: ${r.type || 'Lead'}, Stage/Status: ${r.stage || r.status || 'NEW'}, Budget: AED ${r.budget || 0}, Preferences: "${r.preferences || ''}")`
        ).join('\n');
      } else {
        context += JSON.stringify(rawData);
      }
    } else if (domain === 'Logistics') {
      if (rawData.vehicles) {
        context += `- Active Vehicles Count: ${rawData.vehiclesCount}\n` + 
          rawData.vehicles.map((v: any) => `  * Vehicle: ${v.modelName} (Plate: ${v.plateNumber}, Status: ${v.status}, Maintenance Cost: AED ${v.maintenanceCostTotal})`).join('\n');
      } else {
        context += JSON.stringify(rawData);
      }
    } else {
      context += JSON.stringify(rawData);
    }

    return context;
  }

  // Specialist Reasoning: Runs a deep reasoning model call ONLY when the query is highly complex
  async executeSpecialistReasoning(
    domain: 'HR' | 'Finance' | 'Property' | 'Sales' | 'Logistics' | 'Executive',
    data: any,
    query: string
  ): Promise<string> {
    this.logger.log(`[Specialist Agent: ${domain}] Executing deep reasoning...`);
    const systemPrompt = `You are the Zorvex Specialist ${domain} AI Reasoning Agent.
Your job is to deeply analyze the given dataset and the user query to provide strategic, high-cognition insights, audit discrepancies, detect bottlenecks, and provide recommendations in the domain of ${domain}.
Output only your reasoning and analytical insights directly. Be concise, executive-focused, and highly precise.`;

    const userPrompt = `User Query: "${query}"
Database Records:
${JSON.stringify(data, null, 2)}`;

    try {
      return await this.llmService.callLLM(systemPrompt, userPrompt, [], true);
    } catch (err) {
      this.logger.error(`Specialist Reasoning Agent failed: ${err.message}`);
      return `Failed to compute specialized reasoning: ${err.message}`;
    }
  }

  async executeDomainAgent(
    domain: 'HR' | 'Finance' | 'Property' | 'Sales' | 'Logistics',
    toolName: string,
    params: any,
    organizationId: string,
    userRole: string,
    userId: string
  ): Promise<AgentOutput> {
    this.logger.log(`[Domain Agent: ${domain}] Coordinating operational tool: ${toolName}`);
    
    // Fetch live Postgres results using the database tools service
    const rawData = await this.dbToolsService.executeDatabaseTool(toolName, params, organizationId, userRole, userId);
    
    // Check raw data quality
    const validation = this.validationService.validateDataQuality(domain, rawData);
    
    // Combined domain confidence weighting
    const confidence = parseFloat((0.5 * validation.completenessScore + 0.5 * validation.consistencyScore).toFixed(2));
    
    const insights: string[] = [];
    
    if (validation.missingFields.length > 0) {
      insights.push(`[${domain} Quality Check] Missing database records: ${validation.missingFields.join(', ')}.`);
    }
    for (const inconsistency of validation.inconsistencies) {
      insights.push(`[${domain} Logical Conflict] ${inconsistency}`);
    }
    for (const anomaly of validation.anomaliesDetected) {
      insights.push(`[${domain} Anomaly Detected] ${anomaly}`);
    }
    
    // Basic dynamic data summaries
    if (domain === 'HR') {
      if (Array.isArray(rawData)) {
        insights.push(`Analyzed ${rawData.length} active employee profiles, schedules, or leave cycles.`);
      }
    } else if (domain === 'Finance') {
      if (rawData && rawData.totals) {
        insights.push(`Aggregate base salaries budget calculated: $${rawData.totals.baseSalary}. Net payouts commitment: $${rawData.totals.netSalary}.`);
      }
    } else if (domain === 'Property') {
      if (Array.isArray(rawData)) {
        const sold = rawData.filter(r => r.status === 'SOLD').length;
        const rented = rawData.filter(r => r.status === 'RENTED').length;
        const avail = rawData.filter(r => r.status === 'AVAILABLE').length;
        insights.push(`Calculated listings inventory: ${avail} Available, ${sold} Sold, ${rented} Rented.`);
      }
    } else if (domain === 'Sales') {
      if (Array.isArray(rawData)) {
        insights.push(`Sourced ${rawData.length} active leads or clients funnel progress logs.`);
      }
    } else if (domain === 'Logistics') {
      if (rawData && rawData.vehicles) {
        insights.push(`Fleet status checks complete: managing ${rawData.vehiclesCount} total company vehicles.`);
      }
    }

    return {
      domain,
      records: rawData,
      insights,
      validation,
      confidence,
    };
  }

  async runConsensusAndAlignment(
    agents: AgentOutput[],
    userQuery: string,
    history: { role: 'user' | 'model'; content: string }[]
  ): Promise<ConsensusReport> {
    this.logger.log(`Running Consensus Alignment pipeline for ${agents.length} domain reports.`);
    
    const avgCompleteness = agents.reduce((sum, a) => sum + a.validation.completenessScore, 0) / agents.length;
    const avgConsistency = agents.reduce((sum, a) => sum + a.validation.consistencyScore, 0) / agents.length;
    const overallConfidence = parseFloat((0.5 * avgCompleteness + 0.5 * avgConsistency).toFixed(2));
    
    const agentSummaries = agents.map(a => `
[DOMAIN: ${a.domain}]
Domain Confidence Rating: ${a.confidence}
Agent Observations:
${a.insights.map(i => `- ${i}`).join('\n')}
Validation Details:
- Completeness Score: ${a.validation.completenessScore} (Missing fields: ${a.validation.missingFields.join(', ') || 'None'})
- Consistency Score: ${a.validation.consistencyScore} (Inconsistencies: ${a.validation.inconsistencies.join(', ') || 'None'})
`).join('\n');

    const systemPrompt = `You are the Zorvex Multi-Agent Consensus Alignment Engine.
Your job is to read observations from specialized domain agents (HR, Finance, Property, Sales, Logistics), identify logical contradictions, resolve conflicts, and synthesize a consistent, unified set of operational insights.

USER QUERY: "${userQuery}"

DOMAIN AGENT OBSERVATIONS:
${agentSummaries}

STRICT CONSENSUS ALIGNMENT RULES:
1. Contradiction Detection: Check if observations between agents contradict each other. For example:
   - HR reports an employee is highly productive, but Sales reports the same employee has zero client closures.
   - Property reports a listing is sold, but Finance reports zero commission generated.
   - Logistics reports a vehicle is in maintenance, but HR/Operations shows it has scheduled shifts.
2. Conflict Resolution: Resolve conflicts strictly prioritizing:
   - Central Database records (raw records) over speculative agent comments.
   - Higher-confidence domain reports over lower-confidence domain reports.
3. Low Confidence Warning: If the overall confidence score is below 0.75, generate a clear, highly professional warning summarizing what data is missing or outdated.
4. Output Format: You MUST respond in a clean JSON format containing exactly the following keys:
   {
     "alignedInsights": ["Insight 1", "Insight 2"],
     "contradictionsResolved": ["Contradiction 1 resolved...", "Contradiction 2 resolved..."],
     "proactiveActions": ["Actionable recommendation 1", "Actionable recommendation 2"],
     "reducedCertaintyWarning": "Warning description..." (or null if confidence is high)
   }
No conversational text, thoughts, or markdown code blocks should be output. Just the raw JSON block.`;

    try {
      const responseText = await this.llmService.callLLM(systemPrompt, `Calculate consensus and resolve contradictions.`, []);
      const cleanResponse = responseText.trim();
      
      let jsonBlock = cleanResponse;
      const jsonStart = cleanResponse.indexOf('{');
      const jsonEnd = cleanResponse.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonBlock = cleanResponse.substring(jsonStart, jsonEnd + 1);
      }
      
      const parsed = JSON.parse(jsonBlock);
      return {
        overallConfidence,
        alignedInsights: parsed.alignedInsights || [],
        contradictionsResolved: parsed.contradictionsResolved || [],
        proactiveActions: parsed.proactiveActions || [],
        reducedCertaintyWarning: overallConfidence < 0.75 ? (parsed.reducedCertaintyWarning || `Based on partial database records with low confidence rating (${overallConfidence * 100}%), please proceed with caution.`) : null,
      };
    } catch (err) {
      this.logger.error(`Failed to execute Consensus Alignment Engine: ${err.message}. Falling back to default heuristics.`);
      
      const alignedInsights: string[] = [];
      const proactiveActions: string[] = [];
      
      for (const a of agents) {
        alignedInsights.push(...a.insights);
        if (a.validation.inconsistencies.length > 0) {
          proactiveActions.push(`Investigate database inconsistencies in the ${a.domain} domain.`);
        }
      }
      
      return {
        overallConfidence,
        alignedInsights,
        contradictionsResolved: [],
        proactiveActions,
        reducedCertaintyWarning: overallConfidence < 0.75 ? `Warning: Operational data completeness is low (${overallConfidence * 100}%). Some fields are missing.` : null,
      };
    }
  }
}
