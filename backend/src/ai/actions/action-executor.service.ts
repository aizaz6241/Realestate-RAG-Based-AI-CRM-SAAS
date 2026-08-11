import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../permission.service';
import { QueryCacheService } from '../query-cache.service';
import { ACTIONS_BY_NAME, actionsForRole } from './action-registry';
import { ActionContext, ActionDefinition, ActionOutcome, ParamSpec } from './action-types';

/**
 * Validates and runs an action the model asked for.
 *
 * The order of checks matters and is deliberate:
 *
 *   1. **Does the action exist?** Unknown name → refuse. The model cannot invent
 *      capabilities.
 *   2. **Is this role allowed?** Checked before parameters are even parsed, so a
 *      denied action never resolves names or touches the database.
 *   3. **Are the parameters valid?** Types coerced, enums checked, unknown keys
 *      dropped. A handler never sees a value it did not ask for.
 *   4. **Do the referenced records exist, unambiguously?** "Sarah" becomes a real
 *      user id in this tenant, or we come back and ask which one.
 *   5. **Does this need a human yes?** Anything CONFIRM or ELEVATED returns a
 *      preview instead of running.
 *
 * Only after all five does a hand-written handler execute.
 */
@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);

  constructor(
    private prisma: PrismaService,
    private permissionService: PermissionService,
    private queryCache: QueryCacheService
  ) {}

  listAvailable(role: string): ActionDefinition[] {
    return actionsForRole(role);
  }

  /**
   * @param confirmed set when the user has already seen the preview and said yes.
   */
  async execute(
    actionName: string,
    rawParams: Record<string, any>,
    ctx: ActionContext,
    confirmed = false
  ): Promise<ActionOutcome> {
    const action = ACTIONS_BY_NAME[actionName];

    // 1. Allowlist.
    if (!action) {
      this.logger.warn(`[Action] Unknown action requested: "${actionName}"`);
      return {
        status: 'DENIED',
        action: actionName,
        reason: `"${actionName}" is not something I can do.`,
      };
    }

    // 2. RBAC — before anything else touches the database.
    const allowed = action.roles === '*' || (action.roles as string[]).includes(ctx.userRole);
    if (!allowed) {
      this.logger.warn(`[Action] ${ctx.userRole} denied "${actionName}"`);

      // Only the first sentence of the description — the rest is implementation
      // detail ("the previous price is kept in history") that reads as a non-sequitur
      // when appended to a refusal.
      const capability = action.description.split(/(?<=\.)\s/)[0].replace(/\.$/, '');
      const verb = capability.charAt(0).toLowerCase() + capability.slice(1);

      const whoCan = (action.roles as string[])
        .filter(r => ['SUPER_ADMIN', 'ADMIN', 'HR', 'SALES_MANAGER'].includes(r))
        .map(r => r.replace('_', ' ').toLowerCase());

      const suggestion = whoCan.length
        ? ` Ask ${whoCan.includes('admin') || whoCan.includes('super admin') ? 'an admin' : `someone with the ${whoCan[0]} role`} to do it.`
        : '';

      return {
        status: 'DENIED',
        action: actionName,
        reason: `Your role (${ctx.userRole}) can't ${verb}.${suggestion}`,
      };
    }

    // 3. Parameters.
    const parsed = this.parseParams(action, rawParams);
    if (parsed.missing.length > 0) {
      return {
        status: 'NEEDS_INPUT',
        action: actionName,
        params: parsed.values,
        missing: parsed.missing,
        questions: parsed.questions,
      };
    }
    if (parsed.errors.length > 0) {
      return { status: 'FAILED', action: actionName, error: parsed.errors.join(' ') };
    }

    // 4. Entity resolution.
    const resolution = await this.resolveEntityRefs(action, parsed.values, ctx);
    if (resolution.ambiguous) {
      return {
        status: 'AMBIGUOUS',
        action: actionName,
        field: resolution.ambiguous.field,
        candidates: resolution.ambiguous.candidates,
        params: parsed.values,
      };
    }
    if (resolution.notFound) {
      return {
        status: 'FAILED',
        action: actionName,
        error: `I couldn't find ${resolution.notFound.field} matching "${resolution.notFound.term}".`,
      };
    }

    const params = resolution.values;

    // 5. Human confirmation.
    if (!confirmed && action.risk !== 'SAFE') {
      return {
        status: 'NEEDS_CONFIRMATION',
        action: actionName,
        params,
        risk: action.risk,
        preview: action.preview(params, ctx),
      };
    }

    // Execute.
    try {
      this.logger.log(`[Action] ${ctx.userRole} ${ctx.userId} running "${actionName}"`);
      const result = await action.handler(params, ctx, { prisma: this.prisma });

      // A write invalidates cached reads of what it touched, so the next question
      // doesn't answer from a pre-write snapshot.
      this.queryCache.invalidateTables([action.category, ...this.tablesFor(action)]);

      await this.audit(action, params, ctx, result.success ? 'SUCCESS' : 'FAILED', undefined, result.message);
      return { status: 'EXECUTED', action: actionName, result };
    } catch (err: any) {
      this.logger.error(`[Action] "${actionName}" failed: ${err.message}`);
      await this.audit(action, params, ctx, 'FAILED', err.message);
      return {
        status: 'FAILED',
        action: actionName,
        error: this.humanizeError(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Parameter handling
  // ---------------------------------------------------------------------------
  private parseParams(action: ActionDefinition, raw: Record<string, any>) {
    const values: Record<string, any> = {};
    const missing: string[] = [];
    const questions: string[] = [];
    const errors: string[] = [];

    for (const [name, spec] of Object.entries(action.params)) {
      let value = raw?.[name];

      if (value === undefined || value === null || value === '') {
        if (spec.default !== undefined) {
          values[name] = spec.default;
          continue;
        }
        if (spec.required) {
          missing.push(name);
          questions.push(spec.askIfMissing ?? `What should ${name} be?`);
        }
        continue;
      }

      const coerced = this.coerce(value, spec, name);
      if (coerced.error) {
        errors.push(coerced.error);
        continue;
      }
      values[name] = coerced.value;
    }

    // Anything the model invented is dropped rather than forwarded — handlers only
    // ever see declared parameters.
    return { values, missing, questions, errors };
  }

  private coerce(value: any, spec: ParamSpec, name: string): { value?: any; error?: string } {
    switch (spec.type) {
      case 'number': {
        // Tolerate "1.2 million", "AED 95,000", "95k".
        const n = this.parseNumber(value);
        if (n === null) return { error: `"${value}" isn't a valid number for ${name}.` };
        return { value: n };
      }

      case 'boolean':
        return { value: typeof value === 'boolean' ? value : /^(true|yes|haan|1)$/i.test(String(value)) };

      case 'date':
      case 'datetime': {
        const d = this.parseDate(value);
        if (!d) return { error: `I couldn't read "${value}" as a date for ${name}.` };
        return { value: d.toISOString() };
      }

      case 'enum': {
        const allowed = spec.enumValues ?? [];
        const wanted = String(value).toUpperCase().replace(/[\s-]+/g, '_');
        const match = allowed.find(a => a.toUpperCase() === wanted);
        if (!match) {
          return { error: `${name} must be one of ${allowed.join(', ')} — got "${value}".` };
        }
        return { value: match };
      }

      case 'stringArray':
        if (Array.isArray(value)) return { value: value.map(String) };
        return { value: String(value).split(/\s*,\s*/).filter(Boolean) };

      default:
        return { value: String(value) };
    }
  }

  private parseNumber(value: any): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    let s = String(value).toLowerCase().replace(/aed|usd|pkr|rs\.?|,/g, '').trim();

    let multiplier = 1;
    if (/\b(m|million|mn)\b/.test(s)) { multiplier = 1_000_000; s = s.replace(/\b(m|million|mn)\b/, ''); }
    else if (/\b(k|thousand)\b/.test(s)) { multiplier = 1_000; s = s.replace(/\b(k|thousand)\b/, ''); }
    else if (/\b(cr|crore)\b/.test(s)) { multiplier = 10_000_000; s = s.replace(/\b(cr|crore)\b/, ''); }
    else if (/\b(lakh|lac)\b/.test(s)) { multiplier = 100_000; s = s.replace(/\b(lakh|lac)\b/, ''); }

    const n = Number(s.trim());
    return Number.isFinite(n) ? n * multiplier : null;
  }

  /**
   * Accepts ISO plus the relative phrasings people actually type. The planner is
   * asked to resolve dates already, but it is inconsistent about it, and a silently
   * wrong date on a meeting invite is worse than a clarifying question.
   */
  private parseDate(value: any): Date | null {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

    const raw = String(value).trim();
    const direct = new Date(raw);
    if (!isNaN(direct.getTime()) && /\d{4}-\d{2}-\d{2}/.test(raw)) return direct;

    const now = new Date();
    const lower = raw.toLowerCase();

    const atTime = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(lower);
    const applyTime = (d: Date) => {
      if (atTime) {
        let h = parseInt(atTime[1], 10);
        const m = atTime[2] ? parseInt(atTime[2], 10) : 0;
        const mer = atTime[3];
        if (mer === 'pm' && h < 12) h += 12;
        if (mer === 'am' && h === 12) h = 0;
        // A bare hour under 8 almost always means afternoon in scheduling talk.
        if (!mer && h <= 7) h += 12;
        d.setHours(h, m, 0, 0);
      } else {
        d.setHours(9, 0, 0, 0);
      }
      return d;
    };

    if (/\b(today|aaj)\b/.test(lower)) return applyTime(new Date(now));
    if (/\b(tomorrow|kal)\b/.test(lower)) {
      const d = new Date(now); d.setDate(d.getDate() + 1); return applyTime(d);
    }
    if (/\b(day after tomorrow|parso)\b/.test(lower)) {
      const d = new Date(now); d.setDate(d.getDate() + 2); return applyTime(d);
    }
    if (/\bnext week\b/.test(lower)) {
      const d = new Date(now); d.setDate(d.getDate() + 7); return applyTime(d);
    }

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (new RegExp(`\\b${days[i]}\\b`).test(lower)) {
        const d = new Date(now);
        const delta = (i - d.getDay() + 7) % 7 || 7; // always the upcoming one
        d.setDate(d.getDate() + delta);
        return applyTime(d);
      }
    }

    return isNaN(direct.getTime()) ? null : direct;
  }

  // ---------------------------------------------------------------------------
  // Entity resolution
  // ---------------------------------------------------------------------------
  /**
   * Turns names into ids, scoped to the tenant.
   *
   * Ambiguity is surfaced rather than guessed: with two Sarahs, picking one and
   * silently assigning work to the wrong person is far worse than one extra
   * question. Exact matches win over partial ones so a full name is never ambiguous.
   */
  private async resolveEntityRefs(
    action: ActionDefinition,
    values: Record<string, any>,
    ctx: ActionContext
  ): Promise<{
    values: Record<string, any>;
    ambiguous?: { field: string; candidates: { id: string; label: string }[] };
    notFound?: { field: string; term: string };
  }> {
    const out = { ...values };

    for (const [name, spec] of Object.entries(action.params)) {
      if (spec.type !== 'entityRef') continue;
      const term = values[name];
      if (!term || typeof term !== 'string') continue;
      // Already an id.
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(term)) continue;

      const matches = await this.lookupEntity(spec.entity!, term, ctx);

      if (matches.length === 0) return { values: out, notFound: { field: name, term } };
      if (matches.length > 1) return { values: out, ambiguous: { field: name, candidates: matches } };

      out[name] = matches[0].id;
      // Handlers and previews use the label to speak about the record naturally.
      out[`_${name}Label`] = matches[0].label;
    }

    // Meeting invitees are names, not a single ref, so they resolve as a set.
    if (Array.isArray(values.inviteUsers) && values.inviteUsers.length > 0) {
      const ids: string[] = [];
      const labels: string[] = [];
      for (const nameTerm of values.inviteUsers) {
        const found = await this.lookupEntity('user', String(nameTerm), ctx);
        if (found.length === 1) {
          ids.push(found[0].id);
          labels.push(found[0].label);
        } else if (found.length > 1) {
          return { values: out, ambiguous: { field: 'inviteUsers', candidates: found } };
        }
      }
      out._inviteUserIds = ids;
      out._inviteUserLabels = labels;
    }

    return { values: out };
  }

  private async lookupEntity(
    entity: string,
    term: string,
    ctx: ActionContext
  ): Promise<{ id: string; label: string }[]> {
    const t = term.trim();
    const org = ctx.organizationId;

    const nameOf = (u: any) => `${u.firstName} ${u.lastName ?? ''}`.trim();

    switch (entity) {
      case 'user':
      case 'employeeprofile': {
        const users = await this.prisma.user.findMany({
          where: {
            organizationId: org,
            isActive: true,
            OR: [
              { firstName: { contains: t, mode: 'insensitive' } },
              { lastName: { contains: t, mode: 'insensitive' } },
            ],
          },
          select: { id: true, firstName: true, lastName: true, role: true },
          take: 6,
        });
        // An exact first-name match disambiguates "Sarah" from "Sarah-Jane".
        const exact = users.filter(u => u.firstName.toLowerCase() === t.toLowerCase());
        const chosen = exact.length === 1 ? exact : users;
        return chosen.map(u => ({ id: u.id, label: `${nameOf(u)} (${u.role})` }));
      }

      case 'lead': {
        const rows = await this.prisma.lead.findMany({
          where: { organizationId: org, name: { contains: t, mode: 'insensitive' } },
          select: { id: true, name: true, status: true }, take: 6,
        });
        return rows.map(r => ({ id: r.id, label: `${r.name} (${r.status})` }));
      }

      case 'client': {
        const rows = await this.prisma.client.findMany({
          where: { organizationId: org, name: { contains: t, mode: 'insensitive' } },
          select: { id: true, name: true, stage: true }, take: 6,
        });
        return rows.map(r => ({ id: r.id, label: `${r.name} (${r.stage})` }));
      }

      case 'owner': {
        const rows = await this.prisma.owner.findMany({
          where: { organizationId: org, name: { contains: t, mode: 'insensitive' } },
          select: { id: true, name: true }, take: 6,
        });
        return rows.map(r => ({ id: r.id, label: r.name }));
      }

      case 'property': {
        const rows = await this.prisma.property.findMany({
          where: {
            organizationId: org,
            OR: [
              { title: { contains: t, mode: 'insensitive' } },
              { location: { contains: t, mode: 'insensitive' } },
            ],
          },
          select: { id: true, title: true, location: true }, take: 6,
        });
        return rows.map(r => ({ id: r.id, label: `${r.title} — ${r.location}` }));
      }

      case 'task': {
        // Also covers calendar events, since "that meeting" and "that task" are
        // both referred to by title.
        const [tasks, events] = await Promise.all([
          this.prisma.task.findMany({
            where: { organizationId: org, title: { contains: t, mode: 'insensitive' } },
            select: { id: true, title: true, status: true }, take: 5,
          }),
          this.prisma.calendarEvent.findMany({
            where: { organizationId: org, title: { contains: t, mode: 'insensitive' } },
            select: { id: true, title: true, startTime: true }, take: 5,
          }),
        ]);
        return [
          ...tasks.map(r => ({ id: r.id, label: `${r.title} (${r.status})` })),
          ...events.map(r => ({ id: r.id, label: `${r.title} (meeting)` })),
        ];
      }

      case 'vehicle': {
        const rows = await this.prisma.vehicle.findMany({
          where: {
            organizationId: org,
            OR: [
              { modelName: { contains: t, mode: 'insensitive' } },
              { plateNumber: { contains: t, mode: 'insensitive' } },
            ],
          },
          select: { id: true, modelName: true, plateNumber: true }, take: 6,
        });
        return rows.map(r => ({ id: r.id, label: `${r.modelName} (${r.plateNumber})` }));
      }

      default:
        return [];
    }
  }

  // ---------------------------------------------------------------------------
  private tablesFor(action: ActionDefinition): string[] {
    const map: Record<string, string[]> = {
      tasks: ['task'],
      meetings: ['calendarevent'],
      leads: ['lead', 'leadactivity'],
      clients: ['client', 'clientviewing', 'clientcommunication'],
      properties: ['property', 'propertypricehistory'],
      hr: ['leaverequest', 'employeeprofile'],
      logistics: ['logisticsschedule', 'vehiclemaintenance', 'vehicle'],
      owners: ['owner', 'ownercommunication'],
    };
    return map[action.category] ?? [];
  }

  /** Prisma errors are unreadable to end users; translate the common ones. */
  private humanizeError(err: any): string {
    const msg = String(err?.message ?? '');
    if (msg.includes('Record to update not found')) return 'That record no longer exists — it may have been deleted.';
    if (msg.includes('Foreign key constraint')) return 'One of the linked records is missing, so I couldn\'t save that.';
    if (msg.includes('Unique constraint')) return 'That already exists.';
    return 'Something went wrong saving that. Nothing was changed.';
  }

  /**
   * Every attempted action is recorded, successful or not.
   * An assistant that can change records must leave a trail of who asked for what.
   */
  private async audit(
    action: ActionDefinition,
    params: Record<string, any>,
    ctx: ActionContext,
    status: 'SUCCESS' | 'FAILED' | 'DENIED',
    error?: string,
    summary?: string
  ): Promise<void> {
    try {
      // Strip internal `_label` helpers before storing.
      const clean = Object.fromEntries(Object.entries(params).filter(([k]) => !k.startsWith('_')));
      await this.prisma.aiActionLog.create({
        data: {
          action: action.name,
          status,
          params: clean as any,
          summary: summary ?? null,
          errorMessage: error ?? null,
          actorRole: ctx.userRole,
          userId: ctx.userId,
          organizationId: ctx.organizationId,
        },
      });
    } catch (e: any) {
      // Never fail the user's action because the audit write failed.
      this.logger.warn(`[Action] Audit write failed: ${e.message}`);
    }
  }

  /** Recent AI-performed actions for this tenant. Backs an "what did the AI do?" view. */
  async recentActions(organizationId: string, limit = 25) {
    return this.prisma.aiActionLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { firstName: true, lastName: true } } },
    });
  }
}
