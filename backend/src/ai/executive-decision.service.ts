import { Injectable, Logger } from '@nestjs/common';
import { AiLlmService } from './ai-llm.service';

@Injectable()
export class ExecutiveDecisionService {
  private readonly logger = new Logger(ExecutiveDecisionService.name);

  constructor(private llmService: AiLlmService) {}

  async analyze(
    userQuery: string,
    toolData: any,
    memories: any[]
  ): Promise<{ risks: string[]; opportunities: string[]; recommendations: string[] }> {
    if (!toolData) {
      return { risks: [], opportunities: [], recommendations: [] };
    }

    const systemPrompt = `You are the Zorvex AI Executive Decision Engine (Layer 14).
Your job is to analyze retrieved database records, historical patterns, and organizational memory to extract high-value business advisory insights.
Analyze specifically for:
1. Operational Risks: Bottlenecks, overloaded staff, aging inventory, declining attendance.
2. Revenue/Operational Opportunities: Unassigned leads, high-intent buyers/renters, underutilized assets.
3. Executive Recommendations: Actionable corporate strategies.

Output your analysis strictly in JSON format matching this structure:
{
  "risks": ["Risk details..."],
  "opportunities": ["Opportunity details..."],
  "recommendations": ["Recommendation details..."]
}
Do not write any markdown code blocks, preamble, or conversational text. Return ONLY the raw JSON block.`;

    const userPrompt = `User Query: "${userQuery}"
Retrieved Database Records:
${JSON.stringify(toolData, null, 2)}
Retrieved Memories/Patterns:
${JSON.stringify(memories, null, 2)}`;

    try {
      const response = await this.llmService.callLLM(systemPrompt, userPrompt, [], true);
      const cleanResponse = response.trim();
      const jsonStart = cleanResponse.indexOf('{');
      const jsonEnd = cleanResponse.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonBlock = cleanResponse.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonBlock);
        return {
          risks: parsed.risks || [],
          opportunities: parsed.opportunities || [],
          recommendations: parsed.recommendations || [],
        };
      }
    } catch (err) {
      this.logger.error(`Error running Executive Decision Engine: ${err.message}`);
    }

    return { risks: [], opportunities: [], recommendations: [] };
  }
}
