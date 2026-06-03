import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(data: any, organizationId: string, assignedToId: string, createdById: string) {
    const task = await this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status || 'PENDING',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        organizationId,
        assignedToId,
        createdById,
      },
    });

    if (assignedToId) {
      try {
        // 1. Locate or create System notifications chatroom for assignee
        let systemRoom = await this.prisma.chatRoom.findFirst({
          where: {
            organizationId,
            isSystem: true,
            systemUserId: assignedToId,
          },
        });

        if (!systemRoom) {
          systemRoom = await this.prisma.chatRoom.create({
            data: {
              name: "Nexora System Bot",
              isGroup: false,
              isSystem: true,
              systemUserId: assignedToId,
              organizationId,
              members: {
                connect: { id: assignedToId },
              },
            },
          });

          // Insert welcome message
          await this.prisma.message.create({
            data: {
              content: "🤖 Welcome to Nexora System Notifications! You will receive live automated alerts here for any task assignments, audit cycles, or listing updates related to you.",
              isSystem: true,
              chatRoomId: systemRoom.id,
            },
          });
        }

        // 2. Format a gorgeous automated notification message
        const dueDateString = task.dueDate 
          ? ` due on ${new Date(task.dueDate).toLocaleDateString([], { dateStyle: 'medium' })}` 
          : "";
        const alertContent = `📢 Task Assignment Alert: A new operational task has been allocated to you: '${task.title}'${dueDateString}. Please check your Tasks Board to review and execute this assignment.`;

        // 3. Create the System message in their room
        await this.prisma.message.create({
          data: {
            content: alertContent,
            isSystem: true,
            chatRoomId: systemRoom.id,
          },
        });

        // Touch the room
        await this.prisma.chatRoom.update({
          where: { id: systemRoom.id },
          data: { updatedAt: new Date() },
        });

      } catch (e) {
        console.error("Failed to automatically generate System Chat Notification alert:", e);
      }
    }

    return task;
  }

  async findAll(organizationId: string) {
    return this.prisma.task.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, role: true }
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, role: true }
        }
      }
    });
  }

  async findOne(id: string, organizationId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(id: string, organizationId: string, data: any) {
    await this.findOne(id, organizationId);
    return this.prisma.task.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.task.delete({
      where: { id },
    });
  }
}
