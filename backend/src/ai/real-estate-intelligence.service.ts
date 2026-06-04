import { Injectable, Logger } from '@nestjs/common';
import { AiLlmService } from './ai-llm.service';

@Injectable()
export class RealEstateIntelligenceService {
  private readonly logger = new Logger(RealEstateIntelligenceService.name);

  constructor(private llmService: AiLlmService) {}

  async analyze(
    properties: any[],
    leads: any[],
    clients: any[]
  ): Promise<{
    listingHealth: string[];
    inventoryAging: string[];
    leadConversion: string[];
    areaIntelligence: string[];
  }> {
    const systemPrompt = `You are the Zorvex Real Estate Intelligence Agent.
Your job is to analyze property listings, active leads, and client profiles to output deep real estate business intelligence.
Analyze:
1. Listing Health: Check for old listings, low engagement, zero inquiries.
2. Inventory Aging: Identify properties unsold/unrented for long periods (relative to normal lifecycle).
3. Lead Conversion: Pinpoint high-probability buyers, high-intent renters, cold/dormant leads.
4. Area Intelligence: Analyze demand hotspots, inventory gaps, and opportunities in popular areas (Dubai Marina, Downtown Dubai, JVC, Business Bay).

Output your analysis strictly in JSON format matching this structure:
{
  "listingHealth": ["Health assessment..."],
  "inventoryAging": ["Aging metrics/warnings..."],
  "leadConversion": ["Conversion analysis..."],
  "areaIntelligence": ["Hotspots and inventory gaps..."]
}
Do not write any markdown code blocks, preamble, or conversational text. Return ONLY the raw JSON block.`;

    const userPrompt = `Properties Data:
${JSON.stringify(properties, null, 2)}
Leads Data:
${JSON.stringify(leads, null, 2)}
Clients Data:
${JSON.stringify(clients, null, 2)}`;

    try {
      const response = await this.llmService.callLLM(systemPrompt, userPrompt, [], true);
      const cleanResponse = response.trim();
      const jsonStart = cleanResponse.indexOf('{');
      const jsonEnd = cleanResponse.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonBlock = cleanResponse.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonBlock);
        return {
          listingHealth: parsed.listingHealth || [],
          inventoryAging: parsed.inventoryAging || [],
          leadConversion: parsed.leadConversion || [],
          areaIntelligence: parsed.areaIntelligence || [],
        };
      }
    } catch (err) {
      this.logger.error(`Error running Real Estate Intelligence Agent: ${err.message}`);
    }

    return { listingHealth: [], inventoryAging: [], leadConversion: [], areaIntelligence: [] };
  }
}
