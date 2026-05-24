import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Post()
  create(@Body() data: any, @Request() req) {
    // Basic assignment logic - round-robin will pick an agent if assignedToId is not provided
    return this.leadsService.create(data, req.user.organizationId, data.assignedToId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Get()
  findAll(@Request() req) {
    return this.leadsService.findAll(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.leadsService.findOne(id, req.user.organizationId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.leadsService.update(id, req.user.organizationId, data);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Post(':id/activities')
  addActivity(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.leadsService.addActivity(id, req.user.organizationId, data);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.leadsService.remove(id, req.user.organizationId);
  }
}
