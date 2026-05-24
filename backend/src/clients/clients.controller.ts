import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Post()
  create(@Body() data: any, @Request() req) {
    return this.clientsService.create(data, req.user.organizationId, req.user.id);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Get()
  findAll(@Request() req) {
    return this.clientsService.findAll(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.clientsService.findOne(id, req.user.organizationId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.clientsService.update(id, req.user.organizationId, data);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.clientsService.remove(id, req.user.organizationId);
  }

  // 1. Add interested property listing
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Post(':id/interests')
  addInterest(@Param('id') id: string, @Body() body: any) {
    return this.clientsService.addInterest(id, body.propertyId);
  }

  // 2. Remove property of interest
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Delete(':id/interests/:interestId')
  removeInterest(@Param('interestId') interestId: string) {
    return this.clientsService.removeInterest(interestId);
  }

  // 3. Schedule property viewing
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Post(':id/viewings')
  scheduleViewing(@Param('id') id: string, @Body() body: any) {
    return this.clientsService.scheduleViewing(id, body);
  }

  // 4. Update viewing status or feedback
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Patch(':id/viewings/:viewingId')
  updateViewing(@Param('viewingId') viewingId: string, @Body() body: any) {
    return this.clientsService.updateViewing(viewingId, body);
  }

  // 5. Add call/email timeline record
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @Post(':id/communications')
  addCommunication(@Param('id') id: string, @Body() body: any) {
    return this.clientsService.addCommunication(id, body);
  }
}

