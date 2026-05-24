import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, userId: string, data: any) {
    const { name, category, fileUrl, tags, expiryDate, accessRole, targetRoles, targetUserIds, writeRoles, writeUserIds } = data;

    const document = await this.prisma.document.create({
      data: {
        name,
        category,
        fileUrl,
        tags: tags || [],
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        accessRole: accessRole || 'VIEWER',
        targetRoles: targetRoles || [],
        targetUserIds: targetUserIds || [],
        writeRoles: writeRoles || [],
        writeUserIds: writeUserIds || [],
        organizationId,
        createdById: userId,
      },
    });

    // Save initial version log
    await this.prisma.documentVersion.create({
      data: {
        version: 1,
        fileUrl,
        documentId: document.id,
        updatedById: userId,
      },
    });

    return this.findOne(document.id, organizationId, userId, 'SUPER_ADMIN'); // Fetch full doc securely
  }

  async findAll(organizationId: string, userId: string, role: string, category?: string, tag?: string) {
    const whereClause: any = { organizationId };

    if (category) {
      whereClause.category = category;
    }

    if (tag) {
      whereClause.tags = { has: tag };
    }

    // Dynamic row security: If not Admin/SuperAdmin, apply security clearance arrays checks in database query!
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      whereClause.OR = [
        { createdById: userId },
        { targetRoles: { has: role } },
        { targetUserIds: { has: userId } }
      ];
    }

    const docs = await this.prisma.document.findMany({
      where: whereClause,
      include: {
        createdBy: { select: { id: true, email: true, firstName: true } },
        versions: { orderBy: { version: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Update isExpired status on-the-fly if needed
    const now = new Date();
    const updatedDocs = await Promise.all(
      docs.map(async (doc) => {
        const expired = doc.expiryDate ? new Date(doc.expiryDate) < now : false;
        if (expired !== doc.isExpired) {
          return this.prisma.document.update({
            where: { id: doc.id },
            data: { isExpired: expired },
            include: {
              createdBy: { select: { id: true, email: true, firstName: true } },
              versions: { orderBy: { version: 'desc' } },
            },
          });
        }
        return doc;
      }),
    );

    return updatedDocs;
  }

  async findOne(id: string, organizationId: string, userId: string, role: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, organizationId },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true } },
        versions: {
          include: {
            updatedBy: { select: { id: true, email: true, firstName: true } },
          },
          orderBy: { version: 'desc' },
        },
      },
    });
    
    if (!doc) throw new NotFoundException('Document not found');

    // Security check: Only creator, Admins, or targeted users/roles can read
    if (doc.createdById !== userId && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      const isTargetRole = doc.targetRoles.includes(role);
      const isTargetUser = doc.targetUserIds.includes(userId);
      if (!isTargetRole && !isTargetUser) {
        throw new ForbiddenException('Access Denied: You do not have security clearance to view this document');
      }
    }

    return doc;
  }

  async addVersion(id: string, organizationId: string, userId: string, role: string, data: any) {
    const document = await this.findOne(id, organizationId, userId, role);
    
    // Security check: Only creator, Admins, or write-authorized users/roles can add versions
    if (document.createdById !== userId && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      const isWriteRole = document.writeRoles.includes(role);
      const isWriteUser = document.writeUserIds.includes(userId);
      if (!isWriteRole && !isWriteUser) {
        throw new ForbiddenException('Access Denied: You do not have write clearance to add new revisions to this document');
      }
    }

    const newVersionNum = document.version + 1;

    await this.prisma.$transaction([
      this.prisma.document.update({
        where: { id },
        data: {
          version: newVersionNum,
          fileUrl: data.fileUrl,
        },
      }),
      this.prisma.documentVersion.create({
        data: {
          version: newVersionNum,
          fileUrl: data.fileUrl,
          documentId: id,
          updatedById: userId,
        },
      }),
    ]);

    return this.findOne(id, organizationId, userId, role);
  }

  async remove(id: string, organizationId: string, userId: string, role: string) {
    const document = await this.findOne(id, organizationId, userId, role);
    
    // Security check: Only creator or Admins can delete
    if (document.createdById !== userId && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      throw new ForbiddenException('Access Denied: You do not have permission to delete this document from the vault');
    }

    return this.prisma.document.delete({
      where: { id },
    });
  }

  async getExpiryReminders(organizationId: string) {
    const now = new Date();
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + 30); // Next 30 days

    return this.prisma.document.findMany({
      where: {
        organizationId,
        expiryDate: {
          gte: now,
          lte: threshold,
        },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }
}
