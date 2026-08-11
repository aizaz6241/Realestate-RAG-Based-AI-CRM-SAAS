import { Role } from '@prisma/client';
import { ActionDefinition } from './action-types';

/**
 * Everything the AI is allowed to do.
 *
 * This file IS the security boundary. An action that is not defined here cannot be
 * performed, no matter what the model emits — so review additions the way you would
 * review a new API endpoint, because that is what they are.
 *
 * ── Deliberately absent ──────────────────────────────────────────────────────
 * There are no delete, drop, truncate, bulk-update or schema actions. The app's own
 * UI keeps those behind a human. An assistant that can delete records on a
 * misparsed sentence is not a convenience, and "the model promised to be careful"
 * is not a control. Reversibility is the rule: every action below either creates a
 * record or moves a status forward, and both are undoable from the UI.
 *
 * Status changes to REJECTED / CANCELLED are included because they are how work
 * actually gets closed out — but they are CONFIRM or ELEVATED, never SAFE.
 */

/**
 * Every role that participates in day-to-day work.
 *
 * Deliberately NOT `'*'`: that would include VIEWER, which exists to be read-only.
 * A wildcard on a write action is how a read-only role quietly gains the ability to
 * change records — caught by `npm run ai:test-actions`, which asserts VIEWER has no
 * write actions at all.
 */
const WORKING_ROLES: Role[] = [
  'SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'AGENT', 'HR', 'LOGISTICS', 'FINANCE', 'RECEPTIONIST',
];

const iso = (v: any) => (v instanceof Date ? v : new Date(v)).toISOString();
const shortDate = (v: any) =>
  new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDateTime = (v: any) =>
  new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const ACTION_REGISTRY: ActionDefinition[] = [
  // ───────────────────────────────────────────────────────────── tasks ──
  {
    name: 'createTask',
    category: 'tasks',
    description: 'Create a task and optionally assign it to a person or a whole role/department.',
    examples: [
      'assign a task to Sarah to follow up with the Marina client',
      'create a task for HR to prepare the payroll report by Friday',
      'Sarah ko task do ke woh listing photos update kare',
      'remind logistics to service the vehicles next week',
    ],
    params: {
      title: { type: 'string', required: true, description: 'Short task title.', askIfMissing: 'What should the task say?' },
      assignee: {
        type: 'entityRef', entity: 'user', required: false,
        description: 'Person to assign to, by name. Omit for an unassigned task.',
      },
      assigneeRole: {
        type: 'enum', required: false,
        enumValues: ['HR', 'FINANCE', 'LOGISTICS', 'SALES_MANAGER', 'AGENT', 'RECEPTIONIST', 'ADMIN'],
        description: 'Assign to a department/role instead of a named person. One task is created per member of that role.',
      },
      dueDate: { type: 'date', required: false, description: 'Due date. Accepts natural language ("Friday", "next week").' },
      description: { type: 'text', required: false, description: 'Longer detail about what needs doing.' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'HR', 'LOGISTICS'],
    risk: 'CONFIRM',
    preview: (p) => {
      const who = p._assigneeLabel ? `to ${p._assigneeLabel}` : p.assigneeRole ? `to everyone in ${p.assigneeRole}` : '(unassigned)';
      const due = p.dueDate ? `, due ${shortDate(p.dueDate)}` : '';
      return `Create task "${p.title}" ${who}${due}.`;
    },
    handler: async (p, ctx, { prisma }) => {
      // Role fan-out: "give HR a task" means every member of HR, so the work is
      // actually owned rather than landing in a shared void.
      let assigneeIds: (string | null)[] = [p.assignee ?? null];

      if (!p.assignee && p.assigneeRole) {
        const members = await prisma.user.findMany({
          where: { organizationId: ctx.organizationId, role: p.assigneeRole, isActive: true },
          select: { id: true, firstName: true, lastName: true },
        });
        if (members.length === 0) {
          return { success: false, message: `No active users found with the ${p.assigneeRole} role, so there was nobody to assign to.` };
        }
        assigneeIds = members.map((m: any) => m.id);
      }

      const created = await prisma.$transaction(
        assigneeIds.map((id) =>
          prisma.task.create({
            data: {
              title: p.title,
              description: p.description ?? null,
              status: 'PENDING',
              dueDate: p.dueDate ? new Date(p.dueDate) : null,
              organizationId: ctx.organizationId,
              assignedToId: id,
              createdById: ctx.userId,
            },
            include: { assignedTo: { select: { firstName: true, lastName: true } } },
          })
        )
      );

      const who = p._assigneeLabel
        ? p._assigneeLabel
        : p.assigneeRole
          ? `${created.length} member${created.length === 1 ? '' : 's'} of ${p.assigneeRole}`
          : 'nobody yet';

      return {
        success: true,
        message: `Task "${p.title}" created and assigned to ${who}${p.dueDate ? `, due ${shortDate(p.dueDate)}` : ''}.`,
        data: created,
        suggestions: ['Set a reminder closer to the due date', 'Show all open tasks for this person'],
      };
    },
  },

  {
    name: 'updateTaskStatus',
    category: 'tasks',
    description: 'Move a task to a different status (pending, in progress, completed).',
    examples: ['mark the photo task as done', 'set that task to in progress', 'woh task complete kar do'],
    params: {
      task: { type: 'entityRef', entity: 'task', required: true, description: 'The task, by title.', askIfMissing: 'Which task?' },
      status: { type: 'enum', required: true, enumValues: ['PENDING', 'IN_PROGRESS', 'COMPLETED'], description: 'New status.' },
    },
    roles: WORKING_ROLES,
    risk: 'SAFE',
    preview: (p) => `Set task "${p._taskLabel}" to ${p.status}.`,
    handler: async (p, ctx, { prisma }) => {
      const updated = await prisma.task.update({
        where: { id: p.task },
        data: { status: p.status },
      });
      return { success: true, message: `Task "${updated.title}" is now ${p.status.toLowerCase().replace('_', ' ')}.`, data: updated };
    },
  },

  {
    name: 'reassignTask',
    category: 'tasks',
    description: 'Move an existing task to a different person.',
    examples: ['give that task to John instead', 'reassign the payroll task to Faisal'],
    params: {
      task: { type: 'entityRef', entity: 'task', required: true, description: 'The task, by title.' },
      assignee: { type: 'entityRef', entity: 'user', required: true, description: 'New owner, by name.' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'HR', 'LOGISTICS'],
    risk: 'CONFIRM',
    preview: (p) => `Reassign task "${p._taskLabel}" to ${p._assigneeLabel}.`,
    handler: async (p, ctx, { prisma }) => {
      const updated = await prisma.task.update({
        where: { id: p.task },
        data: { assignedToId: p.assignee },
        include: { assignedTo: { select: { firstName: true, lastName: true } } },
      });
      return { success: true, message: `"${updated.title}" is now assigned to ${p._assigneeLabel}.`, data: updated };
    },
  },

  // ────────────────────────────────────────────────────────── meetings ──
  {
    name: 'scheduleMeeting',
    category: 'meetings',
    description: 'Schedule a calendar meeting and invite specific people and/or whole departments.',
    examples: [
      'schedule a meeting with HR tomorrow at 3pm about payroll',
      'set up a call with Sarah and Robert on Monday morning',
      'kal 4 baje logistics ke sath meeting rakho',
    ],
    params: {
      title: { type: 'string', required: true, description: 'Meeting subject.', askIfMissing: 'What is the meeting about?' },
      startTime: { type: 'datetime', required: true, description: 'Start date and time.', askIfMissing: 'When should it start?' },
      durationMinutes: { type: 'number', required: false, default: 60, description: 'Length in minutes. Defaults to 60.' },
      inviteRoles: {
        type: 'stringArray', required: false,
        description: 'Departments/roles to invite, e.g. ["HR","LOGISTICS"].',
      },
      inviteUsers: { type: 'stringArray', required: false, description: 'Individual attendee names.' },
      location: { type: 'string', required: false, description: 'Room, address or meeting link.' },
      description: { type: 'text', required: false, description: 'Agenda or notes.' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'HR', 'LOGISTICS', 'RECEPTIONIST'],
    risk: 'CONFIRM',
    preview: (p) => {
      const invitees = [
        ...(p._inviteUserLabels ?? []),
        ...(p.inviteRoles ?? []).map((r: string) => `${r} team`),
      ];
      const who = invitees.length ? ` with ${invitees.join(', ')}` : '';
      const mins = p.durationMinutes ?? 60;
      return `Schedule "${p.title}"${who} on ${shortDateTime(p.startTime)} for ${mins} minutes${p.location ? ` at ${p.location}` : ''}.`;
    },
    handler: async (p, ctx, { prisma }) => {
      const start = new Date(p.startTime);
      const end = new Date(start.getTime() + (p.durationMinutes ?? 60) * 60000);

      const event = await prisma.calendarEvent.create({
        data: {
          title: p.title,
          description: p.description ?? null,
          startTime: start,
          endTime: end,
          location: p.location ?? null,
          targetRoles: p.inviteRoles ?? [],
          targetUserIds: p._inviteUserIds ?? [],
          organizationId: ctx.organizationId,
          createdById: ctx.userId,
        },
      });

      const invitees = [
        ...(p._inviteUserLabels ?? []),
        ...(p.inviteRoles ?? []).map((r: string) => `the ${r} team`),
      ];

      return {
        success: true,
        message: `"${p.title}" is scheduled for ${shortDateTime(start)}${invitees.length ? `, inviting ${invitees.join(', ')}` : ''}.`,
        data: event,
        suggestions: ['Add an agenda item', 'Show my schedule for that day'],
      };
    },
  },

  {
    name: 'rescheduleMeeting',
    category: 'meetings',
    description: 'Move an existing meeting to a new date/time.',
    examples: ['move the payroll meeting to Thursday 2pm', 'push tomorrow\'s standup by an hour'],
    params: {
      event: { type: 'entityRef', entity: 'task', required: true, description: 'The meeting, by title.' },
      startTime: { type: 'datetime', required: true, description: 'New start date and time.' },
      durationMinutes: { type: 'number', required: false, description: 'New length in minutes. Keeps the original if omitted.' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'HR', 'LOGISTICS', 'RECEPTIONIST'],
    risk: 'CONFIRM',
    preview: (p) => `Move "${p._eventLabel}" to ${shortDateTime(p.startTime)}.`,
    handler: async (p, ctx, { prisma }) => {
      const existing = await prisma.calendarEvent.findFirst({
        where: { id: p.event, organizationId: ctx.organizationId },
      });
      if (!existing) return { success: false, message: 'That meeting no longer exists.' };

      const originalMs = existing.endTime.getTime() - existing.startTime.getTime();
      const start = new Date(p.startTime);
      const end = new Date(start.getTime() + (p.durationMinutes ? p.durationMinutes * 60000 : originalMs));

      const updated = await prisma.calendarEvent.update({
        where: { id: p.event },
        data: { startTime: start, endTime: end },
      });

      return { success: true, message: `"${updated.title}" moved to ${shortDateTime(start)}.`, data: updated };
    },
  },

  // ───────────────────────────────────────────────────────────── leads ──
  {
    name: 'updateLeadStatus',
    category: 'leads',
    description: 'Move a lead along the pipeline (new, contacted, engaged, disqualified, closed).',
    examples: ['mark the Ahmed lead as contacted', 'that lead is closed now', 'lead ko engaged kar do'],
    params: {
      lead: { type: 'entityRef', entity: 'lead', required: true, description: 'The lead, by name.' },
      status: {
        type: 'enum', required: true,
        enumValues: ['NEW', 'CONTACTED', 'ENGAGED', 'DISQUALIFIED', 'CLOSED'],
        description: 'New pipeline stage.',
      },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'AGENT', 'RECEPTIONIST'],
    risk: 'SAFE',
    preview: (p) => `Move lead "${p._leadLabel}" to ${p.status}.`,
    handler: async (p, ctx, { prisma }) => {
      const updated = await prisma.lead.update({ where: { id: p.lead }, data: { status: p.status } });
      return { success: true, message: `Lead "${updated.name}" is now ${p.status.toLowerCase()}.`, data: updated };
    },
  },

  {
    name: 'assignLead',
    category: 'leads',
    description: 'Assign or reassign a lead to an agent.',
    examples: ['give this lead to Sarah', 'assign the Marina enquiry to John'],
    params: {
      lead: { type: 'entityRef', entity: 'lead', required: true, description: 'The lead, by name.' },
      assignee: { type: 'entityRef', entity: 'user', required: true, description: 'Agent to own the lead.' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER'],
    risk: 'CONFIRM',
    preview: (p) => `Assign lead "${p._leadLabel}" to ${p._assigneeLabel}.`,
    handler: async (p, ctx, { prisma }) => {
      const updated = await prisma.lead.update({ where: { id: p.lead }, data: { assignedToId: p.assignee } });
      return { success: true, message: `Lead "${updated.name}" is now with ${p._assigneeLabel}.`, data: updated };
    },
  },

  {
    name: 'logLeadActivity',
    category: 'leads',
    description: 'Record a call, email, meeting or note against a lead.',
    examples: ['log a call with the Ahmed lead', 'note that I emailed the Marina enquiry'],
    params: {
      lead: { type: 'entityRef', entity: 'lead', required: true, description: 'The lead, by name.' },
      type: { type: 'enum', required: true, enumValues: ['CALL', 'EMAIL', 'MEETING', 'NOTE'], description: 'Kind of activity.' },
      description: { type: 'text', required: true, description: 'What happened.', askIfMissing: 'What should I record?' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'AGENT', 'RECEPTIONIST'],
    risk: 'SAFE',
    preview: (p) => `Log a ${p.type.toLowerCase()} on lead "${p._leadLabel}".`,
    handler: async (p, ctx, { prisma }) => {
      const activity = await prisma.leadActivity.create({
        data: { leadId: p.lead, type: p.type, description: p.description, activityDate: new Date() },
      });
      return { success: true, message: `Logged the ${p.type.toLowerCase()} against "${p._leadLabel}".`, data: activity };
    },
  },

  // ─────────────────────────────────────────────────────────── clients ──
  {
    name: 'updateClientStage',
    category: 'clients',
    description: 'Move a client through the sales stages (inquiry, viewing, offer, closed).',
    examples: ['move the Sterling client to offer stage', 'client ab closed hai'],
    params: {
      client: { type: 'entityRef', entity: 'client', required: true, description: 'The client, by name.' },
      stage: { type: 'enum', required: true, enumValues: ['INQUIRY', 'VIEWING', 'OFFER', 'CLOSED'], description: 'New stage.' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'AGENT'],
    risk: 'SAFE',
    preview: (p) => `Move client "${p._clientLabel}" to ${p.stage}.`,
    handler: async (p, ctx, { prisma }) => {
      const updated = await prisma.client.update({ where: { id: p.client }, data: { stage: p.stage } });
      return { success: true, message: `"${updated.name}" is now at the ${p.stage.toLowerCase()} stage.`, data: updated };
    },
  },

  {
    name: 'scheduleViewing',
    category: 'clients',
    description: 'Book a property viewing for a client.',
    examples: ['book a viewing for the Sterling client at the Marina apartment on Saturday'],
    params: {
      client: { type: 'entityRef', entity: 'client', required: true, description: 'The client, by name.' },
      property: { type: 'entityRef', entity: 'property', required: true, description: 'The property, by title or location.' },
      viewingDate: { type: 'datetime', required: true, description: 'When the viewing happens.', askIfMissing: 'When should the viewing be?' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'AGENT', 'RECEPTIONIST'],
    risk: 'CONFIRM',
    preview: (p) => `Book a viewing of "${p._propertyLabel}" for ${p._clientLabel} on ${shortDateTime(p.viewingDate)}.`,
    handler: async (p, ctx, { prisma }) => {
      const viewing = await prisma.clientViewing.create({
        data: {
          clientId: p.client,
          propertyId: p.property,
          viewingDate: new Date(p.viewingDate),
          status: 'SCHEDULED',
        },
      });
      return {
        success: true,
        message: `Viewing booked for ${p._clientLabel} at "${p._propertyLabel}" on ${shortDateTime(p.viewingDate)}.`,
        data: viewing,
        suggestions: ['Add a calendar reminder for the agent'],
      };
    },
  },

  {
    name: 'logClientCommunication',
    category: 'clients',
    description: 'Record a call, email or message with a client.',
    examples: ['log that I called the Sterling client about the offer'],
    params: {
      client: { type: 'entityRef', entity: 'client', required: true, description: 'The client, by name.' },
      type: { type: 'enum', required: true, enumValues: ['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE'], description: 'Channel used.' },
      summary: { type: 'text', required: true, description: 'What was discussed.', askIfMissing: 'What should I note down?' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'AGENT', 'RECEPTIONIST'],
    risk: 'SAFE',
    preview: (p) => `Log a ${p.type.toLowerCase()} with "${p._clientLabel}".`,
    handler: async (p, ctx, { prisma }) => {
      const rec = await prisma.clientCommunication.create({
        data: { clientId: p.client, type: p.type, summary: p.summary, date: new Date() },
      });
      return { success: true, message: `Noted the ${p.type.toLowerCase()} with ${p._clientLabel}.`, data: rec };
    },
  },

  // ──────────────────────────────────────────────────────── properties ──
  {
    name: 'updatePropertyStatus',
    category: 'properties',
    description: 'Change a listing status (draft, published, available, sold, rented).',
    examples: ['mark the Marina apartment as sold', 'publish the Palm villa listing'],
    params: {
      property: { type: 'entityRef', entity: 'property', required: true, description: 'The property, by title or location.' },
      status: {
        type: 'enum', required: true,
        enumValues: ['DRAFT', 'PUBLISHED', 'AVAILABLE', 'SOLD', 'RENTED'],
        description: 'New listing status.',
      },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'AGENT'],
    // Marking something SOLD is externally visible and awkward to walk back.
    risk: 'CONFIRM',
    preview: (p) => `Set "${p._propertyLabel}" to ${p.status}.`,
    handler: async (p, ctx, { prisma }) => {
      const updated = await prisma.property.update({ where: { id: p.property }, data: { status: p.status } });
      return { success: true, message: `"${updated.title}" is now marked ${p.status.toLowerCase()}.`, data: updated };
    },
  },

  {
    name: 'updatePropertyPrice',
    category: 'properties',
    description: 'Change a listing price. The previous price is kept in the price history.',
    examples: ['drop the Marina apartment to 95,000', 'increase the Palm villa price to 38 million'],
    params: {
      property: { type: 'entityRef', entity: 'property', required: true, description: 'The property, by title or location.' },
      price: { type: 'number', required: true, description: 'New price in AED.', askIfMissing: 'What should the new price be?' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER'],
    risk: 'ELEVATED',
    preview: (p) => `Change the price of "${p._propertyLabel}" to AED ${Number(p.price).toLocaleString()}.`,
    handler: async (p, ctx, { prisma }) => {
      const property = await prisma.property.findFirst({
        where: { id: p.property, organizationId: ctx.organizationId },
      });
      if (!property) return { success: false, message: 'That property no longer exists.' };

      // Write history before the change so the old value is never lost.
      const [, updated] = await prisma.$transaction([
        prisma.propertyPriceHistory.create({
          data: { propertyId: p.property, price: property.price, changeDate: new Date() },
        }),
        prisma.property.update({ where: { id: p.property }, data: { price: Number(p.price) } }),
      ]);

      return {
        success: true,
        message: `"${updated.title}" repriced from AED ${property.price.toLocaleString()} to AED ${Number(p.price).toLocaleString()}. The old price is saved in the history.`,
        data: updated,
      };
    },
  },

  {
    name: 'assignPropertyAgent',
    category: 'properties',
    description: 'Assign a listing to an agent.',
    examples: ['give the Downtown penthouse to Sarah', 'assign that villa to John'],
    params: {
      property: { type: 'entityRef', entity: 'property', required: true, description: 'The property, by title or location.' },
      assignee: { type: 'entityRef', entity: 'user', required: true, description: 'Agent to own the listing.' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER'],
    risk: 'CONFIRM',
    preview: (p) => `Assign "${p._propertyLabel}" to ${p._assigneeLabel}.`,
    handler: async (p, ctx, { prisma }) => {
      const updated = await prisma.property.update({ where: { id: p.property }, data: { assignedToId: p.assignee } });
      return { success: true, message: `"${updated.title}" is now handled by ${p._assigneeLabel}.`, data: updated };
    },
  },

  // ──────────────────────────────────────────────────────────────── hr ──
  {
    name: 'decideLeaveRequest',
    category: 'hr',
    description: 'Approve or reject a pending leave request.',
    examples: ['approve Sarah\'s annual leave', 'reject that leave request', 'Sarah ki chutti approve kar do'],
    params: {
      employee: { type: 'entityRef', entity: 'user', required: true, description: 'Whose leave request, by name.' },
      decision: { type: 'enum', required: true, enumValues: ['APPROVED', 'REJECTED'], description: 'Approve or reject.' },
    },
    // HR decisions affect someone's pay and time off.
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR'],
    risk: 'ELEVATED',
    preview: (p) => `${p.decision === 'APPROVED' ? 'Approve' : 'Reject'} the pending leave request for ${p._employeeLabel}.`,
    handler: async (p, ctx, { prisma }) => {
      const pending = await prisma.leaveRequest.findFirst({
        where: {
          status: 'PENDING',
          employeeProfile: { organizationId: ctx.organizationId, userId: p.employee },
        },
        include: { employeeProfile: { include: { user: { select: { firstName: true, lastName: true } } } } },
        orderBy: { createdAt: 'asc' },
      });

      if (!pending) {
        return { success: false, message: `${p._employeeLabel} has no pending leave request to decide on.` };
      }

      const updated = await prisma.leaveRequest.update({
        where: { id: pending.id },
        data: { status: p.decision, approvedAt: p.decision === 'APPROVED' ? new Date() : null },
      });

      return {
        success: true,
        message: `${p._employeeLabel}'s ${pending.type.toLowerCase()} leave (${shortDate(pending.startDate)} – ${shortDate(pending.endDate)}) has been ${p.decision.toLowerCase()}.`,
        data: updated,
      };
    },
  },

  // ───────────────────────────────────────────────────────── logistics ──
  {
    name: 'scheduleLogistics',
    category: 'logistics',
    description: 'Create a logistics/delivery schedule entry with pickup and drop locations.',
    examples: ['schedule a pickup from the Marina office to Downtown tomorrow at 10'],
    params: {
      visitDate: { type: 'datetime', required: true, description: 'When the run happens.', askIfMissing: 'When should it be scheduled?' },
      pickupLocation: { type: 'string', required: true, description: 'Pickup address.', askIfMissing: 'Where is the pickup from?' },
      dropLocation: { type: 'string', required: true, description: 'Drop-off address.', askIfMissing: 'Where is the drop-off?' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'LOGISTICS'],
    risk: 'CONFIRM',
    preview: (p) => `Schedule a run from ${p.pickupLocation} to ${p.dropLocation} on ${shortDateTime(p.visitDate)}.`,
    handler: async (p, ctx, { prisma }) => {
      const schedule = await prisma.logisticsSchedule.create({
        data: {
          visitDate: new Date(p.visitDate),
          pickupLocation: p.pickupLocation,
          dropLocation: p.dropLocation,
          status: 'SCHEDULED',
          organizationId: ctx.organizationId,
        },
      });
      return {
        success: true,
        message: `Logistics run scheduled for ${shortDateTime(p.visitDate)}: ${p.pickupLocation} → ${p.dropLocation}.`,
        data: schedule,
        suggestions: ['Assign a driver and vehicle'],
      };
    },
  },

  {
    name: 'logVehicleMaintenance',
    category: 'logistics',
    description: 'Record a maintenance or repair job against a vehicle.',
    examples: ['log a service for the white Hilux, 1200 AED', 'gari ki repair note karo'],
    params: {
      vehicle: { type: 'entityRef', entity: 'vehicle', required: true, description: 'The vehicle, by model or plate number.' },
      description: { type: 'text', required: true, description: 'What work was done.', askIfMissing: 'What was the work?' },
      cost: { type: 'number', required: false, description: 'Cost in AED.' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'LOGISTICS'],
    risk: 'CONFIRM',
    preview: (p) => `Log maintenance on ${p._vehicleLabel}: ${p.description}${p.cost ? ` (AED ${Number(p.cost).toLocaleString()})` : ''}.`,
    handler: async (p, ctx, { prisma }) => {
      const rec = await prisma.vehicleMaintenance.create({
        data: {
          vehicleId: p.vehicle,
          description: p.description,
          cost: p.cost != null ? Number(p.cost) : 0,
          status: 'PENDING',
          requestDate: new Date(),
        },
      });
      return { success: true, message: `Maintenance logged for ${p._vehicleLabel}.`, data: rec };
    },
  },

  // ──────────────────────────────────────────────────────────── owners ──
  {
    name: 'logOwnerCommunication',
    category: 'owners',
    description: 'Record a call, email or message with a property owner/landlord.',
    examples: ['log a call with Fahad about the Emirates Hills listing'],
    params: {
      owner: { type: 'entityRef', entity: 'owner', required: true, description: 'The owner, by name.' },
      type: { type: 'enum', required: true, enumValues: ['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE'], description: 'Channel used.' },
      summary: { type: 'text', required: true, description: 'What was discussed.', askIfMissing: 'What should I note down?' },
    },
    roles: ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'AGENT'],
    risk: 'SAFE',
    preview: (p) => `Log a ${p.type.toLowerCase()} with owner "${p._ownerLabel}".`,
    handler: async (p, ctx, { prisma }) => {
      const rec = await prisma.ownerCommunication.create({
        data: { ownerId: p.owner, type: p.type, summary: p.summary, date: new Date() },
      });
      return { success: true, message: `Noted the ${p.type.toLowerCase()} with ${p._ownerLabel}.`, data: rec };
    },
  },
];

export const ACTIONS_BY_NAME: Record<string, ActionDefinition> = Object.fromEntries(
  ACTION_REGISTRY.map(a => [a.name, a])
);

/** Actions this role may run — used to build the prompt so the model is never
 *  offered something it will then be denied. */
export function actionsForRole(role: string): ActionDefinition[] {
  return ACTION_REGISTRY.filter(a => a.roles === '*' || (a.roles as string[]).includes(role));
}

/**
 * Full catalogue, regardless of role.
 *
 * Used for intent detection so an action the user cannot run is still *recognised* —
 * that's what lets the reply be "your role can't do this" instead of an unrelated
 * failure from the read pipeline. Permission is enforced by the executor.
 */
export function renderFullActionCatalogue(): string {
  return ACTION_REGISTRY.map(a => {
    const params = Object.entries(a.params)
      .map(([k, s]) => `${k}${s.required ? '*' : ''}`)
      .join(', ');
    return `- ${a.name}(${params}) — ${a.description}\n    e.g. "${a.examples[0]}"`;
  }).join('\n');
}

/** Compact catalogue limited to what this role may actually run. */
export function renderActionCatalogue(role: string): string {
  const available = actionsForRole(role);
  if (available.length === 0) return '(none available for this role)';

  return available
    .map(a => {
      const params = Object.entries(a.params)
        .map(([k, s]) => `${k}${s.required ? '*' : ''}`)
        .join(', ');
      return `- ${a.name}(${params}) — ${a.description}\n    e.g. "${a.examples[0]}"`;
    })
    .join('\n');
}
