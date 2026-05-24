import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { OwnersService } from './owners.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Roles('SUPER_ADMIN', 'ADMIN', 'HR', 'SALES_MANAGER', 'AGENT')
  @Post()
  create(@Request() req, @Body() data: any) {
    return this.ownersService.create(req.user.organizationId, req.user.id, data);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'HR', 'SALES_MANAGER', 'AGENT', 'VIEWER')
  @Get()
  findAll(@Request() req) {
    return this.ownersService.findAll(req.user.organizationId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'HR', 'SALES_MANAGER', 'AGENT', 'VIEWER')
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.ownersService.findOne(id, req.user.organizationId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'HR', 'SALES_MANAGER', 'AGENT')
  @Patch(':id')
  update(@Param('id') id: string, @Request() req, @Body() data: any) {
    return this.ownersService.update(id, req.user.organizationId, data);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.ownersService.remove(id, req.user.organizationId);
  }

  // Document controls
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR', 'SALES_MANAGER', 'AGENT')
  @Post(':id/documents')
  uploadDocument(@Param('id') id: string, @Body() body: any) {
    return this.ownersService.uploadDocument(id, body);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'HR', 'SALES_MANAGER', 'AGENT')
  @Delete(':id/documents/:docId')
  deleteDocument(@Param('id') id: string, @Param('docId') docId: string) {
    return this.ownersService.deleteDocument(docId);
  }

  // Communication logs
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR', 'SALES_MANAGER', 'AGENT')
  @Post(':id/communications')
  addCommunication(@Param('id') id: string, @Body() body: any) {
    return this.ownersService.addCommunication(id, body);
  }
}
