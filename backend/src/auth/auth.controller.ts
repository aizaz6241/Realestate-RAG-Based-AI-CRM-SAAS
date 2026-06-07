import { Controller, Request, Post, UseGuards, Get, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private prisma: PrismaService
  ) {}

  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(@Request() req) {
    // req.user is set by Passport's LocalStrategy
    return this.authService.login(req.user);
  }

  // A route to create the very first super admin / organization for testing
  @Post('register-tenant')
  async registerTenant(@Body() body: any) {
    // In production, this would be highly secured.
    const { orgName, domain, email, password, firstName, lastName } = body;
    
    // Create Org (requires PrismaService to be injected in UsersService or a separate TenantService, 
    // for MVP we can just use UsersService if we give it access to org creation)
    
    return { message: 'Tenant registration will be implemented in TenantService' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    const user = req.user;
    
    if (user.isSystemAdmin) {
      return {
        ...user,
        subscriptionStatus: 'ACTIVE',
        daysUntilDue: 999,
        amountPending: 0,
        paymentStatus: 'PAID'
      };
    }

    if (user.organizationId) {
      const subscription = await this.prisma.subscription.findUnique({
        where: { organizationId: user.organizationId }
      });

      if (subscription) {
        const daysUntilDue = Math.ceil((new Date(subscription.nextBillingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return {
          ...user,
          subscriptionStatus: subscription.status,
          daysUntilDue,
          amountPending: subscription.amountPending,
          paymentStatus: subscription.paymentStatus
        };
      }
    }

    return {
      ...user,
      subscriptionStatus: 'ACTIVE',
      daysUntilDue: 30,
      amountPending: 0,
      paymentStatus: 'PAID'
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('billing-history')
  async getTenantBillingHistory(@Request() req) {
    const user = req.user;
    if (!user.organizationId) {
      return [];
    }
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: user.organizationId }
    });
    if (!subscription) {
      return [];
    }
    return this.prisma.subscriptionPayment.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { paymentDate: 'desc' }
    });
  }
}
