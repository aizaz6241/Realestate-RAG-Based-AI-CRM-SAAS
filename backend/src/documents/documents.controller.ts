import { Controller, Get, Post, Body, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  create(@Body() data: any, @Request() req) {
    return this.documentsService.create(req.user.organizationId, req.user.id, data);
  }

  @Get()
  findAll(
    @Request() req,
    @Query('category') category?: string,
    @Query('tag') tag?: string,
  ) {
    return this.documentsService.findAll(req.user.organizationId, req.user.id, req.user.role, category, tag);
  }

  @Get('reminders')
  getExpiryReminders(@Request() req) {
    return this.documentsService.getExpiryReminders(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.documentsService.findOne(id, req.user.organizationId, req.user.id, req.user.role);
  }

  @Post(':id/versions')
  addVersion(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.documentsService.addVersion(id, req.user.organizationId, req.user.id, req.user.role, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.documentsService.remove(id, req.user.organizationId, req.user.id, req.user.role);
  }
}
