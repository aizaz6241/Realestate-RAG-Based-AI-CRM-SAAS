import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CalendarService implements OnModuleInit {
  private notifiedEvents = new Set<string>();
  private notifiedTasks = new Set<string>();
  private notifiedLogistics = new Set<string>();

  // Shared In-Memory Meeting Signaling & Chat Broker Map
  public meetingStates = new Map<string, {
    participants: Array<{
      id: string;
      name: string;
      role: string;
      isMicMuted: boolean;
      isCamMuted: boolean;
      lastActive: number;
    }>;
    allTimeAttendees: Array<{
      id: string;
      name: string;
      role: string;
      joinedAt: number;
      lastPing: number;
    }>;
    messages: Array<{
      id: string;
      sender: string;
      text: string;
      isSystem: boolean;
      time: string;
    }>;
    signals: Array<{
      type: string;
      senderId: string;
      targetId: string;
      payload: any;
      timestamp: number;
    }>;
    isTerminated: boolean;
    captions?: Array<{
      id: string;
      senderId: string;
      senderName: string;
      role: string;
      text: string;
      language: string;
      timestamp: number;
    }>;
    allTimeCaptions?: Array<{
      senderName: string;
      role: string;
      text: string;
    }>;
    summaryReport?: {
      agenda: string;
      keyPoints: string[];
      roleContributions: Array<{ role: string; contribution: string }>;
      actionItems: string[];
    } | null;
  }>();

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    // Check for upcoming deadlines every 60 seconds in the background
    setInterval(() => {
      this.checkUpcomingDeadlines();
    }, 60000);
    
    // Run an initial check after 10 seconds of bootstrap
    setTimeout(() => {
      this.checkUpcomingDeadlines();
    }, 10000);
  }

  async checkUpcomingDeadlines() {
    try {
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      // 1. Query upcoming meetings in the next 1 hour
      const upcomingEvents = await this.prisma.calendarEvent.findMany({
        where: {
          isPrivate: false,
          startTime: {
            gte: now,
            lte: oneHourFromNow
          }
        },
        include: {
          createdBy: { select: { firstName: true, lastName: true } }
        }
      });

      for (const event of upcomingEvents) {
        if (this.notifiedEvents.has(event.id)) continue;

        const creatorName = `${event.createdBy?.firstName || ''} ${event.createdBy?.lastName || ''}`.trim();
        const alertContent = `⏰ Upcoming Meeting Reminder: The corporate meeting '${event.title}' is starting in less than 1 hour (at ${new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}). Please check your Calendar Terminal and prepare!`;

        // Resolve targets: everyone invited
        const invitees = await this.prisma.user.findMany({
          where: {
            organizationId: event.organizationId,
            OR: [
              { id: { in: event.targetUserIds } },
              { role: { in: event.targetRoles as any } }
            ]
          }
        });

        for (const invitee of invitees) {
          await this.sendSystemNotification(invitee.id, event.organizationId, alertContent);
        }

        this.notifiedEvents.add(event.id);
      }

      // 2. Query upcoming tasks due in the next 1 hour
      const upcomingTasks = await this.prisma.task.findMany({
        where: {
          status: { not: 'COMPLETED' },
          dueDate: {
            gte: now,
            lte: oneHourFromNow
          }
        }
      });

      for (const task of upcomingTasks) {
        if (this.notifiedTasks.has(task.id)) continue;
        if (!task.assignedToId || !task.dueDate) continue;

        const alertContent = `⏰ Task Deadline Alert: Your assigned task '${task.title}' is hitting its due deadline in less than 1 hour (due at ${new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}). Please check your Tasks Board and mark it complete!`;

        await this.sendSystemNotification(task.assignedToId, task.organizationId, alertContent);
        this.notifiedTasks.add(task.id);
      }

      // 3. Query upcoming Logistics departing in the next 1 hour
      const upcomingLogistics = await this.prisma.logisticsSchedule.findMany({
        where: {
          status: 'SCHEDULED',
          visitDate: {
            gte: now,
            lte: oneHourFromNow
          }
        },
        include: {
          driver: {
            include: {
              employeeProfile: { select: { organizationId: true, userId: true } }
            }
          }
        }
      });

      for (const l of upcomingLogistics) {
        if (this.notifiedLogistics.has(l.id)) continue;
        const driverUserId = l.driver?.employeeProfile?.userId;
        const orgId = l.driver?.employeeProfile?.organizationId;

        if (driverUserId && orgId) {
          const alertContent = `⏰ Logistics Site Transit Reminder: Your scheduled transit from '${l.pickupLocation}' to '${l.dropLocation}' is departing in less than 1 hour (departure at ${new Date(l.visitDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}). Please check your Logistics panel!`;

          await this.sendSystemNotification(driverUserId, orgId, alertContent);
        }
        this.notifiedLogistics.add(l.id);
      }

    } catch (err) {
      console.error("Failed background alerts cron check:", err);
    }
  }

  async sendSystemNotification(targetUserId: string, organizationId: string, content: string) {
    try {
      let systemRoom = await this.prisma.chatRoom.findFirst({
        where: {
          organizationId,
          isSystem: true,
          systemUserId: targetUserId
        }
      });

      if (!systemRoom) {
        systemRoom = await this.prisma.chatRoom.create({
          data: {
            name: "RENS System Bot",
            isGroup: false,
            isSystem: true,
            systemUserId: targetUserId,
            organizationId,
            members: { connect: { id: targetUserId } }
          }
        });

        await this.prisma.message.create({
          data: {
            content: "🤖 Welcome to RENS System Notifications! You will receive live automated alerts here for task assignments, meetings, or fleet updates.",
            isSystem: true,
            chatRoomId: systemRoom.id
          }
        });
      }

      await this.prisma.message.create({
        data: {
          content,
          isSystem: true,
          chatRoomId: systemRoom.id
        }
      });

      await this.prisma.chatRoom.update({
        where: { id: systemRoom.id },
        data: { updatedAt: new Date() }
      });
    } catch (e) {
      console.error("Failed sending background system bot messages:", e);
    }
  }

  async create(userId: string, organizationId: string, data: any) {
    const { title, description, startTime, endTime, location, isPrivate, targetRoles, targetUserIds } = data;

    const event = await this.prisma.calendarEvent.create({
      data: {
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        location: location || null,
        isPrivate: isPrivate === true || isPrivate === 'true',
        targetRoles: targetRoles || [],
        targetUserIds: targetUserIds || [],
        organizationId,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true, role: true }
        }
      }
    });

    // If it's a corporate/public meeting, broadcast system bot alerts to all invitees
    if (!event.isPrivate) {
      try {
        const creatorName = `${event.createdBy.firstName} ${event.createdBy.lastName || ''}`.trim();
        const meetingDateStr = new Date(event.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

        // Resolve target users in the organization (excluding the creator themselves to avoid self-notification noise)
        const invitees = await this.prisma.user.findMany({
          where: {
            organizationId,
            id: { not: userId },
            OR: [
              { id: { in: event.targetUserIds } },
              { role: { in: event.targetRoles as any } }
            ]
          }
        });

        for (const invitee of invitees) {
          // Find or create private system notification room for invitee
          let systemRoom = await this.prisma.chatRoom.findFirst({
            where: {
              organizationId,
              isSystem: true,
              systemUserId: invitee.id,
            },
          });

          if (!systemRoom) {
            systemRoom = await this.prisma.chatRoom.create({
              data: {
                name: "RENS System Bot",
                isGroup: false,
                isSystem: true,
                systemUserId: invitee.id,
                organizationId,
                members: { connect: { id: invitee.id } }
              }
            });

            // Welcome message
            await this.prisma.message.create({
              data: {
                content: "🤖 Welcome to RENS System Notifications! You will receive live automated alerts here for task assignments, meetings, or fleet updates.",
                isSystem: true,
                chatRoomId: systemRoom.id
              }
            });
          }

          const alertContent = `📢 Meeting Scheduled Alert: You have been invited to a new meeting: '${event.title}' on ${meetingDateStr} at ${event.location || 'No location specified'} hosted by ${creatorName}. Please view your Calendar Terminal to review.`;

          await this.prisma.message.create({
            data: {
              content: alertContent,
              isSystem: true,
              chatRoomId: systemRoom.id
            }
          });

          await this.prisma.chatRoom.update({
            where: { id: systemRoom.id },
            data: { updatedAt: new Date() }
          });
        }
      } catch (err) {
        console.error('Failed to broadcast calendar meeting notification:', err);
      }
    }

    return event;
  }

  async findAll(userId: string, organizationId: string, role: string) {
    // 1. Fetch CalendarEvents
    // Private events visible only to creator. Public/Meeting events visible if invitee or matching role.
    const dbEvents = await this.prisma.calendarEvent.findMany({
      where: {
        organizationId,
        OR: [
          { createdById: userId },
          {
            isPrivate: false,
            OR: [
              { targetUserIds: { has: userId } },
              { targetRoles: { has: role } }
            ]
          }
        ]
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, role: true, email: true }
        }
      },
      orderBy: { startTime: 'asc' }
    });

    const mappedDbEvents = dbEvents.map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      startTime: e.startTime,
      endTime: e.endTime,
      location: e.location,
      type: e.isPrivate ? 'private' : 'meeting',
      color: e.isPrivate ? 'green' : 'blue',
      isPrivate: e.isPrivate,
      targetRoles: e.targetRoles,
      targetUserIds: e.targetUserIds,
      createdBy: e.createdBy
    }));

    // 2. Fetch Tasks assigned to the user with a due date
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId,
        assignedToId: userId,
        dueDate: { not: null }
      },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true }
        }
      }
    });

    const mappedTasks = tasks.map(t => ({
      id: `task-${t.id}`,
      title: `📋 [Task] ${t.title}`,
      description: t.description,
      startTime: t.dueDate,
      endTime: t.dueDate,
      location: `Status: ${t.status}`,
      type: 'task',
      color: 'yellow',
      isPrivate: false,
      metadata: {
        taskId: t.id,
        status: t.status,
        createdByName: t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName || ''}`.trim() : 'System'
      }
    }));

    // 3. Fetch LogisticsSchedules in the organization
    const logistics = await this.prisma.logisticsSchedule.findMany({
      where: {
        OR: [
          { driver: { employeeProfile: { organizationId } } },
          { vehicle: { organizationId } }
        ]
      },
      include: {
        driver: {
          include: {
            employeeProfile: {
              include: { user: { select: { firstName: true, lastName: true } } }
            }
          }
        },
        vehicle: true
      }
    });

    const mappedLogistics = logistics.map(l => {
      const driverName = l.driver?.employeeProfile?.user 
        ? `${l.driver.employeeProfile.user.firstName} ${l.driver.employeeProfile.user.lastName || ''}`.trim()
        : 'Unassigned Driver';
      const vehicleModel = l.vehicle ? `${l.vehicle.modelName} (${l.vehicle.plateNumber})` : 'Unassigned Vehicle';
      return {
        id: `logistics-${l.id}`,
        title: `🚚 [Logistics] Site Transit`,
        description: `Pickup: ${l.pickupLocation} -> Drop: ${l.dropLocation}\nDriver: ${driverName}\nVehicle: ${vehicleModel}`,
        startTime: l.visitDate,
        endTime: l.visitDate,
        location: `${l.pickupLocation} to ${l.dropLocation}`,
        type: 'logistics',
        color: 'purple',
        isPrivate: false,
        metadata: {
          scheduleId: l.id,
          status: l.status,
          driverName,
          vehicleModel
        }
      };
    });

    return [...mappedDbEvents, ...mappedTasks, ...mappedLogistics];
  }

  async update(id: string, userId: string, organizationId: string, role: string, data: any) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id }
    });

    if (!event) {
      throw new NotFoundException('Calendar event not found');
    }

    if (event.organizationId !== organizationId) {
      throw new NotFoundException('Calendar event not found in your organization');
    }

    // Only creator or Admin/SuperAdmin can edit
    if (event.createdById !== userId && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      throw new NotFoundException('You do not have permission to edit this event');
    }

    const { title, description, startTime, endTime, location, isPrivate, targetRoles, targetUserIds } = data;

    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        title,
        description,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        location: location !== undefined ? location : undefined,
        isPrivate: isPrivate !== undefined ? (isPrivate === true || isPrivate === 'true') : undefined,
        targetRoles: targetRoles !== undefined ? targetRoles : undefined,
        targetUserIds: targetUserIds !== undefined ? targetUserIds : undefined,
      }
    });
  }

  async remove(id: string, userId: string, organizationId: string, role: string) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id }
    });

    if (!event) {
      throw new NotFoundException('Calendar event not found');
    }

    if (event.organizationId !== organizationId) {
      throw new NotFoundException('Calendar event not found in your organization');
    }

    // Only creator or Admin/SuperAdmin can delete
    if (event.createdById !== userId && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      throw new NotFoundException('You do not have permission to delete this event');
    }

    return this.prisma.calendarEvent.delete({
      where: { id }
    });
  }
}
