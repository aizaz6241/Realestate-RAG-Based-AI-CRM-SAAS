import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Body, 
  Param, 
  UseGuards 
} from '@nestjs/common';
import { SaasAdminService } from './saas-admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SaasAdminGuard } from '../auth/guards/saas-admin.guard';

@UseGuards(JwtAuthGuard, SaasAdminGuard)
@Controller('saas-admin')
export class SaasAdminController {
  constructor(private readonly saasAdminService: SaasAdminService) {}

  @Get('stats')
  async getStats() {
    return this.saasAdminService.getSystemStats();
  }

  @Get('companies')
  async getCompanies() {
    return this.saasAdminService.getOrganizations();
  }

  @Post('companies')
  async createCompany(@Body() body: any) {
    return this.saasAdminService.createOrganization(body);
  }

  @Put('companies/:id')
  async updateSubscription(@Param('id') orgId: string, @Body() body: any) {
    return this.saasAdminService.updateSubscription(orgId, body);
  }

  @Post('companies/:id/toggle-block')
  async toggleBlockCompany(@Param('id') orgId: string) {
    return this.saasAdminService.toggleBlockOrganization(orgId);
  }

  @Post('companies/:id/reset-admin-password')
  async resetAdminPassword(@Param('id') orgId: string, @Body() body: any) {
    return this.saasAdminService.resetAdminPassword(orgId, body);
  }

  @Post('companies/:id/payments')
  async recordPayment(@Param('id') orgId: string, @Body() body: any) {
    return this.saasAdminService.recordPayment(orgId, body);
  }

  @Get('companies/:id/usage')
  async getUsageDetails(@Param('id') orgId: string) {
    return this.saasAdminService.getAiUsageDetails(orgId);
  }

  @Get('companies/:id/billing')
  async getBillingHistory(@Param('id') orgId: string) {
    return this.saasAdminService.getBillingHistory(orgId);
  }
}
