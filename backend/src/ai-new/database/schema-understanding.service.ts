import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueryUnderstandingResult } from './query-understanding.service';
import { BusinessOntology } from './business-ontology';
import { SchemaDictionary, SchemaTable } from './schema-dictionary';
import { IntelligentCacheService } from '../cache/intelligent-cache.service';

export interface SchemaUnderstandingResult {
  tables: string[];
  columns: Record<string, string[]>;
  joins: string[];
  confidence: number;
}

@Injectable()
export class SchemaUnderstandingService implements OnModuleInit {
  private readonly logger = new Logger(SchemaUnderstandingService.name);

  constructor(
    private readonly cacheService: IntelligentCacheService
  ) {}

  async onModuleInit() {
    this.logger.log('SchemaUnderstandingService initialized.');
  }

  // 1. Semantic Mapping & Ontology (Finding synonyms)
  private mapBusinessTerms(queryResult: QueryUnderstandingResult): string[] {
    const searchTerms: string[] = [];
    if (queryResult.intent !== 'UNKNOWN') searchTerms.push(queryResult.intent);
    
    // Add all entities to search terms
    for (const [key, values] of Object.entries(queryResult.entities)) {
      if (Array.isArray(values)) {
        searchTerms.push(...values);
      }
    }
    
    for (const [key, value] of Object.entries(queryResult.businessTermsMapped)) {
      searchTerms.push(value);
    }

    return searchTerms;
  }

  private buildMarkdownSchema(): string {
    let markdown = '';
    for (const [tableName, tableDef] of Object.entries(SchemaDictionary)) {
      markdown += `# Table: ${tableName}\n`;
      if (tableDef.synonyms.length > 0) {
        markdown += `- Synonyms: ${tableDef.synonyms.join(', ')}\n`;
      }
      const columnNames = tableDef.columns.map(c => c.name);
      markdown += `- Columns: ${columnNames.join(', ')}\n`;
      
      const joins = tableDef.relationships.map(r => `${r.foreignKey} -> ${r.targetTable}`);
      if (joins.length > 0) {
        markdown += `- Joins: ${joins.join(', ')}\n`;
      }
      markdown += '\n';
    }
    return markdown;
  }

  // 2. Column Selection Intelligence & Final Output via LLM
  async analyzeSchemaContext(
    queryResult: QueryUnderstandingResult, 
    organizationId?: string,
    userId?: string
  ): Promise<SchemaUnderstandingResult> {
    
    const searchTerms = this.mapBusinessTerms(queryResult).map(t => t.toLowerCase());
    
    // 1. Check Cache
    const cacheKey = this.cacheService.generateKey('schema_det', organizationId || 'default', userId || 'system', searchTerms.join('|'));
    const cachedResult = this.cacheService.get<SchemaUnderstandingResult>(cacheKey);
    if (cachedResult) {
      this.logger.log('Cache Hit: Deterministic Schema Understanding returned from L1 Cache.');
      return cachedResult;
    }

    this.logger.log(`Executing Deterministic Schema Matcher for terms: ${searchTerms.join(', ')}`);

    const selectedTables = new Set<string>();
    const selectedColumns: Record<string, string[]> = {};
    const selectedJoins = new Set<string>();

    // 2. Business Ontology Expansion
    for (const term of searchTerms) {
      for (const [ontologyTerm, ontologyTables] of Object.entries(BusinessOntology)) {
        if (term.includes(ontologyTerm.toLowerCase()) || ontologyTerm.toLowerCase().includes(term)) {
          ontologyTables.forEach(t => selectedTables.add(t));
        }
      }
    }

    // 3. Keyword Matching against Schema Dictionary
    for (const [tableName, tableDef] of Object.entries(SchemaDictionary)) {
      const tableKeywords = [
        tableName.toLowerCase(),
        ...tableDef.synonyms.map(s => s.toLowerCase()),
        tableDef.description.toLowerCase()
      ];

      const columnKeywords = tableDef.columns.map(c => ({
        name: c.name.toLowerCase(),
        desc: c.description?.toLowerCase() || ''
      }));

      // Match Table Level
      const tableMatch = searchTerms.some(term => tableKeywords.some(kw => kw.includes(term) || term.includes(kw)));
      if (tableMatch) {
        selectedTables.add(tableName);
      }

      // Match Column Level
      for (const term of searchTerms) {
        for (const col of columnKeywords) {
          if (col.name.includes(term) || term.includes(col.name) || col.desc.includes(term)) {
            selectedTables.add(tableName);
            break;
          }
        }
      }
    }

    // Fallback: If no tables matched, default to User/Employee (safe default)
    if (selectedTables.size === 0) {
      this.logger.warn('No semantic match found in Schema. Defaulting to User/EmployeeProfile.');
      selectedTables.add('User');
      selectedTables.add('EmployeeProfile');
    }

    // 4. Extract Columns and Joins for Selected Tables
    const tablesArray = Array.from(selectedTables);
    for (const table of tablesArray) {
      const def = SchemaDictionary[table];
      if (def) {
        selectedColumns[table] = def.columns.map(c => c.name);
        
        // Find internal joins within the selected tables
        for (const rel of def.relationships) {
          if (selectedTables.has(rel.targetTable)) {
            selectedJoins.add(`${table}.${rel.foreignKey} = ${rel.targetTable}.id`);
          }
        }
      }
    }

    // 5. Build Result
    const result: SchemaUnderstandingResult = {
      tables: tablesArray,
      columns: selectedColumns,
      joins: Array.from(selectedJoins),
      confidence: 0.99 // Deterministic matching is highly confident
    };

    this.cacheService.set(cacheKey, result, 86400); // Cache for 24 hours
    return result;
  }
}
