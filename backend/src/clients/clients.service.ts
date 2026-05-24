import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any, organizationId: string, assignedToId: string) {
    return this.prisma.client.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        type: data.type || 'BUYER', // BUYER, SELLER, INVESTOR
        address: data.address,
        stage: data.stage || 'INQUIRY',
        budget: data.budget ? parseFloat(data.budget) : null,
        preferences: data.preferences,
        organizationId,
        assignedToId,
      },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.client.findMany({
      where: { organizationId },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        communications: { orderBy: { date: 'desc' } },
        viewings: {
          include: { property: true },
          orderBy: { viewingDate: 'desc' }
        },
        interestedProperties: {
          include: { property: true },
        }
      }
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async update(id: string, organizationId: string, data: any) {
    await this.findOne(id, organizationId);
    return this.prisma.client.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        type: data.type,
        address: data.address,
        stage: data.stage,
        budget: data.budget ? parseFloat(data.budget) : undefined,
        preferences: data.preferences,
        assignedToId: data.assignedToId || undefined
      },
    });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.client.delete({
      where: { id },
    });
  }

  // CRM Features: Property Interest
  async addInterest(clientId: string, propertyId: string) {
    return this.prisma.clientPropertyInterest.create({
      data: {
        clientId,
        propertyId
      }
    });
  }

  async removeInterest(interestId: string) {
    return this.prisma.clientPropertyInterest.delete({
      where: { id: interestId }
    });
  }

  // CRM Features: Viewing Schedules
  async scheduleViewing(clientId: string, data: any) {
    return this.prisma.clientViewing.create({
      data: {
        clientId,
        propertyId: data.propertyId,
        viewingDate: new Date(data.viewingDate),
        feedback: data.feedback || '',
        status: 'SCHEDULED'
      }
    });
  }

  async updateViewing(viewingId: string, data: any) {
    return this.prisma.clientViewing.update({
      where: { id: viewingId },
      data: {
        status: data.status, // SCHEDULED, COMPLETED, CANCELLED
        feedback: data.feedback
      }
    });
  }

  // CRM Features: Communication History
  async addCommunication(clientId: string, data: any) {
    return this.prisma.clientCommunication.create({
      data: {
        clientId,
        type: data.type, // CALL, EMAIL, MEETING, WHATSAPP
        summary: data.summary
      }
    });
  }
}

