import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class EmployeesService {
  constructor(
    private prisma: PrismaService,
    private chatService: ChatService
  ) {}

  async create(organizationId: string, data: any) {
    const { email, password, firstName, lastName, role, department, designation, salary } = data;
    const passwordHash = await bcrypt.hash(password || 'RENS_ERP_123!', 10);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          role: role || 'AGENT',
          organizationId,
        },
      });

      const profile = await tx.employeeProfile.create({
        data: {
          userId: user.id,
          department,
          designation,
          salary: salary ? parseFloat(salary) : null,
          organizationId,
        },
      });

      return {
        ...user,
        employeeProfile: profile,
      };
    });
  }

  async findAll(organizationId: string, role?: string) {
    const users = await this.prisma.user.findMany({
      where: { organizationId },
      include: { employeeProfile: true },
    });

    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return users.map(user => {
        const u = { ...user };
        if (u.employeeProfile) {
          u.employeeProfile = {
            ...u.employeeProfile,
            salary: null,
          };
        }
        return u;
      });
    }

    return users;
  }

  async findOne(id: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
      include: { 
        employeeProfile: {
          include: {
            documents: true,
            attendances: {
              orderBy: { dateStr: 'desc' }
            },
            leaveRequests: {
              orderBy: { createdAt: 'desc' }
            },
            activities: {
              orderBy: { logTime: 'desc' }
            },
            reviews: {
              orderBy: { reviewDate: 'desc' }
            },
            payrolls: {
              orderBy: { month: 'desc' }
            }
          }
        },
        assignedTasks: {
          orderBy: { createdAt: 'desc' }
        }
      },
    });
    if (!user) throw new NotFoundException('Employee not found');
    return user;
  }

  // Update employee profile details
  async updateProfile(id: string, organizationId: string, data: any) {
    // Check if user exists
    const user = await this.findOne(id, organizationId);
    
    // Update or create profile
    if (user.employeeProfile) {
      return this.prisma.employeeProfile.update({
        where: { userId: id },
        data: {
          department: data.department,
          designation: data.designation,
          salary: data.salary ? parseFloat(data.salary) : null,
          status: data.status,
        },
      });
    } else {
      return this.prisma.employeeProfile.create({
        data: {
          userId: id,
          department: data.department,
          designation: data.designation,
          salary: data.salary ? parseFloat(data.salary) : null,
          status: data.status || 'ACTIVE',
          organizationId,
        },
      });
    }
  }

  async remove(id: string, organizationId: string) {
    const user = await this.findOne(id, organizationId);
    if (user.employeeProfile) {
      await this.prisma.employeeProfile.update({
        where: { userId: id },
        data: { status: 'TERMINATED' },
      });
    }
    return { success: true, message: 'Employee terminated' };
  }

  // -----------------------------------------------------------------------------
  // Command Center Live Methods
  // -----------------------------------------------------------------------------

  async checkIn(userId: string, dateStr: string) {
    const profile = await this.prisma.employeeProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Employee profile not found');
    
    return this.prisma.attendance.upsert({
      where: {
        employeeProfileId_dateStr: { employeeProfileId: profile.id, dateStr }
      },
      update: {
        checkIn: new Date(),
        status: 'PRESENT'
      },
      create: {
        employeeProfileId: profile.id,
        dateStr,
        checkIn: new Date(),
        status: 'PRESENT'
      }
    });
  }

  async checkOut(userId: string, dateStr: string, summary?: string) {
    const profile = await this.prisma.employeeProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Employee profile not found');
    
    const attendance = await this.prisma.attendance.update({
      where: {
        employeeProfileId_dateStr: { employeeProfileId: profile.id, dateStr }
      },
      data: {
        checkOut: new Date(),
        checkoutSummary: summary || null
      }
    });

    if (summary) {
      await this.prisma.activityLog.create({
        data: {
          employeeProfileId: profile.id,
          category: 'WORK',
          description: `Daily Checkout Summary: ${summary}`
        }
      });
    }

    return attendance;
  }

  async requestLeave(userId: string, data: any) {
    const profile = await this.prisma.employeeProfile.findUnique({ 
      where: { userId },
      include: { user: true }
    });
    if (!profile) throw new NotFoundException('Employee profile not found');
    
    const leave = await this.prisma.leaveRequest.create({
      data: {
        employeeProfileId: profile.id,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        type: data.type, // SICK, CASUAL, ANNUAL, UNPAID
        reason: data.reason,
        status: 'PENDING'
      }
    });

    try {
      const formatDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      const empName = `${profile.user.firstName} ${profile.user.lastName || ''}`.trim();
      const dateInterval = `${formatDate(new Date(data.startDate))} to ${formatDate(new Date(data.endDate))}`;
      
      // 1. Alert to Employee
      const employeeAlert = `🤖 Leave Request Submitted: Your request for ${data.type} leave from ${dateInterval} has been submitted successfully and is PENDING review.`;
      await this.chatService.createSystemAlert(userId, profile.organizationId, employeeAlert);

      // 2. Alert to HR/Admins
      const admins = await this.prisma.user.findMany({
        where: {
          organizationId: profile.organizationId,
          role: { in: ['SUPER_ADMIN', 'ADMIN', 'HR'] },
          id: { not: userId } // Exclude the requesting employee if they are admin/HR
        }
      });

      const adminAlert = `🤖 New Leave Request Alert: ${empName} has submitted a new ${data.type} leave request from ${dateInterval} awaiting review. Please visit the HR/Admin Terminal to approve or decline.`;
      for (const admin of admins) {
        await this.chatService.createSystemAlert(admin.id, profile.organizationId, adminAlert);
      }
    } catch (e) {
      console.error('Failed to dispatch leave submit notification:', e);
    }

    return leave;
  }

  async updateLeaveStatus(userId: string, leaveId: string, status: string) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      include: {
        employeeProfile: {
          include: {
            user: true
          }
        }
      }
    });
    if (!leave) throw new NotFoundException('Leave request not found');

    const updatedLeave = await this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { 
        status,
        approvedAt: status === 'APPROVED' ? new Date() : null
      }
    });

    try {
      const targetUserId = leave.employeeProfile.userId;
      const organizationId = leave.employeeProfile.organizationId;
      const formatDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      const dateInterval = `${formatDate(leave.startDate)} to ${formatDate(leave.endDate)}`;
      const empName = `${leave.employeeProfile.user.firstName} ${leave.employeeProfile.user.lastName || ''}`.trim();

      // 1. Alert to Employee
      const employeeAlert = `🤖 Leave Request Status Alert: Your request for ${leave.type} leave from ${dateInterval} has been ${status} by the HR administration.`;
      await this.chatService.createSystemAlert(targetUserId, organizationId, employeeAlert);

      // 2. Alert to HR/Admins
      const admins = await this.prisma.user.findMany({
        where: {
          organizationId,
          role: { in: ['SUPER_ADMIN', 'ADMIN', 'HR'] }
        }
      });

      const adminAlert = `🤖 Leave Request Resolved: The ${leave.type} leave request for ${empName} from ${dateInterval} has been marked as ${status} by the administration.`;
      for (const admin of admins) {
        await this.chatService.createSystemAlert(admin.id, organizationId, adminAlert);
      }
    } catch (e) {
      console.error('Failed to dispatch leave status update notification:', e);
    }

    return updatedLeave;
  }

  async uploadDocument(userId: string, data: any) {
    const profile = await this.prisma.employeeProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Employee profile not found');
    
    return this.prisma.employeeDocument.create({
      data: {
        employeeProfileId: profile.id,
        name: data.name,
        category: data.category, // ID, CONTRACT, RESUME, OTHER
        fileUrl: data.fileUrl || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
      }
    });
  }

  async deleteDocument(userId: string, docId: string) {
    return this.prisma.employeeDocument.delete({
      where: { id: docId }
    });
  }

  async addActivity(userId: string, data: any) {
    const profile = await this.prisma.employeeProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Employee profile not found');
    
    return this.prisma.activityLog.create({
      data: {
        employeeProfileId: profile.id,
        description: data.description,
        category: data.category, // WORK, MEETING, COFFEE_BREAK, CALL, OTHER
        startTime: data.startTime ? new Date(data.startTime) : null,
        endTime: data.endTime ? new Date(data.endTime) : null,
        duration: data.duration ? parseInt(data.duration) : 0
      }
    });
  }

  async addPerformanceReview(userId: string, managerId: string, data: any) {
    const profile = await this.prisma.employeeProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Employee profile not found');
    
    return this.prisma.performanceReview.create({
      data: {
        employeeProfileId: profile.id,
        rating: parseInt(data.rating), // 1-5
        feedback: data.feedback,
        reviewedById: managerId
      }
    });
  }

  async assignTask(userId: string, organizationId: string, data: any) {
    return this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status: 'PENDING',
        organizationId,
        assignedToId: userId
      }
    });
  }

  // -----------------------------------------------------------------------------
  // Payroll management live methods
  // -----------------------------------------------------------------------------

  async addPayroll(userId: string, data: any) {
    const profile = await this.prisma.employeeProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Employee profile not found');

    const baseSalary = data.baseSalary ? parseFloat(data.baseSalary) : (profile.salary || 0);
    const allowances = data.allowances ? parseFloat(data.allowances) : 0;
    const deductions = data.deductions ? parseFloat(data.deductions) : 0;
    const netSalary = baseSalary + allowances - deductions;

    return this.prisma.payroll.create({
      data: {
        employeeProfileId: profile.id,
        month: data.month, // e.g. "2026-05"
        baseSalary,
        allowances,
        deductions,
        netSalary,
        status: data.status || 'UNPAID',
        paidAt: data.status === 'PAID' ? new Date() : null
      }
    });
  }

  async updatePayroll(userId: string, payrollId: string, data: any) {
    const updateData: any = {};
    if (data.baseSalary !== undefined) updateData.baseSalary = parseFloat(data.baseSalary);
    if (data.allowances !== undefined) updateData.allowances = parseFloat(data.allowances);
    if (data.deductions !== undefined) updateData.deductions = parseFloat(data.deductions);
    
    // Recalculate net if any values changed
    if (updateData.baseSalary !== undefined || updateData.allowances !== undefined || updateData.deductions !== undefined) {
      const payroll = await this.prisma.payroll.findUnique({ where: { id: payrollId } });
      if (!payroll) throw new NotFoundException('Payroll record not found');
      const base = updateData.baseSalary !== undefined ? updateData.baseSalary : payroll.baseSalary;
      const allow = updateData.allowances !== undefined ? updateData.allowances : payroll.allowances;
      const ded = updateData.deductions !== undefined ? updateData.deductions : payroll.deductions;
      updateData.netSalary = base + allow - ded;
    }

    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'PAID') {
        updateData.paidAt = new Date();
      } else {
        updateData.paidAt = null;
      }
    }

    return this.prisma.payroll.update({
      where: { id: payrollId },
      data: updateData
    });
  }

  async deletePayroll(userId: string, payrollId: string) {
    return this.prisma.payroll.delete({
      where: { id: payrollId }
    });
  }

  async resetPassword(id: string, organizationId: string, newPassword: string) {
    const user = await this.findOne(id, organizationId);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });
    return { success: true, message: 'Password reset successfully!' };
  }
}

