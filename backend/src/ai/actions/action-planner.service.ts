import { Injectable, Logger } from '@nestjs/common';
import { AiLlmService } from '../ai-llm.service';
import { renderFullActionCatalogue, actionsForRole, ACTIONS_BY_NAME } from './action-registry';

export interface ActionIntent {
  isAction: boolean;
  action?: string;
  params?: Record<string, any>;
  /** 0-100. Below the threshold we ask rather than act. */
  confidence: number;
  reasoning?: string;
}

/**
 * Decides whether the user asked for something to be *done*, and if so which action.
 *
 * Kept separate from the read planner because the failure modes are opposite. For a
 * read, guessing wrong costs a wasted query. For a write, guessing wrong changes real
 * records — so this classifier is deliberately conservative: anything short of a
 * clear instruction falls through to the read path, where the worst case is an
 * unhelpful answer rather than an unwanted meeting in someone's calendar.
 */
@Injectable()
export class ActionPlannerService {
  private readonly logger = new Logger(ActionPlannerService.name);

  /** Below this we treat it as a question, not an instruction. */
  private static readonly MIN_CONFIDENCE = 70;

  constructor(private llmService: AiLlmService) {}

  /**
   * Cheap pre-filter. Most messages are questions, and running an extra LLM call on
   * "how many properties do we have" to discover it is not an action would put the
   * cost back that the pipeline collapse removed.
   */
  private looksLikeAction(message: string): boolean {
    const q = message.toLowerCase();

    // Interrogatives are questions, even when they contain an action verb
    // ("what tasks did you assign?" must not create a task).
    if (/^\s*(what|which|who|when|where|why|how|do we|does|did|is there|are there|show|list|tell me|give me a list|kitne|kitni|kaun|kya hai|dikhao|batao)\b/i.test(q)) {
      // ...unless it is a polite instruction: "can you assign this to Sarah?"
      if (!/\b(can you|could you|would you|will you|please)\b/i.test(q)) return false;
    }

    const actionVerbs = /\b(create|add|make|assign|give|schedule|book|set up|arrange|update|change|move|reassign|mark|approve|reject|log|record|note|reschedule|postpone|cancel|drop|raise|increase|decrease|reprice|publish|remind|notify)\b/i;
    const urduVerbs = /\b(karo|kardo|kar do|do|dedo|de do|banao|bana do|lagao|laga do|rakho|rakh do|badlo|badal do|bhejo|bhej do|approve|assign)\b/i;

    return actionVerbs.test(q) || urduVerbs.test(q);
  }

  async detectAction(
    message: string,
    userRole: string,
    organizationId: string,
    userId: string,
    history: { role: 'user' | 'model'; content: string }[] = []
  ): Promise<ActionIntent> {
    if (!this.looksLikeAction(message)) {
      return { isAction: false, confidence: 0 };
    }

    // Detection runs against the FULL registry, not the role-filtered one.
    //
    // Filtering here meant an AGENT saying "change the Marina price to 95000" simply
    // wasn't recognised as an action — it fell through to the read pipeline and came
    // back as "I built an invalid query … READ ONLY", which tells the user nothing.
    // Recognising it and letting the executor return DENIED produces the honest
    // answer: your role can't do this, ask an admin. RBAC stays enforced in exactly
    // one place.
    const available = actionsForRole(userRole);

    const now = new Date();
    const systemPrompt = `You decide whether the user is INSTRUCTING the assistant to perform an action, and which one.

=== CURRENT DATE & TIME ===
${now.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
Resolve relative dates ("tomorrow", "Friday", "kal", "next week") into ISO 8601 strings.

=== ACTIONS THIS SYSTEM SUPPORTS ===
${renderFullActionCatalogue()}

Parameters marked * are required.
Identify the action regardless of whether this user is permitted to run it —
permission is checked separately, and naming it lets the user be told plainly that
their role can't do it rather than receiving an unrelated error.

=== RECENT CONVERSATION ===
${history.slice(-4).map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.content.slice(0, 200)}`).join('\n') || '(none)'}

=== RULES ===
1. Only set isAction true when the user is telling you to DO something that changes
   a record. Questions about existing data are NOT actions.
     "how many tasks are open?"            -> isAction: false
     "what did you assign to Sarah?"       -> isAction: false
     "assign a task to Sarah"              -> isAction: true
     "Sarah ko task do"                    -> isAction: true
2. Choose ONLY from the action list above. If the user wants something that is not
   listed, set isAction false — do not substitute a different action.
3. Extract every parameter you can from the message. Leave a parameter out entirely
   rather than inventing a value; a missing one will be asked for.
4. Refer to people, properties, leads and clients by the NAME the user used. Do not
   invent ids.
5. confidence is 0-100. Score low when the instruction is vague, when it could be a
   question, or when you had to guess which action was meant.

Respond with ONLY this JSON:
{
  "isAction": true,
  "action": "createTask",
  "params": { "title": "...", "assignee": "Sarah", "dueDate": "2026-08-05" },
  "confidence": 92,
  "reasoning": "one short sentence"
}`;

    try {
      const raw = await this.llmService.callLLM(
        systemPrompt,
        `User message: "${message}"`,
        [],
        false,
        organizationId,
        userId,
        { jsonMode: true, maxTokens: 500 }
      );

      const parsed = this.llmService.extractJson<ActionIntent>(raw);
      if (!parsed || !parsed.isAction) return { isAction: false, confidence: 0 };

      // The model may name an action this role cannot run, or one that does not
      // exist. Both are rejected here so a bad name never reaches the executor.
      if (!parsed.action || !ACTIONS_BY_NAME[parsed.action]) {
        this.logger.warn(`[Action Planner] Model named an unknown action: "${parsed.action}"`);
        return { isAction: false, confidence: 0 };
      }
      if (!available.some(a => a.name === parsed.action)) {
        // Recognised but not permitted. Returned as an intent on purpose so the
        // executor can answer with a clear DENIED rather than the request falling
        // through to the read pipeline and failing for an unrelated reason.
        this.logger.log(`[Action Planner] "${parsed.action}" recognised but not permitted for ${userRole} — routing to the permission check.`);
        return { ...parsed, confidence: Math.max(parsed.confidence ?? 0, 80) };
      }

      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
      if (confidence < ActionPlannerService.MIN_CONFIDENCE) {
        this.logger.log(`[Action Planner] "${parsed.action}" at ${confidence}% — below threshold, treating as a question.`);
        return { isAction: false, confidence };
      }

      this.logger.log(`[Action Planner] Detected "${parsed.action}" (${confidence}%)`);
      return { ...parsed, confidence };
    } catch (err: any) {
      this.logger.warn(`[Action Planner] Detection failed: ${err.message}`);
      return { isAction: false, confidence: 0 };
    }
  }
}
