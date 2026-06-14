import { Injectable, Logger } from '@nestjs/common';
import { ExecutionPlan } from './planning-engine.service';

@Injectable()
export class MultiTierRouterService {
  private readonly logger = new Logger(MultiTierRouterService.name);

  // Tiers 0 and 1 router
  routeQuery(query: string): ExecutionPlan | null {
    const q = query.toLowerCase().trim();
    this.logger.log(`[Multi-Tier Retrieval Router] Checking Tier 0/1 routing for query: "${query}"`);

    // ==========================================
    // TIER 0: Regex Router (Counts)
    // ==========================================
    if (/how many employees/i.test(q) || /employee count/i.test(q) || /how many staff members/i.test(q) || /how many staff/i.test(q) || /total employees/i.test(q)) {
      this.logger.log(`[Multi-Tier Router] Tier 0 Match: Employee Count`);
      return {
        nodes: [
          {
            id: 'employee_count',
            type: 'COUNT',
            description: 'Deterministic Count of Employees',
            tool: 'SQL_ENGINE',
            params: {
              operation: 'aggregate',
              entities: ['employeeprofile'],
              metrics: ['count'],
              filters: {}
            }
          }
        ],
        edges: [],
        sensitiveAction: false,
        requiredRoles: []
      };
    }

    if (/how many properties/i.test(q) || /properties count/i.test(q) || /total properties/i.test(q)) {
      this.logger.log(`[Multi-Tier Router] Tier 0 Match: Property Count`);
      return {
        nodes: [
          {
            id: 'property_count',
            type: 'COUNT',
            description: 'Deterministic Count of Properties',
            tool: 'SQL_ENGINE',
            params: {
              operation: 'aggregate',
              entities: ['property'],
              metrics: ['count'],
              filters: {}
            }
          }
        ],
        edges: [],
        sensitiveAction: false,
        requiredRoles: []
      };
    }

    if (/how many leads/i.test(q) || /total leads/i.test(q)) {
      this.logger.log(`[Multi-Tier Router] Tier 0 Match: Lead Count`);
      return {
        nodes: [
          {
            id: 'lead_count',
            type: 'COUNT',
            description: 'Deterministic Count of Leads',
            tool: 'SQL_ENGINE',
            params: {
              operation: 'aggregate',
              entities: ['lead'],
              metrics: ['count'],
              filters: {}
            }
          }
        ],
        edges: [],
        sensitiveAction: false,
        requiredRoles: []
      };
    }

    // ==========================================
    // TIER 1: Deterministic Template Router (Lists & Location Match)
    // ==========================================
    const showPropertiesMatch = q.match(/^(?:show|list|find) properties in ([a-zA-Z\s]+)$/i);
    if (showPropertiesMatch) {
      const loc = showPropertiesMatch[1].trim();
      this.logger.log(`[Multi-Tier Router] Tier 1 Match: Show properties in ${loc}`);
      return {
        nodes: [
          {
            id: 'properties_list_location',
            type: 'LIST',
            description: `Deterministic list of properties in location: ${loc}`,
            tool: 'SQL_ENGINE',
            params: {
              operation: 'fetch',
              entities: ['property'],
              filters: { location: loc }
            }
          }
        ],
        edges: [],
        sensitiveAction: false,
        requiredRoles: []
      };
    }

    if (/^(?:show|list|find) all properties$/i.test(q)) {
      this.logger.log(`[Multi-Tier Router] Tier 1 Match: List all properties`);
      return {
        nodes: [
          {
            id: 'all_properties_list',
            type: 'LIST',
            description: 'Deterministic list of all properties',
            tool: 'SQL_ENGINE',
            params: {
              operation: 'fetch',
              entities: ['property'],
              filters: {}
            }
          }
        ],
        edges: [],
        sensitiveAction: false,
        requiredRoles: []
      };
    }

    if (/^(?:show|list|find) (?:all\s+)?employees$/i.test(q) || /^(?:show|list|find) (?:all\s+)?agents$/i.test(q) || /^(?:show|list|find) (?:all\s+)?staff$/i.test(q)) {
      this.logger.log(`[Multi-Tier Router] Tier 1 Match: List all employees`);
      return {
        nodes: [
          {
            id: 'all_employees_list',
            type: 'LIST',
            description: 'Deterministic list of all employees',
            tool: 'SQL_ENGINE',
            params: {
              operation: 'fetch',
              entities: ['employeeprofile'],
              filters: {}
            }
          }
        ],
        edges: [],
        sensitiveAction: false,
        requiredRoles: []
      };
    }

    if (/^(?:show|list|find) (?:active\s+)?leads$/i.test(q)) {
      this.logger.log(`[Multi-Tier Router] Tier 1 Match: List active leads`);
      return {
        nodes: [
          {
            id: 'active_leads_list',
            type: 'LIST',
            description: 'Deterministic list of active leads',
            tool: 'SQL_ENGINE',
            params: {
              operation: 'fetch',
              entities: ['lead'],
              filters: { status: 'NEW' } // Default active lead status
            }
          }
        ],
        edges: [],
        sensitiveAction: false,
        requiredRoles: []
      };
    }

    this.logger.log(`[Multi-Tier Router] No Tier 0/1 match. Routing query downstream.`);
    return null;
  }
}
