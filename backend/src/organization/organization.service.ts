import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationService {
  constructor(private prisma: PrismaService) {}

  async getOrganization(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        domain: true,
        logo: true,
        description: true,
        businessLocation: true,
        phone: true,
        email: true,
        taxId: true,
        createdAt: true,
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }

  async updateOrganization(
    orgId: string,
    data: {
      name?: string;
      logo?: string;
      description?: string;
      businessLocation?: string;
      phone?: string;
      email?: string;
      taxId?: string;
    },
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return this.prisma.organization.update({
      where: { id: orgId },
      data,
    });
  }
}
