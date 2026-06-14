import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ResponseSanitizer {
  private readonly logger = new Logger(ResponseSanitizer.name);

  sanitizeResponse(text: string): string {
    if (!text || typeof text !== 'string') return text;

    this.logger.log('[Response Sanitizer] Sanitizing response content to remove internal metadata.');

    let cleaned = text;

    // 1. Strip full UUIDs (e.g. 7aab538f-0939-4137-9f0b-b3e39c0f4d6b)
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    cleaned = cleaned.replace(uuidRegex, '[REDACTED_ID]');

    // 2. Strip truncated/partial IDs and labels (e.g., "User ID: 7aab...", "ID: 7aab...")
    const truncatedIdRegex = /(?:user\s*id|profile\s*id|record\s*id|id|uuid):\s*[0-9a-f]{3,8}\.{3,}/gi;
    cleaned = cleaned.replace(truncatedIdRegex, '');

    // 3. Clean up double/multiple spaces or leftover bullet dashes caused by ID stripping
    cleaned = cleaned.replace(/\s*\-\s*\[REDACTED_ID\]\s*/g, '');
    cleaned = cleaned.replace(/\s*\[REDACTED_ID\]\s*/g, ' ');

    // 4. Remove any loose trailing colons or dashes from cleanings
    cleaned = cleaned.replace(/:\s*\n/g, '\n');
    cleaned = cleaned.replace(/\n\s*-\s*\n/g, '\n');

    return cleaned.trim();
  }

  // Sanitize raw database object fields before they go to LLM context
  sanitizeDatabaseRow(row: any): any {
    if (!row || typeof row !== 'object') return row;

    const copy = { ...row };
    const fieldsToDrop = ['passwordHash', 'createdAt', 'updatedAt', 'organizationId'];
    
    for (const f of fieldsToDrop) {
      delete copy[f];
    }

    return copy;
  }
}
