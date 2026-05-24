import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  // Automatically find or create universal rooms (System Bot log & General Team channel)
  async getRooms(userId: string, organizationId: string) {
    // 1. Ensure private System Notifications bot room exists
    let systemRoom = await this.prisma.chatRoom.findFirst({
      where: {
        organizationId,
        isSystem: true,
        systemUserId: userId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!systemRoom) {
      systemRoom = await this.prisma.chatRoom.create({
        data: {
          name: "RENS System Bot",
          isGroup: false,
          isSystem: true,
          systemUserId: userId,
          organizationId,
          members: {
            connect: { id: userId },
          },
        },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      // Insert initial welcome message from the system bot
      await this.prisma.message.create({
        data: {
          content: "🤖 Welcome to RENS System Notifications! You will receive live automated alerts here for any task assignments, audit cycles, or listing updates related to you.",
          isSystem: true,
          chatRoomId: systemRoom.id,
        },
      });
    }

    // 2. Ensure General Team Chat group room exists
    let generalRoom = await this.prisma.chatRoom.findFirst({
      where: {
        organizationId,
        isGroup: true,
        name: "General Team Chat",
      },
      include: {
        members: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!generalRoom) {
      // Fetch all users in organization to join
      const orgUsers = await this.prisma.user.findMany({
        where: { organizationId },
        select: { id: true },
      });

      generalRoom = await this.prisma.chatRoom.create({
        data: {
          name: "General Team Chat",
          isGroup: true,
          organizationId,
          members: {
            connect: orgUsers.map((u) => ({ id: u.id })),
          },
        },
        include: {
          members: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      // Initial message
      await this.prisma.message.create({
        data: {
          content: "👋 Welcome to the General Team Chat! This channel is open to all RENS employees for collaborative coordination.",
          chatRoomId: generalRoom.id,
        },
      });
    } else {
      // Dynamically auto-join user if they are not in the General room yet
      const isMember = generalRoom.members.some((m) => m.id === userId);
      if (!isMember) {
        generalRoom = await this.prisma.chatRoom.update({
          where: { id: generalRoom.id },
          data: {
            members: {
              connect: { id: userId },
            },
          },
          include: {
            members: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });
      }
    }

    // 3. Fetch all other direct messages or group chats the user is part of
    const userRooms = await this.prisma.chatRoom.findMany({
      where: {
        organizationId,
        members: {
          some: { id: userId },
        },
        // Filter out system room and general room since we fetched/handled them separately
        NOT: [
          { id: systemRoom.id },
          { id: generalRoom.id },
        ],
      },
      include: {
        members: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Merge and return in logical order (System Bot first, General second, then DMs)
    return [systemRoom, generalRoom, ...userRooms];
  }

  async getMessages(roomId: string, organizationId: string) {
    return this.prisma.message.findMany({
      where: {
        chatRoomId: roomId,
        chatRoom: { organizationId },
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async sendMessage(roomId: string, senderId: string, content: string) {
    const message = await this.prisma.message.create({
      data: {
        content,
        chatRoomId: roomId,
        senderId,
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });

    // Touch the chatroom updatedAt to sort recently active rooms
    await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  // Create private 1-on-1 direct DM conversation
  async startDirectChat(userId: string, targetUserId: string, organizationId: string) {
    // Check if direct DM between these two already exists
    let existingRoom = await this.prisma.chatRoom.findFirst({
      where: {
        organizationId,
        isGroup: false,
        isSystem: false,
        AND: [
          { members: { some: { id: userId } } },
          { members: { some: { id: targetUserId } } },
        ],
      },
      include: {
        members: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (existingRoom) return existingRoom;

    // Create new direct DM chatroom
    const newRoom = await this.prisma.chatRoom.create({
      data: {
        isGroup: false,
        isSystem: false,
        organizationId,
        members: {
          connect: [
            { id: userId },
            { id: targetUserId },
          ],
        },
      },
      include: {
        members: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return newRoom;
  }

  // Automated System Bot Trigger Alert
  async createSystemAlert(targetUserId: string, organizationId: string, content: string) {
    // 1. Locate or create System room
    let systemRoom = await this.prisma.chatRoom.findFirst({
      where: {
        organizationId,
        isSystem: true,
        systemUserId: targetUserId,
      },
    });

    if (!systemRoom) {
      systemRoom = await this.prisma.chatRoom.create({
        data: {
          name: "RENS System Bot",
          isGroup: false,
          isSystem: true,
          systemUserId: targetUserId,
          organizationId,
          members: {
            connect: { id: targetUserId },
          },
        },
      });
    }

    // 2. Add System warning notification alert message
    const alertMessage = await this.prisma.message.create({
      data: {
        content,
        isSystem: true,
        chatRoomId: systemRoom.id,
      },
    });

    // Touch chat room updatedAt
    await this.prisma.chatRoom.update({
      where: { id: systemRoom.id },
      data: { updatedAt: new Date() },
    });

    return alertMessage;
  }
}
