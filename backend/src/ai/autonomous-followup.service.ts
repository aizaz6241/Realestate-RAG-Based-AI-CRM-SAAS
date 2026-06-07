import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZorvexGateway } from './zorvex.gateway';
import { AiLlmService } from './ai-llm.service';

@Injectable()
export class AutonomousFollowUpService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AutonomousFollowUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly zorvexGateway: ZorvexGateway,
    private readonly llmService: AiLlmService
  ) {}

  onApplicationBootstrap() {
    this.logger.log('⏰ Zorvex Autonomous Follow-Up background worker started!');
    // Run operational audits every hour (3600000 ms)
    setInterval(() => {
      this.runBackgroundAudits().catch(err => {
        this.logger.error(`Error executing autonomous cron worker: ${err.message}`);
      });
    }, 3600000);

    // Run once immediately on startup (after 5 seconds) to seed/test
    setTimeout(() => {
      this.runBackgroundAudits().catch(err => {
        this.logger.error(`Error executing startup cron run: ${err.message}`);
      });
    }, 5000);
  }

  async runBackgroundAudits() {
    await this.auditDelayedWorkflows();
    await this.runProactiveCooIntelligence();
  }

  async auditDelayedWorkflows() {
    this.logger.log('🔄 Running hourly operational audit on delayed workflows...');
    
    // 1. Audit active tasks with no updates in the last 8 hours
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
    
    const overdueTasks = await this.prisma.task.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        updatedAt: { lte: eightHoursAgo }
      },
      include: {
        assignedTo: {
          include: { employeeProfile: true }
        },
        organization: true
      }
    });

    this.logger.log(`Found ${overdueTasks.length} overdue tasks in system audit.`);

    for (const task of overdueTasks) {
      if (!task.assignedTo) continue;

      const employeeId = task.assignedTo.id;
      const employeeName = `${task.assignedTo.firstName} ${task.assignedTo.lastName || ''}`.trim();
      const messageText = `⏰ Zorvex Operational Alert: Task "${task.title}" has had no updates for over 8 hours. Please update your status checklist in the Command Center.`;

      // Dispatch in-app system notification
      let room = await this.prisma.chatRoom.findFirst({
        where: { organizationId: task.organizationId, isSystem: true, systemUserId: employeeId }
      });
      if (!room) {
        room = await this.prisma.chatRoom.create({
          data: { name: "Zorvex Operational Brain", isSystem: true, systemUserId: employeeId, organizationId: task.organizationId }
        });
      }

      await this.prisma.message.create({
        data: {
          content: messageText,
          isSystem: true,
          chatRoomId: room.id
        }
      });

      // Emit WebSocket real-time broadcast
      this.zorvexGateway.broadcastToOrganization(task.organizationId, 'alert_sync', {
        action: 'create',
        message: messageText,
        recipientId: employeeId,
        recipientName: employeeName
      });

      this.logger.log(`✔ Overdue task reminder successfully dispatched to ${employeeName} for task "${task.title}".`);
    }
  }

  async runProactiveCooIntelligence() {
    this.logger.log('🧠 Running continuous intelligence proactive COO checks...');
    try {
      const organizations = await this.prisma.organization.findMany();
      for (const org of organizations) {
        // Gather database stats
        const propertiesCount = await this.prisma.property.count({ where: { organizationId: org.id, status: 'AVAILABLE' } });
        const activeLeadsCount = await this.prisma.lead.count({ where: { organizationId: org.id, status: { in: ['NEW', 'CONTACTED', 'ENGAGED'] } } });
        const pendingTasks = await this.prisma.task.count({ where: { organizationId: org.id, status: { in: ['PENDING', 'IN_PROGRESS'] } } });
        const unassignedLeads = await this.prisma.lead.count({ where: { organizationId: org.id, assignedToId: null } });
        
        // Expiring agreements within 30 days
        const expiringAgreementsCount = await this.prisma.owner.count({
          where: { organizationId: org.id, agreementExpiry: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }
        });

        const statsText = `
          Organization: ${org.name}
          Available Listings: ${propertiesCount}
          Active Lead Pipeline: ${activeLeadsCount}
          Pending Workflow Tasks: ${pendingTasks}
          Unassigned Leads: ${unassignedLeads}
          Expiring Owner Agreements: ${expiringAgreementsCount}
        `;

        const systemPrompt = `You are the Zorvex Proactive AI COO Brain (Continuous Intelligence).
Analyze the given organization statistics and formulate 1-2 strategic executive COO alert bullets (risks, opportunities, or performance trends).
Do not include technical jargon or column names. Speak as a human digital COO advising corporate administrators.
Output only the bullet points.`;

        let cooAlert = '';
        try {
          cooAlert = await this.llmService.callLLM(systemPrompt, `Analyze stats:\n${statsText}`, [], true);
          cooAlert = (cooAlert || '').trim();
        } catch (e) {
          this.logger.warn(`Failed to generate proactive COO alert for org ${org.name}: ${e.message}`);
          continue;
        }

        if (!cooAlert) continue;

        // Find administrative users to notify
        const admins = await this.prisma.user.findMany({
          where: { organizationId: org.id, role: { in: ['SUPER_ADMIN', 'ADMIN'] } }
        });

        for (const admin of admins) {
          let room = await this.prisma.chatRoom.findFirst({
            where: { organizationId: org.id, isSystem: true, systemUserId: admin.id }
          });
          if (!room) {
            room = await this.prisma.chatRoom.create({
              data: { name: "Zorvex Operational Brain", isSystem: true, systemUserId: admin.id, organizationId: org.id }
            });
          }

          await this.prisma.message.create({
            data: {
              content: `🧠 Zorvex Continuous Intelligence Alert:\n${cooAlert}`,
              isSystem: true,
              chatRoomId: room.id
            }
          });

          // WebSocket emit
          this.zorvexGateway.broadcastToOrganization(org.id, 'alert_sync', {
            action: 'create',
            message: `🧠 Zorvex Continuous Intelligence Alert:\n${cooAlert}`,
            recipientId: admin.id,
            recipientName: `${admin.firstName} ${admin.lastName || ''}`.trim()
          });
        }
        
        this.logger.log(`✔ Proactive COO Continuous Intelligence alerts dispatched successfully for organization: ${org.name}`);
      }
    } catch (err) {
      this.logger.error(`Error in Proactive COO continuous intelligence cron: ${err.message}`);
    }
  }
}
