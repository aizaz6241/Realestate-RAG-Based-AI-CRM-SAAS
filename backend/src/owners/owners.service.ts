import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OwnersService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, assignedToId: string, data: any) {
    return this.prisma.owner.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        commissionRate: data.commissionRate ? parseFloat(data.commissionRate) : 5.0,
        kycNotes: data.kycNotes,
        agreementUrl: data.agreementUrl,
        agreementExpiry: data.agreementExpiry ? new Date(data.agreementExpiry) : null,
        organizationId,
        assignedToId: assignedToId || null,
        status: 'ACTIVE',
      },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.owner.findMany({
      where: { organizationId },
      include: {
        properties: { select: { id: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const owner = await this.prisma.owner.findFirst({
      where: { id, organizationId },
      include: {
        properties: true,
        documents: true,
        communications: { orderBy: { date: 'desc' } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } }
      },
    });
    if (!owner) throw new NotFoundException('Owner / Landlord not found');
    return owner;
  }

  async update(id: string, organizationId: string, data: any) {
    await this.findOne(id, organizationId);

    return this.prisma.owner.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        status: data.status,
        kycVerified: data.kycVerified !== undefined ? data.kycVerified : undefined,
        kycNotes: data.kycNotes,
        commissionRate: data.commissionRate ? parseFloat(data.commissionRate) : undefined,
        agreementUrl: data.agreementUrl,
        agreementExpiry: data.agreementExpiry ? new Date(data.agreementExpiry) : undefined,
        assignedToId: data.assignedToId || undefined
      },
    });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    await this.prisma.owner.delete({ where: { id } });
    return { success: true, message: 'Owner removed successfully' };
  }

  // Document management
  async uploadDocument(ownerId: string, data: any) {
    return this.prisma.ownerDocument.create({
      data: {
        ownerId,
        name: data.name,
        fileUrl: data.fileUrl || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
      }
    });
  }

  async deleteDocument(docId: string) {
    return this.prisma.ownerDocument.delete({ where: { id: docId } });
  }

  // Communication logs
  async addCommunication(ownerId: string, data: any) {
    return this.prisma.ownerCommunication.create({
      data: {
        ownerId,
        type: data.type, // CALL, EMAIL, MEETING, WHATSAPP
        summary: data.summary,
      }
    });
  }
}
