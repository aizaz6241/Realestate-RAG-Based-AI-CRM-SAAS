import { Injectable, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private prisma: PrismaService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const passportActive = await super.canActivate(context);
    if (!passportActive) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;

    // SaaS system administrator bypasses subscription checks
    if (user.isSystemAdmin) {
      return true;
    }

    // Check organization suspension status
    if (user.organizationId) {
      const subscription = await this.prisma.subscription.findUnique({
        where: { organizationId: user.organizationId }
      });

      if (subscription && subscription.status === 'SUSPENDED') {
        console.warn(`❌ [JwtAuthGuard] Suspended access attempt from organization: ${user.organizationId}`);
        throw new UnauthorizedException('Your company subscription is suspended. Please contact the system administrator to resolve outstanding dues.');
      }
    }

    return true;
  }
}


