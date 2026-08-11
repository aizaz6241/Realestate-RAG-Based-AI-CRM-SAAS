import { Injectable, Logger } from '@nestjs/common';

export interface FactViolation {
  rule: string;
  detail: string;
  severity: 'CRITICAL' | 'WARNING';
}

export interface FactVerificationReport {
  passed: boolean;
  violations: FactViolation[];
  /** Correction text to feed a regeneration prompt, empty when passed. */
  correctionInstruction: string;
  checkedNumbers: number;
  checkedNames: number;
}

/**
 * Deterministic grounding check: does the generated answer only contain facts that
 * appear in the retrieved rows?
 *
 * This replaces an LLM "Zero-Hallucination Verification Engine" that cost one call
 * to audit plus up to two more to regenerate — three round trips spent asking a
 * small model to check arithmetic it is bad at. Every rule that engine described in
 * its prompt is mechanically checkable against the rows we already have in memory,
 * and doing it in code is both instant and impossible to talk out of a verdict.
 *
 * Design bias: only flag what can be proven wrong. A false CRITICAL triggers a
 * pointless regeneration and makes responses worse, so ambiguous cases pass.
 */
@Injectable()
export class FactVerifierService {
  private readonly logger = new Logger(FactVerifierService.name);

  verify(
    responseText: string,
    rows: any[],
    context: {
      requestedEntities?: string[];
      tablesUsed?: string[];
      /** Per-tool row counts, e.g. { searchProperties: 0 } */
      counts?: Record<string, number>;
    } = {}
  ): FactVerificationReport {
    const violations: FactViolation[] = [];
    const safeRows = Array.isArray(rows) ? rows : [];

    // Flatten every scalar in the result set once; both checks below query it.
    const corpus = this.buildValueCorpus(safeRows);

    // --- Rule 1: empty result set must not be described as populated ---
    if (safeRows.length === 0) {
      const fabricated = this.detectFabricatedListing(responseText);
      if (fabricated) {
        violations.push({
          rule: 'EMPTY_RESULT_FABRICATION',
          detail: `The query returned 0 records, but the response presents data ("${fabricated}"). It must state that no records were found.`,
          severity: 'CRITICAL',
        });
      }
    }

    // --- Rule 2: numeric claims must trace to the data ---
    const numbers = this.extractClaimedNumbers(responseText);
    const allowedNumbers = new Set<string>([
      ...corpus.numbers,
      String(safeRows.length),
      ...Object.values(context.counts ?? {}).map(String),
    ]);

    for (const n of numbers) {
      if (allowedNumbers.has(n.normalized)) continue;
      // Derived aggregates (sums/averages over a numeric column) are legitimate
      // even though the literal value is absent from any single row.
      if (this.isPlausibleAggregate(n.value, corpus.numericsByField)) continue;
      violations.push({
        rule: 'UNGROUNDED_NUMBER',
        detail: `The value "${n.raw}" does not appear in the retrieved records and is not a derivable total.`,
        severity: 'CRITICAL',
      });
    }

    // --- Rule 3: named entities must exist in the data ---
    const names = this.extractCandidateNames(responseText);
    for (const name of names) {
      const needle = name.toLowerCase();
      const found = corpus.strings.some(s => s.includes(needle) || needle.includes(s));
      if (!found) {
        violations.push({
          rule: 'UNGROUNDED_ENTITY',
          detail: `"${name}" is presented as a record in the data but does not appear in the retrieved rows.`,
          severity: 'CRITICAL',
        });
      }
    }

    // --- Rule 4: don't describe an entity type that was never queried ---
    const tables = (context.tablesUsed ?? []).map(t => t.toLowerCase());
    const entityClaims: { pattern: RegExp; requires: string; label: string }[] = [
      { pattern: /\b(sick leave|annual leave|casual leave|leave request|leave balance|pending leave|chutti)\b/i, requires: 'leaverequest', label: 'leave requests' },
      { pattern: /\b(payslip|payroll|net salary|gross salary|tankhwa)\b/i, requires: 'payroll', label: 'payroll records' },
      { pattern: /\b(check[- ]?in|check[- ]?out|marked (?:present|absent)|hazri)\b/i, requires: 'attendance', label: 'attendance records' },
    ];

    if (tables.length > 0) {
      for (const claim of entityClaims) {
        if (claim.pattern.test(responseText) && !tables.includes(claim.requires)) {
          violations.push({
            rule: 'ENTITY_TYPE_MISMATCH',
            detail: `The response details ${claim.label}, but no "${claim.requires}" records were retrieved (queried: ${tables.join(', ')}). It must not infer them.`,
            severity: 'CRITICAL',
          });
        }
      }
    }

    const critical = violations.filter(v => v.severity === 'CRITICAL');
    const passed = critical.length === 0;

    if (!passed) {
      this.logger.warn(
        `[Fact Verifier] ${critical.length} grounding violation(s): ` +
        critical.map(v => v.rule).join(', ')
      );
    }

    return {
      passed,
      violations,
      correctionInstruction: passed
        ? ''
        : critical.map((v, i) => `${i + 1}. [${v.rule}] ${v.detail}`).join('\n'),
      checkedNumbers: numbers.length,
      checkedNames: names.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Corpus construction
  // ---------------------------------------------------------------------------
  private buildValueCorpus(rows: any[]): {
    strings: string[];
    numbers: Set<string>;
    /**
     * Numeric values grouped by the field they came from.
     *
     * Grouping matters: aggregates are only meaningful within a single column.
     * A flat list mixes `price` with `bedrooms`, so the mean of that list matches
     * nothing a user would ever be told, and a real average like
     * (1250000+550000)/2 gets reported as ungrounded.
     */
    numericsByField: Map<string, number[]>;
  } {
    const strings: string[] = [];
    const numbers = new Set<string>();
    const numericsByField = new Map<string, number[]>();

    const record = (field: string, n: number) => {
      const norm = this.normalizeNumber(String(n));
      if (!norm) return;
      numbers.add(norm);
      const list = numericsByField.get(field) ?? [];
      list.push(n);
      numericsByField.set(field, list);
    };

    const walk = (value: any, field: string, depth = 0) => {
      if (value == null || depth > 6) return;

      if (typeof value === 'string') {
        const s = value.toLowerCase().trim();
        if (s) strings.push(s);
        // Numbers embedded in strings (e.g. "AED 450,000") still count as grounded.
        for (const m of value.matchAll(/\d[\d,]*\.?\d*/g)) {
          const parsed = Number(this.normalizeNumber(m[0]) ?? NaN);
          if (Number.isFinite(parsed)) record(field, parsed);
        }
        return;
      }

      if (typeof value === 'number') {
        record(field, value);
        return;
      }

      if (typeof value === 'boolean') return;

      if (value instanceof Date) {
        strings.push(value.toISOString().toLowerCase());
        return;
      }

      if (Array.isArray(value)) {
        // Array index is not a field name — keep the parent's field so values from
        // the same column across rows land in the same bucket.
        value.forEach(v => walk(v, field, depth + 1));
        return;
      }

      if (typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          walk(v, k.toLowerCase(), depth + 1);
        }
      }
    };

    walk(rows, '__root__');
    return { strings, numbers, numericsByField };
  }

  /** "1,250.00" and "1250" must compare equal. */
  private normalizeNumber(raw: string): string | null {
    const cleaned = raw.replace(/,/g, '').trim();
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    // Drop trailing zeros so 1250.00 === 1250
    return String(n);
  }

  // ---------------------------------------------------------------------------
  // Claim extraction
  // ---------------------------------------------------------------------------
  private extractClaimedNumbers(text: string): { raw: string; normalized: string; value: number }[] {
    // Strip markdown scaffolding that carries incidental digits (heading levels,
    // list markers, table pipes) before looking for factual figures.
    const cleaned = text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^[#>\s]*\d+[.)]\s/gm, ' ')
      .replace(/\[(?:Doc|Chunk)-\d+[^\]]*\]/gi, ' ');

    const out: { raw: string; normalized: string; value: number }[] = [];
    const seen = new Set<string>();

    for (const m of cleaned.matchAll(/(?<![\w.])(\d[\d,]*(?:\.\d+)?)(?![\w])/g)) {
      const raw = m[1];
      const normalized = this.normalizeNumber(raw);
      if (!normalized) continue;

      const value = Number(normalized);

      // Small integers are almost always prose ("top 5", "3 steps", years, percents)
      // rather than factual claims about the data. Checking them produces noise.
      if (Number.isInteger(value) && value <= 12) continue;
      // Four-digit values in year range are usually dates in narration.
      if (Number.isInteger(value) && value >= 1900 && value <= 2100) continue;
      if (seen.has(normalized)) continue;

      seen.add(normalized);
      out.push({ raw, normalized, value });
    }

    return out;
  }

  /**
   * Names the response presents as records. Conservative on purpose: only
   * multi-word Capitalized sequences, and only outside markdown emphasis, so
   * ordinary sentence capitalisation and headings don't register as claims.
   */
  private extractCandidateNames(text: string): string[] {
    const cleaned = text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\*\*[^*]+\*\*/g, ' ')   // bold is used for labels/headings here
      .replace(/^#{1,6}\s.*$/gm, ' ')
      .replace(/\[(?:Doc|Chunk)-\d+[^\]]*\]/gi, ' ');

    // Words that begin sentences or are domain vocabulary, not record names.
    const stop = new Set([
      'the', 'this', 'that', 'these', 'those', 'there', 'here', 'no', 'not', 'none',
      'zorvex', 'ai', 'database', 'system', 'total', 'summary', 'note', 'however',
      'based', 'according', 'currently', 'please', 'sorry', 'unfortunately',
      'property', 'properties', 'client', 'clients', 'employee', 'employees',
      'agent', 'agents', 'lead', 'leads', 'task', 'tasks', 'owner', 'owners',
      'records', 'record', 'data', 'result', 'results', 'found', 'available',
      'dubai', 'uae', 'lahore', 'karachi', 'islamabad', 'aed', 'pkr', 'usd',
      'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
      'september', 'october', 'november', 'december',
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    ]);

    const names = new Set<string>();

    for (const m of cleaned.matchAll(/\b([A-Z][a-z]{1,})\s+([A-Z][a-z]{1,})\b/g)) {
      const first = m[1].toLowerCase();
      const second = m[2].toLowerCase();
      if (stop.has(first) || stop.has(second)) continue;
      names.add(`${m[1]} ${m[2]}`);
    }

    return Array.from(names);
  }

  /** Is the response listing items when there were none? */
  private detectFabricatedListing(text: string): string | null {
    // An explicit "no records" statement clears the response.
    if (/\b(no |zero |0 )(records?|results?|data|properties|employees|clients|leads|tasks)\b/i.test(text)) return null;
    if (/\b(not found|none found|no matching|koi record nahi|nahi mila|nahi mile)\b/i.test(text)) return null;

    // Markdown table rows or bulleted entries imply enumerated data.
    const tableRow = text.match(/^\|[^|\n]+\|[^|\n]+\|/m);
    if (tableRow) return tableRow[0].trim().slice(0, 60);

    const bullets = text.match(/^\s*[-*]\s+\S.*$/gm);
    if (bullets && bullets.length >= 2) return bullets[0].trim().slice(0, 60);

    return null;
  }

  /**
   * Accepts values reachable as a sum, mean, min or max over any single column, so
   * legitimate aggregates are not flagged as fabrications.
   *
   * Evaluated per column rather than over all numbers pooled together — pooling
   * `price` with `bedrooms` produces aggregates that correspond to nothing.
   * Tolerance absorbs the rounding a composer applies when it writes prose.
   */
  private isPlausibleAggregate(value: number, numericsByField: Map<string, number[]>): boolean {
    const tolerance = Math.max(1, Math.abs(value) * 0.02);
    const near = (candidate: number) => Math.abs(value - candidate) <= tolerance;

    for (const values of numericsByField.values()) {
      if (values.length === 0) continue;

      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;

      if (near(sum)) return true;
      if (near(avg) || near(Math.round(avg))) return true;
      if (near(Math.max(...values))) return true;
      if (near(Math.min(...values))) return true;
    }

    return false;
  }
}
