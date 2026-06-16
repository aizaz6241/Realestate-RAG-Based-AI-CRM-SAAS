import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

@Injectable()
export class SaasAdminService {
  constructor(private prisma: PrismaService) {}

  async getSystemStats() {
    // 1. Total Active Organizations (non-suspended)
    const activeOrgsCount = await this.prisma.organization.count({
      where: {
        subscription: {
          status: { in: ['ACTIVE', 'OVERDUE'] }
        }
      }
    });

    const totalOrgs = await this.prisma.organization.count();

    // 2. Aggregate MRR (AED) from all active/overdue subscriptions
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'OVERDUE'] }
      },
      select: {
        monthlyPrice: true
      }
    });
    const mrr = subscriptions.reduce((sum, sub) => sum + sub.monthlyPrice, 0);

    // 3. Count Overdue Payments
    const overdueCount = await this.prisma.subscription.count({
      where: {
        status: 'OVERDUE'
      }
    });

    // 4. API Requests this Month (current month)
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const apiUsageAgg = await this.prisma.apiUsageLog.groupBy({
      by: ['serviceName'],
      _sum: {
        requestCount: true,
        totalTokens: true
      },
      where: {
        createdAt: {
          gte: currentMonthStart
        }
      }
    });

    let openrouterRequests = 0;
    let geminiRequests = 0;
    let openaiRequests = 0;

    apiUsageAgg.forEach(agg => {
      const count = agg._sum.requestCount || 0;
      if (agg.serviceName === 'OpenRouter') openrouterRequests = count;
      else if (agg.serviceName === 'Gemini') geminiRequests = count;
      else if (agg.serviceName === 'OpenAI') openaiRequests = count;
    });

    // Calculate approximate API Cost (free Ollama, Gemini at $0.075/1M tokens avg, OpenAI at $0.15/1M tokens avg)
    let apiCostEstimate = 0;
    apiUsageAgg.forEach(agg => {
      const tokens = agg._sum.totalTokens || 0;
      if (agg.serviceName === 'Gemini') {
        apiCostEstimate += (tokens / 1000000) * 0.275; // in AED approx.
      } else if (agg.serviceName === 'OpenAI') {
        apiCostEstimate += (tokens / 1000000) * 0.55; // in AED approx.
      }
    });

    // 5. Total pending balance
    const pendingBalanceAgg = await this.prisma.subscription.aggregate({
      _sum: {
        amountPending: true
      }
    });
    const totalPendingRent = pendingBalanceAgg._sum.amountPending || 0;

    // 6. Historical 6-month payment aggregation for cash flow chart
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const recentPayments = await this.prisma.subscriptionPayment.findMany({
      where: {
        paymentDate: { gte: sixMonthsAgo },
        status: 'SUCCESS'
      },
      select: {
        amount: true,
        paymentDate: true
      }
    });

    const monthlyDataMap: Record<string, number> = {};
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`;
      monthlyDataMap[label] = 0;
    }

    recentPayments.forEach(p => {
      const date = new Date(p.paymentDate);
      const label = `${monthNames[date.getMonth()]} ${date.getFullYear().toString().substring(2)}`;
      if (monthlyDataMap[label] !== undefined) {
        monthlyDataMap[label] += p.amount;
      }
    });

    const monthlyRevenueTrend = Object.keys(monthlyDataMap).map(key => ({
      month: key,
      amount: monthlyDataMap[key]
    }));

    return {
      activeOrganizations: activeOrgsCount,
      totalOrganizations: totalOrgs,
      monthlyRecurringRevenue: mrr,
      overdueOrganizations: overdueCount,
      apiCostEstimate: parseFloat(apiCostEstimate.toFixed(2)),
      totalPendingRent,
      apiRequests: {
        openrouter: openrouterRequests,
        gemini: geminiRequests,
        openai: openaiRequests,
        total: openrouterRequests + geminiRequests + openaiRequests
      },
      monthlyRevenueTrend
    };
  }

  async getOrganizations() {
    const orgs = await this.prisma.organization.findMany({
      include: {
        subscription: {
          include: {
            payments: {
              orderBy: { paymentDate: 'desc' },
              take: 10
            }
          }
        },
        _count: {
          select: {
            users: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return orgs.map(org => {
      const daysUntilDue = org.subscription
        ? Math.ceil((org.subscription.nextBillingDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        id: org.id,
        name: org.name,
        domain: org.domain,
        userCount: org._count.users,
        createdAt: org.createdAt,
        subscription: org.subscription ? {
          id: org.subscription.id,
          plan: org.subscription.plan,
          status: org.subscription.status,
          monthlyPrice: org.subscription.monthlyPrice,
          currency: org.subscription.currency,
          nextBillingDate: org.subscription.nextBillingDate,
          daysUntilDue: daysUntilDue,
          paymentStatus: org.subscription.paymentStatus,
          amountPaidThisCycle: org.subscription.amountPaidThisCycle,
          amountPending: org.subscription.amountPending,
          contractTerms: org.subscription.contractTerms,
          lastPaymentDate: org.subscription.lastPaymentDate,
          payments: org.subscription.payments
        } : null
      };
    });
  }

  async createOrganization(data: {
    name: string;
    domain: string;
    adminEmail: string;
    adminPasswordHash: string;
    adminFirstName: string;
    adminLastName: string;
    monthlyPrice: number;
    plan: string;
    contractTerms?: string;
  }) {
    // Check if domain already exists
    if (data.domain) {
      const existingDomain = await this.prisma.organization.findUnique({
        where: { domain: data.domain }
      });
      if (existingDomain) {
        throw new BadRequestException(`Organization with domain "${data.domain}" already exists`);
      }
    }

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.adminEmail }
    });
    if (existingUser) {
      throw new BadRequestException(`User with email "${data.adminEmail}" already exists`);
    }

    // Hash admin password
    const hashedPassword = await bcrypt.hash(data.adminPasswordHash, 10);

    // Create Organization, Subscription, and Super Admin in a transaction
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: data.name,
          domain: data.domain
        }
      });

      // Create subscription due in 30 days
      const nextBillingDate = new Date();
      nextBillingDate.setDate(nextBillingDate.getDate() + 30);

      await tx.subscription.create({
        data: {
          organizationId: org.id,
          plan: data.plan || 'STANDARD',
          status: 'ACTIVE',
          monthlyPrice: data.monthlyPrice,
          currency: 'AED',
          nextBillingDate,
          paymentStatus: 'UNPAID',
          amountPaidThisCycle: 0.0,
          amountPending: data.monthlyPrice,
          contractTerms: data.contractTerms || ''
        }
      });

      const user = await tx.user.create({
        data: {
          email: data.adminEmail,
          passwordHash: hashedPassword,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          role: Role.SUPER_ADMIN,
          organizationId: org.id
        }
      });

      // Create a default chatroom for the organization (standard Zorvex requirement)
      await tx.chatRoom.create({
        data: {
          name: "General Team Chat",
          isGroup: true,
          organizationId: org.id
        }
      });

      return {
        organizationId: org.id,
        name: org.name,
        adminUser: {
          id: user.id,
          email: user.email
        }
      };
    });
  }

  async updateSubscription(
    orgId: string,
    data: {
      plan?: string;
      monthlyPrice?: number;
      nextBillingDate?: string;
      contractTerms?: string;
    }
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId: orgId }
    });
    if (!sub) {
      throw new NotFoundException('Subscription details not found for this organization');
    }

    const updateData: any = {};
    if (data.plan) updateData.plan = data.plan;
    if (data.monthlyPrice !== undefined) {
      updateData.monthlyPrice = data.monthlyPrice;
      // Adjust pending balance proportionately if payment status is UNPAID
      if (sub.paymentStatus === 'UNPAID') {
        updateData.amountPending = data.monthlyPrice;
      } else if (sub.paymentStatus === 'PARTIAL') {
        updateData.amountPending = Math.max(0, data.monthlyPrice - sub.amountPaidThisCycle);
      }
    }
    if (data.nextBillingDate) {
      updateData.nextBillingDate = new Date(data.nextBillingDate);
      // If next billing date is pushed to future, restore active status optionally
      const isFuture = new Date(data.nextBillingDate) > new Date();
      if (isFuture && sub.status === 'OVERDUE') {
        updateData.status = 'ACTIVE';
      }
    }
    if (data.contractTerms !== undefined) updateData.contractTerms = data.contractTerms;

    return this.prisma.subscription.update({
      where: { organizationId: orgId },
      data: updateData
    });
  }

  async toggleBlockOrganization(orgId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId: orgId }
    });
    if (!sub) {
      throw new NotFoundException('Subscription details not found for this organization');
    }

    const isSuspended = sub.status === 'SUSPENDED';
    let newStatus = 'ACTIVE';

    if (!isSuspended) {
      newStatus = 'SUSPENDED';
    } else {
      // Determine if overdue or active based on date
      const isOverdue = new Date(sub.nextBillingDate) < new Date() && sub.paymentStatus !== 'PAID';
      newStatus = isOverdue ? 'OVERDUE' : 'ACTIVE';
    }

    return this.prisma.subscription.update({
      where: { organizationId: orgId },
      data: {
        status: newStatus
      }
    });
  }

  async resetAdminPassword(
    orgId: string,
    data: {
      email: string;
      newPasswordHash: string;
    }
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: data.email,
        organizationId: orgId,
        role: Role.SUPER_ADMIN
      }
    });
    if (!user) {
      throw new NotFoundException('Super Admin user with this email not found in this organization');
    }

    const hashedPassword = await bcrypt.hash(data.newPasswordHash, 10);
    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true
      }
    });
  }

  async recordPayment(
    orgId: string,
    data: {
      amount: number;
      billingPeriod: string; // "2026-06"
    }
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId: orgId }
    });
    if (!sub) {
      throw new NotFoundException('Subscription details not found for this organization');
    }

    return this.prisma.$transaction(async (tx) => {
      // Create payment log
      const payment = await tx.subscriptionPayment.create({
        data: {
          subscriptionId: sub.id,
          amount: data.amount,
          status: 'SUCCESS',
          billingPeriod: data.billingPeriod,
          paymentDate: new Date()
        }
      });

      // Update subscription totals
      const newPaid = sub.amountPaidThisCycle + data.amount;
      const newPending = Math.max(0, sub.monthlyPrice - newPaid);
      let paymentStatus = 'PARTIAL';
      if (newPaid >= sub.monthlyPrice) {
        paymentStatus = 'PAID';
      }

      // If they paid fully (or partially), and they were marked as overdue, we restore active status
      let newStatus = sub.status;
      if (newStatus === 'OVERDUE' && paymentStatus === 'PAID') {
        newStatus = 'ACTIVE';
      }

      const updatedSub = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          amountPaidThisCycle: newPaid,
          amountPending: newPending,
          paymentStatus,
          lastPaymentDate: new Date(),
          status: newStatus
        }
      });

      return {
        payment,
        subscription: updatedSub
      };
    });
  }

  async getAiUsageDetails(orgId: string) {
    const logs = await this.prisma.apiUsageLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: { firstName: true, email: true }
        }
      }
    });

    const summary = await this.prisma.apiUsageLog.groupBy({
      by: ['serviceName'],
      _sum: {
        requestCount: true,
        totalTokens: true
      },
      where: { organizationId: orgId }
    });

    return {
      logs,
      summary
    };
  }

  async getBillingHistory(orgId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId: orgId }
    });
    if (!sub) {
      throw new NotFoundException('Subscription not found');
    }

    return this.prisma.subscriptionPayment.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { paymentDate: 'desc' }
    });
  }
}
