import { Controller, Get, Post, Body, Param, UseGuards, Request, Header } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  // -----------------------------------------------------------------------------
  // Public Routes (No Guards)
  // -----------------------------------------------------------------------------

  @Get('portals/:orgId/xml-feed')
  @Header('Content-Type', 'application/xml')
  async getXmlFeed(@Param('orgId') orgId: string) {
    // Allows public aggregation portals to sync active property lists
    return this.integrationsService.getPortalsXmlFeed(orgId);
  }

  @Post('vapi/webhook')
  async handleVapiWebhook(@Body() payload: any) {
    // Real-time webhook connection from vapi.ai call completions
    return this.integrationsService.handleVapiWebhook(payload);
  }

  // -----------------------------------------------------------------------------
  // Authenticated & Restricted Configuration Routes
  // -----------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('configs')
  async getConfigs(@Request() req) {
    return this.integrationsService.getConfigs(req.user.organizationId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('configs')
  async saveConfig(@Body() body: any, @Request() req) {
    const { type, isEnabled, credentials } = body;
    return this.integrationsService.saveConfig(req.user.organizationId, type, isEnabled, credentials);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Get('templates')
  async getTemplates(@Request() req) {
    return this.integrationsService.getTemplates(req.user.organizationId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('templates')
  async createTemplate(@Body() body: any, @Request() req) {
    return this.integrationsService.createTemplate(req.user.organizationId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('logs')
  async getLogs(@Request() req) {
    return this.integrationsService.getLogs(req.user.organizationId);
  }

  // -----------------------------------------------------------------------------
  // Sandbox & Simulation Dispatch Routes
  // -----------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Post('simulate/email')
  async simulateEmail(@Body() body: any, @Request() req) {
    const { leadId, templateId, customSubject, customBody } = body;
    return this.integrationsService.simulateEmail(req.user.organizationId, leadId, templateId, customSubject, customBody);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Post('simulate/whatsapp')
  async simulateWhatsApp(@Body() body: any, @Request() req) {
    const { leadId, text, mediaUrl } = body;
    return this.integrationsService.simulateWhatsApp(req.user.organizationId, leadId, text, mediaUrl);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Post('simulate/sms')
  async simulateSMS(@Body() body: any, @Request() req) {
    const { leadId, text } = body;
    return this.integrationsService.simulateSMS(req.user.organizationId, leadId, text);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Post('simulate/vapi-call')
  async triggerVapiCall(@Body() body: any, @Request() req) {
    const { leadId } = body;
    return this.integrationsService.triggerVapiCall(req.user.organizationId, leadId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('portals/simulate-lead')
  async simulatePortalLead(@Body() body: any, @Request() req) {
    const { portal, leadData } = body;
    return this.integrationsService.simulateIncomingPortalLead(req.user.organizationId, portal, leadData);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('simulate/drive-sync')
  async simulateDriveSync(@Body() body: any, @Request() req) {
    const { documentId } = body;
    return this.integrationsService.simulateDriveSync(req.user.organizationId, documentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Post('simulate/maps-geocoding')
  async simulateMapsGeocoding(@Body() body: any, @Request() req) {
    const { propertyId } = body;
    return this.integrationsService.simulateMapsGeocoding(req.user.organizationId, propertyId);
  }
}
