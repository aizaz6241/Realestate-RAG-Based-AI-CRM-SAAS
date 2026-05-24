import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  findAll(@Request() req) {
    return this.employeesService.findAll(req.user.organizationId, req.user.role);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() data: any, @Request() req) {
    return this.employeesService.create(req.user.organizationId, data);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    // For now, any logged-in user can view an employee profile within the same org
    return this.employeesService.findOne(id, req.user.organizationId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id/profile')
  updateProfile(@Param('id') id: string, @Body() data: any, @Request() req) {
    return this.employeesService.updateProfile(id, req.user.organizationId, data);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.employeesService.remove(id, req.user.organizationId);
  }

  // 1. Attendance Check-in
  @Post(':id/attendance/check-in')
  checkIn(@Param('id') id: string, @Body() body: any) {
    return this.employeesService.checkIn(id, body.dateStr);
  }

  // 2. Attendance Check-out
  @Post(':id/attendance/check-out')
  checkOut(@Param('id') id: string, @Body() body: any) {
    return this.employeesService.checkOut(id, body.dateStr, body.summary);
  }

  // 3. Request Leave
  @Post(':id/leaves')
  requestLeave(@Param('id') id: string, @Body() body: any) {
    return this.employeesService.requestLeave(id, body);
  }

  // 4. Approve/Reject Leave (restricted to ADMIN/HR)
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR')
  @Patch(':id/leaves/:leaveId')
  updateLeaveStatus(@Param('id') id: string, @Param('leaveId') leaveId: string, @Body() body: any) {
    return this.employeesService.updateLeaveStatus(id, leaveId, body.status);
  }

  // 5. Upload Document
  @Post(':id/documents')
  uploadDocument(@Param('id') id: string, @Body() body: any) {
    return this.employeesService.uploadDocument(id, body);
  }

  // 6. Delete Document
  @Delete(':id/documents/:docId')
  deleteDocument(@Param('id') id: string, @Param('docId') docId: string) {
    return this.employeesService.deleteDocument(id, docId);
  }

  // 7. Add Activity Log
  @Post(':id/activities')
  addActivity(@Param('id') id: string, @Body() body: any) {
    return this.employeesService.addActivity(id, body);
  }

  // 8. Add Performance Review (restricted to ADMIN/HR/SALES_MANAGER)
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR', 'SALES_MANAGER')
  @Post(':id/performance')
  addPerformanceReview(@Param('id') id: string, @Request() req, @Body() body: any) {
    return this.employeesService.addPerformanceReview(id, req.user.id, body);
  }

  // 9. Assign Tasks to Employee (restricted to ADMIN/HR/SALES_MANAGER)
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR', 'SALES_MANAGER')
  @Post(':id/tasks')
  assignTask(@Param('id') id: string, @Request() req, @Body() body: any) {
    return this.employeesService.assignTask(id, req.user.organizationId, body);
  }

  // 10. Generate Payroll Payslip (restricted to ADMIN/HR)
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR')
  @Post(':id/payrolls')
  addPayroll(@Param('id') id: string, @Body() body: any) {
    return this.employeesService.addPayroll(id, body);
  }

  // 11. Update Payroll Status or Values (restricted to ADMIN/HR)
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR')
  @Patch(':id/payrolls/:payrollId')
  updatePayroll(@Param('id') id: string, @Param('payrollId') payrollId: string, @Body() body: any) {
    return this.employeesService.updatePayroll(id, payrollId, body);
  }

  // 12. Delete Payroll entry (restricted to ADMIN/HR)
  @Roles('SUPER_ADMIN', 'ADMIN', 'HR')
  @Delete(':id/payrolls/:payrollId')
  deletePayroll(@Param('id') id: string, @Param('payrollId') payrollId: string) {
    return this.employeesService.deletePayroll(id, payrollId);
  }
}

