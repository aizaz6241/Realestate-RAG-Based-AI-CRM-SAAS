import { Controller, Get, Post, Body, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  // Drivers Management
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR')
  @Post('drivers')
  createDriver(@Body() body: any) {
    return this.logisticsService.createDriver(body);
  }

  @Get('drivers')
  findAllDrivers(@Request() req) {
    return this.logisticsService.findAllDrivers(req.user.organizationId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'HR')
  @Patch('drivers/:id/status')
  updateDriverStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.logisticsService.updateDriverStatus(id, status);
  }

  // Vehicles roster
  @Roles('SUPER_ADMIN', 'ADMIN', 'LOGISTICS')
  @Post('vehicles')
  createVehicle(@Request() req, @Body() body: any) {
    return this.logisticsService.createVehicle(req.user.organizationId, body);
  }

  @Get('vehicles')
  findAllVehicles(@Request() req) {
    return this.logisticsService.findAllVehicles(req.user.organizationId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'LOGISTICS')
  @Post('vehicles/:id/maintenance')
  logVehicleMaintenance(@Param('id') id: string, @Body() body: any) {
    return this.logisticsService.logVehicleMaintenance(id, body);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'LOGISTICS')
  @Patch('maintenance/:id')
  updateMaintenanceStatus(@Param('id') id: string, @Body() body: any) {
    return this.logisticsService.updateMaintenanceStatus(id, body);
  }

  // Transit schedules
  @Roles('SUPER_ADMIN', 'ADMIN', 'LOGISTICS', 'AGENT')
  @Post('schedules')
  createSchedule(@Body() body: any) {
    return this.logisticsService.createSchedule(body);
  }

  @Get('schedules')
  findAllSchedules(@Request() req) {
    return this.logisticsService.findAllSchedules(req.user.organizationId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'LOGISTICS', 'AGENT')
  @Patch('schedules/:id/status')
  updateScheduleStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.logisticsService.updateScheduleStatus(id, status);
  }

  // Key tracking vault
  @Roles('SUPER_ADMIN', 'ADMIN', 'LOGISTICS')
  @Post('keys')
  createKeyTracker(@Body() body: any) {
    return this.logisticsService.createKeyTracker(body);
  }

  @Get('keys')
  findAllKeys(@Request() req) {
    return this.logisticsService.findAllKeys(req.user.organizationId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'LOGISTICS', 'AGENT')
  @Post('keys/:id/checkout')
  checkoutKey(@Param('id') id: string, @Request() req, @Body('notes') notes: string) {
    return this.logisticsService.checkoutKey(id, req.user.id, notes);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'LOGISTICS', 'AGENT')
  @Patch('checkout/:checkoutId/return')
  returnKey(@Param('checkoutId') checkoutId: string, @Body('notes') notes: string) {
    return this.logisticsService.returnKey(checkoutId, notes);
  }
}
