import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZorvexGateway } from './zorvex.gateway';

@Injectable()
export class AutonomousFollowUpService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AutonomousFollowUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly zorvexGateway: ZorvexGateway
  ) {}

  onApplicationBootstrap() {
    this.logger.log('⏰ Zorvex Autonomous Follow-Up background worker started!');
    // Run follow-up audit every hour (3600000 ms)
    setInterval(() => {
      this.auditDelayedWorkflows().catch(err => {
        this.logger.error(`Error executing autonomous cron worker: ${err.message}`);
      });
    }, 3600000);

    // Also run once immediately on startup (after 5 seconds) to seed/test
    setTimeout(() => {
      this.auditDelayedWorkflows().catch(err => {
        this.logger.error(`Error executing startup cron run: ${err.message}`);
      });
    }, 5000);
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
}

