import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredRoles) {
      return true; // If no roles are required, allow access
    }
    
    const { user } = context.switchToHttp().getRequest();
    
    if (!user || !user.role) {
      throw new ForbiddenException('User role not found');
    }

    // Check if the user's role matches any of the required roles
    // We can also add SUPER_ADMIN override here
    const hasRole = requiredRoles.includes(user.role) || user.role === 'SUPER_ADMIN';
    
    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }
    
    return true;
  }
}
