import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class SaasAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      throw new ForbiddenException('User session not found');
    }
    
    if (!user.isSystemAdmin) {
      throw new ForbiddenException('Access denied: SaaS system administrator clearance required');
    }
    
    return true;
  }
}
