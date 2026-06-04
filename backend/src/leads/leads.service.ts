import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private integrationsService: IntegrationsService,
  ) {}

  async create(data: any, organizationId: string, assignedToId?: string) {
    const { name, email, phone, source, description, status, notes } = data;

    // 1. DUPLICATE DETECTION CHECK
    let isDuplicate = false;
    let duplicateOfId: string | null = null;

    if (email || phone) {
      const matchConditions: any[] = [];
      if (email) matchConditions.push({ email });
      if (phone) matchConditions.push({ phone });

      const existingLead = await this.prisma.lead.findFirst({
        where: {
          organizationId,
          OR: matchConditions,
        },
      });

      if (existingLead) {
        isDuplicate = true;
        duplicateOfId = existingLead.id;
      } else {
        const existingClient = await this.prisma.client.findFirst({
          where: {
            organizationId,
            OR: matchConditions,
          },
        });
        if (existingClient) {
          isDuplicate = true;
          duplicateOfId = existingClient.id;
        }
      }
    }

    // 2. LEAD SCORING ALGORITHM
    let score = 15; // Base warm lead score
    if (phone) score += 25; // Contact phone provided
    if (email) score += 15; // Contact email provided
    
    const src = source ? source.toUpperCase() : 'DIRECT';
    if (src === 'ZILLOW' || src === 'PROPERTY_FINDER') {
      score += 25; // High-intent aggregate listing channels
    } else if (src === 'WEBSITE' || src === 'REFERRAL') {
      score += 15;
    }
 
    if (description && description.length > 20) {
      score += 20; // Detailed request profile
    }
    
    score = Math.min(score, 100);

    // 3. AUTOMATED ROUND-ROBIN ASSIGNMENT QUEUE
    let targetAgentId = assignedToId;

    if (!targetAgentId) {
      // Find all active Agents in the same organization
      const agents = await this.prisma.user.findMany({
        where: {
          organizationId,
          role: { in: ['AGENT', 'SALES_MANAGER', 'ADMIN'] },
          isActive: true,
        },
        include: {
          assignedLeads: true,
        },
      });

      if (agents.length > 0) {
        // Sort by the one who has the fewest assigned active leads
        const sortedAgents = agents.sort(
          (a, b) => a.assignedLeads.length - b.assignedLeads.length,
        );
        targetAgentId = sortedAgents[0].id;
      }
    }

    const lead = await this.prisma.lead.create({
      data: {
        name,
        email,
        phone,
        source: src,
        status: status || 'NEW',
        score,
        isDuplicate,
        duplicateOfId,
        organizationId,
        assignedToId: targetAgentId || null,
        notes: notes || description || null,
      },
    });

    // Create initial creation activity timeline log
    await this.prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'NOTES',
        description: `Lead created from source: ${src}. Automated lead quality score evaluated at: ${score}%.`,
      },
    });

    // Auto-trigger Vapi Call if VOICE integration is active
    this.prisma.integrationConfig.findUnique({
      where: { organizationId_type: { organizationId, type: 'VOICE' } },
    }).then((voiceConfig) => {
      if (voiceConfig && voiceConfig.isEnabled) {
        this.integrationsService.triggerVapiCall(organizationId, lead.id).catch(() => {});
      }
    }).catch(() => {});

    return this.findOne(lead.id, organizationId);
  }

  async findAll(organizationId: string) {
    return this.prisma.lead.findMany({
      where: { organizationId },
      include: {
        assignedTo: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
        activities: { orderBy: { activityDate: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId },
      include: {
        assignedTo: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
        activities: { orderBy: { activityDate: 'desc' } },
      },
    });
    if (!lead) throw new NotFoundException('Lead profile not found');
    return lead;
  }

  async update(id: string, organizationId: string, data: any) {
    const currentLead = await this.findOne(id, organizationId);

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        source: data.source,
        status: data.status,
        score: data.score !== undefined ? parseInt(data.score) : undefined,
        assignedToId: data.assignedToId,
        notes: data.notes,
      },
    });

    // Automatically log status transitions or assignment triggers
    if (data.status && data.status !== currentLead.status) {
      await this.prisma.leadActivity.create({
        data: {
          leadId: id,
          type: 'STATUS_CHANGE',
          description: `Stage pipeline advanced from ${currentLead.status} to ${data.status}.`,
        },
      });
    }

    if (data.assignedToId && data.assignedToId !== currentLead.assignedToId) {
      const newAgent = await this.prisma.user.findUnique({
        where: { id: data.assignedToId },
        select: { firstName: true },
      });
      await this.prisma.leadActivity.create({
        data: {
          leadId: id,
          type: 'NOTES',
          description: `Lead reallocated to Agent Realtor: ${newAgent?.firstName || 'Office Pool'}.`,
        },
      });
    }

    return this.findOne(id, organizationId);
  }

  async addActivity(leadId: string, organizationId: string, data: any) {
    await this.findOne(leadId, organizationId); // Ensure lead access exists

    return this.prisma.leadActivity.create({
      data: {
        leadId,
        type: data.type, // CALL, EMAIL, NOTES
        description: data.description,
      },
    });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.lead.delete({
      where: { id },
    });
  }
}
