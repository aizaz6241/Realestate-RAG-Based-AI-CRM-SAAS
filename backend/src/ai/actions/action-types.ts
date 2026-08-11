import { Role } from '@prisma/client';

/**
 * Contract for AI-performed actions.
 *
 * ── The safety model ─────────────────────────────────────────────────────────
 *
 * The AI never writes SQL and never touches the database directly. It can only
 * name an action from a fixed allowlist and supply parameters, which are then
 * type-checked before a hand-written handler runs. This is a structural guarantee,
 * not a prompt instruction: there is no code path from model output to arbitrary
 * SQL, so "drop the table" or "delete all leads" cannot be expressed at all — the
 * worst a confused model can do is name an action that does not exist.
 *
 * Three further limits stack on top:
 *   - every handler is tenant-scoped; cross-organization writes are impossible
 *   - RBAC is checked per action, before parameters are even resolved
 *   - destructive operations (delete/archive) are deliberately NOT in the registry
 */

/**
 * How much ceremony an action needs before it runs.
 *
 * The tiers are about reversibility and blast radius, not importance. Something
 * that only the actor can see and can trivially undo is SAFE; anything another
 * person will see, or that is awkward to reverse, is CONFIRM.
 */
export type RiskLevel =
  /** Reversible, private to the actor, low blast radius. Runs immediately. */
  | 'SAFE'
  /** Visible to others or awkward to undo. Shows a preview and waits for a yes. */
  | 'CONFIRM'
  /** Financial or HR consequence. Requires confirmation AND an elevated role. */
  | 'ELEVATED';

export type ParamType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  /** A person/record referenced by name; resolved to an id before the handler runs. */
  | 'entityRef'
  | 'stringArray';

export interface ParamSpec {
  type: ParamType;
  required: boolean;
  /** Shown to the model. Be concrete — this is the only guidance it gets. */
  description: string;
  enumValues?: string[];
  /** For entityRef: which registry table to resolve the name against. */
  entity?: 'user' | 'employeeprofile' | 'lead' | 'client' | 'property' | 'owner' | 'task' | 'vehicle';
  default?: any;
  /** Prompt shown when the parameter is missing and must be asked for. */
  askIfMissing?: string;
}

export interface ActionContext {
  userId: string;
  userRole: string;
  organizationId: string;
  /** Display name of the acting user, for previews and audit text. */
  actorName: string;
}

export interface ActionResult {
  success: boolean;
  /** One-line confirmation written for a human, not a log. */
  message: string;
  /** The record(s) touched, for the UI to render. */
  data?: any;
  /** Follow-ups worth offering after this action. */
  suggestions?: string[];
}

export interface ActionDefinition {
  name: string;
  category: 'tasks' | 'meetings' | 'leads' | 'clients' | 'properties' | 'hr' | 'logistics' | 'owners';
  /** Shown to the model when choosing an action. One sentence, imperative. */
  description: string;
  /** Real phrasings users would type, including Roman Urdu. Drives selection accuracy. */
  examples: string[];
  params: Record<string, ParamSpec>;
  /** Roles permitted to run this. '*' means any authenticated role. */
  roles: Role[] | '*';
  risk: RiskLevel;
  /**
   * Human-readable summary of exactly what will happen, shown before a CONFIRM or
   * ELEVATED action runs. Must state the concrete effect — "Assign 'Fix listing
   * photos' to Sarah Agent, due 5 Aug" — never a vague restatement of intent.
   */
  preview: (params: Record<string, any>, ctx: ActionContext) => string;
  handler: (params: Record<string, any>, ctx: ActionContext, deps: ActionDeps) => Promise<ActionResult>;
}

/** Injected rather than imported so handlers stay unit-testable. */
export interface ActionDeps {
  prisma: any;
}

export type ActionOutcome =
  | { status: 'EXECUTED'; result: ActionResult; action: string }
  | { status: 'NEEDS_CONFIRMATION'; preview: string; action: string; params: Record<string, any>; risk: RiskLevel }
  | { status: 'NEEDS_INPUT'; missing: string[]; questions: string[]; action: string; params: Record<string, any> }
  | { status: 'DENIED'; reason: string; action: string }
  | { status: 'AMBIGUOUS'; field: string; candidates: { id: string; label: string }[]; action: string; params: Record<string, any> }
  | { status: 'FAILED'; error: string; action: string };
