import { 
  Controller, 
  Get, 
  Put, 
  Body, 
  Request, 
  UseGuards, 
  ForbiddenException 
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  async getMyOrganization(@Request() req) {
    const orgId = req.user.organizationId;
    if (!orgId) {
      throw new ForbiddenException('You do not belong to any organization.');
    }
    return this.organizationService.getOrganization(orgId);
  }

  @Put()
  async updateMyOrganization(@Request() req, @Body() body: any) {
    const user = req.user;
    const orgId = user.organizationId;
    if (!orgId) {
      throw new ForbiddenException('You do not belong to any organization.');
    }
    
    const hasAdminAccess = user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN || user.isSystemAdmin;
    if (!hasAdminAccess) {
      throw new ForbiddenException('Access denied: Admin role permissions required.');
    }

    return this.organizationService.updateOrganization(orgId, body);
  }
}
