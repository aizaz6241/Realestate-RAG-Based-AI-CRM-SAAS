import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Post()
  create(@Body() data: any, @Request() req) {
    return this.propertiesService.create(data, req.user.organizationId);
  }

  @Get()
  findAll(@Request() req) {
    return this.propertiesService.findAll(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.propertiesService.findOne(id, req.user.organizationId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.propertiesService.update(id, req.user.organizationId, data);
  }

  @Get(':id/matches')
  findMatches(@Param('id') id: string, @Request() req) {
    return this.propertiesService.findMatches(id, req.user.organizationId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.propertiesService.remove(id, req.user.organizationId);
  }
}
